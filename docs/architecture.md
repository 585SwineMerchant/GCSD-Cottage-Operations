# Architecture

## Ownership

| Component | Host | Access | Data authority |
|---|---|---|---|
| Student production site | This repository's GitHub Pages deployment | Anonymous, read-only | Published event snapshots and sanitized planning-price catalog |
| Teacher Command Center | Standalone Apps Script project | Approved GCSD staff | Operational Google Sheet |
| Public publication feed | Separate Apps Script project | Anonymous, read-only | `Publications`, `PublicationItems`, and allowlisted `IngredientPrices` fields only |
| Client request intake | Google Form | Anyone with the published link may respond; no Google login required | Restricted `Requests` tab |
| Operational records | New Google Sheet under the GCSD account's My Drive | Approved staff | System of record |
| Generated documents | New `Generated Event Documents` folder under the project folder | Drive permissions | Event packet records |
| Student identity and academic work | Google Classroom | Course membership | Classroom record |

The operational workbook also contains recipe, publication, and private purchasing tabs:

| Tab | Responsibility |
|---|---|
| `Recipes` | Current working recipe records and approval state |
| `RecipeVersions` | Append-only snapshots of every saved and approved version |
| `EventRecipes` | Approved versions pinned to event menu items, including production quantity and overage |
| `PublicationItems` | Append-only, one-event-per-row payloads for schema-three public snapshots |
| `IngredientPrices` | Reusable product/package prices, aliases, compatible units, source/date metadata, and freshness; only an explicit safe subset is public |
| `EventPurchases` | Event-specific required, on-hand, purchase, package, cost, and status records |
| `CostSnapshots` | Append-only private estimates created whenever a purchase plan is refreshed |
| `BudgetAccounts` | Funding registers for allocations, buildings, courses, sources, and payment methods |
| `BudgetTransactions` | Audited commitments, expenses, and credits tied to accounts and optional events |
| `Receipts` | Private source file links, OCR review drafts, reviewed line items, catalog-update decision, and the posted expense they produced |
| `EventCloseouts` | Private planned-versus-actual outcomes and reusable after-action notes |
| `InventoryItems` | Ingredient or supply identity, opening stock, reorder point, and storage location |
| `InventoryTransactions` | Append-only receipts, usage, waste, and adjustments tied to optional events |

## Data flow

1. A requester submits the district Google Form.
2. An installable Apps Script trigger writes a normalized request to the restricted operational workbook.
3. An authorized teacher reviews the request as `Under Review`, `Needs Information`, `Declined`, or `Accepted`; private review notes remain on the request.
4. Only `Accepted` creates a private Event Order draft. Declined requests never create Event records.
5. Draft saves never alter what students see.
6. **Publish to students** creates an immutable sanitized snapshot with a revision and timestamp.
7. The public-feed project reads the latest publication snapshot plus an allowlisted product/package price catalog.
8. The student site loads that public data once when opened and again only when **Refresh Event Data** is pressed. Student Costing Lab inputs remain browser-local and are not submitted.
9. The teacher application generates Event Orders and Kitchen Management Plans into the configured GCSD Drive folder.
10. A reviewed receipt can create a posted event expense, fulfill its purchase commitment, and deliberately update checked catalog lines in one action.
11. After service, a private closeout summarizes existing operational data; the teacher confirms actuals and completes the event.

## Event state model

Operational lifecycle and student visibility are deliberately separate:

| Concern | Values | Meaning |
|---|---|---|
| Operational lifecycle | `Planning`, `Ready`, `Completed`, `Archived` | Where staff are in the event-management process |
| Publication status | `Never published`, `Published`, `Revised draft`, `Unpublished` | What the current student snapshot contains |

Unpublishing appends a new immutable global snapshot without the event. It never deletes the Event or an earlier publication. Republish creates a new event revision. A published event must be explicitly removed from the student site before it can be archived, and restore never republishes it automatically.

Each publication row contains a complete sanitized student snapshot. New publications begin from the newest complete snapshot; they do not reconstruct visibility from historical per-event rows. This prevents an unpublished event from reappearing when another event is later published.

## Command Center foundation

The protected teacher application is organized into:

- Dashboard metrics, upcoming events, and planning warnings
- Request queue with explicit acceptance and decline review
- Event workspaces for overview, source request, menu/production, costing, closeout, documents, publication, and audit
- Structured publication blockers and warnings
- Preview, publish/revise, unpublish, republish, clone, archive, and restore controls
- Searchable Recipe Library with draft, approved, archived, and restored states
- Standard yields, portions, ingredients, procedures, equipment, allergens, safety controls, quality controls, and curriculum competencies
- Approved recipe attachment to event menu items with automatic scaling and production overage

