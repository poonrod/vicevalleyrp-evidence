CaptureClient = {}

--- screenshot-basic's NUI always uses POST + multipart FormData, which does not match
--- S3/R2 presigned PutObject URLs (PUT + raw body). We capture with its export, then PUT from our NUI.
local pendingPresigned = {}
local presignedCorrelation = 0

local function completeAfterPut(cid, body)
    local pending = pendingPresigned[cid]
    if not pending then return end
    pendingPresigned[cid] = nil

    if body.ok ~= true then
        local err = body.err or 'unknown'
        print(('[bodycam] presigned PUT failed: %s'):format(tostring(err)))
        if type(err) == 'string' and #err > 0 then
            Bodycam.Notify('~r~Upload failed: ' .. err:sub(1, 100))
        else
            Bodycam.Notify('~r~Screenshot upload failed')
        end
        return
    end

    local data = pending.data
    local coords = pending.coords
    local heading = pending.heading
    local street = pending.street
    local meta = data.meta or {}
    local fileSize = tonumber(body.fileSize) or meta.fileSize or 400000

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
        fileSize = fileSize,
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
end

RegisterNUICallback('bodycam_put_done', function(body, cb)
    cb({})
    if type(body) ~= 'table' then return end
    local cid = body.correlation
    if type(cid) ~= 'string' and type(cid) ~= 'number' then return end
    completeAfterPut(tostring(cid), body)
end)

RegisterNetEvent('bodycam:client:presignedReady', function(data)
    local shotRes = Config.ScreenshotResourceName or 'screenshot-basic'
    if GetResourceState(shotRes) ~= 'started' then
        Bodycam.Notify('~r~' .. shotRes .. ' not started')
        return
    end

    local ped = PlayerPedId()
    local coords = GetEntityCoords(ped)
    local heading = GetEntityHeading(ped)
    local street = GetStreetNameFromHashKey(GetStreetNameAtCoord(coords.x, coords.y, coords.z))

    presignedCorrelation = presignedCorrelation + 1
    local cid = tostring(presignedCorrelation)

    pendingPresigned[cid] = {
        data = data,
        coords = coords,
        heading = heading,
        street = street,
    }

    -- Brief first-person only for the frame grab (screenshot-basic captures the game view).
    -- Personal toggle: /bcamconfig "first-person capture"; gameplay can stay third-person while bodycam is on.
    local wantFpAngle = Config.UseFirstPersonForSnapshots and Bodycam.personal.firstPerson
    if wantFpAngle then
        CameraClient.BeginSnapshotFirstPerson()
    end

    exports[shotRes]:requestScreenshot({
        encoding = 'jpg',
        quality = 0.92,
    }, function(dataUrl)
        if wantFpAngle then
            CameraClient.EndSnapshotFirstPerson()
        end
        if type(dataUrl) ~= 'string' or not dataUrl:find('^data:', 1, false) then
            pendingPresigned[cid] = nil
            Bodycam.Notify('~r~Screenshot capture failed')
            return
        end
        SendNUIMessage({
            type = 'bodycam_presigned_put',
            correlation = cid,
            url = data.url,
            contentType = 'image/jpeg',
            dataUrl = dataUrl,
        })
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
