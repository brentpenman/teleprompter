import { createServer } from 'https';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { get as httpsGet } from 'https';
import { get as httpGet } from 'http';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const MIME_TYPES = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

const options = {
  key:  readFileSync(join(__dirname, 'localhost-key.pem')),
  cert: readFileSync(join(__dirname, 'localhost-cert.pem')),
};

const server = createServer(options, (req, res) => {
  // Cross-origin isolation headers required for SharedArrayBuffer (Vosk WASM)
  const crossOriginHeaders = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  };

  // Model download proxy to avoid CORS issues
  if (req.url.startsWith('/api/model-proxy?url=')) {
    const targetUrl = decodeURIComponent(req.url.split('url=')[1]);
    console.log(`[Proxy] Fetching model from: ${targetUrl}`);

    const httpLib = targetUrl.startsWith('https:') ? httpsGet : httpGet;
    httpLib(targetUrl, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': proxyRes.headers['content-type'] || 'application/octet-stream',
        'Content-Length': proxyRes.headers['content-length'],
        'Access-Control-Allow-Origin': '*',
        ...crossOriginHeaders
      });
      proxyRes.pipe(res);
    }).on('error', (err) => {
      console.error('[Proxy] Error:', err);
      res.writeHead(502, crossOriginHeaders);
      res.end('Proxy error');
    });
    return;
  }

  let filePath = join(__dirname, req.url === '/' ? 'index.html' : req.url);

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }

  if (!existsSync(filePath)) {
    res.writeHead(404, crossOriginHeaders);
    res.end('Not found');
    return;
  }

  const ext = extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': contentType,
    ...crossOriginHeaders
  });
  res.end(readFileSync(filePath));
});

const port = process.env.PORT || 3000;
server.listen(port, '0.0.0.0', () => {
  console.log(`HTTPS server running on https://localhost:${port}`);
});
