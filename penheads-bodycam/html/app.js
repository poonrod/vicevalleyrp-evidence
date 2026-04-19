const hud = document.getElementById("hud");
const line1 = document.getElementById("line1");
const line2 = document.getElementById("line2");
const line3 = document.getElementById("line3");
const player = document.getElementById("player");
const config = document.getElementById("config");
const clipAudioConsoleGate = document.getElementById("clipAudioConsoleGate");

/** Windows desktop companion (Electron on localhost) — optional. */
let companionUrl = "";
let companionLastIncident = null;
let companionLastMeta = null;

function normalizeCompanionBase(url) {
  const u = String(url || "").replace(/\/+$/, "");
  return u || "http://127.0.0.1:4555";
}

async function companionPostStart(url, body) {
  const base = normalizeCompanionBase(url);
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetch(`${base}/start-recording`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    if (!res.ok) {
      console.warn("[companion] start-recording", res.status, await res.text().catch(() => ""));
    }
  } catch (e) {
    console.warn("[companion] start failed", e);
  } finally {
    clearTimeout(tid);
  }
}

async function companionPostStop(url, body) {
  const base = normalizeCompanionBase(url);
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), 120000);
  try {
    const res = await fetch(`${base}/stop-recording`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    if (!res.ok) {
      console.warn("[companion] stop-recording", res.status, await res.text().catch(() => ""));
    }
  } catch (e) {
    console.warn("[companion] stop failed", e);
  } finally {
    clearTimeout(tid);
    companionLastMeta = null;
  }
}

/** Cached getDisplayMedia stream (audio) — primed from F8 console UI (`bodycamclipaudio`). */
let cachedDisplayAudioStream = null;

const DISPLAY_AUDIO_LS_KEY = "penheads_bodycam_display_audio_v1";

