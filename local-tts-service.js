const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const MODEL_ID = 'FunAudioLLM/CosyVoice-300M-Instruct';
const MODEL_NAME = 'CosyVoice 情绪女声 · 中文女';
const MODEL_DIRECTORY_NAME = 'CosyVoice-300M-SFT';
const INSTRUCT_MODEL_DIRECTORY_NAME = 'CosyVoice-300M-Instruct';
const SENSEVOICE_MODEL_DIRECTORY_NAME = 'SenseVoiceSmall';
const SPEAKER_ID = '中文女';
const INSTALLATION_VERSION = 2;
const REQUIRED_MODEL_FILES = [
  'campplus.onnx',
  'cosyvoice.yaml',
  'flow.pt',
  'hift.pt',
  'llm.pt',
  'speech_tokenizer_v1.onnx',
  'spk2info.pt'
];

function boundedNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, number));
}

function defaultInstallDirectory() {
  const localRoot = process.env.LOCALAPPDATA
    || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localRoot, 'Mai Sakurajima', 'voice-engine');
}

function externalVoiceEngineDirectory(baseDirectory = __dirname) {
  const normalized = String(baseDirectory || '');
  const unpackedBase = /app\.asar(?:[\\/]|$)/i.test(normalized)
    ? normalized.replace(/app\.asar(?=[\\/]|$)/i, 'app.asar.unpacked')
    : normalized;
  return path.join(unpackedBase, 'voice-engine');
}

function installationPaths(installDirectory) {
  const root = path.resolve(installDirectory || defaultInstallDirectory());
  return {
    root,
    python: path.join(root, 'runtime', 'python.exe'),
    model: path.join(root, 'models', MODEL_DIRECTORY_NAME),
    instructModel: path.join(root, 'models', INSTRUCT_MODEL_DIRECTORY_NAME),
    senseVoiceModel: path.join(root, 'models', SENSEVOICE_MODEL_DIRECTORY_NAME),
    marker: path.join(root, 'install.json'),
    cache: path.join(root, 'cache')
  };
}

function coreInstallationReady(installDirectory) {
  const paths = installationPaths(installDirectory);
  return fs.existsSync(paths.python)
    && fs.existsSync(paths.marker)
    && REQUIRED_MODEL_FILES.every((name) => fs.existsSync(path.join(paths.model, name)));
}

function installationReady(installDirectory) {
  const paths = installationPaths(installDirectory);
  return coreInstallationReady(installDirectory)
    && REQUIRED_MODEL_FILES.every((name) => fs.existsSync(path.join(paths.instructModel, name)))
    && fs.existsSync(path.join(paths.senseVoiceModel, 'config.yaml'))
    && fs.existsSync(path.join(paths.senseVoiceModel, 'model.pt'));
}

