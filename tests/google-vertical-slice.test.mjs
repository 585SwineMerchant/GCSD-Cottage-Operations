import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

async function teacherContext(globals = {}) {
  const source = await readFile(new URL("../apps-script/teacher/Code.gs", import.meta.url), "utf8");
  const context = vm.createContext({ console, ...globals });
  vm.runInContext(source, context, { filename: "Code.gs" });
  return context;
}

function fakeAppsScript() {
  class Range {
    constructor(sheet, row, column, rows, columns) { Object.assign(this, { sheet, row, column, rows, columns }); }
    getValues() { return Array.from({ length: this.rows }, (_, r) => Array.from({ length: this.columns }, (_, c) => this.sheet.rows[this.row - 1 + r]?.[this.column - 1 + c] ?? "")); }
    getDisplayValues() { return this.getValues().map(row => row.map(value => String(value ?? ""))); }
    setValues(values) { values.forEach((row, r) => { this.sheet.rows[this.row - 1 + r] ||= []; row.forEach((value, c) => { this.sheet.rows[this.row - 1 + r][this.column - 1 + c] = value; }); }); return this; }
  }
  class Sheet {
    constructor(name) { this.name = name; this.rows = []; }
    getLastRow() { return this.rows.length; }
    getRange(row, column, rows = 1, columns = 1) { return new Range(this, row, column, rows, columns); }
    appendRow(row) { this.rows.push([...row]); }
    setFrozenRows() {}
  }
  const book = {
    sheets: new Map(),
    getSheetByName(name) { return this.sheets.get(name) || null; },
    insertSheet(name) { const sheet = new Sheet(name); this.sheets.set(name, sheet); return sheet; }
  };
  const properties = new Map();
  let counter = 0;
  const body = { appendParagraph() { return { setHeading() { return this; } }; }, appendTable() { return {}; }, appendListItem() { return {}; } };
  const docs = [];
  return {
    book,
    globals: {
      PropertiesService: { getScriptProperties: () => ({
        getProperty: key => properties.get(key) || "",
        setProperty: (key, value) => properties.set(key, String(value)),
        setProperties: values => Object.entries(values).forEach(([key, value]) => properties.set(key, String(value)))
      }) },
      SpreadsheetApp: { openById: () => book },
      Session: { getActiveUser: () => ({ getEmail: () => "teacher@greececsd.org" }) },
      LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
      Utilities: { getUuid: () => `uuid-${++counter}`, formatDate: date => date.toISOString().slice(0, 10) },
      DocumentApp: {
        ParagraphHeading: { SUBTITLE: "subtitle", TITLE: "title", HEADING1: "h1", HEADING2: "h2" },
        create: name => { const doc = { name, id: `google-doc-${docs.length + 1}`, getBody: () => body, saveAndClose() {}, getId() { return this.id; }, getUrl() { return `https://docs.google.test/${this.id}`; } }; docs.push(doc); return doc; }
      },
      DriveApp: { getFileById: () => ({ moveTo() {} }), getFolderById: id => ({ id }) }
    }
  };
}

test("student publication sanitizer removes identity, contact, budget, and audit fields", async () => {
  const context = await teacherContext();
  const event = {
    event_id: "evt-1",
    event_name: "Welcome Breakfast",
    client_display_name: "GCSD Professional Learning",
    contact_name: "Private Person",
    contact_email: "private@example.test",
    contact_phone: "555-0100",
    budget: "$900",
    internal_notes: "Private staff note",
    service_date: "2026-09-24",
    service_time: "07:30",
    location: "Arcadia High School",
    guest_count: "80",
    service_format: "Delivery",
    requirements: "Ready by 7:15 AM",
    allergens: "Nut-free choices",
    menu_json: JSON.stringify([{ name: "Muffins", required: 80, supplierPrice: 27 }]),
    tasks_json: JSON.stringify([{ id: "task-1", teamLabel: "Team A", station: "Kitchen 1", name: "Muffins", students: ["Student One"], submittedBy: "student@example.test", quantity: "80", instructions: "Package and label" }]),
    revision: 2,
    published_at: "2026-09-17T12:00:00.000Z",
    updated_by: "teacher@example.test"
  };
  const result = context.sanitizePublicEvent_(event);
  const json = JSON.stringify(result);
  assert.equal(result.clientDisplayName, "GCSD Professional Learning");
  assert.equal(result.tasks[0].teamLabel, "Team A");
  ["Private Person", "private@example.test", "555-0100", "$900", "Private staff note", "Student One", "student@example.test", "teacher@example.test", "supplierPrice"].forEach(secret => assert.equal(json.includes(secret), false, `publication leaked ${secret}`));
});

