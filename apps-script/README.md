# Google-backed Command Center

This folder contains the first complete Google-backed workflow for GCSD Cottage Operations:

`Google Form request → protected teacher inbox → private Event Order draft → production plan → deliberate publication → read-only GitHub student view → Google operations documents`

It intentionally uses **two Apps Script projects**. Do not combine them.

| Project | Deployment access | Responsibility |
|---|---|---|
| `teacher/` | GCSD domain only | Requests, draft events, publishing, audit records, and document generation |
| `public-feed/` | Anyone/anonymous | Return only the latest sanitized publication snapshot |

The public project has no write functions and never reads Requests, Documents, Audit, Receipts, budgets, or transactions. It reads only sanitized publication snapshots and allowlisted product/package price fields. Contact information stays only in the restricted `Requests` sheet. Student names, email addresses, IDs, rosters, and individual roles are not part of this data model. Both projects must be newly created for version two; do not reuse an Apps Script project or deployment from another application.

## 1. Create the district-owned resources

In the protected GCSD account's My Drive, create a new top-level folder named `GCSD Cottage Operations`, then create inside it:

1. One blank Google Sheet for operational data.
2. One folder for generated Event Order documents.

Copy both IDs from their Google URLs.

## 2. Create and configure the teacher project

Create a standalone Apps Script project owned by the district account. Add the three files from `teacher/` with the same names.

In the Apps Script editor, run:

```javascript
configureVerticalSlice({
  spreadsheetId: "GCSD_DRIVE_SPREADSHEET_ID",
  documentFolderId: "GCSD_DRIVE_FOLDER_ID",
  allowedTeacherEmails: "teacher1@greececsd.org,teacher2@greececsd.org",
  allowedDomain: "greececsd.org"
});
```

This creates and validates the managed workbook tabs, including requests, events, recipes, costing, budget, receipts, closeout, and the dormant inventory foundation.

- `Requests`
- `Events`
- `Publications`
- `Documents`
- `Audit`

Then run `createRequestForm()` once. Its return value contains the editing and published URLs for the generated client-request Form. An installable form-submit trigger is created automatically.

For external client intake, open the Form's editing view and set **Published → Manage → General access** to **Anyone with the link** with the role **Responder**. This makes only the response form public; the Form editor, response workbook, contact information, and request-review notes remain restricted. If GCSD policy does not offer this option, keep the Form district-restricted and escalate the external-intake decision to IT.

Deploy the teacher project as a web app:

