param(
  [Parameter(Mandatory = $true)]
  [string]$InstallDirectory,
  [Parameter(Mandatory = $true)]
  [string]$SourceDirectory
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Send-MaiProgress {
  param(
    [int]$Percent,
    [string]$Stage,
    [string]$Detail
  )
  $payload = @{
    percent = [Math]::Max(0, [Math]::Min(100, $Percent))
    stage = $Stage
    detail = $Detail
  } | ConvertTo-Json -Compress
  Write-Output "MAI_PROGRESS:$payload"
}

function Invoke-Checked {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $FilePath (exit code $LASTEXITCODE)."
  }
}

$InstallDirectory = [IO.Path]::GetFullPath($InstallDirectory)
$SourceDirectory = [IO.Path]::GetFullPath($SourceDirectory)
$RuntimeDirectory = Join-Path $InstallDirectory 'runtime'
$DownloadDirectory = Join-Path $InstallDirectory 'downloads'
$ModelsDirectory = Join-Path $InstallDirectory 'models'
$ModelDirectory = Join-Path $ModelsDirectory 'CosyVoice-300M-SFT'
$InstructModelDirectory = Join-Path $ModelsDirectory 'CosyVoice-300M-Instruct'
$SenseVoiceModelDirectory = Join-Path $ModelsDirectory 'SenseVoiceSmall'
$PythonPath = Join-Path $RuntimeDirectory 'python.exe'
$PythonInstaller = Join-Path $DownloadDirectory 'python-3.10.11-amd64.exe'
$PythonUrl = 'https://www.python.org/ftp/python/3.10.11/python-3.10.11-amd64.exe'
$ExpectedPythonMd5 = 'a55e9c1e6421c84a4bd8b4be41492f51'
$RequirementsPath = Join-Path $SourceDirectory 'vendor\CosyVoice\requirements.txt'
$DownloadModelScript = Join-Path $SourceDirectory 'download_model.py'

New-Item -ItemType Directory -Path $InstallDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $DownloadDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $ModelsDirectory -Force | Out-Null

$driveRoot = [IO.Path]::GetPathRoot($InstallDirectory)
$freeBytes = ([IO.DriveInfo]::new($driveRoot)).AvailableFreeSpace
$existingBytes = (Get-ChildItem -LiteralPath $InstallDirectory -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
if (($freeBytes + [long]$existingBytes) -lt 16GB) {
  throw 'DISK_SPACE_LOW'
}

Send-MaiProgress 3 'prepare' 'checking-runtime'
if (-not (Test-Path -LiteralPath $PythonPath)) {
  if (-not (Test-Path -LiteralPath $PythonInstaller)) {
    Send-MaiProgress 7 'download-runtime' 'downloading-python'
    Invoke-WebRequest -UseBasicParsing -Uri $PythonUrl -OutFile $PythonInstaller
  }
  $actualMd5 = (Get-FileHash -LiteralPath $PythonInstaller -Algorithm MD5).Hash.ToLowerInvariant()
  if ($actualMd5 -ne $ExpectedPythonMd5) {
    throw 'PYTHON_CHECKSUM_FAILED'
  }
  $signature = Get-AuthenticodeSignature -LiteralPath $PythonInstaller
  $signer = [string]$signature.SignerCertificate.Subject
  if ($signature.Status -ne 'Valid' -or $signer -notmatch 'Python Software Foundation') {
    throw 'PYTHON_SIGNATURE_INVALID'
  }
  Send-MaiProgress 12 'install-runtime' 'installing-private-python'
  $arguments = @(
    '/quiet',
    'InstallAllUsers=0',
    ('TargetDir="{0}"' -f $RuntimeDirectory),
    'Include_launcher=0',
    'Include_test=0',
    'Include_doc=0',
    'Include_tcltk=0',
    'AssociateFiles=0',
    'Shortcuts=0',
    'PrependPath=0',
    'Include_pip=1'
  )
  $process = Start-Process -FilePath $PythonInstaller -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden
  if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $PythonPath)) {
    throw "PYTHON_INSTALL_FAILED:$($process.ExitCode)"
  }
}

if (-not (Test-Path -LiteralPath $RequirementsPath)) {
  throw 'COSYVOICE_REQUIREMENTS_MISSING'
}

