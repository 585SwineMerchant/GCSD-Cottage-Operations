# Deployment

No live resource should be created under another application's account, project, Worker, database, repository, or deployment configuration.

## Resource names

Use a consistent version-two prefix:

- GitHub repository: `GCSD-Cottage-Operations`
- GCSD My Drive folder: `GCSD Cottage Operations`
- Operational workbook: `GCSD Cottage Operations - Data`
- Teacher Apps Script project: `GCSD Cottage Operations - Teacher`
- Public Apps Script project: `GCSD Cottage Operations - Public Feed`
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
11. Put the two new `/exec` URLs in `site/config.js`.
12. Enable GitHub Pages from this repository's workflow.
13. Run the proof: request → accept → draft → publish → student load → document.

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
