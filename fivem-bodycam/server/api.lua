Api = {}

local function post(path, body, cb)
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

function Api.RequestUploadUrl(src, payload, cb)
    if Config.ApiSecret == '' then
        cb(nil, 'bodycam_api_secret not set')
        return
    end
    post('/internal/fivem/evidence/upload-url', payload, cb)
end

function Api.CompleteEvidence(src, payload, cb)
    post('/internal/fivem/evidence/complete', payload, cb)
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
