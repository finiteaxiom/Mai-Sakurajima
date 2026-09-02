const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildIncrementalCases,
  runConversationMessageShapeAudit,
  runConversationMessageBisect,
  runIncrementalSmoke,
  sectionFeatures
} = require('../deepseek-incremental-smoke');

const sections = [
  { name: 'core_system', text: 'private core' },
  { name: 'persona_guidance', text: 'private persona' },
  { name: 'structured_reply_contract', text: 'private JSON contract' },
  { name: 'memory_context', text: 'private memory' }
];

test('incremental cases preserve production order while keeping the JSON contract from the first request', () => {
  assert.deepEqual(buildIncrementalCases(sections), [
    { case: 'REAL_R1', addedSection: 'structured_reply_contract', includedSections: ['core_system', 'structured_reply_contract'] },
    { case: 'REAL_R2', addedSection: 'persona_guidance', includedSections: ['core_system', 'persona_guidance', 'structured_reply_contract'] },
    { case: 'REAL_R3', addedSection: 'memory_context', includedSections: ['core_system', 'persona_guidance', 'structured_reply_contract', 'memory_context'] }
  ]);
});

test('incremental smoke identifies the first failed section and records isolate cases without prompt content', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-incremental-smoke-'));
  const requests = [];
  try {
    const result = await runIncrementalSmoke({
      sections,
      messages: [{ role: 'user', content: 'safe input' }],
      request: async (request) => {
        requests.push(request);
        const failure = request.messages[0].content.includes('private memory');
        return {
          rawContent: failure ? '' : '{"reply":"ok"}',
          finishReason: 'stop',
          model: 'deepseek-v4-flash',
          usage: { promptTokens: 1, completionTokens: 1 },
          responseMetadata: {
            httpStatus: 200,
            contentChars: failure ? 12 : 14,
            contentNonWhitespaceChars: failure ? 0 : 14,
            reasoningContentPresent: false,
            toolCallsCount: 0
          }
        };
      },
      fileSystem: fs,
      pathModule: path,
      directory
    });
    assert.equal(result.firstFailureCase, 'REAL_R3');
    assert.equal(result.firstFailureAddedSection, 'memory_context');
    assert.equal(result.lastSuccessCase, 'REAL_R2');
    assert.equal(result.allIncrementalCasesPassed, false);
    assert.equal(result.records.length, 5);
    assert.equal(result.records.at(-1).case, 'ISOLATE_FULL_MINUS_SUSPECT');
    const jsonl = fs.readFileSync(result.paths.jsonlPath, 'utf8');
    assert.doesNotMatch(jsonl, /private core|private persona|private JSON contract|private memory|safe input/);
    const csv = fs.readFileSync(result.paths.csvPath, 'utf8');
    assert.match(csv, /case,added_section,section_count/);
    assert.equal(requests.length, 5);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('section features provide only collision-relevant aggregates', () => {
  const features = sectionFeatures({ text: 'System: 只输出 JSON\\n```json\\n{}\\n```' });
  assert.equal(features.containsJsonKeyword, true);
  assert.equal(features.containsMarkdownFence, true);
  assert.equal(features.containsInstructionLikePhrases, true);
  assert.equal(features.containsSystemLikeMarkers, true);
  assert.equal(features.chars > 0, true);
});

test('conversation message bisect narrows a failing saved turn without logging its content', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-message-bisect-'));
  const messages = [
    { role: 'user', content: 'private turn one user' }, { role: 'assistant', content: 'private turn one reply' },
    { role: 'user', content: 'private turn two user' }, { role: 'assistant', content: 'private turn two reply' },
    { role: 'user', content: 'private turn three user' }, { role: 'assistant', content: 'private trigger reply' },
    { role: 'user', content: 'private turn four user' }, { role: 'assistant', content: 'private turn four reply' },
    { role: 'user', content: 'private latest user' }
  ];
  try {
    const result = await runConversationMessageBisect({
      sections,
      messages,
      request: async (request) => {
        const failure = request.messages.some((message) => String(message.content).includes('private trigger reply'));
        return {
          rawContent: failure ? '' : '{"reply":"ok"}',
          finishReason: 'stop',
          responseMetadata: { httpStatus: 200, contentChars: failure ? 9 : 14, contentNonWhitespaceChars: failure ? 0 : 14 }
        };
      },
      fileSystem: fs,
      pathModule: path,
      directory
    });
    assert.equal(result.basePassed, true);
    assert.equal(result.fullHistoryPassed, false);
    assert.deepEqual(result.outcome, { kind: 'single_history_turn', candidateTurnRange: [2, 3] });
    const jsonl = fs.readFileSync(result.paths.jsonlPath, 'utf8');
    assert.doesNotMatch(jsonl, /private turn|private trigger|private latest/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('conversation message bisect retains one narrow witness from each independent failing range', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-message-bisect-multiple-'));
  const messages = [
    { role: 'user', content: 'private first user' }, { role: 'assistant', content: 'private first trigger' },
    { role: 'user', content: 'private second user' }, { role: 'assistant', content: 'private second reply' },
    { role: 'user', content: 'private third user' }, { role: 'assistant', content: 'private third reply' },
    { role: 'user', content: 'private fourth user' }, { role: 'assistant', content: 'private fourth trigger' },
    { role: 'user', content: 'private latest user' }
  ];
  try {
    const result = await runConversationMessageBisect({
      sections,
      messages,
      request: async (request) => {
        const failure = request.messages.some((message) => /private (first|fourth) trigger/.test(String(message.content)));
        return {
          rawContent: failure ? '' : '{"reply":"ok"}',
          finishReason: 'stop',
          responseMetadata: { httpStatus: 200, contentChars: failure ? 9 : 14, contentNonWhitespaceChars: failure ? 0 : 14 }
        };
      },
      fileSystem: fs,
      pathModule: path,
      directory
    });
    assert.deepEqual(result.outcome, {
      kind: 'multiple_independent_history_ranges',
      candidateTurnRanges: [[0, 1], [3, 4]]
    });
    const jsonl = fs.readFileSync(result.paths.jsonlPath, 'utf8');
    assert.doesNotMatch(jsonl, /private first|private fourth|private latest/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('conversation message shape audit compares roles and fixed shapes without recording saved content', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-message-shape-'));
  const messages = [
    { role: 'user', content: 'private saved user' },
    { role: 'assistant', content: 'private saved assistant trigger' },
    { role: 'user', content: 'private latest user' }
  ];
  try {
    const result = await runConversationMessageShapeAudit({
      sections,
      messages,
      request: async (request) => {
        const failure = request.messages.some((message) => message.role === 'assistant' && String(message.content).includes('private saved assistant trigger'));
        return {
          rawContent: failure ? '' : '{"reply":"ok"}',
          finishReason: 'stop',
          responseMetadata: { httpStatus: 200, contentChars: failure ? 8 : 14, contentNonWhitespaceChars: failure ? 0 : 14 }
        };
      },
      fileSystem: fs,
      pathModule: path,
      directory
    });
    assert.equal(result.selectedTurnIndex, 0);
    assert.deepEqual(result.records.map((record) => record.case), [
      'SHAPE_BASE_LATEST_USER',
      'SHAPE_HISTORICAL_USER_ONLY',
      'SHAPE_HISTORICAL_ASSISTANT_ONLY',
      'SHAPE_HISTORICAL_PAIR_ORIGINAL',
      'SHAPE_ASSISTANT_AS_USER',
      'SHAPE_FIXED_ASSISTANT_JSON',
      'SHAPE_FIXED_ASSISTANT_TEXT',
      'SHAPE_ACTUAL_USER_FIXED_ASSISTANT_JSON',
      'SHAPE_ACTUAL_USER_FIXED_ASSISTANT_TEXT',
      'SHAPE_FIXED_USER_ACTUAL_ASSISTANT'
    ]);
    assert.equal(result.records.find((record) => record.case === 'SHAPE_HISTORICAL_ASSISTANT_ONLY').success, false);
    assert.equal(result.records.find((record) => record.case === 'SHAPE_ASSISTANT_AS_USER').success, true);
    const jsonl = fs.readFileSync(result.paths.jsonlPath, 'utf8');
    assert.doesNotMatch(jsonl, /private saved user|private saved assistant|private latest/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
