if Config.EnableKeybindToggle then
    RegisterCommand(Config.ToggleKeybindCommand, function()
        Bodycam.ToggleManual()
    end, false)
    RegisterKeyMapping(
        Config.ToggleKeybindCommand,
        Config.ToggleKeybindDescription,
        'keyboard',
        Config.ToggleKeybindDefault
    )
end
