Config = {}

-- API (server-side only — never put secrets in client files)
Config.ApiBaseUrl = GetConvar('bodycam_api_base', 'http://127.0.0.1:4000')
Config.ApiSecret = GetConvar('bodycam_api_secret', '')

-- Windows desktop companion (Electron @ localhost) — optional; NUI POSTs start/stop when bodycam toggles.
Config.EnableWindowsCompanion = GetConvar('bodycam_companion', '0') == '1'
Config.WindowsCompanionUrl = GetConvar('bodycam_companion_url', 'http://127.0.0.1:4555')

-- Resource folder name for requestScreenshotUpload (default matches citizenfx/screenshot-basic)
Config.ScreenshotResourceName = GetConvar('bodycam_screenshot_resource', 'screenshot-basic')

-- Toggle / input
Config.EnableToggleCommand = true
Config.ToggleCommandName = "bodycam"
Config.EnableKeybindToggle = true
Config.ToggleKeybindCommand = "+togglebodycam"
Config.ToggleKeybindDefault = "F10"
Config.ToggleKeybindDescription = "Toggle Body Camera"

-- Optional second hotkey: standalone mic+desktop WebM (default off; use F10+clip or StartCombinedAudioAfterManualBodycamOffWhenNoClip).
Config.EnableCombinedAudioRecordKeybind = false
Config.CombinedAudioRecordKeybindCommand = "+bodycamrecord"
Config.CombinedAudioRecordKeybindDefault = "F9"
Config.CombinedAudioRecordKeybindDescription = "Bodycam combined audio record (mic + desktop)"
Config.CombinedAudioRecordKeybindSeconds = 30
-- One F10 workflow when clip mode is OFF: after manual bodycam off, start combined-audio capture (no second bind).
Config.StartCombinedAudioAfterManualBodycamOffWhenNoClip = false

Config.EnableBodycamConfigMenu = true
Config.BodycamConfigCommand = "bcamconfig"

-- Sounds (NUI)
Config.EnableBodycamSounds = true
Config.ActivationSoundFile = "axon_on.ogg"
Config.DeactivationSoundFile = "axon_off.ogg"
Config.SoundVolume = 0.35
Config.PlaySoundOnAutoActivation = true

-- Auto activation
Config.EnableAutoActivation = true
Config.AutoActivateOnTaser = true
Config.AutoActivateOnFirearm = true
Config.ContinueCaptureAfterAutoActivation = true
Config.AutoActivationCooldownSeconds = 60
Config.AutoActivationCreatesIncidentMarker = true
Config.AutoTriggerMinimumActiveSeconds = 45

-- Sleeping mode
Config.EnableSleepingMode = true
Config.AllowManualActivationWhileSleeping = true
Config.ShowSleepingModeIndicator = true

Config.AllowPlayerToggleAutoTaser = true
Config.AllowPlayerToggleAutoFirearm = true
Config.ForceAutoTaserForLawEnforcement = false
Config.ForceAutoFirearmForLawEnforcement = false

Config.PersistPersonalBodycamSettings = true
Config.UseFrameworkMetadataForSettings = false
Config.AllowLowStorageModeToggle = true

-- Law enforcement
Config.RestrictToLawEnforcement = true
Config.AllowedJobs = { "police", "sheriff" }
Config.AllowedDepartments = { "LSPD", "BCSO", "SAHP" }
Config.UseAcePermissions = false
Config.RequiredAcePermission = "bodycam.use"

-- Equipment
Config.RequireBodycamProp = false
Config.BodycamPropMode = "component_or_prop"
Config.AllowedBodycamProps = {
    { type = "prop", drawable = 12, texture = 0 },
}
Config.AllowedBodycamComponents = {
    { componentId = 9, drawable = 3, texture = 0 },
}
Config.DisableIfPropRemoved = true
Config.NotifyIfMissingBodycamProp = true
Config.RequireEquippedStateForActivation = true
Config.AutoDisableIfNoLongerEquipped = true
Config.ShowEquippedStateWarnings = true

