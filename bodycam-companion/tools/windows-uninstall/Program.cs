using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;

/// <summary>
/// Portable uninstaller for Bodycam Companion (same behavior as the former Uninstall.ps1).
/// Built during pack with %WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe — no extra SDK required.
/// </summary>
internal static class Program
{
    private static int Main(string[] args)
    {
        if (args.Any(a => string.Equals(a, "/?", StringComparison.Ordinal) || string.Equals(a, "--help", StringComparison.OrdinalIgnoreCase)))
        {
            Console.WriteLine("Bodycam Companion — Uninstall");
            Console.WriteLine();
            Console.WriteLine("  Uninstall.exe");
            Console.WriteLine("      Removes this install folder after closing the app.");
            Console.WriteLine();
            Console.WriteLine("  Uninstall.exe --remove-user-data");
            Console.WriteLine("      Also deletes %APPDATA%\\Bodycam (config, logs, temp uploads).");
            return 0;
        }

        try
        {
            return Run(args);
        }
        catch (Exception ex)
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine("Uninstall failed: " + ex.Message);
            Console.ResetColor();
            Console.WriteLine();
            Console.WriteLine("Press any key to exit.");
            Console.ReadKey(intercept: true);
            return 1;
        }
    }

    private static int Run(string[] args)
    {
        bool removeUserData = args.Any(a =>
            string.Equals(a, "--remove-user-data", StringComparison.OrdinalIgnoreCase)
            || string.Equals(a, "-RemoveUserData", StringComparison.OrdinalIgnoreCase));

        ProcessModule module = Process.GetCurrentProcess().MainModule;
        string exePath = module == null ? null : module.FileName;
        if (string.IsNullOrEmpty(exePath))
        {
            throw new InvalidOperationException("Could not determine the uninstaller path.");
        }

        string installDir = Path.GetFullPath(Path.GetDirectoryName(exePath) ?? ".");

        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("Bodycam Companion — Uninstall");
        Console.ResetColor();
        Console.WriteLine("Install folder: " + installDir);

        bool stoppedAny = false;
        foreach (Process p in Process.GetProcessesByName("BodycamCompanion"))
        {
            try
            {
                Console.WriteLine("Stopping BodycamCompanion…");
                p.Kill();
                if (!p.WaitForExit(5000))
                {
                    p.Kill();
                }
                stoppedAny = true;
            }
            catch
            {
                // ignore individual process errors
            }
            finally
            {
                p.Dispose();
            }
        }

        if (stoppedAny)
        {
            Thread.Sleep(2000);
        }

        string startup = Environment.GetFolderPath(Environment.SpecialFolder.Startup);
        if (Directory.Exists(startup))
        {
            foreach (string fullPath in Directory.GetFiles(startup))
            {
                string name = Path.GetFileName(fullPath);
                if (name.IndexOf("BodycamCompanion", StringComparison.OrdinalIgnoreCase) >= 0
                    || name.IndexOf("Bodycam Companion", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    try
                    {
                        File.Delete(fullPath);
                        Console.WriteLine("Removed startup item: " + name);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine("Could not remove " + fullPath + ": " + ex.Message);
                    }
                }
            }
        }

        if (removeUserData)
        {
            string data = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Bodycam");
            if (Directory.Exists(data))
            {
                Console.WriteLine("Removing user data: " + data);
                Directory.Delete(data, recursive: true);
            }
        }
        else
        {
            string data = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Bodycam");
            Console.WriteLine("User data left at: " + data);
            Console.WriteLine("(Run Uninstall.exe --remove-user-data to delete config and logs.)");
        }

        string batchPath = Path.Combine(
            Path.GetTempPath(),
            "bc-uninstall-" + Guid.NewGuid().ToString("n") + ".cmd");
        string quotedInstall = installDir.Replace("\"", "\"\"");

        var batch = new StringBuilder();
        batch.AppendLine("@echo off");
        batch.AppendLine("chcp 65001 >nul");
        batch.AppendLine("timeout /t 2 /nobreak >nul");
        batch.AppendLine("rmdir /s /q \"" + quotedInstall + "\"");
        batch.AppendLine("del \"%~f0\"");
        File.WriteAllText(batchPath, batch.ToString(), new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));

        string cmd = Path.Combine(Environment.SystemDirectory, "cmd.exe");
        var psi = new ProcessStartInfo
        {
            FileName = cmd,
            Arguments = "/c \"" + batchPath + "\"",
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
        };
        Process child = Process.Start(psi);
        if (child != null)
        {
            child.Dispose();
        }

        Console.WriteLine();
        Console.WriteLine("Scheduling removal of the program folder…");
        Console.WriteLine("Close this window and any Explorer windows showing this folder, then wait a few seconds.");

        return 0;
    }
}
