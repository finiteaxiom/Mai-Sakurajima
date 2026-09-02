const fs = require('node:fs');
const path = require('node:path');

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.txt', '.md', '.markdown', '.json', '.csv', '.tsv', '.log', '.html', '.htm']);

function decodeTextBuffer(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(buffer.length - 2);
    for (let index = 2; index + 1 < buffer.length; index += 2) {
      swapped[index - 2] = buffer[index + 1];
      swapped[index - 1] = buffer[index];
    }
    return swapped.toString('utf16le');
  }
  return buffer.toString('utf8').replace(/^\uFEFF/, '');
}

async function extractPdfPages(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true
  });
  const document = await task.promise;
  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push({
        page: pageNumber,
        text: content.items.map((item) => String(item.str || '')).join(' ').replace(/\s+([，。！？；：、])/g, '$1')
      });
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }
  return pages;
}

async function readKnowledgeDocument(filePath) {
  const absolute = path.resolve(String(filePath || ''));
  const stat = fs.statSync(absolute);
  if (!stat.isFile()) throw new Error('只能导入文件。');
  if (stat.size > 80 * 1024 * 1024) throw new Error('单个资料文件不能超过 80 MB。');
  const extension = path.extname(absolute).toLocaleLowerCase('en-US');
  if (!SUPPORTED_EXTENSIONS.has(extension)) throw new Error(`暂不支持 ${extension || '无扩展名'} 文件。`);
  const buffer = fs.readFileSync(absolute);
  const pages = extension === '.pdf'
    ? await extractPdfPages(buffer)
    : [{ page: 0, text: decodeTextBuffer(buffer) }];
  return {
    title: path.basename(absolute, extension),
    sourcePath: absolute,
    fileType: extension.slice(1),
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    pages
  };
}

module.exports = {
  SUPPORTED_EXTENSIONS,
  decodeTextBuffer,
  extractPdfPages,
  readKnowledgeDocument
};