-- Camera
-- If true, keeps follow-cam in first person the whole time the bodycam is on (gameplay POV).
Config.ForceFirstPersonWhileBodycamActive = false
-- Applies when turning bodycam off with ForceFirstPersonWhileBodycamActive; clip FP angles always restore.
Config.RestorePreviousCameraModeOnDisable = true

-- Video tiers (policy enforced server/API; client hints for UX)
-- When true, turning bodycam off records a short WebM (canvas + MediaRecorder in NUI) from
-- rapid internal frame grabs (screenshot-basic). **Video-only:** keep this true or no evidence is saved.
-- Target FPS: screenshot-basic latency usually caps real throughput below this; tune if stuttery.
Config.EnableClipMode = true
-- Rolling buffer (screenshots while bodycam is OFF) prepended to the WebM on save — ~PreRollSeconds of wall time at PreRollSampleFps.
-- CPU/network cost: keep sample FPS modest (1–2). Requires screenshot-basic.
Config.EnableClipPreRoll = true
Config.PreRollSeconds = 30
Config.PreRollSampleFps = 1
Config.PreRollJpegQuality = 0.72
-- Minimum bodycam **session** length (seconds) before we request a clip upload at all (aligns with short-clip policy).
Config.ClipMinActiveSeconds = 5
-- Minimum **recorded WebM** length (seconds); clips shorter than this are discarded (NUI) and the player is notified.
Config.ClipMinUploadSeconds = 5
-- Clip FPS: 30 matches common displays and looks smoother than 24 (tradeoff: slightly more screenshot-basic load).
-- Tier targets (short = bodycam WebM; medium/long for policy / future uploads). ClipRecord* mirrors short.
Config.ShortClipRecordFps = 30
Config.MediumClipRecordFps = 30
Config.LongVideoRecordFps = 30
Config.ClipRecordFps = 30
Config.ClipRecordFpsMax = 30
-- ShortClipMaxSeconds (30) * target FPS + preroll headroom (30s @ 30fps = 900) + live burst.
Config.ClipMaxFramesCap = 1800
-- Presign hint: allow preroll + max live clip (raise API maxUploadSizeMB if uploads reject).
Config.ClipEstimatedMaxMB = 200
-- When true, WebM clip **frames** use a first-person angle (chest-cam style). Turn off for third-person clips.
Config.UseFirstPersonForClipRecording = true
-- When true, the **player camera** stays in first person for the whole clip burst (one switch in/out — no strobe).
-- When false, FP toggles **every frame** during capture → harsh third/first **flicker** while the WebM is built.
Config.ClipFirstPersonHoldWhileRecording = true
-- If true, clip first-person also requires the personal "First-person capture" toggle in /bcamconfig.
Config.ClipFirstPersonRequiresSnapshotToggle = false
-- JPEG quality for clip frames (before VP9). Higher = sharper source frames for the VP9 encoder at 1080p.
Config.ClipJpegQuality = 0.96
-- Mix the player's real microphone (browser getUserMedia) into the WebM when supported.
Config.EnableClipRecordingMicrophone = true
-- If true, NUI warms up the mic when bodycam turns ON (Chromium may show a permission prompt early).
-- If false, the first mic prompt usually appears when the WebM clip starts (turn bodycam off with clip mode on).
Config.ClipMicrophoneWarmupOnActivate = false
-- Clip audio source (see README "Game + voice chat audio"):
--   mic = microphone only (getUserMedia).
--   display = Windows monitor / "Entire screen" loopback via getDisplayMedia + "Share audio" (what plays on that display — usually same as default output / headphones).
--   display_plus_mic = that loopback + microphone mixed (recommended for bodycam).
-- display* modes need a one-time F8 `bodycamclipaudio` grant (monitor + Share audio); some FiveM CEF builds fail — then use setr bodycam_clip_audio_mode mic or Stereo Mix deviceId.
-- Override without editing this file: setr bodycam_clip_audio_mode mic
Config.ClipAudioCaptureMode = "display_plus_mic"
local _clipAudioModeCv = GetConvar('bodycam_clip_audio_mode', '')
if type(_clipAudioModeCv) == 'string' and _clipAudioModeCv:gsub('%s+', '') ~= '' then
    Config.ClipAudioCaptureMode = _clipAudioModeCv:match('^%s*(.-)%s*$') or Config.ClipAudioCaptureMode
