const hud = document.getElementById("hud");
const line1 = document.getElementById("line1");
const line2 = document.getElementById("line2");
const line3 = document.getElementById("line3");
const player = document.getElementById("player");
const config = document.getElementById("config");
const clipAudioConsoleGate = document.getElementById("clipAudioConsoleGate");

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
    const deadline = performance.now() + 500;
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
  /* Avoid stop() on a null cache; stopping an ended stream right before getDisplayMedia may upset some CEF builds. */
  if (cachedDisplayAudioStream) {
    stopCachedDisplayAudio();
  }
  return acquireDisplayAudioStreamInternal()
    .then((stream) => {
      cachedDisplayAudioStream = stream;
      persistDisplayAudioOk();
      hideClipAudioConsoleGate();
      return { ok: true };
    })
    .catch((e) => ({ ok: false, err: formatDisplayCaptureErr(e) }));
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

window.addEventListener("message", (e) => {
  const d = e.data;
  if (d.type === "bodycam_state") {
    if (d.active) hud.classList.remove("hidden");
    else hud.classList.add("hidden");
    if (!d.active) {
      stopCachedDisplayAudio();
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
  if (d.type === "hud_tick") {
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
  if (d.type === "bodycam_presigned_put") {
    void runPresignedPut(d);
  }
  if (d.type === "bodycam_mic_warmup") {
    void warmUpMicrophone(d);
  }
  if (d.type === "bodycam_enumerate_audio_inputs") {
    void enumerateAudioInputsToGame();
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

/** Burned-in corner watermark: ISO time + device line + AXON DELTA GOLD mark. */
function drawBodycamWatermark(ctx, s, cw) {
  if (!s || !ctx) return;
  const pad = Math.max(10, Math.round(cw * 0.011));
  const fontPx = Math.max(11, Math.round(cw * 0.0165));
  const line1 = s.wmTime || "";
  const line2 = s.wmLine2 || "AXON BODY WF x0000000";
  ctx.save();
  ctx.font = `${fontPx}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  ctx.textBaseline = "top";
  const tw1 = ctx.measureText(line1).width;
  const tw2 = ctx.measureText(line2).width;
  const textW = Math.max(tw1, tw2);
  const logoW = Math.round(fontPx * 4.1);
  let logoH = logoW;
  if (s.logo && s.logo.complete && s.logo.naturalWidth) {
    logoH = Math.round((logoW * s.logo.naturalHeight) / s.logo.naturalWidth);
  }
  const gapTextLogo = pad * 0.55;
  const blockW = textW + gapTextLogo + logoW;
  const xText = cw - pad - blockW;
  const y = pad;
  const drawLine = (txt, ly) => {
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, fontPx * 0.18);
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = Math.max(2, fontPx * 0.14);
    ctx.fillStyle = "rgba(12,12,12,0.42)";
    ctx.strokeText(txt, xText, ly);
    ctx.shadowBlur = 0;
    ctx.fillText(txt, xText, ly);
  };
  drawLine(line1, y);
  drawLine(line2, y + fontPx * 1.22);
  if (s.logo && s.logo.complete && s.logo.naturalWidth) {
    const lx = xText + textW + gapTextLogo;
    const ly = y - fontPx * 0.08;
    ctx.drawImage(s.logo, lx, ly, logoW, logoH);
  }
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

async function startClipSession(d) {
  abortClipSession(null);
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

  const kbps = Math.max(400, Math.min(12000, Number(d.clipVideoBitrateKbps) || 1400));
  const px = Math.max(1, initW * initH);
  const refPx = 960 * 540;
  const scaledKbps = Math.round(Math.min(10000, Math.max(600, (kbps * refPx) / px)));
  const recOpts = {
    mimeType: mime,
    videoBitsPerSecond: scaledKbps * 1000,
  };
  if (hasAudio) {
    recOpts.audioBitsPerSecond = displayStream ? 128_000 : 96_000;
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
  }
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
      const timer = setTimeout(() => reject(new Error("recorder stop timeout")), 35_000);
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

/** Presigned S3/R2 URLs require PUT + raw body; screenshot-basic only POSTs multipart. */
async function runPresignedPut(d) {
  const { correlation, url, contentType, dataUrl } = d;
  if (!correlation || !url || !dataUrl) {
    post("bodycam_put_done", { correlation: correlation || "", ok: false, err: "missing correlation/url/dataUrl" });
    return;
  }
  let blob;
  try {
    blob = await (await fetch(dataUrl)).blob();
  } catch (e) {
    post("bodycam_put_done", { correlation, ok: false, err: String(e) });
    return;
  }
  const ct = contentType || "image/jpeg";
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": ct },
      body: blob,
    });
    if (!res.ok) {
      const t = await res.text();
      post("bodycam_put_done", {
        correlation,
        ok: false,
        err: t || res.statusText,
        status: res.status,
        fileSize: blob.size,
      });
      return;
    }
    post("bodycam_put_done", { correlation, ok: true, fileSize: blob.size });
  } catch (e) {
    post("bodycam_put_done", { correlation, ok: false, err: String(e), fileSize: blob.size });
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