function persistDisplayAudioOk() {
  try {
    localStorage.setItem(DISPLAY_AUDIO_LS_KEY, JSON.stringify({ ok: true, v: 1, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

function hideClipAudioConsoleGate() {
  clipAudioConsoleGate?.classList.add("hidden");
  post("bodycam_audio_setup_nui_close");
}

function normalizeClipAudioMode(m) {
  if (m === "display" || m === "display_plus_mic") return m;
  return "mic";
}

function stopCachedDisplayAudio() {
  if (!cachedDisplayAudioStream) return;
  try {
    for (const t of cachedDisplayAudioStream.getTracks()) t.stop();
  } catch {
    /* ignore */
  }
  cachedDisplayAudioStream = null;
}

function formatDisplayCaptureErr(e) {
  if (typeof DOMException !== "undefined" && e instanceof DOMException) {
    return `${e.name}: ${e.message}`;
  }
  return String(e?.message || e);
}

async function acquireDisplayAudioStreamInternal() {
  const gm = navigator.mediaDevices?.getDisplayMedia;
  if (!gm) throw new Error("getDisplayMedia_unavailable");
  /* Minimal constraints: detailed video/audio constraint objects have triggered NotAllowedError / Invalid state
     in FiveM CEF. Booleans still open the Windows picker with "Share audio" on the monitor row. */
  const stream = await gm.call(navigator.mediaDevices, { video: true, audio: true });

  const liveAudioTracks = () => stream.getAudioTracks().filter((t) => t.readyState === "live");

  let aud = liveAudioTracks();
  if (!aud.length) {
    const deadline = performance.now() + 1500;
    while (!aud.length && performance.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      aud = liveAudioTracks();
    }
  }
  if (!aud.length) {
    for (const t of stream.getTracks()) t.stop();
    throw new Error("no_system_audio_track");
  }
  /* Do not stop() display video immediately — on Chromium/CEF that can invalidate loopback audio ("Invalid state").
     Wait until we know audio is live, then mute video tracks (still cheaper than full capture). */
  for (const vt of stream.getVideoTracks()) {
    try {
      vt.enabled = false;
    } catch {
      /* ignore */
    }
  }
  return stream;
}

/**
 * Must be started synchronously from a real pointer click (no async wrapper before getDisplayMedia),
 * or Chromium revokes user activation and getDisplayMedia throws NotAllowedError / Invalid state.
 */
function primeDisplayAudioFromUserGesture() {
  const prior = cachedDisplayAudioStream;
  /* Do not stop prior tracks before getDisplayMedia — FiveM CEF often throws Invalid state if we do. */
  cachedDisplayAudioStream = null;

  return acquireDisplayAudioStreamInternal()
    .then((stream) => {
      if (prior) {
        try {
          for (const t of prior.getTracks()) t.stop();
        } catch {
          /* ignore */
        }
      }
      cachedDisplayAudioStream = stream;
      persistDisplayAudioOk();
      hideClipAudioConsoleGate();
      return { ok: true };
    })
    .catch((e) => {
      const errStr = formatDisplayCaptureErr(e);
      const priorAudioLive =
        prior &&
        typeof prior.getAudioTracks === "function" &&
        prior.getAudioTracks().some((t) => t.readyState === "live");
      if (priorAudioLive) {
        cachedDisplayAudioStream = prior;
      } else if (prior) {
        try {
          for (const t of prior.getTracks()) t.stop();
        } catch {
          /* ignore */
        }
      }
      return { ok: false, err: errStr };
    });
}

async function obtainDisplayStreamForClip() {
  if (cachedDisplayAudioStream) {
    const live = cachedDisplayAudioStream.getAudioTracks().filter((t) => t.readyState === "live");
    if (live.length) return { stream: cachedDisplayAudioStream, ephemeral: false };
    stopCachedDisplayAudio();
  }
  try {
    const stream = await acquireDisplayAudioStreamInternal();
    return { stream, ephemeral: true };
  } catch (e) {
    return { stream: null, ephemeral: false, err: formatDisplayCaptureErr(e) };
  }
}

async function mergeDisplayAndMic(displayStream, micStream) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  await ctx.resume();
  const dest = ctx.createMediaStreamDestination();
  try {
    const dSrc = ctx.createMediaStreamSource(displayStream);
    const gD = ctx.createGain();
    gD.gain.value = 0.88;
    dSrc.connect(gD).connect(dest);
  } catch {
    /* ignore */
  }
  try {
    const mSrc = ctx.createMediaStreamSource(micStream);
    const gM = ctx.createGain();
    gM.gain.value = 1.05;
    mSrc.connect(gM).connect(dest);
  } catch {
    /* ignore */
  }
  const tracks = dest.stream.getAudioTracks();
  if (!tracks.length) {
    try {
      await ctx.close();
    } catch {
      /* ignore */
    }
    return null;
  }
  return { destStream: dest.stream, context: ctx };
}

/** Combined audio record (keybind) — pending until officer clicks Start (Chromium user-gesture for getDisplayMedia). */
let combinedAudioPendingPayload = null;
let combinedAudioRunning = false;
const combinedAudioRecordGate = document.getElementById("combinedAudioRecordGate");

/**
 * Mix microphone + optional desktop loopback. FiveM Lua never receives PCM; this runs entirely in NUI.
 */
async function buildMergedMicDesktopStream(micStream, desktopStream) {
  if (micStream && desktopStream) {
    const merged = await mergeDisplayAndMic(desktopStream, micStream);
    if (merged?.destStream && merged.context) return merged;
  }
  if (!micStream) return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  await ctx.resume();
  const dest = ctx.createMediaStreamDestination();
  try {
    ctx.createMediaStreamSource(micStream).connect(dest);
  } catch {
    try {
      await ctx.close();
    } catch {
      /* ignore */
    }
    return null;
  }
  if (!dest.stream.getAudioTracks().length) {
    try {
      await ctx.close();
    } catch {
      /* ignore */
    }
    return null;
  }
  return { destStream: dest.stream, context: ctx };
}

function blackCanvasVideoStream() {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const c = canvas.getContext("2d");
  if (c) {
    c.fillStyle = "#000000";
    c.fillRect(0, 0, 2, 2);
  }
  return canvas.captureStream(1);
}

async function putWebmBlobWithTimeout(url, blob, timeoutMs) {
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "PUT",
      body: blob,
      headers: { "Content-Type": "video/webm" },
      signal: ac.signal,
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || res.statusText || `HTTP_${res.status}`);
    }
  } finally {
    clearTimeout(tid);
  }
}

async function runCombinedAudioCaptureSession(d) {
  const correlation = String(d.correlation || "");
  const uploadUrl = d.url;
  const seconds = Math.max(5, Math.min(600, Number(d.seconds) || 30));
  if (!uploadUrl || !correlation) {
    post("bodycam_combined_audio_put_done", { correlation, ok: false, err: "missing_url_or_correlation" });
    return;
  }
  if (combinedAudioRunning || clipSession) {
    post("bodycam_combined_audio_put_done", { correlation, ok: false, err: "nui_busy" });
    return;
  }
  combinedAudioRunning = true;

  let micStream = null;
  let desktopStream = null;
  let mergeCtx = null;
  let recorder = null;
  const hardCapMs = seconds * 1000 + 12000;

  try {
    const micProc = d.clipMicProcessing === "ambient" ? "ambient" : "voice";
    const micDev = typeof d.clipMicrophoneDeviceId === "string" ? d.clipMicrophoneDeviceId : "";

    /* getDisplayMedia must run before any other await — otherwise Chromium drops user activation (Invalid state in CEF). */
    try {
      desktopStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const liveAud = desktopStream.getAudioTracks().filter((t) => t.readyState === "live");
      if (!liveAud.length) {
        try {
          for (const t of desktopStream.getTracks()) t.stop();
        } catch {
          /* ignore */
        }
        desktopStream = null;
      } else {
        for (const vt of desktopStream.getVideoTracks()) {
          try {
            vt.enabled = false;
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      desktopStream = null;
    }

    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: clipMicAudioConstraints(micProc, micDev),
        video: false,
      });
    } catch (e) {
      if (desktopStream) {
        try {
          for (const t of desktopStream.getTracks()) t.stop();
        } catch {
          /* ignore */
        }
        desktopStream = null;
      }
      post("bodycam_combined_audio_put_done", {
        correlation,
        ok: false,
        err: `microphone:${String(e?.name || e?.message || e)}`,
      });
      return;
    }

    let merged = await buildMergedMicDesktopStream(micStream, desktopStream);
    if (!merged?.destStream && micStream && desktopStream) {
      merged = await buildMergedMicDesktopStream(micStream, null);
    }
    if (!merged?.destStream || !merged.context) {
      post("bodycam_combined_audio_put_done", { correlation, ok: false, err: "merge_failed" });
      return;
    }
    mergeCtx = merged.context;

    const vOnly = blackCanvasVideoStream();
    const audioTracks = merged.destStream.getAudioTracks();
    const mergedStream = new MediaStream([...vOnly.getVideoTracks(), ...audioTracks]);

    const mime = pickRecorderMime(audioTracks.length > 0);
    if (!mime) {
      post("bodycam_combined_audio_put_done", { correlation, ok: false, err: "MediaRecorder_unsupported" });
      return;
    }

    const chunks = [];
    recorder = new MediaRecorder(mergedStream, {
      mimeType: mime,
      videoBitsPerSecond: 120_000,
      audioBitsPerSecond: 128_000,
    });
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };

    const started = performance.now();
    await new Promise((resolve, reject) => {
      let watchdog = null;
      let settled = false;
      const clearW = () => {
        if (watchdog) clearTimeout(watchdog);
        watchdog = null;
      };
      const finishOk = () => {
        if (settled) return;
        settled = true;
        clearW();
        resolve();
      };
      watchdog = setTimeout(() => {
        try {
          if (recorder && recorder.state !== "inactive") recorder.stop();
        } catch {
          /* ignore */
        }
        finishOk();
      }, hardCapMs);
      recorder.onerror = (ev) => {
        if (settled) return;
        settled = true;
        clearW();
        reject(new Error(ev.error?.message || "recorder_error"));
      };
      recorder.onstop = () => finishOk();
      try {
        recorder.start(400);
      } catch (e) {
        if (!settled) {
          settled = true;
          clearW();
          reject(e);
        }
        return;
      }
      setTimeout(() => {
        try {
          if (recorder && recorder.state !== "inactive") recorder.stop();
        } catch {
          /* ignore */
        }
      }, seconds * 1000);
    });

    const durationSeconds = Math.round((performance.now() - started) / 1000);
    try {
      for (const t of vOnly.getVideoTracks()) t.stop();
    } catch {
      /* ignore */
    }

    const blob = new Blob(chunks, { type: "video/webm" });
    if (!blob.size) {
      post("bodycam_combined_audio_put_done", { correlation, ok: false, err: "empty_blob" });
      return;
    }

    await putWebmBlobWithTimeout(uploadUrl, blob, Math.min(120000, Math.max(30000, seconds * 8000)));
    post("bodycam_combined_audio_put_done", {
      correlation,
      ok: true,
      fileSize: blob.size,
      durationSeconds,
    });
  } catch (e) {
    post("bodycam_combined_audio_put_done", {
      correlation,
      ok: false,
      err: String(e?.message || e),
    });
  } finally {
    combinedAudioRunning = false;
    try {
      if (recorder && recorder.state !== "inactive") recorder.stop();
    } catch {
      /* ignore */
    }
    if (desktopStream) {
      try {
        for (const t of desktopStream.getTracks()) t.stop();
      } catch {
        /* ignore */
      }
    }
    if (micStream) {
      try {
        for (const t of micStream.getTracks()) t.stop();
      } catch {
        /* ignore */
      }
    }
    if (mergeCtx) {
      try {
        await mergeCtx.close();
      } catch {
        /* ignore */
      }
    }
  }
}