end
-- F8 console: run this command to open NUI and click "Allow monitor audio" once; choice is remembered (see README).
Config.BodycamClipAudioConsoleCommand = "bodycamclipaudio"
-- First bodycam ON each session: brief hint to run F8 setup (so default output / game audio is actually captured).
Config.ClipDisplayAudioSetupHint = true
-- "voice" = echo/noise suppression (Discord-like). "ambient" = lighter processing so room/speaker
-- bleed is louder (still mic-only). For more room/speaker without extra apps, prefer "ambient".
Config.ClipMicrophoneProcessing = "voice"
-- Optional exact Windows/Chromium recording device id for clip mic (getUserMedia). Empty = system default.
-- Lets you bind a driver-provided loopback such as "Stereo Mix" / "What U Hear" when available — no Voicemeeter required.
-- F8 `bodycam_mic_devices` lists inputs after mic permission (toggle bodycam on once). Override: setr bodycam_clip_mic_device_id "<id>"
Config.ClipMicrophoneDeviceId = ''
local _micDevCv = GetConvar('bodycam_clip_mic_device_id', '')
if type(_micDevCv) == 'string' and _micDevCv:match('%S') then
    Config.ClipMicrophoneDeviceId = _micDevCv:match('^%s*(.-)%s*$') or ''
end
-- Legacy flag — real game path uses ClipAudioCaptureMode display* + getDisplayMedia (README).
Config.EnableClipRecordingGameAudio = true
Config.EnableLongVideoMode = true
-- Max seconds for combined-audio capture (keybind duration is clamped to this). Presign size estimate uses duration.
Config.CombinedAudioMaxSeconds = 90
Config.ShortClipMaxSeconds = 30
Config.MediumClipMaxSeconds = 300
Config.LongVideoMaxSeconds = 1800
Config.MaxClipFileSizeMB = 220
-- 1080p @ high bitrate: maximum practical WebM quality for evidence (ensure API maxUploadSizeMB >= ClipEstimatedMaxMB).
Config.ShortClipResolution = "1920x1080"
Config.ShortClipBitrateKbps = 22000
Config.MediumClipResolution = "1920x1080"
Config.MediumClipBitrateKbps = 12000
Config.LongVideoResolution = "1920x1080"
Config.LongVideoBitrateKbps = 8000
Config.VideoCodec = "h264"
Config.RequireCaseNumberForLongVideos = true
Config.LongVideoWithoutCaseAction = "reject"
Config.EnableLongVideoChunking = true
Config.LongVideoChunkSeconds = 300

Config.EnableVoiceActivityMetadata = true
Config.EnableAudioRecording = false

Config.TaserWeaponNames = { "WEAPON_STUNGUN" }
Config.FirearmWeaponNames = {
    "WEAPON_PISTOL", "WEAPON_COMBATPISTOL", "WEAPON_APPISTOL", "WEAPON_HEAVYPISTOL",
    "WEAPON_SMG", "WEAPON_CARBINERIFLE", "WEAPON_PUMPSHOTGUN",
}
Config.IgnoredWeaponNames = {
    "WEAPON_UNARMED", "WEAPON_FLASHLIGHT", "WEAPON_NIGHTSTICK",
}

-- Framework: c7fw | standalone (C7FW: https://docs.c7scripts.com/paid/c7fw )
Config.Framework = GetConvar('bodycam_framework', 'standalone')
