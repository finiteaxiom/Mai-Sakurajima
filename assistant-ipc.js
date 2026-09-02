function registerAssistantIpc({
  ipcMain,
  publicAssistantState,
  updateAssistantSettings,
  createAssistantBriefing,
  answerPromise,
  startFocus
}) {
  ipcMain.handle('assistant:get-state', () => publicAssistantState());
  ipcMain.handle('assistant:save-settings', (_event, input) => updateAssistantSettings(input));
  ipcMain.handle('assistant:create-briefing', (_event, type) => createAssistantBriefing(type));
  ipcMain.handle('assistant:answer-promise', (_event, id, response) => answerPromise(id, response));
  ipcMain.handle('assistant:start-focus', (_event, input) => startFocus(input));
}

module.exports = { registerAssistantIpc };
