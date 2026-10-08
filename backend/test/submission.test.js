import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../src/worker.js';
import { MAX_REQUEST_BYTES, MAX_FILE_BYTES, FIELDS } from '../../proposal-schema.js';
import { environment, form, request, network, NOW, ID, PDF, ORIGIN } from './helpers.js';

const send = (req, env, net, now = NOW) => handleRequest(req, env, { fetcher: net.fetcher, now });

test('sends all five original documents as real attachments with a fixed recipient and reply-to', async () => {
  const env = environment(), net = network(), data = form();
  const extras = [new File(['Budget,USD\nTotal,8000'], 'budget.csv'), new File(['Speakers'], 'speakers.txt'),
    new File([PDF], 'programme.pdf'), new File([new Uint8Array([80,75,3,4,1,2,3])], 'support.docx')];
  extras.forEach(file => data.append('supporting_documents', file));
  const response = await send(request(data), env, net);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'accepted');
  const payload = net.messages[0].body;
  assert.deepEqual(payload.to, ['private-test@example.org']);
  assert.equal(payload.reply_to, 'organizer@university.example');
  assert.equal(payload.attachments.length, 5);
  const original = [new File([PDF], 'proposal.pdf'), ...extras];
  for (const [i, file] of original.entries()) {
    assert.equal(payload.attachments[i].filename, file.name);
    assert.deepEqual(Buffer.from(payload.attachments[i].content, 'base64'), Buffer.from(await file.arrayBuffer()));
  }
  for (const [, label] of FIELDS) assert.ok(payload.text.includes(label));
  assert.equal(net.messages[0].headers['Idempotency-Key'], `school-proposal/${ID}`);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const row = env.DB.sqlite.prepare('SELECT * FROM submissions').get();
  assert.equal(row.state, 'accepted');
  assert.ok(!JSON.stringify(row).includes('organizer@'));
});

test('an accepted proposal is not emailed twice, including after the provider retry window', async () => {
  const env = environment(), net = network();
  await send(request(), env, net);
  const retry = await send(request(), env, net, NOW + 2 * 86400000);
  assert.equal(retry.status, 200);
  assert.equal(net.messages.length, 1);
});

test('simultaneous submissions acquire a single delivery lease', async () => {
  const env = environment(), net = network();
  const results = await Promise.all([send(request(), env, net), send(request(), env, net)]);
  assert.ok(results.some(response => response.status === 200));
  assert.equal(net.messages.length, 1);
});

test('changed documents cannot reuse an existing reference', async () => {
  const env = environment(), net = network();
  await send(request(), env, net);
  const changed = form();
  changed.set('proposal_pdf', new File(['%PDF-1.7 changed'], 'proposal.pdf'));
  assert.equal((await send(request(changed), env, net)).status, 409);
  assert.equal(net.messages.length, 1);
});

test('a timeout retries with the identical provider payload and key, but never after 23 hours', async () => {
  const env = environment(), net = network({ send: async () => { throw new Error('timeout'); } });
  assert.equal((await send(request(), env, net)).status, 503);
  assert.equal((await send(request(), env, net, NOW + 1000)).status, 409);
  assert.equal((await send(request(), env, net, NOW + 61000)).status, 503);
  assert.deepEqual(net.messages[0], net.messages[1]);
  assert.equal((await send(request(), env, net, NOW + 23 * 3600000)).status, 409);
  assert.equal(net.messages.length, 2);
});

test('provider errors do not produce a success response', async () => {
  for (const providerStatus of [400, 401, 409, 429, 500]) {
    const net = network({ send: async () => Response.json({ error: 'test failure' }, { status: providerStatus }) });
    const env = environment();
    assert.equal((await send(request(), env, net)).status, 503);
    assert.equal(env.DB.sqlite.prepare('SELECT state FROM submissions').get().state, 'pending');
  }
});

test('a failed database write after provider acceptance does not create a new email key', async () => {
  const env = environment(), net = network();
  const original = env.DB.prepare;
  env.DB.prepare = sql => {
    if (sql.startsWith("UPDATE submissions SET state = 'accepted'")) throw new Error('database unavailable');
    return original(sql);
  };
  assert.equal((await send(request(), env, net)).status, 503);
  env.DB.prepare = original;
  assert.equal((await send(request(), env, net, NOW + 61000)).status, 200);
  assert.deepEqual(net.messages[0], net.messages[1]);
});

test('rejects invalid fields before any external request', async () => {
  const cases = [
    data => data.delete('organizer_name'), data => data.set('email', 'bad@example.org\r\nBcc: x@y.test'),
    data => data.set('end_date', '2027-01-01'), data => data.set('start_date', '2027-02-30'),
    data => data.set('attendance', '1.5'), data => data.set('school_website', 'javascript:alert(1)'),
    data => data.set('confirmation', 'no'), data => data.set('topic', 'a'.repeat(4001)),
    data => data.append('email', 'second@example.org'), data => data.set('school_name', 'a\nb'),
  ];
  for (const alter of cases) {
    const net = network(), data = form(); alter(data);
    assert.equal((await send(request(data), environment(), net)).status, 422);
    assert.equal(net.messages.length + net.challenges.length, 0);
  }
});

