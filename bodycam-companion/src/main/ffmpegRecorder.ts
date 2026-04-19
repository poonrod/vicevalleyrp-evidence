import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import fs from "fs";
import path from "path";
import { logLine } from "./logger";

export interface RecorderOptions {
  outputPath: string;
  enableVideo: boolean;
  /** WASAPI loopback source; empty uses `default`. */
  wasapiOutputDevice: string;
  /** WASAPI microphone; empty uses `default`. */
  wasapiInputDevice: string;
}

function resolveFfmpegPath(): string {
  const env = process.env.FFMPEG_PATH?.trim();
  if (env && fs.existsSync(env)) return env;
  // Packaged app (electron-builder `extraResources` → next to the exe’s resources folder)
  if (process.resourcesPath) {
    const packaged = path.join(process.resourcesPath, "ffmpeg.exe");
    if (fs.existsSync(packaged)) return packaged;
  }
  const bundled = path.join(__dirname, "..", "..", "resources", "ffmpeg.exe");
  if (fs.existsSync(bundled)) return bundled;
  return "ffmpeg";
}

export function defaultFfmpegExecutable(): string {
  return resolveFfmpegPath();
}

/**
 * Mixed capture: WASAPI loopback (default render device) + WASAPI default capture (mic).
 * Optional: gdigrab desktop + libx264.
 */
export function buildFfmpegArgs(opts: RecorderOptions): string[] {
  const { outputPath, enableVideo, wasapiOutputDevice, wasapiInputDevice } = opts;
  const loopDev = wasapiOutputDevice.trim() || "default";
  const micDev = wasapiInputDevice.trim() || "default";
  const args: string[] = ["-hide_banner", "-loglevel", "info", "-y"];

  if (enableVideo) {
    args.push("-f", "gdigrab", "-framerate", "30", "-i", "desktop");
  }

  // Loopback (desktop / game audio) then microphone.
  args.push("-f", "wasapi", "-loopback", "1", "-i", loopDev);
  args.push("-f", "wasapi", "-i", micDev);

  if (enableVideo) {
    args.push(
      "-filter_complex",
      "[1:a][2:a]amix=inputs=2:duration=longest[aout]",
      "-map",
      "0:v",
      "-map",
      "[aout]",
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
      outputPath
    );
  } else {
    args.push(
      "-filter_complex",
      "[0:a][1:a]amix=inputs=2:duration=longest[aout]",
      "-map",
      "[aout]",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-f",
      "mp4",
      outputPath
    );
  }

  return args;
}

export class FfmpegRecorder {
  private proc: ChildProcessWithoutNullStreams | null = null;

  constructor(private readonly ffmpegPath: string) {}

  start(opts: RecorderOptions): void {
    if (this.proc) {
      throw new Error("FFmpeg already running");
    }
    const args = buildFfmpegArgs(opts);
    logLine("info", "Spawning FFmpeg", { cmd: this.ffmpegPath, args: args.slice(0, 24).join(" ") + " ..." });

    this.proc = spawn(this.ffmpegPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stderrTail = "";
    this.proc.stderr?.on("data", (chunk: Buffer) => {
      const s = chunk.toString();
      stderrTail = (stderrTail + s).slice(-8000);
    });

    this.proc.on("error", (err) => {
      logLine("error", "FFmpeg process error", { err: String(err) });
    });

    this.proc.on("close", (code, signal) => {
      logLine("info", "FFmpeg exited", { code, signal, stderrTail: stderrTail.slice(-2000) });
      this.proc = null;
    });
  }

  async stopGracefully(timeoutMs = 12000): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
    const p = this.proc;
    if (!p || !p.stdin) {
      return { code: null, signal: null };
    }

    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, timeoutMs);
      p.once("close", () => {
        clearTimeout(t);
        resolve();
      });
      try {
        p.stdin.write("q\n");
      } catch (e) {
        logLine("warn", "FFmpeg stdin write failed", { err: String(e) });
        try {
          p.kill("SIGTERM");
        } catch {
          /* ignore */
        }
      }
    });

    const code = p.exitCode;
    const signal = p.signalCode;
    this.proc = null;
    return { code, signal };
  }

  forceKill(): void {
    if (!this.proc) return;
    try {
      this.proc.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    this.proc = null;
  }

  isRunning(): boolean {
    return this.proc !== null;
  }
}
