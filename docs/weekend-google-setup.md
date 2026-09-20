# Weekend Google setup

This is the only work that must be completed while signed into the protected GCSD Google account. Create every resource below as a new version-two resource. Do not create or stage any of it in a personal Google account, and do not reuse an Apps Script project, Form, Sheet, or folder from another application.

## Before starting

- Confirm the Google account avatar shows the intended GCSD account.
- Open the independent repository: `585SwineMerchant/GCSD-Cottage-Operations`.
- Keep [`google-resource-register.md`](google-resource-register.md) open and record each new URL as it is created.
- If a district policy blocks a required option, stop at that step. Do not change sharing on the teacher application to work around it.

## Existing-pilot update

If the original vertical slice is already deployed, do not create replacement Google resources. Follow the update sequence in [`deployment.md`](deployment.md): replace the two Apps Script source sets, run `initializeWorkbook()` in the teacher project, and create new versions of the existing teacher and public-feed deployments. Keep their current access settings and `/exec` URLs.

For the Recipe Library phase, replace the teacher Apps Script source, run `initializeWorkbook()` again to create the four new tabs, and update the existing teacher deployment. Also replace the public-feed `Code.gs` and update its existing deployment so it can read schema-three publication items. Both `/exec` URLs remain unchanged.

## 1. Create the GCSD My Drive resources

In the GCSD account's **My Drive**, create this exact structure:

```text
GCSD Cottage Operations/
├── GCSD Cottage Operations - Data (Google Sheet)
└── Generated Event Documents/ (folder)
```

The workbook can remain blank. Copy the workbook ID from the text between `/d/` and `/edit` in its URL. Copy the generated-document folder ID from the text after `/folders/` in its URL.

Do not add student rosters, student names, grades, or individual evaluations to this workbook. If IT later supplies an approved Shared Drive, use Google Drive's move controls with IT guidance; the application IDs should be rechecked after the move.

## 2. Create the protected teacher application

1. From the new `GCSD Cottage Operations` folder, create a standalone Apps Script project named `GCSD Cottage Operations - Teacher`.
2. Copy the repository's `apps-script/teacher/Code.gs` into `Code.gs`.
3. Add an HTML file named `Index` and copy in `apps-script/teacher/Index.html`.
4. In **Project Settings**, enable **Show "appsscript.json" manifest file in editor**.
5. Replace the manifest with `apps-script/teacher/appsscript.json`.
6. Run this once from the editor, substituting the two IDs and the actual teacher address or addresses:

```javascript
configureVerticalSlice({
  spreadsheetId: "PASTE_NEW_WORKBOOK_ID",
  documentFolderId: "PASTE_NEW_GENERATED_DOCUMENT_FOLDER_ID",
  allowedTeacherEmails: "YOUR_GCSD_EMAIL",
  allowedDomain: "greececsd.org"
});
```

Review and approve only the Google permissions requested by this newly named project. A successful run creates the operational, recipe, publication, costing, budget, receipt, closeout, and dormant inventory tabs managed by this project. The pilot requires an explicit teacher email allowlist.

## 3. Create the request Form

Run `createRequestForm()` once from the teacher Apps Script editor. The Form is moved into the top-level `GCSD Cottage Operations` folder, and its editing and published URLs are printed in the execution log. Record both URLs. The function remembers the Form ID, so rerunning it returns the same Form instead of silently creating duplicates unless that Form was deleted or became inaccessible.

For the approved external-client intake, open the Form editor and change **Published → Manage → General access** to **Anyone with the link**, with the role **Responder**. Verify the published URL opens in a completely signed-out private window. This does not share the Form editor or response workbook. If the option is unavailable, stop and record the GCSD policy restriction.

Submit one clearly labeled test request. Confirm one row appears in `Requests` and that the row does not contain student information.

## 4. Deploy the Teacher Command Center

Choose **Deploy → New deployment → Web app**:

- Description: `GCSD Cottage Operations Teacher v1`
- Execute as: **User deploying the web app**
- Access: the GCSD-domain-only option

Record the deployed `/exec` URL. Open it in a private/incognito window where no GCSD account is signed in; access must be denied. Then open it while signed into an allowlisted GCSD account; it must load.

Never deploy the teacher application as anonymous or public.

## 5. Create the separate public feed

1. Create another standalone Apps Script project named `GCSD Cottage Operations - Public Feed`.
2. Copy `apps-script/public-feed/Code.gs` and its `appsscript.json` from this repository.
3. Run:

```javascript
configurePublicFeed("PASTE_NEW_WORKBOOK_ID");
```

4. Deploy it as a web app that executes as the deploying user and permits **Anyone** / anonymous access.
5. Record its `/exec` URL and open it while signed out. Before the first publication, it should return an empty JSON snapshot rather than a login page.

Anonymous access is the district-policy gate. If that access choice is unavailable or the signed-out test redirects to login, stop and record the result. Do not expose the teacher application or workbook as a substitute.

## 6. Connect the independent GitHub site

Provide the two `/exec` URLs to the repository maintainer or place them in `site/config.js` using `site/config.example.js` as the pattern. These deployment URLs are identifiers, not passwords, but they must belong only to this project. Do not add spreadsheet IDs, folder IDs, private Form editing URLs, or account credentials to GitHub.

Run:

```bash
npm run check:google:connected
npm test
```

## 7. Prove the vertical slice

1. Submit a request through the new Form.
2. Accept it in the protected Teacher Command Center.
3. Add an event-level learning focus, safety controls, menu, and at least one generic team/station assignment.
4. Save the draft. Confirm the student site did not change.
5. Publish the Event Order and manually refresh the student site.
6. Confirm the revision, timestamp, event details, safety controls, and generic assignment appear.
7. Generate the Event Order document and confirm it lands in `Generated Event Documents`.
8. Inspect the public-feed response. It must not contain contact details, budgets, internal notes, student identity, rosters, grades, or audit information.
9. Save screenshots or notes for IT showing the signed-out teacher denial and the student-safe public payload.

## Completion gate

The slice is complete only when all four checks pass:

- Teacher deployment is GCSD-restricted and allowlisted.
- Public feed is anonymous, read-only, and sanitized.
- GitHub Pages reads only the new public-feed deployment.
- Generated documents and operational data live under the new GCSD My Drive folder.
