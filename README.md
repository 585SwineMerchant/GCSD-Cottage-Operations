# GCSD Cottage Operations

Independent version-two application for managing GCSD Culinary Pathway client events and publishing student-safe production information.

This repository is intentionally standalone. It does not share Git history, deployment configuration, databases, Workers, secrets, or authentication with the version-one Advanced Culinary package or with any personal application.

## Current foundation

`Google Form request → protected teacher application → private Event Order draft → deliberate publication → read-only student site → generated Google Event Order document`

The Teacher Command Center now includes a responsive operations dashboard, request queue, individual event workspaces, structured publication validation, separate operational and publication states, privacy-safe preview, immutable revision history, unpublish/republish, clone, archive/restore, document history, and event audit history.

## Repository boundaries

- `apps-script/teacher/` — protected teacher web application, request trigger, Sheets data layer, publishing, auditing, and document generation
- `apps-script/public-feed/` — separate anonymous deployment that can only return sanitized publication snapshots
- `site/` — independent GitHub Pages student application; read-only, no authentication, no student identity, no automatic polling
- `docs/` — architecture, privacy, naming, and deployment decisions
- `tests/` — privacy, schema migration, lifecycle, publication history, public-feed, deployment-separation, read-only behavior, and end-to-end workflow tests

## Non-negotiable separation

- Student names, email addresses, IDs, rosters, and individual roles belong in Google Classroom, not this application.
- Client contact information, budgets, private notes, audit records, and supplier data never enter the public publication payload.
- The teacher application and public feed remain separate Apps Script projects and deployments.
- This repository never reuses another project's Worker, D1 database, OAuth client, Cloudflare configuration, GitHub Pages workflow, or deployment secret.
- Version-one code may be consulted as a reference, but features are deliberately ported into this repository rather than developed on a branch of version one.

## Verification

```bash
npm test
```

Before Google setup, run `npm run check:google` to see what remains intentionally unconnected. See the [weekend Google setup](docs/weekend-google-setup.md) for the protected-account work and [deployment.md](docs/deployment.md) for the overall live-pilot sequence.
