'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createChatPromptContext } = require('../chat-prompt-context');
const { createChatRealityContext } = require('../chat-reality-context');
const { createChatRequestLifecycle } = require('../chat-request-lifecycle');
const { ChatRequestService } = require('../chat-request-service');
const { defaultMindState } = require('../intelligence');
const { estimateTokenCount, trimMessagesToTokenBudget } = require('../context-engine');
const { defaultWorldState } = require('../world-engine');
const { writeJsonAtomic } = require('../json-persistence');

const INSTANT = Date.parse('2026-10-19T12:00:00.000Z');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function initialState() {
  return {
    version: 16,
    facts: [{
      id: 'fact-coffee',
      text: '用户喜欢喝咖啡',
      key: 'preference.drink',
      category: 'preference',
      importance: 5,
      pinned: true,
      source: 'manual',
      confidence: 1,
      evidence: '我喜欢喝咖啡',
      sourceCreatedAt: '2026-10-18T12:00:00.000Z',
      temporalStatus: 'current',
      retrievalCount: 0,
      lastRetrievedAt: ''
    }],
    episodes: [{
      id: 'episode-exam',
      title: '通过考试',
      summary: '用户通过了考试',
      category: 'achievement',
      importance: 5,
      pinned: false,
      evidence: '我通过考试了',
      sourceCreatedAt: '2026-10-18T12:00:00.000Z',
      recallCount: 0,
      lastRecalledAt: ''
    }],
    sessions: [],
    topicThreads: [],
    world: defaultWorldState(INSTANT),
    mind: defaultMindState(INSTANT),
    behaviorPatterns: [],
    lifeItems: [],
    projects: [],
    habits: [],
    people: [],
    memoryDigests: [],
    reality: { weather: null }
  };
}

function response(value) {
  return { ok: true, json: async () => value };
}

function createHarness(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-chat-context-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const statePath = path.join(directory, 'memory.json');
  let memory = initialState();
  let savedMemory = structuredClone(memory);
  const settings = { deepseek: { memoryEnabled: true, personality: 'classic', girlfriendModeEnabled: false, customPrompt: '', weatherEnabled: false, weatherCity: '' } };
  let dataGeneration = 1;
  let settingsGeneration = 1;
  let writable = true;
  let failNextRename = false;
  const writeFs = Object.create(fs);
  writeFs.renameSync = (source, target) => {
    if (failNextRename) {
      failNextRename = false;
      throw Object.assign(new Error('fixture replacement denied'), { code: 'EPERM' });
    }
    return fs.renameSync(source, target);
  };
  const persist = (value) => writeJsonAtomic(statePath, value);
  persist(memory);

  function saveContextState() {
    try {
      writeJsonAtomic(statePath, memory, { fs: writeFs });
      savedMemory = structuredClone(memory);
    } catch (error) {
      memory = structuredClone(savedMemory);
      throw error;
    }
  }

  const promptContext = createChatPromptContext({
    getMemoryState: () => memory,
    getSettings: () => settings,
    isDataWritable: () => writable,
    getDataGeneration: () => dataGeneration,
    now: () => INSTANT,
    memoryCategories: ['identity', 'preference', 'relationship', 'goal', 'routine', 'experience', 'boundary', 'other'],
    petActions: ['idle', 'wave', 'jump', 'love', 'angry', 'sleep', 'lazy', 'study', 'work', 'snack'],
    petEmotions: ['neutral', 'happy', 'curious', 'shy', 'concerned', 'angry', 'sleepy', 'focused']
  });
  const weather = createChatRealityContext({
    getSettings: () => settings,
    getMemoryState: () => memory,
    getDataGeneration: () => dataGeneration,
    getSettingsGeneration: () => settingsGeneration,
    isDataWritable: () => writable,
    saveMemory: saveContextState,
    weatherDescription: () => '晴朗',
    now: () => INSTANT,
    fetcher: options.fetcher || (async (url) => {
      if (url.includes('geocoding-api')) {
        const city = new URL(url).searchParams.get('name');
        return response({ results: [{ name: city, latitude: 31, longitude: 121 }] });
      }
      return response({ current: { temperature_2m: 20, apparent_temperature: 19, weather_code: 0, wind_speed_10m: 2 } });
    })
  });
  const lifecycle = createChatRequestLifecycle({ createId: (() => { let id = 0; return () => `request-${++id}`; })() });
  const modelCalls = [];
  const rendered = [];
  const modelGateway = options.modelGateway || {
    async generate(request) {
      modelCalls.push(request);
      return { rawContent: '{"reply":"完成"}', model: 'fake', finishReason: 'stop' };
    },
    async stream(request) {
      modelCalls.push(request);
      return { rawContent: '{"reply":"完成"}', model: 'fake', finishReason: 'stop' };
    }
  };
  const service = new ChatRequestService({
    modelGateway,
    sanitizeMessages: (messages) => messages,
    buildSystemPrompt: (...args) => promptContext.renderSystemPrompt(...args.slice(0, 5), args[6] || '').text,
    renderSystemPrompt: (...args) => {
      const result = promptContext.renderSystemPrompt(...args);
      rendered.push(result);
      return result;
    },
    commitRenderedPromptContext: promptContext.commitRenderedContext,
    realityContext: (requestOptions) => weather.prepare(requestOptions),
    commitRealityContext: weather.commit,
    estimateTokenCount,
    trimMessagesToTokenBudget,
    saveContextState,
    parseStructuredReply: (rawContent) => {
      const reply = JSON.parse(rawContent);
      return { ...reply, content: reply.reply };
    },
    inspectStructuredReply: () => ({ parseSuccess: true, visibleReplyPresent: true }),
    inferActionFromText: () => ({ action: 'wave', emotion: 'happy' }),
    emptyResponseMessage: () => 'empty response',
    maxPromptTokens: options.maxPromptTokens,
    maxContextMessages: 1600
  });

  return {
    directory,
    statePath,
    lifecycle,
    modelCalls,
    rendered,
    service,
    settings,
    getMemory: () => memory,
    getDiskBytes: () => fs.readFileSync(statePath),
    getDiskState: () => JSON.parse(fs.readFileSync(statePath, 'utf8')),
    getSaveFsEntries: () => fs.readdirSync(directory),
    setFailNextRename: () => { failNextRename = true; },
    setWeather: (city, enabled = true) => {
      settings.deepseek.weatherCity = city;
      settings.deepseek.weatherEnabled = enabled;
      settingsGeneration += 1;
    },
    replaceStateAfterRestore: (nextState) => {
      dataGeneration += 1;
      memory = structuredClone(nextState);
      savedMemory = structuredClone(memory);
      persist(memory);
    },
    setWritable: (value) => { writable = value; }
  };
}

