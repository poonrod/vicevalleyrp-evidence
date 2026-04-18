-- F8 / console: open NUI once to grant monitor+system audio for WebM clips (browser requires a click inside NUI).
-- Requires Bodycam (main.lua) loaded first.

local function clipAudioUsesDisplay()
    local m = tostring(Config.ClipAudioCaptureMode or 'mic'):lower()
    return m == 'display' or m == 'display_plus_mic'
end

local rawCmd = Config.BodycamClipAudioConsoleCommand
if type(rawCmd) ~= 'string' then rawCmd = 'bodycamclipaudio' end
local cmd = rawCmd:match('^%s*(.-)%s*$') or ''
if cmd ~= '' and clipAudioUsesDisplay() then
    RegisterCommand(cmd, function()
        SetNuiFocus(true, true)
        -- Let CEF apply focus before the overlay; immediate SendNUIMessage has correlated with getDisplayMedia failures.
        CreateThread(function()
            Wait(100)
            SendNUIMessage({ type = 'bodycam_audio_console_setup_open' })
        end)
    end, false)

    RegisterCommand(cmd .. '_clear', function()
        SetNuiFocus(false, false)
        SendNUIMessage({ type = 'bodycam_display_audio_forget' })
        if Bodycam and Bodycam.Notify then
            Bodycam.Notify('~g~Bodycam: saved clip monitor audio cleared — run ~w~' .. cmd .. '~g~ to allow again')
        end
    end, false)
end

RegisterNUICallback('bodycam_audio_setup_nui_close', function(_, cb)
    SetNuiFocus(false, false)
    cb({})
end)
