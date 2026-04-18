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

if Config.EnableCombinedAudioRecordKeybind then
    local cmd = tostring(Config.CombinedAudioRecordKeybindCommand or "+bodycamrecord"):match("^%s*(.-)%s*$") or "+bodycamrecord"
    RegisterCommand(cmd, function()
        CaptureClient.TryStartCombinedAudioRecord(nil)
    end, false)
    RegisterKeyMapping(
        cmd,
        tostring(Config.CombinedAudioRecordKeybindDescription or "Bodycam combined audio record"),
        "keyboard",
        tostring(Config.CombinedAudioRecordKeybindDefault or "F9")
    )
end
