import { proposalConfig } from './proposal-config.js';
import { FIELDS, validateFields, validateFiles, documentBytes, digest } from './proposal-schema.js';

const form = document.querySelector('#proposal-form');
const section = document.querySelector('#online-proposal');
const status = document.querySelector('#form-status');
const button = document.querySelector('#send-proposal');
let widget;
let busy = false;
let completed = false;
let latestIdentity;

function message(text, success = false) {
  status.textContent = text;
  status.classList.toggle('success', success);
  status.hidden = false;
  status.focus();
}

function loadChallenge() {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve();
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}

async function identity(fields, files) {
  const documents = [];
  for (const file of files) documents.push([file.name, await digest(await documentBytes(file))]);
  const fingerprint = await digest(JSON.stringify({ fields, documents }));
  if (latestIdentity?.fingerprint === fingerprint) return latestIdentity.id;
  try {
    const saved = JSON.parse(sessionStorage.getItem('iacr-proposal-reference'));
    if (saved?.fingerprint === fingerprint && typeof saved.id === 'string') {
      latestIdentity = saved;
      return saved.id;
    }
  } catch { /* Storage may be unavailable; retain the reference in memory. */ }
  latestIdentity = { fingerprint, id: crypto.randomUUID() };
  try { sessionStorage.setItem('iacr-proposal-reference', JSON.stringify(latestIdentity)); } catch { /* See above. */ }
  return latestIdentity.id;
}

function clearErrors() {
  for (const field of form.querySelectorAll('[aria-invalid]')) field.removeAttribute('aria-invalid');
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || completed || !form.reportValidity()) return;
  clearErrors();
  busy = true;
  button.disabled = true;
  button.textContent = 'Sending proposal…';
  status.hidden = true;
  let attempted = false;
  try {
    const data = new FormData(form);
    const fields = validateFields(data);
    const files = validateFiles(data);
    for (const fieldset of form.querySelectorAll('fieldset')) fieldset.disabled = true;
    for (const [name] of FIELDS) data.set(name, fields[name]);
    // File pickers with no selection contribute an empty File in some browsers.
    data.delete('proposal_pdf');
    data.delete('supporting_documents');
    files.forEach((file, index) => data.append(index ? 'supporting_documents' : 'proposal_pdf', file));
    const id = await identity(fields, files);
    data.set('submission_id', id);
    const token = window.turnstile?.getResponse(widget);
    if (!token) throw new Error('Please complete the security check before submitting.');
    data.set('cf-turnstile-response', token);
    attempted = true;
    const response = await fetch(`${proposalConfig.apiBase.replace(/\/$/, '')}/proposals`, {
      method: 'POST', body: data, credentials: 'omit', signal: AbortSignal.timeout(90000),
    });
    let result;
    try { result = await response.json(); }
    catch { throw new Error('We could not confirm submission. Keep this page open and retry in one minute.'); }
    if (!response.ok) {
      const error = new Error(result.error || 'We could not confirm submission. Please try again.');
      error.field = result.field;
      throw error;
    }
    if (result.status !== 'accepted' || result.reference !== `SCH-${id}`) throw new Error('We could not confirm submission. Please contact schools@iacr.org.');
    completed = true;
    message(`Your proposal and ${files.length} document${files.length === 1 ? '' : 's'} have been accepted for email delivery to schools@iacr.org. Your reference is ${result.reference}. Keep a copy of your documents. If you do not hear from the committee within a week, email schools@iacr.org and include this reference.`, true);
    for (const fieldset of form.querySelectorAll('fieldset')) fieldset.disabled = true;
    button.textContent = 'Proposal submitted';
    document.querySelector('#form-return').hidden = false;
  } catch (error) {
    const fallback = attempted
      ? 'We could not confirm submission. Keep this page open and retry in one minute with the same documents.'
      : 'We could not prepare the submission. Please check the form or email schools@iacr.org.';
    const reference = attempted && latestIdentity && !error.message.includes(`SCH-${latestIdentity.id}`) ? ` Your reference is SCH-${latestIdentity.id}.` : '';
    message(`${error.name === 'AbortError' || error.name === 'TimeoutError' || error instanceof TypeError ? fallback : error.message}${reference}`);
    for (const fieldset of form.querySelectorAll('fieldset')) fieldset.disabled = false;
    if (error.field) {
      const field = form.elements.namedItem(error.field);
      if (field instanceof HTMLElement) { field.setAttribute('aria-invalid', 'true'); field.focus(); }
    }
    if (attempted && window.turnstile && widget !== undefined) window.turnstile.reset(widget);
  } finally {
    busy = false;
    if (!completed) {
      for (const fieldset of form.querySelectorAll('fieldset')) fieldset.disabled = false;
      button.disabled = false; button.textContent = 'Submit proposal';
    }
  }
});

for (const input of form.querySelectorAll('input[type=file]')) {
  input.addEventListener('change', () => {
    const list = document.querySelector(`#${input.id}-list`);
    list.replaceChildren(...[...input.files].map(file => {
      const li = document.createElement('li');
      const size = file.size >= 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(2)} MiB` : `${Math.max(1, Math.ceil(file.size / 1024))} KiB`;
      li.textContent = `${file.name} (${size})`;
      return li;
    }));
  });
}

window.addEventListener('beforeunload', event => {
  if (busy) { event.preventDefault(); event.returnValue = ''; }
});

async function initialize() {
  if (!proposalConfig.enabled || !proposalConfig.apiBase || !proposalConfig.turnstileSiteKey) return;
  // Public deployment requires HTTPS. Local endpoints are accepted only on localhost.
  try {
    const endpoint = new URL(proposalConfig.apiBase);
    if (endpoint.protocol !== 'https:' && !(['localhost', '127.0.0.1'].includes(location.hostname) && ['localhost', '127.0.0.1'].includes(endpoint.hostname))) return;
    const health = await fetch(`${proposalConfig.apiBase.replace(/\/$/, '')}/health`, { credentials: 'omit', signal: AbortSignal.timeout(8000) });
    if (!health.ok || !(await health.json()).ready) return;
    await loadChallenge();
    widget = window.turnstile.render('#proposal-challenge', {
      sitekey: proposalConfig.turnstileSiteKey, action: 'school_proposal',
      'response-field': false,
      'error-callback': () => { message('The security check could not load. Please retry, or email your proposal to schools@iacr.org.'); return true; },
      'expired-callback': () => window.turnstile.reset(widget),
    });
    section.hidden = false;
    document.querySelector('#online-proposal-link').hidden = false;
    document.querySelector('#email-checklist-section').hidden = true;
    document.querySelector('#submission-eyebrow').textContent = 'School proposals';
    document.querySelector('#submission-intro').textContent = 'Complete the form below and attach your proposal PDF and supporting documents.';
  } catch { /* The existing direct-email route remains visible and usable. */ }
}

initialize();
