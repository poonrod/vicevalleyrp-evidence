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
-- Lower FPS reduces NUI encoder load and stutter when screenshot-basic cannot keep up.
Config.ClipRecordFps = 24
Config.ClipRecordFpsMax = 30
Config.ClipMaxFramesCap = 720
Config.ClipEstimatedMaxMB = 96
-- Mix the player's real microphone (browser getUserMedia) into the WebM when supported.
-- This is the physical mic — not a tap of Mumble/VOIP or GTA world SFX (see README).
Config.EnableClipRecordingMicrophone = true
-- "voice" = echo/noise suppression (Discord-like). "ambient" = lighter processing so room/speaker
-- bleed is louder (still mic-only). True game audio needs a loopback device (VB-Audio / Stereo Mix) set as the default mic in Windows, or a custom native bridge.
Config.ClipMicrophoneProcessing = "voice"
-- Reserved: CEF/NUI cannot read GTA engine audio or Mumble output; keep false unless you add a custom native bridge.
Config.EnableClipRecordingGameAudio = false
Config.EnableLongVideoMode = false
Config.ShortClipMaxSeconds = 30
Config.MediumClipMaxSeconds = 300
Config.LongVideoMaxSeconds = 1800
Config.MaxClipFileSizeMB = 100
Config.ShortClipResolution = "1280x720"
Config.ShortClipBitrateKbps = 2000
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
