--[[
  Framework bridges — C7 Framework V3:
  https://docs.c7scripts.com/paid/c7fw
  Server exports: https://docs.c7scripts.com/paid/c7fw/developers/exports.md
]]

Framework = {}

--- C7FW resource folder name (change if your install renames it).
--- Example: `setr bodycam_c7fw_resource "c7-scripts-framework-v3"`
local function c7Resource()
    return GetConvar("bodycam_c7fw_resource", "c7-scripts-framework-v3")
end

local function c7Exports()
    return exports[c7Resource()]
end

local function c7ActiveCharacter(src)
    local ex = c7Exports()
    if not ex or not ex.GetActiveCharacter then
        return nil
    end
    local ok, char = pcall(function()
        return ex:GetActiveCharacter(src)
    end)
    return ok and char or nil
end

local function c7CharDiscordID(src)
    local ex = c7Exports()
    if not ex or not ex.GetCharDiscordID then
        return nil
    end
    local ok, id = pcall(function()
        return ex:GetCharDiscordID(src)
    end)
    return ok and id or nil
end

function Framework.GetPlayer(src)
    if Config.Framework == "c7fw" then
        return c7ActiveCharacter(src)
    end
    return nil
end

---@return string|nil discordId
function Framework.GetDiscordId(src)
    if Config.Framework == "c7fw" then
        local id = c7CharDiscordID(src)
        if id ~= nil and id ~= "" then
            return tostring(id):gsub("^discord:", "")
        end
        local char = c7ActiveCharacter(src)
        if char and char.char_discord then
            return tostring(char.char_discord):gsub("^discord:", "")
        end
    end
    for _, ident in ipairs(GetPlayerIdentifiers(src)) do
        if ident:sub(1, 8) == "discord:" then
            return ident:sub(9)
        end
    end
    return nil
end

function Framework.GetJobName(src)
    if Config.Framework == "c7fw" then
        local ex = c7Exports()
        if ex and ex.GetCharDept then
            local ok, dept = pcall(function()
                return ex:GetCharDept(src)
            end)
            if ok and dept and tostring(dept) ~= "" then
                local d = tostring(dept)
                return d, d:upper()
            end
        end
    end
    return "standalone", "CIV"
end

function Framework.GetCharacterName(src)
    if Config.Framework == "c7fw" then
        local ex = c7Exports()
        if ex and ex.GetCharFullName then
            local ok, name = pcall(function()
                return ex:GetCharFullName(src)
            end)
            if ok and name and tostring(name) ~= "" then
                return tostring(name)
            end
        end
    end
    return GetPlayerName(src) or "Officer"
end

function Framework.GetBadgeDepartmentCallsign(src)
    if Config.Framework == "c7fw" then
        local ex = c7Exports()
        if not ex then
            return nil, "LSPD", "UNIT-1"
        end
        local grade, dept, cs
        if ex.GetCharGrade then
            local ok, g = pcall(function()
                return ex:GetCharGrade(src)
            end)
            grade = ok and g or nil
        end
        if ex.GetCharDept then
            local ok, d = pcall(function()
                return ex:GetCharDept(src)
            end)
            dept = ok and d or nil
        end
        if ex.GetCharCallsign then
            local ok, c = pcall(function()
                return ex:GetCharCallsign(src)
            end)
            cs = ok and c or nil
        end
        local deptLabel = (dept and tostring(dept) ~= "") and tostring(dept):upper() or "LSPD"
        local unit = (cs and tostring(cs) ~= "") and tostring(cs) or "UNIT-1"
        return grade, deptLabel, unit
    end
    return nil, "LSPD", "UNIT-1"
end
