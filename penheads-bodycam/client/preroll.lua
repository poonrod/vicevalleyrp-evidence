--[[
  Low-rate rolling screenshots while bodycam is OFF (eligible officer + clip mode).
  Frames live in NUI; on bodycam ON we freeze a snapshot for prepending to the WebM on save.
]]

local function preRollEligible()
    if not Config.EnableClipMode or not Config.EnableClipPreRoll then return false end
    if Bodycam.active or Bodycam.clipRecording or Bodycam.combinedAudioRecording then return false end
    if Bodycam.sleeping then return false end
    if not PermissionsClient.IsAllowed() or not EquipmentClient.IsEquipped() then return false end
    return true
end

local function preRollTick()
    if not preRollEligible() then return end
    local shotRes = Config.ScreenshotResourceName or 'screenshot-basic'
    if GetResourceState(shotRes) ~= 'started' then return end

    local q = tonumber(Config.PreRollJpegQuality) or 0.72
    q = math.max(0.45, math.min(0.92, q))
    exports[shotRes]:requestScreenshot({
        encoding = 'jpg',
        quality = q,
    }, function(dataUrl)
        if not preRollEligible() then return end
        if type(dataUrl) ~= 'string' or not dataUrl:find('^data:', 1, false) then return end
        local prs = math.max(5, math.floor(tonumber(Config.PreRollSeconds) or 30))
        local psf = math.max(1, math.floor(tonumber(Config.PreRollSampleFps) or 1))
        local ringMax = math.min(240, prs * psf)
        SendNUIMessage({
            type = 'bodycam_preroll_ring_push',
            dataUrl = dataUrl,
            ringMax = ringMax,
        })
    end)
end

CreateThread(function()
    while true do
        local psf = math.max(1, math.floor(tonumber(Config.PreRollSampleFps) or 1))
        local waitMs = math.floor(1000 / psf)
        Wait(math.max(200, waitMs))
        preRollTick()
    end
end)
