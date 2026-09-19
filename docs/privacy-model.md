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

## Public student snapshot must never contain

- Student names, email addresses, IDs, rosters, or individual roles
- Client email address, phone number, billing data, or private correspondence
- Internal teacher notes
- Budgets, supplier pricing, or purchasing records
- Staff audit history
- Recipe authorship or identifiable student submissions
- Classroom grades or feedback

The sanitizer constructs a new allowlisted object. It does not remove a few blocked fields from the private event record. Automated tests deliberately place private values in source records and confirm none survive publication.

## Public request intake

The published request Form may be opened by anyone with its link without a Google login. That permission applies only to submitting a response. Form editing, response records, contact information, private review notes, operational Events, audit history, and generated documents remain restricted to authorized GCSD users. The Form asks for contact information directly because no Google identity is required.
