const fs = require('fs');
const path = require('path');
const { LocalTtsService } = require('../local-tts-service');

async function main() {
  const installDirectory = path.resolve(process.argv[2] || '');
  const outputPath = path.resolve(process.argv[3] || 'local-voice-sample.wav');
  if (!installDirectory || !fs.existsSync(installDirectory)) {
    throw new Error('Usage: node test/verify-local-tts.js <install-directory> <output.wav>');
  }
  const service = new LocalTtsService({
    installDirectory,
    scriptsDirectory: path.join(__dirname, '..', 'voice-engine'),
    onStatus(status) {
      if (status.state === 'starting' || status.ready || status.error) {
        process.stdout.write(`${JSON.stringify(status)}\n`);
      }
    }
  });
  try {
    const result = await service.synthesize({
      text: '现在是2026年8月4日15点30分。听得到吗？这次是真正的本地中文女声。',
      rate: 1
    });
    fs.writeFileSync(outputPath, Buffer.from(result.audioBase64, 'base64'));
    process.stdout.write(`${JSON.stringify({
      ok: true,
      outputPath,
      durationMs: result.durationMs,
      device: result.device,
      bytes: fs.statSync(outputPath).size
    })}\n`);
  } finally {
    service.dispose();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