window.addEventListener("message", (e) => {
  const d = e.data;
  if (d.type === "bodycam_state") {
    if (d.companionUrl) companionUrl = d.companionUrl;
    if (d.active) hud.classList.remove("hidden");
    else hud.classList.add("hidden");
    if (!d.active) {
      if (d.companionEnabled && companionLastMeta) {
        const m = companionLastMeta;
        const stopBody = {
          officer_discord_id: m.officer_discord_id,
          officer_name: m.officer_name,
          badge_number: m.badge_number,
          case_number: m.case_number != null ? m.case_number : null,
          timestamp: m.timestamp != null ? m.timestamp * 1000 : Date.now(),
          incident_id: companionLastIncident,
        };
        void companionPostStop(d.companionUrl || companionUrl, stopBody);
      }
      /* Do not stop primed loopback when using display audio: bodycam OFF immediately starts the
         WebM clip in Lua; clearing the cache here ran before bodycam_clip_begin and forced mic-only
         (no user gesture for a fresh getDisplayMedia). Still clear when configured for mic-only. */
      if (normalizeClipAudioMode(d.clipAudioCaptureMode) === "mic") {
        stopCachedDisplayAudio();
      }
    }
  }
  if (d.type === "bodycam_audio_console_setup_open") {
    clipAudioConsoleGate?.classList.remove("hidden");
  }
  if (d.type === "bodycam_display_audio_forget") {
    stopCachedDisplayAudio();
    try {
      localStorage.removeItem(DISPLAY_AUDIO_LS_KEY);
    } catch {
      /* ignore */
    }
    clipAudioConsoleGate?.classList.add("hidden");
    post("bodycam_audio_setup_nui_close");
  }
  if (d.type === "companion_meta") {
    if (!d.payload || !d.payload.officer_discord_id) return;
    companionLastMeta = d.payload;
    if (d.companionUrl) companionUrl = d.companionUrl;
    if (d.incident_id) companionLastIncident = d.incident_id;
    const p = d.payload;
    const tsSec = p.timestamp != null ? Number(p.timestamp) : null;
    const body = {
      officer_discord_id: p.officer_discord_id,
      officer_name: p.officer_name,
      badge_number: p.badge_number,
      case_number: p.case_number != null ? p.case_number : null,
      timestamp: tsSec != null && !Number.isNaN(tsSec) ? tsSec * 1000 : Date.now(),
      incident_id: d.incident_id != null ? d.incident_id : companionLastIncident,
    };
    void companionPostStart(d.companionUrl || companionUrl, body);
  }
  if (d.type === "companion_incident") {
    if (d.incident_id) companionLastIncident = d.incident_id;
  }
  if (d.type === "hud_tick") {
    if (d.incident) companionLastIncident = d.incident;
    line1.textContent = `${d.officer} • ${d.dept} • Badge ${d.badge}`;
    line2.textContent = `${d.time} • ${d.street || ""}`;
    line3.textContent = `INC ${d.incident || "—"}${d.auto ? " • AUTO" : ""}${d.sleeping ? " • SLEEP" : ""}${!d.equipped ? " • NO EQUIP" : ""}`;
  }
  if (d.type === "play_sound") {
    try {
      const vol = typeof d.volume === "number" ? d.volume : 0.35;
      const src = new URL(`sounds/${d.file}`, window.location.href).href;
      const clip = new Audio(src);
      clip.volume = vol;
      clip.setAttribute("playsinline", "");
      void clip.play().catch(() => {
        try {
          player.src = src;
          player.volume = vol;
          void player.play().catch(() => {});
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* missing file */
    }
  }
  if (d.type === "bodycam_mic_warmup") {
    void warmUpMicrophone(d);
  }
  if (d.type === "bodycam_combined_audio_begin") {
    if (combinedAudioRunning || clipSession) {
      post("bodycam_combined_audio_put_done", {
        correlation: String(d.correlation || ""),
        ok: false,
        err: "nui_busy",
      });
      return;
    }
    combinedAudioPendingPayload = d;
    combinedAudioRecordGate?.classList.remove("hidden");
    setTimeout(() => {
      if (
        combinedAudioPendingPayload &&
        String(combinedAudioPendingPayload.correlation) === String(d.correlation) &&
        !combinedAudioRunning
      ) {
        combinedAudioPendingPayload = null;
        combinedAudioRecordGate?.classList.add("hidden");
        post("bodycam_combined_audio_cancel", {});
      }
    }, 120000);
    return;
  }
  if (d.type === "bodycam_enumerate_audio_inputs") {
    void enumerateAudioInputsToGame();
  }
  if (d.type === "bodycam_preroll_ring_push") {
    if (typeof d.dataUrl === "string" && d.dataUrl.startsWith("data:")) {
      preRollRing.push(d.dataUrl);
      const maxN = Math.max(4, Math.min(240, Number(d.ringMax) || 40));
      while (preRollRing.length > maxN) preRollRing.shift();
    }
    return;
  }
  if (d.type === "bodycam_preroll_freeze") {
    frozenPreRollUrls = [...preRollRing];
    preRollRing.length = 0;
    return;
  }
  if (d.type === "bodycam_clip_begin") {
    void startClipSession(d);
  }
  if (d.type === "bodycam_clip_frame") {
    pushClipFrame(d);
  }
  if (d.type === "bodycam_clip_end") {
    void finalizeClipSession();
  }
  if (d.type === "bodycam_clip_abort") {
    abortClipSession(d.correlation);
  }
  if (d.type === "config_open") {
    config.classList.remove("hidden");
    document.getElementById("sleeping").checked = !!d.sleeping;
    document.getElementById("autoTaser").checked = !!d.autoTaser;
    document.getElementById("autoFirearm").checked = !!d.autoFirearm;
    document.getElementById("sound").checked = !!d.sound;
    document.getElementById("firstPerson").checked = !!d.firstPerson;
    document.getElementById("lowStorage").checked = !!d.lowStorage;
    document.getElementById("autoTaser").disabled = !!d.lockedTaser;
    document.getElementById("autoFirearm").disabled = !!d.lockedFirearm;
    document.getElementById("status").textContent = `Job: ${d.job || "?"} • Equipped: ${d.equipped ? "Yes" : "No"} • BCAM: ${d.bodycamActive ? "On" : "Off"}`;
  }
});

function resourceName() {
  return typeof GetParentResourceName === "function" ? GetParentResourceName() : "penheads-bodycam";
}

/** Short WebM bodycam clip: frames from Lua → canvas → MediaRecorder → presigned PUT. */
let clipSession = null;
/** Rolling JPEG data URLs while bodycam is off (Lua pushes). */
let preRollRing = [];
/** Snapshot at bodycam ON — prepended into the clip after MediaRecorder starts. */
let frozenPreRollUrls = [];

function clipMicAudioConstraints(processing, deviceId) {
  const ambient = processing === "ambient";
  const base = {
    echoCancellation: !ambient,
    noiseSuppression: !ambient,
    autoGainControl: true,
  };
  if (typeof deviceId === "string" && deviceId.trim() !== "") {
    return { ...base, deviceId: { exact: deviceId.trim() } };
  }
  return { ...base, channelCount: 1 };
}

async function enumerateAudioInputsToGame() {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) {
      post("bodycam_enumerate_audio_inputs_result", { ok: false, err: "enumerateDevices_unavailable" });
      return;
    }
    const list = (await navigator.mediaDevices.enumerateDevices())
      .filter((x) => x.kind === "audioinput")
      .map((x) => ({ deviceId: x.deviceId, label: x.label || "" }));
    post("bodycam_enumerate_audio_inputs_result", { ok: true, devices: list });
  } catch (e) {
    post("bodycam_enumerate_audio_inputs_result", { ok: false, err: String(e?.message || e) });
  }
}

async function warmUpMicrophone(d) {
  if (!navigator.mediaDevices?.getUserMedia) {
    post("bodycam_mic_warmup_result", { ok: false, err: "getUserMedia_unavailable" });
    return;
  }
  const proc = d && d.clipMicProcessing === "ambient" ? "ambient" : "voice";
  const micDev = d && typeof d.clipMicrophoneDeviceId === "string" ? d.clipMicrophoneDeviceId : "";
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: clipMicAudioConstraints(proc, micDev),
      video: false,
    });
    for (const t of s.getTracks()) t.stop();
    post("bodycam_mic_warmup_result", { ok: true });
  } catch (e) {
    post("bodycam_mic_warmup_result", { ok: false, err: String(e?.name || e) });
  }
}

