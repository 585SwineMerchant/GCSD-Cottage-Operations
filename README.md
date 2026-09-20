# GCSD Cottage Operations

Independent version-two application for managing GCSD Culinary Pathway client events and publishing student-safe production information.

This repository is intentionally standalone. It does not share Git history, deployment configuration, databases, Workers, secrets, or authentication with the version-one Advanced Culinary package or with any personal application.

## Current foundation

`Google Form request → protected teacher application → private Event Order draft → costing, budget, and production planning → deliberate publication → service → private closeout`

The Teacher Command Center now includes a responsive operations dashboard, request queue, guided event workflow, structured menu and production editors, individual event workspaces, structured publication validation, separate operational and publication states, privacy-safe preview, immutable revision history, unpublish/republish, clone, archive/restore, document history, event audit history, an approved Recipe Library with event-level scaling, a full production planner, private budget management, receipt-photo capture, and private operational closeout.

Recipe drafts and approvals create immutable versions. Attaching a recipe to an event stores the approved version with that Event Order, so later master-recipe edits cannot silently alter existing event plans or historical publications. Private event costing aggregates scaled ingredients, matches ingredient aliases across compatible weight, volume, and count units, and creates an auditable frozen purchase-plan snapshot.

The price catalog begins with 77 independently copied Wegmans planning estimates, defaulting to Culver Ridge, and grows through teacher-reviewed receipt lines. Prices retain their package, source type, location, checked date, URL, and freshness status. The public Costing Lab receives only the sanitized product/package catalog and approved published recipe data; students can practice scaling, AP/EP yield, food-cost percentage, portion and menu pricing, market orders, and menu-engineering classification without saving data to the teacher system.

The public Recipe Studio is also local-only. Students can build and save a standardized draft in their own browser, then copy or download an identity-free structured export. A teacher pastes that export into the protected Recipe Library, where it opens as an unsaved draft and must pass the existing teacher review, versioning, and approval process. The public site retains no write path into district records.

Production tasks have stable IDs, phases, start times, durations, dependencies, equipment, quality controls, handoffs, and live status. The planner detects missing dependencies, dependency cycles, blocked work, and overlapping use of the same equipment. Teachers can generate a private Kitchen Management Plan; students receive only the deliberately published, generic-team production timeline.

Funding accounts track allocated, committed, spent, credited, and available funds across payment methods such as the Wegmans card and approved-vendor purchase orders. Event budgets show estimated food cost, cost per guest, purchase requirements, and variance. The inventory ledger remains implemented in source and in the workbook schema, but it is deliberately disabled and hidden until routine capture can be automated enough to avoid extra teacher data entry.

The streamlined financial path converts the current event purchase estimate into one refreshable commitment. A teacher can then photograph or upload a receipt; Google Drive OCR proposes the vendor, date, total, and reference in a private review draft. Posting the reviewed receipt creates the expense, fulfills the selected commitment, and updates event actual cost automatically. OCR never posts a transaction by itself.

Event closeout automatically assembles planned attendance, task completion, estimated costs, linked posted expenses, and budget context. Teachers confirm actual attendance and cost, preserve only useful feedback and after-action notes, and complete the event without changing its student publication.

## Repository boundaries

- `apps-script/teacher/` — protected teacher web application, request trigger, Sheets data layer, publishing, auditing, and document generation
- `apps-script/public-feed/` — separate anonymous deployment that can only return sanitized publication snapshots
- `site/` — independent GitHub Pages student application; read-only, no authentication, no student identity, no automatic polling
- `docs/` — architecture, privacy, naming, and deployment decisions
- `tests/` — privacy, schema migration, lifecycle, publication history, public-feed, deployment-separation, read-only behavior, and end-to-end workflow tests

## Non-negotiable separation

- Student names, email addresses, IDs, rosters, and individual roles belong in Google Classroom, not this application.
- Client contact information, budgets, private notes, audit records, receipts, purchase history, and funding data never enter the public payload. Only sanitized product/package planning prices may be public.
- The teacher application and public feed remain separate Apps Script projects and deployments.
- This repository never reuses another project's Worker, D1 database, OAuth client, Cloudflare configuration, GitHub Pages workflow, or deployment secret.
- Version-one code may be consulted as a reference, but features are deliberately ported into this repository rather than developed on a branch of version one.

## Verification

```bash
npm test
```

Before Google setup, run `npm run check:google` to see what remains intentionally unconnected. See the [weekend Google setup](docs/weekend-google-setup.md) for the protected-account work and [deployment.md](docs/deployment.md) for the overall live-pilot sequence.
