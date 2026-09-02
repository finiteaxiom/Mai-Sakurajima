function registerTimerIpc({ ipcMain, publicReminderState, startReminder, cancelReminder }) {
  ipcMain.handle('timer:get-state', () => publicReminderState());
  ipcMain.handle('timer:start', (_event, input) => (
    startReminder(input?.minutes, input?.label, input?.mode)
  ));
  ipcMain.handle('timer:cancel', cancelReminder);
}

module.exports = { registerTimerIpc };
