# Deployment

No live resource should be created under another application's account, project, Worker, database, repository, or deployment configuration.

## Resource names

Use a consistent version-two prefix:

- GitHub repository: `GCSD-Cottage-Operations`
- GCSD My Drive folder: `GCSD Cottage Operations`
- Operational workbook: `GCSD Cottage Operations - Data`
- Teacher Apps Script project: `GCSD Cottage Operations - Teacher`
- Public Apps Script project: `GCSD Cottage Operations - Public Feed`
- Recipe import Apps Script project: `GCSD Cottage Operations - Recipe Import`
- Request Form: `GCSD Culinary Event Request`
- Generated-document subfolder: `Generated Event Documents`

## Deployment sequence

1. Create the new GitHub repository without importing another repository's history.
2. Push this standalone repository to it.
3. In the protected GCSD account's My Drive, create the new top-level folder, blank operational workbook, and generated-document subfolder.
4. Create the teacher Apps Script project from `apps-script/teacher/`.
5. Run `configureVerticalSlice(...)` using the new workbook and folder IDs.
6. Run `createRequestForm()` once.
7. Deploy the teacher project for the GCSD domain and keep the explicit teacher allowlist populated.
8. Create the separate public-feed Apps Script project from `apps-script/public-feed/`.
9. Run `configurePublicFeed(...)` using the same new workbook ID.
10. If GCSD permits anonymous Apps Script deployments, deploy the feed as **Anyone**. If it does not, stop and use the documented publication fallback; never expose the teacher project.
11. Create the separate recipe-import Apps Script project from `apps-script/recipe-import/` and deploy it as **Anyone**.
12. Put the three new `/exec` URLs in `site/config.js`.
13. Enable GitHub Pages from this repository's workflow.
14. Run the proof: request → accept → draft → publish → student load → recipe URL import → document.

Detailed Apps Script setup is in [`../apps-script/README.md`](../apps-script/README.md). The focused protected-account checklist is [`weekend-google-setup.md`](weekend-google-setup.md).

## Updating the live pilot to the Command Center foundation

The GitHub repository and Apps Script deployments are separate release targets. After this source is merged:

1. Replace the teacher project's `Code.gs` and `Index.html` with the repository versions.
2. In the teacher Apps Script editor, run `initializeWorkbook()` once. It appends the lifecycle/publication columns to `Events` and `Publications`; it does not rearrange or delete existing data.
3. Choose **Deploy → Manage deployments → Edit**, select **New version**, and deploy the teacher web app without changing its GCSD-domain access policy.
4. Replace the public-feed project's `Code.gs` with the repository version.
5. Create a new version of the existing public-feed deployment without changing its anonymous read-only access policy or `/exec` URL.
6. Open the teacher `/exec` URL and verify the Dashboard, Requests, and Events views.
7. Use the existing test event to verify preview, unpublish, manual student refresh, republish, clone, archive, and restore. Do not archive the published source event until it has been explicitly unpublished.

The public site does not need a configuration change because both existing `/exec` URLs remain the same. Students see an unpublish or republish only after pressing **Refresh Event Data** or reopening the page.

## Recipe Library update

For the Recipe Library release:

1. Replace the existing teacher project's `Code.gs` and `Index.html` with the repository versions.
2. Run `initializeWorkbook()` once. This creates `Recipes`, `RecipeVersions`, `EventRecipes`, and `PublicationItems`; it does not alter existing Event or publication rows.
3. Create a new version of the existing GCSD-restricted teacher deployment.
4. Keep the teacher `/exec` URL and access policy unchanged.
5. Replace the public-feed project's `Code.gs` and create a new version of its existing anonymous deployment. Keep its `/exec` URL and permissions unchanged.
6. GitHub Pages deploys the updated student recipe display from this repository.

Verify with one small test recipe: save draft → approve → attach to the existing test event → preview scaled quantities → publish → open the recipe from the student site. Then edit the master recipe and confirm the published event continues to show the pinned version until the attachment is explicitly refreshed and republished.

## Costing and purchasing update

1. Replace the teacher project's `Code.gs` and `Index.html` with the repository versions.
2. Run `initializeWorkbook()` once to create `IngredientPrices`, `EventPurchases`, and `CostSnapshots`.
3. Create a new version of the existing GCSD-restricted teacher deployment; keep its URL and permissions unchanged.
4. Do not change the public-feed deployment. Costing and purchasing data is private and the public contract is unchanged.

Verify by saving one exact-unit ingredient price, building the test event purchase plan, recording an on-hand amount, and generating a new private Event Order. Confirm the student site remains unchanged.

## Production planner update

1. Replace the teacher project's `Code.gs` and `Index.html` with the repository versions.
2. Do not run a workbook migration; production-plan fields remain inside the existing `Events.tasks_json` value.
3. Create a new version of the existing GCSD-restricted teacher deployment. Keep its URL and permissions unchanged.
4. Do not change the public-feed deployment. It already transports the sanitized publication snapshot.
5. Allow GitHub Pages to deploy the updated student timeline from `site/app.js`.
6. Verify task readiness, a status change to `Revised draft`, generation of a Kitchen Management Plan, and republishing of the student timeline.

## Budget update with dormant inventory foundation

1. Replace the teacher project's `Code.gs` and `Index.html` with the repository versions.
2. Run `initializeWorkbook()` once. It appends `event_budget` and `budget_account_id` to `Events` and creates `BudgetAccounts`, `BudgetTransactions`, `InventoryItems`, and `InventoryTransactions`. Existing rows remain in place.
3. Create a new version of the existing GCSD-restricted teacher deployment, keeping its URL and permissions unchanged.
4. Do not update the public-feed deployment. Budget, inventory, supplier, and purchasing data remain outside its allowlisted payload.
5. Verify one funding account, one commitment and expense, and an event budget comparison. Inventory controls are intentionally hidden and inventory records do not affect purchasing while the feature flag is off.

