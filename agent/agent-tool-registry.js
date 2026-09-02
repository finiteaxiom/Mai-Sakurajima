'use strict';

// v5 ToolSpec / ToolRegistry semantics, adapted to v7 capabilities.
class ToolSpec {
  constructor(input = {}) {
    const name = String(input.name || '').trim();
    if (!/^[a-z][a-z0-9_]{1,79}$/.test(name)) throw new TypeError('Agent tool requires a safe snake_case name.');
    if (typeof input.execute !== 'function') throw new TypeError(`Agent tool ${name} requires execute().`);
    this.name = name; this.label = String(input.label || name).trim().slice(0, 80);
    this.description = String(input.description || '').trim().slice(0, 1000);
    this.parameters = input.parameters && typeof input.parameters === 'object' ? structuredClone(input.parameters) : { type: 'object', properties: {}, additionalProperties: false };
    this.capabilities = Object.freeze((Array.isArray(input.capabilities) ? input.capabilities : []).map(String));
    this.timeoutMs = Math.max(10, Math.min(5 * 60 * 1000, Number(input.timeoutMs) || 30_000));
    this.validateArguments = typeof input.validate === 'function' ? input.validate : (args) => args || {};
    this.authorizeOperation = typeof input.authorize === 'function' ? input.authorize : async () => ({ allowed: true });
    this.approvalPolicy = typeof input.approval === 'function' ? input.approval : null; this.executeTool = input.execute;
    Object.freeze(this.parameters); Object.freeze(this);
  }
  definition() { return { type: 'function', function: { name: this.name, description: this.description, parameters: structuredClone(this.parameters) } }; }
  validate(args) { const value = this.validateArguments(args); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${this.name} 的参数校验没有返回对象。`); return value; }
  async authorize(args, context) { return this.authorizeOperation(args, context); }
  approval(args) { return this.approvalPolicy?.(args) || null; }
}
class ToolRegistry {
  constructor(specs = []) { this.specs = new Map(); specs.forEach((spec) => this.register(spec)); }
  register(input) { const spec = input instanceof ToolSpec ? input : new ToolSpec(input); if (this.specs.has(spec.name)) throw new Error(`工具已重复注册：${spec.name}`); this.specs.set(spec.name, spec); return this; }
  get(name) { return this.specs.get(String(name || '').trim()) || null; }
  list() { return [...this.specs.values()]; }
  definitions() { return this.list().map((spec) => spec.definition()); }
}
function createToolRegistry(tools = []) { return new ToolRegistry(tools); }
function createSafeAgentToolRegistry(options = {}) {
  const now = options.now || (() => new Date());
  return new ToolRegistry([
    new ToolSpec({
      name: 'echo', label: '回显', description: '回显已提供的安全文本，用于确认任务上下文。', capabilities: ['safe-local'], timeoutMs: 2_000,
      parameters: { type: 'object', properties: { text: { type: 'string', maxLength: 500 } }, required: ['text'], additionalProperties: false },
      validate(args) { if (!args || typeof args.text !== 'string' || args.text.length > 500) { const error = new Error('echo 只接受不超过 500 字的 text。'); error.code = 'TOOL_INVALID_ARGUMENTS'; throw error; } return { text: args.text }; },
      async execute(args) { return { summary: '已回显文本。', data: { text: args.text } }; }
    }),
    new ToolSpec({
      name: 'get_current_time', label: '当前时间', description: '获取设备当前时间。', capabilities: ['safe-local'], timeoutMs: 2_000,
      parameters: { type: 'object', properties: {}, additionalProperties: false }, validate: () => ({}),
      async execute() { return { summary: '已获取当前时间。', data: { iso: new Date(now()).toISOString() } }; }
    })
  ]);
}
module.exports = { ToolSpec, ToolRegistry, createToolRegistry, createSafeAgentToolRegistry };
