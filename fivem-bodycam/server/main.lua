local activeSessions = {}

local function newIncidentId()
    return ('BCAM-%s-%s'):format(os.date('!%Y%m%d'), tostring(math.random(1000, 9999)))
end

RegisterNetEvent('bodycam:server:requestUpload', function(meta)
    local src = source
    if not Permissions.IsLawEnforcement(src) then return end
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
        fileName = meta.fileName or 'capture.jpg',
        mimeType = meta.mimeType or 'image/jpeg',
        fileSize = meta.fileSize or 500000,
        captureType = meta.captureType or 'manual_snapshot',
        incidentId = meta.incidentId,
        caseNumber = meta.caseNumber,
        videoTier = meta.videoTier,
    }, function(data, err)
        if err or not data then
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
    TriggerClientEvent('bodycam:client:incidentId', src, id)
end)

RegisterNetEvent('bodycam:server:requestTimeSync', function()
    TriggerClientEvent('bodycam:client:timeSync', source, os.time())
end)

AddEventHandler('playerDropped', function()
    activeSessions[source] = nil
end)
