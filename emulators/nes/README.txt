SwitchWebCFW NES Emulator

Files included:
- index.html: ROM selector
- player.html: NES player using JSNES
- roms.json: ROM list generated from your NES_ONLY.zip

You still need to add:
- jsnes.min.js in emulators/nes/
- your ROM files in emulators/nes/roms/

Required structure:
emulators/nes/
├── index.html
├── player.html
├── jsnes.min.js
├── roms.json
└── roms/
    ├── SUPER_MARIO_BROS.NES
    └── ...
