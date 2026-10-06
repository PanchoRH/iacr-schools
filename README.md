# IACR Cryptology Schools

A modern, static redesign of the IACR Cryptology Schools website, built for GitHub Pages.

## Pages

- `index.html` — program overview and searchable archive
- `propose.html` — proposal checklist, submission cycle and current Schools Committee
- `schools.json` — historical school records
- `styles.css` — responsive visual system
- `app.js` — search/filter rendering
- `MEDIA_SOURCES.md` — image provenance and permission notes
- `.github/workflows/pages.yml` — Pages deployment

## Current Schools Committee

- Eysa Lee
- Julian Henry Loss
- Anna Lysyanskaya
- Francisco Rodríguez-Henríquez — Chair
- Mehdi Tibouchi

Francisco's committee card links to https://franciscorh.org/.

## Editorial notes

The source IACR schools page currently contains a duplicated 2022 CROSSING school entry; this archive keeps one copy.

Historical school photographs are intentionally added gradually. Photos should only be copied into the repository after their creator/source and reuse permission are recorded in `MEDIA_SOURCES.md`.

## Local preview

```bash
python -m http.server 8000
```

Then visit http://localhost:8000/.
