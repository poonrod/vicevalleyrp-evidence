Framework = {}

local function qb()
    local ok, core = pcall(function()
        return exports['qb-core']:GetCoreObject()
    end)
    return ok and core or nil
end

function Framework.GetPlayer(src)
    if Config.Framework == 'qbcore' then
        local QBCore = qb()
        if not QBCore then return nil end
        return QBCore.Functions.GetPlayer(src)
    end
    return nil
end

---@return string|nil discordId
function Framework.GetDiscordId(src)
    if Config.Framework == 'qbcore' then
        local p = Framework.GetPlayer(src)
        if p and p.PlayerData and p.PlayerData.discord then
            return tostring(p.PlayerData.discord):gsub('discord:', '')
        end
    end
    for _, id in ipairs(GetPlayerIdentifiers(src)) do
        if id:sub(1, 8) == 'discord:' then
            return id:sub(9)
        end
    end
    return nil
end

function Framework.GetJobName(src)
    if Config.Framework == 'qbcore' then
        local p = Framework.GetPlayer(src)
        if p and p.PlayerData and p.PlayerData.job then
            return p.PlayerData.job.name, p.PlayerData.job.label
        end
    end
    return 'standalone', 'CIV'
end

function Framework.GetCharacterName(src)
    if Config.Framework == 'qbcore' then
        local p = Framework.GetPlayer(src)
        if p and p.PlayerData and p.PlayerData.charinfo then
            local c = p.PlayerData.charinfo
            return (c.firstname or '') .. ' ' .. (c.lastname or '')
        end
    end
    return GetPlayerName(src) or 'Officer'
end

function Framework.GetBadgeDepartmentCallsign(src)
    if Config.Framework == 'qbcore' then
        local p = Framework.GetPlayer(src)
        if p and p.PlayerData and p.PlayerData.job then
            local j = p.PlayerData.job
            return j.grade and j.grade.name, j.label, j.onduty and 'UNIT-1' or 'UNIT'
        end
    end
    return nil, 'LSPD', 'UNIT-1'
end
