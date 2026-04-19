# Client folder extras

Files here are **copied into the Windows release folder** next to `BodycamCompanion.exe` when you run `npm run pack:win` (see `scripts/pack-win.cjs`, `afterComplete`).

- **`Uninstall.cmd`** — double-click uninstaller (runs `Uninstall.ps1`).
- **`Uninstall.ps1`** — stops the app, removes Startup shortcuts that match the companion name, schedules deletion of the install folder.

Optional: run from an elevated or normal PowerShell:

```powershell
.\Uninstall.ps1 -RemoveUserData
```

to also delete `%APPDATA%\Bodycam` (config, logs, pending uploads).
