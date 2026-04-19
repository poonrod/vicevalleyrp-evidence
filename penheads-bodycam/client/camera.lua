CameraClient = {}

local saved = nil
local snapshotSaved = nil

function CameraClient.Apply(bodycamOn)
    if not Config.ForceFirstPersonWhileBodycamActive then return end
    if bodycamOn then
        saved = GetFollowPedCamViewMode()
        SetFollowPedCamViewMode(4)
    else
        if Config.RestorePreviousCameraModeOnDisable and saved ~= nil then
            SetFollowPedCamViewMode(saved)
        end
        saved = nil
    end
end

--- First-person framing for a single capture (screenshot-basic reads the game render target).
function CameraClient.BeginSnapshotFirstPerson()
    if snapshotSaved ~= nil then return end
    snapshotSaved = GetFollowPedCamViewMode()
    SetFollowPedCamViewMode(4)
    for _ = 1, 6 do
        Wait(0)
    end
end

function CameraClient.EndSnapshotFirstPerson()
    if snapshotSaved == nil then return end
    -- Always restore: temporary FP for screenshots must not depend on
    -- RestorePreviousCameraModeOnDisable (that flag is only for ForceFirstPersonWhileBodycamActive).
    SetFollowPedCamViewMode(snapshotSaved)
    snapshotSaved = nil
end

--- Hold first-person for an entire WebM clip (one switch in / out; avoids per-frame flicker).
local clipFpActive = false
local clipFpSaved = nil

function CameraClient.BeginClipSessionFirstPerson()
    if clipFpActive then return end
    clipFpActive = true
    clipFpSaved = GetFollowPedCamViewMode()
    SetFollowPedCamViewMode(4)
    for _ = 1, 12 do
        Wait(0)
    end
end

function CameraClient.EndClipSessionFirstPerson()
    if not clipFpActive then return end
    clipFpActive = false
    if clipFpSaved ~= nil then
        SetFollowPedCamViewMode(clipFpSaved)
    end
    clipFpSaved = nil
end
