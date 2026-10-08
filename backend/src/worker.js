import { Buffer } from 'node:buffer';
import { FIELDS, MAX_REQUEST_BYTES, ProposalError, validateFields, validateFiles, documentBytes, digest } from '../../proposal-schema.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000; // Below Resend's 24-hour deduplication window.
const ACTION = 'school_proposal';
const log = (event, reference = '') => console.log(JSON.stringify({ event, reference }));

export function config(env) {
  const origins = (env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  const recipient = env.PROPOSAL_RECIPIENT || '';
  const sender = env.MAIL_FROM || '';
  const address = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;
  const ready = env.DELIVERY_ENABLED === 'true' && env.DB && env.SUBMISSION_RATE_LIMITER &&
    env.RESEND_API_KEY && env.TURNSTILE_SECRET_KEY && address.test(recipient) && address.test(sender) && origins.length;
  return { origins, recipient, sender, ready: Boolean(ready) };
}

export function json(body, status = 200, origin = '') {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(JSON.stringify(body), { status, headers });
}

async function boundedForm(request) {
  const type = request.headers.get('Content-Type') || '';
  if (!type.toLowerCase().startsWith('multipart/form-data;')) throw new ProposalError('Use the proposal form to upload documents.', 415);
  const length = Number(request.headers.get('Content-Length'));
  if (length > MAX_REQUEST_BYTES) throw new ProposalError('The upload is too large. Keep attachments within 10 MiB.', 413);
  if (!request.body) throw new ProposalError('The proposal is empty.', 400);
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    reader.cancel().catch(() => {});
  }, 30000);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new ProposalError('The upload is too large. Keep attachments within 10 MiB.', 413);
      }
      chunks.push(value);
    }
  } finally { clearTimeout(timeout); reader.releaseLock(); }
  if (timedOut) throw new ProposalError('The upload took too long. Please try again or submit by email.', 408);
  try { return await new Response(new Blob(chunks), { headers: { 'Content-Type': type } }).formData(); }
  catch { throw new ProposalError('The upload could not be read. Please try again.', 400); }
}

function singleton(form, name, max) {
  const items = form.getAll(name);
  if (items.length !== 1 || typeof items[0] !== 'string' || items[0].length > max) {
    throw new ProposalError('Please reload the form and try again.', 400);
  }
  return items[0];
}

async function verifyChallenge(form, env, origin, fetcher) {
  const token = singleton(form, 'cf-turnstile-response', 2048);
  if (!token) throw new ProposalError('Complete the security check, then try again.', 422);
  let result;
  try {
    const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('challenge service');
    result = await response.json();
  } catch { throw new ProposalError('The security check is unavailable. Your proposal has not been sent. Please try again.', 503); }
  if (!result.success || result.action !== ACTION || result.hostname !== new URL(origin).hostname) {
    throw new ProposalError('The security check expired or failed. Please complete it again.', 422);
  }
}

async function prepareEmail(fields, files, id, settings) {
  const attachments = [];
  for (const file of files) {
    attachments.push({ filename: file.name, content: Buffer.from(await documentBytes(file)).toString('base64') });
  }
  const reference = `SCH-${id}`;
  const text = [
    'IACR Cryptology School proposal', `Reference: ${reference}`, '',
    ...FIELDS.flatMap(([name, label]) => [label, fields[name] || '(not provided)', '']),
    'Documents attached', ...files.map(file => `- ${file.name}`), '',
    'The organizer confirmed that they read the official IACR policy and are ready to submit.',
    'Reply to this email to contact the organizer.',
  ].join('\n');
  return {
    from: `IACR school proposals <${settings.sender}>`,
    to: [settings.recipient], reply_to: fields.email,
    subject: `IACR Cryptology School proposal — ${fields.school_name}`,
    text, attachments,
  };
}

