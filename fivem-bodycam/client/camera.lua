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
    if Config.RestorePreviousCameraModeOnDisable then
        SetFollowPedCamViewMode(snapshotSaved)
    end
    snapshotSaved = nil
end
