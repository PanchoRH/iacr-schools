import { config, handleRequest, json } from './worker.js';

// One upload at a time keeps large attachments within the isolate's memory budget.
// The object does not persist documents; D1 retains only delivery metadata.
export class DeliveryGate {
  constructor(env, handler) {
    this.env = env;
    this.handler = handler;
    this.busy = false;
  }

  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = config(this.env).origins.includes(origin) ? origin : '';
    if (this.busy) return json({ error: 'Another proposal is being processed. Please keep this page open and try again in one minute.' }, 429, allowedOrigin);
    this.busy = true;
    try { return await this.handler(request); }
    finally { this.busy = false; }
  }
}

// SQLite-backed Durable Objects have a 30-second CPU allowance on Workers Free.
// No Durable Object storage is used: attachments exist only during the request.
export class ProposalDelivery {
  constructor(_ctx, env) {
    this.gate = new DeliveryGate(env, request => handleRequest(request, env));
  }
  fetch(request) { return this.gate.fetch(request); }
}

export async function dispatchProposal(request, env) {
  const settings = config(env);
  const origin = request.headers.get('Origin') || '';
  const allowedOrigin = settings.origins.includes(origin) ? origin : '';
  const path = new URL(request.url).pathname;
  if (!env.PROPOSAL_DELIVERY) return handleRequest(request, { ...env, DELIVERY_ENABLED: 'false' });
  if (path !== '/proposals' || request.method !== 'POST' || !allowedOrigin || !settings.ready) {
    return handleRequest(request, env);
  }
  // Pass the body as a stream. Parsing/base64 must not run in the 10ms edge Worker.
  try {
    const id = env.PROPOSAL_DELIVERY.idFromName('school-proposal-delivery');
    return await env.PROPOSAL_DELIVERY.get(id).fetch(request);
  } catch {
    return json({ error: 'We could not confirm submission. Keep this page open and retry in one minute, or email schools@iacr.org.' }, 503, allowedOrigin);
  }
}

export default { fetch: dispatchProposal };
