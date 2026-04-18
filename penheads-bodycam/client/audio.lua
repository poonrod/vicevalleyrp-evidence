NuiAudio = {}

function NuiAudio.Play(file)
    local rel = ('html/sounds/%s'):format(file)
    if LoadResourceFile(GetCurrentResourceName(), rel) then
        SendNUIMessage({
            type = 'play_sound',
            file = file,
            volume = Config.SoundVolume,
        })
    else
        local activating = (file == Config.ActivationSoundFile)
        PlaySoundFrontend(-1, activating and 'SELECT' or 'BACK', 'HUD_FRONTEND_DEFAULT_SOUNDSET', true)
    end
end
