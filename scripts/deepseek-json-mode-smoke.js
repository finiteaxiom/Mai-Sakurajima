'use strict';

// Development-only live diagnostic. It deliberately uses an environment key
// rather than Mai's encrypted local setting, and never prints model content.
const { DeepSeekProvider } = require('../deepseek-provider');

const apiKey = String(process.env.DEEPSEEK_API_KEY || '').trim();
const model = String(process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash').trim();

if (!apiKey) {
  console.error('DEEPSEEK_API_KEY is required. Set it only for this PowerShell session, then rerun the smoke.');
  process.exitCode = 2;
  return;
}

const levels = [
  {
    name: 'A_plain_text',
    structured: false,
    system: '请只回复 OK。'
  },
  {
    name: 'B_minimal_json_object',
    structured: true,
    system: '请只输出一个合法 JSON object，不能输出 Markdown 或说明。JSON 示例：{"ok":true}。'
  },
  {
    name: 'L1_reply',
    structured: true,
    system: '请只输出一个合法 JSON object。JSON 示例：{"reply":"好的"}。reply 必须是非空中文字符串。'
  },
  {
    name: 'L2_reply_action_emotion',
    structured: true,
    system: '请只输出一个合法 JSON object。JSON 示例：{"reply":"好的","action":"wave","emotion":"happy"}。reply 必须非空。'
  },
  {
    name: 'L3_reply_action_emotion_mind',
    structured: true,
    system: '请只输出一个合法 JSON object。JSON 示例：{"reply":"好的","action":"wave","emotion":"happy","mind":{"mood":"calm"}}。reply 必须非空。'
  },
  {
    name: 'L4_memory_episode_topic',
    structured: true,
    system: '请只输出一个合法 JSON object。JSON 示例：{"reply":"好的","action":"wave","emotion":"happy","memories":[],"episodes":[],"topics":[]}。reply 必须非空；没有候选项时数组为空。'
  },
  {
    name: 'L5_full_mai_field_set',
    structured: true,
    system: '请只输出一个合法 JSON object，不能输出 Markdown 或说明。JSON 示例：{"reply":"好的","action":"wave","emotion":"happy","memories":[],"episodes":[],"topics":[],"people":[],"projects":[],"habits":[],"commitments":[],"mind":{}}。reply 必须是非空中文字符串；所有不适用的集合使用空数组，mind 使用空对象，绝对不要输出空白内容。'
  }
];

let lastStatus = null;
const provider = new DeepSeekProvider({
  getApiKey: () => apiKey,
  getModel: () => model,
  fetchImpl: async (...args) => {
    const response = await globalThis.fetch(...args);
    lastStatus = Number(response?.status) || null;
    return response;
  }
});

async function runCase(testCase) {
  lastStatus = null;
  try {
    const response = await provider.complete({
      messages: [
        { role: 'system', content: testCase.system },
        { role: 'user', content: '请按要求回答。' }
      ],
      structured: testCase.structured,
      maxTokens: 512
    });
    const raw = String(response.rawContent || '');
    let jsonParseable = false;
    if (testCase.structured && raw.trim()) {
      try {
        JSON.parse(raw);
        jsonParseable = true;
      } catch {
        // The result is reported as a boolean only.
      }
    }
    const shape = response.responseMetadata || {};
    console.log(JSON.stringify({
      case: testCase.name,
      http_status: lastStatus,
      model: response.model || model,
      structured: testCase.structured,
      finish_reason: response.finishReason || '',
      content_chars: shape.contentChars ?? null,
      content_non_whitespace_chars: shape.contentNonWhitespaceChars ?? null,
      reasoning_content_present: shape.reasoningContentPresent === true,
      reasoning_content_chars: shape.reasoningContentChars ?? null,
      tool_calls_count: shape.toolCallsCount ?? null,
      json_parseable: jsonParseable
    }));
  } catch (error) {
    console.log(JSON.stringify({
      case: testCase.name,
      http_status: lastStatus,
      model,
      structured: testCase.structured,
      error_code: error?.code || 'unknown_error',
      provider_status: Number.isFinite(error?.status) ? error.status : null
    }));
    process.exitCode = 1;
  }
}

(async () => {
  for (const testCase of levels) await runCase(testCase);
})();