function loadClipWatermarkLogo() {
  return new Promise((resolve) => {
    const tryPng = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => trySvg();
      try {
        img.src = new URL("overlay/axon-delta-gold.png", window.location.href).href;
      } catch {
        trySvg();
      }
    };
    const trySvg = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      try {
        img.src = new URL("overlay/axon-delta-gold.svg", window.location.href).href;
      } catch {
        resolve(null);
      }
    };
    tryPng();
  });
}

/** Burned-in top-right mark: yellow AXON-style logo only (no timestamp / serial text). */
function drawBodycamWatermark(ctx, s, cw) {
  if (!s || !ctx) return;
  if (!s.logo || !s.logo.complete || !s.logo.naturalWidth) return;
  const pad = Math.max(10, Math.round(cw * 0.011));
  const basePx = Math.max(20, Math.round(cw * 0.034));
  const logoW = Math.round(basePx * 3.2);
  const logoH = Math.round((logoW * s.logo.naturalHeight) / s.logo.naturalWidth);
  const lx = cw - pad - logoW;
  const ly = pad;
  ctx.save();
  ctx.drawImage(s.logo, lx, ly, logoW, logoH);
  ctx.restore();
}

function pickRecorderMime(withAudio) {
  if (typeof MediaRecorder === "undefined") return "";
  const opts = withAudio
    ? [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ]
    : ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const o of opts) {
    if (MediaRecorder.isTypeSupported(o)) return o;
  }
  return "";
}

