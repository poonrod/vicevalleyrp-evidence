CaptureClient = {}

--- screenshot-basic's NUI always uses POST + multipart FormData, which does not match
--- S3/R2 presigned PutObject URLs (PUT + raw body). We capture with its export, then PUT from our NUI.
local pendingPresigned = {}
local presignedCorrelation = 0

local function parseClipTargetSize()
    local s = tostring(Config.ShortClipResolution or '1280x720')
    local w, h = string.match(s, '(%d+)x(%d+)')
    w, h = tonumber(w), tonumber(h)
    if not w or not h or w < 320 or h < 180 then
        return 1280, 720
    end
    return math.floor(w), math.floor(h)
end

local function completeAfterPut(cid, body)
    local pending = pendingPresigned[cid]
    if not pending then return end
    if pending.clipMode then return end
    pendingPresigned[cid] = nil

    if body.ok ~= true then
        local err = body.err or 'unknown'
        print(('[bodycam] presigned PUT failed: %s'):format(tostring(err)))
        if GetConvar('bodycam_upload_debug', '0') == '1' then
            print(('[bodycam][upload_debug] PUT result: %s'):format(json.encode(body):sub(1, 800)))
        end
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
    CameraClient.EndClipSessionFirstPerson()
    local pending = pendingPresigned[cid]
    if not pending or not pending.clipMode then return end
    pendingPresigned[cid] = nil
    Bodycam.clipRecording = false

    if body.ok ~= true then
        local err = body.err or 'unknown'
        print(('[bodycam] clip PUT failed: %s'):format(tostring(err)))
        if GetConvar('bodycam_upload_debug', '0') == '1' then
            print(('[bodycam][upload_debug] clip PUT result: %s'):format(json.encode(body):sub(1, 800)))
        end
        if type(err) == 'string' and err:find('CLIP_TOO_SHORT', 1, true) then
            Bodycam.Notify('~o~Clip not saved: shorter than ' .. tostring(Config.ClipMinUploadSeconds or 5) .. ' seconds')
        else
            Bodycam.Notify('~r~Clip upload failed')
        end
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
        codec = 'vp9',
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

