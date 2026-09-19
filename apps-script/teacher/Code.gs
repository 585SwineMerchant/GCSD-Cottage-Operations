const SHEETS = Object.freeze({
  REQUESTS: "Requests",
  EVENTS: "Events",
  PUBLICATIONS: "Publications",
  DOCUMENTS: "Documents",
  AUDIT: "Audit",
  RECIPES: "Recipes",
  RECIPE_VERSIONS: "RecipeVersions",
  EVENT_RECIPES: "EventRecipes",
  PUBLICATION_ITEMS: "PublicationItems"
});

const REQUEST_REVIEW_STATUSES = Object.freeze(["New", "Under Review", "Needs Information", "Declined"]);
const EVENT_LIFECYCLE_STATUSES = Object.freeze(["Planning", "Ready", "Completed"]);
const PUBLICATION_STATUSES = Object.freeze(["Never published", "Published", "Revised draft", "Unpublished"]);

const HEADERS = Object.freeze({
  Requests: ["request_id", "submitted_at", "requester", "contact_name", "contact_email", "contact_phone", "event_name", "event_type", "school", "service_date", "service_time", "guest_count", "service_format", "requested_menu", "requirements", "allergens", "internal_notes", "status", "event_id", "updated_at"],
  Events: ["event_id", "request_id", "event_name", "event_type", "school", "client_display_name", "service_date", "service_time", "location", "guest_count", "service_format", "requirements", "allergens", "learning_focus", "safety_controls", "menu_json", "tasks_json", "stage", "revision", "published_at", "published_by", "created_at", "updated_at", "updated_by", "lifecycle_status", "publication_status", "unpublished_at", "unpublished_by", "archived_at", "archived_by", "source_event_id"],
  Publications: ["publication_id", "event_id", "revision", "published_at", "published_by", "snapshot_json", "action", "reason"],
  Documents: ["document_id", "event_id", "document_type", "file_id", "file_url", "created_at", "created_by"],
  Audit: ["audit_id", "occurred_at", "actor", "action", "record_type", "record_id", "detail_json"],
  Recipes: ["recipe_id", "name", "category", "status", "current_version", "standard_yield_quantity", "standard_yield_unit", "portion_size", "allergens", "competencies", "ingredients_json", "equipment_json", "procedure_json", "safety_controls", "quality_controls_json", "created_at", "created_by", "updated_at", "updated_by"],
  RecipeVersions: ["recipe_version_id", "recipe_id", "version", "status", "created_at", "created_by", "change_note", "snapshot_json"],
  EventRecipes: ["event_recipe_id", "event_id", "menu_item_name", "recipe_id", "recipe_version", "required_quantity", "overage_percent", "snapshot_json", "active", "attached_at", "attached_by", "updated_at", "updated_by"],
  PublicationItems: ["publication_item_id", "publication_id", "publication_sequence", "event_id", "event_json"]
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
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    } else {
      const width = typeof sheet.getLastColumn === "function" ? sheet.getLastColumn() : headers.length;
      const actual = sheet.getRange(1, 1, 1, Math.max(width, 1)).getValues()[0];
      while (actual.length && !String(actual[actual.length - 1] || "").trim()) actual.pop();
      const prefixMatches = actual.every((header, index) => header === headers[index]);
      if (!prefixMatches || actual.length > headers.length) {
        throw new Error(`${name} has unexpected columns. Expected the managed columns in their original order.`);
      }
      if (actual.length < headers.length) {
        const missing = headers.slice(actual.length);
        sheet.getRange(1, actual.length + 1, 1, missing.length).setValues([missing]);
      }
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
  const events = records_(SHEETS.EVENTS)
    .map(event => enrichEvent_(event))
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  const publications = records_(SHEETS.PUBLICATIONS)
    .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)))
    .map(({ snapshot_json, ...publication }) => publication);
  return {
    teacher,
    requests: records_(SHEETS.REQUESTS).sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at))),
    events,
    publications,
    documents: records_(SHEETS.DOCUMENTS).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    recipes: recipeSummaries_(),
    summary: dashboardSummary_(events)
  };
}

function getEventWorkspace(eventId) {
  assertTeacher_();
  const event = findRecord_(SHEETS.EVENTS, "event_id", eventId);
  if (!event) throw new Error("Event not found.");
  const publications = records_(SHEETS.PUBLICATIONS)
    .filter(item => String(item.event_id) === String(eventId))
    .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)))
    .map(({ snapshot_json, ...item }) => item);
  return {
    event: enrichEvent_(event),
    sourceRequest: event.request_id ? findRecord_(SHEETS.REQUESTS, "request_id", event.request_id) : null,
    documents: records_(SHEETS.DOCUMENTS).filter(item => String(item.event_id) === String(eventId)),
    eventRecipes: eventRecipeRecords_(eventId).map(enrichEventRecipe_),
    approvedRecipes: recipeSummaries_().filter(item => item.status === "Approved"),
    publications,
    audit: records_(SHEETS.AUDIT)
      .filter(item => String(item.record_id) === String(eventId) || String(parseJson_(item.detail_json, {}).eventId || "") === String(eventId))
      .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)))
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

function getRecipeLibrary() {
  assertTeacher_();
  return recipeSummaries_();
}