function stopClipMic(s) {
  if (!s) return;
  if (s.mergeAudioContext) {
    try {
      void s.mergeAudioContext.close();
    } catch {
      /* ignore */
    }
    s.mergeAudioContext = null;
  }
  if (s.ephemeralDisplayStream) {
    try {
      for (const t of s.ephemeralDisplayStream.getTracks()) t.stop();
    } catch {
      /* ignore */
    }
    s.ephemeralDisplayStream = null;
  }
  if (s.micStream) {
    try {
      for (const t of s.micStream.getTracks()) t.stop();
    } catch {
      /* ignore */
    }
  }
}

function abortClipSession(correlation, errMsg) {
  const s = clipSession;
  clipSession = null;
  if (correlation != null && correlation !== "") {
    frozenPreRollUrls.length = 0;
  }
  stopClipMic(s);
  if (s && s.recorder && s.recorder.state !== "inactive") {
    try {
      s.recorder.stop();
    } catch {
      /* ignore */
    }
  }
  if (correlation != null && correlation !== "") {
    post("bodycam_clip_put_done", { correlation: String(correlation), ok: false, err: errMsg || "aborted" });
  }
}

/**
 * Draw one sampled pre-roll JPEG for `repeats` encoder frames at `fps` (time-stretches low sample rate).
 */
