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

export interface ActiveSession {
  id: string;
  payload: StartRecordingPayload;
  startedAtMs: number;
  timestampUtc: string;
  outputPath: string;
  recorder: FfmpegRecorder;
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

  start(payload: StartRecordingPayload, enableVideo: boolean): ActiveSession {
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
      enableVideo,
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

      const durationSeconds = Math.max(0, (Date.now() - s.startedAtMs) / 1000);
      const mimeType = "video/mp4";
      const captureType = "bodycam_companion_capture";

      const uploadUrlPayload: Record<string, unknown> = {
        officerDiscordId: s.payload.officerDiscordId,
        officerName: s.payload.officerName,
        officerBadgeNumber: s.payload.officerBadgeNumber,
        fileName: path.basename(s.outputPath),
        mimeType,
        fileSize: st.size,
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
        fileName: path.basename(s.outputPath),
        mimeType,
        fileSize: st.size,
        timestampUtc: s.timestampUtc,
        durationSeconds,
      };

      if (!cfg.apiBase || !cfg.apiToken) {
        const err = "missing_api_config";
        logLine("error", err);
        enqueuePending({
          filePath: s.outputPath,
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
        await putFileToPresignedUrl(presign.url, s.outputPath, mimeType);
        const sha = await sha256File(s.outputPath);
        await completeEvidence(cfg.apiBase, cfg.apiToken, {
          ...completeBase,
          storageKey: presign.storageKey,
          evidenceId: presign.evidenceId,
          sha256: sha,
          activationSource: "manual_keybind",
        });
        fs.unlinkSync(s.outputPath);
        logLine("info", "Recording uploaded", { sessionId: s.id });
        return { ok: true };
      } catch (e) {
        const msg = String((e as Error)?.message || e);
        logLine("error", "Upload pipeline failed, enqueueing", { err: msg });
        let sha: string | undefined;
        try {
          sha = await sha256File(s.outputPath);
        } catch {
          /* optional hash */
        }
        enqueuePending({
          filePath: s.outputPath,
          uploadUrlPayload: { ...uploadUrlPayload, fileSize: st.size },
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