function startLifecycleRequest(harness, sessionId, messages = [{ role: 'user', content: '咖啡和考试' }]) {
  const request = harness.lifecycle.begin({ sessionId, senderId: sessionId });
  const promise = harness.service.request(messages, {
    sessionId,
    signal: request.signal,
    assertRequestCurrent: request.assertCurrent
  }).finally(() => request.finish());
  return { request, promise };
}

test('the trimmed final Prompt commits once and saves through the real atomic JSON writer', async (t) => {
  const harness = createHarness(t, { maxPromptTokens: 50000 });
  const reply = await harness.service.request([
    { role: 'user', content: `请参考咖啡和考试背景。${'x'.repeat(190000)}` }
  ], { sessionId: 'chat-a' });

  assert.equal(reply.content, '完成');
  assert.equal(harness.rendered.length, 2, 'message-budget trimming renders a second Prompt');
  assert.equal(harness.getMemory().facts[0].retrievalCount, 1, 'only the final render is recorded');
  assert.equal(harness.getMemory().episodes[0].recallCount, 1);
  assert.equal(harness.getDiskState().facts[0].retrievalCount, 1);
  assert.equal(harness.getDiskState().episodes[0].recallCount, 1);
  assert.equal(harness.modelCalls.length, 1);
  assert.deepEqual(harness.getSaveFsEntries(), ['memory.json'], 'the atomic writer leaves no temporary file');
});

test('late weather after a real request cancellation leaves memory bytes unchanged', async (t) => {
  const geoStarted = deferred();
  const geoGate = deferred();
  const harness = createHarness(t, {
    fetcher: async (url) => {
      if (url.includes('geocoding-api')) {
        geoStarted.resolve();
        return geoGate.promise;
      }
      return response({ current: { temperature_2m: 20, apparent_temperature: 19, weather_code: 0, wind_speed_10m: 2 } });
    }
  });
  harness.setWeather('测试城市');
  const initialBytes = harness.getDiskBytes();
  const initialMemory = structuredClone(harness.getMemory());
  const pending = startLifecycleRequest(harness, 'chat-a');
  await geoStarted.promise;
  assert.equal(harness.lifecycle.cancelSession('chat-a', 'session_switched'), true);
  geoGate.resolve(response({ results: [{ name: '测试城市', latitude: 31, longitude: 121 }] }));

  await assert.rejects(pending.promise, { code: 'CHAT_REQUEST_CANCELLED' });
  assert.deepEqual(harness.getDiskBytes(), initialBytes);
  assert.deepEqual(harness.getMemory(), initialMemory);
  assert.equal(harness.modelCalls.length, 0);
});

