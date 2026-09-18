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
