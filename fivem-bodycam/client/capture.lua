CaptureClient = {}

--- screenshot-basic's NUI always uses POST + multipart FormData, which does not match
--- S3/R2 presigned PutObject URLs (PUT + raw body). We capture with its export, then PUT from our NUI.
local pendingPresigned = {}
local presignedCorrelation = 0

local function completeAfterPut(cid, body)
    local pending = pendingPresigned[cid]
    if not pending then return end
    if pending.clipMode then return end
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

local function completeAfterClipPut(cid, body)
    local pending = pendingPresigned[cid]
    if not pending or not pending.clipMode then return end
    pendingPresigned[cid] = nil
    Bodycam.clipRecording = false

    if body.ok ~= true then
        local err = body.err or 'unknown'
        print(('[bodycam] clip PUT failed: %s'):format(tostring(err)))
        Bodycam.Notify('~r~Clip upload failed')
        return
    end

    local d = pending.data
    local coords = pending.coords
    local heading = pending.heading
    local street = pending.street
    local meta = d.meta or {}
    local fileSize = tonumber(body.fileSize) or 1
    local durationSeconds = tonumber(body.durationSeconds)

    local payload = {
        officerDiscordId = d.discordId,
        storageKey = d.storageKey,
        evidenceId = d.evidenceId,
        incidentId = Bodycam.incidentId,
        caseNumber = meta.caseNumber,
        type = 'video',
        captureType = 'bodycam_clip_stop',
        videoTier = 'short',
        officerName = d.officerName,
        officerBadgeNumber = d.officerBadgeNumber,
        officerDepartment = d.officerDepartment,
        officerCallsign = d.officerCallsign,
        playerServerId = GetPlayerServerId(PlayerId()),
        timestampUtc = Utils.NowIsoUtc(),
        fileName = meta.fileName or 'bodycam_clip.webm',
        mimeType = 'video/webm',
        fileSize = fileSize,
        durationSeconds = durationSeconds,
        codec = 'vp8',
        locationX = coords.x,
        locationY = coords.y,
        locationZ = coords.z,
        heading = heading,
        streetName = street,
        activationSource = 'manual_command',
        wasAutoActivated = false,
        preEventEvidenceAttached = false,
        sleepingModeAtCapture = Bodycam.sleeping,
        equippedStateAtCapture = EquipmentClient.IsEquipped(),
        soundPlayedOnActivation = Config.EnableBodycamSounds,
    }
    TriggerServerEvent('bodycam:server:completeUpload', payload)
end

RegisterNUICallback('bodycam_clip_put_done', function(body, cb)
    cb({})
    if type(body) ~= 'table' then return end
    local cid = body.correlation
    if type(cid) ~= 'string' and type(cid) ~= 'number' then return end
    completeAfterClipPut(tostring(cid), body)
end)

local function captureClipFrame(i, maxFrames, cid, data, wantFp, gap, shotRes)
    if wantFp then
        CameraClient.BeginSnapshotFirstPerson()
    end
    exports[shotRes]:requestScreenshot({
        encoding = 'jpg',
        quality = 0.85,
    }, function(dataUrl)
        if wantFp then
            CameraClient.EndSnapshotFirstPerson()
        end
        if type(dataUrl) ~= 'string' or not dataUrl:find('^data:', 1, false) then
            pendingPresigned[cid] = nil
            Bodycam.clipRecording = false
            SendNUIMessage({ type = 'bodycam_clip_abort', correlation = cid })
            Bodycam.Notify('~r~Clip capture failed')
            return
        end
        SendNUIMessage({
            type = 'bodycam_clip_frame',
            correlation = cid,
            index = i,
            dataUrl = dataUrl,
        })
        if i >= maxFrames - 1 then
            Citizen.SetTimeout(280, function()
                SendNUIMessage({ type = 'bodycam_clip_end', correlation = cid })
            end)
        else
            Citizen.SetTimeout(gap, function()
                captureClipFrame(i + 1, maxFrames, cid, data, wantFp, gap, shotRes)
            end)
        end
    end)
end

local function startWebmClipFromPresign(data)
    local shotRes = Config.ScreenshotResourceName or 'screenshot-basic'
    local ped = PlayerPedId()
    local coords = GetEntityCoords(ped)
    local heading = GetEntityHeading(ped)
    local street = GetStreetNameFromHashKey(GetStreetNameAtCoord(coords.x, coords.y, coords.z))

    presignedCorrelation = presignedCorrelation + 1
    local cid = tostring(presignedCorrelation)

    local fpsMax = math.max(1, math.floor(tonumber(Config.ClipRecordFpsMax) or 30))
    local requested = math.floor(tonumber(data.clipFps) or tonumber(Config.ClipRecordFps) or 30)
    local fps = math.max(1, math.min(fpsMax, requested))
    local sec = math.max(3, math.min(tonumber(data.clipSeconds) or 12, Config.ShortClipMaxSeconds or 30))
    local cap = math.max(60, math.floor(tonumber(Config.ClipMaxFramesCap) or 720))
    local maxFrames = math.min(cap, math.ceil(sec * fps))
    local gap = math.max(16, math.floor(1000 / fps))

    pendingPresigned[cid] = {
        clipMode = true,
        data = data,
        coords = coords,
        heading = heading,
        street = street,
    }
    Bodycam.clipRecording = true

    local wantFp = Config.UseFirstPersonForSnapshots and Bodycam.personal.firstPerson
    local includeMic = Config.EnableClipRecordingMicrophone ~= false

    SendNUIMessage({
        type = 'bodycam_clip_begin',
        correlation = cid,
        url = data.url,
        fps = fps,
        maxFrames = maxFrames,
        includeMic = includeMic,
    })

    Citizen.SetTimeout(80, function()
        captureClipFrame(0, maxFrames, cid, data, wantFp, gap, shotRes)
    end)
end

RegisterNetEvent('bodycam:client:presignedReady', function(data)
    local shotRes = Config.ScreenshotResourceName or 'screenshot-basic'
    if GetResourceState(shotRes) ~= 'started' then
        Bodycam.Notify('~r~' .. shotRes .. ' not started')
        return
    end

    if data.clipRecord then
        startWebmClipFromPresign(data)
        return
    end

    local ped = PlayerPedId()
    local coords = GetEntityCoords(ped)
    local heading = GetEntityHeading(ped)
    local street = GetStreetNameFromHashKey(GetStreetNameAtCoord(coords.x, coords.y, coords.z))

    presignedCorrelation = presignedCorrelation + 1
    local cid = tostring(presignedCorrelation)

    pendingPresigned[cid] = {
        clipMode = false,
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

function CaptureClient.TryFinalizeWebmClip(sessionDurMs)
    if Bodycam.clipRecording then return end
    local capSec = math.min(Config.ShortClipMaxSeconds or 15, math.max(3, math.floor(sessionDurMs / 1000)))
    TriggerServerEvent('bodycam:server:requestUpload', {
        fileName = 'bodycam_clip.webm',
        mimeType = 'video/webm',
        fileSize = math.floor((Config.ClipEstimatedMaxMB or 40) * 1024 * 1024),
        captureType = 'bodycam_clip_stop',
        videoTier = 'short',
        clipMaxSeconds = capSec,
        clipRecordFps = Config.ClipRecordFps or 30,
    })
end

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
        if not Config.EnableClipMode and Bodycam.active and not Bodycam.sleeping then
            CaptureClient.TakeSnapshot('periodic_snapshot', nil, nil)
        end
    end
end)
