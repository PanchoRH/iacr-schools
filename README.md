# IACR Cryptology School

Static redesign of the IACR Cryptology School website.

## Site

- `index.html` contains the overview, upcoming schools and archive
- `propose.html` contains the proposal guide
- `submit-proposal.html` offers direct email and contains the optional proposal form
- `committee.html` contains the Schools Committee, portraits and profile links
- `schools.json` contains the school records
- `MEDIA_SOURCES.md` records image sources and reuse status
- `.github/workflows/pages.yml` deploys the site with GitHub Pages

## Schools Committee

- Eysa Lee
- Julian Henry Loss
- Anna Lysyanskaya
- Francisco Rodríguez-Henríquez, Chair
- Mehdi Tibouchi

Francisco's committee card links to https://franciscorh.org/.

## Images

Use event photographs before venue photographs when possible. Store an image in the repository only when its reuse rights are clear. Keep the source, creator, license and alt text with the record.

The committee portraits remain remote references until reuse permission is confirmed.

## Editorial style

- Keep copy short and conservative.
- Prefer active voice.
- Avoid promotional or dramatic language.
- Keep explanatory text minimal.
- Give upcoming schools their own section.
- Prefer real group or lecture photos over venue images.
- Publish local image files only when reuse permission is clear.
- Committee cards use portrait, name, affiliation and role.
- Francisco Rodríguez-Henríquez is the committee Chair.


## Branding

Use the programme name “IACR Cryptology School”. The header and footer use the official IACR logo at 100px with the Association’s full name beside it. The proposal guide uses the full circular logo at 220px or larger. Logo links point to IACR; the programme name links to the site homepage. Hover motion respects reduced-motion preferences.

## Proposal submission

Direct email to `schools@iacr.org` remains the active submission route. Applicants attach their files and send the email from their own email app or webmail.

The online proposal form is enabled for delivery to **schools@iacr.org**. The form requires the proposal information and a PDF, accepts up to four supporting documents, and sends them as actual attachments through Cloudflare and Resend. Upload processing runs in a SQLite-backed Durable Object so large attachments fit the free plan’s processing allowance; documents are not stored there. No applicant account is required. Files are limited to 5 MiB each and 10 MiB together. The browser shows the form only when configured and the backend reports ready; the email route remains available.

See [backend/SETUP.md](backend/SETUP.md) for configuration, privacy, delivery limitations, costs to verify and activation steps. Public settings belong in `proposal-config.js`; credentials must never be committed. `npm test` checks delivery handling offline. `npm run preview:form` starts a clearly labelled localhost preview that cannot send email. The Pages workflow publishes an explicit static-file allowlist, excluding backend code, tests and local configuration.

## Archive and navigation

Each school in `schools.json` has a `region` based on its location. The “Continents/Regions” filter uses Africa, Asia, Europe, Latin America, Oceania, and US & Canada. Group Mexico, Central America, South America and the Caribbean together under Latin America; Cuba belongs in this group. Reserve US & Canada for those two countries. Use Oceania for Australia, New Zealand and the Pacific islands. For transcontinental countries, use the host city (for example, Kaliningrad is in Europe and İzmir is in Asia).

The archive combines region, country, year and text filters; the country choices follow the selected region. Only regions represented in the archive appear in the menu, so Oceania will appear when a school there is added. Region labels are escaped when rendered, including the ampersand in US & Canada.

The header uses `aria-current` for the current page or selected homepage section. All pages include a committee contact address and a link to the official policy. The proposal guide identifies the official policy as the source of the format and evaluation requirements.


### School-list completeness

On 7 October 2026 the archive was checked against the supported-school list at https://www.iacr.org/schools/. It contains 41 distinct records, including all six 2026 schools in Argentina, Chile, Italy, Singapore, Tunisia and Vietnam. The official page repeats the 2022 Valletta school; the archive includes it once. Schools in the separate “Non-IACR schools held in cooperation with IACR” section are not part of this supported-school archive.

When refreshing the archive, compare the complete supported-school list, including the latest year, rather than checking only records already in `schools.json`. Keep a record even when its original website is unavailable, using a surviving institutional or IACR archive link.