## Operational closeout update

1. Replace the teacher project's `Code.gs` and `Index.html` with the repository versions.
2. Run `initializeWorkbook()` once. It creates the private `EventCloseouts` tab without changing existing event rows.
3. Create a new version of the existing GCSD-restricted teacher deployment, keeping its URL and permissions unchanged.
4. Do not update the public-feed deployment or GitHub Pages; the public contract is unchanged.
5. Verify a closeout draft, linked posted-expense total, event completion, Completed-event filtering, and an unchanged student publication.

## Streamlining and receipt automation update (v0.7.0)

1. Replace the teacher project's `Code.gs` and `Index.html` with the repository versions.
2. In the teacher Apps Script project, open **Services**, click **+**, choose **Drive API**, select version **v3**, and add it. This is equivalent to the `enabledAdvancedServices` entry in `teacher/appsscript.json`.
3. Run `initializeWorkbook()` once. It creates the private `Receipts` tab and leaves all existing rows, publications, recipes, costs, budgets, and closeouts unchanged.
4. Create a new version of the existing GCSD-restricted teacher deployment, keeping its URL and access policy unchanged. Approve the additional Drive permission if Google requests it.
5. Do not update the public-feed deployment or GitHub Pages. Receipt files, OCR text, budgets, commitments, and expenses remain private and the public contract is unchanged.
6. Verify with a non-sensitive test receipt: upload → review OCR draft → select event/account → post expense → confirm the linked commitment is fulfilled and the event closeout actual cost updates.

If GCSD policy blocks the Advanced Drive service, receipt upload still preserves the original file and creates a manual review draft. Do not post an unreviewed OCR result.

## Wegmans catalog and Student Costing Lab update (v0.8.0)

This update includes the unreleased v0.7 workflow and OCR work. Install it as one consolidated release:

1. In the teacher Apps Script project, replace `Code.gs` and `Index.html`, then create a new script file named `Catalog.gs` and paste the repository version into it.
2. Keep the Advanced Drive API v3 service enabled for OCR.
3. Run `initializeWorkbook()` once. It appends catalog metadata and receipt-review columns without moving or deleting existing data, then idempotently adds any missing items from the 77-product starter catalog.
4. Deploy a new version of the existing GCSD-restricted teacher web app without changing its `/exec` URL or access policy.
5. Replace the separate public-feed project's `Code.gs`, then deploy a new version of that existing anonymous read-only web app without changing its `/exec` URL.
6. Allow GitHub Pages to deploy the updated `site/` files. The existing `site/config.js` URLs remain unchanged.

Verify in this order: catalog count and stale labels → alias/unit match in an event purchase plan → receipt upload and review → post with one checked catalog update → confirm the catalog price/source date changed → open the public Costing Lab anonymously → load a published recipe → confirm scaling, AP/EP yield, portion cost, target menu price, market order, and menu-engineering result.

The starter prices are estimates captured on 2026-08-02, not a live Wegmans feed. The application does not scrape Wegmans. Existing event cost snapshots remain frozen when catalog prices change.

## Local Recipe Studio transfer update (v0.9.0)

1. Replace the teacher project's `Code.gs` and `Index.html`, then deploy a new version of the existing GCSD-restricted teacher web app.
2. Deploy the updated `site/index.html`, `site/app.js`, `site/recipe-parser.js`, and `site/styles.css` through the existing GitHub Pages workflow.
3. Do not rerun `initializeWorkbook()` and do not redeploy the public-feed Apps Script project; this release adds no workbook fields and no public-feed writes.
4. On the public site, create a small Recipe Studio draft and choose **Copy teacher-review export**.
5. In the Teacher Command Center, open **Recipes → Import a Recipe Studio draft**, paste the export, and confirm it opens as an unsaved draft.
6. Confirm that importing alone creates no Recipe row. Save the draft deliberately, review its approval requirements, and approve only after teacher verification.

The screenshot reader lazy-loads major-version-pinned Tesseract.js v5 assets from jsDelivr and processes the selected image in the browser. If district filtering blocks that CDN, the student sees an error and can use the copied-text reader without losing the local draft.

Version 0.9.2 adds a recipe-only crop step before screenshot recognition and improves reconstruction of webpage checkboxes, multi-line titles, and wrapped directions. This is a GitHub Pages-only update; no Apps Script replacement or workbook initialization is required.

Version 0.9.3 accepts OCR noise after section headings, detects numbered cooking directions even when the heading is unreadable, and flags same-unit ingredient quantities that are implausibly larger than the stated yield. It deliberately warns rather than guessing a replacement quantity.

## Recipe URL import update (v0.10.0)

1. Create a new standalone Apps Script project named `GCSD Cottage Operations - Recipe Import`; do not add this code to the teacher or public-feed projects.
2. Replace its default `Code.gs` with `apps-script/recipe-import/Code.gs`.
3. Deploy it as a web app: **Execute as me** and **Who has access: Anyone**. Approve the external-request permission used to fetch public recipe pages.
4. Copy its production `/exec` URL into `site/config.js` as `recipeImportUrl`.
5. Deploy the updated `site/` files through the existing GitHub Pages workflow.
6. Do not run `initializeWorkbook()` and do not update either existing Apps Script project; the import service has no GCSD data dependency.
7. Verify with a recipe URL that publishes Schema.org Recipe JSON-LD. Confirm exact fractions, title, yield, ingredients, instructions, category, author, and source URL; then verify that a non-recipe page displays the copied-text fallback message.
