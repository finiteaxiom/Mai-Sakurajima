'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { summarizeTurnRecords } = require('../llm-cache-diagnostics');

function readJsonLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

function turnRows(records) {
  const turns = new Map();
  for (const record of records) {
    const id = String(record?.turn_id || 'N/A');
    const current = turns.get(id) || {
      turn_id: id,
      request_count: 0,
      total_prompt_tokens: 0,
      total_completion_tokens: 0,
      total_cache_hit_tokens: 0,
      total_cache_miss_tokens: 0,
      fallback: false,
      fallback_reason: '',
      unavailable: new Set()
    };
    current.request_count += 1;
    for (const [recordKey, rowKey] of [
      ['prompt_tokens', 'total_prompt_tokens'],
      ['completion_tokens', 'total_completion_tokens'],
      ['cache_hit_tokens', 'total_cache_hit_tokens'],
      ['cache_miss_tokens', 'total_cache_miss_tokens']
    ]) {
      if (Number.isFinite(record?.[recordKey])) current[rowKey] += record[recordKey];
      else current.unavailable.add(rowKey);
    }
    if (record?.fallback === true) current.fallback = true;
    if (record?.fallback_reason) {
      const reasons = new Set(`${current.fallback_reason}|${record.fallback_reason}`.split('|').filter(Boolean));
      current.fallback_reason = [...reasons].join('|');
    }
    turns.set(id, current);
  }
  return [...turns.values()].map((row) => {
    const hit = row.unavailable.has('total_cache_hit_tokens') ? null : row.total_cache_hit_tokens;
    const miss = row.unavailable.has('total_cache_miss_tokens') ? null : row.total_cache_miss_tokens;
    return {
      turn_id: row.turn_id,
      request_count: row.request_count,
      total_prompt_tokens: row.unavailable.has('total_prompt_tokens') ? null : row.total_prompt_tokens,
      total_completion_tokens: row.unavailable.has('total_completion_tokens') ? null : row.total_completion_tokens,
      total_cache_hit_tokens: hit,
      total_cache_miss_tokens: miss,
      cache_hit_rate: hit === null || miss === null || hit + miss === 0 ? null : hit / (hit + miss),
      fallback: row.fallback,
      fallback_reason: row.fallback_reason
    };
  });
}

const filePath = path.resolve(process.argv[2] || path.join('logs', 'llm-diagnostics.jsonl'));
const summary = summarizeTurnRecords(turnRows(readJsonLines(filePath)));
const rate = (value) => Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : 'N/A';

console.log('[LLM Diagnostic Summary]');
console.log(`source: ${filePath}`);
console.log(`turns: ${summary.turns}`);
console.log(`fallback_turns: ${summary.fallbackTurns}`);
console.log(`fallback_rate: ${rate(summary.fallbackRate)}`);
console.log(`avg_prompt_tokens_per_turn: ${summary.averagePromptTokensPerTurn?.toFixed(2) || 'N/A'}`);
console.log(`avg_cache_hit_rate_main: ${rate(summary.averageCacheHitRateMain)}`);
console.log(`avg_cache_hit_rate_fallback: ${rate(summary.averageCacheHitRateFallback)}`);
console.log(`fallback_reasons: ${JSON.stringify(summary.fallbackReasons)}`);
