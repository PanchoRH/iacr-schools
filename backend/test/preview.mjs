// LOCAL-ONLY preview. Network calls are replaced, so no email can be sent.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleRequest } from '../src/worker.js';
import { environment, network } from './helpers.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const port = Number(process.env.PREVIEW_PORT || 8765);
const origin = `http://localhost:${port}`;
const env = environment();
env.ALLOWED_ORIGINS = origin;
let failNext = false;
const net = network({
  challenge: { success: true, hostname: 'localhost', action: 'school_proposal' },
  send: async () => {
    if (failNext) { failNext = false; return Response.json({ error: 'Offline simulated failure' }, { status: 503 }); }
    return Response.json({ id: 'offline-email-no-message-sent' });
  },
});
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };
const publicFiles = new Set(['index.html', 'propose.html', 'submit-proposal.html', 'committee.html', 'styles.css', 'app.js', 'schools.json', 'favicon.png', 'proposal-config.js', 'proposal-schema.js', 'proposal-form.js', 'proposal-form.css']);

createServer(async (req, res) => {
  const path = new URL(req.url, origin).pathname;
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (path === '/simulate-failure' && req.method === 'POST') { failNext = true; res.end('The next submission will show a simulated delivery error.'); return; }
    if (path === '/health' || path === '/proposals') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const request = new Request(`${origin}${path}`, { method: req.method,
        headers: { ...req.headers, 'CF-Connecting-IP': '127.0.0.1' }, ...(body.length ? { body } : {}) });
      const result = await handleRequest(request, env, { fetcher: net.fetcher });
      res.writeHead(result.status, Object.fromEntries(result.headers));
      res.end(Buffer.from(await result.arrayBuffer())); return;
    }
    if (path === '/proposal-config.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(`export const proposalConfig = { enabled: true, apiBase: '${origin}', turnstileSiteKey: 'offline-preview' };`); return;
    }
    if (path === '/offline-challenge.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(`window.turnstile = {
        render(selector) { document.querySelector(selector).textContent = 'Local preview — security check simulated.'; return 0; },
        getResponse() { return 'offline-token'; }, reset() {}
      };`); return;
    }
    const file = path === '/' ? 'submit-proposal.html' : path.slice(1);
    const full = resolve(root, file);
    if (!full.startsWith(root) || (!publicFiles.has(file) && !file.startsWith('assets/'))) { res.writeHead(404); res.end(); return; }
    let body = await readFile(full);
    if (file === 'proposal-form.js') body = Buffer.from(body.toString().replace('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', '/offline-challenge.js'));
    if (file === 'submit-proposal.html') body = Buffer.from(body.toString().replace('<main>', `<main><aside style="padding:16px;background:#fff1cf;text-align:center" role="note"><strong>Local preview. No email is sent.</strong> Upload only sample files. <button type="button" onclick="fetch('/simulate-failure',{method:'POST'}).then(r=>r.text()).then(t=>this.textContent=t)">Simulate a delivery failure</button></aside>`));
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch { res.writeHead(500); res.end('Local preview error.'); }
}).listen(port, '127.0.0.1', () => console.log(`Offline form preview at ${origin}/submit-proposal.html — NO EMAIL IS SENT`));
