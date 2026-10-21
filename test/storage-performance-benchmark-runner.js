'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { resolveElectronExecutable } = require('./electron-executable');

const projectRoot = path.resolve(__dirname, '..');
const runnerArguments = process.argv.slice(2);
const runnerOutputIndex = runnerArguments.indexOf('--output');
const explicitElectronPath = runnerArguments.find((argument, index) => (
  !argument.startsWith('--') && index !== runnerOutputIndex + 1
));
const electronExe = resolveElectronExecutable(explicitElectronPath);
const outputPath = path.resolve(runnerOutputIndex >= 0 ? runnerArguments[runnerOutputIndex + 1] : path.join(projectRoot, 'docs', 'performance', 'storage-performance-latest.json'));
const userDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-storage-performance-'));
const smokeOutputPath = path.join(userDataDirectory, 'storage-performance-result.json');

function isoFor(index) {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
}

function chatMessage(sessionIndex, messageIndex) {
  return {
    id: `synthetic-chat-message-${sessionIndex}-${messageIndex}`,
    role: messageIndex % 2 === 0 ? 'user' : 'assistant',
    content: `合成性能基准消息 ${sessionIndex}/${messageIndex}；仅用于临时数据目录。`.padEnd(116, 'x'),
    createdAt: isoFor(sessionIndex * 2500 + messageIndex)
  };
}

function createChatSession(id, title, count, sessionIndex) {
  const messages = Array.from({ length: count }, (_, index) => chatMessage(sessionIndex, index));
  return {
    id,
    title,
    createdAt: messages[0]?.createdAt || isoFor(sessionIndex),
    updatedAt: messages.at(-1)?.createdAt || isoFor(sessionIndex),
    messages
  };
}

function createMemoryFixture() {
  const sessions = [];
  for (let index = 0; index < 8; index += 1) {
    sessions.push(createChatSession(`chat-ordinary-${index}`, `普通合成会话 ${index}`, 30, index));
  }
  for (let index = 0; index < 40; index += 1) {
    sessions.push(createChatSession(`chat-regular-${index}`, `常规合成会话 ${index}`, 250, 20 + index));
  }
  for (let index = 0; index < 6; index += 1) {
    sessions.push(createChatSession(`chat-submit-${index}`, `提交基准会话 ${index}`, 120, 80 + index));
  }
  sessions.push(createChatSession('chat-near-cap', '接近上限的合成会话', 1998, 100));

  return {
    version: 16,
    sessions,
    activeSessionId: 'chat-near-cap',
    facts: [],
    episodes: [],
    topicThreads: [],
    people: [],
    projects: [],
    habits: [],
    commitments: [],
    moments: [],
    lifeItems: [],
    memoryDigests: [],
    behaviorPatterns: [],
    mind: {},
    relationship: {},
    reality: { weather: null }
  };
}

function createWorkFixture() {
  const projects = [];
  const sessions = [];
  for (let projectIndex = 0; projectIndex < 20; projectIndex += 1) {
    const projectId = `synthetic-work-project-${projectIndex}`;
    projects.push({
      id: projectId,
      name: `合成 Work 项目 ${projectIndex}`,
      workspacePath: '',
      createdAt: isoFor(projectIndex),
      updatedAt: isoFor(projectIndex),
      lastOpenedAt: isoFor(projectIndex)
    });
    for (let sessionIndex = 0; sessionIndex < 40; sessionIndex += 1) {
      const id = `synthetic-work-session-${projectIndex}-${sessionIndex}`;
      const messages = Array.from({ length: 50 }, (_, messageIndex) => ({
        id: `synthetic-work-message-${projectIndex}-${sessionIndex}-${messageIndex}`,
        role: messageIndex % 2 === 0 ? 'user' : 'assistant',
        content: `Work 合成消息 ${projectIndex}/${sessionIndex}/${messageIndex}；只存在于临时基准数据。`,
        createdAt: isoFor(projectIndex * 4000 + sessionIndex * 50 + messageIndex)
      }));
      sessions.push({
        id,
        projectId,
        title: `Work 合成记录 ${sessionIndex}`,
        createdAt: messages[0].createdAt,
        updatedAt: messages.at(-1).createdAt,
        messages
      });
    }
  }
  return {
    version: 1,
    projects,
    sessions,
    lastOpenedProjectId: projects[0].id
  };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

function runElectron() {
  const electronArguments = [
    projectRoot,
    `--user-data-dir=${userDataDirectory}`,
    '--disable-gpu',
    '--disable-gpu-compositing'
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(electronExe, electronArguments, {
      cwd: projectRoot,
      env: {
        ...process.env,
        MAI_EXPECTED_USER_DATA_DIR: userDataDirectory,
        MAI_STORAGE_PERF_SMOKE: '1',
        MAI_STORAGE_PERF_OUTPUT: smokeOutputPath
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Storage performance smoke timed out.\n${stdout}\n${stderr}`));
    }, 180000);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Storage performance smoke exited ${code}.\n${stdout}\n${stderr}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function main() {
  try {
    const memory = createMemoryFixture();
    const work = createWorkFixture();
    const memoryPath = path.join(userDataDirectory, 'mai-pet-memory.json');
    const workPath = path.join(userDataDirectory, 'mai-work.json');
    writeJson(memoryPath, memory);
    writeJson(workPath, work);

    const fixture = {
      memoryBytes: fs.statSync(memoryPath).size,
      memorySessions: memory.sessions.length,
      memoryMessages: memory.sessions.reduce((count, session) => count + session.messages.length, 0),
      nearCapSessionMessages: 1998,
      workBytes: fs.statSync(workPath).size,
      workProjects: work.projects.length,
      workSessions: work.sessions.length,
      workMessages: work.sessions.reduce((count, session) => count + session.messages.length, 0)
    };
    const { stdout, stderr } = await runElectron();
    assert.ok(fs.existsSync(smokeOutputPath), `Main smoke did not write a result.\n${stdout}\n${stderr}`);
    const result = JSON.parse(fs.readFileSync(smokeOutputPath, 'utf8'));
    assert.equal(result.ok, true, result.error || 'Main storage performance smoke failed.');

    const report = {
      ...result,
      userDataIsolation: {
        ...result.userDataIsolation,
        resolvedDirectory: '<temporary userData; verified against MAI_EXPECTED_USER_DATA_DIR>'
      },
      fixture,
      runner: {
        generatedAt: new Date().toISOString(),
        electronExecutable: path.basename(electronExe),
        isolatedUserData: true,
        temporaryUserDataDirectory: '<temporary; removed after run>'
      }
    };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ ok: true, outputPath, fixture, summary: result.summary || {} }, null, 2));
  } finally {
    fs.rmSync(userDataDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
