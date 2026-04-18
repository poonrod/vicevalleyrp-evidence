Config = {}

-- API (server-side only — never put secrets in client files)
Config.ApiBaseUrl = GetConvar('bodycam_api_base', 'http://127.0.0.1:4000')
Config.ApiSecret = GetConvar('bodycam_api_secret', '')

-- Resource folder name for requestScreenshotUpload (default matches citizenfx/screenshot-basic)
Config.ScreenshotResourceName = GetConvar('bodycam_screenshot_resource', 'screenshot-basic')

-- Toggle / input
Config.EnableToggleCommand = true
Config.ToggleCommandName = "bodycam"
Config.EnableKeybindToggle = true
Config.ToggleKeybindCommand = "+togglebodycam"
Config.ToggleKeybindDefault = "F10"
Config.ToggleKeybindDescription = "Toggle Body Camera"

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
Config.PreEventWindowSeconds = 30
Config.PreEventSnapshotIntervalSeconds = 5
Config.EnableMonitoringMode = true
Config.RequireEligibleJobForMonitoring = true
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
-- If true (and personal "first person capture" is on), briefly switches to first person only for each screenshot so footage matches a chest-mounted camera; then restores prior view mode.
Config.UseFirstPersonForSnapshots = true
Config.RestorePreviousCameraModeOnDisable = true

-- Video tiers (policy enforced server/API; client hints for UX)
-- When true, turning bodycam off records a short WebM (canvas + MediaRecorder in NUI) from
-- rapid screenshots, and periodic JPEG snapshots are disabled while this is true.
-- Target FPS: screenshot-basic latency usually caps real throughput below this; tune if stuttery.
Config.EnableClipMode = true
-- Minimum bodycam **session** length (seconds) before we request a clip upload at all (aligns with short-clip policy).
Config.ClipMinActiveSeconds = 5
-- Minimum **recorded WebM** length (seconds); clips shorter than this are discarded (NUI) and the player is notified.
Config.ClipMinUploadSeconds = 5
-- Clip FPS: lower = smaller files and less CPU; 20 is a good balance for VP9 + screenshot-basic latency.
Config.ClipRecordFps = 20
Config.ClipRecordFpsMax = 24
Config.ClipMaxFramesCap = 720
Config.ClipEstimatedMaxMB = 96
-- Hold first-person for the whole WebM clip (not per-frame). Turn off to record in your current camera mode.
Config.UseFirstPersonForClipRecording = true
-- If true, clip first-person also requires the personal "First-person capture" toggle in /bcamconfig.
Config.ClipFirstPersonRequiresSnapshotToggle = false
-- JPEG quality for clip frames (before VP9). Higher = sharper source frames, larger data URLs.
Config.ClipJpegQuality = 0.88
-- Mix the player's real microphone (browser getUserMedia) into the WebM when supported.
Config.EnableClipRecordingMicrophone = true
-- Clip audio source (see README "Game + voice chat audio"):
--   mic = microphone only (getUserMedia).
--   display = Windows monitor / "Entire screen" loopback via browser screen share (game + default output, incl. typical Mumble/pma-voice to headphones).
--   display_plus_mic = loopback + microphone mixed (recommended for officer radio + world).
-- display* modes call getDisplayMedia inside FiveM NUI; many client builds throw NotAllowedError/Invalid state (CEF).
-- Override without editing this file: server.cfg  setr bodycam_clip_audio_mode mic
Config.ClipAudioCaptureMode = "display_plus_mic"
local _clipAudioModeCv = GetConvar('bodycam_clip_audio_mode', '')
if type(_clipAudioModeCv) == 'string' and _clipAudioModeCv:gsub('%s+', '') ~= '' then
    Config.ClipAudioCaptureMode = _clipAudioModeCv:match('^%s*(.-)%s*$') or Config.ClipAudioCaptureMode
end
-- F8 console: run this command to open NUI and click "Allow monitor audio" once; choice is remembered (see README).
Config.BodycamClipAudioConsoleCommand = "bodycamclipaudio"
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
Config.EnableClipRecordingGameAudio = false
Config.EnableLongVideoMode = false
Config.ShortClipMaxSeconds = 30
Config.MediumClipMaxSeconds = 300
Config.LongVideoMaxSeconds = 1800
Config.MaxClipFileSizeMB = 100
-- 960x540 + VP9 at ~1.4 Mbps is readable and keeps WebMs small; raise bitrate if quality-first.
Config.ShortClipResolution = "960x540"
Config.ShortClipBitrateKbps = 1400
Config.MediumClipResolution = "1280x720"
Config.MediumClipBitrateKbps = 1500
Config.LongVideoResolution = "960x540"
Config.LongVideoBitrateKbps = 1000
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
