import { spawnSync } from "child_process";
import { defaultFfmpegExecutable } from "./ffmpegRecorder";
import { logLine } from "./logger";

export interface AudioDeviceOption {
  /** Empty string = FFmpeg `default` device. */
  id: string;
  label: string;
}

export interface WasapiDeviceLists {
  /** Playback / loopback sources (what you hear). */
  outputs: AudioDeviceOption[];
  /** Capture endpoints (microphones). */
  inputs: AudioDeviceOption[];
}

const defaultOutputs: AudioDeviceOption[] = [
  { id: "", label: "Default — Windows primary output (recommended)" },
];
const defaultInputs: AudioDeviceOption[] = [
  { id: "", label: "Default — Windows primary microphone (recommended)" },
];

/**
 * Parse `ffmpeg -list_devices true -f wasapi -i dummy` stderr.
 * FFmpeg prints lines like: ... "Speakers (Realtek)" (playback) / "Mic" (capture)
 */
export function parseWasapiDeviceList(stderr: string): WasapiDeviceLists {
  const outputs: AudioDeviceOption[] = [...defaultOutputs];
  const inputs: AudioDeviceOption[] = [...defaultInputs];
  const seenOut = new Set<string>([""]);
  const seenIn = new Set<string>([""]);

  const re = /"([^"]+)"\s*\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr)) !== null) {
    const name = m[1].trim();
    const tag = m[2].toLowerCase();
    if (!name) continue;

    if (tag.includes("capture")) {
      if (!seenIn.has(name)) {
        seenIn.add(name);
        inputs.push({ id: name, label: name });
      }
    }
    if (tag.includes("playback") || tag.includes("loopback")) {
      if (!seenOut.has(name)) {
        seenOut.add(name);
        outputs.push({
          id: name,
          label: `${name} — desktop / game audio`,
        });
      }
    }
  }

  return { outputs, inputs };
}

export function listWasapiDevices(): WasapiDeviceLists {
  const ffmpeg = defaultFfmpegExecutable();
  try {
    const r = spawnSync(
      ffmpeg,
      ["-hide_banner", "-list_devices", "true", "-f", "wasapi", "-i", "dummy"],
      { encoding: "utf-8", maxBuffer: 8 * 1024 * 1024, windowsHide: true }
    );
    const text = `${r.stderr || ""}\n${r.stdout || ""}`;
    if (r.error) {
      logLine("warn", "FFmpeg list devices spawn error", { err: String(r.error) });
      return { outputs: defaultOutputs, inputs: defaultInputs };
    }
    return parseWasapiDeviceList(text);
  } catch (e) {
    logLine("warn", "listWasapiDevices failed", { err: String(e) });
    return { outputs: defaultOutputs, inputs: defaultInputs };
  }
}
