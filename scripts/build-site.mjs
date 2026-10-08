import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const out = new URL('_site/', root);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
// Publish only browser assets; backend source, tests, config and credentials stay out.
const files = [
  'index.html', 'propose.html', 'submit-proposal.html', 'committee.html',
  'styles.css', 'app.js', 'schools.json', 'favicon.png', 'assets',
  'proposal-config.js', 'proposal-schema.js', 'proposal-form.js', 'proposal-form.css',
];
for (const file of files) await cp(new URL(file, root), new URL(file, out), { recursive: true });
console.log(`Built public site at ${fileURLToPath(out)}`);
