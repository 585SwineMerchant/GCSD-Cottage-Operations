# Privacy model

## Public student snapshot may contain

- Teacher-controlled client display name
- Event title and type
- Service date, time, approved location, guest count, and service format
- Menu and production quantities
- Dietary requirements and allergen controls intended for production
- Event-level learning focus and safety/sanitation controls
- Generic team/station labels
- Equipment, quality controls, deadlines, instructions, and handoffs
- Publication revision and timestamp
- Approved recipe version, scaled yield, ingredients, equipment, procedure, safety controls, quality controls, and event-level competencies
- Sanitized product/package planning prices: public ingredient/product names, aliases, package size/unit, package price, vendor/store label, price type, checked date, public product URL, and variable-weight/estimated-count flags

## Public student snapshot must never contain

- Student names, email addresses, IDs, rosters, or individual roles
- Client email address, phone number, billing data, or private correspondence
- Internal teacher notes
- Budgets, funding accounts, receipt images or OCR text, actual purchase history, commitments, or event purchasing records
- Master-recipe audit metadata and private version notes
- Staff audit history
- Recipe authorship or identifiable student submissions
- Classroom grades or feedback

The sanitizer constructs a new allowlisted object. It does not remove a few blocked fields from the private event record. Automated tests deliberately place private values in source records and confirm none survive publication.

Published recipe data uses the same allowlist approach. Purchasing metadata, author identity, version notes, and recipe audit history are excluded. The event receives a pinned approved snapshot rather than a live reference to the working master recipe.

The public feed separately sanitizes the price catalog for the Costing Lab. It omits SKUs, notes, teacher identity, receipt IDs, OCR text, event links, update history, and all financial-account data. On-hand counts, packages actually purchased, purchase statuses, actual event spend, and immutable event cost snapshots remain private.

Funding accounts, allocations, payment methods, commitments, expenses, credits, available balances, event budget targets, storage locations, reorder levels, and inventory movement history are also private. They live only in protected workbook tabs and teacher responses. Editing a private event budget does not change the student publication state.

Event closeout actuals, customer feedback, successes, issues, follow-up notes, cost variance, and staff identity are private operational records. Completing or editing a closeout does not revise, republish, or remove the student snapshot.

Production task schedules, generic team labels, stations, instructions, dependencies, equipment, quality controls, handoffs, and task status may be published because they direct event-level kitchen work. Student names, IDs, email addresses, rosters, individual assignments, performance notes, attendance, and grades are never fields in the production-plan contract. Kitchen Management Plans are generated in the protected GCSD Drive folder and are not served by the public feed.

## Public request intake

The published request Form may be opened by anyone with its link without a Google login. That permission applies only to submitting a response. Form editing, response records, contact information, private review notes, operational Events, audit history, and generated documents remain restricted to authorized GCSD users. The Form asks for contact information directly because no Google identity is required.
