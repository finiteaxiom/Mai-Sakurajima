const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { resolveElectronExecutable } = require('./electron-executable');

const electronExe = resolveElectronExecutable(process.argv[2]);

const projectRoot = path.resolve(__dirname, '..');
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-v600-migration-'));
const memoryPath = path.join(testRoot, 'mai-pet-memory.json');
const settingsPath = path.join(testRoot, 'mai-pet-deepseek-settings.json');
const oldMemory = {
  version: 10,
  facts: [{
    id: 'fact-keep',
    text: '用户最喜欢草莓蛋糕',
    key: 'preference.dessert',
    category: 'preference',
    importance: 5,
    confidence: 1,
    evidence: '我最喜欢草莓蛋糕',
    source: 'manual',
    createdAt: '2026-07-30T10:00:00.000Z',
    updatedAt: '2026-07-30T10:00:00.000Z'
  }, {
    id: 'goal-keep', text: '用户计划今年通过日语 N2', key: 'goal.japanese.n2', category: 'goal',
    importance: 5, confidence: 1, evidence: '我计划今年通过日语 N2', source: 'manual',
    createdAt: '2026-07-30T10:00:00.000Z', updatedAt: '2026-07-30T10:00:00.000Z'
  }, {
    id: 'routine-keep', text: '用户每天背二十个单词', key: 'routine.vocabulary', category: 'routine',
    importance: 4, confidence: 1, evidence: '我每天背二十个单词', source: 'manual',
    createdAt: '2026-07-30T10:00:00.000Z', updatedAt: '2026-07-30T10:00:00.000Z'
  }],
  sessions: [{
    id: 'old-session',
    title: '旧版对话',
    createdAt: '2026-07-30T10:00:00.000Z',
    updatedAt: '2026-07-30T10:01:00.000Z',
    messages: [
      { role: 'user', content: '我的朋友叫小林，她也喜欢看电影。', createdAt: '2026-07-30T10:00:00.000Z' },
      { role: 'assistant', content: '下次可以和小林一起选片。', createdAt: '2026-07-30T10:01:00.000Z' }
    ]
  }],
  activeSessionId: 'old-session',
  agentSessions: [{
    id: 'legacy-agent-session',
    title: '旧任务',
    createdAt: '2026-08-09T10:03:00.000Z',
    updatedAt: '2026-08-09T10:04:00.000Z',
    messages: [{ role: 'user', content: '检查项目', createdAt: '2026-08-09T10:03:00.000Z' }],
    runs: []
  }],
  activeAgentSessionId: 'legacy-agent-session'
};

