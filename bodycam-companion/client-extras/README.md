# Client folder extras

Optional files here are **copied into the Windows release folder** next to `BodycamCompanion.exe` when you extend `scripts/pack-win.cjs` (`afterComplete`).

The **uninstaller** is not stored here: `npm run pack:win` compiles [`tools/windows-uninstall/Program.cs`](../tools/windows-uninstall/Program.cs) with the Windows **.NET Framework `csc.exe`** into `build-assets/Uninstall.exe`, applies the app icon, and drops **`Uninstall.exe`** next to the main app.

- Double-click **`Uninstall.exe`** to stop the companion, remove matching Startup shortcuts, and schedule deletion of the install folder.
- Run **`Uninstall.exe --remove-user-data`** to also delete `%APPDATA%\Bodycam` (config, logs, pending uploads).
