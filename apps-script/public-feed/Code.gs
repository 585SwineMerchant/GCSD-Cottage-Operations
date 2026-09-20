const PUBLICATIONS_SHEET = "Publications";
const PUBLICATION_HEADERS = ["publication_id", "event_id", "revision", "published_at", "published_by", "snapshot_json"];
const PUBLICATION_ITEMS_SHEET = "PublicationItems";
const PUBLICATION_ITEM_HEADERS = ["publication_item_id", "publication_id", "publication_sequence", "event_id", "event_json"];
const INGREDIENT_PRICES_SHEET = "IngredientPrices";
const PUBLIC_PRICE_HEADERS = ["price_id", "ingredient_name", "recipe_unit", "package_description", "package_quantity", "package_price", "supplier", "sku", "notes", "active", "updated_at", "updated_by", "product_name", "aliases_json", "package_unit", "price_type", "store_location", "checked_at", "product_url", "source", "variable_weight", "estimated_count"];

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
  let sheet, book;
  try {
    book = SpreadsheetApp.openById(id);
    sheet = book.getSheetByName(PUBLICATIONS_SHEET);
  } catch (_) {
    return emptySnapshot_("Published Event Orders are temporarily unavailable.");
  }
  if (!sheet || sheet.getLastRow() < 2) return Object.assign(emptySnapshot_(""), { priceCatalog: publicPriceCatalog_(book) });
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, PUBLICATION_HEADERS.length).getDisplayValues()
    .map((row, index) => ({ row, index }));
  rows.sort((a, b) => String(b.row[3]).localeCompare(String(a.row[3])) || b.index - a.index);
  try {
    const snapshot = JSON.parse(rows[0].row[5]);
    if (snapshot && snapshot.storage === "PublicationItems" && snapshot.publicationId) {
      const itemSheet = book.getSheetByName(PUBLICATION_ITEMS_SHEET);
      if (!itemSheet || itemSheet.getLastRow() < 2) return emptySnapshot_("Published recipe data is temporarily unavailable.");
      const itemRows = itemSheet.getRange(2, 1, itemSheet.getLastRow() - 1, PUBLICATION_ITEM_HEADERS.length).getDisplayValues();
      const matchingRows = itemRows.filter(row => String(row[1]) === String(snapshot.publicationId));
      const events = matchingRows.map(row => { try { return JSON.parse(row[4]); } catch (_) { return null; } }).filter(Boolean);
      if (events.length !== Number(snapshot.eventCount || 0)) return emptySnapshot_("Published recipe data is incomplete.");
      return Object.assign({}, snapshot, { events, priceCatalog: publicPriceCatalog_(book) });
    }
    return snapshot && Array.isArray(snapshot.events) ? Object.assign({}, snapshot, { priceCatalog: publicPriceCatalog_(book) }) : emptySnapshot_("Published data is invalid.");
  } catch (_) {
    return emptySnapshot_("Published data is invalid.");
  }
}

function publicPriceCatalog_(book) {
  const sheet = book.getSheetByName(INGREDIENT_PRICES_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, PUBLIC_PRICE_HEADERS.length).getDisplayValues().map(row => Object.fromEntries(PUBLIC_PRICE_HEADERS.map((header, index) => [header, row[index]])))
    .filter(item => String(item.active || "TRUE").toUpperCase() !== "FALSE" && Number(item.package_quantity) > 0 && Number(item.package_price) > 0)
    .map(item => ({
      id: String(item.price_id), ingredientName: String(item.ingredient_name || ""), productName: String(item.product_name || item.ingredient_name || ""),
      aliases: safeJsonArray_(item.aliases_json), packageDescription: String(item.package_description || ""), packageQuantity: Number(item.package_quantity || 0),
      packageUnit: String(item.package_unit || item.recipe_unit || ""), packagePrice: Number(item.package_price || 0), supplier: String(item.supplier || ""),
      priceType: String(item.price_type || "estimate"), storeLocation: String(item.store_location || ""), checkedAt: String(item.checked_at || String(item.updated_at || "").slice(0, 10)),
      productUrl: /^https:\/\//i.test(String(item.product_url || "")) ? String(item.product_url) : "", variableWeight: String(item.variable_weight).toUpperCase() === "TRUE", estimatedCount: String(item.estimated_count).toUpperCase() === "TRUE"
    }));
}

function safeJsonArray_(value) {
  try { const parsed = JSON.parse(String(value || "[]")); return Array.isArray(parsed) ? parsed.map(String).slice(0, 30) : []; } catch (_) { return []; }
}

function emptySnapshot_(message) {
  return { schemaVersion: 2, revision: 0, publicationSequence: 0, publishedAt: "", events: [], yearArchive: [], priceCatalog: [], message: message || "" };
}