Send-MaiProgress 18 'install-dependencies' 'upgrading-pip'
Invoke-Checked $PythonPath @(
  '-m', 'pip', 'install',
  '--disable-pip-version-check',
  '--no-warn-script-location',
  '--upgrade',
  'pip==24.3.1',
  'setuptools==75.1.0',
  'wheel==0.44.0'
)

Send-MaiProgress 24 'install-dependencies' 'downloading-pytorch'
Invoke-Checked $PythonPath @(
  '-m', 'pip', 'install',
  '--disable-pip-version-check',
  '--no-warn-script-location',
  '--prefer-binary',
  '--no-cache-dir',
  '--timeout', '300',
  '--retries', '10',
  '--index-url', 'https://download.pytorch.org/whl/cu121',
  'torch==2.3.1',
  'torchaudio==2.3.1'
)

Send-MaiProgress 38 'install-dependencies' 'installing-gpu-runtime'
Invoke-Checked $PythonPath @(
  '-m', 'pip', 'install',
  '--disable-pip-version-check',
  '--no-warn-script-location',
  '--prefer-binary',
  '--no-build-isolation',
  '--no-cache-dir',
  '--timeout', '300',
  '--retries', '10',
  '-r', $RequirementsPath
)

Send-MaiProgress 50 'install-dependencies' 'installing-sensevoice-runtime'
Invoke-Checked $PythonPath @(
  '-m', 'pip', 'install',
  '--disable-pip-version-check',
  '--no-warn-script-location',
  '--prefer-binary',
  '--no-cache-dir',
  '--timeout', '300',
  '--retries', '10',
  'funasr==1.3.22'
)

Send-MaiProgress 58 'download-model' 'checking-cosyvoice-base-model'
$env:MODELSCOPE_CACHE = Join-Path $InstallDirectory 'modelscope-cache'
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
Invoke-Checked $PythonPath @(
  $DownloadModelScript,
  '--kind', 'cosyvoice',
  '--model-id', 'iic/CosyVoice-300M-SFT',
  '--output', $ModelDirectory
)

Send-MaiProgress 66 'download-model' 'downloading-emotion-voice-model'
Invoke-Checked $PythonPath @(
  $DownloadModelScript,
  '--kind', 'cosyvoice',
  '--model-id', 'iic/CosyVoice-300M-Instruct',
  '--output', $InstructModelDirectory
)

Send-MaiProgress 82 'download-model' 'downloading-sensevoice-model'
Invoke-Checked $PythonPath @(
  $DownloadModelScript,
  '--kind', 'sensevoice',
  '--model-id', 'iic/SenseVoiceSmall',
  '--output', $SenseVoiceModelDirectory
)

Send-MaiProgress 94 'verify' 'verifying-model'
$requiredModelFiles = @(
  'campplus.onnx',
  'cosyvoice.yaml',
  'flow.pt',
  'hift.pt',
  'llm.pt',
  'speech_tokenizer_v1.onnx',
  'spk2info.pt'
)
foreach ($file in $requiredModelFiles) {
  if (-not (Test-Path -LiteralPath (Join-Path $ModelDirectory $file))) {
    throw "MODEL_FILE_MISSING:$file"
  }
  if (-not (Test-Path -LiteralPath (Join-Path $InstructModelDirectory $file))) {
    throw "MODEL_FILE_MISSING:CosyVoice-300M-Instruct/$file"
  }
}
$requiredSenseVoiceFiles = @(
  'am.mvn',
  'chn_jpn_yue_eng_ko_spectok.bpe.model',
  'config.yaml',
  'configuration.json',
  'model.pt'
)
foreach ($file in $requiredSenseVoiceFiles) {
  if (-not (Test-Path -LiteralPath (Join-Path $SenseVoiceModelDirectory $file))) {
    throw "MODEL_FILE_MISSING:SenseVoiceSmall/$file"
  }
}

$marker = @{
  version = 2
  modelId = 'FunAudioLLM/CosyVoice-300M-Instruct'
  fallbackModelId = 'FunAudioLLM/CosyVoice-300M-SFT'
  senseVoiceModelId = 'FunAudioLLM/SenseVoiceSmall'
  speaker = 'zh-female'
  installedAt = [DateTime]::UtcNow.ToString('o')
  python = '3.10.11'
} | ConvertTo-Json
[IO.File]::WriteAllText(
  (Join-Path $InstallDirectory 'install.json'),
  $marker,
  [Text.UTF8Encoding]::new($false)
)

Send-MaiProgress 100 'complete' 'local-voice-ready'
