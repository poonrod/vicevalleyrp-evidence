import http from "http";
import { URL } from "url";
import { logLine } from "./logger";
import { startRecordingBodySchema, stopRecordingBodySchema } from "./schema";
import type { StartRecordingPayload } from "./schema";
import type { RecordingSessionManager } from "./recordingSession";
import type { AppConfig } from "./config";
import { isFivemRunning } from "./fivemDetector";

function cors(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res: http.ServerResponse, code: number, body: unknown): void {
  cors(res);
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const ch of req) {
    chunks.push(ch as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error("invalid_json");
  }
}

export interface HttpServerContext {
  getConfig: () => AppConfig;
  sessionManager: RecordingSessionManager;
  getFivemRunning: () => boolean;
}

export function createLocalHttpServer(
  ctx: HttpServerContext,
  port: number
): http.Server {
  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end();
      return;
    }
    let pathname: string;
    try {
      pathname = new URL(req.url, `http://127.0.0.1`).pathname;
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }

    if (req.method === "OPTIONS") {
      cors(res);
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && pathname === "/health") {
      json(res, 200, {
        ok: true,
        fivem: ctx.getFivemRunning(),
        recording: ctx.sessionManager.isRecording(),
      });
      return;
    }

    if (req.method !== "POST") {
      json(res, 405, { error: "method_not_allowed" });
      return;
    }

    try {
      if (pathname === "/start-recording") {
        const cfg = ctx.getConfig();
        if (cfg.recordingOptOut) {
          json(res, 403, { error: "recording_disabled_by_user" });
          return;
        }
        if (!cfg.consentAccepted) {
          json(res, 403, { error: "consent_required" });
          return;
        }
        const fivem = await isFivemRunning();
        if (!fivem) {
          json(res, 403, { error: "fivem_not_running" });
          return;
        }
        if (ctx.sessionManager.isRecording()) {
          json(res, 409, { error: "already_recording" });
          return;
        }
        const raw = await readJsonBody(req);
        const parsed = startRecordingBodySchema.safeParse(raw);
        if (!parsed.success) {
          json(res, 400, { error: "invalid_body", details: parsed.error.flatten() });
          return;
        }
        const session = ctx.sessionManager.start(parsed.data, cfg.enableVideo);
        json(res, 200, {
          ok: true,
          sessionId: session.id,
          startedAt: session.startedAtMs,
        });
        return;
      }

      if (pathname === "/stop-recording") {
        if (!ctx.sessionManager.isRecording()) {
          json(res, 400, { error: "not_recording" });
          return;
        }
        const raw = await readJsonBody(req);
        const partial = stopRecordingBodySchema.safeParse(raw);
        if (!partial.success) {
          json(res, 400, { error: "invalid_body", details: partial.error.flatten() });
          return;
        }
        const active = ctx.sessionManager.getSession();
        if (!active) {
          json(res, 400, { error: "not_recording" });
          return;
        }
        const p = partial.data;
        const merged: StartRecordingPayload = {
          officerDiscordId:
            p.officer_discord_id ??
            p.officerDiscordId ??
            active.payload.officerDiscordId,
          officerName: p.officer_name ?? p.officerName ?? active.payload.officerName,
          officerBadgeNumber: p.badge_number ?? p.badgeNumber ?? active.payload.officerBadgeNumber,
          caseNumber: p.case_number ?? p.caseNumber ?? active.payload.caseNumber ?? null,
          timestamp: p.timestamp ?? active.payload.timestamp,
          incidentId: p.incident_id ?? p.incidentId ?? active.payload.incidentId ?? null,
        };
        if (!merged.officerDiscordId) {
          json(res, 400, { error: "officer_discord_id_required" });
          return;
        }
        active.payload = merged;

        const cfg = ctx.getConfig();
        const result = await ctx.sessionManager.stopAndUpload(cfg);
        if (result.ok) {
          json(res, 200, { ok: true });
        } else {
          json(res, 502, { ok: false, error: result.error });
        }
        return;
      }

      json(res, 404, { error: "not_found" });
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      if (msg === "invalid_json") {
        json(res, 400, { error: "invalid_json" });
        return;
      }
      logLine("error", "HTTP handler error", { err: msg });
      json(res, 500, { error: "internal_error" });
    }
  });

  server.on("error", (err) => {
    logLine("error", "HTTP server error", { err: String(err) });
  });

  server.listen(port, "127.0.0.1", () => {
    logLine("info", "Local HTTP listening", { host: "127.0.0.1", port });
  });

  return server;
}
