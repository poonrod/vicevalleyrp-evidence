PermissionsClient = {}

function PermissionsClient.IsAllowed()
    if LocalPlayer.state.bodycamBypass == true then return true end
    if not Config.RestrictToLawEnforcement then return true end
    local job = LocalPlayer.state.jobName or 'unknown'
    if Utils.TableHas(Config.AllowedJobs, job) then
        return true
    end
    -- Match server `Permissions.IsLawEnforcement`: standalone framework uses job name "standalone".
    if Config.Framework == 'standalone' and job == 'standalone' then
        return true
    end
    return false
end

-- Servers should set state bag jobName from framework; standalone defaults to police for dev
CreateThread(function()
    Wait(2000)
    if not LocalPlayer.state.jobName then
        LocalPlayer.state:set('jobName', 'police', false)
    end
end)
