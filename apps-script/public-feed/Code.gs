const PUBLICATIONS_SHEET = "Publications";
const PUBLICATION_HEADERS = ["publication_id", "event_id", "revision", "published_at", "published_by", "snapshot_json"];
const PUBLICATION_ITEMS_SHEET = "PublicationItems";
const PUBLICATION_ITEM_HEADERS = ["publication_item_id", "publication_id", "publication_sequence", "event_id", "event_json"];

function configurePublicFeed(spreadsheetId) {
  const id = String(spreadsheetId || "").trim();
  if (!/^[A-Za-z0-9_-]{20,}$/.test(id)) throw new Error("spreadsheetId must be an ID copied from a Google URL, not the full URL.");
  PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", id);
  return { ok: true, spreadsheetId: id };
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
  let sheet;
  try {
    sheet = SpreadsheetApp.openById(id).getSheetByName(PUBLICATIONS_SHEET);
  } catch (_) {
    return emptySnapshot_("Published Event Orders are temporarily unavailable.");
  }
  if (!sheet || sheet.getLastRow() < 2) return emptySnapshot_("");
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, PUBLICATION_HEADERS.length).getDisplayValues()
    .map((row, index) => ({ row, index }));
  rows.sort((a, b) => String(b.row[3]).localeCompare(String(a.row[3])) || b.index - a.index);
  try {
    const snapshot = JSON.parse(rows[0].row[5]);
    if (snapshot && snapshot.storage === "PublicationItems" && snapshot.publicationId) {
      const itemSheet = SpreadsheetApp.openById(id).getSheetByName(PUBLICATION_ITEMS_SHEET);
      if (!itemSheet || itemSheet.getLastRow() < 2) return emptySnapshot_("Published recipe data is temporarily unavailable.");
      const itemRows = itemSheet.getRange(2, 1, itemSheet.getLastRow() - 1, PUBLICATION_ITEM_HEADERS.length).getDisplayValues();
      const matchingRows = itemRows.filter(row => String(row[1]) === String(snapshot.publicationId));
      const events = matchingRows.map(row => { try { return JSON.parse(row[4]); } catch (_) { return null; } }).filter(Boolean);
      if (events.length !== Number(snapshot.eventCount || 0)) return emptySnapshot_("Published recipe data is incomplete.");
      return Object.assign({}, snapshot, { events });
    }
    return snapshot && Array.isArray(snapshot.events) ? snapshot : emptySnapshot_("Published data is invalid.");
  } catch (_) {
    return emptySnapshot_("Published data is invalid.");
  }
}

function emptySnapshot_(message) {
  return { schemaVersion: 2, revision: 0, publicationSequence: 0, publishedAt: "", events: [], yearArchive: [], message: message || "" };
}
