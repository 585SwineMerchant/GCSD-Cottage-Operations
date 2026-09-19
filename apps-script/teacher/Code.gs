const SHEETS = Object.freeze({
  REQUESTS: "Requests",
  EVENTS: "Events",
  PUBLICATIONS: "Publications",
  DOCUMENTS: "Documents",
  AUDIT: "Audit"
});

const REQUEST_REVIEW_STATUSES = Object.freeze(["New", "Under Review", "Needs Information", "Declined"]);

const HEADERS = Object.freeze({
  Requests: ["request_id", "submitted_at", "requester", "contact_name", "contact_email", "contact_phone", "event_name", "event_type", "school", "service_date", "service_time", "guest_count", "service_format", "requested_menu", "requirements", "allergens", "internal_notes", "status", "event_id", "updated_at"],
  Events: ["event_id", "request_id", "event_name", "event_type", "school", "client_display_name", "service_date", "service_time", "location", "guest_count", "service_format", "requirements", "allergens", "learning_focus", "safety_controls", "menu_json", "tasks_json", "stage", "revision", "published_at", "published_by", "created_at", "updated_at", "updated_by"],
  Publications: ["publication_id", "event_id", "revision", "published_at", "published_by", "snapshot_json"],
  Documents: ["document_id", "event_id", "document_type", "file_id", "file_url", "created_at", "created_by"],
  Audit: ["audit_id", "occurred_at", "actor", "action", "record_type", "record_id", "detail_json"]
});

function doGet() {
  assertTeacher_();
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("GCSD Culinary · Teacher Command Center")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * One-time project setup. Run this from the Apps Script editor while signed in
 * with the district account that will own the deployment.
 */
function configureVerticalSlice(config) {
  const teacher = assertTeacher_();
  if (!config || !config.spreadsheetId) throw new Error("spreadsheetId is required.");
  if (!config.documentFolderId) throw new Error("documentFolderId is required so generated documents stay in the project folder.");
  const spreadsheetId = googleId_(config.spreadsheetId, "spreadsheetId");
  const documentFolderId = googleId_(config.documentFolderId, "documentFolderId");
  const allowedDomain = clean_(config.allowedDomain || "greececsd.org", 200).toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(allowedDomain)) throw new Error("allowedDomain must be a valid email domain.");
  const allowedTeacherEmails = normalizeEmails_(config.allowedTeacherEmails);
  if (!allowedTeacherEmails.length) throw new Error("At least one allowedTeacherEmails address is required for the pilot.");
  if (allowedTeacherEmails.some(email => !email.endsWith(`@${allowedDomain}`))) {
    throw new Error(`Every allowed teacher must use the @${allowedDomain} domain.`);
  }
  if (!allowedTeacherEmails.includes(teacher.email)) throw new Error("The configuring account must be included in allowedTeacherEmails.");
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    SPREADSHEET_ID: spreadsheetId,
    DOCUMENT_FOLDER_ID: documentFolderId,
    ALLOWED_TEACHER_EMAILS: allowedTeacherEmails.join(","),
    ALLOWED_DOMAIN: allowedDomain
  }, false);
  initializeWorkbook_();
  return { ok: true, spreadsheetId, documentFolderId, allowedTeacherEmails };
}

function initializeWorkbook() {
  assertTeacher_();
  initializeWorkbook_();
  return { ok: true };
}

function initializeWorkbook_() {
  const book = workbook_();
  Object.keys(HEADERS).forEach(name => {
    const sheet = book.getSheetByName(name) || book.insertSheet(name);
    const headers = HEADERS[name];
    if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    const actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    if (headers.some((header, index) => actual[index] !== header)) {
      throw new Error(`${name} has unexpected columns. Expected: ${headers.join(", ")}`);
    }
    sheet.setFrozenRows(1);
  });
}

