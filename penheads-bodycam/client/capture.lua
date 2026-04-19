CaptureClient = {}

--[[
  FiveM Lua cannot access the master game audio mixer, Mumble PCM, or per-player voice streams.
  Combined mic + "what you hear" (game SFX + positional voice on your speakers) is captured only in NUI
  via getUserMedia + getDisplayMedia, merged with Web Audio, encoded by MediaRecorder — same class as WebM clips.
]]

--- Video evidence: WebM from NUI (frames via screenshot-basic `requestScreenshot` + PUT). No standalone JPEG uploads.
local pendingPresigned = {}
local presignedCorrelation = 0

local function canStartCombinedAudioRecord()
    if not PermissionsClient.IsAllowed() then return false end
    if not EquipmentClient.IsEquipped() then return false end
    return true
end

local function parseClipTargetSize()
    local s = tostring(Config.ShortClipResolution or '1280x720')
    local w, h = string.match(s, '(%d+)x(%d+)')
    w, h = tonumber(w), tonumber(h)
    if not w or not h or w < 320 or h < 180 then
        return 1280, 720
    end
    return math.floor(w), math.floor(h)
end

local function completeAfterClipPut(cid, body)
    CameraClient.EndSnapshotFirstPerson()
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

local function completeAfterCombinedAudioPut(cid, body)
    local pending = pendingPresigned[cid]
    if not pending or not pending.combinedAudioMode then return end
    local d = pending.data
    local coords = pending.coords
    local heading = pending.heading
    local street = pending.street
    pendingPresigned[cid] = nil
    Bodycam.combinedAudioRecording = false
    SetNuiFocus(false, false)

    if body.ok ~= true then
        local err = body.err or 'unknown'
        print(('[bodycam] combined audio PUT failed: %s'):format(tostring(err)))
        if type(err) == 'string' and #err > 0 then
            Bodycam.Notify('~r~Combined audio: ' .. err:sub(1, 120))
        else
            Bodycam.Notify('~r~Combined audio upload failed')
        end
        return
    end
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
        captureType = 'bodycam_combined_audio_record',
        videoTier = 'short',
        officerName = d.officerName,
        officerBadgeNumber = d.officerBadgeNumber,
        officerDepartment = d.officerDepartment,
        officerCallsign = d.officerCallsign,
        playerServerId = GetPlayerServerId(PlayerId()),
        timestampUtc = Utils.NowIsoUtc(),
        fileName = meta.fileName or 'bodycam_combined.webm',
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

RegisterNUICallback('bodycam_combined_audio_put_done', function(body, cb)
    cb({})
    if type(body) ~= 'table' then return end
    local cid = body.correlation
    if type(cid) ~= 'string' and type(cid) ~= 'number' then return end
    completeAfterCombinedAudioPut(tostring(cid), body)
end)

RegisterNUICallback('bodycam_combined_audio_cancel', function(_, cb)
    cb({})
    SetNuiFocus(false, false)
    Bodycam.combinedAudioRecording = false
    for k, v in pairs(pendingPresigned) do
        if type(v) == 'table' and v.combinedAudioMode then
            pendingPresigned[k] = nil
        end
    end
    Bodycam.Notify('~o~Combined audio capture canceled')
end)

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

local function startCombinedAudioRecordFromPresign(data)
    if Bodycam.clipRecording then
        Bodycam.Notify('~r~Bodycam video clip in progress')
        return
    end
    if Bodycam.combinedAudioRecording then
        Bodycam.Notify('~r~Combined audio already active')
        return
    end

    local ped = PlayerPedId()
    local coords = GetEntityCoords(ped)
    local heading = GetEntityHeading(ped)
    local street = GetStreetNameFromHashKey(GetStreetNameAtCoord(coords.x, coords.y, coords.z))

    presignedCorrelation = presignedCorrelation + 1
    local cid = tostring(presignedCorrelation)
    local sec = math.floor(tonumber(data.combinedAudioSeconds) or 30)
    local maxSec = tonumber(Config.CombinedAudioMaxSeconds) or 90
    sec = math.max(5, math.min(sec, maxSec))

    pendingPresigned[cid] = {
        combinedAudioMode = true,
        data = data,
        coords = coords,
        heading = heading,
        street = street,
    }
    Bodycam.combinedAudioRecording = true
    SetNuiFocus(true, true)
    SendNUIMessage({
        type = 'bodycam_combined_audio_begin',
        correlation = cid,
        url = data.url,
        seconds = sec,
        clipMicProcessing = (Config.ClipMicrophoneProcessing == 'ambient') and 'ambient' or 'voice',
        clipMicrophoneDeviceId = type(Config.ClipMicrophoneDeviceId) == 'string' and Config.ClipMicrophoneDeviceId or '',
    })
