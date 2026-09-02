const { execFile } = require('node:child_process');

const FOREGROUND_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class MaiForegroundWindow {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
'@
$handle = [MaiForegroundWindow]::GetForegroundWindow()
$processIdValue = 0
[void][MaiForegroundWindow]::GetWindowThreadProcessId($handle, [ref]$processIdValue)
$process = Get-Process -Id $processIdValue -ErrorAction Stop
[pscustomobject]@{ processName = $process.ProcessName; pid = [int]$processIdValue } | ConvertTo-Json -Compress
`;

function encodedPowerShell(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function parseForegroundResult(stdout) {
  const lines = String(stdout || '').replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(lines[index]);
      const processName = String(value?.processName || '').replace(/\.exe$/i, '').trim().slice(0, 100);
      if (processName) return { processName, pid: Math.max(0, Number(value?.pid) || 0) };
    } catch {
      // PowerShell can emit harmless host output before the JSON line.
    }
  }
  return null;
}

function readForegroundApplication(options = {}) {
  const timeout = Math.max(1000, Math.min(10000, Number(options.timeout) || 4000));
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedPowerShell(FOREGROUND_SCRIPT)],
      { windowsHide: true, timeout, encoding: 'utf8', maxBuffer: 1024 * 256 },
      (error, stdout) => resolve(error ? null : parseForegroundResult(stdout))
    );
  });
}

module.exports = {
  FOREGROUND_SCRIPT,
  parseForegroundResult,
  readForegroundApplication
};