function runMigration(directory, options = {}) {
  const appArguments = path.basename(electronExe).toLowerCase() === 'electron.exe'
    ? [projectRoot]
    : [];
  const electronArguments = [
      ...appArguments,
      `--user-data-dir=${directory}`,
      '--disable-gpu',
      '--disable-gpu-compositing'
  ];
  const powerShellQuote = (value) => `'${String(value).replace(/'/g, "''")}'`;
  const command = `& ${powerShellQuote(path.resolve(electronExe))} ${electronArguments.map(powerShellQuote).join(' ')}; exit $LASTEXITCODE`;
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      cwd: projectRoot,
      env: {
        ...process.env,
        MAI_MIGRATION_SMOKE: '1',
        MAI_MIGRATION_BACKUP_FAILURE_SMOKE: options.expectBackupFailure ? '1' : '',
        MAI_MIGRATION_BACKUP_FAILURE_OUTPUT: options.outputPath || ''
      },
      windowsHide: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Migration smoke timed out.\n${stdout}\n${stderr}`));
    }, 30000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      try {
        assert.ok([0, 0x80000003].includes(code), `${stdout}\n${stderr}`);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function main() {
  try {
    fs.writeFileSync(memoryPath, JSON.stringify(oldMemory, null, 2), 'utf8');
    fs.writeFileSync(settingsPath, JSON.stringify({ deepseek: { personality: 'open' } }, null, 2), 'utf8');
    await runMigration(testRoot);

    let migrated = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
    assert.equal(migrated.version, 16);
    assert.ok(migrated.facts.some((fact) => fact.id === 'fact-keep' && fact.text.includes('草莓蛋糕')));
    assert.ok(migrated.sessions.some((session) => session.id === 'old-session' && session.messages.length === 2));
    assert.ok(migrated.sessions[0].messages.every((message) => message.id));
    assert.ok(migrated.people.some((person) => person.name === '小林' && person.relation === '朋友'));
    assert.ok(migrated.timeline.length > 0);
    assert.ok(migrated.memoryDigests.length > 0);
    assert.ok(migrated.projects.some((project) => project.source.originId === 'goal-keep'));
    assert.ok(migrated.habits.some((habit) => habit.source.originId === 'routine-keep'));
    assert.ok(migrated.assistant && Array.isArray(migrated.assistant.focusSessions));
    assert.equal(migrated.activeSessionId, 'old-session');
    assert.equal(migrated.legacyAgentArchive.length, 1);
    assert.equal(migrated.legacyAgentArchive[0].id, 'legacy-agent-session');
    assert.equal(migrated.legacyAgentArchive[0].messages.length, 1);
    assert.equal(migrated.legacyAgentArchive[0].source, 'retired-agent-v5');
    assert.equal(Object.hasOwn(migrated, 'agentSessions'), false);
    assert.equal(Object.hasOwn(migrated, 'activeAgentSessionId'), false);

    const migrationBackup = path.join(testRoot, 'mai-pet-memory.before-v16-from-v10.backup.json');
    assert.equal(fs.readFileSync(migrationBackup, 'utf8'), JSON.stringify(oldMemory, null, 2));
    assert.ok(fs.readdirSync(path.join(testRoot, 'backups')).some((name) => /^mai-backup-.*-daily\.json$/.test(name)));

    const v15Snapshot = JSON.parse(JSON.stringify(migrated));
    v15Snapshot.version = 15;
    v15Snapshot.facts[0].history = [{
      text: '用户以前喜欢巧克力蛋糕',
      evidence: '我以前喜欢巧克力蛋糕',
      temporalStatus: 'historical',
      replacedAt: '2026-07-29T10:00:00.000Z'
    }];
    v15Snapshot.memoryCorrections = [{
      id: 'correction-keep', targetKey: 'preference.wrong', targetText: '错误记忆', createdAt: '2026-08-01T00:00:00.000Z'
    }];
    v15Snapshot.episodes.push({
      id: 'episode-keep', title: '保留事件', summary: '用户完成了一件重要事情', category: 'achievement',
      evidence: '我完成了一件重要事情', sourceCreatedAt: '2026-08-01T00:00:00.000Z'
    });
    v15Snapshot.topicThreads.push({ id: 'topic-keep', title: '保留话题', summary: '之后继续聊', status: 'active' });
    v15Snapshot.moments.push({ id: 'moment-keep', content: '保留朋友圈', createdAt: '2026-08-01T00:00:00.000Z', comments: [] });
    v15Snapshot.behaviorPatterns = [{ id: 'late_sleep', confidence: 0.66, observationCount: 3, sources: [{ evidence: '又熬夜到凌晨两点', sourceMessageId: 'pattern-message', observedAt: '2026-08-01T02:00:00.000Z' }] }];
    v15Snapshot.unknownV14Section = { keep: true, nested: ['unchanged'] };
    const v15Text = JSON.stringify(v15Snapshot, null, 2);
    fs.writeFileSync(memoryPath, v15Text, 'utf8');
    await runMigration(testRoot);
    migrated = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
    assert.equal(migrated.version, 16);
    assert.ok(migrated.facts.some((fact) => fact.id === 'fact-keep' && fact.history.length === 1));
    assert.ok(migrated.facts.find((fact) => fact.id === 'fact-keep').evidenceTrail.length >= 1);
    assert.ok(migrated.memoryCorrections.some((item) => item.id === 'correction-keep'));
    assert.ok(migrated.episodes.some((item) => item.id === 'episode-keep'));
    assert.ok(migrated.topicThreads.some((item) => item.id === 'topic-keep'));
    assert.ok(migrated.moments.some((item) => item.id === 'moment-keep'));
    assert.equal(migrated.behaviorPatterns[0].id, 'late_sleep');
    assert.deepEqual(migrated.unknownV14Section, v15Snapshot.unknownV14Section);
    assert.equal(fs.readFileSync(path.join(testRoot, 'mai-pet-memory.before-v16-from-v15.backup.json'), 'utf8'), v15Text);
    const idempotentBefore = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
    await runMigration(testRoot);
    const idempotentAfter = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
    assert.equal(idempotentAfter.version, 16);
    assert.deepEqual(
      idempotentAfter.facts.map((fact) => ({ id: fact.id, text: fact.text, key: fact.key, history: fact.history, evidenceTrail: fact.evidenceTrail })),
      idempotentBefore.facts.map((fact) => ({ id: fact.id, text: fact.text, key: fact.key, history: fact.history, evidenceTrail: fact.evidenceTrail }))
    );
    assert.deepEqual(idempotentAfter.unknownV14Section, idempotentBefore.unknownV14Section);

    const dirtyReply = '{"reply":"历史朋友圈只应留下这句话。","action":"love","memories":[{"content":"truncated';
    migrated.moments = [{
      id: 'moment-json-repair',
      content: '测试历史朋友圈清理',
      mood: '',
      source: 'ai',
      createdAt: '2026-08-09T10:00:00.000Z',
      comments: [
        { id: 'user-json', role: 'user', content: dirtyReply, createdAt: '2026-08-09T10:01:00.000Z' },
        { id: 'assistant-json', role: 'assistant', content: dirtyReply, createdAt: '2026-08-09T10:02:00.000Z' }
      ]
    }];
    migrated.legacyAgentArchive[0].taskState = {
      runId: 'interrupted-agent-run',
      status: 'running',
      phase: 'executing',
      title: 'Interrupted task',
      detail: 'The app closed while this task was still running.',
      startedAt: '2026-08-09T10:03:00.000Z',
      updatedAt: '2026-08-09T10:04:00.000Z',
      steps: [],
      approval: null,
      toolCallCount: 1,
      task: {
        task_id: 'interrupted-agent-run',
        goal: 'Inspect the project',
        status: 'RUNNING',
        steps_taken: 3,
        tool_calls: 1,
        tool_errors: 0,
        observations: [],
        step_log: [],
        limits: { max_steps: 15, max_tool_calls: 10, max_tool_errors: 3, max_runtime_ms: 600000 },
        stop_reason: '',
        created_at: '2026-08-09T10:03:00.000Z',
        updated_at: '2026-08-09T10:04:00.000Z',
        finished_at: ''
      }
    };
    fs.writeFileSync(memoryPath, JSON.stringify(migrated, null, 2), 'utf8');
    await runMigration(testRoot);
    const repaired = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
    assert.equal(repaired.moments[0].comments[0].content, dirtyReply);
    assert.equal(repaired.moments[0].comments[1].content, '历史朋友圈只应留下这句话。');

    assert.equal(repaired.legacyAgentArchive[0].taskState.task.status, 'RUNNING');
    assert.equal(repaired.legacyAgentArchive[0].taskState.status, 'running');

    const corruptText = '{"version":16,"facts":[';
    fs.writeFileSync(memoryPath, corruptText, 'utf8');
    await runMigration(testRoot);
    const recovered = JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
    assert.equal(recovered.version, 16);
    assert.ok(Array.isArray(recovered.facts));
    const unreadableBackup = fs.readdirSync(testRoot)
      .find((name) => /^mai-pet-memory\.unreadable-.*\.backup\.json$/.test(name));
    assert.ok(unreadableBackup, 'corrupt database must be preserved before recovery');
    assert.equal(fs.readFileSync(path.join(testRoot, unreadableBackup), 'utf8'), corruptText);

    const beforeUpgradeText = JSON.stringify({ ...repaired, version: 15, migrationSentinel: 'old-version-preserved' }, null, 2);
    const conflictBackupPath = path.join(testRoot, 'mai-pet-memory.before-v16-from-v15.backup.json');
    const conflictBackupText = 'preexisting recovery evidence must remain untouched';
    const migrationFailurePath = path.join(testRoot, 'migration-backup-failure-result.json');
    fs.writeFileSync(memoryPath, beforeUpgradeText, 'utf8');
    fs.writeFileSync(conflictBackupPath, conflictBackupText, 'utf8');
    await runMigration(testRoot, { expectBackupFailure: true, outputPath: migrationFailurePath });
    assert.deepEqual(JSON.parse(fs.readFileSync(migrationFailurePath, 'utf8')), { ok: false, errorCode: 'BACKUP_CONFLICT' });
    assert.equal(fs.readFileSync(memoryPath, 'utf8'), beforeUpgradeText, 'failed migration protection must not replace old Memory bytes');
    assert.equal(fs.readFileSync(conflictBackupPath, 'utf8'), conflictBackupText, 'conflicting existing backup must remain untouched');

    console.log(JSON.stringify({ ok: true, version: repaired.version, facts: repaired.facts.length, chatMessages: repaired.sessions[0].messages.length, archivedTaskSessions: repaired.legacyAgentArchive.length, archivedTaskMessages: repaired.legacyAgentArchive[0].messages.length, people: repaired.people.length, timeline: repaired.timeline.length, projects: repaired.projects.length, habits: repaired.habits.length, momentReplyRepaired: true, legacyTaskPreservedReadOnly: true, corruptDatabasePreserved: true, corruptDatabaseRecovered: true, migrationBackupFailurePreserved: true }));
  } finally {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
