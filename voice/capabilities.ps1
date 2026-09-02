$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

try {
  Add-Type -AssemblyName System.Speech
  $recognizers = @(
    [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() |
      ForEach-Object {
        [pscustomobject]@{
          id = $_.Id
          name = $_.Name
          culture = $_.Culture.Name
          description = $_.Description
        }
      }
  )
  $preferred = $recognizers | Where-Object { $_.culture -eq 'zh-CN' } | Select-Object -First 1
  if (-not $preferred) {
    $preferred = $recognizers | Select-Object -First 1
  }
  [pscustomobject]@{
    ok = $true
    available = $recognizers.Count -gt 0
    recognizers = $recognizers
    defaultCulture = if ($preferred) { $preferred.culture } else { '' }
  } | ConvertTo-Json -Depth 5 -Compress
} catch {
  [pscustomobject]@{
    ok = $false
    available = $false
    code = 'speech_unavailable'
    error = $_.Exception.Message
    recognizers = @()
    defaultCulture = ''
  } | ConvertTo-Json -Depth 5 -Compress
}
