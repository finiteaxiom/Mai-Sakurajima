'use strict';

const fs = require('node:fs');
const path = require('node:path');

function resolveElectronExecutable(explicitPath = '') {
  if (explicitPath) {
    const executable = path.resolve(explicitPath);
    if (fs.existsSync(executable)) return executable;
    throw new Error(`Electron executable does not exist: ${executable}`);
  }

  try {
    const executable = require('electron');
    if (typeof executable === 'string' && fs.existsSync(executable)) {
      return executable;
    }
  } catch (error) {
    throw new Error(
      `Electron is declared but its executable is unavailable. Run "npm install" or "npm rebuild electron" before testing. ${error.message}`,
      { cause: error }
    );
  }

  throw new Error('Electron is declared but its executable is unavailable. Run "npm install" or "npm rebuild electron" before testing.');
}

module.exports = { resolveElectronExecutable };
