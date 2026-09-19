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
  const immutableVersions = context.records_("RecipeVersions").map(row => row.snapshot_json);

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
  assert.deepEqual(context.records_("RecipeVersions").slice(0, 2).map(row => row.snapshot_json), immutableVersions);
  assert.throws(() => context.updateRecord_("RecipeVersions", "recipe_version_id", context.records_("RecipeVersions")[0].recipe_version_id, { status: "Changed" }), /append-only/);
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
