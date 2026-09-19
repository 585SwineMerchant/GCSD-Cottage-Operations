# Google resource register

Keep this file as a local setup worksheet. Do **not** commit completed IDs, private editing URLs, or account details to GitHub. The two public `/exec` deployment URLs may be entered in `site/config.js` after verification.

| Resource | Required name | Record during setup |
|---|---|---|
| Top-level GCSD My Drive folder | `GCSD Cottage Operations` | URL: |
| Operational Google Sheet | `GCSD Cottage Operations - Data` | URL / ID: |
| Generated-document folder | `Generated Event Documents` | URL / ID: |
| Teacher Apps Script project | `GCSD Cottage Operations - Teacher` | Project URL: |
| Teacher deployment | `GCSD Cottage Operations Teacher v1` | `/exec` URL: |
| Request Form | `GCSD Culinary Event Request` | Published URL: |
| Request Form owner link | same Form | Private edit URL: |
| Public Apps Script project | `GCSD Cottage Operations - Public Feed` | Project URL: |
| Public-feed deployment | first production deployment | `/exec` URL: |

## Verification notes

| Check | Result / date |
|---|---|
| Teacher URL denied while signed out | |
| Teacher URL opens for allowlisted GCSD account | |
| Public-feed URL returns JSON while signed out | |
| Test request appears in `Requests` | |
| Draft does not alter student site | |
| Published revision appears after manual refresh | |
| Generated Event Order lands in correct folder | |
| Public JSON contains no private or student data | |
| Recipe and publication-item tabs created by `initializeWorkbook()` | |
| Approved recipe scales correctly on test event | |
| Master edit leaves pinned event recipe unchanged | |
