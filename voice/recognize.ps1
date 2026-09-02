# Keep this script encoded as UTF-8 with BOM for Windows PowerShell 5.1.
param(
  [string]$Culture = 'zh-CN',
  [ValidateRange(5, 45)]
  [int]$TimeoutSeconds = 28
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$engine = $null

try {
  Add-Type -AssemblyName System.Speech
  $recognizers = @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers())
  $recognizer = $recognizers | Where-Object { $_.Culture.Name -eq $Culture } | Select-Object -First 1
  if (-not $recognizer -and $Culture.StartsWith('zh', [System.StringComparison]::OrdinalIgnoreCase)) {
    $recognizer = $recognizers | Where-Object { $_.Culture.Name.StartsWith('zh', [System.StringComparison]::OrdinalIgnoreCase) } | Select-Object -First 1
  }
  if (-not $recognizer) {
    [pscustomobject]@{
      ok = $false
      code = 'recognizer_unavailable'
      error = "Windows 中没有安装 $Culture 语音识别器。"
      text = ''
    } | ConvertTo-Json -Compress
    exit 0
  }

  $engine = [System.Speech.Recognition.SpeechRecognitionEngine]::new($recognizer)
  $engine.InitialSilenceTimeout = [TimeSpan]::FromSeconds([Math]::Min(10, $TimeoutSeconds))
  $engine.BabbleTimeout = [TimeSpan]::FromSeconds(8)
  $engine.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(900)
  $engine.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromMilliseconds(1300)
  $engine.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())
  $engine.SetInputToDefaultAudioDevice()
  $result = $engine.Recognize([TimeSpan]::FromSeconds($TimeoutSeconds))

  if ($null -eq $result -or [string]::IsNullOrWhiteSpace($result.Text)) {
    [pscustomobject]@{
      ok = $true
      code = 'no_speech'
      text = ''
      confidence = 0
      culture = $recognizer.Culture.Name
    } | ConvertTo-Json -Compress
  } else {
    [pscustomobject]@{
      ok = $true
      code = 'recognized'
      text = $result.Text.Trim()
      confidence = [Math]::Round([double]$result.Confidence, 3)
      culture = $recognizer.Culture.Name
    } | ConvertTo-Json -Compress
  }
} catch {
  $message = $_.Exception.Message
  $code = if ($message -match 'audio|音频|microphone|麦克风|input device') { 'microphone_unavailable' } else { 'recognition_failed' }
  [pscustomobject]@{
    ok = $false
    code = $code
    error = $message
    text = ''
  } | ConvertTo-Json -Compress
} finally {
  if ($null -ne $engine) {
    $engine.Dispose()
  }
}
