const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = 'mai-pet-deepseek-settings.json';
const MEMORY_FILE = 'mai-pet-memory.json';
const WORK_FILE = 'mai-work.json';
const STABLE_USER_DATA_FOLDER = 'Mai Sakurajima';
const LEGACY_USER_DATA_FOLDERS = [
  '麻衣桌宠 DeepSeek版',
  'mai-desktop-pet-deepseek'
];

function copyLegacyFileIfNeeded(sourceDirectory, targetDirectory, fileName) {
  const source = path.join(sourceDirectory, fileName);
  const target = path.join(targetDirectory, fileName);
  if (!fs.existsSync(target) && fs.existsSync(source)) {
    fs.copyFileSync(source, target);
    return true;
  }
  return false;
}

function initializeStorage(app, argv = process.argv) {
  const explicitUserData = argv.some((argument) => String(argument).startsWith('--user-data-dir'));
  const originalUserData = app.getPath('userData');
  let userDataDirectory = originalUserData;
  let migratedFrom = '';

  if (!explicitUserData) {
    const appDataDirectory = app.getPath('appData');
    userDataDirectory = path.join(appDataDirectory, STABLE_USER_DATA_FOLDER);
    fs.mkdirSync(userDataDirectory, { recursive: true });

    const candidates = [
      originalUserData,
      ...LEGACY_USER_DATA_FOLDERS.map((folder) => path.join(appDataDirectory, folder))
    ].filter((candidate, index, values) => (
      path.resolve(candidate) !== path.resolve(userDataDirectory)
      && values.findIndex((value) => path.resolve(value) === path.resolve(candidate)) === index
    ));

    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) continue;
      const copiedSettings = copyLegacyFileIfNeeded(candidate, userDataDirectory, SETTINGS_FILE);
      const copiedMemory = copyLegacyFileIfNeeded(candidate, userDataDirectory, MEMORY_FILE);
      if (copiedSettings || copiedMemory) {
        migratedFrom = candidate;
      }
      if (
        fs.existsSync(path.join(userDataDirectory, SETTINGS_FILE))
        && fs.existsSync(path.join(userDataDirectory, MEMORY_FILE))
      ) {
        break;
      }
    }
    app.setPath('userData', userDataDirectory);
  }

  fs.mkdirSync(userDataDirectory, { recursive: true });
  return {
    userDataDirectory,
    settingsPath: path.join(userDataDirectory, SETTINGS_FILE),
    memoryPath: path.join(userDataDirectory, MEMORY_FILE),
    workPath: path.join(userDataDirectory, WORK_FILE),
    migratedFrom
  };
}

module.exports = {
  MEMORY_FILE,
  SETTINGS_FILE,
  WORK_FILE,
  initializeStorage
};
