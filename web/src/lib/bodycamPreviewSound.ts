/**
 * Bodycam-style activation cue for evidence / watch video preview.
 * OGG works in Chromium/Firefox; Safari often has no OGG — use Web Audio fallback.
 * Browsers may block audio until a user gesture; call `primeBodycamPreviewAudio()` from pointerdown on the same surface.
 */

let sharedCtx: AudioContext | null = null;

function getAudioContextCtor(): (typeof AudioContext) | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null;
}

/** Call once from a pointer/tap on the preview area (before first play) so playback is allowed. */
export async function primeBodycamPreviewAudio(): Promise<void> {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return;
  if (!sharedCtx || sharedCtx.state === "closed") sharedCtx = new Ctor();
  if (sharedCtx.state === "suspended") {
    try {
      await sharedCtx.resume();
    } catch {
      /* ignore */
    }
  }
}

function playSyntheticChime(ctx: AudioContext, volume: number): void {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = Math.min(1, Math.max(0, volume));
  master.connect(ctx.destination);
  const freqs = [880, 660];
  freqs.forEach((freq, i) => {
    const t0 = now + i * 0.07;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.018);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + 0.14);
  });
}

/**
 * Plays bundled axon_on.ogg when supported; otherwise a short two-tone chime on Web Audio.
 */
export function playBodycamActivationPreview(volume = 0.35): void {
  void (async () => {
    let canOgg = "";
    if (typeof document !== "undefined") {
      const probe = document.createElement("audio");
      canOgg = probe.canPlayType("audio/ogg; codecs=vorbis");
    }

    if (canOgg) {
      const a = new Audio("/sounds/axon_on.ogg");
      a.volume = Math.min(1, Math.max(0, volume));
      try {
        await a.play();
        return;
      } catch {
        /* continue to Web Audio */
      }
    }

    const Ctor = getAudioContextCtor();
    if (!Ctor) return;
    if (!sharedCtx || sharedCtx.state === "closed") sharedCtx = new Ctor();
    try {
      if (sharedCtx.state === "suspended") await sharedCtx.resume();
    } catch {
      return;
    }
    try {
      playSyntheticChime(sharedCtx, volume);
    } catch {
      /* ignore */
    }
  })();
}
