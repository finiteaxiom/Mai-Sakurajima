const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png'
};

http.createServer((request, response) => {
  if (request.url === '/') {
    response.writeHead(302, { Location: '/renderer/index.html' }).end();
    return;
  }
  const requestedPath = request.url;
  const filePath = path.resolve(root, `.${decodeURIComponent(requestedPath)}`);
  if (!filePath.startsWith(root)) {
    response.writeHead(403).end();
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    response.end(data);
  });
}).listen(43179, '127.0.0.1', () => {
  console.log('Mai pet preview: http://127.0.0.1:43179/');
});
