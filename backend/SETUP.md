# Proposal delivery

## Current status

The form and Worker are implemented. Delivery is **off by default** in both the public configuration and the Worker configuration. The existing email route remains available. Offline tests do not contact Cloudflare, Resend or the committee.

Production activation still requires a Cloudflare account, a Resend account, a verified sender domain, and successful private delivery testing. No provider account or paid plan is created by these files.

## What applicants get

- Required school, organizer, teaching, logistics and budget fields.
- One required proposal PDF and up to four supporting documents.
- PDF, DOCX, XLSX, ODT, ODS, CSV and UTF-8 TXT support; no applicant account.
- A maximum of 5 MiB per file and 10 MiB combined, before email encoding.
- A reference number and explicit confirmation of acceptance for email delivery.
- The existing direct-email route if the form is unavailable or the documents are larger.

The outgoing message is plain text with the uploaded files attached. The applicant's address is Reply-To, never From. The recipient is fixed on the server; the browser cannot override it. No applicant autoresponder is sent, preventing abuse of arbitrary contact addresses.

## Local checks

Use Node 24 LTS or newer. From the repository root:

```sh
npm ci
npm test
npm run worker:check
npm run build:site
npm run preview:form
```

Open http://localhost:8765/submit-proposal.html for an explicitly labelled offline preview. This preview uses the real validator, database SQL, form and delivery handler, with simulated security verification and email responses. It cannot send email. The preview helper and backend are excluded from the Pages build.

`npm run worker:check` bundles the Worker without deploying it. Offline success is not evidence that a real mailbox received attachments.

## Accounts and sender

1. Choose an organization-controlled sender domain or subdomain where DNS records can be added. It need not be hosted by Cloudflare. The receiver remains schools@iacr.org; control of iacr.org is not required if another approved sender domain is used.
2. In Resend, verify that sender domain with the DNS records provided by the dashboard. Create a sending API key restricted to it where supported. Use a dedicated sender such as proposals@THE-VERIFIED-DOMAIN. Do not use schools@iacr.org as From unless IACR has explicitly provided the necessary DNS access and approval.
3. In Cloudflare, create a managed Turnstile widget. For staging, allow localhost. For the public site, allow panchorh.github.io. Keep the secret key separate from the public site key.
4. Choose a **private test inbox**. Do not use the committee alias during development.

Never paste API keys into chat, commit them, or put them in `proposal-config.js`.

## Staging Worker

Authenticate Wrangler with the chosen Cloudflare account, then create an isolated database:

```sh
npx wrangler login
npx wrangler d1 create iacr-school-proposals-staging
cp backend/wrangler.example.jsonc backend/wrangler.jsonc
```

Edit the ignored `backend/wrangler.jsonc` locally:

- Replace the all-zero database ID with the ID returned above.
- Set MAIL_FROM to the verified sender address, without a display name.
- Set PROPOSAL_RECIPIENT to the private test inbox.
- Set ALLOWED_ORIGINS to `http://localhost:8766` for a local browser delivery test. Origins contain no path or trailing slash. Multiple exact origins can be comma-separated.
- Keep DELIVERY_ENABLED false until configuration is complete, then set it to the string `true`.
- Choose a rate-limit namespace ID unused by another binding in the account if the example ID is already taken.

Add secrets interactively; the commands prompt without putting values into shell history:

```sh
npx wrangler secret put RESEND_API_KEY --config backend/wrangler.jsonc
npx wrangler secret put TURNSTILE_SECRET_KEY --config backend/wrangler.jsonc
npx wrangler d1 migrations apply DB --remote --config backend/wrangler.jsonc
npm run worker:deploy
```

Wrangler prints the HTTPS Worker address. For the **private local test only**, set `proposal-config.js` to enabled true, the Worker address (without /proposals), and the staging Turnstile public site key. Serve the static site on localhost:8766. Do not commit this temporary public configuration or deploy it to Pages. Restore the disabled configuration when finished.

## Private delivery acceptance checks

With the owner of the private inbox present, send one synthetic proposal with a valid PDF and four valid companion files. Check all of the following before enabling public submission:

1. The private inbox receives the message with all five files attached, not links. Open them and compare their contents to the originals. Check names and file sizes.
2. The message contains all required form answers, no advertising, and Reply-To addresses the test organizer.
3. Resend reports delivery. API acceptance alone is not proof of mailbox receipt.
4. A retry with the same submission reference creates no second email. Simulate uncertain network outcomes locally first.
5. Check the largest permitted combined upload with the Cloudflare runtime. Review CPU usage, memory and provider errors, and test through an actual university mail system if available. The free Worker's CPU limit may be insufficient for large multipart/base64 payloads. Do not buy an upgrade automatically; measure first and agree on a plan, a different host or revised limits.
6. Confirm that an unavailable backend leaves the direct-email route usable and never displays a false delivery confirmation.

The committee should receive only one clearly announced final test after the private tests pass and the owner authorizes that check. Confirm that the alias forwards **all** attachments to members; a private inbox test cannot prove that.

## Production activation

Use a separate Worker name, D1 database and Turnstile configuration for production. Repeat secret setup and migration with that configuration. Set PROPOSAL_RECIPIENT to schools@iacr.org and ALLOWED_ORIGINS to https://panchorh.github.io. Keep the frontend disabled until delivery and alias forwarding have been verified.

After validation, set the public `proposal-config.js` to the production Worker URL, production site key and enabled true. Change the proposal guide's “Submit by email” button text to “Submit a proposal”. Commit those public changes together. The Pages workflow checks the offline tests and publishes only the static-file allowlist.

The current direct-email link stays available alongside the form.

## Failure handling and records

- D1 stores only submission IDs, hashes, timestamps, delivery state and provider message IDs. It stores no names, addresses, answers or documents.
- Submitted files pass through Worker memory to Resend. Resend processes and may retain message content and attachments under its service policies; this is **not** a zero-retention service. The committee receives and keeps the email. The form discloses these processors before submission.
- File extension/signature checks are not antivirus scanning. Recipients should treat attachments as untrusted documents using their normal mail security tools.
- The browser retains a reference and content hash in session storage. It does not store proposal text or documents there. Reloading requires reselecting files and filling the form again.
- A database lease plus the provider's idempotency key protects concurrent retries and connection failures. A pending reference can be retried for up to 23 hours. After that, it requires a manual delivery check, avoiding a duplicate once Resend's 24-hour key has expired. Accepted references are never resent by this handler.
- No background queue stores or retries files. A failed or uncertain submission asks the applicant to retry while retaining their form values. If they close the page, they must restore their answers/files or email the committee. This is deliberately visible, not a claim of guaranteed delivery.
- Do not delete database records while unresolved submissions remain. Retain the small metadata registry to recognize old accepted references. There is no automatic purge; an owner can set a documented retention policy later.
- Logs contain event names and references only. To investigate, look up the reference in D1 and the provider message ID in Resend. Check delivered/bounced status manually; this version does not process bounce webhooks or provide a committee dashboard.
- The handler limits requests to 5 per minute per IP and new references to 20 per rolling day. Origin checks supplement Turnstile; they are not authentication. Cloudflare's IP limit is per location, not a globally exact counter. The D1 daily ceiling is enforced atomically.

## Rollback and maintenance

Set enabled false in `proposal-config.js` to return to email-only submission. If the backend must stop accepting uploads immediately, set DELIVERY_ENABLED false and redeploy the Worker. Keep the database for delivery reconciliation.

Keep provider accounts under an identified owner; review bounces, usage and dependencies periodically and after configuration changes. Never log API keys or uploaded content. Secrets live only in the Worker secret store or ignored local development files.

## Provider references

- [Resend attachments and encoded message size](https://resend.com/docs/dashboard/emails/attachments)
- [Resend idempotency keys and the 24-hour window](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction)
- [Cloudflare Worker pricing and CPU limits](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Turnstile server verification](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Cloudflare rate-limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

The free tiers may cover this submission volume. They do not remove the CPU, upload, deliverability or account-ownership checks above. No recurring charge has been authorized or enabled by this implementation.
