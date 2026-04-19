import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { FfmpegRecorder, defaultFfmpegExecutable } from "./ffmpegRecorder";
import { tempRecordingsDir, ensureDirs } from "./paths";
import { logLine } from "./logger";
import type { StartRecordingPayload } from "./schema";
import type { AppConfig } from "./config";
import {
  requestUploadUrl,
  putFileToPresignedUrl,
  completeEvidence,
  sha256File,
} from "./evidenceClient";
import { enqueuePending } from "./uploadQueue";
import { muxNuiWebmWithCompanionAudio } from "./muxNuiWebm";

export interface ActiveSession {
  id: string;
  payload: StartRecordingPayload;
  startedAtMs: number;
  timestampUtc: string;
  outputPath: string;
  recorder: FfmpegRecorder;
  /** Optional WebM from FiveM NUI (video-only) to mux with `outputPath` audio before upload. */
  nuiWebmPath?: string;
}

function toIsoUtc(ms: number): string {
  return new Date(ms).toISOString();
}

function parseStartTimestamp(ts: StartRecordingPayload["timestamp"], fallbackMs: number): number {
  if (ts == null) return fallbackMs;
  if (typeof ts === "number" && !Number.isNaN(ts)) {
    return ts < 2e12 ? ts * 1000 : ts;
  }
  const d = Date.parse(String(ts));
  return Number.isNaN(d) ? fallbackMs : d;
}

export interface RecordingHooks {
  afterStart?: () => void;
  afterStop?: () => void;
}

export class RecordingSessionManager {
  private session: ActiveSession | null = null;
  private readonly recorderFactory: () => FfmpegRecorder;

  constructor(
    private readonly hooks?: RecordingHooks,
    recorderFactory?: () => FfmpegRecorder
  ) {
    this.recorderFactory = recorderFactory ?? (() => new FfmpegRecorder(defaultFfmpegExecutable()));
  }

  isRecording(): boolean {
    return this.session !== null;
  }

  getSession(): ActiveSession | null {
    return this.session;
  }

