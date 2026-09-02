function registerVoiceIpc({ ipcMain, voiceService, localTtsService, getVoiceSettings }) {
  ipcMain.handle('voice:get-capabilities', async () => ({
    ...await voiceService.getCapabilities(),
    localTts: localTtsService.status()
  }));

  ipcMain.handle('voice:get-local-status', () => localTtsService.status());

  ipcMain.handle('voice:install-local', () => localTtsService.install());

  ipcMain.handle('voice:cancel-local-install', () => ({
    canceled: localTtsService.cancelInstall()
  }));

  ipcMain.handle('voice:synthesize', (_event, input) => {
    const voiceSettings = getVoiceSettings();
    return localTtsService.synthesize({
      text: input?.text,
      rate: input?.rate ?? voiceSettings.rate,
      emotion: input?.emotion,
      instruction: input?.instruction
    });
  });

  ipcMain.handle('voice:analyze-audio', (_event, input) => localTtsService.analyzeAudio({
    audioBase64: input?.audioBase64,
    mimeType: input?.mimeType
  }));

  ipcMain.handle('voice:listen', (_event, input) => {
    const voiceSettings = getVoiceSettings();
    return voiceService.recognize({
      culture: input?.culture || voiceSettings.culture,
      timeoutSeconds: input?.timeoutSeconds
    });
  });

  ipcMain.handle('voice:stop-listening', () => ({
    stopped: voiceService.stopRecognition()
  }));
}

module.exports = { registerVoiceIpc };
