Utils = {}

function Utils.TableHas(t, val)
    if not t then return false end
    for _, v in ipairs(t) do
        if v == val then return true end
    end
    return false
end

function Utils.NowIsoUtc()
    -- os.date !*t UTC not native; use game timer + offset approximation for client display only
    return os.date("!%Y-%m-%dT%H:%M:%SZ")
end

function Utils.HashTable(list)
    local h = {}
    for _, v in ipairs(list or {}) do
        h[v] = true
    end
    return h
end
