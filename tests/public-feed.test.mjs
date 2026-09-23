import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

async function feedContext(rows, itemRows = [], priceRows = [], recipeRows = []) {
  const source = await readFile(new URL("../apps-script/public-feed/Code.gs", import.meta.url), "utf8");
  const sheet = {
    getLastRow: () => rows.length + 1,
    getRange: () => ({ getDisplayValues: () => rows.map(row => [...row]) })
  };
  const itemSheet = {
    getLastRow: () => itemRows.length + 1,
    getRange: () => ({ getDisplayValues: () => itemRows.map(row => [...row]) })
  };
  const priceSheet = {
    getLastRow: () => priceRows.length + 1,
    getRange: () => ({ getDisplayValues: () => priceRows.map(row => [...row]) })
  };
  const recipeSheet = {
    getLastRow: () => recipeRows.length + 1,
    getRange: () => ({ getDisplayValues: () => recipeRows.map(row => [...row]) })
  };
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => "sheet_12345678901234567890", setProperty() {} }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: name => name === "PublicationItems" ? itemSheet : name === "IngredientPrices" ? priceSheet : name === "Recipes" ? recipeSheet : sheet }) },
    ContentService: { MimeType: { TEXT: "text", JAVASCRIPT: "javascript", JSON: "json" }, createTextOutput: content => ({ content, setMimeType() { return this; } }) }
  });
  vm.runInContext(source, context, { filename: "public-feed/Code.gs" });
  return context;
}

test("public feed returns the latest complete schema-two snapshot including an unpublish", async () => {
  const first = { schemaVersion: 1, revision: 1, publishedAt: "2026-09-19T12:00:00.000Z", events: [{ id: "evt-a" }], yearArchive: [] };
  const removed = { schemaVersion: 2, revision: 2, publicationSequence: 2, publishedAt: "2026-09-19T12:00:00.000Z", events: [], yearArchive: [], action: "unpublish" };
  const context = await feedContext([
    ["pub-1", "evt-a", "1", first.publishedAt, "teacher@greececsd.org", JSON.stringify(first)],
    ["pub-2", "evt-a", "1", removed.publishedAt, "teacher@greececsd.org", JSON.stringify(removed)]
  ]);
  const snapshot = context.latestSnapshot_();
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.action, "unpublish");
  assert.deepEqual(Array.from(snapshot.events), []);
});

test("public feed exposes only sanitized planning prices", async () => {
  const snapshot = { schemaVersion: 2, revision: 1, publishedAt: "2026-09-20T12:00:00.000Z", events: [], yearArchive: [] };
  const price = ["price-1", "all-purpose flour", "lb", "5 lb bag", "5", "2.49", "Wegmans", "sku-private", "private note", "TRUE", "2026-09-20T12:00:00.000Z", "teacher@greececsd.org", "Wegmans Flour", '["flour","ap flour"]', "lb", "receipt actual", "Culver Ridge", "2026-09-20", "https://www.wegmans.com/shop/categories/1", "reviewed receipt", "FALSE", "FALSE"];
  const context = await feedContext([["pub-1", "evt-a", "1", snapshot.publishedAt, "teacher@greececsd.org", JSON.stringify(snapshot)]], [], [price]);
  const result = context.latestSnapshot_();
  assert.equal(result.priceCatalog.length, 1);
  assert.equal(result.priceCatalog[0].productName, "Wegmans Flour");
  const json = JSON.stringify(result.priceCatalog);
  assert.equal(json.includes("private note"), false);
  assert.equal(json.includes("teacher@greececsd.org"), false);
  assert.equal(json.includes("sku-private"), false);
});