test('late weather from before restore cannot overwrite the restored state', async (t) => {
  const geoStarted = deferred();
  const geoGate = deferred();
  const harness = createHarness(t, {
    fetcher: async (url) => {
      if (url.includes('geocoding-api')) {
        geoStarted.resolve();
        return geoGate.promise;
      }
      return response({ current: { temperature_2m: 20, apparent_temperature: 19, weather_code: 0, wind_speed_10m: 2 } });
    }
  });
  harness.setWeather('测试城市');
  const pending = harness.service.request([{ role: 'user', content: '天气' }], { sessionId: 'chat-a' });
  await geoStarted.promise;
  const restored = initialState();
  restored.facts[0].text = '恢复后的虚构记忆';
  harness.replaceStateAfterRestore(restored);
  const restoredBytes = harness.getDiskBytes();
  geoGate.resolve(response({ results: [{ name: '测试城市', latitude: 31, longitude: 121 }] }));

  await assert.rejects(pending, { code: 'CHAT_CONTEXT_STATE_STALE' });
  assert.deepEqual(harness.getDiskBytes(), restoredBytes);
  assert.equal(harness.getDiskState().facts[0].text, '恢复后的虚构记忆');
  assert.equal(harness.getDiskState().reality.weather, null);
  assert.equal(harness.modelCalls.length, 0);
});

test('weather requests for different cities do not share or commit the stale city result', async (t) => {
  const started = new Map([['城市甲', deferred()], ['城市乙', deferred()]]);
  const gates = new Map([['城市甲', deferred()], ['城市乙', deferred()]]);
  const calls = [];
  const harness = createHarness(t, {
    fetcher: async (url) => {
      if (url.includes('geocoding-api')) {
        const city = new URL(url).searchParams.get('name');
        calls.push(city);
        started.get(city).resolve();
        return gates.get(city).promise;
      }
      const latitude = Number(new URL(url).searchParams.get('latitude'));
      return response({ current: { temperature_2m: latitude, apparent_temperature: latitude, weather_code: 0, wind_speed_10m: 2 } });
    }
  });
  harness.setWeather('城市甲');
  const oldRequest = harness.service.request([{ role: 'user', content: '城市天气' }], { sessionId: 'chat-a' });
  await started.get('城市甲').promise;
  harness.setWeather('城市乙');
  const currentRequest = harness.service.request([{ role: 'user', content: '新城市天气' }], { sessionId: 'chat-b' });
  await started.get('城市乙').promise;
  assert.deepEqual(calls, ['城市甲', '城市乙']);

  gates.get('城市乙').resolve(response({ results: [{ name: '城市乙', latitude: 32, longitude: 122 }] }));
  await currentRequest;
  const committedBytes = harness.getDiskBytes();
  gates.get('城市甲').resolve(response({ results: [{ name: '城市甲', latitude: 31, longitude: 121 }] }));
  await assert.rejects(oldRequest, { code: 'CHAT_CONTEXT_STATE_STALE' });

  assert.equal(harness.getDiskState().reality.weather.city, '城市乙');
  assert.deepEqual(harness.getDiskBytes(), committedBytes);
  assert.equal(harness.modelCalls.length, 1);
});

test('one cancelled weather consumer does not cancel a shared request used by another consumer', async (t) => {
  const geoStarted = deferred();
  const geoGate = deferred();
  let geocodeCount = 0;
  const harness = createHarness(t, {
    fetcher: async (url) => {
      if (url.includes('geocoding-api')) {
        geocodeCount += 1;
        geoStarted.resolve();
        return geoGate.promise;
      }
      return response({ current: { temperature_2m: 20, apparent_temperature: 19, weather_code: 0, wind_speed_10m: 2 } });
    }
  });
  harness.setWeather('同一城市');
  const first = startLifecycleRequest(harness, 'chat-a');
  await geoStarted.promise;
  const second = startLifecycleRequest(harness, 'chat-b');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(geocodeCount, 1, 'both consumers share the same city/config fetch');
  harness.lifecycle.cancelSession('chat-a', 'session_switched');
  geoGate.resolve(response({ results: [{ name: '同一城市', latitude: 31, longitude: 121 }] }));

  const [firstResult, secondResult] = await Promise.allSettled([first.promise, second.promise]);
  assert.equal(firstResult.status, 'rejected');
  assert.equal(firstResult.reason.code, 'CHAT_REQUEST_CANCELLED');
  assert.equal(secondResult.status, 'fulfilled');
  assert.equal(geocodeCount, 1);
  assert.equal(harness.getDiskState().reality.weather.city, '同一城市');
  assert.equal(harness.modelCalls.length, 1);
});

test('an atomic context-save failure rolls back memory and preserves target bytes', async (t) => {
  const harness = createHarness(t);
  const beforeBytes = harness.getDiskBytes();
  const beforeMemory = structuredClone(harness.getMemory());
  harness.setFailNextRename();

  await assert.rejects(
    harness.service.request([{ role: 'user', content: '咖啡和考试' }], { sessionId: 'chat-a' }),
    { code: 'EPERM' }
  );
  assert.deepEqual(harness.getDiskBytes(), beforeBytes);
  assert.deepEqual(harness.getMemory(), beforeMemory);
  assert.deepEqual(harness.getSaveFsEntries(), ['memory.json']);
  assert.equal(harness.modelCalls.length, 0, 'a failed context save never reaches the model');
});
