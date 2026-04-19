#Requires -Version 5.1
<#
.SYNOPSIS
  Removes the portable Bodycam Companion folder (this directory).

.DESCRIPTION
  - Stops BodycamCompanion.exe if running.
  - Removes optional Startup shortcuts created by Electron auto-launch.
  - Schedules deletion of this install folder (cannot delete the folder from a script running inside it).
  - Use -RemoveUserData to also delete %APPDATA%\Bodycam (config, logs, temp uploads).

.EXAMPLE
  .\Uninstall.ps1
.EXAMPLE
  .\Uninstall.ps1 -RemoveUserData
#>
param(
  [switch]$RemoveUserData
)

$ErrorActionPreference = "Stop"
$installDir = $PSScriptRoot

Write-Host "Bodycam Companion — Uninstall" -ForegroundColor Cyan
Write-Host "Install folder: $installDir"

$proc = Get-Process -Name "BodycamCompanion" -ErrorAction SilentlyContinue
if ($proc) {
  Write-Host "Stopping BodycamCompanion…"
  $proc | Stop-Process -Force
  Start-Sleep -Seconds 2
}

# Electron auto-start on Windows (Startup folder shortcut)
$startup = [Environment]::GetFolderPath("Startup")
if (Test-Path $startup) {
  Get-ChildItem -LiteralPath $startup -ErrorAction SilentlyContinue |
    Where-Object {
      $n = $_.Name
      $n -like "*BodycamCompanion*" -or $n -like "*Bodycam Companion*"
    } |
    ForEach-Object {
      try {
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop
        Write-Host "Removed startup item: $($_.Name)"
      } catch {
        Write-Warning "Could not remove $($_.FullName): $_"
      }
    }
}

if ($RemoveUserData) {
  $data = Join-Path $env:APPDATA "Bodycam"
  if (Test-Path $data) {
    Write-Host "Removing user data: $data"
    Remove-Item -LiteralPath $data -Recurse -Force
  }
} else {
  Write-Host "User data left at $env:APPDATA\Bodycam (re-run with -RemoveUserData to delete config and logs)."
}

# Delete this folder from a detached cmd (we cannot remove $installDir while this script lives inside it).
$batchPath = Join-Path $env:TEMP ("bc-uninstall-" + [guid]::NewGuid().ToString("n") + ".cmd")
$quotedInstall = $installDir.Replace('"', '""')
$lines = @(
  "@echo off",
  "timeout /t 2 /nobreak >nul",
  "rmdir /s /q `"$quotedInstall`"",
  "del `"%~f0`""
)
$lines | Set-Content -LiteralPath $batchPath -Encoding OEM

Write-Host "Scheduling removal of the program folder…"
Write-Host "Close this window and any Explorer windows showing this folder, then wait a few seconds."
Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$batchPath`"" -WindowStyle Hidden
