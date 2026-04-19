import { spawn } from "child_process";
import fs from "fs";
import { logLine } from "./logger";

/**
 * Mux NUI VP8/VP9 WebM (video) with companion WASAPI AAC MP4 (audio) → single H.264+AAC MP4.
 * `-shortest` trims to the shorter stream (approx sync when both cover the same session).
 */
export function muxNuiWebmWithCompanionAudio(
  ffmpegPath: string,
  webmPath: string,
  audioMp4Path: string,
  outMp4: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-hide_banner",
      "-loglevel",
      "warning",
      "-i",
      webmPath,
      "-i",
      audioMp4Path,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      "-shortest",
      outMp4,
    ];
    const p = spawn(ffmpegPath, args, { windowsHide: true });
    let err = "";
    p.stderr?.on("data", (c: Buffer) => {
      err += c.toString();
    });
    p.on("error", (e) => reject(e));
    p.on("close", (code) => {
      try {
        if (
          code === 0 &&
          fs.existsSync(outMp4) &&
          fs.statSync(outMp4).size > 128
        ) {
          resolve();
          return;
        }
      } catch {
        /* fall through */
      }
      logLine("error", "muxNuiWebm failed", { code, tail: err.slice(-1200) });
      reject(new Error(`ffmpeg_mux_exit_${code}`));
    });
  });
}