test("teacher and public Apps Script deployments have separate access policies", async () => {
  const teacher = JSON.parse(await readFile(new URL("../apps-script/teacher/appsscript.json", import.meta.url), "utf8"));
  const feed = JSON.parse(await readFile(new URL("../apps-script/public-feed/appsscript.json", import.meta.url), "utf8"));
  assert.equal(teacher.webapp.access, "DOMAIN");
  assert.equal(feed.webapp.access, "ANYONE_ANONYMOUS");
});

test("GitHub student view is manual-refresh and read-only", async () => {
  const source = await readFile(new URL("../site/app.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8");
  assert.match(html, /id="refreshEventData"/);
  assert.equal(source.includes("setInterval("), false);
  assert.equal(source.includes("data-save-progress"), false);
  assert.equal(source.includes("/progress"), false);
  assert.match(source, /publicFeedUrl/);
});

test("publication validation requires the minimum operational event fields", async () => {
  const context = await teacherContext();
  const issues = Array.from(context.publicationIssues_({ event_name: "", client_display_name: "", service_date: "", guest_count: 0, menu_json: "[]" }));
  assert.deepEqual(issues, [
    "event name is missing",
    "client display name is missing",
    "service date is missing",
    "guest count must be greater than zero",
    "menu is empty"
  ]);
});

test("request acceptance, draft save, publication, and document generation complete the vertical slice", async () => {
  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  context.configureVerticalSlice({ spreadsheetId: "sheet-1", documentFolderId: "folder-1", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  context.appendRecord_("Requests", {
    request_id: "req-1", submitted_at: "2026-09-17T12:00:00.000Z", requester: "GCSD Professional Learning",
    contact_name: "Private Contact", contact_email: "private@example.test", contact_phone: "555-0100",
    event_name: "Welcome Breakfast", event_type: "Catering", school: "Arcadia", service_date: "2026-09-24",
    service_time: "07:30", guest_count: 80, service_format: "Delivery", requested_menu: "Muffins, Fruit",
    requirements: "Ready by 7:15 AM", allergens: "Nut-free choices", internal_notes: "Private", status: "New", event_id: "", updated_at: "2026-09-17T12:00:00.000Z"
  });
  const event = context.acceptRequest("req-1");
  context.saveEvent({ ...event, client_display_name: "GCSD Professional Learning", menu: [{ name: "Muffins", required: 80 }], tasks: [{ teamLabel: "Team A", station: "Kitchen 1", name: "Muffins", quantity: "80", instructions: "Package and label" }] });
  const publication = context.publishEvent(event.event_id);
  const document = context.generateEventDocument(event.event_id);
  assert.equal(publication.revision, 1);
  assert.equal(publication.snapshot.events[0].tasks[0].teamLabel, "Team A");
  assert.equal(JSON.stringify(publication.snapshot).includes("Private Contact"), false);
  assert.match(document.file_url, /^https:\/\/docs\.google\.test\//);
  assert.equal(context.records_("Requests")[0].status, "Accepted");
  assert.equal(context.records_("Publications").length, 1);
  assert.equal(context.records_("Documents").length, 1);
});