function createRequestForm() {
  assertTeacher_();
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty("REQUEST_FORM_ID");
  if (existingId) {
    try {
      const existing = FormApp.openById(existingId);
      const result = { id: existing.getId(), editUrl: existing.getEditUrl(), publishedUrl: existing.getPublishedUrl(), existing: true };
      console.log(JSON.stringify(result));
      return result;
    } catch (_) {
      // The saved form was removed or access changed; create a replacement below.
    }
  }
  const form = FormApp.create("GCSD Culinary Event Request");
  form.setDescription("Submit a request for consideration. Submission does not confirm that the Culinary Pathway has accepted the event.");
  form.addTextItem().setTitle("Requester / organization").setRequired(true);
  form.addTextItem().setTitle("Contact name").setRequired(true);
  form.addTextItem().setTitle("Contact email").setRequired(true);
  form.addTextItem().setTitle("Contact phone");
  form.addTextItem().setTitle("Event name").setRequired(true);
  form.addListItem().setTitle("Event type").setChoiceValues(["Catering", "Internal service", "Pop-up", "Other"]).setRequired(true);
  form.addListItem().setTitle("School / site").setChoiceValues(["Arcadia", "Olympia", "Districtwide", "Other"]).setRequired(true);
  form.addDateItem().setTitle("Service date").setRequired(true);
  form.addTextItem().setTitle("Service time").setHelpText("Example: 5:30 PM").setRequired(true);
  form.addTextItem().setTitle("Estimated guest count").setRequired(true);
  form.addTextItem().setTitle("Service format").setHelpText("Pickup, delivery, staffed service, plated meal, etc.").setRequired(true);
  form.addParagraphTextItem().setTitle("Requested menu");
  form.addParagraphTextItem().setTitle("Service requirements");
  form.addParagraphTextItem().setTitle("Dietary needs and allergens");
  ScriptApp.newTrigger("onRequestFormSubmit").forForm(form).onFormSubmit().create();
  const documentFolderId = props.getProperty("DOCUMENT_FOLDER_ID");
  if (documentFolderId) {
    const parents = DriveApp.getFolderById(documentFolderId).getParents();
    if (parents.hasNext()) DriveApp.getFileById(form.getId()).moveTo(parents.next());
  }
  props.setProperty("REQUEST_FORM_ID", form.getId());
  const result = { id: form.getId(), editUrl: form.getEditUrl(), publishedUrl: form.getPublishedUrl(), existing: false };
  console.log(JSON.stringify(result));
  return result;
}

function onRequestFormSubmit(event) {
  const answers = {};
  event.response.getItemResponses().forEach(response => {
    answers[response.getItem().getTitle()] = response.getResponse();
  });
  const now = new Date().toISOString();
  const record = {
    request_id: id_("req"),
    submitted_at: now,
    requester: answers["Requester / organization"],
    contact_name: answers["Contact name"],
    contact_email: answers["Contact email"],
    contact_phone: answers["Contact phone"],
    event_name: answers["Event name"],
    event_type: answers["Event type"],
    school: answers["School / site"],
    service_date: isoDate_(answers["Service date"]),
    service_time: answers["Service time"],
    guest_count: positiveInteger_(answers["Estimated guest count"], 0),
    service_format: answers["Service format"],
    requested_menu: answers["Requested menu"],
    requirements: answers["Service requirements"],
    allergens: answers["Dietary needs and allergens"],
    internal_notes: "",
    status: "New",
    event_id: "",
    updated_at: now
  };
  appendRecord_(SHEETS.REQUESTS, record);
  audit_("form", "create", "request", record.request_id, { eventName: record.event_name });
}

function getDashboard() {
  const teacher = assertTeacher_();
  return {
    teacher,
    requests: records_(SHEETS.REQUESTS).sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at))),
    events: records_(SHEETS.EVENTS).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))),
    documents: records_(SHEETS.DOCUMENTS).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  };
}