test("public feed publishes approved recipes as the Cottage menu without teacher identity fields", async () => {
  const snapshot = { schemaVersion: 3, revision: 1, publishedAt: "2026-09-20T12:00:00.000Z", events: [], yearArchive: [] };
  const approved = [
    "seed_ca12-002-rosemary-focaccia",
    "Rosemary Focaccia",
    "Breads, Pasta, Grains & Fermentation",
    "Approved",
    "1",
    "1",
    "sheet",
    "1 baked 12 x 18-inch sheet",
    "Wheat",
    "Culinary Arts 1 & 2 · Unit 2",
    JSON.stringify([{ name: "AP flour", quantity: 650, unit: "g", preparation: "" }]),
    JSON.stringify(["Stand mixer"]),
    JSON.stringify(["Mix and ferment.", "Bake until golden."]),
    "Follow approved food-safety procedures.",
    JSON.stringify(["Golden brown crust"]),
    "2026-09-20T10:00:00.000Z",
    "teacher@greececsd.org",
    "2026-09-20T10:00:00.000Z",
    "teacher@greececsd.org"
  ];
  const draft = [...approved];
  draft[0] = "draft-1";
  draft[1] = "Unapproved Draft";
  draft[3] = "Draft";
  const context = await feedContext(
    [["pub-1", "evt-a", "1", snapshot.publishedAt, "teacher@greececsd.org", JSON.stringify(snapshot)]],
    [],
    [],
    [approved, draft]
  );
  const result = context.latestSnapshot_();
  assert.equal(result.recipes.length, 1);
  assert.equal(result.recipes[0].name, "Rosemary Focaccia");
  assert.equal(result.recipes[0].ingredients[0], "650 g AP flour");
  assert.equal(result.cottageMenu.length, 1);
  assert.equal(result.cottageMenu[0].recipeId, "seed_ca12-002-rosemary-focaccia");
  const json = JSON.stringify({ recipes: result.recipes, cottageMenu: result.cottageMenu });
  assert.equal(json.includes("teacher@greececsd.org"), false);
  assert.equal(json.includes("Unapproved Draft"), false);
});

test("public feed fails closed when the newest snapshot is malformed", async () => {
  const valid = { schemaVersion: 2, revision: 1, events: [{ id: "evt-private-risk" }], yearArchive: [] };
  const context = await feedContext([
    ["pub-1", "evt-a", "1", "2026-09-19T12:00:00.000Z", "teacher@greececsd.org", JSON.stringify(valid)],
    ["pub-2", "evt-a", "1", "2026-09-19T12:01:00.000Z", "teacher@greececsd.org", "{broken"]
  ]);
  const snapshot = context.latestSnapshot_();
  assert.equal(snapshot.schemaVersion, 4);
  assert.deepEqual(Array.from(snapshot.events), []);
  assert.match(snapshot.message, /invalid/i);
});

test("public feed reconstructs schema-three snapshots from append-only publication items", async () => {
  const pointer = {
    schemaVersion: 3, revision: 7, publicationSequence: 7, publishedAt: "2026-09-19T13:00:00.000Z",
    events: [], yearArchive: [], action: "publish", storage: "PublicationItems", publicationId: "pub-7", eventCount: 1
  };
  const event = { id: "evt-recipe", name: "Recipe Event", menu: [{ name: "Soup", recipe: { version: 2, ingredients: ["8 lb Tomatoes"] } }], tasks: [] };
  const context = await feedContext(
    [["pub-7", "evt-recipe", "2", pointer.publishedAt, "teacher@greececsd.org", JSON.stringify(pointer)]],
    [
      ["item-old", "pub-6", "6", "evt-old", JSON.stringify({ id: "evt-old" })],
      ["item-7", "pub-7", "7", "evt-recipe", JSON.stringify(event)]
    ]
  );
  const snapshot = context.latestSnapshot_();
  assert.equal(snapshot.schemaVersion, 3);
  assert.equal(snapshot.events.length, 1);
  assert.equal(snapshot.events[0].menu[0].recipe.version, 2);
  assert.equal(JSON.stringify(snapshot).includes("evt-old"), false);
});

test("public feed fails closed when schema-three publication items are incomplete", async () => {
  const pointer = {
    schemaVersion: 3, revision: 8, publicationSequence: 8, publishedAt: "2026-09-19T13:05:00.000Z",
    events: [], yearArchive: [], action: "publish", storage: "PublicationItems", publicationId: "pub-8", eventCount: 2
  };
  const context = await feedContext(
    [["pub-8", "evt-a", "1", pointer.publishedAt, "teacher@greececsd.org", JSON.stringify(pointer)]],
    [["item-8a", "pub-8", "8", "evt-a", JSON.stringify({ id: "evt-a" })]]
  );
  const snapshot = context.latestSnapshot_();
  assert.deepEqual(Array.from(snapshot.events), []);
  assert.match(snapshot.message, /incomplete/i);
});