- Execute as: **User deploying the web app**
- Who has access: **Anyone in the GCSD domain** (or the district's equivalent restricted setting)

The code also enforces the configured teacher email allowlist. Keep the allowlist populated for the pilot.

## 3. Create and configure the public-feed project

Create a second standalone Apps Script project. Add the two files from `public-feed/`, then run:

```javascript
configurePublicFeed("GCSD_DRIVE_SPREADSHEET_ID");
```

Deploy this project as a web app:

- Execute as: **User deploying the web app**
- Who has access: **Anyone**

This is the GCSD policy gate identified during planning. If the anonymous option is unavailable, stop here and use the approved fallback publication method; do not weaken the teacher deployment.

The endpoint returns JSON by default and JSONP when passed a valid `callback` query parameter. The GitHub page uses JSONP because the response is deliberately public, read-only, and contains only the sanitized snapshot.

## 4. Connect GitHub Pages

Edit `site/config.js`:

```javascript
window.GCSD_CONFIG = Object.freeze({
  publicFeedUrl: "PUBLIC_FEED_EXEC_URL",
  teacherCommandCenterUrl: "TEACHER_COMMAND_CENTER_EXEC_URL"
});
```

Use each deployment's `/exec` URL, not its `/dev` testing URL.

The student page performs one request when opened. It does not poll. **Refresh Event Data** performs one additional request. If refresh fails, the browser keeps displaying the last successfully loaded snapshot and identifies it as a saved copy.

## 5. Prove the complete slice

1. Submit a request through the generated Form.
2. Open the protected Teacher Command Center.
3. Accept the request into a private draft.
4. Edit the student-safe client display name, Event Order details, menu, and generic team assignments.
5. Save the draft and confirm the GitHub student page has not changed.
6. Click **Publish to students**.
7. Open or manually refresh the GitHub student page and confirm its revision and timestamp.
8. Click **Generate Event Order document** and confirm the Doc appears in the configured GCSD My Drive folder.
9. Confirm the public payload contains no request contact details, budget, internal notes, student identity, roster, or staff audit data.

## Current foundation

The protected application now includes the operations dashboard, request queue, guided event workflow, structured menu/task editors, publication controls, document and audit history, the versioned Recipe Library, Recipe Studio draft import, event costing and purchasing, the full production planner, private budget management, receipt-photo review, and operational closeout. Ingredient aliases and compatible-unit conversion connect approved recipes to the price catalog. Funding accounts, transaction ledgers, receipt originals/OCR, event purchases, closeout actuals, and immutable event cost snapshots remain teacher-only; only allowlisted product/package planning prices are public for the student Costing Lab. Production tasks support phases, schedules, dependencies, equipment-conflict checks, readiness validation, and status updates. Inventory remains dormant pending automation.

The receipt release adds `Receipts` and uses Google Drive OCR. In the teacher Apps Script project, add the **Drive API** under **Services** (identifier `Drive`, version `v3`), or copy the repository's `appsscript.json` manifest. Receipt capture still saves a private review draft if OCR is unavailable, but automated extraction requires the service.

The production-planner release does not add workbook tabs or columns. Replace `teacher/Code.gs` and `teacher/Index.html`, then create a new version of the existing protected teacher deployment. Do not rerun `initializeWorkbook()` solely for this release.

The closeout release adds `EventCloseouts`. The streamlined receipt release adds `Receipts`. After replacing the teacher source, run `initializeWorkbook()` once before creating the new deployment version.

The budget release added `BudgetAccounts`, `BudgetTransactions`, `InventoryItems`, and `InventoryTransactions`, plus append-only `event_budget` and `budget_account_id` columns on `Events`.

After installing the costing and purchasing release, run `initializeWorkbook()` once. It adds `IngredientPrices`, `EventPurchases`, and `CostSnapshots` without changing existing rows.

## Upgrade an existing pilot workbook

After replacing the teacher project files, run this once before creating the new deployment version:

```javascript
initializeWorkbook();
```

The migration accepts the existing managed headers as an exact prefix, appends missing columns, creates the recipe, publication-item, ingredient-price, event-purchase, cost-snapshot, budget, closeout, and dormant inventory tabs, and is safe to rerun. It stops instead of overwriting anything if a managed header was renamed, reordered, or replaced. Existing Event rows and immutable publication snapshots remain untouched.

## Recipe Library workflow

1. Open **Recipes** in the Teacher Command Center and create a draft.
2. Record its standard yield, yield unit, ingredients, procedure, equipment, allergen information, safety controls, quality controls, and curriculum competencies.
3. Save the draft and approve it for event use.
4. In an Event workspace, save the menu item first.
5. Under **Menu & production**, attach the approved recipe to the matching menu item, enter the required production quantity, and set the overage percentage.
6. Preview and publish. The student site and generated Event Order use the pinned, scaled version.

Editing the master recipe later does not alter the event attachment. Approve the revision and use **Attach or refresh approved version** when an event should deliberately adopt it.

The public Recipe Studio stores work only in the student's browser. Students may paste copied recipe text or read a clear screenshot locally, then correct the proposed structured fields. **Copy teacher-review export** or **Download JSON** produces a structured draft without student identity. In the protected Command Center, open **Recipes → Import a Recipe Studio draft**, paste the JSON, and load it into a new unsaved teacher draft. Review, correct, save, and approve it through the same workflow as any other recipe.

For a click-by-click protected-account session, use [`../docs/weekend-google-setup.md`](../docs/weekend-google-setup.md).
