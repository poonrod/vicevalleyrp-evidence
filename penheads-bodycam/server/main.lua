local activeSessions = {}

--- FPS passed to NUI clip capture; tier defaults from config when client omits clipRecordFps.
local function resolveClipFpsForPresign(meta)
    local tier = tostring(meta and meta.videoTier or 'short'):lower()
    if tier == 'medium' then
        return tonumber(meta and meta.clipRecordFps) or tonumber(Config.MediumClipRecordFps) or tonumber(Config.ClipRecordFps) or 30
    end
    if tier == 'long' then
        return tonumber(meta and meta.clipRecordFps) or tonumber(Config.LongVideoRecordFps) or tonumber(Config.ClipRecordFps) or 30
    end
    return tonumber(meta and meta.clipRecordFps) or tonumber(Config.ShortClipRecordFps) or tonumber(Config.ClipRecordFps) or 30
end

local function newIncidentId()
    return ('BCAM-%s-%s'):format(os.date('!%Y%m%d'), tostring(math.random(1000, 9999)))
end

RegisterNetEvent('bodycam:server:requestUpload', function(meta)
    local src = source
    if not Permissions.IsLawEnforcement(src) then return end
    local capType = tostring(meta and meta.captureType or '')
    if capType ~= 'bodycam_clip_stop' and capType ~= 'bodycam_combined_audio_record' then
        TriggerClientEvent('bodycam:client:notify', src, '~r~Only video evidence is supported')
        return
    end
    local discordId = Framework.GetDiscordId(src)
    if not discordId then
        TriggerClientEvent('bodycam:client:notify', src, '~r~No Discord identifier')
        return
    end

    local name = Framework.GetCharacterName(src)
    local badge, dept, cs = Framework.GetBadgeDepartmentCallsign(src)

    Api.RequestUploadUrl(src, {
        officerDiscordId = discordId,
        officerName = name,
        officerBadgeNumber = badge,
        officerDepartment = dept,
        officerCallsign = cs,
        fileName = meta.fileName or 'bodycam_clip.webm',
        mimeType = meta.mimeType or 'video/webm',
        fileSize = meta.fileSize or 500000,
        captureType = meta.captureType or 'bodycam_clip_stop',
        incidentId = meta.incidentId,
        caseNumber = meta.caseNumber,
        videoTier = meta.videoTier,
    }, function(data, err)
        if err or not data then
            if GetConvar('bodycam_debug', '0') == '1' then
                print(('[bodycam] upload-url failed src=%s err=%s'):format(tostring(src), tostring(err)))
            end
            TriggerClientEvent('bodycam:client:notify', src, '~r~Upload URL failed')
            return
        end
        TriggerClientEvent('bodycam:client:presignedReady', src, {
            url = data.url,
            evidenceId = data.evidenceId,
            storageKey = data.storageKey,
            storageBucket = data.bucket,
            fields = data.fields,
            meta = meta,
            discordId = discordId,
            officerName = name,
            officerBadgeNumber = badge,
            officerDepartment = dept,
            officerCallsign = cs,
            clipRecord = meta.captureType == 'bodycam_clip_stop',
            clipSeconds = tonumber(meta.clipMaxSeconds) or 12,
            clipFps = resolveClipFpsForPresign(meta),
            combinedAudioRecord = meta.captureType == 'bodycam_combined_audio_record',
            combinedAudioSeconds = tonumber(meta.combinedAudioSeconds) or 30,
        })
    end)
end)

RegisterNetEvent('bodycam:server:completeUpload', function(payload)
    local src = source
    if not Permissions.IsLawEnforcement(src) then return end
    local discordId = Framework.GetDiscordId(src)
    if not discordId then return end
    payload.officerDiscordId = discordId
    -- Authoritative wall time (client has no `os` / NTP; avoids trusting client clock).
    payload.timestampUtc = os.date('!%Y-%m-%dT%H:%M:%SZ')

    Api.CompleteEvidence(src, payload, function(data, err)
        if err then
            if GetConvar('bodycam_debug', '0') == '1' then
                print(('[bodycam] complete failed src=%s err=%s'):format(tostring(src), tostring(err)))
            end
            TriggerClientEvent('bodycam:client:notify', src, '~r~Complete failed')
            return
        end
        TriggerClientEvent('bodycam:client:notify', src, '~g~Evidence saved')
    end)
end)

RegisterNetEvent('bodycam:server:getOrCreateIncident', function()
    local src = source
    if not Permissions.IsLawEnforcement(src) then return end
    local id = activeSessions[src] or newIncidentId()
    activeSessions[src] = id
    Api.EnsureIncident(id, function(ok, err)
        if not ok then
            if GetConvar('bodycam_debug', '0') == '1' then
                print(('[bodycam] incidents/ensure failed id=%s err=%s'):format(tostring(id), tostring(err)))
            end
        end
        TriggerClientEvent('bodycam:client:incidentId', src, id)
    end)
end)

RegisterNetEvent('bodycam:server:requestTimeSync', function()
    TriggerClientEvent('bodycam:client:timeSync', source, os.time())
end)

AddEventHandler('playerDropped', function()
    activeSessions[source] = nil
end)

AddEventHandler('onResourceStart', function(resourceName)
    if resourceName ~= GetCurrentResourceName() then return end
    CreateThread(function()
        Wait(750)
        print('')
        print('^3========================================^7')
        print('^2  BODYCAM SCRIPT BY PENHEAD^7')
        print('^3========================================^7')
        print('')
        Api.PingEvidenceTerminal(function(ok, err)
            if ok then
                print('^2SUCCESSFULLY CONNECTED TO EVIDENCE TERMINAL^7')
            else
                print(('^1[bodycam] Evidence terminal not reachable (%s)^7'):format(tostring(err)))
            end
        end)
    end)
end)
