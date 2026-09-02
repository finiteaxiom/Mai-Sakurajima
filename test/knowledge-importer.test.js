const test = require('node:test');
const assert = require('node:assert/strict');
const { decodeTextBuffer, extractPdfPages } = require('../knowledge-importer');

function simplePdf(text) {
  const stream = `BT\n/F1 18 Tf\n72 720 Td\n(${text.replace(/[()\\]/g, '\\$&')}) Tj\nET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream, 'binary')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'binary'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'binary');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'binary');
}

test('PDF.js extracts text with stable page numbers', async () => {
  const pages = await extractPdfPages(simplePdf('Mai knowledge PDF test'));
  assert.equal(pages.length, 1);
  assert.equal(pages[0].page, 1);
  assert.match(pages[0].text, /Mai knowledge PDF test/);
});

test('text decoder handles UTF-16 little endian notes', () => {
  const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('课程笔记', 'utf16le')]);
  assert.equal(decodeTextBuffer(buffer), '课程笔记');
});