  /**
   * Attach WebM video from FiveM NUI while the companion audio session is still recording.
   * Call before `POST /stop-recording`.
   */
  attachNuiWebmVideo(buf: Buffer): { ok: true } | { ok: false; error: string } {
    const s = this.session;
    if (!s) {
      return { ok: false, error: "no_active_session" };
    }
    if (!buf?.length) {
      return { ok: false, error: "empty_body" };
    }
    const max = 450 * 1024 * 1024;
    if (buf.length > max) {
      return { ok: false, error: "video_too_large" };
    }
    const webmPath = path.join(tempRecordingsDir(), `${s.id}-nui.webm`);
    try {
      fs.writeFileSync(webmPath, buf);
      s.nuiWebmPath = webmPath;
      logLine("info", "Attached NUI WebM for mux", { bytes: buf.length });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message || e) };
    }
  }

  start(
    payload: StartRecordingPayload,
    opts: {
      enableVideo: boolean;
      wasapiOutputDevice: string;
      wasapiInputDevice: string;
    }
  ): ActiveSession {
    if (this.session) {
      throw new Error("already_recording");
    }
    ensureDirs();
    const id = randomUUID();
    const fileName = `bodycam-companion-${id}.mp4`;
    const outputPath = path.join(tempRecordingsDir(), fileName);
    const wallMs = Date.now();
    const startedAtMs = parseStartTimestamp(payload.timestamp, wallMs);
    const timestampUtc = toIsoUtc(startedAtMs);

    const recorder = this.recorderFactory();
    recorder.start({
      outputPath,
      enableVideo: opts.enableVideo,
      wasapiOutputDevice: opts.wasapiOutputDevice,
      wasapiInputDevice: opts.wasapiInputDevice,
    });

    this.session = {
      id,
      payload,
      startedAtMs: wallMs,
      timestampUtc,
      outputPath,
      recorder,
    };
    logLine("info", "Recording started", { sessionId: id, fileName });
    try {
      this.hooks?.afterStart?.();
    } catch {
      /* ignore */
    }
    return this.session;
  }

  async stopAndUpload(cfg: AppConfig): Promise<{ ok: true } | { ok: false; error: string }> {
    const s = this.session;
    if (!s) {
      return { ok: false, error: "no_active_session" };
    }
    this.session = null;

    try {
      await s.recorder.stopGracefully(15000);
      if (s.recorder.isRunning()) {
        s.recorder.forceKill();
      }

      if (!fs.existsSync(s.outputPath)) {
        const err = "output_missing";
        logLine("error", "Recording output missing", { path: s.outputPath });
        return { ok: false, error: err };
      }

      const st = fs.statSync(s.outputPath);
      if (st.size < 64) {
        logLine("error", "Recording output too small / corrupt", { size: st.size });
        try {
          fs.unlinkSync(s.outputPath);
        } catch {
          /* ignore */
        }
        return { ok: false, error: "output_too_small" };
      }

      const ffmpegBin = defaultFfmpegExecutable();
      let uploadPath = s.outputPath;
      const cleanupPaths: string[] = [];

      if (s.nuiWebmPath && fs.existsSync(s.nuiWebmPath)) {
        const mergedPath = path.join(tempRecordingsDir(), `${s.id}-merged.mp4`);
        try {
          await muxNuiWebmWithCompanionAudio(ffmpegBin, s.nuiWebmPath, s.outputPath, mergedPath);
          cleanupPaths.push(s.nuiWebmPath, s.outputPath);
          uploadPath = mergedPath;
        } catch (e) {
          const msg = String((e as Error)?.message || e);
          logLine("error", "WebM + companion audio mux failed", { err: msg });
          for (const p of [s.nuiWebmPath, mergedPath]) {
            try {
              if (p && fs.existsSync(p)) fs.unlinkSync(p);
            } catch {
              /* ignore */
            }
          }
          return { ok: false, error: `mux_failed:${msg}` };
        }
      }

      const upStat = fs.statSync(uploadPath);
      if (upStat.size < 64) {
        return { ok: false, error: "output_too_small" };
      }

      const durationSeconds = Math.max(0, (Date.now() - s.startedAtMs) / 1000);
      const mimeType = "video/mp4";
      const captureType = "bodycam_companion_capture";

      const uploadUrlPayload: Record<string, unknown> = {
        officerDiscordId: s.payload.officerDiscordId,
        officerName: s.payload.officerName,
        officerBadgeNumber: s.payload.officerBadgeNumber,
        fileName: path.basename(uploadPath),
        mimeType,
        fileSize: upStat.size,
        captureType,
        caseNumber: s.payload.caseNumber ?? null,
        incidentId: s.payload.incidentId ?? undefined,
      };

      const completeBase = {
        officerDiscordId: s.payload.officerDiscordId,
        officerName: s.payload.officerName,
        officerBadgeNumber: s.payload.officerBadgeNumber,
        caseNumber: s.payload.caseNumber ?? null,
        incidentId: s.payload.incidentId ?? undefined,
        type: "video" as const,
        captureType,
        fileName: path.basename(uploadPath),
        mimeType,
        fileSize: upStat.size,
        timestampUtc: s.timestampUtc,
        durationSeconds,
      };

      if (!cfg.apiBase || !cfg.apiToken) {
        const err = "missing_api_config";
        logLine("error", err);
        enqueuePending({
          filePath: uploadPath,
          uploadUrlPayload,
          completePayload: {
            ...completeBase,
            storageKey: "",
            sha256: undefined,
            activationSource: "manual_keybind",
          },
        });
        return { ok: false, error: err };
      }

      try {
        const presign = await requestUploadUrl(cfg.apiBase, cfg.apiToken, uploadUrlPayload);
        await putFileToPresignedUrl(presign.url, uploadPath, mimeType);
        const sha = await sha256File(uploadPath);
        await completeEvidence(cfg.apiBase, cfg.apiToken, {
          ...completeBase,
          storageKey: presign.storageKey,
          evidenceId: presign.evidenceId,
          sha256: sha,
          activationSource: "manual_keybind",
        });
        try {
          fs.unlinkSync(uploadPath);
        } catch {
          /* ignore */
        }
        for (const p of cleanupPaths) {
          try {
            if (p && fs.existsSync(p)) fs.unlinkSync(p);
          } catch {
            /* ignore */
          }
        }
        logLine("info", "Recording uploaded", { sessionId: s.id });
        return { ok: true };
      } catch (e) {
        const msg = String((e as Error)?.message || e);
        logLine("error", "Upload pipeline failed, enqueueing", { err: msg });
        let sha: string | undefined;
        try {
          sha = await sha256File(uploadPath);
        } catch {
          /* optional hash */
        }
        enqueuePending({
          filePath: uploadPath,
          uploadUrlPayload: { ...uploadUrlPayload, fileSize: upStat.size },
          completePayload: {
            ...completeBase,
            storageKey: "",
            sha256: sha,
            activationSource: "manual_keybind",
          },
        });
        return { ok: false, error: msg };
      }
    } finally {
      try {
        this.hooks?.afterStop?.();
      } catch {
        /* ignore */
      }
    }
  }
}
