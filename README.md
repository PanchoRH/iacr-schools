# IACR Cryptology School

Static redesign of the IACR Cryptology School website.

## Site

- `index.html` contains the overview, upcoming schools and archive
- `propose.html` contains the proposal guide
- `submit-proposal.html` explains how to email a proposal and supporting attachments
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

Applicants email their proposal PDF and supporting documents directly to `schools@iacr.org`. The proposal pages use `mailto:` links that open the applicant’s own email app with the recipient and subject filled in. Applicants attach their files and send the email themselves; the website does not upload or send documents. The address remains visible for people using webmail or without a configured email app. Large supporting files can be shared as accessible links. There is no external form-processing service or online submission confirmation.

## Archive and navigation

Each school in `schools.json` has a `continent` based on its location. For schools in transcontinental countries, use the host city (for example, Kaliningrad is in Europe and İzmir is in Asia). The archive combines continent, country, year and text filters; the country choices follow the selected continent. Only continents represented in the archive appear in the menu.

The header uses `aria-current` for the current page or selected homepage section. All pages include a committee contact address and a link to the official policy. The proposal guide identifies the official policy as the source of the format and evaluation requirements.