function reviewRequest(requestId, status, note) {
  const teacher = assertTeacher_();
  const nextStatus = clean_(status, 100);
  const reviewNote = clean_(note, 4000);
  if (!REQUEST_REVIEW_STATUSES.includes(nextStatus)) throw new Error("Invalid request review status.");
  if (["Needs Information", "Declined"].includes(nextStatus) && !reviewNote) {
    throw new Error(`${nextStatus} requires a private review note.`);
  }
  return withLock_(() => {
    const request = findRecord_(SHEETS.REQUESTS, "request_id", requestId);
    if (!request) throw new Error("Request not found.");
    if (request.status === "Accepted") throw new Error("Accepted requests are managed from their Event draft.");
    const now = new Date().toISOString();
    updateRecord_(SHEETS.REQUESTS, "request_id", requestId, {
      status: nextStatus,
      internal_notes: reviewNote,
      updated_at: now
    });
    audit_(teacher.email, "review", "request", requestId, { status: nextStatus, note: reviewNote });
    return findRecord_(SHEETS.REQUESTS, "request_id", requestId);
  });
}

function acceptRequest(requestId, reviewNote) {
  const teacher = assertTeacher_();
  return withLock_(() => {
    const request = findRecord_(SHEETS.REQUESTS, "request_id", requestId);
    if (!request) throw new Error("Request not found.");
    if (request.status === "Accepted" && request.event_id) return findRecord_(SHEETS.EVENTS, "event_id", request.event_id);
    if (request.status === "Declined") throw new Error("Reopen the request before accepting it.");
    const now = new Date().toISOString();
    const event = {
      event_id: id_("evt"), request_id: request.request_id, event_name: request.event_name,
      event_type: request.event_type, school: request.school,
      client_display_name: request.requester, service_date: request.service_date,
      service_time: request.service_time, location: request.school,
      guest_count: positiveInteger_(request.guest_count, 0), service_format: request.service_format,
      requirements: request.requirements, allergens: request.allergens,
      learning_focus: "", safety_controls: "",
      menu_json: JSON.stringify(menuFromText_(request.requested_menu)), tasks_json: "[]",
      stage: "Draft", revision: 0, published_at: "", published_by: "",
      created_at: now, updated_at: now, updated_by: teacher.email
    };
    appendRecord_(SHEETS.EVENTS, event);
    updateRecord_(SHEETS.REQUESTS, "request_id", requestId, {
      status: "Accepted", event_id: event.event_id,
      internal_notes: clean_(reviewNote || request.internal_notes, 4000), updated_at: now
    });
    audit_(teacher.email, "accept", "request", requestId, { eventId: event.event_id });
    return event;
  });
}

function saveEvent(input) {
  const teacher = assertTeacher_();
  if (!input || !input.event_id) throw new Error("event_id is required.");
  return withLock_(() => {
    const existing = findRecord_(SHEETS.EVENTS, "event_id", input.event_id);
    if (!existing) throw new Error("Event not found.");
    const now = new Date().toISOString();
    const patch = {
      event_name: clean_(input.event_name, 200),
      event_type: clean_(input.event_type, 100),
      school: clean_(input.school, 100),
      client_display_name: clean_(input.client_display_name, 200),
      service_date: clean_(input.service_date, 20),
      service_time: clean_(input.service_time, 40),
      location: clean_(input.location, 200),
      guest_count: positiveInteger_(input.guest_count, 0),
      service_format: clean_(input.service_format, 200),
      requirements: clean_(input.requirements, 4000),
      allergens: clean_(input.allergens, 4000),
      learning_focus: clean_(input.learning_focus, 2000),
      safety_controls: clean_(input.safety_controls, 4000),
      menu_json: JSON.stringify(normalizeMenu_(input.menu)),
      tasks_json: JSON.stringify(normalizeTasks_(input.tasks)),
      stage: existing.published_at ? "Revised draft" : "Draft",
      updated_at: now,
      updated_by: teacher.email
    };
    updateRecord_(SHEETS.EVENTS, "event_id", input.event_id, patch);
    audit_(teacher.email, "update", "event", input.event_id, { stage: patch.stage });
    return findRecord_(SHEETS.EVENTS, "event_id", input.event_id);
  });
}

