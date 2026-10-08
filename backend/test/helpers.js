import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { FIELDS } from '../../proposal-schema.js';

export const ORIGIN = 'https://panchorh.github.io';
export const NOW = Date.UTC(2026, 9, 8);
export const ID = '614194df-791f-487b-9c3d-ac76d49ae417';
export const PDF = new TextEncoder().encode('%PDF-1.7\nSynthetic proposal for offline tests.\n%%EOF');

// Execute actual production SQL using SQLite, matching the subset of D1 used here.
export function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_submissions.sql', import.meta.url), 'utf8'));
  return {
    sqlite,
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      return { bind(...args) {
        return {
          async run() { const result = stmt.run(...args); return { success: true, meta: { changes: Number(result.changes) } }; },
          async first() { return stmt.get(...args) || null; },
        };
      } };
    },
  };
}

export function environment() {
  return {
    DB: database(), SUBMISSION_RATE_LIMITER: { limit: async () => ({ success: true }) },
    DELIVERY_ENABLED: 'true', ALLOWED_ORIGINS: ORIGIN,
    MAIL_FROM: 'forms@example.org', PROPOSAL_RECIPIENT: 'private-test@example.org',
    TURNSTILE_SECRET_KEY: 'offline-only', RESEND_API_KEY: 'offline-only',
  };
}

export function form() {
  const data = new FormData();
  for (const [name] of FIELDS) data.set(name, `Test ${name}`);
  Object.entries({ email: 'organizer@university.example', school_name: 'Synthetic school',
    school_website: '', start_date: '2027-06-10', end_date: '2027-06-15', attendance: '30',
    confirmation: 'yes', submission_id: ID, 'cf-turnstile-response': 'offline-token', company_website: ''
  }).forEach(([name, value]) => data.set(name, value));
  data.set('proposal_pdf', new File([PDF], 'proposal.pdf', { type: 'application/pdf' }));
  return data;
}

export function request(data = form(), options = {}) {
  return new Request('https://backend.example/proposals', { method: 'POST', body: data,
    headers: { Origin: ORIGIN, 'CF-Connecting-IP': '192.0.2.1', ...(options.headers || {}) }, ...options });
}

export function network(options = {}) {
  const messages = [];
  const challenges = [];
  return {
    messages, challenges,
    async fetcher(url, init) {
      if (url.includes('/siteverify')) {
        challenges.push(JSON.parse(init.body));
        return Response.json(options.challenge || { success: true, hostname: 'panchorh.github.io', action: 'school_proposal' });
      }
      if (url === 'https://api.resend.com/emails') {
        messages.push({ body: JSON.parse(init.body), headers: init.headers });
        if (options.send) return options.send(url, init);
        return Response.json({ id: 'offline-email-id' });
      }
      throw new Error('Unexpected network call in offline tests');
    },
  };
}