async function drawPreRollStrip(dataUrl, repeats, fps, correlation) {
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("preroll frame decode failed"));
    im.src = dataUrl;
  });
  const frameMs = 1000 / fps;
  for (let r = 0; r < repeats; r++) {
    if (!clipSession || clipSession.correlation !== String(correlation)) return;
    const { canvas, ctx } = clipSession;
    const maxW = clipSession.clipMaxWidth || 1280;
    const maxH = clipSession.clipMaxHeight || 720;
    let tw = img.naturalWidth;
    let th = img.naturalHeight;
    if (tw > maxW || th > maxH) {
      const scale = Math.min(maxW / tw, maxH / th);
      tw = Math.max(1, Math.round(tw * scale));
      th = Math.max(1, Math.round(th * scale));
    }
    if (canvas.width !== tw || canvas.height !== th) {
      canvas.width = tw;
      canvas.height = th;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, tw, th);
    drawBodycamWatermark(ctx, clipSession, canvas.width);
    await new Promise((res) => setTimeout(res, frameMs));
  }
}

async function startClipSession(d) {
  abortClipSession(null);
  if (combinedAudioRunning) {
    post("bodycam_clip_put_done", { correlation: d.correlation, ok: false, err: "combined_audio_active" });
    return;
  }
  const canvas = document.createElement("canvas");
  const initW = Math.max(320, Math.min(1920, Number(d.clipMaxWidth) || 1280));
  const initH = Math.max(180, Math.min(1080, Number(d.clipMaxHeight) || 720));
  canvas.width = initW;
  canvas.height = initH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    post("bodycam_clip_put_done", { correlation: d.correlation, ok: false, err: "no canvas context" });
    return;
  }

  const fps = Math.max(1, Math.min(60, Number(d.fps) || 30));
  const audioMode = normalizeClipAudioMode(d.clipAudioCaptureMode);
  const wantMic =
    !!d.includeMic &&
    typeof navigator !== "undefined" &&
    navigator.mediaDevices?.getUserMedia &&
    (audioMode === "mic" || audioMode === "display_plus_mic");

  const logoPromise = loadClipWatermarkLogo();

  let micStream = null;
  const micProc = d.clipMicProcessing === "ambient" ? "ambient" : "voice";
  const micDev = typeof d.clipMicrophoneDeviceId === "string" ? d.clipMicrophoneDeviceId : "";
  if (wantMic) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: clipMicAudioConstraints(micProc, micDev),
        video: false,
      });
    } catch {
      micStream = null;
    }
  }

  let displayStream = null;
  let displayEphemeral = false;
  let mergeAudioContext = null;
  let audioTracksForRecorder = [];

  if (audioMode === "display" || audioMode === "display_plus_mic") {
    const got = await obtainDisplayStreamForClip();
    displayStream = got.stream;
    displayEphemeral = !!got.ephemeral;
    if (!displayStream || !displayStream.getAudioTracks().length) {
      post("bodycam_clip_audio_fallback", {
        correlation: d.correlation,
        mode: audioMode,
        err: got.err || "display_audio_unavailable",
      });
      if (audioMode === "display") {
        stopClipMic({ micStream });
        post("bodycam_clip_put_done", {
          correlation: d.correlation,
          ok: false,
          err: "display_audio_required",
        });
        return;
      }
      displayStream = null;
      displayEphemeral = false;
    }
  }

  if (audioMode === "display" && displayStream) {
    audioTracksForRecorder = [...displayStream.getAudioTracks()];
  } else if (audioMode === "display_plus_mic" && displayStream && micStream) {
    const merged = await mergeDisplayAndMic(displayStream, micStream);
    if (merged?.destStream && merged.context) {
      mergeAudioContext = merged.context;
      audioTracksForRecorder = [...merged.destStream.getAudioTracks()];
    } else if (displayStream) {
      audioTracksForRecorder = [...displayStream.getAudioTracks()];
    } else if (micStream) {
      audioTracksForRecorder = [...micStream.getAudioTracks()];
    }
  } else if (audioMode === "display_plus_mic" && displayStream && !micStream) {
    audioTracksForRecorder = [...displayStream.getAudioTracks()];
  } else if (micStream) {
    audioTracksForRecorder = [...micStream.getAudioTracks()];
  }

  const hasAudio = audioTracksForRecorder.length > 0;
  const mime = pickRecorderMime(hasAudio);
  if (!mime) {
    stopClipMic({
      micStream,
      mergeAudioContext,
      ephemeralDisplayStream: displayEphemeral ? displayStream : null,
    });
    post("bodycam_clip_put_done", {
      correlation: d.correlation,
      ok: false,
      err: "MediaRecorder/WebM not supported in this client",
    });
    return;
  }

  const logo = await logoPromise;
  const wmTime =
    typeof d.watermarkTime === "string" && d.watermarkTime
      ? d.watermarkTime
      : new Date().toISOString().replace("T", " T").replace(/\.\d{3}Z$/, "Z");
  const wmLine2 =
    typeof d.watermarkLine2 === "string" && d.watermarkLine2
      ? d.watermarkLine2
      : "AXON BODY WF x0000000";

  const videoOnly = canvas.captureStream(fps);
  const tracks = [...videoOnly.getVideoTracks(), ...audioTracksForRecorder];
  const merged = new MediaStream(tracks);

  const kbps = Math.max(400, Math.min(60000, Number(d.clipVideoBitrateKbps) || 1400));
  const recOpts = {
    mimeType: mime,
    videoBitsPerSecond: kbps * 1000,
  };
  if (hasAudio) {
    recOpts.audioBitsPerSecond = displayStream ? 192_000 : 128_000;
  }

  let recorder;
  try {
    recorder = new MediaRecorder(merged, recOpts);
  } catch (err) {
    stopClipMic({
      micStream,
      mergeAudioContext,
      ephemeralDisplayStream: displayEphemeral ? displayStream : null,
    });
    post("bodycam_clip_put_done", { correlation: d.correlation, ok: false, err: String(err) });
    return;
  }

  const chunks = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size) chunks.push(ev.data);
  };

  clipSession = {
    correlation: String(d.correlation),
    canvas,
    ctx,
    recorder,
    chunks,
    url: d.url,
    mime,
    micStream,
    mergeAudioContext,
    ephemeralDisplayStream: displayEphemeral ? displayStream : null,
    startMs: Date.now(),
    wmTime,
    wmLine2,
    logo,
    minUploadSeconds: Math.max(1, Math.min(120, Number(d.minUploadSeconds) || 5)),
    clipMaxWidth: initW,
    clipMaxHeight: initH,
  };

  try {
    recorder.start(100);
  } catch (err) {
    clipSession = null;
    stopClipMic({
      micStream,
      mergeAudioContext,
      ephemeralDisplayStream: displayEphemeral ? displayStream : null,
    });
    post("bodycam_clip_put_done", { correlation: d.correlation, ok: false, err: String(err) });
    return;
  }

  await new Promise((r) => setTimeout(r, 80));

  const sampleFps = Math.max(0.25, Math.min(10, Number(d.preRollSampleFps) || 1));
  const prOn = !!d.enableClipPreRoll;
  try {
    if (prOn && frozenPreRollUrls.length > 0) {
      const repeats = Math.max(1, Math.round(fps / sampleFps));
      const urls = [...frozenPreRollUrls];
      for (const dataUrl of urls) {
        if (!clipSession || clipSession.correlation !== String(d.correlation)) return;
        await drawPreRollStrip(dataUrl, repeats, fps, d.correlation);
      }
    }
  } catch (e) {
    abortClipSession(d.correlation, String(e));
    return;
  }
  frozenPreRollUrls.length = 0;

  post("bodycam_clip_live_frames_begin", { correlation: d.correlation });
}