test('rejects missing, unsafe, duplicate, excessive and disguised attachments', async () => {
  const cases = [
    data => data.delete('proposal_pdf'),
    data => data.set('proposal_pdf', new File(['fake'], 'proposal.pdf')),
    data => data.append('supporting_documents', new File(['executable'], 'tool.exe')),
    data => data.append('supporting_documents', new File(['test'], 'proposal.pdf')),
    data => data.append('supporting_documents', new File(['test'], 'bad\nname.txt')),
    data => data.append('supporting_documents', new File(['test'], 'fake.xlsx')),
    data => data.append('supporting_documents', new File([new Uint8Array([255])], 'bad.txt')),
    data => data.append('supporting_documents', new File([''], 'empty.txt')),
    data => { for (let i = 0; i < 5; i++) data.append('supporting_documents', new File(['test'], `${i}.txt`)); },
    data => data.append('supporting_documents', new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'big.txt')),
  ];
  for (const alter of cases) {
    const net = network(), data = form(); alter(data);
    assert.equal((await send(request(data), environment(), net)).status, 422);
    assert.equal(net.messages.length, 0);
  }
});

test('enforces aggregate size and request limits, including a streamed body with no length header', async () => {
  const data = form(), net = network(), env = environment();
  for (let i = 0; i < 3; i++) data.append('supporting_documents', new File([new Uint8Array(4 * 1024 * 1024)], `${i}.txt`));
  // Materialize Node's multipart encoder before testing cancellation. Cancelling
  // its live encoder currently raises an unrelated Node ReadableStream error.
  const encoded = request(data);
  const bytes = new Uint8Array(await encoded.arrayBuffer());
  let offset = 0, cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      if (offset === bytes.length) { controller.close(); return; }
      const next = Math.min(offset + 65536, bytes.length);
      controller.enqueue(bytes.subarray(offset, next)); offset = next;
    },
    cancel() { cancelled = true; },
  });
  const streamed = new Request(encoded.url, { method: 'POST', headers: encoded.headers, body: stream, duplex: 'half' });
  assert.equal(streamed.headers.get('Content-Length'), null);
  assert.equal((await send(streamed, env, net)).status, 413);
  assert.equal(cancelled, true);
  const oversized = request(); oversized.headers.set('Content-Length', `${MAX_REQUEST_BYTES + 1}`);
  assert.equal((await send(oversized, env, net)).status, 413);
  assert.equal(net.messages.length + net.challenges.length, 0);
});

test('checks the combined attachment limit even below the multipart request ceiling', async () => {
  const data = form(), net = network();
  for (let i = 0; i < 2; i++) data.append('supporting_documents', new File([new Uint8Array(MAX_FILE_BYTES)], `${i}.txt`));
  assert.equal((await send(request(data), environment(), net)).status, 422);
  assert.equal(net.messages.length, 0);
});

test('fails closed when not activated or missing required configuration', async () => {
  for (const key of ['DELIVERY_ENABLED', 'DB', 'RESEND_API_KEY', 'TURNSTILE_SECRET_KEY', 'MAIL_FROM', 'PROPOSAL_RECIPIENT', 'SUBMISSION_RATE_LIMITER']) {
    const env = environment(), net = network(); delete env[key];
    assert.equal((await send(request(), env, net)).status, 503);
    assert.equal(net.messages.length + net.challenges.length, 0);
  }
});

test('verifies challenge action and hostname, not merely success', async () => {
  for (const challenge of [
    { success: false }, { success: true, hostname: 'attacker.example', action: 'school_proposal' },
    { success: true, hostname: 'panchorh.github.io', action: 'other' },
  ]) {
    const net = network({ challenge });
    assert.equal((await send(request(), environment(), net)).status, 422);
    assert.equal(net.messages.length, 0);
  }
});

test('blocks unknown fields, recipient overrides, honeypots and foreign origins', async () => {
  for (const name of ['to', 'cc', 'bcc', 'company_website']) {
    const net = network(), data = form(); data.set(name, 'outside@example.org');
    assert.equal((await send(request(data), environment(), net)).status, 400);
    assert.equal(net.messages.length + net.challenges.length, 0);
  }
  const req = request(); req.headers.set('Origin', 'https://attacker.example');
  assert.equal((await send(req, environment(), network())).status, 403);
});

test('limits retries per IP and new proposals per day', async () => {
  const env = environment(), net = network();
  env.SUBMISSION_RATE_LIMITER.limit = async () => ({ success: false });
  assert.equal((await send(request(), env, net)).status, 429);
  assert.equal(net.messages.length + net.challenges.length, 0);
  env.SUBMISSION_RATE_LIMITER.limit = async () => ({ success: true });
  for (let i = 0; i < 20; i++) env.DB.sqlite.prepare('INSERT INTO submissions (id,payload_hash,created_at) VALUES (?,?,?)').run(`other-${i}`, 'test', NOW);
  assert.equal((await send(request(), env, net)).status, 429);
  assert.equal(net.messages.length, 0);
});

test('allowed browser preflight and health work without sending any email', async () => {
  const env = environment(), net = network();
  const preflight = new Request('https://backend.example/proposals', { method: 'OPTIONS', headers: { Origin: ORIGIN } });
  assert.equal((await send(preflight, env, net)).status, 204);
  env.DELIVERY_ENABLED = 'false';
  const health = new Request('https://backend.example/health', { headers: { Origin: ORIGIN } });
  assert.deepEqual(await (await send(health, env, net)).json(), { ready: false });
  assert.equal(net.messages.length + net.challenges.length, 0);
});