function getRecipe(recipeId) {
  assertTeacher_();
  const recipe = findRecord_(SHEETS.RECIPES, "recipe_id", recipeId);
  if (!recipe) throw new Error("Recipe not found.");
  return {
    recipe: enrichRecipe_(recipe),
    versions: records_(SHEETS.RECIPE_VERSIONS)
      .filter(item => String(item.recipe_id) === String(recipeId))
      .sort((a, b) => Number(b.version || 0) - Number(a.version || 0))
      .map(({ snapshot_json, ...item }) => item)
  };
}

function saveRecipe(input) {
  const teacher = assertTeacher_();
  if (!input) throw new Error("Recipe data is required.");
  return withLock_(() => {
    const existing = input.recipe_id ? findRecord_(SHEETS.RECIPES, "recipe_id", input.recipe_id) : null;
    if (input.recipe_id && !existing) throw new Error("Recipe not found.");
    if (existing && existing.status === "Archived") throw new Error("Restore this recipe before editing it.");
    const normalized = normalizeRecipeInput_(input);
    if (!normalized.name) throw new Error("Recipe name is required.");
    const now = new Date().toISOString();
    const recipeId = existing ? existing.recipe_id : id_("rcp");
    const version = Number(existing && existing.current_version || 0) + 1;
    const record = Object.assign({}, normalized, {
      recipe_id: recipeId, status: "Draft", current_version: version,
      created_at: existing ? existing.created_at : now,
      created_by: existing ? existing.created_by : teacher.email,
      updated_at: now, updated_by: teacher.email
    });
    const snapshot = recipeSnapshotFromRecord_(record, version, "Draft");
    appendRecord_(SHEETS.RECIPE_VERSIONS, {
      recipe_version_id: id_("rcpv"), recipe_id: recipeId, version, status: "Draft",
      created_at: now, created_by: teacher.email, change_note: clean_(input.change_note || "Draft saved", 1000),
      snapshot_json: JSON.stringify(snapshot)
    });
    if (existing) updateRecord_(SHEETS.RECIPES, "recipe_id", recipeId, record);
    else appendRecord_(SHEETS.RECIPES, record);
    audit_(teacher.email, existing ? "update" : "create", "recipe", recipeId, { version, status: "Draft" });
    return enrichRecipe_(findRecord_(SHEETS.RECIPES, "recipe_id", recipeId));
  });
}

function approveRecipe(recipeId, note) {
  const teacher = assertTeacher_();
  return withLock_(() => {
    const recipe = findRecord_(SHEETS.RECIPES, "recipe_id", recipeId);
    if (!recipe) throw new Error("Recipe not found.");
    if (recipe.status === "Archived") throw new Error("Restore this recipe before approving it.");
    const issues = recipeApprovalIssues_(recipe);
    if (issues.length) throw new Error(`Cannot approve recipe: ${issues.join("; ")}`);
    if (recipe.status === "Approved") throw new Error("This recipe version is already approved.");
    const version = Number(recipe.current_version || 0) + 1;
    const now = new Date().toISOString();
    const snapshot = recipeSnapshotFromRecord_(recipe, version, "Approved");
    appendRecord_(SHEETS.RECIPE_VERSIONS, {
      recipe_version_id: id_("rcpv"), recipe_id: recipeId, version, status: "Approved",
      created_at: now, created_by: teacher.email, change_note: clean_(note || "Approved for event use", 1000),
      snapshot_json: JSON.stringify(snapshot)
    });
    updateRecord_(SHEETS.RECIPES, "recipe_id", recipeId, {
      status: "Approved", current_version: version, updated_at: now, updated_by: teacher.email
    });
    audit_(teacher.email, "approve", "recipe", recipeId, { version, note: clean_(note, 1000) });
    return enrichRecipe_(findRecord_(SHEETS.RECIPES, "recipe_id", recipeId));
  });
}

function archiveRecipe(recipeId, reason) {
  const teacher = assertTeacher_();
  const explanation = clean_(reason, 1000);
  if (!explanation) throw new Error("An archive reason is required.");
  return withLock_(() => {
    const recipe = findRecord_(SHEETS.RECIPES, "recipe_id", recipeId);
    if (!recipe) throw new Error("Recipe not found.");
    if (recipe.status === "Archived") return enrichRecipe_(recipe);
    const now = new Date().toISOString();
    updateRecord_(SHEETS.RECIPES, "recipe_id", recipeId, { status: "Archived", updated_at: now, updated_by: teacher.email });
    audit_(teacher.email, "archive", "recipe", recipeId, { reason: explanation, version: Number(recipe.current_version || 0) });
    return enrichRecipe_(findRecord_(SHEETS.RECIPES, "recipe_id", recipeId));
  });
}

function restoreRecipe(recipeId) {
  const teacher = assertTeacher_();
  return withLock_(() => {
    const recipe = findRecord_(SHEETS.RECIPES, "recipe_id", recipeId);
    if (!recipe) throw new Error("Recipe not found.");
    if (recipe.status !== "Archived") throw new Error("Only an archived recipe can be restored.");
    const now = new Date().toISOString();
    updateRecord_(SHEETS.RECIPES, "recipe_id", recipeId, { status: "Draft", updated_at: now, updated_by: teacher.email });
    audit_(teacher.email, "restore", "recipe", recipeId, { version: Number(recipe.current_version || 0) });
    return enrichRecipe_(findRecord_(SHEETS.RECIPES, "recipe_id", recipeId));
  });
}

