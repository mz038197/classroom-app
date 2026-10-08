param(
  [Parameter(Mandatory = $true)]
  [string]$Exe,
  [Parameter(Mandatory = $true)]
  [string]$Blob
)

$bytes = [System.IO.File]::ReadAllBytes($Blob)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class SeaResource {
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern IntPtr BeginUpdateResource(string fileName, bool deleteExisting);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool UpdateResource(IntPtr hUpdate, IntPtr type, IntPtr name, ushort language, byte[] data, uint size);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool EndUpdateResource(IntPtr hUpdate, bool discard);
}
"@

$handle = [SeaResource]::BeginUpdateResource($Exe, $false)
if ($handle -eq [IntPtr]::Zero) {
  Write-Error "BeginUpdateResource failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
  exit 1
}
$name = [Runtime.InteropServices.Marshal]::StringToHGlobalUni("NODE_SEA_BLOB")
try {
  $updated = [SeaResource]::UpdateResource($handle, [IntPtr]10, $name, 0, $bytes, [uint32]$bytes.Length)
  if (-not $updated) {
    Write-Error "UpdateResource failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
    [SeaResource]::EndUpdateResource($handle, $true) | Out-Null
    exit 1
  }
} finally {
  [Runtime.InteropServices.Marshal]::FreeHGlobal($name)
}
if (-not [SeaResource]::EndUpdateResource($handle, $false)) {
  Write-Error "EndUpdateResource failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
  exit 1
}
