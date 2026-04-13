CaptureClient = {}

RegisterNetEvent('bodycam:client:presignedReady', function(data)
    if GetResourceState('screenshot-basic') ~= 'started' then
        Bodycam.Notify('~r~screenshot-basic not started')
        return
    end

    local ped = PlayerPedId()
    local coords = GetEntityCoords(ped)
    local heading = GetEntityHeading(ped)
    local street = GetStreetNameFromHashKey(GetStreetNameAtCoord(coords.x, coords.y, coords.z))

    exports['screenshot-basic']:requestScreenshotUpload(data.url, 'file', {
        encoding = 'jpg',
        headers = { ['Content-Type'] = 'image/jpeg' },
    }, function(err)
        if err then
            Bodycam.Notify('~r~Screenshot upload failed')
            return
        end
        local meta = data.meta or {}
        local payload = {
            officerDiscordId = data.discordId,
            storageKey = data.storageKey,
            evidenceId = data.evidenceId,
            incidentId = Bodycam.incidentId,
            caseNumber = meta.caseNumber,
            type = 'image',
            captureType = meta.captureType or 'manual_snapshot',
            officerName = data.officerName,
            officerBadgeNumber = data.officerBadgeNumber,
            officerDepartment = data.officerDepartment,
            officerCallsign = data.officerCallsign,
            playerServerId = GetPlayerServerId(PlayerId()),
            timestampUtc = Utils.NowIsoUtc(),
            fileName = meta.fileName or 'bodycam.jpg',
            mimeType = 'image/jpeg',
            fileSize = meta.fileSize or 400000,
            locationX = coords.x,
            locationY = coords.y,
            locationZ = coords.z,
            heading = heading,
            streetName = street,
            weaponName = meta.weaponName,
            activationSource = meta.activationSource,
            wasAutoActivated = meta.wasAutoActivated or false,
            autoActivationReason = meta.autoReason,
            preEventEvidenceAttached = meta.preEventAttached or false,
            sleepingModeAtCapture = Bodycam.sleeping,
            equippedStateAtCapture = EquipmentClient.IsEquipped(),
            soundPlayedOnActivation = Config.EnableBodycamSounds,
        }
        TriggerServerEvent('bodycam:server:completeUpload', payload)
    end)
end)

function CaptureClient.TakeSnapshot(captureType, weaponName, preEvent)
    if not Bodycam.active and captureType ~= 'auto_taser' and captureType ~= 'auto_firearm' then
        return
    end
    local act = 'manual_command'
    if captureType == 'auto_taser' or captureType == 'auto_taser_pre_event' then
        act = 'auto_taser'
    elseif captureType == 'auto_firearm' or captureType == 'auto_firearm_pre_event' then
        act = 'auto_firearm'
    elseif captureType == 'periodic_snapshot' then
        act = 'manual_command'
    end
    local meta = {
        fileName = 'bodycam.jpg',
        mimeType = 'image/jpeg',
        fileSize = 600000,
        captureType = captureType,
        weaponName = weaponName,
        wasAutoActivated = captureType:find('auto') ~= nil,
        autoReason = captureType,
        preEventAttached = preEvent ~= nil,
        activationSource = act,
    }
    TriggerServerEvent('bodycam:server:requestUpload', meta)
end

RegisterCommand(Config.ToggleCommandName, function()
    if not Config.EnableToggleCommand then return end
    Bodycam.ToggleManual()
end, false)

RegisterCommand('bcamsnap', function()
    if not Bodycam.active then
        Bodycam.Notify('~r~Bodycam not active')
        return
    end
    CaptureClient.TakeSnapshot('manual_snapshot', nil, nil)
end, false)

CreateThread(function()
    while true do
        Wait(15000)
        if Bodycam.active and not Bodycam.sleeping then
            CaptureClient.TakeSnapshot('periodic_snapshot', nil, nil)
        end
    end
end)