async function sendOnce(env, payload, id, fetcher, now) {
  const reference = `SCH-${id}`;
  const serialized = JSON.stringify(payload);
  const hash = await digest(serialized);
  // An atomic INSERT limits new submissions to 20/day, including failed attempts.
  await env.DB.prepare(`INSERT OR IGNORE INTO submissions (id, payload_hash, created_at)
    SELECT ?1, ?2, ?3 WHERE (SELECT COUNT(*) FROM submissions WHERE created_at >= ?4) < 20`)
    .bind(id, hash, now, now - 86400000).run();
  const row = await env.DB.prepare('SELECT * FROM submissions WHERE id = ?1').bind(id).first();
  if (!row) throw new ProposalError('The online form has reached its daily limit. Please email schools@iacr.org or try tomorrow.', 429);
  if (row.payload_hash !== hash) throw new ProposalError('This reference belongs to a different version of the proposal. Contact schools@iacr.org before submitting again.', 409);
  if (row.state === 'accepted') return { status: 'accepted', reference };
  if (now - row.created_at >= RETRY_WINDOW_MS) {
    throw new ProposalError(`We cannot safely retry this submission. Ask schools@iacr.org to check reference ${reference} before sending again.`, 409);
  }
  const claim = await env.DB.prepare(`UPDATE submissions SET lease_until = ?1
    WHERE id = ?2 AND state = 'pending' AND lease_until <= ?3`)
    .bind(now + 60000, id, now).run();
  if (claim.meta.changes !== 1) throw new ProposalError('This submission is still processing. Wait one minute and retry with the same documents.', 409);

  let response;
  let result;
  try {
    response = await fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `school-proposal/${id}` },
      body: serialized, signal: AbortSignal.timeout(20000),
    });
    result = await response.json();
  } catch {
    log('delivery_outcome_unknown', reference);
    // Preserve the lease after timeouts; the provider may still be processing.
    throw new ProposalError(`We could not confirm delivery. Keep this page open and retry in one minute. Reference ${reference}.`, 503);
  }
  if (!response.ok || typeof result.id !== 'string' || !result.id) {
    await env.DB.prepare('UPDATE submissions SET lease_until = 0 WHERE id = ?1').bind(id).run();
    log('delivery_not_confirmed', reference);
    throw new ProposalError(`We could not confirm delivery. Please retry with the same documents, or contact schools@iacr.org with reference ${reference}.`, 503);
  }
  await env.DB.prepare("UPDATE submissions SET state = 'accepted', provider_id = ?1, accepted_at = ?2, lease_until = 0 WHERE id = ?3")
    .bind(result.id, now, id).run();
  log('email_accepted', reference);
  return { status: 'accepted', reference };
}

// Injectable network/clock only for offline tests, never selected by request data.
export async function handleRequest(request, env, { fetcher = fetch, now = Date.now() } = {}) {
  const settings = config(env);
  const origin = request.headers.get('Origin') || '';
  const allowedOrigin = settings.origins.includes(origin) ? origin : '';
  const path = new URL(request.url).pathname;
  if (path === '/health' && request.method === 'GET') return json({ ready: settings.ready }, 200, allowedOrigin);
  if (path !== '/proposals') return json({ error: 'Not found.' }, 404, allowedOrigin);
  if (!allowedOrigin) return json({ error: 'Open the form on the schools website.' }, 403);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': origin, 'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600',
    } });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, origin);
  if (!settings.ready) return json({ error: 'Online submission is unavailable. Please email schools@iacr.org.' }, 503, origin);
  try {
    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip) throw new ProposalError('Unable to validate this request.', 400);
    const rate = await env.SUBMISSION_RATE_LIMITER.limit({ key: ip });
    if (!rate.success) throw new ProposalError('Too many attempts. Please wait a minute before trying again.', 429);
    const form = await boundedForm(request);
    if (form.get('company_website')) throw new ProposalError('Unable to accept this submission.', 400);
    const allowedFields = new Set([...FIELDS.map(([name]) => name), 'confirmation', 'proposal_pdf', 'supporting_documents', 'company_website', 'cf-turnstile-response', 'submission_id']);
    for (const name of form.keys()) if (!allowedFields.has(name)) throw new ProposalError('Unexpected form field. Please reload the page.', 400);
    const id = singleton(form, 'submission_id', 36);
    if (!UUID.test(id)) throw new ProposalError('Please reload the form and try again.', 400);
    const fields = validateFields(form);
    const files = validateFiles(form);
    await verifyChallenge(form, env, origin, fetcher);
    const payload = await prepareEmail(fields, files, id, settings);
    return json(await sendOnce(env, payload, id, fetcher, now), 200, origin);
  } catch (error) {
    if (error instanceof ProposalError) return json({ error: error.message, field: error.field }, error.status, origin);
    log('submission_error'); // Never log request bodies, API keys or attachment contents.
    return json({ error: 'We could not confirm submission. Keep this page open and retry in one minute, or contact schools@iacr.org.' }, 503, origin);
  }
}

export default { fetch: (request, env) => handleRequest(request, env) };
