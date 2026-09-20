# Architecture

## Ownership

| Component | Host | Access | Data authority |
|---|---|---|---|
| Student production site | This repository's GitHub Pages deployment | Anonymous, read-only | Published snapshot only |
| Teacher Command Center | Standalone Apps Script project | Approved GCSD staff | Operational Google Sheet |
| Public publication feed | Separate Apps Script project | Anonymous, read-only | `Publications` tab only |
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
| `IngredientPrices` | Reusable private supplier/package prices matched by ingredient name and recipe unit |
| `EventPurchases` | Event-specific required, on-hand, purchase, package, cost, and status records |
| `CostSnapshots` | Append-only private estimates created whenever a purchase plan is refreshed |

## Data flow

1. A requester submits the district Google Form.
2. An installable Apps Script trigger writes a normalized request to the restricted operational workbook.
3. An authorized teacher reviews the request as `Under Review`, `Needs Information`, `Declined`, or `Accepted`; private review notes remain on the request.
4. Only `Accepted` creates a private Event Order draft. Declined requests never create Event records.
5. Draft saves never alter what students see.
6. **Publish to students** creates an immutable sanitized snapshot with a revision and timestamp.
7. The public-feed project reads only the latest publication snapshot.
8. The student site loads that snapshot once when opened and again only when **Refresh Event Data** is pressed.
9. The teacher application generates Event Orders and Kitchen Management Plans into the configured GCSD Drive folder.

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
- Event workspaces for overview, source request, menu/production, documents, publication, and audit
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

The infrastructure, privacy gate, Command Center foundation, Recipe Library, approved version pinning, event scaling, private costing, event purchasing, production planner, and Kitchen Management documents are complete in source. Later phases will add broader budgets and inventory, operational closeout, and Recipe Studio export/import.

## Production planning contract

Production tasks remain embedded in each Event record as structured JSON, so this release requires no workbook migration. Stable task IDs support dependency links and status updates. Publication validation blocks missing dependencies, dependency cycles, shared-equipment time conflicts, and tasks marked `Blocked`; missing schedule details remain warnings for backward compatibility. A task-status change to an already published event creates a `Revised draft` and does not alter the current student snapshot until the teacher republishes.
