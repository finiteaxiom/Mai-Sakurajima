function decodeJsonStringPrefix(value) {
  let output = '';
  let complete = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"') {
      complete = true;
      break;
    }
    if (character !== '\\') {
      output += character;
      continue;
    }
    if (index + 1 >= value.length) break;
    const escaped = value[index + 1];
    const simple = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
    if (Object.prototype.hasOwnProperty.call(simple, escaped)) {
      output += simple[escaped];
      index += 1;
      continue;
    }
    if (escaped === 'u') {
      const code = value.slice(index + 2, index + 6);
      if (!/^[0-9a-f]{4}$/i.test(code)) break;
      output += String.fromCharCode(Number.parseInt(code, 16));
      index += 5;
      continue;
    }
    output += escaped;
    index += 1;
  }
  return { text: output, complete };
}

function extractStreamingReply(rawContent, structured = true) {
  const raw = String(rawContent || '');
  if (!structured) return { text: raw, complete: false };
  const match = /"reply"\s*:\s*"/.exec(raw);
  if (!match) return { text: '', complete: false };
  return decodeJsonStringPrefix(raw.slice(match.index + match[0].length));
}

function createSseParser(onEvent) {
  let buffer = '';
  return {
    push(chunk) {
      buffer += String(chunk || '').replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = block
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data) onEvent(data);
        boundary = buffer.indexOf('\n\n');
      }
    },
    flush() {
      if (buffer.trim()) {
        const data = buffer
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data) onEvent(data);
      }
      buffer = '';
    }
  };
}

module.exports = {
  createSseParser,
  decodeJsonStringPrefix,
  extractStreamingReply
};
