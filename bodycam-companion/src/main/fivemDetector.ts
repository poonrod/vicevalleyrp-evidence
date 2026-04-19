import { execFile } from "child_process";
import { promisify } from "util";
import { logLine } from "./logger";

const execFileAsync = promisify(execFile);

export function skipFivemCheck(): boolean {
  return process.env.BODYCAM_SKIP_FIVEM_CHECK === "1" || process.env.BODYCAM_SKIP_FIVEM_CHECK === "true";
}

/** True if FiveM.exe appears in the Windows process list. */
export async function isFivemRunning(): Promise<boolean> {
  if (skipFivemCheck()) return true;
  try {
    const { stdout } = await execFileAsync(
      "tasklist",
      ["/FI", "IMAGENAME eq FiveM.exe", "/NH"],
      { windowsHide: true, timeout: 8000, encoding: "utf8" }
    );
    return /FiveM\.exe/i.test(stdout || "");
  } catch (e) {
    logLine("warn", "FiveM process check failed", { err: String(e) });
    return false;
  }
}
