PreBuffer = {}
PreBuffer.snapshots = {}

local function pushSnapshot(label)
    if not Config.EnableMonitoringMode then return end
    if Bodycam.sleeping then return end
    if Config.RequireEligibleJobForMonitoring and not PermissionsClient.IsAllowed() then return end
    local now = GetGameTimer()
    table.insert(PreBuffer.snapshots, { t = now, label = label })
    local maxAge = Config.PreEventWindowSeconds * 1000
    local i = 1
    while PreBuffer.snapshots[i] and (now - PreBuffer.snapshots[i].t) > maxAge do
        table.remove(PreBuffer.snapshots, i)
    end
end

CreateThread(function()
    while true do
        if Bodycam.active and not Bodycam.sleeping then
            pushSnapshot('periodic')
        end
        Wait((Config.PreEventSnapshotIntervalSeconds or 5) * 1000)
    end
end)

function PreBuffer.FlushPreEvent(reason)
    local out = {}
    for _, s in ipairs(PreBuffer.snapshots) do
        out[#out + 1] = s
    end
    PreBuffer.snapshots = {}
    return out, reason or "pre_event"
end
