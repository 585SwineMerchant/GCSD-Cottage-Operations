# GCSD Cottage Operations

Independent version-two application for managing GCSD Culinary Pathway client events and publishing student-safe production information.

This repository is intentionally standalone. It does not share Git history, deployment configuration, databases, Workers, secrets, or authentication with the version-one Advanced Culinary package or with any personal application.

## Current foundation

`Google Form request → protected teacher application → private Event Order draft → deliberate publication → read-only student site → generated Google Event Order document`

The Teacher Command Center now includes a responsive operations dashboard, request queue, individual event workspaces, structured publication validation, separate operational and publication states, privacy-safe preview, immutable revision history, unpublish/republish, clone, archive/restore, document history, event audit history, an approved Recipe Library with event-level scaling, and a full production planner.

Recipe drafts and approvals create immutable versions. Attaching a recipe to an event stores the approved version with that Event Order, so later master-recipe edits cannot silently alter existing event plans or historical publications. Private event costing now aggregates scaled ingredients, applies exact-unit package prices, accounts for stock on hand, and creates an auditable purchase plan without exposing supplier or financial data to students.

Production tasks have stable IDs, phases, start times, durations, dependencies, equipment, quality controls, handoffs, and live status. The planner detects missing dependencies, dependency cycles, blocked work, and overlapping use of the same equipment. Teachers can generate a private Kitchen Management Plan; students receive only the deliberately published, generic-team production timeline.

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
