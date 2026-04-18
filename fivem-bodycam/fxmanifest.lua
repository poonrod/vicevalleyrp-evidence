fx_version 'cerulean'
game 'gta5'

name 'vicevalley_bodycam'
author 'Vice Valley RP'
description 'Bodycam evidence — MVP screenshot pipeline with secure API upload'
version '1.0.0'

lua54 'yes'

shared_scripts {
    'config.lua',
    'shared/utils.lua',
}

client_scripts {
    'client/permissions.lua',
    'client/voice.lua',
    'client/equipment.lua',
    'client/camera.lua',
    'client/audio.lua',
    'client/prebuffer.lua',
    'client/detection.lua',
    'client/nui.lua',
    'client/capture.lua',
    'client/config_menu.lua',
    'client/keybinds.lua',
    'client/main.lua',
}

server_scripts {
    'server/framework.lua',
    'server/permissions.lua',
    'server/api.lua',
    'server/main.lua',
}

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/style.css',
    'html/app.js',
    'html/sounds/axon_on.ogg',
    'html/overlay/axon-delta-gold.svg',
    'html/overlay/axon-delta-gold.png',
}

dependencies {
    '/server:5848',
    '/onesync',
}
