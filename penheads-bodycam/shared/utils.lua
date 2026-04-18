Utils = {}

--- Pure UTC ISO-8601 from Unix seconds (client has no `os` library).
local function civil_from_days(z)
    z = math.floor(z + 719468)
    local era = (z >= 0 and z or z - 146096) // 146097
    local doe = z - era * 146097
    local yoe = (doe - doe // 1460 + doe // 36524 - doe // 146096) // 365
    local y = yoe + era * 400
    local doy = doe - (365 * yoe + yoe // 4 - yoe // 100)
    local mp = (5 * doy + 2) // 153
    local d = doy - (153 * mp + 2) // 5 + 1
    local m = mp + (mp < 10 and 3 or -9)
    y = y + (m <= 2 and 1 or 0)
    return y, m, d
end

local function unix_seconds_to_iso8601_utc(sec)
    sec = math.floor(sec)
    local days = sec // 86400
    local sod = sec % 86400
    local h = sod // 3600
    sod = sod % 3600
    local mi = sod // 60
    local s = sod % 60
    local Y, M, D = civil_from_days(days)
    return ('%04d-%02d-%02dT%02d:%02d:%02dZ'):format(Y, M, D, h, mi, s)
end

-- Client: server sends os.time(); we add elapsed GetGameTimer ms for HUD / capture until next sync.
Utils._timeSyncUnix = nil
Utils._timeSyncGameMs = nil

function Utils.ApplyServerTimeSync(unixSeconds)
    Utils._timeSyncUnix = math.floor(unixSeconds)
    Utils._timeSyncGameMs = GetGameTimer()
end

function Utils.TableHas(t, val)
    if not t then return false end
    for _, v in ipairs(t) do
        if v == val then return true end
    end
    return false
end

function Utils.NowIsoUtc()
    if IsDuplicityVersion() then
        return os.date('!%Y-%m-%dT%H:%M:%SZ')
    end
    if Utils._timeSyncUnix and Utils._timeSyncGameMs then
        local elapsed = (GetGameTimer() - Utils._timeSyncGameMs) // 1000
        return unix_seconds_to_iso8601_utc(Utils._timeSyncUnix + elapsed)
    end
    local ok, cloud = pcall(GetCloudTimeAsInt)
    if ok and type(cloud) == 'number' and cloud > 1e9 then
        return unix_seconds_to_iso8601_utc(cloud)
    end
    return unix_seconds_to_iso8601_utc(0)
end

function Utils.HashTable(list)
    local h = {}
    for _, v in ipairs(list or {}) do
        h[v] = true
    end
    return h
end
