EquipmentClient = {}

local function ped()
    return PlayerPedId()
end

function EquipmentClient.IsEquipped()
    if not Config.RequireEquippedStateForActivation then
        return true
    end
    if not Config.RequireBodycamProp then
        return PermissionsClient.IsAllowed()
    end
    local p = ped()
    if Config.BodycamPropMode == 'component_or_prop' or Config.BodycamPropMode == 'component' then
        for _, c in ipairs(Config.AllowedBodycamComponents or {}) do
            local d = GetPedDrawableVariation(p, c.componentId)
            local t = GetPedTextureVariation(p, c.componentId)
            if d == c.drawable and t == c.texture then
                return true
            end
        end
    end
    -- Prop attachment checks are server-specific; MVP: component match or disabled requirement
    return false
end
