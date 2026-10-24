'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { RuntimeDiagnostics, runtimeDiagnostics, instrumentIpc } = require('../runtime-diagnostics');
const { registerDiagnosticsIpc } = require('../diagnostics-ipc');
function temp(t) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mai-diagnostics-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; }
test('real IPC -> model -> persistence shares a trace, isolates concurrent requests and excludes payloads', async t => {
  const directory = temp(t); const logger = runtimeDiagnostics.initialize({ directory });
  const handlers = new Map(); const ipc = instrumentIpc({ handle: (name, fn) => handlers.set(name, fn) });
  const { ModelGateway } = require('../model-gateway');
  const { writeJsonAtomic } = require('../json-persistence');
  const gateway = new ModelGateway({ registry: { require: () => ({ complete: async () => { await new Promise(r => setTimeout(r, 5)); return { secret: 'PRIVATE_MODEL_CONTENT' }; } }) } });
  ipc.handle('chat:send', async (_e, input) => { await gateway.generate({ messages: input }); writeJsonAtomic(path.join(directory, 'product.json'), { text: input }); return 'ok'; });
  await Promise.all([handlers.get('chat:send')({}, 'PRIVATE_CHAT_KEY'), handlers.get('chat:send')({}, 'PRIVATE_CHAT_KEY')]);
  const snapshot = await logger.snapshot();
  const traces = new Set(snapshot.records.map(r => r.traceId)); assert.equal(traces.size, 2);
  for (const trace of traces) assert.deepEqual(new Set(snapshot.records.filter(r => r.traceId === trace).map(r => r.module)), new Set(['ipc','model','persistence']));
  assert.doesNotMatch(JSON.stringify(snapshot.records), /PRIVATE|product.json/);
});
test('throws retain identity, unknown error payloads are excluded, cancellation and returned Work failure differ', async t => {
  const logger = new RuntimeDiagnostics({ directory: temp(t) });
  const error = Object.assign(new Error('SECRET C:/private'), { code: 'SECRET_CODE', stack: 'SECRET_STACK' });
  assert.throws(() => logger.span('model','generate', () => { throw error; }), e => e === error);
  await assert.rejects(logger.span('model','stream', async () => { throw Object.assign(new Error('PRIVATE'), { code: 'CHAT_REQUEST_CANCELLED' }); }));
  logger.span('ipc','agent:execute', () => ({ session: { status: 'failed' } }));
  const s = await logger.snapshot(); assert.equal(s.counts.failed, 2); assert.equal(s.counts.cancelled, 1);
  assert.doesNotMatch(JSON.stringify(s), /SECRET|PRIVATE/);
});
test('bounded rolling history survives restart and expires old files', async t => {
  const directory = temp(t); let logger = new RuntimeDiagnostics({ directory, maxBytes: 650, archives: 2 });
  for (let i=0;i<18;i++) logger.record('app','startup','completed');
  await logger.snapshot();
  assert.equal(fs.readdirSync(directory).length, 3);
  for (const name of fs.readdirSync(directory)) assert.ok(fs.statSync(path.join(directory,name)).size <= 650);
  logger = new RuntimeDiagnostics({ directory, maxBytes: 650, archives: 2 });
  assert.ok((await logger.snapshot()).records.length > 0);
  const old = new Date(Date.now()-15*86400000);
  for (const name of fs.readdirSync(directory)) fs.utimesSync(path.join(directory,name),old,old);
  logger.record('app','startup','completed'); await logger.snapshot();
  assert.deepEqual(fs.readdirSync(directory), ['runtime.jsonl']);
});
test('unwritable log directory never breaks business operation; queue pressure is bounded', async t => {
  const directory = path.join(temp(t),'blocked'); fs.writeFileSync(directory,'file');
  const logger = new RuntimeDiagnostics({directory});
  assert.equal(logger.span('app','startup',()=>42),42);
  for(let i=0;i<600;i++) logger.record('app','startup','completed');
  const s = await logger.snapshot(); assert.ok(s.writeFailures>0); assert.ok(s.dropped>0);
});
test('diagnostic IPC restricts frame, fixed folder, export schema and renderer error rate', async t => {
  const directory=temp(t), out=path.join(directory,'export.json');
  const logger=new RuntimeDiagnostics({directory:path.join(directory,'logs')}); logger.record('app','startup','completed');
  const handlers=new Map(), listeners=new Map(); let opened='';
  const rendererDirectory=path.join(directory,'renderer'); const frame={url:pathToFileURL(path.join(rendererDirectory,'chat.html')).href};
  const event={senderFrame:frame,sender:{mainFrame:frame}};
  registerDiagnosticsIpc({ipcMain:{handle:(n,f)=>handlers.set(n,f),on:(n,f)=>listeners.set(n,f)},app:{getVersion:()=> 'test'},shell:{openPath:async p=>{opened=p;return '';}},dialog:{showSaveDialog:async()=>({filePath:out})},diagnostics:logger,rendererDirectory});
  await assert.rejects(handlers.get('diagnostics:snapshot')({senderFrame:{url:'https://example.com'},sender:event.sender}));
  for(let i=0;i<30;i++) listeners.get('diagnostics:renderer-error')(event,'script-error');
  listeners.get('diagnostics:renderer-error')(event,'SECRET');
  assert.equal((await handlers.get('diagnostics:snapshot')(event)).counts.failed,10);
  await handlers.get('diagnostics:open-folder')(event); assert.equal(opened,logger.directory);
  await handlers.get('diagnostics:export')(event); const exported=JSON.parse(fs.readFileSync(out)); assert.equal(exported.directory,undefined); assert.equal(exported.version,'test');
});
test('retention removes expired records even in a recently modified file and ignores malformed tails', async t => {
  const directory=temp(t); const logger=new RuntimeDiagnostics({directory});
  const base={runId:logger.runId,traceId:logger.runId,module:'app',operation:'startup',outcome:'completed'};
  fs.writeFileSync(logger.file(), JSON.stringify({...base,time:new Date(Date.now()-15*86400000).toISOString()})+'\n'+JSON.stringify({...base,time:new Date().toISOString(),secret:'DO_NOT_EXPORT'})+'\n{broken');
  const before=await logger.snapshot(); assert.equal(before.records.length,1); assert.doesNotMatch(JSON.stringify(before),/DO_NOT_EXPORT/);
  logger.record('app','startup','completed'); await logger.snapshot();
  assert.equal(fs.readFileSync(logger.file(),'utf8').trim().split('\n').length,2);
});
test('provider cancellation is distinct from timeout and streaming callback identity is preserved', async t => {
  const logger=runtimeDiagnostics.initialize({directory:temp(t)});
  const {ModelGateway}=require('../model-gateway'); const onDelta=()=>{};
  const gateway=new ModelGateway({registry:{require:()=>({complete:async options=>{assert.equal(options.onDelta,onDelta);throw Object.assign(new Error('PRIVATE'),{code:'request_cancelled'});}})}});
  await assert.rejects(gateway.stream({onDelta}));
  assert.equal((await logger.snapshot()).counts.cancelled,1);
});
