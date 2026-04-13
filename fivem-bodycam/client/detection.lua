local lastShot = 0
local firearms = Utils.HashTable(Config.FirearmWeaponNames)
local tasers = Utils.HashTable(Config.TaserWeaponNames)
local ignored = Utils.HashTable(Config.IgnoredWeaponNames)

local function weaponNameFromHash(hash)
    for _, n in ipairs(Config.TaserWeaponNames) do
        if joaat(n) == hash then return n end
    end
    for _, n in ipairs(Config.FirearmWeaponNames) do
        if joaat(n) == hash then return n end
    end
    for _, n in ipairs(Config.IgnoredWeaponNames) do
        if joaat(n) == hash then return n end
    end
    return nil
end

CreateThread(function()
    while true do
        if not Config.EnableAutoActivation or Bodycam.sleeping then
            Wait(500)
        else
            Wait(50)
            local ped = PlayerPedId()
            if IsPedShooting(ped) and PermissionsClient.IsAllowed() and EquipmentClient.IsEquipped() then
                local _, weapon = GetCurrentPedWeapon(ped)
                local wname = weaponNameFromHash(weapon)
                if wname and not ignored[wname] then
                    local now = GetGameTimer()
                    if now - lastShot >= (Config.AutoActivationCooldownSeconds * 1000) then
                        lastShot = now
                        local isTaser = tasers[wname]
                        local isFirearm = firearms[wname]
                        if isTaser and Config.AutoActivateOnTaser and (Config.ForceAutoTaserForLawEnforcement or Bodycam.personal.autoTaser) then
                            if Config.AutoActivationCreatesIncidentMarker then
                                TriggerServerEvent('bodycam:server:getOrCreateIncident')
                            end
                            if not Bodycam.active then
                                Bodycam.SetActive(true, 'auto_taser')
                            end
                            local _, reason = PreBuffer.FlushPreEvent('auto_taser_pre_event')
                            CaptureClient.TakeSnapshot('auto_taser', wname, reason)
                        elseif isFirearm and Config.AutoActivateOnFirearm and (Config.ForceAutoFirearmForLawEnforcement or Bodycam.personal.autoFirearm) then
                            if Config.AutoActivationCreatesIncidentMarker then
                                TriggerServerEvent('bodycam:server:getOrCreateIncident')
                            end
                            if not Bodycam.active then
                                Bodycam.SetActive(true, 'auto_firearm')
                            end
                            local _, reason = PreBuffer.FlushPreEvent('auto_firearm_pre_event')
                            CaptureClient.TakeSnapshot('auto_firearm', wname, reason)
                        end
                    end
                end
            end
        end
    end
end)
