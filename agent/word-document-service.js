'use strict';

const JSZip = require('jszip');

const ZIP_DATE = new Date('2020-01-01T00:00:00.000Z');
const MAX_DOCUMENT_XML_BYTES = 1024 * 1024;

class WordDocumentError extends Error {
  constructor(code, message) { super(message); this.name = 'WordDocumentError'; this.code = code; }
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}

function paragraphsFromText(value) {
  const lines = String(value).replace(/\r\n?/g, '\n').split('\n');
  return lines.map((line) => (line ? `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>` : '<w:p/>')).join('');
}

function assertText(value) {
  if (typeof value !== 'string' || !value.trim()) throw new WordDocumentError('invalid_word_document', '写入 Word 的文本不能为空。');
}

function addFile(zip, name, content) { zip.file(name, content, { date: ZIP_DATE, createFolders: true }); }

async function createWordDocument(content) {
  assertText(content);
  const zip = new JSZip();
  addFile(zip, '[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>');
  addFile(zip, '_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>');
  addFile(zip, 'docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>Mai Sakurajima</dc:creator><cp:lastModifiedBy>Mai Sakurajima</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">2020-01-01T00:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2020-01-01T00:00:00Z</dcterms:modified></cp:coreProperties>');
  addFile(zip, 'docProps/app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Mai Sakurajima</Application></Properties>');
  addFile(zip, 'word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphsFromText(content)}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 }, platform: 'DOS' });
}

async function appendWordDocument(source, content) {
  assertText(content);
  if (!Buffer.isBuffer(source) && !(source instanceof Uint8Array)) throw new WordDocumentError('invalid_word_document', '当前文件不是 Word 文档。');
  let zip;
  try { zip = await JSZip.loadAsync(Buffer.from(source), { checkCRC32: true, createFolders: false }); } catch { throw new WordDocumentError('invalid_word_document', '当前文件不是可安全处理的标准 .docx 文档。'); }
  const entry = zip.file('word/document.xml');
  if (!entry) throw new WordDocumentError('invalid_word_document', '当前文件缺少 Word 正文，无法追加。');
  const xmlBuffer = await entry.async('nodebuffer');
  if (xmlBuffer.length > MAX_DOCUMENT_XML_BYTES) throw new WordDocumentError('word_document_too_large', 'Word 正文超过安全处理上限。');
  const documentXml = xmlBuffer.toString('utf8');
  const bodyCloseAt = documentXml.lastIndexOf('</w:body>');
  if (bodyCloseAt < 0 || !documentXml.includes('<w:document') || !documentXml.includes('<w:body')) throw new WordDocumentError('invalid_word_document', '当前文件不是可安全处理的标准 .docx 文档。');
  const sectionAt = documentXml.lastIndexOf('<w:sectPr');
  const insertAt = sectionAt >= 0 && sectionAt < bodyCloseAt ? sectionAt : bodyCloseAt;
  zip.file('word/document.xml', `${documentXml.slice(0, insertAt)}${paragraphsFromText(content)}${documentXml.slice(insertAt)}`, { date: ZIP_DATE });
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 }, platform: 'DOS' });
}

module.exports = { MAX_DOCUMENT_XML_BYTES, WordDocumentError, createWordDocument, appendWordDocument };