function attachRecipeToEvent(eventId, recipeId, menuItemName, requiredQuantity, overagePercent) {
  const teacher = assertTeacher_();
  return withLock_(() => {
    const event = findRecord_(SHEETS.EVENTS, "event_id", eventId);
    if (!event) throw new Error("Event not found.");
    if (eventLifecycle_(event) === "Archived") throw new Error("Restore this event before attaching recipes.");
    const recipe = findRecord_(SHEETS.RECIPES, "recipe_id", recipeId);
    if (!recipe || recipe.status !== "Approved") throw new Error("Choose a currently approved recipe.");
    const itemName = clean_(menuItemName, 300);
    const menu = normalizeMenu_(parseJson_(event.menu_json, []));
    const menuItem = menu.find(item => String(item.name).toLowerCase() === itemName.toLowerCase());
    if (!menuItem) throw new Error("Save this menu item on the event before attaching a recipe.");
    const required = positiveNumber_(requiredQuantity || menuItem.required || event.guest_count, 0);
    if (!required) throw new Error("Required production quantity must be greater than zero.");
    const overage = boundedNumber_(overagePercent, 0, 100, 0);
    const now = new Date().toISOString();
    const existing = eventRecipeRecords_(eventId, true).find(item => String(item.menu_item_name).toLowerCase() === itemName.toLowerCase());
    const record = {
      event_recipe_id: existing ? existing.event_recipe_id : id_("er"), event_id: eventId,
      menu_item_name: menuItem.name, recipe_id: recipeId, recipe_version: Number(recipe.current_version || 0),
      required_quantity: required, overage_percent: overage,
      snapshot_json: JSON.stringify(recipeSnapshotFromRecord_(recipe, Number(recipe.current_version || 0), "Approved")),
      active: "TRUE", attached_at: existing ? existing.attached_at : now,
      attached_by: existing ? existing.attached_by : teacher.email, updated_at: now, updated_by: teacher.email
    };
    if (existing) updateRecord_(SHEETS.EVENT_RECIPES, "event_recipe_id", existing.event_recipe_id, record);
    else appendRecord_(SHEETS.EVENT_RECIPES, record);
    markEventOperationalChange_(event, teacher.email);
    audit_(teacher.email, existing ? "refresh_recipe" : "attach_recipe", "event", eventId, { eventRecipeId: record.event_recipe_id, recipeId, recipeVersion: record.recipe_version, menuItemName: record.menu_item_name });
    return enrichEventRecipe_(findRecord_(SHEETS.EVENT_RECIPES, "event_recipe_id", record.event_recipe_id));
  });
}

function detachRecipeFromEvent(eventRecipeId, reason) {
  const teacher = assertTeacher_();
  const explanation = clean_(reason, 1000);
  if (!explanation) throw new Error("A reason is required to detach a recipe.");
  return withLock_(() => {
    const attachment = findRecord_(SHEETS.EVENT_RECIPES, "event_recipe_id", eventRecipeId);
    if (!attachment || String(attachment.active).toUpperCase() === "FALSE") throw new Error("Event recipe attachment not found.");
    const event = findRecord_(SHEETS.EVENTS, "event_id", attachment.event_id);
    if (!event) throw new Error("Event not found.");
    if (eventLifecycle_(event) === "Archived") throw new Error("Restore this event before detaching recipes.");
    const now = new Date().toISOString();
    updateRecord_(SHEETS.EVENT_RECIPES, "event_recipe_id", eventRecipeId, { active: "FALSE", updated_at: now, updated_by: teacher.email });
    markEventOperationalChange_(event, teacher.email);
    audit_(teacher.email, "detach_recipe", "event", event.event_id, { eventRecipeId, recipeId: attachment.recipe_id, reason: explanation });
    return { ok: true };
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
      created_at: now, updated_at: now, updated_by: teacher.email,
      lifecycle_status: "Planning", publication_status: "Never published",
      unpublished_at: "", unpublished_by: "", archived_at: "", archived_by: "", source_event_id: ""
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
    if (eventLifecycle_(existing) === "Archived") throw new Error("Restore this event before editing it.");
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
      tasks_json: JSON.stringify(normalizeTasks_(input.tasks))
    };
    const changed = Object.keys(patch).some(field => String(existing[field] || "") !== String(patch[field] || ""));
    if (!changed) return existing;
    const currentPublication = publicationStatus_(existing);
    patch.publication_status = currentPublication === "Published" ? "Revised draft" : currentPublication;
    patch.stage = displayStage_(eventLifecycle_(existing), patch.publication_status);
    patch.updated_at = now;
    patch.updated_by = teacher.email;
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
    if (eventLifecycle_(event) === "Archived") throw new Error("Restore this event before publishing it.");
    if (publicationStatus_(event) === "Published" && event.stage === "Published") {
      throw new Error("This published revision is already current. Make a change before publishing a new revision.");
    }
    const issues = publicationIssues_(event);
    if (issues.length) throw new Error(`Cannot publish: ${issues.join("; ")}`);
    const revision = Number(event.revision || 0) + 1;
    const publishedAt = new Date().toISOString();
    const publicEvent = sanitizePublicEvent_(Object.assign({}, event, { revision, published_at: publishedAt }), eventRecipeRecords_(eventId));
    const publishedEvents = latestSnapshot_().events.filter(item => item.id !== publicEvent.id);
    publishedEvents.push(publicEvent);
    publishedEvents.sort((a, b) => String(a.serviceDate || "").localeCompare(String(b.serviceDate || "")));
    const publicationSequence = records_(SHEETS.PUBLICATIONS).length + 1;
    const action = publicationStatus_(event) === "Unpublished" ? "republish" : (Number(event.revision || 0) ? "revise" : "publish");
    const publicationId = id_("pub");
    const fullSnapshot = {
      schemaVersion: 3, revision: publicationSequence, publicationSequence,
      publishedAt, events: publishedEvents, yearArchive: [], action
    };
    const publication = {
      publication_id: publicationId, event_id: eventId, revision,
      published_at: publishedAt, published_by: teacher.email,
      snapshot_json: persistPublicationItems_(publicationId, publicationSequence, fullSnapshot),
      action, reason: ""
    };
    assertSnapshotFits_(publication.snapshot_json);
    appendRecord_(SHEETS.PUBLICATIONS, publication);
    updateRecord_(SHEETS.EVENTS, "event_id", eventId, {
      stage: "Published", revision, published_at: publishedAt,
      published_by: teacher.email, publication_status: "Published",
      unpublished_at: "", unpublished_by: "", updated_at: publishedAt, updated_by: teacher.email
    });
    audit_(teacher.email, action, "event", eventId, { revision, publicationId: publication.publication_id });
    return { ok: true, revision, publishedAt, snapshot: fullSnapshot };
  });
}