function publishEvent(eventId) {
  const teacher = assertTeacher_();
  return withLock_(() => {
    const event = findRecord_(SHEETS.EVENTS, "event_id", eventId);
    if (!event) throw new Error("Event not found.");
    const issues = publicationIssues_(event);
    if (issues.length) throw new Error(`Cannot publish: ${issues.join("; ")}`);
    const revision = Number(event.revision || 0) + 1;
    const publishedAt = new Date().toISOString();
    const publicEvent = sanitizePublicEvent_(Object.assign({}, event, { revision, published_at: publishedAt }));
    const publishedEvents = latestPublishedEvents_().filter(item => item.id !== publicEvent.id);
    publishedEvents.push(publicEvent);
    publishedEvents.sort((a, b) => String(a.serviceDate || "").localeCompare(String(b.serviceDate || "")));
    const publication = {
      publication_id: id_("pub"), event_id: eventId, revision,
      published_at: publishedAt, published_by: teacher.email,
      snapshot_json: JSON.stringify({
        schemaVersion: 1,
        revision,
        publishedAt,
        events: publishedEvents,
        yearArchive: []
      })
    };
    appendRecord_(SHEETS.PUBLICATIONS, publication);
    updateRecord_(SHEETS.EVENTS, "event_id", eventId, {
      stage: "Published", revision, published_at: publishedAt,
      published_by: teacher.email, updated_at: publishedAt, updated_by: teacher.email
    });
    audit_(teacher.email, "publish", "event", eventId, { revision, publicationId: publication.publication_id });
    return { ok: true, revision, publishedAt, snapshot: JSON.parse(publication.snapshot_json) };
  });
}

function generateEventDocument(eventId) {
  const teacher = assertTeacher_();
  const event = findRecord_(SHEETS.EVENTS, "event_id", eventId);
  if (!event) throw new Error("Event not found.");
  const doc = DocumentApp.create(`${event.event_name} · Event Order v${Number(event.revision || 0)}`);
  const body = doc.getBody();
  body.appendParagraph("GCSD CULINARY PATHWAY").setHeading(DocumentApp.ParagraphHeading.SUBTITLE);
  body.appendParagraph(event.event_name).setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph(`Event Order · ${event.stage} · Revision ${Number(event.revision || 0)}`);
  body.appendTable([
    ["Client", event.client_display_name || "Private event"],
    ["Service", [event.service_date, event.service_time].filter(Boolean).join(" at ")],
    ["Location", event.location || event.school || "Pending"],
    ["Guests / orders", String(event.guest_count || 0)],
    ["Format", event.service_format || "Pending"]
  ]);
  body.appendParagraph("Customer commitment").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(event.requirements || "No additional requirements recorded.");
  body.appendParagraph("Dietary needs and allergen controls").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(event.allergens || "No controls recorded.");
  body.appendParagraph("Learning focus").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(event.learning_focus || "No event-level learning focus recorded.");
  body.appendParagraph("Safety and sanitation controls").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(event.safety_controls || "Follow the approved kitchen safety and sanitation plan.");
  body.appendParagraph("Menu").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  parseJson_(event.menu_json, []).forEach(item => body.appendListItem(`${item.name}${item.required ? ` · ${item.required}` : ""}`));
  body.appendParagraph("Production assignments").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  parseJson_(event.tasks_json, []).forEach(task => {
    body.appendParagraph(`${task.teamLabel || "Team"} · ${task.station || "Station pending"} · ${task.name}`).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph([task.quantity, task.deadline, task.instructions].filter(Boolean).join(" · "));
    if (task.equipment && task.equipment.length) body.appendParagraph(`Equipment: ${task.equipment.join(", ")}`);
    if (task.qualityControls && task.qualityControls.length) body.appendParagraph(`Quality controls: ${task.qualityControls.join(" · ")}`);
    if (task.handoff) body.appendParagraph(`Handoff: ${task.handoff}`);
  });
  doc.saveAndClose();
  const folderId = PropertiesService.getScriptProperties().getProperty("DOCUMENT_FOLDER_ID");
  const file = DriveApp.getFileById(doc.getId());
  if (folderId) file.moveTo(DriveApp.getFolderById(folderId));
  const record = {
    document_id: id_("doc"), event_id: eventId, document_type: "Event Order",
    file_id: doc.getId(), file_url: doc.getUrl(), created_at: new Date().toISOString(), created_by: teacher.email
  };
  appendRecord_(SHEETS.DOCUMENTS, record);
  audit_(teacher.email, "generate", "document", record.document_id, { eventId, fileId: record.file_id });
  return record;
}

