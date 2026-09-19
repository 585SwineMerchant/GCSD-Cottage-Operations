import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

async function feedContext(rows, itemRows = []) {
  const source = await readFile(new URL("../apps-script/public-feed/Code.gs", import.meta.url), "utf8");
  const sheet = {
    getLastRow: () => rows.length + 1,
    getRange: () => ({ getDisplayValues: () => rows.map(row => [...row]) })
  };
  const itemSheet = {
    getLastRow: () => itemRows.length + 1,
    getRange: () => ({ getDisplayValues: () => itemRows.map(row => [...row]) })
  };
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => "sheet_12345678901234567890", setProperty() {} }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: name => name === "PublicationItems" ? itemSheet : sheet }) },
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

test("public feed fails closed when the newest snapshot is malformed", async () => {
  const valid = { schemaVersion: 2, revision: 1, events: [{ id: "evt-private-risk" }], yearArchive: [] };
  const context = await feedContext([
    ["pub-1", "evt-a", "1", "2026-09-19T12:00:00.000Z", "teacher@greececsd.org", JSON.stringify(valid)],
    ["pub-2", "evt-a", "1", "2026-09-19T12:01:00.000Z", "teacher@greececsd.org", "{broken"]
  ]);
  const snapshot = context.latestSnapshot_();
  assert.equal(snapshot.schemaVersion, 2);
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