function getPublicationPreview(eventId) {
  assertTeacher_();
  const event = findRecord_(SHEETS.EVENTS, "event_id", eventId);
  if (!event) throw new Error("Event not found.");
  return {
    event: sanitizePublicEvent_(event, eventRecipeRecords_(eventId)),
    issues: publicationIssues_(event),
    nextRevision: Number(event.revision || 0) + 1,
    excluded: ["request contact information", "private review notes", "budgets and supplier data", "student identities and academic records", "staff audit details"]
  };
}

function unpublishEvent(eventId, reason) {
  const teacher = assertTeacher_();
  const explanation = clean_(reason, 1000);
  if (!explanation) throw new Error("A reason is required to remove an event from the student site.");
  return withLock_(() => {
    const event = findRecord_(SHEETS.EVENTS, "event_id", eventId);
    if (!event) throw new Error("Event not found.");
    if (publicationStatus_(event) !== "Published") throw new Error("Only a currently published event can be removed from the student site.");
    const changedAt = new Date().toISOString();
    const snapshot = latestSnapshot_();
    const publishedEvents = snapshot.events.filter(item => String(item.id) !== String(eventId));
    const publicationSequence = records_(SHEETS.PUBLICATIONS).length + 1;
    const publicationId = id_("pub");
    const fullSnapshot = {
      schemaVersion: 3, revision: publicationSequence, publicationSequence,
      publishedAt: changedAt, events: publishedEvents, yearArchive: [], action: "unpublish"
    };
    const publication = {
      publication_id: publicationId, event_id: eventId, revision: Number(event.revision || 0),
      published_at: changedAt, published_by: teacher.email,
      snapshot_json: persistPublicationItems_(publicationId, publicationSequence, fullSnapshot),
      action: "unpublish", reason: explanation
    };
    assertSnapshotFits_(publication.snapshot_json);
    appendRecord_(SHEETS.PUBLICATIONS, publication);
    updateRecord_(SHEETS.EVENTS, "event_id", eventId, {
      stage: "Unpublished", publication_status: "Unpublished",
      unpublished_at: changedAt, unpublished_by: teacher.email,
      updated_at: changedAt, updated_by: teacher.email
    });
    audit_(teacher.email, "unpublish", "event", eventId, { reason: explanation, publicationId: publication.publication_id });
    return { ok: true, unpublishedAt: changedAt, snapshot: fullSnapshot };
  });
}

function setEventLifecycle(eventId, lifecycleStatus) {
  const teacher = assertTeacher_();
  const status = clean_(lifecycleStatus, 100);
  if (!EVENT_LIFECYCLE_STATUSES.includes(status)) throw new Error("Invalid event lifecycle status.");
  return withLock_(() => {
    const event = findRecord_(SHEETS.EVENTS, "event_id", eventId);
    if (!event) throw new Error("Event not found.");
    if (eventLifecycle_(event) === "Archived") throw new Error("Restore this event before changing its status.");
    if (status === "Ready") {
      const issues = publicationIssues_(event);
      if (issues.length) throw new Error(`Cannot mark ready: ${issues.join("; ")}`);
    }
    const now = new Date().toISOString();
    const publicationStatus = publicationStatus_(event);
    updateRecord_(SHEETS.EVENTS, "event_id", eventId, {
      lifecycle_status: status,
      stage: displayStage_(status, publicationStatus),
      updated_at: now, updated_by: teacher.email
    });
    audit_(teacher.email, "lifecycle", "event", eventId, { lifecycleStatus: status });
    return enrichEvent_(findRecord_(SHEETS.EVENTS, "event_id", eventId));
  });
}