function sanitizePublicEvent_(event) {
  const tasks = normalizeTasks_(parseJson_(event.tasks_json, event.tasks || []));
  return {
    id: String(event.event_id || event.id || ""),
    name: clean_(event.event_name || event.name, 200),
    clientDisplayName: clean_(event.client_display_name || "Private event", 200),
    serviceDate: clean_(event.service_date, 20),
    serviceTime: clean_(event.service_time, 40),
    location: clean_(event.location || event.school, 200),
    guestCount: positiveInteger_(event.guest_count, 0),
    serviceFormat: clean_(event.service_format, 200),
    requirements: clean_(event.requirements, 4000),
    allergens: clean_(event.allergens, 4000),
    learningFocus: clean_(event.learning_focus, 2000),
    safetyControls: clean_(event.safety_controls, 4000),
    menu: normalizeMenu_(parseJson_(event.menu_json, event.menu || [])),
    tasks,
    stage: "Published",
    version: Number(event.revision || 0),
    publishedAt: event.published_at || ""
  };
}

function normalizeMenu_(menu) {
  const values = Array.isArray(menu) ? menu : menuFromText_(menu);
  return values.slice(0, 100).map(item => typeof item === "string" ? { name: clean_(item, 300), required: 0 } : ({
    name: clean_(item.name, 300), required: positiveInteger_(item.required, 0), portion: clean_(item.portion, 200)
  })).filter(item => item.name);
}

function normalizeTasks_(tasks) {
  if (!Array.isArray(tasks)) return [];
  return tasks.slice(0, 200).map((task, index) => ({
    id: clean_(task.id || `task-${index + 1}`, 100),
    teamLabel: clean_(task.teamLabel || task.team || "Team", 100),
    station: clean_(task.station, 100),
    name: clean_(task.name || task.product, 300),
    quantity: clean_(task.quantity || task.detail, 200),
    deadline: clean_(task.deadline, 100),
    instructions: clean_(task.instructions || task.studentDetails, 2000),
    equipment: list_(task.equipment, 30, 200),
    qualityControls: list_(task.qualityControls, 30, 300),
    handoff: clean_(task.handoff || task.dependency, 500)
  })).filter(task => task.name);
}

function publicationIssues_(event) {
  const issues = [];
  if (!String(event.event_name || "").trim()) issues.push("event name is missing");
  if (!String(event.client_display_name || "").trim()) issues.push("client display name is missing");
  if (!String(event.service_date || "").trim()) issues.push("service date is missing");
  if (!positiveInteger_(event.guest_count, 0)) issues.push("guest count must be greater than zero");
  if (!normalizeMenu_(parseJson_(event.menu_json, [])).length) issues.push("menu is empty");
  if (!normalizeTasks_(parseJson_(event.tasks_json, [])).length) issues.push("production assignments are empty");
  return issues;
}

function latestPublishedEvents_() {
  const latest = {};
  records_(SHEETS.PUBLICATIONS)
    .sort((a, b) => String(a.published_at).localeCompare(String(b.published_at)))
    .forEach(publication => {
      const snapshot = parseJson_(publication.snapshot_json, {});
      const event = Array.isArray(snapshot.events) ? snapshot.events.find(item => String(item.id) === String(publication.event_id)) : null;
      if (event) latest[publication.event_id] = event;
    });
  return Object.keys(latest).map(id => latest[id]);
}

