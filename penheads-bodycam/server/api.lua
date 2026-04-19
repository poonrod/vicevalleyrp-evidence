Api = {}

--- Prefer JSON `{ "error": "..." }` from the evidence API so clients see actionable text (e.g. max upload MB).
local function formatApiHttpError(code, response)
    local c = tonumber(code)
    local r = type(response) == 'string' and response or ''
    local okj, data = pcall(json.decode, r)
    if okj and type(data) == 'table' then
        if type(data.error) == 'string' and data.error ~= '' then
            return data.error
        end
        if type(data.message) == 'string' and data.message ~= '' then
            return data.message
        end
    end
    local tail = r:gsub('%s+', ' '):gsub('^%s+', ''):sub(1, 220)
    if tail ~= '' then
        return ('HTTP %s — %s'):format(tostring(c or code), tail)
    end
    return ('HTTP %s'):format(tostring(c or code))
end

local function postOnce(path, body, cb)
    local url = Config.ApiBaseUrl:gsub('/$', '') .. path
    PerformHttpRequest(url, function(code, response)
        if code >= 200 and code < 300 then
            local ok, data = pcall(json.decode, response or '{}')
            if ok and type(data) == 'table' then
                cb(data, nil)
            else
                cb(nil, 'Invalid JSON from API (upload-url/complete)')
            end
        else
            cb(nil, formatApiHttpError(code, response))
        end
    end, 'POST', json.encode(body), {
        ['Content-Type'] = 'application/json',
        ['X-FiveM-Secret'] = Config.ApiSecret,
    })
end

--- Exponential backoff on transient API errors (convars: bodycam_upload_retries default 3, bodycam_upload_debug 0/1).
local function postWithRetry(path, body, cb)
    local max = tonumber(GetConvar('bodycam_upload_retries', '3')) or 3
    if max < 1 then max = 1 end
    if max > 8 then max = 8 end

    local attempt = 1
    local delayMs = 400

    local function run()
        postOnce(path, body, function(data, err)
            if data then
                if GetConvar('bodycam_upload_debug', '0') == '1' then
                    print(('[bodycam][upload_debug] %s OK attempt=%s'):format(path, tostring(attempt)))
                end
                cb(data, nil)
                return
            end
            if GetConvar('bodycam_upload_debug', '0') == '1' then
                print(('[bodycam][upload_debug] %s FAIL attempt=%s/%s err=%s'):format(
                    path, tostring(attempt), tostring(max), tostring(err)))
            end
            if attempt >= max then
                cb(nil, err)
                return
            end
            attempt = attempt + 1
            Citizen.SetTimeout(delayMs, function()
                delayMs = math.min(delayMs * 2, 8000)
                run()
            end)
        end)
    end

    run()
end

function Api.RequestUploadUrl(src, payload, cb)
    if Config.ApiSecret == '' then
        cb(nil, 'bodycam_api_secret not set')
        return
    end
    if GetConvar('bodycam_upload_debug', '0') == '1' then
        print(('[bodycam][upload_debug] request upload-url captureType=%s mime=%s bytes=%s'):format(
            tostring(payload.captureType), tostring(payload.mimeType), tostring(payload.fileSize)))
    end
    postWithRetry('/internal/fivem/evidence/upload-url', payload, cb)
end

function Api.CompleteEvidence(src, payload, cb)
    if GetConvar('bodycam_upload_debug', '0') == '1' then
        local preview = json.encode({
            storageKey = payload.storageKey,
            evidenceId = payload.evidenceId,
            mimeType = payload.mimeType,
            fileSize = payload.fileSize,
            captureType = payload.captureType,
        })
        print(('[bodycam][upload_debug] complete payload (truncated): %s'):format(preview:sub(1, 500)))
    end
    postWithRetry('/internal/fivem/evidence/complete', payload, cb)
end

--- GET /internal/fivem/ping — confirms base URL and X-FiveM-Secret (resource startup log).
function Api.EnsureIncident(incidentId, cb)
    if Config.ApiSecret == '' then
        cb(false, 'bodycam_api_secret not set')
        return
    end
    if not incidentId or incidentId == '' then
        cb(false, 'missing incidentId')
        return
    end
    postWithRetry('/internal/fivem/incidents/ensure', {
        incidentId = incidentId,
    }, function(data, err)
        cb(data ~= nil, err)
    end)
end

function Api.PingEvidenceTerminal(cb)
    local secret = tostring(Config.ApiSecret or ''):match('^%s*(.-)%s*$') or ''
    if secret == '' then
        cb(false, 'bodycam_api_secret not set (must match FIVEM_API_SECRET on the API)')
        return
    end
    local base = tostring(Config.ApiBaseUrl or ''):gsub('/$', ''):match('^%s*(.-)%s*$') or ''
    if base == '' or (base:sub(1, 7) ~= 'http://' and base:sub(1, 8) ~= 'https://') then
        cb(false, 'bodycam_api_base missing or invalid (expected http:// or https:// URL)')
        return
    end
    local url = base .. '/internal/fivem/ping'
    PerformHttpRequest(url, function(code, response)
        local c = tonumber(code)
        if not c or c < 200 or c >= 300 then
            local detail
            if c == nil or c == 0 then
                detail = 'Unreachable (wrong URL, API down, firewall, or TLS/DNS failure)'
            elseif c == 401 then
                detail = 'HTTP 401 — X-FiveM-Secret does not match FIVEM_API_SECRET'
            elseif c == 503 then
                detail = 'HTTP 503 — API has FIVEM_API_SECRET unset (internal routes disabled)'
            else
                detail = 'HTTP ' .. tostring(code)
            end
            if type(response) == 'string' and response ~= '' then
                local snippet = response:gsub('%s+', ' '):sub(1, 160)
                if #snippet > 0 then
                    detail = detail .. ' — ' .. snippet
                end
            end
            cb(false, detail)
            return
        end
        local okj, data = pcall(json.decode, response or '{}')
        if not okj or type(data) ~= 'table' or data.ok ~= true then
            cb(false, 'Unexpected response (not the Vice Valley evidence API JSON {"ok":true})')
            return
        end
        cb(true, nil)
    end, 'GET', '', {
        ['X-FiveM-Secret'] = secret,
    })
end

function Api.FetchBodycamSettings(discordId, cb)
    local url = Config.ApiBaseUrl:gsub('/$', '') .. '/internal/fivem/bodycam-settings/' .. discordId
    PerformHttpRequest(url, function(code, response)
        if code >= 200 and code < 300 then
            local ok, data = pcall(json.decode, response or '{}')
            cb(ok and data or nil)
        else
            cb(nil)
        end
    end, 'GET', '', {
        ['X-FiveM-Secret'] = Config.ApiSecret,
    })
end