function pushClipFrame(d) {
  if (!clipSession || clipSession.correlation !== String(d.correlation)) return;
  const img = new Image();
  img.onload = () => {
    if (!clipSession || clipSession.correlation !== String(d.correlation)) return;
    const { canvas, ctx } = clipSession;
    const maxW = clipSession.clipMaxWidth || 1280;
    const maxH = clipSession.clipMaxHeight || 720;
    let tw = img.naturalWidth;
    let th = img.naturalHeight;
    if (tw > maxW || th > maxH) {
      const scale = Math.min(maxW / tw, maxH / th);
      tw = Math.max(1, Math.round(tw * scale));
      th = Math.max(1, Math.round(th * scale));
    }
    if (canvas.width !== tw || canvas.height !== th) {
      canvas.width = tw;
      canvas.height = th;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, tw, th);
    drawBodycamWatermark(ctx, clipSession, canvas.width);
  };
  img.onerror = () => {
    abortClipSession(d.correlation, "frame decode failed");
  };
  img.src = d.dataUrl;
}

async function finalizeClipSession() {
  const s = clipSession;
  if (!s) return;
  clipSession = null;
  await new Promise((r) => setTimeout(r, 380));
  const recordedSeconds = Math.max(0, (Date.now() - s.startMs) / 1000);
  const durationSeconds = Math.max(0.1, Math.round(recordedSeconds * 10) / 10);
  const minSec = s.minUploadSeconds ?? 5;
  if (recordedSeconds + 1e-6 < minSec) {
    try {
      if (s.recorder && s.recorder.state === "recording") s.recorder.stop();
    } catch {
      /* ignore */
    }
    stopClipMic(s);
    post("bodycam_clip_put_done", {
      correlation: s.correlation,
      ok: false,
      err: "CLIP_TOO_SHORT",
      durationSeconds,
      minUploadSeconds: minSec,
    });
    return;
  }
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("recorder stop timeout")), 60_000);
      s.recorder.onstop = () => {
        clearTimeout(timer);
        resolve();
      };
      s.recorder.onerror = () => {
        clearTimeout(timer);
        reject(new Error("recorder error"));
      };
      if (s.recorder.state === "recording") {
        try {
          s.recorder.requestData();
        } catch {
          /* ignore */
        }
        s.recorder.stop();
      } else {
        clearTimeout(timer);
        resolve();
      }
    });
  } catch (err) {
    stopClipMic(s);
    post("bodycam_clip_put_done", { correlation: s.correlation, ok: false, err: String(err) });
    return;
  }
  stopClipMic(s);
  await new Promise((r) => setTimeout(r, 120));
  const finalSeconds = Math.max(0.1, Math.round(((Date.now() - s.startMs) / 1000) * 10) / 10);
  const baseMime = (s.mime || "video/webm").split(";")[0] || "video/webm";
  const blob = new Blob(s.chunks, { type: baseMime });
  if (!blob.size) {
    post("bodycam_clip_put_done", { correlation: s.correlation, ok: false, err: "empty WebM blob" });
    return;
  }
  try {
    const res = await fetch(s.url, {
      method: "PUT",
      headers: { "Content-Type": "video/webm" },
      body: blob,
    });
    if (!res.ok) {
      const t = await res.text();
      post("bodycam_clip_put_done", {
        correlation: s.correlation,
        ok: false,
        err: t || res.statusText,
        status: res.status,
        fileSize: blob.size,
        durationSeconds: finalSeconds,
      });
      return;
    }
    post("bodycam_clip_put_done", { correlation: s.correlation, ok: true, fileSize: blob.size, durationSeconds: finalSeconds });
  } catch (err) {
    post("bodycam_clip_put_done", { correlation: s.correlation, ok: false, err: String(err), durationSeconds: finalSeconds });
  }
}