function workbook_() {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!id) throw new Error("Run configureVerticalSlice() with the new GCSD Drive spreadsheet ID first.");
  return SpreadsheetApp.openById(id);
}

function assertTeacher_() {
  const email = String(Session.getActiveUser().getEmail() || "").toLowerCase();
  if (!email) throw new Error("Sign in with an authorized district Google account.");
  const props = PropertiesService.getScriptProperties();
  const allowlist = String(props.getProperty("ALLOWED_TEACHER_EMAILS") || "").split(",").map(value => value.trim()).filter(Boolean);
  const domain = String(props.getProperty("ALLOWED_DOMAIN") || "").trim();
  if (allowlist.length && !allowlist.includes(email)) throw new Error("This district account is not authorized for the Teacher Command Center.");
  if (!allowlist.length && domain && !email.endsWith(`@${domain}`)) throw new Error("A district Google account is required.");
  return { email };
}

function records_(sheetName) {
  const sheet = workbook_().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const headers = HEADERS[sheetName];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getDisplayValues().map((row, index) => {
    const record = { _row: index + 2 };
    headers.forEach((header, column) => { record[header] = row[column]; });
    return record;
  });
}

function appendRecord_(sheetName, record) {
  const sheet = workbook_().getSheetByName(sheetName);
  const values = HEADERS[sheetName].map(header => record[header] == null ? "" : record[header]);
  sheet.appendRow(values);
}

function findRecord_(sheetName, key, value) {
  return records_(sheetName).find(record => String(record[key]) === String(value)) || null;
}

function updateRecord_(sheetName, key, value, patch) {
  const record = findRecord_(sheetName, key, value);
  if (!record) throw new Error(`${sheetName} record not found.`);
  const headers = HEADERS[sheetName];
  const sheet = workbook_().getSheetByName(sheetName);
  const row = sheet.getRange(record._row, 1, 1, headers.length).getValues()[0];
  Object.keys(patch).forEach(field => { const column = headers.indexOf(field); if (column >= 0) row[column] = patch[field]; });
  sheet.getRange(record._row, 1, 1, headers.length).setValues([row]);
}

function withLock_(operation) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return operation(); } finally { lock.releaseLock(); }
}

function audit_(actor, action, recordType, recordId, detail) {
  appendRecord_(SHEETS.AUDIT, {
    audit_id: id_("audit"), occurred_at: new Date().toISOString(), actor,
    action, record_type: recordType, record_id: recordId,
    detail_json: JSON.stringify(detail || {})
  });
}

function id_(prefix) { return `${prefix}-${Utilities.getUuid()}`; }
function clean_(value, max) { return String(value == null ? "" : value).trim().slice(0, max || 1000); }
function positiveInteger_(value, fallback) { const number = Math.floor(Number(value)); return number > 0 ? number : Number(fallback || 0); }
function parseJson_(value, fallback) { try { return typeof value === "string" ? JSON.parse(value || "null") || fallback : (value || fallback); } catch (_) { return fallback; } }
function list_(value, limit, max) { const items = Array.isArray(value) ? value : String(value || "").split(/\n|,/); return items.map(item => clean_(item, max)).filter(Boolean).slice(0, limit); }
function menuFromText_(value) { return String(value || "").split(/\n|,/).map(name => ({ name: clean_(name, 300), required: 0 })).filter(item => item.name); }
function isoDate_(value) { if (!value) return ""; const date = value instanceof Date ? value : new Date(value); return Number.isNaN(date.getTime()) ? clean_(value, 20) : Utilities.formatDate(date, "America/New_York", "yyyy-MM-dd"); }
function googleId_(value, label) { const id = String(value || "").trim(); if (!/^[A-Za-z0-9_-]{20,}$/.test(id)) throw new Error(`${label} must be an ID copied from a Google URL, not the full URL.`); return id; }
function normalizeEmails_(value) { return [...new Set(String(value || "").toLowerCase().split(",").map(email => email.trim()).filter(Boolean))].map(email => { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Invalid allowed teacher email: ${email}`); return email; }); }
