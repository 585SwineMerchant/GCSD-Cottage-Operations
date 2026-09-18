const PUBLICATIONS_SHEET = "Publications";
const PUBLICATION_HEADERS = ["publication_id", "event_id", "revision", "published_at", "published_by", "snapshot_json"];

function configurePublicFeed(spreadsheetId) {
  if (!spreadsheetId) throw new Error("spreadsheetId is required.");
  PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", String(spreadsheetId).trim());
  return { ok: true };
}

function doGet(event) {
  const callback = String(event && event.parameter && event.parameter.callback || "");
  const snapshot = latestSnapshot_();
  const payload = JSON.stringify(snapshot);
  if (callback) {
    if (!/^[A-Za-z_$][0-9A-Za-z_$\.]{0,100}$/.test(callback)) {
      return ContentService.createTextOutput("Invalid callback.").setMimeType(ContentService.MimeType.TEXT);
    }
    return ContentService.createTextOutput(`${callback}(${payload});`).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(payload).setMimeType(ContentService.MimeType.JSON);
}

function latestSnapshot_() {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!id) return emptySnapshot_("Public feed is not configured.");
  const sheet = SpreadsheetApp.openById(id).getSheetByName(PUBLICATIONS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return emptySnapshot_("");
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, PUBLICATION_HEADERS.length).getDisplayValues();
  rows.sort((a, b) => String(b[3]).localeCompare(String(a[3])));
  try {
    const snapshot = JSON.parse(rows[0][5]);
    return snapshot && Array.isArray(snapshot.events) ? snapshot : emptySnapshot_("Published data is invalid.");
  } catch (_) {
    return emptySnapshot_("Published data is invalid.");
  }
}

function emptySnapshot_(message) {
  return { schemaVersion: 1, revision: 0, publishedAt: "", events: [], yearArchive: [], message: message || "" };
}
