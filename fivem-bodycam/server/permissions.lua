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
    return false
end
