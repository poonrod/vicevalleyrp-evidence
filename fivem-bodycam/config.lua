Config = {}

-- API (server-side only — never put secrets in client files)
Config.ApiBaseUrl = GetConvar('bodycam_api_base', 'http://127.0.0.1:4000')
Config.ApiSecret = GetConvar('bodycam_api_secret', '')

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
Config.ForceFirstPersonWhileBodycamActive = true
Config.RestorePreviousCameraModeOnDisable = true

-- Video tiers (policy enforced server/API; client hints for UX)
Config.EnableClipMode = false
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

-- Framework: qbcore | esx | standalone
Config.Framework = GetConvar('bodycam_framework', 'standalone')
