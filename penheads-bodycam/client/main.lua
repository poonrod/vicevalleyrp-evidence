Bodycam = Bodycam or {}
Bodycam.active = false
Bodycam.autoLockUntil = 0
Bodycam.lastAutoAt = 0
Bodycam.incidentId = nil
Bodycam.sleeping = false
Bodycam.sessionStartMs = nil
Bodycam.clipRecording = false
--- NUI-only combined mic + desktop (getDisplayMedia) session; Lua never sees PCM.
Bodycam.combinedAudioRecording = false
--- Shown once per session when clip audio uses display* (see Config.ClipDisplayAudioSetupHint).
Bodycam.displayAudioHintShown = false
Bodycam.personal = {
    autoTaser = true,
    autoFirearm = true,
    sound = true,
    firstPerson = true,
    lowStorage = false,
}

local function canUseBodycam()
    if not PermissionsClient.IsAllowed() then return false end
    if not EquipmentClient.IsEquipped() then return false end
    return true
end

function Bodycam.SetActive(on, sourceKind)
    if on and not canUseBodycam() then
        if Config.NotifyIfMissingBodycamProp then
            Bodycam.Notify('~r~Bodycam unavailable (job/equipment)')
        end
        return
    end
    if on and Bodycam.sleeping and not Config.AllowManualActivationWhileSleeping then
        Bodycam.Notify('~r~Sleeping mode blocks manual activation')
        return
    end

    local was = Bodycam.active
    local sessionStart = Bodycam.sessionStartMs
    Bodycam.active = on
    if on and (sourceKind == 'auto_taser' or sourceKind == 'auto_firearm') then
        Bodycam.autoLockUntil = GetGameTimer() + (Config.AutoTriggerMinimumActiveSeconds * 1000)
    end

    local cap = tostring(Config.ClipAudioCaptureMode or 'mic'):lower()
    if cap ~= 'display' and cap ~= 'display_plus_mic' then
        cap = 'mic'
    end
    SendNUIMessage({
        type = 'bodycam_state',
        active = on,
        sleeping = Bodycam.sleeping,
        auto = sourceKind and sourceKind:find('auto') ~= nil,
        clipAudioCaptureMode = cap,
        clipAudioWantDisplay = on and Config.EnableClipMode and (cap == 'display' or cap == 'display_plus_mic'),
    })

    if on and Config.EnableClipMode and Config.EnableClipRecordingMicrophone ~= false and Config.ClipMicrophoneWarmupOnActivate then
        SendNUIMessage({
            type = 'bodycam_mic_warmup',
            clipMicProcessing = (Config.ClipMicrophoneProcessing == 'ambient') and 'ambient' or 'voice',
            clipMicrophoneDeviceId = type(Config.ClipMicrophoneDeviceId) == 'string' and Config.ClipMicrophoneDeviceId or '',
        })
    end

    if Config.EnableBodycamSounds and Bodycam.personal.sound then
        if on and (sourceKind ~= 'auto' or Config.PlaySoundOnAutoActivation) then
            NuiAudio.Play(Config.ActivationSoundFile)
        elseif not on and was then
            NuiAudio.Play(Config.DeactivationSoundFile)
        end
    end

    CameraClient.Apply(on)

    if on then
        Bodycam.sessionStartMs = GetGameTimer()
        if Config.EnableClipMode and Config.EnableClipPreRoll then
            SendNUIMessage({ type = 'bodycam_preroll_freeze' })
        end
        TriggerServerEvent('bodycam:server:getOrCreateIncident')
        if Config.EnableClipMode
            and Config.ClipDisplayAudioSetupHint ~= false
            and (cap == 'display' or cap == 'display_plus_mic')
            and not Bodycam.displayAudioHintShown
        then
            Bodycam.displayAudioHintShown = true
            local acmd = tostring(Config.BodycamClipAudioConsoleCommand or 'bodycamclipaudio'):match('^%s*(.-)%s*$') or 'bodycamclipaudio'
            Bodycam.Notify(
                ('~b~Game/headphone audio:~w~ F8 ~y~%s~w~ — GTA monitor + ~y~Share audio~w~, Allow (once per PC).'):format(acmd)
            )
        end
    elseif was and Config.EnableClipMode and sessionStart and not Bodycam.clipRecording then
        local sessionDurMs = GetGameTimer() - sessionStart
        Bodycam.sessionStartMs = nil
        local minMs = (Config.ClipMinActiveSeconds or 4) * 1000
        if sessionDurMs >= minMs then
            CreateThread(function()
                CaptureClient.TryFinalizeWebmClip(sessionDurMs)
            end)
        end
    elseif was
        and not on
        and sessionStart
        and not Bodycam.clipRecording
        and sourceKind == 'manual_off'
        and not Config.EnableClipMode
        and Config.StartCombinedAudioAfterManualBodycamOffWhenNoClip
    then
        local sessionDurMs = GetGameTimer() - sessionStart
        Bodycam.sessionStartMs = nil
        local minMs = (Config.ClipMinActiveSeconds or 4) * 1000
        if sessionDurMs >= minMs then
            CreateThread(function()
                Wait(400)
                CaptureClient.TryStartCombinedAudioRecord(nil)
            end)
        end
    elseif not on then
        Bodycam.sessionStartMs = nil
    end
end

function Bodycam.Notify(msg)
    BeginTextCommandThefeedPost('STRING')
    AddTextComponentSubstringPlayerName(msg)
    EndTextCommandThefeedPostTicker(false, false)
end

function Bodycam.ToggleManual()
    if not canUseBodycam() then return end
    if Bodycam.active and GetGameTimer() < Bodycam.autoLockUntil then
        Bodycam.Notify('~o~Auto-activation lock active')
        return
    end
    Bodycam.SetActive(not Bodycam.active, Bodycam.active and 'manual_off' or 'manual_on')
end

RegisterNetEvent('bodycam:client:incidentId', function(id)
    Bodycam.incidentId = id
    SendNUIMessage({ type = 'incident', id = id })
end)

RegisterNetEvent('bodycam:client:notify', function(msg)
    Bodycam.Notify(msg)
end)

RegisterNetEvent('bodycam:client:timeSync', function(unixSeconds)
    Utils.ApplyServerTimeSync(unixSeconds)
end)

AddEventHandler('onClientResourceStart', function(resourceName)
    if resourceName ~= GetCurrentResourceName() then return end
    TriggerServerEvent('bodycam:server:requestTimeSync')
end)

CreateThread(function()
    while true do
        if Bodycam.active and Config.AutoDisableIfNoLongerEquipped and not EquipmentClient.IsEquipped() then
            Bodycam.SetActive(false, 'equipment_invalidated')
            Bodycam.Notify('~r~Bodycam off (equipment)')
        end
        Wait(2000)
    end
end)
