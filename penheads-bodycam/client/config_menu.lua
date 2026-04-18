if not Config.EnableBodycamConfigMenu then return end

local function openMenu()
    SetNuiFocus(true, true)
    SendNUIMessage({
        type = 'config_open',
        sleeping = Bodycam.sleeping,
        autoTaser = Bodycam.personal.autoTaser,
        autoFirearm = Bodycam.personal.autoFirearm,
        sound = Bodycam.personal.sound,
        firstPerson = Bodycam.personal.firstPerson,
        lowStorage = Bodycam.personal.lowStorage,
        lockedTaser = Config.ForceAutoTaserForLawEnforcement,
        lockedFirearm = Config.ForceAutoFirearmForLawEnforcement,
        bodycamActive = Bodycam.active,
        equipped = EquipmentClient.IsEquipped(),
        job = LocalPlayer.state.jobName or '?',
    })
end

RegisterCommand(Config.BodycamConfigCommand, function()
    if not PermissionsClient.IsAllowed() then
        Bodycam.Notify('~r~Unauthorized')
        return
    end
    openMenu()
end, false)

RegisterNUICallback('bcamconfig_close', function(_, cb)
    SetNuiFocus(false, false)
    cb({ ok = true })
end)

RegisterNUICallback('bcamconfig_apply', function(data, cb)
    if data.sleeping ~= nil and Config.EnableSleepingMode then
        Bodycam.sleeping = data.sleeping
        if Bodycam.sleeping and not Config.AllowManualActivationWhileSleeping then
            Bodycam.SetActive(false, 'sleeping')
        end
    end
    if not Config.ForceAutoTaserForLawEnforcement and data.autoTaser ~= nil then
        Bodycam.personal.autoTaser = data.autoTaser
    end
    if not Config.ForceAutoFirearmForLawEnforcement and data.autoFirearm ~= nil then
        Bodycam.personal.autoFirearm = data.autoFirearm
    end
    if data.sound ~= nil then Bodycam.personal.sound = data.sound end
    if data.firstPerson ~= nil then Bodycam.personal.firstPerson = data.firstPerson end
    if Config.AllowLowStorageModeToggle and data.lowStorage ~= nil then
        Bodycam.personal.lowStorage = data.lowStorage
    end
    Bodycam.Notify('~g~Settings updated')
    cb({ ok = true })
end)