end

local function startWebmClipFromPresign(data)
    if Bodycam.combinedAudioRecording then
        Bodycam.Notify('~r~Combined audio capture in progress')
        return
    end
    local shotRes = Config.ScreenshotResourceName or 'screenshot-basic'
    local ped = PlayerPedId()
    local coords = GetEntityCoords(ped)
    local heading = GetEntityHeading(ped)
    local street = GetStreetNameFromHashKey(GetStreetNameAtCoord(coords.x, coords.y, coords.z))

    presignedCorrelation = presignedCorrelation + 1
    local cid = tostring(presignedCorrelation)

    local tier = 'short'
    if type(data.meta) == 'table' and data.meta.videoTier then
        tier = tostring(data.meta.videoTier):lower()
    end
    local tierFpsMax = Config.ClipRecordFpsMax
    if tier == 'medium' then
        tierFpsMax = Config.MediumClipRecordFps or Config.ClipRecordFpsMax
    elseif tier == 'long' then
        tierFpsMax = Config.LongVideoRecordFps or Config.ClipRecordFpsMax
    else
        tierFpsMax = Config.ShortClipRecordFps or Config.ClipRecordFpsMax
    end
    local fpsMax = math.max(1, math.floor(tonumber(tierFpsMax) or tonumber(Config.ClipRecordFpsMax) or 30))
    local tierDefault = tonumber(Config.ShortClipRecordFps) or tonumber(Config.ClipRecordFps) or 30
    if tier == 'medium' then
        tierDefault = tonumber(Config.MediumClipRecordFps) or tierDefault
    elseif tier == 'long' then
        tierDefault = tonumber(Config.LongVideoRecordFps) or tierDefault
    end
    local requested = math.floor(tonumber(data.clipFps) or tierDefault)
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

    -- First-person **footage**: UseFirstPersonForClipRecording. Player POV: only "hold" mode keeps them
    -- in FP the whole time; default is per-frame FP (brief switch per screenshot) so view restores between frames.
    local clipWantsFirstPerson = Config.UseFirstPersonForClipRecording ~= false
    if Config.ClipFirstPersonRequiresSnapshotToggle then
        clipWantsFirstPerson = clipWantsFirstPerson and Bodycam.personal.firstPerson
    end
    local wantClipHoldFp = clipWantsFirstPerson and (Config.ClipFirstPersonHoldWhileRecording == true)
    local wantFpPerFrame = clipWantsFirstPerson and not wantClipHoldFp
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
        clipMicrophoneDeviceId = type(Config.ClipMicrophoneDeviceId) == 'string' and Config.ClipMicrophoneDeviceId or '',
    })

    Citizen.SetTimeout(80, function()
        if wantClipHoldFp then
            CameraClient.BeginClipSessionFirstPerson()
        end
        captureClipFrame(0, maxFrames, cid, data, wantFpPerFrame, gap, shotRes, wantClipHoldFp)
    end)
end

RegisterNetEvent('bodycam:client:presignedReady', function(data)
    if data.combinedAudioRecord then
        startCombinedAudioRecordFromPresign(data)
        return
    end

    local shotRes = Config.ScreenshotResourceName or 'screenshot-basic'
    if GetResourceState(shotRes) ~= 'started' then
        Bodycam.Notify('~r~' .. shotRes .. ' not started')
        return
    end

    if data.clipRecord then
        startWebmClipFromPresign(data)
        return
    end

    Bodycam.Notify('~r~This resource only saves video (WebM). Enable clip mode or use bodycam off to record.')
end)

