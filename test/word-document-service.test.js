'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { createWordDocument, appendWordDocument } = require('../agent/word-document-service');

async function documentXml(buffer) {
  const zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
  return zip.file('word/document.xml').async('string');
}

test('Word document service creates a standard docx and appends paragraphs without losing existing content', async () => {
  const created = await createWordDocument('学姐，第一段。\n第二段。');
  assert.equal(created.subarray(0, 2).toString('utf8'), 'PK');
  const initialXml = await documentXml(created);
  assert.match(initialXml, /学姐，第一段。/);
  assert.match(initialXml, /第二段。/);
  const appended = await appendWordDocument(created, '这是追加的第三段。');
  const appendedXml = await documentXml(appended);
  assert.match(appendedXml, /学姐，第一段。/);
  assert.match(appendedXml, /第二段。/);
  assert.match(appendedXml, /这是追加的第三段。/);
  assert.ok(appendedXml.indexOf('这是追加的第三段。') < appendedXml.indexOf('<w:sectPr'));
});

test('Word document service rejects malformed files and empty append text', async () => {
  await assert.rejects(appendWordDocument(Buffer.from('not a document'), '追加'), { code: 'invalid_word_document' });
  await assert.rejects(createWordDocument('  '), { code: 'invalid_word_document' });
});