function post(name, data) {
  fetch(`https://${resourceName()}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data || {}),
  });
}

document.getElementById("close").addEventListener("click", () => {
  post("bcamconfig_close", {});
  config.classList.add("hidden");
});

document.getElementById("save").addEventListener("click", () => {
  post("bcamconfig_apply", {
    sleeping: document.getElementById("sleeping").checked,
    autoTaser: document.getElementById("autoTaser").checked,
    autoFirearm: document.getElementById("autoFirearm").checked,
    sound: document.getElementById("sound").checked,
    firstPerson: document.getElementById("firstPerson").checked,
    lowStorage: document.getElementById("lowStorage").checked,
  });
  config.classList.add("hidden");
});

document.getElementById("clipAudioConsoleGrantBtn")?.addEventListener("click", () => {
  void primeDisplayAudioFromUserGesture().then((r) => post("bodycam_display_audio_result", r));
});

document.getElementById("clipAudioConsoleCloseBtn")?.addEventListener("click", () => {
  hideClipAudioConsoleGate();
});

document.getElementById("combinedAudioRecordStartBtn")?.addEventListener("click", () => {
  if (!combinedAudioPendingPayload) return;
  const p = combinedAudioPendingPayload;
  combinedAudioPendingPayload = null;
  combinedAudioRecordGate?.classList.add("hidden");
  void runCombinedAudioCaptureSession(p);
});

document.getElementById("combinedAudioRecordCancelBtn")?.addEventListener("click", () => {
  combinedAudioPendingPayload = null;
  combinedAudioRecordGate?.classList.add("hidden");
  post("bodycam_combined_audio_cancel", {});
});