function archiveEvent(eventId, reason) {
  const teacher = assertTeacher_();
  const explanation = clean_(reason, 1000);
  if (!explanation) throw new Error("An archive reason is required.");
  return withLock_(() => {
    const event = findRecord_(SHEETS.EVENTS, "event_id", eventId);
    if (!event) throw new Error("Event not found.");
    if (publicationStatus_(event) === "Published") throw new Error("Remove this event from the student site before archiving it.");
    if (eventLifecycle_(event) === "Archived") return enrichEvent_(event);
    const now = new Date().toISOString();
    updateRecord_(SHEETS.EVENTS, "event_id", eventId, {
      lifecycle_status: "Archived", stage: "Archived", archived_at: now,
      archived_by: teacher.email, updated_at: now, updated_by: teacher.email
    });
    audit_(teacher.email, "archive", "event", eventId, { reason: explanation });
    return enrichEvent_(findRecord_(SHEETS.EVENTS, "event_id", eventId));
  });
}

function restoreEvent(eventId) {
  const teacher = assertTeacher_();
  return withLock_(() => {
    const event = findRecord_(SHEETS.EVENTS, "event_id", eventId);
    if (!event) throw new Error("Event not found.");
    if (eventLifecycle_(event) !== "Archived") throw new Error("Only an archived event can be restored.");
    const now = new Date().toISOString();
    const publicationStatus = publicationStatus_(event);
    updateRecord_(SHEETS.EVENTS, "event_id", eventId, {
      lifecycle_status: "Planning", stage: displayStage_("Planning", publicationStatus),
      archived_at: "", archived_by: "", updated_at: now, updated_by: teacher.email
    });
    audit_(teacher.email, "restore", "event", eventId, {});
    return enrichEvent_(findRecord_(SHEETS.EVENTS, "event_id", eventId));
  });
}

function cloneEvent(eventId) {
  const teacher = assertTeacher_();
  return withLock_(() => {
    const source = findRecord_(SHEETS.EVENTS, "event_id", eventId);
    if (!source) throw new Error("Event not found.");
    const now = new Date().toISOString();
    const clone = {};
    HEADERS.Events.forEach(field => { clone[field] = source[field] || ""; });
    Object.assign(clone, {
      event_id: id_("evt"), request_id: "", event_name: `${source.event_name} (Copy)`, service_date: "",
      stage: "Draft", revision: 0, published_at: "", published_by: "", created_at: now,
      updated_at: now, updated_by: teacher.email, lifecycle_status: "Planning",
      publication_status: "Never published", unpublished_at: "", unpublished_by: "",
      archived_at: "", archived_by: "", source_event_id: source.event_id
    });
    appendRecord_(SHEETS.EVENTS, clone);
    audit_(teacher.email, "clone", "event", clone.event_id, { sourceEventId: source.event_id });
    return enrichEvent_(clone);
  });
}

