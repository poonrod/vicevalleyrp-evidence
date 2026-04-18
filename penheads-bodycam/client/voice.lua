-- MVP: hooks for future voice metadata (no audio recording)
VoiceMeta = {}

function VoiceMeta.NearbyTalking()
    if not Config.EnableVoiceActivityMetadata then return false end
    -- Placeholder: integrate with pma-voice / mumble if present
    return false
end