## Recipe version contract

Every recipe save creates an immutable version snapshot. Approval creates a new approved version. Editing an approved master recipe creates a new draft; it does not modify the approved version already attached to an event.

An `EventRecipes` record contains its own approved recipe snapshot. Event scaling uses:

`production target = required quantity × (1 + overage percentage ÷ 100)`

Ingredient quantities are multiplied by the production target divided by the recipe's standard yield. Refreshing an event attachment to a newly approved master version is an explicit teacher action and marks a currently published event as a revised draft. Detaching a recipe is also explicit and preserves earlier publication snapshots.

Schema-three publications store each sanitized event in `PublicationItems` and keep only a small pointer in `Publications.snapshot_json`. This preserves the immutable global-snapshot behavior without placing every event and recipe into one Google Sheets cell. The public feed remains backward compatible with existing schema-one and schema-two publication rows.

Workbook schema changes are append-only. `initializeWorkbook()` validates that managed columns remain in their original order and appends only missing version-two columns, leaving all existing rows and publication snapshots intact.

## Scale decision

The manual load-and-refresh model avoids automatic polling. A class opening the site creates one short read per device; ordinary navigation occurs entirely in the browser. Teacher writes and document generation are small, deliberate operations protected by Apps Script locking.

## Phase boundaries

The infrastructure, privacy gate, Command Center foundation, Recipe Library, approved version pinning, event scaling, Wegmans-first catalog, receipt-assisted price learning, Student Costing Lab, local-only Recipe Studio export/teacher import, event purchasing, production planner, Kitchen Management documents, funding register, budget ledger, receipt capture, and operational closeout are complete in source. The inventory ledger is implemented but feature-disabled and hidden pending an automated capture workflow.

## Recipe Studio transfer contract

The anonymous public application never writes recipes to the workbook. Recipe Studio work remains in browser storage and exports a versioned `gcsd-cottage-recipe-draft` JSON document without a student name, account identifier, or submission record. Copied text and browser-side screenshot OCR feed the same deterministic parser. It proposes structured fields and explicitly reports missing yield, ingredients, or procedure instead of inventing them. The screenshot stays in the browser; only the OCR library and English recognition model are lazy-loaded from the major-version-pinned Tesseract.js CDN. If that dependency is blocked, copied-text import and manual entry remain available. The protected Teacher Command Center validates the export and opens it as an unsaved recipe draft. Importing cannot approve, publish, attach, or overwrite a recipe; a teacher must deliberately save and approve the new immutable version.

## Receipt automation contract

Receipt images and PDFs remain in a private `Receipts` subfolder beneath the configured project document folder. Google Drive OCR creates candidate text; deterministic parsing proposes vendor, date, total, reference, and possible product lines. The record stays a `Draft` until a teacher reviews it. Posting creates one audited `Expense`, optionally changes one matching `Active` commitment to `Fulfilled`, and links the transaction back to the receipt. Only checked lines with complete package details may update the reusable catalog. Retrying a purchase-plan commitment refreshes its existing automatic record instead of creating duplicates. Receipt files, OCR text, totals, transaction links, notes, and staff identity never enter the public feed; a later public catalog record contains only the independently useful product/package price and check date.

## Budget and inventory contract

Budget accounts distinguish allocated, committed, spent, credited, and available balances across payment methods. Commitments count only while `Active` and may be explicitly marked `Fulfilled` or `Released`; every status change is audited. Posted expenses increase spent funds and posted credits reduce them. Event budget targets and account assignments are private and do not create a revised student draft by themselves.

When the inventory feature is enabled in a future release, quantity is reconstructed from each item's opening quantity plus its append-only movement history. Receipts add stock; usage and waste subtract stock; adjustments may add or subtract. While disabled, inventory records do not affect event purchase calculations and a `Received` purchase does not create an inventory movement.

## Operational closeout contract

Each event has at most one private `EventCloseouts` record. The closeout view preloads planned guests, production-task completion, estimated food and purchase costs, event budget, and posted expenses or credits already linked to the event. A teacher may save a draft or confirm the closeout and mark the operational lifecycle `Completed` in one action. Closeout edits are audited, remain private, and never change the current student publication.

## Production planning contract

Production tasks remain embedded in each Event record as structured JSON, so this release requires no workbook migration. Stable task IDs support dependency links and status updates. Publication validation blocks missing dependencies, dependency cycles, shared-equipment time conflicts, and tasks marked `Blocked`; missing schedule details remain warnings for backward compatibility. A task-status change to an already published event creates a `Revised draft` and does not alter the current student snapshot until the teacher republishes.
