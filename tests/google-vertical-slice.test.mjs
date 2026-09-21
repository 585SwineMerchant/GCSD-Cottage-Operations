import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

async function teacherContext(globals = {}) {
  const catalog = await readFile(new URL("../apps-script/teacher/Catalog.gs", import.meta.url), "utf8");
  const pathwayRecipes = await readFile(new URL("../apps-script/teacher/PathwayRecipes.gs", import.meta.url), "utf8");
  const recoveredRecipes = await readFile(new URL("../apps-script/teacher/RecoveredRecipes.gs", import.meta.url), "utf8");
  const source = await readFile(new URL("../apps-script/teacher/Code.gs", import.meta.url), "utf8");
  const context = vm.createContext({ console, ...globals });
  vm.runInContext(catalog, context, { filename: "Catalog.gs" });
  vm.runInContext(pathwayRecipes, context, { filename: "PathwayRecipes.gs" });
  vm.runInContext(recoveredRecipes, context, { filename: "RecoveredRecipes.gs" });
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
    getLastColumn() { return this.rows.reduce((max, row) => Math.max(max, row.length), 0); }
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

function operationalEvent(overrides = {}) {
  const now = "2026-09-19T12:00:00.000Z";
  return {
    event_id: "evt-test", request_id: "", event_name: "Operational Test", event_type: "Catering",
    school: "Arcadia", client_display_name: "GCSD Client", service_date: "2026-10-10",
    service_time: "10:00 AM", location: "Arcadia High School", guest_count: 40,
    service_format: "Pickup", requirements: "Ready at 9:45", allergens: "None declared",
    learning_focus: "Communication", safety_controls: "Prevent cross-contact",
    menu_json: JSON.stringify([{ name: "Soup", required: 40 }]),
    tasks_json: JSON.stringify([{ teamLabel: "Team A", station: "Kitchen 1", name: "Soup", quantity: "40", deadline: "9:30", instructions: "Prepare and hold", equipment: ["stockpot"], qualityControls: ["temperature"], handoff: "Service team" }]),
    stage: "Draft", revision: 0, published_at: "", published_by: "", created_at: now,
    updated_at: now, updated_by: "teacher@greececsd.org", lifecycle_status: "Planning",
    publication_status: "Never published", unpublished_at: "", unpublished_by: "",
    archived_at: "", archived_by: "", source_event_id: "", ...overrides
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
  assert.doesNotMatch(html, /teacherCommandCenterLink|Teacher Command Center/);
  assert.doesNotMatch(source, /teacherCommandCenterUrl/);
});

test("public and teacher interfaces use the Cottage brand and tab identity", async () => {
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8");
  const teacherHtml = await readFile(new URL("../apps-script/teacher/Index.html", import.meta.url), "utf8");
  const teacherCode = await readFile(new URL("../apps-script/teacher/Code.gs", import.meta.url), "utf8");
  assert.match(html, /The Cottage at Arcadia \| Student Operations/);
  assert.match(html, /assets\/cottage-favicon\.svg/);
  assert.match(html, /assets\/cottage-logo\.png/);
  assert.match(teacherHtml, /The Cottage at Arcadia · private operations/);
  assert.match(teacherHtml, /assets\/cottage-logo\.png/);
  assert.match(teacherCode, /setTitle\("The Cottage at Arcadia · Teacher Command Center"\)/);
  assert.match(teacherCode, /setFaviconUrl\("https:\/\/585swinemerchant\.github\.io\/GCSD-Cottage-Operations\/assets\/cottage-logo\.png"\)/);
});

test("legacy pathway recipes seed independently without importing Cloudflare records", async () => {
  const teacherCode = await readFile(new URL("../apps-script/teacher/Code.gs", import.meta.url), "utf8");
  const pathwayRecipes = await readFile(new URL("../apps-script/teacher/PathwayRecipes.gs", import.meta.url), "utf8");
  assert.match(teacherCode, /seedStarterRecipeLibrary_/);
  assert.equal([...pathwayRecipes.matchAll(/"id": "ca12-/g)].length, 37);
  assert.match(pathwayRecipes, /function seedStarterRecipeLibrary_/);
  assert.match(pathwayRecipes, /Migrated from the standalone GCSD-Advanced-Culinary pathway library/);
  ["users", "app_state", "audit_log", "submittedByEmail"].forEach(privateField => {
    assert.equal(pathwayRecipes.includes(privateField), false, `legacy recipe seed included ${privateField}`);
  });

  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  context.configureVerticalSlice({ spreadsheetId: "sheet_12345678901234567890", documentFolderId: "folder_12345678901234567890", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  assert.equal(context.records_("Recipes").length, 147);
  assert.equal(context.records_("RecipeVersions").length, 37);
  const recipes = context.recipeSummaries_();
  assert.equal(recipes.filter(recipe => recipe.status === "Approved" && recipe.approval_issues.length === 0).length, 37);
  assert.equal(recipes.filter(recipe => recipe.status === "Draft").length, 110);
  assert.deepEqual(JSON.parse(JSON.stringify(context.seedStarterRecipeLibrary_())), { added: 0, skipped: 37, total: 37 });
  assert.equal(context.records_("Recipes").length, 147);
});

test("recovered source recipes remain review-only drafts and seed idempotently", async () => {
  const recoveredRecipes = await readFile(new URL("../apps-script/teacher/RecoveredRecipes.gs", import.meta.url), "utf8");
  const recoveryAudit = await readFile(new URL("../docs/recovered-recipe-audit.md", import.meta.url), "utf8");
  const missingSources = await readFile(new URL("../docs/missing-recipe-source-list.md", import.meta.url), "utf8");
  assert.equal([...recoveredRecipes.matchAll(/"id": "advanced-source-/g)].length, 110);
  assert.match(recoveryAudit, /Catalog recipes\/master formulas: \*\*171\*\*/);
  assert.match(recoveryAudit, /Complete recovered catalog records: \*\*113\*\*/);
  assert.equal([...missingSources.matchAll(/^- \*\*R\d{3} —/gm)].length, 58);
  assert.match(recoveredRecipes, /function seedRecoveredRecipeLibrary_/);
  assert.match(recoveredRecipes, /status: "Draft"/);
  assert.doesNotMatch(recoveredRecipes, /status: "Approved"/);

  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  context.configureVerticalSlice({ spreadsheetId: "sheet_12345678901234567890", documentFolderId: "folder_12345678901234567890", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  const recovered = context.records_("Recipes").filter(recipe => String(recipe.recipe_id).startsWith("recovered_"));
  assert.equal(recovered.length, 110);
  assert.equal(recovered.every(recipe => recipe.status === "Draft" && Number(recipe.current_version) === 0), true);
  assert.equal(recovered.every(recipe => recipe.allergens === "Teacher verification required"), true);
  assert.equal(context.records_("RecipeVersions").filter(version => String(version.recipe_id).startsWith("recovered_")).length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(context.seedRecoveredRecipeLibrary_())), { added: 0, skipped: 110, total: 110 });
  assert.equal(context.records_("Recipes").filter(recipe => String(recipe.recipe_id).startsWith("recovered_")).length, 110);
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

test("legacy workbook headers migrate append-only and the migration is idempotent", async () => {
  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  const currentHeaders = Array.from(vm.runInContext("HEADERS.Events", context));
  const legacyHeaders = currentHeaders.slice(0, 24);
  const legacy = fake.book.insertSheet("Events");
  const legacyRow = legacyHeaders.map(header => header === "event_id" ? "evt-legacy" : header === "event_name" ? "Legacy Event" : "");
  legacy.rows = [legacyHeaders, legacyRow];

  context.configureVerticalSlice({ spreadsheetId: "sheet_12345678901234567890", documentFolderId: "folder_12345678901234567890", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  const firstHeaders = [...legacy.rows[0]];
  const firstRow = [...legacy.rows[1]];
  context.initializeWorkbook();

  assert.deepEqual(firstHeaders, currentHeaders);
  assert.deepEqual(legacy.rows[0], firstHeaders);
  assert.equal(firstRow[0], "evt-legacy");
  assert.equal(firstRow[2], "Legacy Event");
});

test("unpublish uses the latest complete snapshot and later publishes do not resurrect removed events", async () => {
  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  context.configureVerticalSlice({ spreadsheetId: "sheet_12345678901234567890", documentFolderId: "folder_12345678901234567890", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  context.appendRecord_("Events", operationalEvent({ event_id: "evt-a", event_name: "Event A" }));
  context.appendRecord_("Events", operationalEvent({ event_id: "evt-b", event_name: "Event B", service_date: "2026-10-11" }));

  context.publishEvent("evt-a");
  context.publishEvent("evt-b");
  const immutableBefore = context.records_("Publications").map(row => row.snapshot_json);
  assert.throws(() => context.unpublishEvent("evt-a", ""), /reason is required/);
  context.unpublishEvent("evt-a", "Schedule changed");
  const eventB = context.findRecord_("Events", "event_id", "evt-b");
  context.saveEvent({ ...eventB, event_name: "Event B revised", menu: context.parseJson_(eventB.menu_json, []), tasks: context.parseJson_(eventB.tasks_json, []) });
  context.publishEvent("evt-b");

  const latest = context.latestSnapshot_();
  assert.deepEqual(Array.from(latest.events, event => event.id), ["evt-b"]);
  assert.deepEqual(context.records_("Publications").slice(0, 2).map(row => row.snapshot_json), immutableBefore);
  assert.equal(context.findRecord_("Events", "event_id", "evt-a").publication_status, "Unpublished");
  assert.equal(context.records_("Publications").at(-2).action, "unpublish");
});

test("republish, archive, restore, and clone preserve private history and safe state", async () => {
  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  context.configureVerticalSlice({ spreadsheetId: "sheet_12345678901234567890", documentFolderId: "folder_12345678901234567890", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  context.appendRecord_("Events", operationalEvent({ event_id: "evt-life" }));
  context.publishEvent("evt-life");
  context.unpublishEvent("evt-life", "Event postponed");
  const republished = context.publishEvent("evt-life");
  assert.equal(republished.revision, 2);
  assert.equal(context.records_("Publications").at(-1).action, "republish");

  assert.throws(() => context.archiveEvent("evt-life", "Completed"), /student site before archiving/);
  context.unpublishEvent("evt-life", "Service completed");
  context.archiveEvent("evt-life", "Closeout complete");
  assert.throws(() => context.saveEvent({ event_id: "evt-life" }), /Restore this event/);
  context.restoreEvent("evt-life");
  const restored = context.findRecord_("Events", "event_id", "evt-life");
  assert.equal(restored.lifecycle_status, "Planning");
  assert.equal(restored.publication_status, "Unpublished");

  const clone = context.cloneEvent("evt-life");
  assert.notEqual(clone.event_id, "evt-life");
  assert.equal(clone.source_event_id, "evt-life");
  assert.equal(clone.service_date, "");
  assert.equal(Number(clone.revision), 0);
  assert.equal(clone.publication_status, "Never published");
  assert.equal(context.records_("Documents").filter(row => row.event_id === clone.event_id).length, 0);
  assert.equal(context.records_("Publications").filter(row => row.event_id === clone.event_id).length, 0);
});

test("dashboard foundation exposes separate lifecycle, publication, validation, and accessible controls", async () => {
  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  context.configureVerticalSlice({ spreadsheetId: "sheet_12345678901234567890", documentFolderId: "folder_12345678901234567890", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  context.appendRecord_("Events", operationalEvent({ event_id: "evt-valid" }));
  context.appendRecord_("Events", operationalEvent({ event_id: "evt-invalid", event_name: "", menu_json: "[]" }));
  const dashboard = context.getDashboard();
  assert.equal(dashboard.events.length, 2);
  assert.equal(dashboard.summary.attention, 1);
  assert.equal(dashboard.events.find(event => event.event_id === "evt-invalid").publication_issues.length, 2);

  const html = await readFile(new URL("../apps-script/teacher/Index.html", import.meta.url), "utf8");
  ["dashboardView", "requestsView", "eventsView", "eventWorkspace", "previewDialog", "unpublishDialog", "archiveDialog", "globalStatus"].forEach(id => assert.match(html, new RegExp(`id="${id}"`)));
  assert.match(html, /lang="en"/);
  assert.match(html, /Skip to main content/);
  assert.match(html, /unpublishEvent/);
  assert.match(html, /archiveEvent/);
  assert.match(html, /cloneEvent/);
});

test("recipe drafts, approvals, and event attachments preserve immutable approved versions", async () => {
  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  context.configureVerticalSlice({ spreadsheetId: "sheet_12345678901234567890", documentFolderId: "folder_12345678901234567890", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  const draft = context.saveRecipe({
    name: "Tomato Soup", category: "Soup", standard_yield_quantity: 10, standard_yield_unit: "portions",
    portion_size: "8 fl oz", allergens: "None declared", competencies: "Culinary math",
    ingredients: [{ name: "Tomatoes", quantity: 2, unit: "lb", preparation: "diced", supplierPrice: 99 }],
    equipment: ["stockpot"], procedure: ["Simmer until tender"], safety_controls: "Hold at 135°F or above",
    quality_controls: ["Taste approved"]
  });
  assert.equal(draft.status, "Draft");
  assert.equal(Number(draft.current_version), 1);
  const approved = context.approveRecipe(draft.recipe_id, "Classroom production standard");
  assert.equal(approved.status, "Approved");
  assert.equal(Number(approved.current_version), 2);

  context.appendRecord_("Events", operationalEvent({
    event_id: "evt-recipe", menu_json: JSON.stringify([{ name: "Tomato Soup", required: 40 }]),
    tasks_json: JSON.stringify([{ teamLabel: "Team A", station: "Kitchen 1", name: "Tomato Soup", quantity: "44", instructions: "Prepare soup" }])
  }));
  const attachment = context.attachRecipeToEvent("evt-recipe", draft.recipe_id, "Tomato Soup", 40, 10);
  assert.equal(Number(attachment.recipe_version), 2);
  assert.equal(attachment.scaled_recipe.yield, "44 portions");
  assert.match(attachment.scaled_recipe.ingredients[0], /^8\.8 lb Tomatoes/);
  assert.equal(JSON.stringify(attachment).includes("supplierPrice"), false);

  const firstPublication = context.publishEvent("evt-recipe");
  const firstRecipe = firstPublication.snapshot.events[0].menu[0].recipe;
  assert.equal(firstRecipe.version, 2);
  assert.match(firstRecipe.ingredients[0], /^8\.8 lb Tomatoes/);
  assert.equal(context.records_("PublicationItems").length, 1);
  const publicationPointer = context.parseJson_(context.records_("Publications")[0].snapshot_json, {});
  assert.equal(publicationPointer.storage, "PublicationItems");
  assert.equal(publicationPointer.events.length, 0);
  const immutableVersions = context.records_("RecipeVersions").filter(row => row.recipe_id === draft.recipe_id).map(row => row.snapshot_json);

  const edited = context.saveRecipe({
    ...approved, ingredients: [{ name: "Tomatoes", quantity: 3, unit: "lb", preparation: "diced" }],
    equipment: approved.equipment, procedure: approved.procedure, quality_controls: approved.quality_controls
  });
  assert.equal(edited.status, "Draft");
  assert.equal(Number(edited.current_version), 3);
  assert.throws(() => context.attachRecipeToEvent("evt-recipe", draft.recipe_id, "Tomato Soup", 40, 10), /currently approved/);
  const pinned = context.eventRecipeRecords_("evt-recipe").map(context.enrichEventRecipe_)[0];
  assert.equal(Number(pinned.recipe_version), 2);
  assert.match(pinned.scaled_recipe.ingredients[0], /^8\.8 lb Tomatoes/);
  assert.deepEqual(context.records_("RecipeVersions").filter(row => row.recipe_id === draft.recipe_id).slice(0, 2).map(row => row.snapshot_json), immutableVersions);
  assert.throws(() => context.updateRecord_("RecipeVersions", "recipe_version_id", context.records_("RecipeVersions").find(row => row.recipe_id === draft.recipe_id).recipe_version_id, { status: "Changed" }), /append-only/);
});

test("approving a revised recipe and refreshing an attachment marks the event revised", async () => {
  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  context.configureVerticalSlice({ spreadsheetId: "sheet_12345678901234567890", documentFolderId: "folder_12345678901234567890", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  const draft = context.saveRecipe({ name: "Focaccia", standard_yield_quantity: 2, standard_yield_unit: "loaves", ingredients: [{ name: "Flour", quantity: 1, unit: "kg" }], procedure: ["Mix and bake"] });
  context.approveRecipe(draft.recipe_id, "Initial approval");
  context.appendRecord_("Events", operationalEvent({ event_id: "evt-bread", menu_json: JSON.stringify([{ name: "Focaccia", required: 6 }]), tasks_json: JSON.stringify([{ name: "Focaccia" }]) }));
  context.attachRecipeToEvent("evt-bread", draft.recipe_id, "Focaccia", 6, 0);
  context.publishEvent("evt-bread");

  const current = context.getRecipe(draft.recipe_id).recipe;
  context.saveRecipe({ ...current, ingredients: [{ name: "Flour", quantity: 1.2, unit: "kg" }], equipment: current.equipment, procedure: current.procedure, quality_controls: current.quality_controls });
  const revised = context.approveRecipe(draft.recipe_id, "Hydration revision");
  context.attachRecipeToEvent("evt-bread", draft.recipe_id, "Focaccia", 6, 0);
  const event = context.findRecord_("Events", "event_id", "evt-bread");
  assert.equal(event.publication_status, "Revised draft");
  const attachment = context.eventRecipeRecords_("evt-bread").map(context.enrichEventRecipe_)[0];
  assert.equal(Number(attachment.recipe_version), Number(revised.current_version));
  assert.match(attachment.scaled_recipe.ingredients[0], /^3\.6 kg Flour/);
});

test("recipe library controls and student approved-recipe access are present", async () => {
  const teacher = await readFile(new URL("../apps-script/teacher/Index.html", import.meta.url), "utf8");
  const student = await readFile(new URL("../site/app.js", import.meta.url), "utf8");
  ["recipesView", "recipeWorkspace", "recipeForm", "eventRecipeList", "attachRecipeButton"].forEach(id => assert.match(teacher, new RegExp(`id="${id}"`)));
  assert.match(teacher, /approveRecipe/);
  assert.match(teacher, /attachRecipeToEvent/);
  assert.match(student, /data-menu-recipe-event/);
  assert.match(student, /Teacher-approved production recipe/);
  assert.match(student, /Safety controls/);
});

test("Recipe Studio export previews as an unsaved teacher draft without public writes", async () => {
  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  context.configureVerticalSlice({ spreadsheetId: "sheet_12345678901234567890", documentFolderId: "folder_12345678901234567890", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  const payload = JSON.stringify({
    schema: "gcsd-cottage-recipe-draft", schemaVersion: 1, exportedAt: "2026-09-20T12:00:00.000Z",
    recipe: {
      name: "Student Test Focaccia", category: "Bakery", standardYieldQuantity: 2, standardYieldUnit: "loaves",
      portionSize: "1 slice", allergens: "Wheat", competencies: "Yeast fermentation",
      ingredients: [{ name: "Flour", quantity: 32, quantityText: "", unit: "oz", preparation: "scaled" }, { name: "Salt", quantity: 0, quantityText: "to taste", unit: "", preparation: "" }],
      equipment: ["mixer"], procedure: ["Mix dough", "Ferment and bake"], safetyControls: "Use oven mitts",
      qualityControls: ["Golden crust"], sourceNotes: "Adapted after testing"
    }
  });
  const before = context.records_("Recipes").length;
  const preview = context.previewRecipeStudioImport(payload);
  assert.equal(preview.recipe.name, "Student Test Focaccia");
  assert.equal(preview.recipe.ingredients[1].quantityText, "to taste");
  assert.deepEqual(Array.from(preview.recipe.procedure), ["Mix dough", "Ferment and bake"]);
  assert.equal(preview.recipe.status, "Draft");
  assert.equal(context.records_("Recipes").length, before);
  assert.throws(() => context.previewRecipeStudioImport('{"schema":"unknown","schemaVersion":1,"recipe":{}}'), /not a supported/);
});

test("public Recipe Studio remains local-only and exports the teacher import contract", async () => {
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../site/app.js", import.meta.url), "utf8");
  const teacher = await readFile(new URL("../apps-script/teacher/Index.html", import.meta.url), "utf8");
  assert.match(html, /data-student-view="studio"/);
  assert.match(html, /id="studioView"/);
  assert.match(html, /id="studioScreenshot"/);
  assert.match(html, /id="studioRecipeUrl"/);
  assert.match(html, /Import recipe URL/);
  assert.match(html, /id="studioCropCanvas"/);
  assert.match(html, /Read pasted recipe/);
  assert.match(html, /does not collect names, submit records, or write directly/);
  assert.match(app, /gcsd-cottage-recipe-draft/);
  assert.match(app, /gcsdCottageRecipeStudioV1/);
  assert.match(app, /tesseract\.js@5\/dist\/tesseract\.min\.js/);
  assert.match(app, /GCSDRecipeParser\.parseRecipeText/);
  assert.match(app, /GCSDRecipeParser\.parseRecipeData/);
  assert.match(app, /config\.recipeImportUrl/);
  assert.match(app, /preparedStudioImage/);
  assert.match(app, /worker\.recognize\(image\)/);
  assert.match(app, /tessedit_pageseg_mode:"6"/);
  assert.match(app, /localStorage\.setItem\(STUDIO_KEY/);
  assert.doesNotMatch(app, /fetch\([^)]*recipe-submissions/);
  assert.match(teacher, /id="recipeImportText"/);
  assert.match(teacher, /previewRecipeStudioImport/);
});

test("recipe attachment preserves selections across an automatic event save", async () => {
  const teacher = await readFile(new URL("../apps-script/teacher/Index.html", import.meta.url), "utf8");
  const handler = teacher.match(/async function attachEventRecipe\(\)\{(.+?)\}async function detachEventRecipe/s)?.[1] || "";
  assert.ok(handler, "attachEventRecipe handler should be present");
  assert.ok(handler.indexOf('const menuItem=q("#attachMenuItem").value') < handler.indexOf("if(state.dirty"));
  assert.ok(handler.indexOf('recipeId=q("#attachRecipe").value') < handler.indexOf("if(state.dirty"));
  assert.match(teacher, /eventForm"\)\.addEventListener\("input",event=>\{if\(event\.target\.name\)markDirty\(true\)\}\)/);
});

test("returning to an open event refreshes its approved recipe choices", async () => {
  const teacher = await readFile(new URL("../apps-script/teacher/Index.html", import.meta.url), "utf8");
  assert.match(teacher, /async function navigateView\(view\)/);
  assert.match(teacher, /view==="events"&&state\.currentId/);
  assert.match(teacher, /state\.workspace=await call\("getEventWorkspace",state\.currentId\)/);
  assert.match(teacher, /onclick=\(\)=>navigateView\(b\.dataset\.view\)/);
});

test("private costing aggregates scaled ingredients and never enters the student snapshot", async () => {
  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  context.configureVerticalSlice({ spreadsheetId: "sheet_12345678901234567890", documentFolderId: "folder_12345678901234567890", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  const draft = context.saveRecipe({
    name: "Tomato Soup", standard_yield_quantity: 10, standard_yield_unit: "portions",
    ingredients: [{ name: "Tomatoes", quantity: 2, unit: "lb" }], procedure: ["Simmer"]
  });
  context.approveRecipe(draft.recipe_id, "Approved");
  context.appendRecord_("Events", operationalEvent({ event_id: "evt-cost", menu_json: JSON.stringify([{ name: "Tomato Soup", required: 40 }]), tasks_json: JSON.stringify([{ name: "Tomato Soup" }]) }));
  context.attachRecipeToEvent("evt-cost", draft.recipe_id, "Tomato Soup", 40, 10);
  context.saveIngredientPrice({ ingredient_name: "Tomatoes", recipe_unit: "lb", package_description: "5 lb pack", package_quantity: 5, package_price: 10, supplier: "Private Supplier", sku: "SECRET-SKU" });
  const costing = context.generateEventPurchasePlan("evt-cost");
  assert.equal(costing.items.length, 1);
  assert.equal(costing.items[0].required_quantity, 8.8);
  assert.equal(costing.items[0].packages_needed, 2);
  assert.equal(costing.estimatedTotal, 20);
  assert.equal(costing.unpricedCount, 0);
  const adjusted = context.updateEventPurchaseItem(costing.items[0].purchase_item_id, { on_hand_quantity: 4, status: "Ordered", notes: "Use existing stock first" });
  assert.equal(adjusted.items[0].to_purchase_quantity, 4.8);
  assert.equal(adjusted.items[0].packages_needed, 1);
  assert.equal(adjusted.estimatedTotal, 10);
  assert.equal(adjusted.items[0].status, "Ordered");
  assert.equal(context.records_("CostSnapshots").length, 1);
  assert.throws(() => context.updateRecord_("CostSnapshots", "cost_snapshot_id", context.records_("CostSnapshots")[0].cost_snapshot_id, { estimated_total: 0 }), /append-only/);
  const publicEvent = context.sanitizePublicEvent_(context.findRecord_("Events", "event_id", "evt-cost"), context.eventRecipeRecords_("evt-cost"));
  const json = JSON.stringify(publicEvent);
  assert.equal(json.includes("Private Supplier"), false);
  assert.equal(json.includes("SECRET-SKU"), false);
  assert.equal(json.includes("estimated_cost"), false);
});

test("costing and purchasing controls are present in the private event workspace", async () => {
  const teacher = await readFile(new URL("../apps-script/teacher/Index.html", import.meta.url), "utf8");
  ["costSummary", "generatePurchases", "priceCatalog", "purchasePlan", "savePrice"].forEach(id => assert.match(teacher, new RegExp(`id="${id}"`)));
  assert.match(teacher, /saveIngredientPrice/);
  assert.match(teacher, /generateEventPurchasePlan/);
  assert.match(teacher, /updateEventPurchaseItem/);
});

test("recipe approval blocks missing ingredient quantities and units", async () => {
  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  context.configureVerticalSlice({ spreadsheetId: "sheet_12345678901234567890", documentFolderId: "folder_12345678901234567890", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  const draft = context.saveRecipe({
    name: "Invalid Salsa", standard_yield_quantity: 8, standard_yield_unit: "portions",
    ingredients: [{ name: "Tomatoes", quantity: 0, unit: "" }], procedure: ["Dice"]
  });
  assert.throws(() => context.approveRecipe(draft.recipe_id, "Should fail"), /needs a positive quantity or an instruction/);
});

test("qualitative ingredients remain visible but are excluded from automatic costing", async () => {
  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  context.configureVerticalSlice({ spreadsheetId: "sheet_12345678901234567890", documentFolderId: "folder_12345678901234567890", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  const draft = context.saveRecipe({
    name: "Seasoned Tomatoes", standard_yield_quantity: 8, standard_yield_unit: "portions",
    ingredients: [{ name: "Tomatoes", quantity: 2, unit: "lb" }, { name: "Salt", quantityText: "to taste", unit: "" }], procedure: ["Season"]
  });
  const approved = context.approveRecipe(draft.recipe_id, "Approved");
  context.appendRecord_("Events", operationalEvent({ event_id: "evt-qualitative", menu_json: JSON.stringify([{ name: "Seasoned Tomatoes", required: 8 }]), tasks_json: JSON.stringify([{ name: "Seasoned Tomatoes" }]) }));
  const attachment = context.attachRecipeToEvent("evt-qualitative", approved.recipe_id, "Seasoned Tomatoes", 8, 0);
  assert.ok(attachment.scaled_recipe.ingredients.includes("Salt to taste"));
  const costing = context.generateEventPurchasePlan("evt-qualitative");
  const salt = costing.items.find(item => item.ingredient_name === "Salt");
  assert.equal(salt.requirement_text, "to taste");
  assert.equal(salt.required_quantity, 0);
  assert.equal(salt.status, "As needed");
  assert.equal(costing.unpricedCount, 0);
});

test("production planner detects missing dependencies, cycles, and equipment overlaps", async () => {
  const context = await teacherContext();
  const event = operationalEvent({ tasks_json: JSON.stringify([
    { id: "prep", teamLabel: "Team A", station: "Kitchen 1", phase: "Prep", name: "Prep salsa", startTime: "9:00 AM", durationMinutes: 45, dependsOn: ["service"], equipment: ["Robot Coupe"], status: "Ready" },
    { id: "service", teamLabel: "Team B", station: "Kitchen 2", phase: "Service", name: "Portion salsa", startTime: "9:30 AM", durationMinutes: 30, dependsOn: ["prep", "missing"], equipment: ["Robot Coupe"], status: "Blocked" }
  ]) });
  const analysis = context.analyzeProductionPlan_(event);
  assert.equal(analysis.ready, false);
  assert.ok(analysis.issues.some(issue => /missing task missing/.test(issue)));
  assert.ok(analysis.issues.some(issue => /Dependency cycle/.test(issue)));
  assert.ok(analysis.issues.some(issue => /overlap on Robot Coupe/.test(issue)));
  assert.ok(analysis.issues.some(issue => /service is blocked/.test(issue)));
  assert.ok(analysis.issues.some(issue => /service starts before prep is scheduled to finish/.test(issue)));
});

test("production task status changes preserve the published snapshot until republished", async () => {
  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  context.configureVerticalSlice({ spreadsheetId: "sheet_12345678901234567890", documentFolderId: "folder_12345678901234567890", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  context.appendRecord_("Events", operationalEvent({ event_id: "evt-status", tasks_json: JSON.stringify([{ id: "prep", name: "Prep salsa", status: "Ready" }]), publication_status: "Published", stage: "Published", revision: 1 }));
  const task = context.updateProductionTaskStatus("evt-status", "prep", "In progress");
  const event = context.findRecord_("Events", "event_id", "evt-status");
  assert.equal(task.status, "In progress");
  assert.equal(event.publication_status, "Revised draft");
  assert.equal(context.parseJson_(event.tasks_json, [])[0].status, "In progress");
  assert.throws(() => context.updateProductionTaskStatus("evt-status", "prep", "Unknown"), /valid production task status/);
});

test("kitchen management plan and student-safe production timeline controls are present", async () => {
  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  context.configureVerticalSlice({ spreadsheetId: "sheet_12345678901234567890", documentFolderId: "folder_12345678901234567890", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  context.appendRecord_("Events", operationalEvent({ event_id: "evt-kitchen", tasks_json: JSON.stringify([{ id: "prep", name: "Prep salsa", phase: "Prep", startTime: "9:00 AM", durationMinutes: 30, status: "Ready" }]) }));
  const document = context.generateKitchenManagementDocument("evt-kitchen");
  const teacher = await readFile(new URL("../apps-script/teacher/Index.html", import.meta.url), "utf8");
  const student = await readFile(new URL("../site/app.js", import.meta.url), "utf8");
  assert.equal(document.document_type, "Kitchen Management Plan");
  assert.match(teacher, /data-save-task-status/);
  assert.match(teacher, /generateKitchenManagementDocument/);
  assert.match(student, /Depends on/);
  assert.match(student, /task\.status/);
  assert.match(student, /task\.startTime/);
});

test("budget accounts distinguish allocated, committed, spent, credit, and available balances", async () => {
  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  context.configureVerticalSlice({ spreadsheetId: "sheet_12345678901234567890", documentFolderId: "folder_12345678901234567890", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  const account = context.saveBudgetAccount({ name: "Arcadia Culinary · Wegmans card", school: "Arcadia", course: "Advanced Culinary", funding_source: "Department allocation", payment_method: "Wegmans card", allocated_amount: 1000 });
  const commitment = context.recordBudgetTransaction({ budget_account_id: account.budget_account_id, transaction_type: "Commitment", amount: 200, status: "Active", vendor: "Wegmans" });
  context.recordBudgetTransaction({ budget_account_id: account.budget_account_id, transaction_type: "Expense", amount: 100, status: "Posted", vendor: "Wegmans" });
  context.recordBudgetTransaction({ budget_account_id: account.budget_account_id, transaction_type: "Credit", amount: 20, status: "Posted", vendor: "Wegmans" });
  const finance = context.financeDashboard_();
  assert.equal(finance.summary.allocated, 1000);
  assert.equal(finance.summary.committed, 200);
  assert.equal(finance.summary.spent, 80);
  assert.equal(finance.summary.available, 720);
  assert.equal(context.records_("BudgetTransactions").length, 3);
  context.updateBudgetTransactionStatus(commitment.budget_transaction_id, "Fulfilled");
  const afterFulfillment = context.financeDashboard_();
  assert.equal(afterFulfillment.summary.committed, 0);
  assert.equal(afterFulfillment.summary.available, 920);
  assert.throws(() => context.updateBudgetTransactionStatus(commitment.budget_transaction_id, "Void"), /valid transaction status/);
});

test("private event budget changes do not revise the student publication", async () => {
  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  context.configureVerticalSlice({ spreadsheetId: "sheet_12345678901234567890", documentFolderId: "folder_12345678901234567890", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  const account = context.saveBudgetAccount({ name: "Approved vendor PO", allocated_amount: 500, payment_method: "Purchase order" });
  const base = operationalEvent({ event_id: "evt-budget", publication_status: "Published", stage: "Published", revision: 1 });
  base.menu_json = JSON.stringify(context.normalizeMenu_(context.parseJson_(base.menu_json, [])));
  base.tasks_json = JSON.stringify(context.normalizeTasks_(context.parseJson_(base.tasks_json, [])));
  context.appendRecord_("Events", base);
  const saved = context.saveEvent({ ...base, event_budget: 250, budget_account_id: account.budget_account_id, menu: context.parseJson_(base.menu_json, []), tasks: context.parseJson_(base.tasks_json, []) });
  assert.equal(saved.publication_status, "Published");
  const publicEvent = context.sanitizePublicEvent_(context.findRecord_("Events", "event_id", "evt-budget"), []);
  assert.equal(JSON.stringify(publicEvent).includes("250"), false);
  assert.equal(JSON.stringify(publicEvent).includes(account.budget_account_id), false);
});

test("event closeout auto-summarizes operations and completes without changing publication", async () => {
  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  context.configureVerticalSlice({ spreadsheetId: "sheet_12345678901234567890", documentFolderId: "folder_12345678901234567890", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  const event = operationalEvent({
    event_id: "evt-closeout", publication_status: "Published", stage: "Published", revision: 2,
    event_budget: 250, tasks_json: JSON.stringify([
      { id: "prep", name: "Prep", status: "Complete" },
      { id: "service", name: "Service", status: "In progress" }
    ])
  });
  context.appendRecord_("Events", event);
  const account = context.saveBudgetAccount({ name: "Event account", allocated_amount: 1000 });
  context.recordBudgetTransaction({ budget_account_id: account.budget_account_id, event_id: event.event_id, transaction_type: "Expense", amount: 120, status: "Posted" });
  context.recordBudgetTransaction({ budget_account_id: account.budget_account_id, event_id: event.event_id, transaction_type: "Credit", amount: 20, status: "Posted" });

  const automatic = context.getEventWorkspace(event.event_id).closeout;
  assert.equal(automatic.actual_guest_count, 40);
  assert.equal(automatic.actual_cost, 100);
  assert.equal(automatic.summary.completedTaskCount, 1);
  assert.equal(automatic.summary.taskCount, 2);
  assert.throws(() => context.setEventLifecycle(event.event_id, "Completed"), /Closeout tab/);

  const input = {
    event_id: event.event_id, completed_on: "2026-10-10", outcome: "Completed with changes",
    actual_guest_count: 38, actual_cost: 95, customer_feedback: "Client requested earlier delivery next time",
    successes: "Cold holding plan worked", issues: "One delayed handoff", follow_up: "Adjust next production timeline"
  };
  const draft = context.saveEventCloseout({ ...input, actual_cost: 100 }, false);
  assert.equal(draft.finalized_at, "");
  assert.equal(draft.actual_cost_source, "Posted event transactions");
  context.recordBudgetTransaction({ budget_account_id: account.budget_account_id, event_id: event.event_id, transaction_type: "Expense", amount: 5, status: "Posted" });
  assert.equal(context.getEventWorkspace(event.event_id).closeout.actual_cost, 105);
  assert.equal(context.findRecord_("Events", "event_id", event.event_id).lifecycle_status, "Planning");
  const finalized = context.saveEventCloseout(input, true);
  const completed = context.findRecord_("Events", "event_id", event.event_id);
  assert.ok(finalized.finalized_at);
  assert.equal(completed.lifecycle_status, "Completed");
  assert.equal(completed.publication_status, "Published");
  assert.equal(context.records_("EventCloseouts").length, 1);
  const publicEvent = context.sanitizePublicEvent_(completed, []);
  assert.equal(JSON.stringify(publicEvent).includes("earlier delivery"), false);
});

test("inventory remains dormant and does not add teacher admin work", async () => {
  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  context.configureVerticalSlice({ spreadsheetId: "sheet_12345678901234567890", documentFolderId: "folder_12345678901234567890", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  assert.throws(() => context.saveInventoryItem({ ingredient_name: "Tomatoes", inventory_unit: "oz", opening_quantity: 16 }), /not active/);
  const draft = context.saveRecipe({ name: "Tomato Test", standard_yield_quantity: 8, standard_yield_unit: "portions", ingredients: [{ name: "Tomatoes", quantity: 20, unit: "oz" }], procedure: ["Prepare"] });
  const approved = context.approveRecipe(draft.recipe_id, "Approved");
  context.appendRecord_("Events", operationalEvent({ event_id: "evt-stock", guest_count: 12, menu_json: JSON.stringify([{ name: "Tomato Test", required: 12 }]), tasks_json: JSON.stringify([{ name: "Tomato Test" }]), event_budget: 100 }));
  context.attachRecipeToEvent("evt-stock", approved.recipe_id, "Tomato Test", 12, 0);
  context.saveIngredientPrice({ ingredient_name: "Tomatoes", recipe_unit: "oz", package_description: "32 oz package", package_quantity: 32, package_price: 4.99, supplier: "Wegmans" });
  const costing = context.generateEventPurchasePlan("evt-stock");
  const tomatoes = costing.items.find(row => row.ingredient_name === "Tomatoes");
  assert.equal(tomatoes.on_hand_quantity, 0);
  assert.equal(tomatoes.to_purchase_quantity, 30);
  assert.equal(tomatoes.packages_needed, 1);
  assert.equal(costing.estimatedFoodCost, 4.68);
  assert.equal(costing.costPerGuest, 0.39);
  assert.equal(costing.budgetVariance, 95.01);
  context.updateEventPurchaseItem(tomatoes.purchase_item_id, { on_hand_quantity: 0, status: "Received", notes: "Received in full" });
  const finance = context.financeDashboard_();
  assert.deepEqual(Array.from(finance.inventory), []);
  assert.equal(context.records_("InventoryTransactions").length, 0);
});

test("budget controls are visible, inventory controls are dormant, and private data remains absent from the student app", async () => {
  const teacher = await readFile(new URL("../apps-script/teacher/Index.html", import.meta.url), "utf8");
  const student = await readFile(new URL("../site/app.js", import.meta.url), "utf8");
  assert.match(teacher, />Budget</);
  assert.match(teacher, /Budget management/);
  assert.match(teacher, /saveBudgetAccount/);
  assert.match(teacher, /data-inactive-feature="inventory" hidden/);
  assert.match(teacher, /\[hidden\]\{display:none!important\}/);
  assert.match(teacher, /Private event closeout/);
  assert.match(teacher, /saveEventCloseout/);
  assert.match(teacher, /q\("#saveCloseout"\)\.onclick=\(\)=>saveCloseout\(false\)/);
  assert.doesNotMatch(teacher, /onclick="saveCloseout/);
  assert.match(teacher, /Received/);
  assert.doesNotMatch(student, /budget_account_id|allocated_amount|inventory_transaction_id|customer_feedback|actual_cost/);
  assert.match(student, /priceCatalog/);
  assert.match(student, /Costing Lab|costingView|renderCostAnalysis/);
});

test("receipt OCR parsing extracts review candidates without posting financial data", async () => {
  const context = await teacherContext();
  const parsed = context.parseReceiptText_(`WEGMANS FOOD MARKETS\nReceipt # 48291\n09/19/2026 18:42\nSubtotal 23.40\nTax 1.60\nTOTAL $25.00`);
  assert.equal(parsed.vendor, "WEGMANS FOOD MARKETS");
  assert.equal(parsed.transactionDate, "2026-09-19");
  assert.equal(parsed.totalAmount, 25);
  assert.equal(parsed.reference, "48291");
  assert.equal(parsed.lineItems.length, 0);
  assert.match(parsed.warnings.join(" "), /Item-level prices/);
});

test("receipt OCR parsing supports Wegmans alternating item and price lines", async () => {
  const context = await teacherContext();
  const parsed = context.parseReceiptText_(`WEGMANS\nTOMATO RED PLUM\n6.53 F\nPEPPER JALAPENO\n1.25 F\nCILANTRO BUNCH\n0.99 F\nWB LEMON JUICE\n5.00 F\nTAX\n0.00\n**** BALANCE\n30.41\nVISA PURCHASE\nCARD NUMBER ************1234\nCHANGE\n0.00\n09/14/26 04:29PM`);
  assert.equal(parsed.vendor, "WEGMANS");
  assert.equal(parsed.transactionDate, "2026-09-14");
  assert.equal(parsed.totalAmount, 30.41);
  assert.deepEqual(Array.from(parsed.lineItems, item => [item.ingredientName, item.lineTotal]), [
    ["Roma tomatoes", 6.53],
    ["jalapeno peppers", 1.25],
    ["cilantro", 0.99],
    ["WB LEMON JUICE", 5]
  ]);
  assert.equal(parsed.lineItems[0].matchedPriceId, "");
  assert.equal(parsed.lineItems[0].packagePrice, 0);
  assert.equal(parsed.lineItems[0].updateCatalog, false);
  assert.match(parsed.lineItems[0].catalogLearningNote, /does not show weight or price per pound/);
});

test("receipt OCR distinguishes existing catalog suggestions from new ingredients", async () => {
  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  context.configureVerticalSlice({ spreadsheetId: "sheet_12345678901234567890", documentFolderId: "folder_12345678901234567890", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  const parsed = context.parseReceiptText_(`WEGMANS\nPEPPER JALAPENO\n1.25 F\nCILANTRO BUNCH\n0.99 F\nTOTAL\n2.24`);
  const jalapeno = parsed.lineItems.find(item => item.ingredientName === "jalapeno peppers");
  const cilantro = parsed.lineItems.find(item => item.ingredientName === "cilantro");
  assert.equal(jalapeno.matchedPriceId, "");
  assert.match(jalapeno.catalogLearningNote, /add it to the catalog/i);
  assert.equal(cilantro.matchedPriceId, "seed_weg-cilantro");
  assert.equal(cilantro.productName, "Fresh Cilantro");
  assert.equal(cilantro.updateCatalog, false);
});

test("starter catalog seeds independently and matches aliases with compatible units", async () => {
  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  context.configureVerticalSlice({ spreadsheetId: "sheet_12345678901234567890", documentFolderId: "folder_12345678901234567890", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  const prices = context.activeIngredientPrices_();
  assert.equal(prices.length, 77);
  const flour = context.findIngredientPrice_("AP flour", "oz", prices);
  assert.equal(flour.price.supplier, "Wegmans");
  assert.equal(flour.price.store_location, "Culver Ridge");
  assert.equal(flour.converted, 80);
  context.initializeWorkbook();
  assert.equal(context.activeIngredientPrices_().length, 77, "starter migration must be idempotent");
});

test("only reviewed receipt lines update the price catalog", async () => {
  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  context.configureVerticalSlice({ spreadsheetId: "sheet_12345678901234567890", documentFolderId: "folder_12345678901234567890", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  const milk = context.activeIngredientPrices_().find(item => item.price_id === "seed_weg-milk");
  const ignored = context.updateCatalogFromReceipt_([{ ingredientName: "whole milk", packageQuantity: 128, packageUnit: "fl oz", packagePrice: 4.25, matchedPriceId: milk.price_id, updateCatalog: false }], { vendor: "Wegmans", transaction_date: "2026-09-20" }, "receipt-test", "teacher@greececsd.org");
  assert.equal(ignored.length, 0);
  assert.equal(Number(context.findRecord_("IngredientPrices", "price_id", milk.price_id).package_price), 3.69);
  const updates = context.updateCatalogFromReceipt_([{ ingredientName: "whole milk", productName: "Wegmans Whole Milk", packageQuantity: 128, packageUnit: "fl oz", packagePrice: 4.25, packageDescription: "1 gallon", matchedPriceId: milk.price_id, updateCatalog: true }], { vendor: "Wegmans", transaction_date: "2026-09-20" }, "receipt-test", "teacher@greececsd.org");
  assert.equal(updates.length, 1);
  const revised = context.findRecord_("IngredientPrices", "price_id", milk.price_id);
  assert.equal(Number(revised.package_price), 4.25);
  assert.equal(revised.price_type, "receipt actual");
  assert.equal(revised.source, "reviewed receipt");
});

test("purchase estimate becomes one refreshable commitment and a reviewed receipt posts the expense", async () => {
  const fake = fakeAppsScript();
  const context = await teacherContext(fake.globals);
  context.configureVerticalSlice({ spreadsheetId: "sheet_12345678901234567890", documentFolderId: "folder_12345678901234567890", allowedTeacherEmails: "teacher@greececsd.org", allowedDomain: "greececsd.org" });
  const account = context.saveBudgetAccount({ name: "Wegmans card", allocated_amount: 500 });
  context.appendRecord_("Events", operationalEvent({ event_id: "evt-receipt", event_budget: 200, budget_account_id: account.budget_account_id }));
  context.appendRecord_("EventPurchases", {
    purchase_item_id: "purchase-1", event_id: "evt-receipt", ingredient_name: "Tomatoes", recipe_unit: "lb",
    required_quantity: 10, on_hand_quantity: 0, to_purchase_quantity: 10, package_description: "10 lb case",
    package_quantity: 10, package_price: 25, packages_needed: 1, estimated_cost: 25, supplier: "Wegmans",
    sku: "", status: "Needed", notes: "", source_json: "[]", active: "TRUE", updated_at: "2026-09-19T12:00:00.000Z",
    updated_by: "teacher@greececsd.org", requirement_text: ""
  });
  const commitment = context.createPurchaseCommitment("evt-receipt");
  assert.equal(commitment.amount, 25);
  assert.equal(context.createPurchaseCommitment("evt-receipt").budget_transaction_id, commitment.budget_transaction_id);
  assert.equal(context.records_("BudgetTransactions").length, 1);

  context.appendRecord_("Receipts", {
    receipt_id: "receipt-1", file_id: "file-1", file_url: "https://drive.google.test/file-1", file_name: "receipt.jpg",
    mime_type: "image/jpeg", ocr_status: "Completed", ocr_text: "private extracted text", vendor: "Wegmans",
    transaction_date: "2026-09-19", total_amount: 25, reference: "48291", category: "Food", event_id: "evt-receipt",
    budget_account_id: account.budget_account_id, commitment_id: commitment.budget_transaction_id, notes: "", status: "Draft",
    budget_transaction_id: "", created_at: "2026-09-19T12:00:00.000Z", created_by: "teacher@greececsd.org",
    updated_at: "2026-09-19T12:00:00.000Z", updated_by: "teacher@greececsd.org"
  });
  const posted = context.postReceiptExpense({ receipt_id: "receipt-1" });
  assert.equal(posted.transaction.transaction_type, "Expense");
  assert.equal(posted.transaction.status, "Posted");
  assert.equal(context.findRecord_("BudgetTransactions", "budget_transaction_id", commitment.budget_transaction_id).status, "Fulfilled");
  assert.equal(context.findRecord_("Receipts", "receipt_id", "receipt-1").status, "Posted");
  assert.equal(context.financeDashboard_().summary.spent, 25);
  assert.equal(context.eventCloseout_("evt-receipt").summary.linkedPostedSpend, 25);
  assert.equal("ocr_text" in context.financeDashboard_().receipts[0], false);
});

test("teacher UI provides guided workflow, structured editors, and private receipt review", async () => {
  const html = await readFile(new URL("../apps-script/teacher/Index.html", import.meta.url), "utf8");
  const manifest = JSON.parse(await readFile(new URL("../apps-script/teacher/appsscript.json", import.meta.url), "utf8"));
  assert.match(html, /id="eventWorkflow"/);
  assert.match(html, /id="receiptFile"/);
  assert.match(html, /Upload &amp; extract receipt/);
  assert.match(html, /installStructuredEventEditors/);
  assert.match(html, /postReceiptExpense/);
  assert.equal(manifest.dependencies.enabledAdvancedServices[0].serviceId, "drive");
  assert.equal(manifest.dependencies.enabledAdvancedServices[0].version, "v3");
});