function parseEngineLine(line) {
  const text = String(line || '').trim();
  if (!text.startsWith('{') || !text.endsWith('}')) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function publicInstallError(error) {
  const message = String(error?.message || error || '').trim();
  if (/DISK_SPACE_LOW/.test(message)) {
    return '本地情绪语音空间不足。请至少准备 16 GB 总空间，再点击重试安装。';
  }
  if (/PYTHON_CHECKSUM_FAILED/.test(message)) {
    return '本地运行环境下载不完整。请重试安装，程序会重新校验文件。';
  }
  if (/PYTHON_SIGNATURE_INVALID/.test(message)) {
    return '本地运行环境的数字签名校验失败，已为安全起见停止安装。';
  }
  if (/PYTHON_INSTALL_FAILED/.test(message)) {
    return '独立的 Python 3.10 运行环境安装失败，请关闭安全软件拦截后重试。';
  }
  if (/COSYVOICE_REQUIREMENTS_MISSING/.test(message)) {
    return 'v2.5.0 的本地情绪语音文件不完整，请重新安装应用。';
  }
  if (/MODEL_FILE_MISSING/.test(message)) {
    return '本地女声模型下载不完整，请联网后重试安装。';
  }
  if (/ENOSPC|no space/i.test(message)) {
    return '本地情绪语音安装空间不足。请至少预留 16 GB 可用空间。';
  }
  if (/network|connect|timed out|resolve|download|SSL|TLS/i.test(message)) {
    return '本地女声下载失败，请检查网络后点击“重试安装”。已经下载的文件会继续复用。';
  }
  return message || '本地女声安装失败，请重试。';
}

class LocalTtsService {
  constructor(options = {}) {
    this.installDirectory = path.resolve(options.installDirectory || defaultInstallDirectory());
    this.scriptsDirectory = path.resolve(
      options.scriptsDirectory || externalVoiceEngineDirectory()
    );
    this.onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};
    this.engine = null;
    this.installProcess = null;
    this.installPromise = null;
    this.startPromise = null;
    this.pending = new Map();
    this.nextRequestId = 1;
    this.engineState = 'stopped';
    this.installProgress = null;
    this.lastError = '';
    this.runtimeInfo = null;
  }

  status() {
    const installed = coreInstallationReady(this.installDirectory);
    const enhanced = installationReady(this.installDirectory);
    return {
      engine: 'cosyvoice',
      modelId: MODEL_ID,
      modelName: MODEL_NAME,
      speaker: SPEAKER_ID,
      installed,
      enhanced,
      needsUpgrade: installed && !enhanced,
      ready: installed && this.engineState === 'ready' && Boolean(this.engine),
      state: this.installProcess ? 'installing' : this.engineState,
      installDirectory: this.installDirectory,
      installProgress: this.installProgress,
      error: this.lastError,
      runtime: this.runtimeInfo,
      downloadSizeGb: 11,
      requiredFreeSpaceGb: 16
    };
  }

  emitStatus() {
    const status = this.status();
    this.onStatus(status);
    return status;
  }

  handleEngineMessage(message) {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'ready') {
      this.engineState = 'ready';
      this.lastError = '';
      this.runtimeInfo = {
        cuda: message.cuda === true,
        device: String(message.device || (message.cuda ? 'CUDA' : 'CPU')),
        sampleRate: Number(message.sampleRate) || 22050,
        speakers: Array.isArray(message.speakers) ? message.speakers.slice(0, 20) : [],
        expressive: message.expressive === true,
        senseVoice: message.senseVoice === true
      };
      this.emitStatus();
      return;
    }
    if (!message.id) return;
    const pending = this.pending.get(String(message.id));
    if (!pending) return;
    this.pending.delete(String(message.id));
    clearTimeout(pending.timer);
    if (message.type === 'result') {
      pending.resolve(message);
    } else {
      pending.reject(new Error(String(message.error || '本地女声合成失败。')));
    }
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  start() {
    if (this.engine && this.engineState === 'ready') {
      return Promise.resolve(this.status());
    }
    if (this.startPromise) return this.startPromise;
    if (!coreInstallationReady(this.installDirectory)) {
      return Promise.reject(new Error('高质量本地女声尚未安装。'));
    }

    const paths = installationPaths(this.installDirectory);
    const engineScript = path.join(this.scriptsDirectory, 'engine.py');
    const repoDirectory = path.join(this.scriptsDirectory, 'vendor', 'CosyVoice');
    if (!fs.existsSync(engineScript) || !fs.existsSync(repoDirectory)) {
      return Promise.reject(new Error('本地女声程序文件不完整，请重新安装 v2.5.0。'));
    }
    fs.mkdirSync(paths.cache, { recursive: true });
    const modelscopeCache = path.join(this.installDirectory, 'modelscope-cache');
    const huggingFaceCache = path.join(this.installDirectory, 'huggingface-cache');
    const matplotlibCache = path.join(this.installDirectory, 'matplotlib-cache');
    fs.mkdirSync(modelscopeCache, { recursive: true });
    fs.mkdirSync(huggingFaceCache, { recursive: true });
    fs.mkdirSync(matplotlibCache, { recursive: true });
    this.engineState = 'starting';
    this.lastError = '';
    this.emitStatus();

    this.startPromise = new Promise((resolve, reject) => {
      const child = spawn(paths.python, [
        '-u',
        engineScript,
        '--repo', repoDirectory,
        '--model', paths.model,
        '--instruct-model', paths.instructModel,
        '--sense-model', paths.senseVoiceModel,
        '--output-dir', paths.cache
      ], {
        cwd: repoDirectory,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PYTHONUTF8: '1',
          PYTHONIOENCODING: 'utf-8',
          MODELSCOPE_CACHE: modelscopeCache,
          HF_HOME: huggingFaceCache,
          MPLCONFIGDIR: matplotlibCache,
          TOKENIZERS_PARALLELISM: 'false'
        }
      });
      this.engine = child;
      let stderrTail = '';
      const output = readline.createInterface({ input: child.stdout });
      const startupTimer = setTimeout(() => {
        const error = new Error('本地女声首次加载超时。请确认显卡驱动正常并重试。');
        this.lastError = error.message;
        this.engineState = 'error';
        child.kill();
        reject(error);
      }, 180000);

      output.on('line', (line) => {
        const message = parseEngineLine(line);
        if (!message) return;
        this.handleEngineMessage(message);
        if (message.type === 'ready') {
          clearTimeout(startupTimer);
          resolve(this.status());
        } else if (message.type === 'fatal') {
          clearTimeout(startupTimer);
          const error = new Error(String(message.error || '本地女声加载失败。'));
          this.lastError = error.message;
          this.engineState = 'error';
          reject(error);
        }
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        stderrTail = `${stderrTail}${chunk}`.slice(-12000);
      });
      child.on('error', (error) => {
        clearTimeout(startupTimer);
        this.lastError = error.message;
        this.engineState = 'error';
        this.emitStatus();
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(startupTimer);
        output.close();
        if (this.engine === child) this.engine = null;
        const unexpected = this.engineState !== 'stopped' && this.engineState !== 'installing';
        if (unexpected) {
          this.engineState = 'error';
          this.lastError = stderrTail.trim().slice(-1200)
            || `本地女声进程已退出（代码 ${code ?? '未知'}）。`;
        }
        this.rejectPending(new Error(this.lastError || '本地女声进程已停止。'));
        this.emitStatus();
      });
    }).finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  async synthesize(input = {}) {
    const text = String(input.text || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
    if (!text) return { ok: false, canceled: false };
    await this.start();
    if (!this.engine || this.engineState !== 'ready') {
      throw new Error('本地女声尚未就绪。');
    }
    const id = String(this.nextRequestId++);
    const speed = boundedNumber(input.rate, 0.75, 1.3, 1);
    const emotion = String(input.emotion || 'neutral').trim().slice(0, 24);
    const instruction = String(input.instruction || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('本地女声生成超时，请缩短回复后重试。'));
      }, Math.max(60000, Math.min(300000, text.length * 1200)));
      this.pending.set(id, { resolve, reject, timer });
      this.engine.stdin.write(`${JSON.stringify({
        type: 'synthesize',
        id,
        text,
        speed,
        speaker: SPEAKER_ID,
        emotion,
        instruction
      })}\n`);
    });
    const audioPath = path.resolve(String(result.path || ''));
    const cacheRoot = `${path.resolve(installationPaths(this.installDirectory).cache)}${path.sep}`;
    if (!audioPath.startsWith(cacheRoot) || !fs.existsSync(audioPath)) {
      throw new Error('本地女声没有生成可播放的音频。');
    }
    const audio = await fs.promises.readFile(audioPath);
    fs.promises.unlink(audioPath).catch(() => {});
    return {
      ok: true,
      engine: 'cosyvoice',
      mimeType: 'audio/wav',
      audioBase64: audio.toString('base64'),
      durationMs: Number(result.durationMs) || 0,
      device: String(result.device || this.runtimeInfo?.device || '')
    };
  }

  async analyzeAudio(input = {}) {
    const audioBase64 = String(input.audioBase64 || '').trim();
    if (!audioBase64 || audioBase64.length > 16_000_000) {
      return { ok: false, available: false, emotion: '', text: '', events: [] };
    }
    if (!installationReady(this.installDirectory)) {
      return { ok: false, available: false, emotion: '', text: '', events: [] };
    }
    await this.start();
    if (!this.engine || this.engineState !== 'ready') {
      return { ok: false, available: false, emotion: '', text: '', events: [] };
    }
    const id = String(this.nextRequestId++);
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('本地语气识别超时。'));
      }, 90000);
      this.pending.set(id, { resolve, reject, timer });
      this.engine.stdin.write(`${JSON.stringify({
        type: 'analyze',
        id,
        audioBase64,
        mimeType: String(input.mimeType || 'audio/wav').slice(0, 80)
      })}\n`);
    });
    return {
      ok: true,
      available: true,
      emotion: String(result.emotion || ''),
      text: String(result.text || '').trim().slice(0, 3000),
      language: String(result.language || ''),
      events: Array.isArray(result.events) ? result.events.slice(0, 8) : []
    };
  }

  install() {
    if (this.installPromise) return this.installPromise;
    const installScript = path.join(this.scriptsDirectory, 'install.ps1');
    if (!fs.existsSync(installScript)) {
      return Promise.reject(new Error('找不到本地女声安装脚本，请重新安装 v2.5.0。'));
    }
    const systemRoot = process.env.SystemRoot || 'C:\\Windows';
    const powershell = path.join(
      systemRoot,
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    );
    fs.mkdirSync(this.installDirectory, { recursive: true });
    this.stop();
    this.engineState = 'installing';
    this.installProgress = { percent: 1, stage: '准备安装', detail: '正在检查本地语音环境…' };
    this.lastError = '';
    this.emitStatus();

    this.installPromise = new Promise((resolve, reject) => {
      const child = spawn(powershell, [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        installScript,
        '-InstallDirectory',
        this.installDirectory,
        '-SourceDirectory',
        this.scriptsDirectory
      ], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      this.installProcess = child;
      let stderrTail = '';
      const output = readline.createInterface({ input: child.stdout });
      output.on('line', (line) => {
        const marker = 'MAI_PROGRESS:';
        const index = line.indexOf(marker);
        if (index < 0) return;
        const progress = parseEngineLine(line.slice(index + marker.length));
        if (!progress) return;
        this.installProgress = {
          percent: Math.max(0, Math.min(100, Number(progress.percent) || 0)),
          stage: String(progress.stage || '正在安装'),
          detail: String(progress.detail || '')
        };
        this.emitStatus();
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        stderrTail = `${stderrTail}${chunk}`.slice(-16000);
      });
      child.on('error', reject);
      child.on('close', (code) => {
        output.close();
        this.installProcess = null;
        if (code === 0 && installationReady(this.installDirectory)) {
          this.engineState = 'stopped';
          this.installProgress = { percent: 100, stage: '安装完成', detail: '正在加载麻衣的本地女声…' };
          this.emitStatus();
          this.start().then(resolve, reject);
          return;
        }
        const error = new Error(stderrTail.trim().slice(-1600) || `本地女声安装程序退出（代码 ${code ?? '未知'}）。`);
        this.engineState = 'error';
        this.lastError = publicInstallError(error);
        this.installProgress = null;
        this.emitStatus();
        reject(new Error(this.lastError));
      });
    }).finally(() => {
      this.installPromise = null;
    });
    return this.installPromise;
  }

  stop() {
    if (!this.engine) {
      if (this.engineState !== 'installing') this.engineState = 'stopped';
      return false;
    }
    const child = this.engine;
    this.engine = null;
    this.engineState = 'stopped';
    try {
      child.stdin.write(`${JSON.stringify({ type: 'shutdown' })}\n`);
    } catch {
      child.kill();
    }
    setTimeout(() => {
      if (!child.killed) child.kill();
    }, 1500).unref?.();
    this.rejectPending(new Error('本地女声播放已停止。'));
    this.emitStatus();
    return true;
  }

  cancelInstall() {
    if (!this.installProcess) return false;
    this.installProcess.kill();
    return true;
  }

  dispose() {
    this.cancelInstall();
    this.stop();
  }
}

module.exports = {
  INSTALLATION_VERSION,
  INSTRUCT_MODEL_DIRECTORY_NAME,
  LocalTtsService,
  MODEL_DIRECTORY_NAME,
  MODEL_ID,
  MODEL_NAME,
  REQUIRED_MODEL_FILES,
  SENSEVOICE_MODEL_DIRECTORY_NAME,
  SPEAKER_ID,
  defaultInstallDirectory,
  coreInstallationReady,
  externalVoiceEngineDirectory,
  installationPaths,
  installationReady,
  parseEngineLine,
  publicInstallError
};