function CaptureClient.TryFinalizeWebmClip(sessionDurMs)
    if Bodycam.combinedAudioRecording then return end
    if Bodycam.clipRecording then return end
    local capSec = math.min(Config.ShortClipMaxSeconds or 15, math.max(5, math.floor(sessionDurMs / 1000)))
    TriggerServerEvent('bodycam:server:requestUpload', {
        fileName = 'bodycam_clip.webm',
        mimeType = 'video/webm',
        fileSize = math.floor((Config.ClipEstimatedMaxMB or 40) * 1024 * 1024),
        captureType = 'bodycam_clip_stop',
        videoTier = 'short',
        clipMaxSeconds = capSec,
        clipRecordFps = tonumber(Config.ShortClipRecordFps) or tonumber(Config.ClipRecordFps) or 30,
    })
end

RegisterCommand(Config.ToggleCommandName, function()
    if not Config.EnableToggleCommand then return end
    Bodycam.ToggleManual()
end, false)

RegisterNUICallback('bodycam_mic_warmup_result', function(body, cb)
    cb({})
    if type(body) ~= 'table' then return end
    if body.ok == true then
        print('^2[bodycam] Microphone allowed - clip audio will be recorded when supported.^7')
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
    Bodycam.Notify('~o~Bodycam: system audio not granted - ' .. err)
    local el = err:lower()
    -- Do not treat every NotAllowedError as CEF: "Permission denied" is often user dismissed / blocked the picker.
    if el:find('invalid state', 1, true) then
        print('^3[bodycam] getDisplayMedia failed with Invalid state after the dialog - common FiveM NUI/CEF bug. Reliable workaround: set Config.ClipAudioCaptureMode to ^"mic^" in penheads-bodycam/config.lua, or server.cfg: setr bodycam_clip_audio_mode mic^7')
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
    Bodycam.Notify('~o~Clip: no system loopback - saving microphone audio only')
end)

RegisterNUICallback('bodycam_enumerate_audio_inputs_result', function(body, cb)
    cb({})
    if type(body) ~= 'table' then return end
    if body.ok ~= true then
        print('^1[bodycam] bodycam_mic_devices: ' .. tostring(body.err or 'failed') .. '^7')
        return
    end
    local devs = body.devices
    if type(devs) ~= 'table' or #devs == 0 then
        print('^3[bodycam] No audio inputs listed. Toggle bodycam ON once to allow the mic prompt, then run bodycam_mic_devices again.^7')
        return
    end
    print('^2[bodycam] Audio inputs (set Config.ClipMicrophoneDeviceId or setr bodycam_clip_mic_device_id to the id):^7')
    for _, row in ipairs(devs) do
        local label = type(row.label) == 'string' and row.label or ''
        local id = type(row.deviceId) == 'string' and row.deviceId or ''
        print(('  ^6%s^7'):format(label ~= '' and label or '(no label)'))
        print(('    ^5%s^7'):format(id))
    end
end)

RegisterCommand('bodycam_mic_devices', function()
    SendNUIMessage({ type = 'bodycam_enumerate_audio_inputs' })
end, false)

--- Mic + desktop loopback (NUI). Called from keybind (`keybinds.lua`); duration from config / arg.
function CaptureClient.TryStartCombinedAudioRecord(requestedSeconds)
    if not canStartCombinedAudioRecord() then
        Bodycam.Notify('~r~Combined audio: job or equipment blocked')
        return
    end
    if Bodycam.clipRecording then
        Bodycam.Notify('~r~Bodycam clip in progress')
        return
    end
    if Bodycam.combinedAudioRecording then
        Bodycam.Notify('~r~Combined audio already running')
        return
    end

    local maxSec = tonumber(Config.CombinedAudioMaxSeconds) or 90
    local defSec = tonumber(Config.CombinedAudioRecordKeybindSeconds) or 30
    local sec = tonumber(requestedSeconds) or defSec
    if not sec or sec < 1 then sec = defSec end
    sec = math.floor(math.max(5, math.min(sec, maxSec)))
    local estBytes = math.floor(math.min(50 * 1024 * 1024, math.max(800000, sec * 520000)))

    TriggerServerEvent('bodycam:server:requestUpload', {
        fileName = 'bodycam_combined.webm',
        mimeType = 'video/webm',
        fileSize = estBytes,
        captureType = 'bodycam_combined_audio_record',
        incidentId = Bodycam.incidentId,
        videoTier = 'short',
        combinedAudioSeconds = sec,
    })
end

