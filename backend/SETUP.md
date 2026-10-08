# Proposal delivery

## Current status

The public form is enabled for **schools@iacr.org**. Direct email remains available. The verified sender is `proposals@schools.franciscorh.org`; applicants' addresses are used only as Reply-To.

The existing validated Worker was promoted in place to preserve its installed secrets. Its URL retains its original internal name, `https://iacr-school-proposals-staging.panchorh.workers.dev`, but it is now the **production service**. Do not deploy private tests to it. The production D1 database is `iacr-school-proposals` (`ece39bd0-c8f5-400c-8508-e639c39fe31e`), separate from test records. The managed Turnstile widget allows only `panchorh.github.io`; the backend accepts only `https://panchorh.github.io`.

Private delivery was confirmed, including all five attachments opening. No test was sent to the committee alias during activation. Alias forwarding and member inbox delivery are not yet verified.

Workers Free was confirmed by Cloudflare. A direct edge upload consumed 729ms for 10MiB, exceeding its 10ms allowance. The revised edge handler streams the body to a SQLite-backed Durable Object: the 10MiB capacity test consumed 1ms at the edge and 266ms in the object, within its 30-second allowance. Capacity tests simulated Resend and did not send email. No paid subscription was enabled.

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
5. Check the largest permitted combined upload with the Cloudflare runtime. Review both edge and Durable Object CPU usage and provider errors. The edge must stream uploads without parsing them; multipart/base64 processing must run in the Durable Object, which has a 30-second default CPU allowance. Do not buy an upgrade automatically.
6. Confirm that an unavailable backend leaves the direct-email route usable and never displays a false delivery confirmation.

The committee should receive only one clearly announced final test after the private tests pass and the owner authorizes that check. Confirm that the alias forwards **all** attachments to members; a private inbox test cannot prove that.

## Production activation

For a new installation, use separate Worker names, D1 databases and Turnstile configurations for staging and production. Repeat secret setup and migration with that configuration. This installation promoted its original Worker in place as documented above; future test deployments must use a different Worker name and must not target the production database or committee recipient. Set PROPOSAL_RECIPIENT to schools@iacr.org and ALLOWED_ORIGINS to https://panchorh.github.io. Verify private delivery before public activation and clearly record whether alias forwarding has been tested. Committee test emails require explicit owner authorization.

After validation, set the public `proposal-config.js` to the production Worker URL, production site key and enabled true. Change the proposal guide's “Submit by email” button text to “Submit a proposal”. Commit those public changes together. The Pages workflow checks the offline tests and publishes only the static-file allowlist.

The current direct-email link stays available alongside the form.

## Failure handling and records

- D1 stores only submission IDs, hashes, timestamps, delivery state and provider message IDs. It stores no names, addresses, answers or documents.
- Submitted files are streamed through the edge Worker and processed in Durable Object memory before delivery to Resend. The Durable Object never stores files or proposal text. Only one upload is processed at a time, and reading the upload has a 30-second timeout; a concurrent applicant is asked to retry with their form entries retained. Resend processes and may retain message content and attachments under its service policies; this is **not** a zero-retention service. The committee receives and keeps the email. The form discloses these processors before submission.
- File extension/signature checks are not antivirus scanning. Recipients should treat attachments as untrusted documents using their normal mail security tools.
- The browser retains a reference and content hash in session storage. It does not store proposal text or documents there. Reloading requires reselecting files and filling the form again.
- A database lease plus the provider's idempotency key protects concurrent retries and connection failures. A pending reference can be retried for up to 23 hours. After that, it requires a manual delivery check, avoiding a duplicate once Resend's 24-hour key has expired. Accepted references are never resent by this handler.
- No background queue stores or retries files. A failed or uncertain submission asks the applicant to retry while retaining their form values. If they close the page, they must restore their answers/files or email the committee. This is deliberately visible, not a claim of guaranteed delivery.
- Do not delete database records while unresolved submissions remain. Retain the small metadata registry to recognize old accepted references. There is no automatic purge; an owner can set a documented retention policy later.
- Logs contain event names and references only. To investigate, look up the reference in D1 and the provider message ID in Resend. Check delivered/bounced status manually; this version does not process bounce webhooks or provide a committee dashboard.
- The handler limits requests to 5 per minute per IP and new references to 20 per rolling day. The Durable Object processes one upload at a time to bound attachment memory use. Origin checks supplement Turnstile; they are not authentication. Cloudflare's IP limit is per location, not a globally exact counter. The D1 daily ceiling is enforced atomically.

## Rollback and maintenance

Set enabled false in `proposal-config.js` to return to email-only submission. If the backend must stop accepting uploads immediately, set DELIVERY_ENABLED false and redeploy the Worker. Keep the database for delivery reconciliation.

Keep provider accounts under an identified owner; review bounces, usage and dependencies periodically and after configuration changes. Never log API keys or uploaded content. Secrets live only in the Worker secret store or ignored local development files.

## Provider references

- [Resend attachments and encoded message size](https://resend.com/docs/dashboard/emails/attachments)
- [Resend idempotency keys and the 24-hour window](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction)
- [Cloudflare Worker pricing and CPU limits](https://developers.cloudflare.com/workers/platform/pricing/)
- [Durable Objects Free availability and CPU limits](https://developers.cloudflare.com/durable-objects/platform/limits/)
- [Cloudflare Turnstile server verification](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Cloudflare rate-limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

The measured design fits the free tiers at the expected submission volume. Free quotas, upload limits, deliverability and account ownership still need ongoing care. No recurring charge has been authorized or enabled by this implementation.
