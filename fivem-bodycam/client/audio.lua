NuiAudio = {}

function NuiAudio.Play(file)
    SendNUIMessage({
        type = 'play_sound',
        file = file,
        volume = Config.SoundVolume,
    })
end
