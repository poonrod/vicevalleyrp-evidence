-- HUD updates from Lua
CreateThread(function()
    while true do
        if Bodycam.active then
            local ped = PlayerPedId()
            local coords = GetEntityCoords(ped)
            local heading = GetEntityHeading(ped)
            local street = GetStreetNameFromHashKey(GetStreetNameAtCoord(coords.x, coords.y, coords.z))
            SendNUIMessage({
                type = 'hud_tick',
                time = Utils.NowIsoUtc(),
                officer = GetPlayerName(PlayerId()),
                badge = '0000',
                dept = 'LSPD',
                unit = '1-ADAM',
                incident = Bodycam.incidentId,
                auto = GetGameTimer() < Bodycam.autoLockUntil,
                sleeping = Bodycam.sleeping,
                equipped = EquipmentClient.IsEquipped(),
                coords = { x = coords.x, y = coords.y, z = coords.z },
                heading = heading,
                street = street,
            })
            Wait(500)
        else
            Wait(1000)
        end
    end
end)
