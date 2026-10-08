import test from 'node:test';
import assert from 'node:assert/strict';
import { DeliveryGate, dispatchProposal } from '../src/runtime.js';
import { environment, form, request, ORIGIN } from './helpers.js';

test('edge forwards the original upload stream without reading it', async () => {
  const env = environment();
  const incoming = request();
  let forwarded;
  env.PROPOSAL_DELIVERY = {
    idFromName(name) { assert.equal(name, 'school-proposal-delivery'); return 'fixed'; },
    get(id) { assert.equal(id, 'fixed'); return { fetch(req) { forwarded=req; return Response.json({ok:true}); } }; },
  };
  const response = await dispatchProposal(incoming, env);
  assert.equal(forwarded, incoming);
  assert.equal(incoming.bodyUsed, false);
  assert.equal(response.status, 200);
  const data = await forwarded.formData();
  assert.equal(data.get('proposal_pdf').name, 'proposal.pdf');
});

test('edge fails closed without a coordinator and rejects unapproved origins before dispatch', async () => {
  const env = environment();
  const health = await dispatchProposal(new Request('https://backend.example/health'), env);
  assert.deepEqual(await health.json(), {ready:false});
  assert.equal((await dispatchProposal(request(), env)).status, 503);
  env.PROPOSAL_DELIVERY = { idFromName() { throw new Error('Should not dispatch'); } };
  assert.equal((await dispatchProposal(request(form(), {headers:{Origin:'https://unrelated.example'}}), env)).status,403);
  const preflight = await dispatchProposal(new Request('https://backend.example/proposals',{method:'OPTIONS',headers:{Origin:ORIGIN}}),env);
  assert.equal(preflight.status,204);
});

test('coordinator bounds simultaneous uploads and releases its slot after failure', async () => {
  const env = environment();
  let release;
  let attempts = 0;
  const gate = new DeliveryGate(env, async () => {
    attempts++;
    if (attempts === 1) { await new Promise(resolve => {release=resolve;}); throw new Error('simulated delivery failure'); }
    return Response.json({ok:true});
  });
  const first = gate.fetch(request());
  const second = await gate.fetch(request());
  assert.equal(second.status,429);
  assert.equal(second.headers.get('Access-Control-Allow-Origin'),ORIGIN);
  assert.equal(attempts,1);
  release();
  await assert.rejects(first,/simulated/);
  assert.equal((await gate.fetch(request())).status,200);
  assert.equal(attempts,2);
});

test('coordinator transport failure returns an actionable error rather than success', async () => {
  const env = environment();
  env.PROPOSAL_DELIVERY = {idFromName:()=> 'fixed',get:()=>({fetch:async()=>{throw new Error('offline');}})};
  const response = await dispatchProposal(request(),env);
  assert.equal(response.status,503);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),ORIGIN);
  assert.match((await response.json()).error,/could not confirm/);
});
