CameraClient = {}

local saved = nil

function CameraClient.Apply(bodycamOn)
    if not Config.ForceFirstPersonWhileBodycamActive then return end
    local p = PlayerPedId()
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
