Permissions = {}

function Permissions.IsLawEnforcement(src)
    if Config.UseAcePermissions then
        if IsPlayerAceAllowed(src, Config.RequiredAcePermission) then
            return true
        end
    end
    if not Config.RestrictToLawEnforcement then
        return true
    end
    local job = select(1, Framework.GetJobName(src))
    if Utils.TableHas(Config.AllowedJobs, job) then
        return true
    end
    -- Standalone framework reports job "standalone" for everyone; it is never "police"/"sheriff".
    -- Without this, upload handlers never run and nothing reaches the API.
    if Config.Framework == "standalone" and job == "standalone" then
        return true
    end
    return false
end
