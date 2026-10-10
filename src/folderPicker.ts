import { execFile } from "node:child_process";

export const windowsFolderPickerCommand = [
  "$ErrorActionPreference = 'Stop'",
  "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding",
  "Add-Type -AssemblyName System.Windows.Forms",
  "$owner = New-Object System.Windows.Forms.Form",
  "$owner.TopMost = $true",
  "$owner.ShowInTaskbar = $false",
  "$owner.StartPosition = 'CenterScreen'",
  "$owner.Opacity = 0",
  "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
  "$dialog.Description = '選擇專案資料夾'",
  "$dialog.ShowNewFolderButton = $true",
  // TopMost takes effect only after the owner has a visible window handle.
  "$owner.Show()",
  "$owner.Activate()",
  "try { if ($dialog.ShowDialog($owner) -eq 'OK') { $dialog.SelectedPath } } finally { $dialog.Dispose(); $owner.Dispose() }",
].join("; ");

export function pickProjectFolder(): Promise<string | undefined> {
  if (process.platform !== "win32") return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-STA", "-Command", windowsFolderPickerCommand],
      { timeout: 120_000, windowsHide: true, encoding: "utf8" },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout.replaceAll("\r", "").trim() || undefined);
      },
    );
  });
}
