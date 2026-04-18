Api = {}

local function postOnce(path, body, cb)
    local url = Config.ApiBaseUrl:gsub('/$', '') .. path
    PerformHttpRequest(url, function(code, response)
        if code >= 200 and code < 300 then
            local ok, data = pcall(json.decode, response or '{}')
            cb(ok and data or nil, nil)
        else
            cb(nil, 'HTTP ' .. tostring(code) .. ' ' .. tostring(response))
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
function Api.PingEvidenceTerminal(cb)
    if Config.ApiSecret == '' then
        cb(false, 'bodycam_api_secret not set')
        return
    end
    local url = Config.ApiBaseUrl:gsub('/$', '') .. '/internal/fivem/ping'
    PerformHttpRequest(url, function(code, _response)
        if code >= 200 and code < 300 then
            cb(true, nil)
        else
            cb(false, 'HTTP ' .. tostring(code))
        end
    end, 'GET', '', {
        ['X-FiveM-Secret'] = Config.ApiSecret,
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