function generateEventDocument(eventId) {
  const teacher = assertTeacher_();
  const event = findRecord_(SHEETS.EVENTS, "event_id", eventId);
  if (!event) throw new Error("Event not found.");
  if (eventLifecycle_(event) === "Archived") throw new Error("Restore this event before generating documents.");
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
  const eventRecipes = eventRecipeRecords_(eventId).map(enrichEventRecipe_);
  if (eventRecipes.length) {
    body.appendParagraph("Scaled approved recipes").setHeading(DocumentApp.ParagraphHeading.HEADING1);
    eventRecipes.forEach(attachment => {
      const recipe = attachment.scaled_recipe;
      body.appendParagraph(`${attachment.menu_item_name} · ${recipe.name} · Version ${attachment.recipe_version}`).setHeading(DocumentApp.ParagraphHeading.HEADING2);
      body.appendParagraph(`Production target: ${recipe.yield}${recipe.portion ? ` · Portion: ${recipe.portion}` : ""}`);
      body.appendParagraph("Ingredients").setHeading(DocumentApp.ParagraphHeading.HEADING2);
      recipe.ingredients.forEach(item => body.appendListItem(item));
      body.appendParagraph("Procedure").setHeading(DocumentApp.ParagraphHeading.HEADING2);
      recipe.procedure.forEach(step => body.appendListItem(step));
      if (recipe.equipment.length) body.appendParagraph(`Equipment: ${recipe.equipment.join(", ")}`);
      if (recipe.qualityControls.length) body.appendParagraph(`Quality controls: ${recipe.qualityControls.join(" · ")}`);
      if (recipe.allergens) body.appendParagraph(`Allergens: ${recipe.allergens}`);
      if (recipe.safetyControls) body.appendParagraph(`Safety: ${recipe.safetyControls}`);
    });
  }
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

function sanitizePublicEvent_(event, eventRecipes) {
  const attachments = (Array.isArray(eventRecipes) ? eventRecipes : []).map(enrichEventRecipe_);
  const tasks = normalizeTasks_(parseJson_(event.tasks_json, event.tasks || []));
  const menu = normalizeMenu_(parseJson_(event.menu_json, event.menu || [])).map(item => {
    const attachment = attachments.find(value => String(value.menu_item_name).toLowerCase() === String(item.name).toLowerCase());
    return attachment ? Object.assign({}, item, { recipeVersion: Number(attachment.recipe_version || 0), hasApprovedRecipe: true, recipe: attachment.scaled_recipe }) : item;
  });
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
    menu,
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

function normalizeRecipeInput_(input) {
  const ingredients = Array.isArray(input.ingredients) ? input.ingredients : [];
  return {
    name: clean_(input.name, 300), category: clean_(input.category, 100),
    standard_yield_quantity: positiveNumber_(input.standard_yield_quantity, 0),
    standard_yield_unit: clean_(input.standard_yield_unit, 100), portion_size: clean_(input.portion_size, 200),
    allergens: clean_(input.allergens, 2000), competencies: clean_(input.competencies, 2000),
    ingredients_json: JSON.stringify(ingredients.slice(0, 200).map(item => ({
      name: clean_(item && item.name, 300), quantity: positiveNumber_(item && item.quantity, 0),
      unit: clean_(item && item.unit, 100), preparation: clean_(item && item.preparation, 300)
    })).filter(item => item.name)),
    equipment_json: JSON.stringify(list_(input.equipment, 100, 200)),
    procedure_json: JSON.stringify(list_(input.procedure, 200, 1000)),
    safety_controls: clean_(input.safety_controls, 4000),
    quality_controls_json: JSON.stringify(list_(input.quality_controls, 100, 500))
  };
}

function recipeSnapshotFromRecord_(recipe, version, status) {
  return {
    schemaVersion: 1, recipeId: String(recipe.recipe_id || ""), version: Number(version || recipe.current_version || 0),
    status: status || recipe.status || "Draft", name: clean_(recipe.name, 300), category: clean_(recipe.category, 100),
    standardYieldQuantity: positiveNumber_(recipe.standard_yield_quantity, 0),
    standardYieldUnit: clean_(recipe.standard_yield_unit, 100), portionSize: clean_(recipe.portion_size, 200),
    allergens: clean_(recipe.allergens, 2000), competencies: clean_(recipe.competencies, 2000),
    ingredients: normalizeRecipeIngredients_(parseJson_(recipe.ingredients_json, [])),
    equipment: list_(parseJson_(recipe.equipment_json, []), 100, 200),
    procedure: list_(parseJson_(recipe.procedure_json, []), 200, 1000),
    safetyControls: clean_(recipe.safety_controls, 4000),
    qualityControls: list_(parseJson_(recipe.quality_controls_json, []), 100, 500)
  };
}

function normalizeRecipeIngredients_(ingredients) {
  if (!Array.isArray(ingredients)) return [];
  return ingredients.slice(0, 200).map(item => ({
    name: clean_(item && item.name, 300), quantity: positiveNumber_(item && item.quantity, 0),
    unit: clean_(item && item.unit, 100), preparation: clean_(item && item.preparation, 300)
  })).filter(item => item.name);
}

function recipeApprovalIssues_(recipe) {
  const issues = [];
  if (!String(recipe.name || "").trim()) issues.push("name is missing");
  if (!positiveNumber_(recipe.standard_yield_quantity, 0)) issues.push("standard yield must be greater than zero");
  if (!String(recipe.standard_yield_unit || "").trim()) issues.push("yield unit is missing");
  if (!normalizeRecipeIngredients_(parseJson_(recipe.ingredients_json, [])).length) issues.push("ingredients are empty");
  if (!list_(parseJson_(recipe.procedure_json, []), 200, 1000).length) issues.push("procedure is empty");
  return issues;
}

function enrichRecipe_(recipe) {
  return Object.assign({}, recipe, {
    ingredients: normalizeRecipeIngredients_(parseJson_(recipe.ingredients_json, [])),
    equipment: list_(parseJson_(recipe.equipment_json, []), 100, 200),
    procedure: list_(parseJson_(recipe.procedure_json, []), 200, 1000),
    quality_controls: list_(parseJson_(recipe.quality_controls_json, []), 100, 500),
    approval_issues: recipeApprovalIssues_(recipe)
  });
}

function recipeSummaries_() {
  return records_(SHEETS.RECIPES).map(recipe => ({
    recipe_id: recipe.recipe_id, name: recipe.name, category: recipe.category, status: recipe.status,
    current_version: Number(recipe.current_version || 0), standard_yield_quantity: positiveNumber_(recipe.standard_yield_quantity, 0),
    standard_yield_unit: recipe.standard_yield_unit, portion_size: recipe.portion_size, allergens: recipe.allergens,
    updated_at: recipe.updated_at, approval_issues: recipeApprovalIssues_(recipe)
  })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function eventRecipeRecords_(eventId, includeInactive) {
  return records_(SHEETS.EVENT_RECIPES).filter(item => String(item.event_id) === String(eventId) && (includeInactive || String(item.active || "TRUE").toUpperCase() !== "FALSE"));
}

function enrichEventRecipe_(attachment) {
  return Object.assign({}, attachment, { scaled_recipe: scaleRecipeSnapshot_(attachment) });
}

function scaleRecipeSnapshot_(attachment) {
  const recipe = parseJson_(attachment.snapshot_json, {});
  const standardYield = positiveNumber_(recipe.standardYieldQuantity, 0);
  const required = positiveNumber_(attachment.required_quantity, 0);
  const overage = boundedNumber_(attachment.overage_percent, 0, 100, 0);
  const productionTarget = required * (1 + overage / 100);
  const factor = standardYield ? productionTarget / standardYield : 0;
  const ingredients = normalizeRecipeIngredients_(recipe.ingredients || []).map(item => {
    const scaled = roundQuantity_(item.quantity * factor);
    return [scaled || "", item.unit, item.name, item.preparation ? `(${item.preparation})` : ""].filter(value => value !== "").join(" ");
  });
  return {
    name: clean_(recipe.name, 300), version: Number(recipe.version || attachment.recipe_version || 0),
    yield: `${roundQuantity_(productionTarget)} ${clean_(recipe.standardYieldUnit, 100)}`.trim(),
    portion: clean_(recipe.portionSize, 200), ingredients,
    equipment: list_(recipe.equipment, 100, 200), procedure: list_(recipe.procedure, 200, 1000),
    allergens: clean_(recipe.allergens, 2000), safetyControls: clean_(recipe.safetyControls, 4000),
    qualityControls: list_(recipe.qualityControls, 100, 500), competencies: clean_(recipe.competencies, 2000),
    scaleFactor: roundQuantity_(factor), overagePercent: overage
  };
}

function markEventOperationalChange_(event, actor) {
  const currentPublication = publicationStatus_(event);
  const nextPublication = currentPublication === "Published" ? "Revised draft" : currentPublication;
  const now = new Date().toISOString();
  updateRecord_(SHEETS.EVENTS, "event_id", event.event_id, {
    publication_status: nextPublication, stage: displayStage_(eventLifecycle_(event), nextPublication),
    updated_at: now, updated_by: actor
  });
}

function publicationIssues_(event) {
  return validateEventForPublication_(event).issues.map(issue => issue.message);
}

function validateEventForPublication(eventId) {
  assertTeacher_();
  const event = findRecord_(SHEETS.EVENTS, "event_id", eventId);
  if (!event) throw new Error("Event not found.");
  return validateEventForPublication_(event);
}

function validateEventForPublication_(event) {
  const issues = [];
  const warnings = [];
  const issue = (code, field, message) => issues.push({ code, field, message });
  const warn = (code, field, message) => warnings.push({ code, field, message });
  if (eventLifecycle_(event) === "Archived") issue("archived", "lifecycle_status", "event is archived");
  if (!String(event.event_name || "").trim()) issue("missing_event_name", "event_name", "event name is missing");
  if (!String(event.client_display_name || "").trim()) issue("missing_client_name", "client_display_name", "client display name is missing");
  if (!String(event.service_date || "").trim()) issue("missing_service_date", "service_date", "service date is missing");
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(String(event.service_date))) issue("invalid_service_date", "service_date", "service date must use YYYY-MM-DD");
  if (!positiveInteger_(event.guest_count, 0)) issue("invalid_guest_count", "guest_count", "guest count must be greater than zero");
  const menu = normalizeMenu_(parseJson_(event.menu_json, []));
  const tasks = normalizeTasks_(parseJson_(event.tasks_json, []));
  if (!menu.length) issue("missing_menu", "menu_text", "menu is empty");
  if (!tasks.length) issue("missing_tasks", "tasks_text", "production assignments are empty");
  if (!String(event.service_time || "").trim()) warn("missing_service_time", "service_time", "Service time has not been recorded.");
  if (!String(event.location || event.school || "").trim()) warn("missing_location", "location", "Service location has not been recorded.");
  if (!String(event.learning_focus || "").trim()) warn("missing_learning_focus", "learning_focus", "Learning focus has not been recorded.");
  if (!String(event.safety_controls || "").trim()) warn("missing_safety_controls", "safety_controls", "Safety and sanitation controls have not been recorded.");
  if (!String(event.allergens || "").trim()) warn("missing_allergen_statement", "allergens", "An allergen statement has not been recorded.");
  return { valid: issues.length === 0, issues, warnings };
}

function latestSnapshot_() {
  const publications = records_(SHEETS.PUBLICATIONS)
    .sort((a, b) => String(a.published_at).localeCompare(String(b.published_at)) || Number(a._row || 0) - Number(b._row || 0));
  if (!publications.length) return { schemaVersion: 2, revision: 0, publicationSequence: 0, publishedAt: "", events: [], yearArchive: [] };
  const snapshot = parseJson_(publications[publications.length - 1].snapshot_json, {});
  if (snapshot && snapshot.storage === "PublicationItems" && snapshot.publicationId) {
    const events = records_(SHEETS.PUBLICATION_ITEMS)
      .filter(item => String(item.publication_id) === String(snapshot.publicationId))
      .map(item => parseJson_(item.event_json, null))
      .filter(Boolean);
    if (events.length !== Number(snapshot.eventCount || 0)) throw new Error("The latest publication item snapshot is incomplete. Publishing has been stopped to preserve the current student view.");
    return Object.assign({}, snapshot, { events });
  }
  return snapshot && Array.isArray(snapshot.events) ? snapshot : { schemaVersion: 2, revision: 0, publicationSequence: 0, publishedAt: "", events: [], yearArchive: [] };
}

function persistPublicationItems_(publicationId, publicationSequence, fullSnapshot) {
  (fullSnapshot.events || []).forEach(event => {
    const json = JSON.stringify(event);
    assertSnapshotFits_(json);
    appendRecord_(SHEETS.PUBLICATION_ITEMS, {
      publication_item_id: id_("pubitem"), publication_id: publicationId,
      publication_sequence: publicationSequence, event_id: event.id, event_json: json
    });
  });
  return JSON.stringify({
    schemaVersion: 3, revision: publicationSequence, publicationSequence,
    publishedAt: fullSnapshot.publishedAt, events: [], yearArchive: fullSnapshot.yearArchive || [],
    action: fullSnapshot.action || "publish", storage: "PublicationItems", publicationId,
    eventCount: (fullSnapshot.events || []).length
  });
}

function eventLifecycle_(event) {
  const value = String(event.lifecycle_status || "");
  if (["Planning", "Ready", "Completed", "Archived"].includes(value)) return value;
  if (String(event.stage) === "Archived") return "Archived";
  if (String(event.stage) === "Completed") return "Completed";
  if (String(event.stage) === "Ready") return "Ready";
  return "Planning";
}

function publicationStatus_(event) {
  const value = String(event.publication_status || "");
  if (PUBLICATION_STATUSES.includes(value)) return value;
  if (String(event.stage) === "Revised draft") return "Revised draft";
  if (String(event.stage) === "Unpublished") return "Unpublished";
  if (String(event.stage) === "Published") return "Published";
  return event.published_at ? "Published" : "Never published";
}

function displayStage_(lifecycleStatus, publicationStatus) {
  if (lifecycleStatus === "Archived") return "Archived";
  if (["Published", "Revised draft", "Unpublished"].includes(publicationStatus)) return publicationStatus;
  if (["Ready", "Completed"].includes(lifecycleStatus)) return lifecycleStatus;
  return "Draft";
}

function enrichEvent_(event) {
  const validation = validateEventForPublication_(event);
  return Object.assign({}, event, {
    lifecycle_status: eventLifecycle_(event),
    publication_status: publicationStatus_(event),
    publication_issues: validation.issues,
    publication_warnings: validation.warnings
  });
}

function dashboardSummary_(events) {
  const requests = records_(SHEETS.REQUESTS);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const soon = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
  return {
    openRequests: requests.filter(item => !["Accepted", "Declined"].includes(item.status)).length,
    needsInformation: requests.filter(item => item.status === "Needs Information").length,
    upcoming: events.filter(item => {
      if (item.lifecycle_status === "Archived" || !item.service_date) return false;
      const date = new Date(`${item.service_date}T00:00:00`);
      return !Number.isNaN(date.getTime()) && date >= today && date <= soon;
    }).length,
    attention: events.filter(item => item.lifecycle_status !== "Archived" && item.publication_issues.length).length,
    published: events.filter(item => item.publication_status === "Published").length,
    revised: events.filter(item => item.publication_status === "Revised draft").length,
    unpublished: events.filter(item => item.publication_status === "Unpublished").length,
    archived: events.filter(item => item.lifecycle_status === "Archived").length
  };
}

function assertSnapshotFits_(json) {
  if (String(json || "").length > 45000) throw new Error("The public snapshot is too large for one Google Sheets cell. Archive older public events before publishing.");
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
  if ([SHEETS.PUBLICATIONS, SHEETS.PUBLICATION_ITEMS, SHEETS.RECIPE_VERSIONS, SHEETS.AUDIT].includes(sheetName)) {
    throw new Error(`${sheetName} is append-only.`);
  }
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
function positiveNumber_(value, fallback) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : Number(fallback || 0); }
function boundedNumber_(value, min, max, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : Number(fallback || 0); }
function roundQuantity_(value) { const number = Number(value); return Number.isFinite(number) ? Math.round(number * 1000) / 1000 : 0; }
function parseJson_(value, fallback) { try { return typeof value === "string" ? JSON.parse(value || "null") || fallback : (value || fallback); } catch (_) { return fallback; } }
function list_(value, limit, max) { const items = Array.isArray(value) ? value : String(value || "").split(/\n|,/); return items.map(item => clean_(item, max)).filter(Boolean).slice(0, limit); }
function menuFromText_(value) { return String(value || "").split(/\n|,/).map(name => ({ name: clean_(name, 300), required: 0 })).filter(item => item.name); }
function isoDate_(value) { if (!value) return ""; const date = value instanceof Date ? value : new Date(value); return Number.isNaN(date.getTime()) ? clean_(value, 20) : Utilities.formatDate(date, "America/New_York", "yyyy-MM-dd"); }
function googleId_(value, label) { const id = String(value || "").trim(); if (!/^[A-Za-z0-9_-]{20,}$/.test(id)) throw new Error(`${label} must be an ID copied from a Google URL, not the full URL.`); return id; }
function normalizeEmails_(value) { return [...new Set(String(value || "").toLowerCase().split(",").map(email => email.trim()).filter(Boolean))].map(email => { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Invalid allowed teacher email: ${email}`); return email; }); }
