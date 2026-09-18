# Google vertical slice

This folder contains the first complete Google-backed workflow for GCSD Cottage Operations:

`Google Form request → protected teacher inbox → private Event Order draft → deliberate publication → read-only GitHub student view → Google Event Order document`

It intentionally uses **two Apps Script projects**. Do not combine them.

| Project | Deployment access | Responsibility |
|---|---|---|
| `teacher/` | GCSD domain only | Requests, draft events, publishing, audit records, and document generation |
| `public-feed/` | Anyone/anonymous | Return only the latest sanitized publication snapshot |

The public project has no write functions and never reads Requests, Documents, or Audit. Contact information stays only in the restricted `Requests` sheet. Student names, email addresses, IDs, rosters, and individual roles are not part of this data model. Both projects must be newly created for version two; do not reuse an Apps Script project or deployment from another application.

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

This creates and validates these tabs:

- `Requests`
- `Events`
- `Publications`
- `Documents`
- `Audit`

Then run `createRequestForm()` once. Its return value contains the editing and published URLs for the generated client-request Form. An installable form-submit trigger is created automatically.

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

## Current vertical-slice boundaries

This proves the new infrastructure before the full command center is ported. It includes the request inbox, core Event Order fields, generic production assignments, controlled publication, student display, and one operational document. Menu scaling, purchasing, the full production planner, budgets, closeout, archive, and Recipe Studio import remain version-two migration stages after this gate passes.

For a click-by-click protected-account session, use [`../docs/weekend-google-setup.md`](../docs/weekend-google-setup.md).
