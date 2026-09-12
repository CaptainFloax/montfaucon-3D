// Petit serveur statique local, sans dépendance. Sert uniquement le dossier du projet.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, normalize, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 3002);
const HOST = process.env.HOST || '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

const serveur = createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end('Méthode non autorisée');
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    // normalisation stricte : rien en dehors de la racine du projet
    const chemin = normalize(join(ROOT, rel));
    if (chemin !== ROOT && !chemin.startsWith(ROOT + sep)) {
      res.writeHead(403).end('Interdit');
      return;
    }
    const info = await stat(chemin);
    if (info.isDirectory()) {
      res.writeHead(301, { location: `${url.pathname.replace(/\/?$/, '/')}index.html` }).end();
      return;
    }
    const type = TYPES[extname(chemin).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'content-type': type,
      'content-length': info.size,
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(chemin).pipe(res);
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 — introuvable');
    } else {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end('500 — erreur serveur');
    }
  }
});

serveur.listen(PORT, HOST, () => {
  console.log(`\n  ✦ Montfaucon-Montigné en 3D\n    → http://localhost:${PORT}\n\n    (Ctrl+C pour arrêter)\n`);
});
