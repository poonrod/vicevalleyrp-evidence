import fs from "fs";
import { logFilePath, ensureDirs } from "./paths";

const maxBytes = 2_000_000;

function trimLogIfNeeded(): void {
  try {
    const p = logFilePath();
    if (!fs.existsSync(p)) return;
    const st = fs.statSync(p);
    if (st.size <= maxBytes) return;
    const buf = fs.readFileSync(p);
    fs.writeFileSync(p, buf.subarray(buf.length - maxBytes));
  } catch {
    /* ignore */
  }
}

export function logLine(level: string, msg: string, meta?: Record<string, unknown>): void {
  try {
    ensureDirs();
    trimLogIfNeeded();
    const line =
      JSON.stringify({
        t: new Date().toISOString(),
        level,
        msg,
        ...(meta && !containsSecret(meta) ? { meta } : {}),
      }) + "\n";
    fs.appendFileSync(logFilePath(), line, "utf8");
  } catch {
    /* never throw */
  }
  if (level === "error") console.error(`[Bodycam] ${msg}`, meta ?? "");
  else if (level === "warn") console.warn(`[Bodycam] ${msg}`, meta ?? "");
  else console.log(`[Bodycam] ${msg}`, meta ?? "");
}

function containsSecret(m: Record<string, unknown>): boolean {
  const s = JSON.stringify(m).toLowerCase();
  return s.includes("token") || s.includes("secret") || s.includes("authorization");
}
