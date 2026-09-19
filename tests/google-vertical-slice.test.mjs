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
    learning_focus: "Communication and quality control",
    safety_controls: "Prevent allergen cross-contact",
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
  assert.equal(result.learningFocus, "Communication and quality control");
  assert.equal(result.safetyControls, "Prevent allergen cross-contact");
  ["Private Person", "private@example.test", "555-0100", "$900", "Private staff note", "Student One", "student@example.test", "teacher@example.test", "supplierPrice"].forEach(secret => assert.equal(json.includes(secret), false, `publication leaked ${secret}`));
});

test("teacher and public Apps Script deployments have separate access policies", async () => {
  const teacher = JSON.parse(await readFile(new URL("../apps-script/teacher/appsscript.json", import.meta.url), "utf8"));
  const feed = JSON.parse(await readFile(new URL("../apps-script/public-feed/appsscript.json", import.meta.url), "utf8"));
  assert.equal(teacher.webapp.access, "DOMAIN");
  assert.equal(feed.webapp.access, "ANYONE_ANONYMOUS");
});

test("request Form is moved into the version-two project folder and logs its URLs", async () => {
  const source = await readFile(new URL("../apps-script/teacher/Code.gs", import.meta.url), "utf8");
  assert.match(source, /DriveApp\.getFileById\(form\.getId\(\)\)\.moveTo\(parents\.next\(\)\)/);
  assert.match(source, /console\.log\(JSON\.stringify\(result\)\)/);
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
  const issues = Array.from(context.publicationIssues_({ event_name: "", client_display_name: "", service_date: "", guest_count: 0, menu_json: "[]", tasks_json: "[]" }));
  assert.deepEqual(issues, [
    "event name is missing",
    "client display name is missing",
    "service date is missing",
    "guest count must be greater than zero",
    "menu is empty",
    "production assignments are empty"
  ]);
});

test("configuration rejects URLs, personal accounts, and a missing project folder", async () => {
  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  assert.throws(() => context.configureVerticalSlice({
    spreadsheetId: "https://docs.google.com/spreadsheets/d/not-an-id/edit",
    documentFolderId: "folder_12345678901234567890",
    allowedTeacherEmails: "teacher@greececsd.org",
    allowedDomain: "greececsd.org"
  }), /spreadsheetId must be an ID/);
  assert.throws(() => context.configureVerticalSlice({
    spreadsheetId: "sheet_12345678901234567890",
    documentFolderId: "folder_12345678901234567890",
    allowedTeacherEmails: "teacher@gmail.com",
    allowedDomain: "greececsd.org"
  }), /@greececsd\.org/);
  assert.throws(() => context.configureVerticalSlice({
    spreadsheetId: "sheet_12345678901234567890",
    allowedTeacherEmails: "teacher@greececsd.org",
    allowedDomain: "greececsd.org"
  }), /documentFolderId is required/);
});

test("request review statuses do not create Events until explicit acceptance", async () => {
  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  context.configureVerticalSlice({ spreadsheetId: "sheet_12345678901234567890", documentFolderId: "folder_12345678901234567890", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  context.appendRecord_("Requests", {
    request_id: "req-review", submitted_at: "2026-09-19T12:00:00.000Z", requester: "Test Client",
    contact_name: "Private Contact", contact_email: "private@example.test", contact_phone: "",
    event_name: "Review Test", event_type: "Internal service", school: "Arcadia", service_date: "2026-10-01",
    service_time: "10:00 AM", guest_count: 12, service_format: "Pickup", requested_menu: "Focaccia",
    requirements: "Test", allergens: "None declared", internal_notes: "", status: "New", event_id: "", updated_at: "2026-09-19T12:00:00.000Z"
  });

  assert.throws(() => context.reviewRequest("req-review", "Needs Information", ""), /requires a private review note/);
  context.reviewRequest("req-review", "Needs Information", "Confirm service location.");
  assert.equal(context.records_("Requests")[0].status, "Needs Information");
  assert.equal(context.records_("Events").length, 0);

  context.reviewRequest("req-review", "Declined", "Schedule cannot be accommodated.");
  assert.equal(context.records_("Events").length, 0);
  assert.throws(() => context.acceptRequest("req-review"), /Reopen the request/);

  context.reviewRequest("req-review", "Under Review", "Client supplied a new date.");
  const event = context.acceptRequest("req-review", "Approved after date change.");
  assert.equal(context.records_("Requests")[0].status, "Accepted");
  assert.equal(context.records_("Requests")[0].internal_notes, "Approved after date change.");
  assert.equal(context.records_("Events").length, 1);
  assert.equal(event.event_name, "Review Test");
});

test("request acceptance, draft save, publication, and document generation complete the vertical slice", async () => {
  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  context.configureVerticalSlice({ spreadsheetId: "sheet_12345678901234567890", documentFolderId: "folder_12345678901234567890", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  context.appendRecord_("Requests", {
    request_id: "req-1", submitted_at: "2026-09-17T12:00:00.000Z", requester: "GCSD Professional Learning",
    contact_name: "Private Contact", contact_email: "private@example.test", contact_phone: "555-0100",
    event_name: "Welcome Breakfast", event_type: "Catering", school: "Arcadia", service_date: "2026-09-24",
    service_time: "07:30", guest_count: 80, service_format: "Delivery", requested_menu: "Muffins, Fruit",
    requirements: "Ready by 7:15 AM", allergens: "Nut-free choices", internal_notes: "Private", status: "New", event_id: "", updated_at: "2026-09-17T12:00:00.000Z"
  });
  const event = context.acceptRequest("req-1");
  context.saveEvent({ ...event, client_display_name: "GCSD Professional Learning", learning_focus: "Communication and culinary math", safety_controls: "Prevent cross-contact; sanitize station", menu: [{ name: "Muffins", required: 80 }], tasks: [{ teamLabel: "Team A", station: "Kitchen 1", name: "Muffins", quantity: "80", instructions: "Package and label", equipment: ["sheet pans"], qualityControls: ["count verified"], handoff: "Deliver to service team" }] });
  const publication = context.publishEvent(event.event_id);
  const publishedEvent = context.findRecord_("Events", "event_id", event.event_id);
  const unchanged = context.saveEvent({
    ...publishedEvent,
    menu: context.parseJson_(publishedEvent.menu_json, []),
    tasks: context.parseJson_(publishedEvent.tasks_json, [])
  });
  const revised = context.saveEvent({
    ...unchanged,
    event_name: "Welcome Breakfast - revised",
    menu: context.parseJson_(unchanged.menu_json, []),
    tasks: context.parseJson_(unchanged.tasks_json, [])
  });
  const document = context.generateEventDocument(event.event_id);
  assert.equal(publication.revision, 1);
  assert.equal(unchanged.stage, "Published");
  assert.equal(revised.stage, "Revised draft");
  assert.equal(publication.snapshot.events[0].tasks[0].teamLabel, "Team A");
  assert.deepEqual(Array.from(publication.snapshot.events[0].tasks[0].equipment), ["sheet pans"]);
  assert.equal(publication.snapshot.events[0].learningFocus, "Communication and culinary math");
  assert.equal(JSON.stringify(publication.snapshot).includes("Private Contact"), false);
  assert.match(document.file_url, /^https:\/\/docs\.google\.test\//);
  assert.equal(context.records_("Requests")[0].status, "Accepted");
  assert.equal(context.records_("Publications").length, 1);
  assert.equal(context.records_("Documents").length, 1);
});
