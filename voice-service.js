const { spawn } = require('child_process');
const path = require('path');

const MIN_TIMEOUT_SECONDS = 5;
const MAX_TIMEOUT_SECONDS = 45;

function boundedInteger(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(minimum, Math.min(maximum, Math.round(number)));
}

function normalizeCulture(value) {
  const culture = String(value || '').trim();
  return /^[a-z]{2,3}-[a-z]{2,4}$/i.test(culture) ? culture : 'zh-CN';
}

function parseJsonOutput(output) {
  const lines = String(output || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      // PowerShell can emit harmless host messages before the JSON payload.
    }
  }
  throw new Error('Windows 语音服务没有返回可读取的结果。');
}

function publicVoiceError(result) {
  const code = String(result?.code || 'recognition_failed');
  const messages = {
    recognizer_unavailable: '没有找到中文语音识别组件。请在 Windows“语言和区域”中为中文安装语音识别。',
    microphone_unavailable: '无法使用麦克风。请检查默认录音设备和 Windows 麦克风隐私权限。',
    speech_unavailable: '当前 Windows 语音组件不可用。请确认系统语音功能已安装。',
    recognition_failed: '这次没有识别成功，请靠近麦克风后再试。'
  };
  return messages[code] || messages.recognition_failed;
}

function externalScriptsDirectory(baseDirectory = __dirname) {
  const normalized = String(baseDirectory || '');
  const unpackedBase = /app\.asar(?:[\\/]|$)/i.test(normalized)
    ? normalized.replace(/app\.asar(?=[\\/]|$)/i, 'app.asar.unpacked')
    : normalized;
  return path.join(unpackedBase, 'voice');
}

class VoiceService {
  constructor(options = {}) {
    const systemRoot = options.systemRoot || process.env.SystemRoot || 'C:\\Windows';
    this.powershellPath = options.powershellPath
      || path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    this.scriptsDirectory = options.scriptsDirectory || externalScriptsDirectory();
    this.activeRecognition = null;
    this.capabilitiesCache = null;
    this.capabilitiesCachedAt = 0;
  }

  runScript(scriptName, args = [], options = {}) {
    const scriptPath = path.join(this.scriptsDirectory, scriptName);
    const child = spawn(this.powershellPath, [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      ...args.map(String)
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const context = { child, canceled: false };
    if (options.recognition) {
      this.activeRecognition = context;
    }

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      let timer = null;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (this.activeRecognition === context) {
          this.activeRecognition = null;
        }
        callback(value);
      };
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout = `${stdout}${chunk}`.slice(-65536);
      });
      child.stderr.on('data', (chunk) => {
        stderr = `${stderr}${chunk}`.slice(-16384);
      });
      child.on('error', (error) => finish(reject, error));
      child.on('close', () => {
        if (context.canceled) {
          finish(resolve, { ok: false, canceled: true, code: 'canceled', text: '' });
          return;
        }
        try {
          finish(resolve, parseJsonOutput(stdout));
        } catch (error) {
          const detail = stderr.trim();
          finish(reject, new Error(detail ? `${error.message} ${detail}` : error.message));
        }
      });
      timer = setTimeout(() => {
        context.canceled = true;
        child.kill();
        finish(reject, new Error('语音识别等待超时，请重试。'));
      }, Math.max(5000, Number(options.timeoutMs) || 15000));
    });
  }

  async getCapabilities(force = false) {
    if (!force && this.capabilitiesCache && Date.now() - this.capabilitiesCachedAt < 30000) {
      return this.capabilitiesCache;
    }
    const result = await this.runScript('capabilities.ps1', [], { timeoutMs: 12000 });
    const capabilities = {
      available: result?.ok === true && result?.available === true,
      recognizers: Array.isArray(result?.recognizers) ? result.recognizers : [],
      defaultCulture: normalizeCulture(result?.defaultCulture),
      error: result?.ok === true ? '' : publicVoiceError(result)
    };
    this.capabilitiesCache = capabilities;
    this.capabilitiesCachedAt = Date.now();
    return capabilities;
  }

  async recognize(options = {}) {
    if (this.activeRecognition) {
      throw new Error('麦克风正在听你说话。');
    }
    const culture = normalizeCulture(options.culture);
    const timeoutSeconds = boundedInteger(
      options.timeoutSeconds,
      MIN_TIMEOUT_SECONDS,
      MAX_TIMEOUT_SECONDS,
      28
    );
    const result = await this.runScript('recognize.ps1', [
      '-Culture',
      culture,
      '-TimeoutSeconds',
      timeoutSeconds
    ], {
      recognition: true,
      timeoutMs: (timeoutSeconds + 12) * 1000
    });
    if (result?.canceled) {
      return result;
    }
    if (result?.ok !== true) {
      throw new Error(publicVoiceError(result));
    }
    return {
      ok: true,
      code: result.code === 'recognized' ? 'recognized' : 'no_speech',
      text: String(result.text || '').trim().slice(0, 3000),
      confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0)),
      culture: normalizeCulture(result.culture || culture)
    };
  }

  stopRecognition() {
    if (!this.activeRecognition) {
      return false;
    }
    this.activeRecognition.canceled = true;
    this.activeRecognition.child.kill();
    return true;
  }

  dispose() {
    this.stopRecognition();
  }
}

module.exports = {
  VoiceService,
  externalScriptsDirectory,
  normalizeCulture,
  parseJsonOutput,
  publicVoiceError
};
