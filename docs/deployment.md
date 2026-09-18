# Vertical-slice deployment

No live resource should be created under another application's account, project, Worker, database, repository, or deployment configuration.

## Resource names

Use a consistent version-two prefix:

- GitHub repository: `GCSD-Cottage-Operations`
- Shared Drive folder: `GCSD Cottage Operations`
- Operational workbook: `GCSD Cottage Operations - Data`
- Teacher Apps Script project: `GCSD Cottage Operations - Teacher`
- Public Apps Script project: `GCSD Cottage Operations - Public Feed`
- Request Form: `GCSD Culinary Event Request`
- Generated-document folder: `Generated Event Documents`

## Deployment sequence

1. Create the new GitHub repository without importing another repository's history.
2. Push this standalone repository to it.
3. Create the Shared Drive folder, blank operational workbook, and generated-document subfolder.
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

Detailed Apps Script setup is in [`../apps-script/README.md`](../apps-script/README.md).