local function captureClipFrame(i, maxFrames, cid, data, wantFp, gap, shotRes, clipHoldFp)
    local jpgQ = tonumber(Config.ClipJpegQuality) or 0.88
    jpgQ = math.max(0.55, math.min(0.98, jpgQ))
    if wantFp and not clipHoldFp then
        CameraClient.BeginSnapshotFirstPerson()
    end
    exports[shotRes]:requestScreenshot({
        encoding = 'jpg',
        quality = jpgQ,
    }, function(dataUrl)
        if wantFp and not clipHoldFp then
            CameraClient.EndSnapshotFirstPerson()
        end
        if type(dataUrl) ~= 'string' or not dataUrl:find('^data:', 1, false) then
            if clipHoldFp then
                CameraClient.EndClipSessionFirstPerson()
            end
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
            if clipHoldFp then
                CameraClient.EndClipSessionFirstPerson()
            end
            Citizen.SetTimeout(520, function()
                SendNUIMessage({ type = 'bodycam_clip_end', correlation = cid })
            end)
        else
            Citizen.SetTimeout(gap, function()
                captureClipFrame(i + 1, maxFrames, cid, data, wantFp, gap, shotRes, clipHoldFp)
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

    -- Hold first-person for the whole clip (BeginClip… / EndClip…) when enabled — no per-frame toggle.
    local wantClipHoldFp = Config.UseFirstPersonForClipRecording ~= false
    if Config.ClipFirstPersonRequiresSnapshotToggle then
        wantClipHoldFp = wantClipHoldFp and Bodycam.personal.firstPerson
    end
    local includeMic = Config.EnableClipRecordingMicrophone ~= false

    local iso = Utils.NowIsoUtc()
    local wmTime = (iso:gsub('T', ' T'))
    local sid = GetPlayerServerId(PlayerId())
    local wmNum = (sid * 7919 + (tonumber(cid) or 0) * 503) % 10000000
    local wmLine2 = ('AXON BODY WF x%07d'):format(wmNum)

    local clipW, clipH = parseClipTargetSize()
    local clipKbps = math.floor(tonumber(Config.ShortClipBitrateKbps) or 2000)
    if clipKbps < 400 then clipKbps = 400 end
    if clipKbps > 12000 then clipKbps = 12000 end

    local capMode = tostring(Config.ClipAudioCaptureMode or 'mic'):lower()
    if capMode ~= 'display' and capMode ~= 'display_plus_mic' and capMode ~= 'mic' then
        capMode = 'mic'
    end

    SendNUIMessage({
        type = 'bodycam_clip_begin',
        correlation = cid,
        url = data.url,
        fps = fps,
        maxFrames = maxFrames,
        includeMic = includeMic,
        watermarkTime = wmTime,
        watermarkLine2 = wmLine2,
        minUploadSeconds = tonumber(Config.ClipMinUploadSeconds) or 5,
        clipVideoBitrateKbps = clipKbps,
        clipMaxWidth = clipW,
        clipMaxHeight = clipH,
        clipMicProcessing = (Config.ClipMicrophoneProcessing == 'ambient') and 'ambient' or 'voice',
        clipAudioCaptureMode = capMode,
    })

    Citizen.SetTimeout(80, function()
        if wantClipHoldFp then
            CameraClient.BeginClipSessionFirstPerson()
        end
        captureClipFrame(0, maxFrames, cid, data, false, gap, shotRes, wantClipHoldFp)
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
    local capSec = math.min(Config.ShortClipMaxSeconds or 15, math.max(5, math.floor(sessionDurMs / 1000)))
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

RegisterNUICallback('bodycam_mic_warmup_result', function(body, cb)
    cb({})
    if type(body) ~= 'table' then return end
    if body.ok == true then
        print('^2[bodycam] Microphone allowed — clip audio will be recorded when supported.^7')
        return
    end
    print('^3[bodycam] Microphone not available: ' .. tostring(body.err or 'denied') .. '^7')
    print('^3[bodycam] Open the bodycam NUI (F1 pause menu / settings) and allow the browser microphone prompt if you want audio on clips.^7')
end)

RegisterNUICallback('bodycam_display_audio_result', function(body, cb)
    cb({})
    if type(body) ~= 'table' then return end
    if body.ok == true then
        Bodycam.Notify('~g~Bodycam: system/monitor audio capture ready for clips')
        return
    end
    local err = tostring(body.err or 'denied')
    Bodycam.Notify('~o~Bodycam: system audio not granted — ' .. err)
    local el = err:lower()
    -- Do not treat every NotAllowedError as CEF: "Permission denied" is often user dismissed / blocked the picker.
    if el:find('invalid state', 1, true) then
        print('^3[bodycam] getDisplayMedia failed with Invalid state after the dialog — common FiveM NUI/CEF bug. Reliable workaround: set Config.ClipAudioCaptureMode to ^"mic^" in penheads-bodycam/config.lua, or server.cfg: setr bodycam_clip_audio_mode mic^7')
    elseif el:find('no_system_audio_track', 1, true) then
        print('^3[bodycam] Share ran but no audio track. In the picker choose the monitor running GTA and enable Share audio (Windows). Or use setr bodycam_clip_audio_mode mic for mic-only clips.^7')
    elseif el:find('getdisplaymedia_unavailable', 1, true) then
        print('^3[bodycam] getDisplayMedia is unavailable in this client. Use setr bodycam_clip_audio_mode mic.^7')
    elseif el:find('notallowederror', 1, true) and el:find('permission denied', 1, true) then
        print('^3[bodycam] Screen capture was denied or canceled. Try again: Allow, pick the game monitor, enable Share audio. If it still fails, use setr bodycam_clip_audio_mode mic.^7')
    elseif el:find('notallowederror', 1, true) then
        print('^3[bodycam] Display capture failed (^7' .. err .. '^3). Retry bodycamclipaudio with monitor + Share audio, or use setr bodycam_clip_audio_mode mic.^7')
    end
end)

RegisterNUICallback('bodycam_clip_audio_fallback', function(body, cb)
    cb({})
    if type(body) ~= 'table' then return end
    if GetConvar('bodycam_debug', '0') == '1' then
        print(('[bodycam] clip audio fallback: %s'):format(json.encode(body)))
    end
    Bodycam.Notify('~o~Clip: no system loopback — saving microphone audio only')
end)

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
