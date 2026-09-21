const SHEETS = Object.freeze({
  REQUESTS: "Requests",
  EVENTS: "Events",
  PUBLICATIONS: "Publications",
  DOCUMENTS: "Documents",
  AUDIT: "Audit",
  RECIPES: "Recipes",
  RECIPE_VERSIONS: "RecipeVersions",
  EVENT_RECIPES: "EventRecipes",
  PUBLICATION_ITEMS: "PublicationItems",
  INGREDIENT_PRICES: "IngredientPrices",
  EVENT_PURCHASES: "EventPurchases",
  COST_SNAPSHOTS: "CostSnapshots",
  BUDGET_ACCOUNTS: "BudgetAccounts",
  BUDGET_TRANSACTIONS: "BudgetTransactions",
  RECEIPTS: "Receipts",
  EVENT_CLOSEOUTS: "EventCloseouts",
  INVENTORY_ITEMS: "InventoryItems",
  INVENTORY_TRANSACTIONS: "InventoryTransactions"
});

const REQUEST_REVIEW_STATUSES = Object.freeze(["New", "Under Review", "Needs Information", "Declined"]);
const EVENT_LIFECYCLE_STATUSES = Object.freeze(["Planning", "Ready", "Completed"]);
const PUBLICATION_STATUSES = Object.freeze(["Never published", "Published", "Revised draft", "Unpublished"]);
const FEATURES = Object.freeze({
  // Keep the completed inventory foundation dormant until its workflow can be
  // automated enough to avoid creating routine data-entry work for teachers.
  INVENTORY: false
});

const HEADERS = Object.freeze({
  Requests: ["request_id", "submitted_at", "requester", "contact_name", "contact_email", "contact_phone", "event_name", "event_type", "school", "service_date", "service_time", "guest_count", "service_format", "requested_menu", "requirements", "allergens", "internal_notes", "status", "event_id", "updated_at"],
  Events: ["event_id", "request_id", "event_name", "event_type", "school", "client_display_name", "service_date", "service_time", "location", "guest_count", "service_format", "requirements", "allergens", "learning_focus", "safety_controls", "menu_json", "tasks_json", "stage", "revision", "published_at", "published_by", "created_at", "updated_at", "updated_by", "lifecycle_status", "publication_status", "unpublished_at", "unpublished_by", "archived_at", "archived_by", "source_event_id", "event_budget", "budget_account_id"],
  Publications: ["publication_id", "event_id", "revision", "published_at", "published_by", "snapshot_json", "action", "reason"],
  Documents: ["document_id", "event_id", "document_type", "file_id", "file_url", "created_at", "created_by"],
  Audit: ["audit_id", "occurred_at", "actor", "action", "record_type", "record_id", "detail_json"],
  Recipes: ["recipe_id", "name", "category", "status", "current_version", "standard_yield_quantity", "standard_yield_unit", "portion_size", "allergens", "competencies", "ingredients_json", "equipment_json", "procedure_json", "safety_controls", "quality_controls_json", "created_at", "created_by", "updated_at", "updated_by"],
  RecipeVersions: ["recipe_version_id", "recipe_id", "version", "status", "created_at", "created_by", "change_note", "snapshot_json"],
  EventRecipes: ["event_recipe_id", "event_id", "menu_item_name", "recipe_id", "recipe_version", "required_quantity", "overage_percent", "snapshot_json", "active", "attached_at", "attached_by", "updated_at", "updated_by"],
  PublicationItems: ["publication_item_id", "publication_id", "publication_sequence", "event_id", "event_json"],
  IngredientPrices: ["price_id", "ingredient_name", "recipe_unit", "package_description", "package_quantity", "package_price", "supplier", "sku", "notes", "active", "updated_at", "updated_by", "product_name", "aliases_json", "package_unit", "price_type", "store_location", "checked_at", "product_url", "source", "variable_weight", "estimated_count"],
  EventPurchases: ["purchase_item_id", "event_id", "ingredient_name", "recipe_unit", "required_quantity", "on_hand_quantity", "to_purchase_quantity", "package_description", "package_quantity", "package_price", "packages_needed", "estimated_cost", "supplier", "sku", "status", "notes", "source_json", "active", "updated_at", "updated_by", "requirement_text"],
  CostSnapshots: ["cost_snapshot_id", "event_id", "created_at", "created_by", "estimated_total", "unpriced_count", "snapshot_json"],
  BudgetAccounts: ["budget_account_id", "name", "school", "course", "funding_source", "payment_method", "allocated_amount", "notes", "active", "updated_at", "updated_by"],
  BudgetTransactions: ["budget_transaction_id", "budget_account_id", "event_id", "transaction_type", "amount", "vendor", "category", "reference", "transaction_date", "status", "notes", "created_at", "created_by"],
  Receipts: ["receipt_id", "file_id", "file_url", "file_name", "mime_type", "ocr_status", "ocr_text", "vendor", "transaction_date", "total_amount", "reference", "category", "event_id", "budget_account_id", "commitment_id", "notes", "status", "budget_transaction_id", "created_at", "created_by", "updated_at", "updated_by", "line_items_json", "catalog_review_status"],
  EventCloseouts: ["closeout_id", "event_id", "completed_on", "outcome", "actual_guest_count", "actual_cost", "actual_cost_source", "customer_feedback", "successes", "issues", "follow_up", "finalized_at", "finalized_by", "created_at", "created_by", "updated_at", "updated_by"],
  InventoryItems: ["inventory_item_id", "ingredient_name", "inventory_unit", "opening_quantity", "reorder_level", "storage_location", "notes", "active", "updated_at", "updated_by"],
  InventoryTransactions: ["inventory_transaction_id", "inventory_item_id", "event_id", "transaction_type", "quantity", "unit_cost", "vendor", "source_id", "transaction_date", "notes", "created_at", "created_by"]
});

function doGet() {
  assertTeacher_();
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("The Cottage at Arcadia · Teacher Command Center")
    .setFaviconUrl("https://585swinemerchant.github.io/GCSD-Cottage-Operations/assets/cottage-logo.png")
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
  seedStarterPriceCatalog_();
  if (typeof seedStarterRecipeLibrary_ === "function") seedStarterRecipeLibrary_();
  if (typeof seedRecoveredRecipeLibrary_ === "function") seedRecoveredRecipeLibrary_();
}

function seedStarterPriceCatalog_() {
  if (typeof STARTER_PRICE_CATALOG === "undefined" || !Array.isArray(STARTER_PRICE_CATALOG)) return;
  const existingIds = new Set(records_(SHEETS.INGREDIENT_PRICES).map(item => String(item.price_id)));
  STARTER_PRICE_CATALOG.forEach(product => {
    const priceId = `seed_${product.id}`;
    if (existingIds.has(priceId)) return;
    appendRecord_(SHEETS.INGREDIENT_PRICES, {
      price_id: priceId, ingredient_name: product.aliases[0] || product.productName,
      recipe_unit: product.packageUnit, package_description: product.packageDescription,
      package_quantity: product.packageQuantity, package_price: product.packagePrice,
      supplier: product.supplier || "Wegmans", sku: product.id, notes: "Starter estimate; verify before purchase.",
      active: "TRUE", updated_at: `${product.checkedAt}T12:00:00.000Z`, updated_by: "starter catalog",
      product_name: product.productName, aliases_json: JSON.stringify(product.aliases || []),
      package_unit: product.packageUnit, price_type: product.priceType || "online shelf estimate",
      store_location: product.storeLocation || "Culver Ridge", checked_at: product.checkedAt,
      product_url: product.productUrl || "", source: "starter snapshot",
      variable_weight: product.variableWeight ? "TRUE" : "FALSE", estimated_count: product.estimatedCount ? "TRUE" : "FALSE"
    });
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
    finance: financeDashboard_(),
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
  const enrichedEvent = enrichEvent_(event);
  const costing = eventCosting_(eventId);
  const productionPlan = analyzeProductionPlan_(event);
  const closeout = eventCloseout_(eventId);
  const documents = records_(SHEETS.DOCUMENTS).filter(item => String(item.event_id) === String(eventId));
  const eventRecipes = eventRecipeRecords_(eventId).map(enrichEventRecipe_);
  return {
    event: enrichedEvent,
    sourceRequest: event.request_id ? findRecord_(SHEETS.REQUESTS, "request_id", event.request_id) : null,
    documents,
    eventRecipes,
    approvedRecipes: recipeSummaries_().filter(item => item.status === "Approved"),
    ingredientPrices: activeIngredientPrices_(),
    budgetAccounts: activeBudgetAccounts_(),
    costing,
    productionPlan,
    closeout,
    workflow: eventWorkflow_(enrichedEvent, { costing, productionPlan, closeout, documents, eventRecipes }),
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

function previewRecipeStudioImport(payload) {
  assertTeacher_();
  const raw = typeof payload === "string" ? payload : JSON.stringify(payload || {});
  if (!raw.trim()) throw new Error("Paste a Recipe Studio export first.");
  if (raw.length > 100000) throw new Error("The Recipe Studio export is too large.");
  let parsed;
  try { parsed = JSON.parse(raw); } catch (_) { throw new Error("The Recipe Studio export is not valid JSON."); }
  if (!parsed || parsed.schema !== "gcsd-cottage-recipe-draft" || Number(parsed.schemaVersion) !== 1 || !parsed.recipe) {
    throw new Error("This is not a supported GCSD Cottage Operations Recipe Studio export.");
  }
  const source = parsed.recipe;
  const normalized = normalizeRecipeInput_({
    name: source.name, category: source.category,
    standard_yield_quantity: source.standardYieldQuantity,
    standard_yield_unit: source.standardYieldUnit, portion_size: source.portionSize,
    allergens: source.allergens, competencies: source.competencies,
    ingredients: source.ingredients, equipment: source.equipment, procedure: source.procedure,
    safety_controls: source.safetyControls, quality_controls: source.qualityControls
  });
  const record = Object.assign({}, normalized, { recipe_id: "", status: "Draft", current_version: 0 });
  const recipe = enrichRecipe_(record);
  if (!recipe.name) throw new Error("The imported draft needs a recipe name.");
  return {
    recipe,
    warnings: recipe.approval_issues,
    exportedAt: clean_(parsed.exportedAt, 50),
    sourceNote: clean_(source.sourceNotes, 1000)
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

function saveIngredientPrice(input) {
  const teacher = assertTeacher_();
  if (!input) throw new Error("Ingredient price data is required.");
  return withLock_(() => {
    const name = clean_(input.ingredient_name || input.product_name, 300);
    const unit = canonicalUnit_(input.recipe_unit || input.package_unit);
    const existing = input.price_id ? findRecord_(SHEETS.INGREDIENT_PRICES, "price_id", input.price_id) : activeIngredientPrices_().find(item => ingredientKey_(item.ingredient_name, item.recipe_unit) === ingredientKey_(name, unit));
    if (input.price_id && !existing) throw new Error("Ingredient price record not found.");
    const packageQuantity = positiveNumber_(input.package_quantity, 0);
    const packagePrice = positiveNumber_(input.package_price, 0);
    if (!name || !unit) throw new Error("Ingredient name and recipe unit are required.");
    if (!packageQuantity || !packagePrice) throw new Error("Package quantity and package price must be greater than zero.");
    const now = new Date().toISOString();
    const aliases = Array.isArray(input.aliases) ? input.aliases : String(input.aliases_text || "").split(/[,\n]/);
    const checkedAt = clean_(input.checked_at, 20) || now.slice(0, 10);
    const record = {
      price_id: existing ? existing.price_id : id_("price"), ingredient_name: name, recipe_unit: unit,
      package_description: clean_(input.package_description, 300), package_quantity: packageQuantity,
      package_price: roundMoney_(packagePrice), supplier: clean_(input.supplier || "Wegmans", 200), sku: clean_(input.sku, 200),
      notes: clean_(input.notes, 1000), active: "TRUE", updated_at: now, updated_by: teacher.email,
      product_name: clean_(input.product_name || name, 300),
      aliases_json: JSON.stringify([...new Set([name].concat(aliases).map(value => normalizeIngredientName_(value)).filter(Boolean))]),
      package_unit: canonicalUnit_(input.package_unit || unit), price_type: clean_(input.price_type || "teacher verified", 100),
      store_location: clean_(input.store_location || "Culver Ridge", 200), checked_at: checkedAt,
      product_url: safeHttpUrl_(input.product_url), source: clean_(input.source || "teacher entry", 100),
      variable_weight: input.variable_weight ? "TRUE" : "FALSE", estimated_count: input.estimated_count ? "TRUE" : "FALSE"
    };
    if (existing) updateRecord_(SHEETS.INGREDIENT_PRICES, "price_id", record.price_id, record);
    else appendRecord_(SHEETS.INGREDIENT_PRICES, record);
    audit_(teacher.email, existing ? "update_price" : "create_price", "ingredient_price", record.price_id, { ingredientName: name, recipeUnit: unit });
    return record;
  });
}

function archiveIngredientPrice(priceId) {
  const teacher = assertTeacher_();
  return withLock_(() => {
    const record = findRecord_(SHEETS.INGREDIENT_PRICES, "price_id", priceId);
    if (!record) throw new Error("Ingredient price record not found.");
    updateRecord_(SHEETS.INGREDIENT_PRICES, "price_id", priceId, { active: "FALSE", updated_at: new Date().toISOString(), updated_by: teacher.email });
    audit_(teacher.email, "archive_price", "ingredient_price", priceId, { ingredientName: record.ingredient_name, recipeUnit: record.recipe_unit });
    return { ok: true };
  });
}

function saveBudgetAccount(input) {
  const teacher = assertTeacher_();
  if (!input) throw new Error("Budget account data is required.");
  return withLock_(() => {
    const existing = input.budget_account_id ? findRecord_(SHEETS.BUDGET_ACCOUNTS, "budget_account_id", input.budget_account_id) : null;
    if (input.budget_account_id && !existing) throw new Error("Budget account not found.");
    const name = clean_(input.name, 200);
    const allocatedAmount = positiveOrZero_(input.allocated_amount);
    if (!name) throw new Error("Budget account name is required.");
    const now = new Date().toISOString();
    const record = {
      budget_account_id: existing ? existing.budget_account_id : id_("budget"), name,
      school: clean_(input.school, 100), course: clean_(input.course, 200),
      funding_source: clean_(input.funding_source, 200), payment_method: clean_(input.payment_method, 200),
      allocated_amount: roundMoney_(allocatedAmount), notes: clean_(input.notes, 1000),
      active: "TRUE", updated_at: now, updated_by: teacher.email
    };
    if (existing) updateRecord_(SHEETS.BUDGET_ACCOUNTS, "budget_account_id", record.budget_account_id, record);
    else appendRecord_(SHEETS.BUDGET_ACCOUNTS, record);
    audit_(teacher.email, existing ? "update_budget_account" : "create_budget_account", "budget_account", record.budget_account_id, { name, allocatedAmount });
    return record;
  });
}

function archiveBudgetAccount(budgetAccountId) {
  const teacher = assertTeacher_();
  return withLock_(() => {
    const account = findRecord_(SHEETS.BUDGET_ACCOUNTS, "budget_account_id", budgetAccountId);
    if (!account) throw new Error("Budget account not found.");
    updateRecord_(SHEETS.BUDGET_ACCOUNTS, "budget_account_id", budgetAccountId, { active: "FALSE", updated_at: new Date().toISOString(), updated_by: teacher.email });
    audit_(teacher.email, "archive_budget_account", "budget_account", budgetAccountId, { name: account.name });
    return { ok: true };
  });
}

function recordBudgetTransaction(input) {
  const teacher = assertTeacher_();
  if (!input) throw new Error("Budget transaction data is required.");
  const account = findRecord_(SHEETS.BUDGET_ACCOUNTS, "budget_account_id", input.budget_account_id);
  if (!account || String(account.active || "TRUE").toUpperCase() === "FALSE") throw new Error("Choose an active budget account.");
  const type = clean_(input.transaction_type, 50);
  const allowedTypes = ["Commitment", "Expense", "Credit"];
  if (!allowedTypes.includes(type)) throw new Error("Choose a valid budget transaction type.");
  const amount = positiveNumber_(input.amount, 0);
  if (!amount) throw new Error("Transaction amount must be greater than zero.");
  const allowedStatuses = type === "Commitment" ? ["Active", "Released", "Fulfilled"] : ["Posted", "Void"];
  const status = clean_(input.status, 50) || allowedStatuses[0];
  if (!allowedStatuses.includes(status)) throw new Error("Choose a valid transaction status.");
  return withLock_(() => {
    const now = new Date().toISOString();
    const record = {
      budget_transaction_id: id_("budgettx"), budget_account_id: account.budget_account_id,
      event_id: clean_(input.event_id, 100), transaction_type: type, amount: roundMoney_(amount),
      vendor: clean_(input.vendor, 200), category: clean_(input.category, 100), reference: clean_(input.reference, 200),
      transaction_date: clean_(input.transaction_date, 20) || now.slice(0, 10), status,
      notes: clean_(input.notes, 1000), created_at: now, created_by: teacher.email
    };
    appendRecord_(SHEETS.BUDGET_TRANSACTIONS, record);
    audit_(teacher.email, "record_budget_transaction", "budget_transaction", record.budget_transaction_id, { budgetAccountId: account.budget_account_id, eventId: record.event_id, type, amount: record.amount });
    return record;
  });
}

function updateBudgetTransactionStatus(budgetTransactionId, status) {
  const teacher = assertTeacher_();
  return withLock_(() => {
    const transaction = findRecord_(SHEETS.BUDGET_TRANSACTIONS, "budget_transaction_id", budgetTransactionId);
    if (!transaction) throw new Error("Budget transaction not found.");
    const nextStatus = clean_(status, 50);
    const allowed = transaction.transaction_type === "Commitment" ? ["Active", "Released", "Fulfilled"] : ["Posted", "Void"];
    if (!allowed.includes(nextStatus)) throw new Error("Choose a valid transaction status.");
    updateRecord_(SHEETS.BUDGET_TRANSACTIONS, "budget_transaction_id", budgetTransactionId, { status: nextStatus });
    audit_(teacher.email, "update_budget_transaction_status", "budget_transaction", budgetTransactionId, { previousStatus: transaction.status, status: nextStatus });
    return findRecord_(SHEETS.BUDGET_TRANSACTIONS, "budget_transaction_id", budgetTransactionId);
  });
}

/**
 * Creates or refreshes one private budget commitment from the current event
 * purchase estimate. This avoids re-keying the event, account, and amount.
 */
function createPurchaseCommitment(eventId) {
  const teacher = assertTeacher_();
  return withLock_(() => {
    const event = findRecord_(SHEETS.EVENTS, "event_id", eventId);
    if (!event) throw new Error("Event not found.");
    const account = findRecord_(SHEETS.BUDGET_ACCOUNTS, "budget_account_id", event.budget_account_id);
    if (!account || String(account.active || "TRUE").toUpperCase() === "FALSE") {
      throw new Error("Choose and save an active funding account on the event first.");
    }
    const costing = eventCosting_(eventId);
    if (!positiveNumber_(costing.estimatedTotal, 0)) throw new Error("Build a priced purchase plan before creating a commitment.");
    const existing = records_(SHEETS.BUDGET_TRANSACTIONS).find(item =>
      item.transaction_type === "Commitment" && item.status === "Active" &&
      String(item.event_id) === String(eventId) && item.reference === "AUTO-PURCHASE-PLAN"
    );
    const now = new Date().toISOString();
    if (existing) {
      updateRecord_(SHEETS.BUDGET_TRANSACTIONS, "budget_transaction_id", existing.budget_transaction_id, {
        budget_account_id: account.budget_account_id,
        amount: roundMoney_(costing.estimatedTotal),
        vendor: purchasePlanVendor_(costing.items),
        transaction_date: now.slice(0, 10),
        notes: `Current purchase-plan estimate for ${event.event_name}`
      });
      audit_(teacher.email, "refresh_purchase_commitment", "budget_transaction", existing.budget_transaction_id, { eventId, amount: costing.estimatedTotal });
      return findRecord_(SHEETS.BUDGET_TRANSACTIONS, "budget_transaction_id", existing.budget_transaction_id);
    }
    const record = {
      budget_transaction_id: id_("budgettx"), budget_account_id: account.budget_account_id,
      event_id: eventId, transaction_type: "Commitment", amount: roundMoney_(costing.estimatedTotal),
      vendor: purchasePlanVendor_(costing.items), category: "Event purchasing", reference: "AUTO-PURCHASE-PLAN",
      transaction_date: now.slice(0, 10), status: "Active",
      notes: `Purchase-plan estimate for ${event.event_name}`, created_at: now, created_by: teacher.email
    };
    appendRecord_(SHEETS.BUDGET_TRANSACTIONS, record);
    audit_(teacher.email, "create_purchase_commitment", "budget_transaction", record.budget_transaction_id, { eventId, amount: record.amount });
    return record;
  });
}

function purchasePlanVendor_(items) {
  const vendors = [...new Set((items || []).map(item => clean_(item.supplier, 200)).filter(Boolean))];
  return vendors.length === 1 ? vendors[0] : vendors.length > 1 ? "Multiple suppliers" : "";
}

/**
 * Saves a receipt image/PDF inside the private project folder and creates a
 * reviewable draft. OCR is advisory only and never creates an expense.
 */
function captureReceipt(input) {
  const teacher = assertTeacher_();
  if (!input) throw new Error("Choose a receipt image or PDF.");
  const mimeType = clean_(input.mime_type, 100).toLowerCase();
  const allowed = ["image/jpeg", "image/png", "image/gif", "image/bmp", "application/pdf"];
  if (!allowed.includes(mimeType)) throw new Error("Receipt must be a JPEG, PNG, GIF, BMP, or PDF.");
  const raw = String(input.base64 || "").replace(/^data:[^;]+;base64,/, "");
  if (!raw) throw new Error("Receipt file data is missing.");
  const bytes = Utilities.base64Decode(raw);
  if (bytes.length > 5 * 1024 * 1024) throw new Error("Receipt files are limited to 5 MB.");
  const now = new Date().toISOString();
  const fileName = safeFileName_(input.file_name || `receipt-${now.slice(0, 10)}`);
  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const folder = receiptFolder_();
  const file = folder.createFile(blob);
  let ocrText = "", ocrStatus = "Completed", ocrMessage = "";
  try {
    ocrText = receiptOcrText_(blob);
    if (!ocrText.trim()) {
      ocrStatus = "Needs review";
      ocrMessage = "Google OCR returned no text; enter the receipt details manually.";
    }
  } catch (error) {
    ocrStatus = "Unavailable";
    ocrMessage = "OCR is not enabled yet; the original receipt was saved and can be entered manually.";
  }
  const parsed = parseReceiptText_(ocrText);
  const record = {
    receipt_id: id_("receipt"), file_id: file.getId(), file_url: file.getUrl(), file_name: fileName,
    mime_type: mimeType, ocr_status: ocrStatus, ocr_text: clean_(ocrText, 50000),
    vendor: parsed.vendor, transaction_date: parsed.transactionDate,
    total_amount: parsed.totalAmount || "", reference: parsed.reference, category: "Food",
    event_id: clean_(input.event_id, 100), budget_account_id: clean_(input.budget_account_id, 100),
    commitment_id: clean_(input.commitment_id, 100), notes: clean_(input.notes, 1000), status: "Draft",
    budget_transaction_id: "", created_at: now, created_by: teacher.email, updated_at: now, updated_by: teacher.email,
    line_items_json: JSON.stringify(parsed.lineItems || []), catalog_review_status: (parsed.lineItems || []).length ? "Needs review" : "No line items detected"
  };
  appendRecord_(SHEETS.RECEIPTS, record);
  audit_(teacher.email, "capture_receipt", "receipt", record.receipt_id, { fileId: record.file_id, ocrStatus, eventId: record.event_id });
  return Object.assign({}, receiptView_(record), { ocrMessage, extractionWarnings: parsed.warnings });
}

function saveReceiptDraft(input) {
  const teacher = assertTeacher_();
  if (!input || !input.receipt_id) throw new Error("Receipt draft is required.");
  return withLock_(() => {
    const receipt = findRecord_(SHEETS.RECEIPTS, "receipt_id", input.receipt_id);
    if (!receipt) throw new Error("Receipt draft not found.");
    if (receipt.status !== "Draft") throw new Error("Only receipt drafts can be edited.");
    const amount = input.total_amount === "" ? "" : roundMoney_(positiveNumber_(input.total_amount, 0));
    if (input.total_amount !== "" && !amount) throw new Error("Receipt total must be greater than zero.");
    const patch = {
      vendor: clean_(input.vendor, 200), transaction_date: clean_(input.transaction_date, 20), total_amount: amount,
      reference: clean_(input.reference, 200), category: clean_(input.category, 100),
      event_id: clean_(input.event_id, 100), budget_account_id: clean_(input.budget_account_id, 100),
      commitment_id: clean_(input.commitment_id, 100), notes: clean_(input.notes, 1000),
      line_items_json: JSON.stringify(normalizeReceiptLineItems_(input.line_items)), catalog_review_status: clean_(input.catalog_review_status || "Needs review", 50),
      updated_at: new Date().toISOString(), updated_by: teacher.email
    };
    updateRecord_(SHEETS.RECEIPTS, "receipt_id", receipt.receipt_id, patch);
    audit_(teacher.email, "save_receipt_draft", "receipt", receipt.receipt_id, { eventId: patch.event_id, amount: patch.total_amount });
    return receiptView_(findRecord_(SHEETS.RECEIPTS, "receipt_id", receipt.receipt_id));
  });
}

/** Posts one reviewed receipt as an expense and optionally fulfills its commitment. */
function postReceiptExpense(input) {
  const teacher = assertTeacher_();
  if (!input || !input.receipt_id) throw new Error("Receipt draft is required.");
  return withLock_(() => {
    const receipt = findRecord_(SHEETS.RECEIPTS, "receipt_id", input.receipt_id);
    if (!receipt) throw new Error("Receipt draft not found.");
    if (receipt.status !== "Draft") throw new Error("This receipt has already been processed.");
    const accountId = clean_(input.budget_account_id || receipt.budget_account_id, 100);
    const account = findRecord_(SHEETS.BUDGET_ACCOUNTS, "budget_account_id", accountId);
    if (!account || String(account.active || "TRUE").toUpperCase() === "FALSE") throw new Error("Choose an active funding account.");
    const amount = roundMoney_(positiveNumber_(input.total_amount || receipt.total_amount, 0));
    if (!amount) throw new Error("Confirm a receipt total greater than zero.");
    const eventId = clean_(input.event_id || receipt.event_id, 100);
    if (eventId && !findRecord_(SHEETS.EVENTS, "event_id", eventId)) throw new Error("The selected event was not found.");
    const commitmentId = clean_(input.commitment_id || receipt.commitment_id, 100);
    const commitment = commitmentId ? findRecord_(SHEETS.BUDGET_TRANSACTIONS, "budget_transaction_id", commitmentId) : null;
    if (commitmentId && (!commitment || commitment.transaction_type !== "Commitment" || commitment.status !== "Active")) throw new Error("Choose an active commitment or leave it blank.");
    if (commitment && String(commitment.budget_account_id) !== String(accountId)) throw new Error("The commitment and receipt must use the same funding account.");
    if (commitment && commitment.event_id && eventId && String(commitment.event_id) !== String(eventId)) throw new Error("The commitment belongs to a different event.");
    const now = new Date().toISOString();
    const transactionId = `expense_${receipt.receipt_id}`;
    const existingExpense = findRecord_(SHEETS.BUDGET_TRANSACTIONS, "budget_transaction_id", transactionId);
    const transaction = existingExpense || {
      budget_transaction_id: transactionId, budget_account_id: accountId, event_id: eventId,
      transaction_type: "Expense", amount, vendor: clean_(input.vendor || receipt.vendor, 200),
      category: clean_(input.category || receipt.category || "Food", 100),
      reference: clean_(input.reference || receipt.reference || `Receipt ${receipt.receipt_id}`, 200),
      transaction_date: clean_(input.transaction_date || receipt.transaction_date, 20) || now.slice(0, 10),
      status: "Posted", notes: clean_(input.notes || receipt.notes, 1000), created_at: now, created_by: teacher.email
    };
    if (!existingExpense) appendRecord_(SHEETS.BUDGET_TRANSACTIONS, transaction);
    if (commitment) updateRecord_(SHEETS.BUDGET_TRANSACTIONS, "budget_transaction_id", commitmentId, { status: "Fulfilled" });
    const lineItems = normalizeReceiptLineItems_(input.line_items == null ? parseJson_(receipt.line_items_json, []) : input.line_items);
    const catalogUpdates = input.learn_catalog ? updateCatalogFromReceipt_(lineItems, transaction, receipt.receipt_id, teacher.email) : [];
    updateRecord_(SHEETS.RECEIPTS, "receipt_id", receipt.receipt_id, {
      vendor: transaction.vendor, transaction_date: transaction.transaction_date, total_amount: amount,
      reference: transaction.reference, category: transaction.category, event_id: eventId,
      budget_account_id: accountId, commitment_id: commitmentId, notes: transaction.notes,
      status: "Posted", budget_transaction_id: transaction.budget_transaction_id, updated_at: now, updated_by: teacher.email,
      line_items_json: JSON.stringify(lineItems), catalog_review_status: input.learn_catalog ? `Reviewed · ${catalogUpdates.length} price update${catalogUpdates.length === 1 ? "" : "s"}` : "Reviewed · catalog unchanged"
    });
    audit_(teacher.email, "post_receipt_expense", "receipt", receipt.receipt_id, { transactionId: transaction.budget_transaction_id, commitmentId, eventId, amount, catalogUpdates: catalogUpdates.length });
    return { receipt: receiptView_(findRecord_(SHEETS.RECEIPTS, "receipt_id", receipt.receipt_id)), transaction, catalogUpdates };
  });
}

function ignoreReceipt(receiptId, reason) {
  const teacher = assertTeacher_();
  return withLock_(() => {
    const receipt = findRecord_(SHEETS.RECEIPTS, "receipt_id", receiptId);
    if (!receipt || receipt.status !== "Draft") throw new Error("Active receipt draft not found.");
    const note = clean_(reason, 1000);
    if (!note) throw new Error("A reason is required.");
    updateRecord_(SHEETS.RECEIPTS, "receipt_id", receiptId, { status: "Ignored", notes: note, updated_at: new Date().toISOString(), updated_by: teacher.email });
    audit_(teacher.email, "ignore_receipt", "receipt", receiptId, { reason: note });
    return { ok: true };
  });
}

function receiptFolder_() {
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty("RECEIPT_FOLDER_ID");
  if (existingId) {
    try { return DriveApp.getFolderById(existingId); } catch (_) { /* recreate below */ }
  }
  const root = DriveApp.getFolderById(props.getProperty("DOCUMENT_FOLDER_ID"));
  const matches = root.getFoldersByName("Receipts");
  const folder = matches.hasNext() ? matches.next() : root.createFolder("Receipts");
  props.setProperty("RECEIPT_FOLDER_ID", folder.getId());
  return folder;
}

function receiptOcrText_(blob) {
  if (typeof Drive === "undefined" || !Drive.Files) throw new Error("Advanced Drive service is not enabled.");
  const converted = Drive.Files.create({
    name: `OCR - ${blob.getName()}`,
    mimeType: "application/vnd.google-apps.document"
  }, blob, { ocrLanguage: "en", fields: "id" });
  try {
    return DocumentApp.openById(converted.id).getBody().getText();
  } finally {
    try { DriveApp.getFileById(converted.id).setTrashed(true); } catch (_) { /* temporary OCR document expires manually */ }
  }
}

function parseReceiptText_(text) {
  const lines = String(text || "").split(/\r?\n/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const warnings = [];
  const datePatterns = [
    /\b(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/,
    /\b(\d{1,2})[-\/.](\d{1,2})[-\/.](20\d{2}|\d{2})\b/
  ];
  let transactionDate = "";
  for (const line of lines) {
    let match = line.match(datePatterns[0]);
    if (match) { transactionDate = `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`; break; }
    match = line.match(datePatterns[1]);
    if (match) {
      const year = match[3].length === 2 ? `20${match[3]}` : match[3];
      transactionDate = `${year}-${String(match[1]).padStart(2, "0")}-${String(match[2]).padStart(2, "0")}`;
      break;
    }
  }
  const moneyValues = line => [...line.matchAll(/(?:\$\s*)?(\d{1,6}(?:,\d{3})*\.\d{2})\b/g)].map(match => Number(match[1].replace(/,/g, "")));
  const standalonePrice = line => {
    const match = String(line || "").match(/^\$?\s*(\d{1,6}(?:,\d{3})*\.\d{2})(?:\s+[A-Z])?$/i);
    return match ? Number(match[1].replace(/,/g, "")) : 0;
  };
  const totalIndexes = lines.map((line, index) => ({ line, index })).filter(item =>
    /\b(grand\s+total|amount\s+due|balance\s+due|total|balance)\b/i.test(item.line) &&
    !/\b(subtotal|taxable|total\s+savings|change)\b/i.test(item.line)
  );
  let totalAmount = 0;
  for (const item of totalIndexes.reverse()) {
    const values = moneyValues(item.line);
    if (values.length) { totalAmount = values[values.length - 1]; break; }
    for (let offset = 1; offset <= 2 && item.index + offset < lines.length; offset += 1) {
      const nextValue = standalonePrice(lines[item.index + offset]);
      if (nextValue) { totalAmount = nextValue; break; }
    }
    if (totalAmount) break;
  }
  if (!totalAmount) warnings.push("Total was not confidently detected.");
  if (!transactionDate) warnings.push("Transaction date was not confidently detected.");
  const vendor = clean_(lines.find(line => /[a-z]/i.test(line) && !/^(receipt|invoice|order|date|time|tel|phone|www\.|https?:|thank you)/i.test(line) && !/^\d+[\s-]/.test(line)) || "", 200);
  if (!vendor) warnings.push("Vendor was not confidently detected.");
  const referenceLine = lines.find(line => /\b(receipt|invoice|order|transaction)\s*(#|no\.?|number|id|:)\s*[a-z0-9-]+/i.test(line)) || "";
  const referenceMatch = referenceLine.match(/\b(?:receipt|invoice|order|transaction)\s*(?:#|no\.?|number|id|:)\s*([a-z0-9-]+)/i);
  let catalog = [];
  try { catalog = activeIngredientPrices_(); } catch (_) { /* parser remains usable in tests and before workbook configuration */ }
  const administrativeLine = line => /\b(subtotal|tax|total|savings|payment|change|balance|amount due|visa|mastercard|cash|debit|credit|card number|approval|authorization|purchase|cashier)\b/i.test(line);
  const lineItems = lines.map((line, index) => {
    if (administrativeLine(line) || standalonePrice(line)) return null;
    const values = moneyValues(line);
    const followingPrice = index + 1 < lines.length ? standalonePrice(lines[index + 1]) : 0;
    if ((!values.length && !followingPrice) || !/[a-z]/i.test(line)) return null;
    const price = values.length ? values[values.length - 1] : followingPrice;
    const receiptName = clean_(line.replace(/(?:\$\s*)?\d{1,6}(?:,\d{3})*\.\d{2}\b/g, " ").replace(/\b\d{8,14}\b/g, " ").replace(/\s+[A-Z]$/i, "").replace(/\s+/g, " ").trim(), 200);
    if (!receiptName || receiptName.length < 2) return null;
    let name = receiptName;
    if (/\b(?:tomato red plum|red plum tomato|roma tomato)\b/i.test(receiptName)) name = "Roma tomatoes";
    else if (/^cilantro\s+bunch$/i.test(receiptName)) name = "cilantro";
    else if (/^(?:pepper\s+jalapeno|jalapeno\s+pepper)$/i.test(receiptName)) name = "jalapeno peppers";
    const matched = findExactCatalogByName_(name, catalog);
    const missingVariableWeight = /\b(?:roma|red plum)\s+tomato|tomato\s+red\s+plum\b/i.test(name);
    return {
      id: `line-${index + 1}`, receiptText: followingPrice && !values.length ? `${line} ${lines[index + 1]}` : line, ingredientName: matched ? matched.ingredient_name : name,
      productName: matched ? matched.product_name || matched.ingredient_name : name, packagesPurchased: 1,
      lineTotal: roundMoney_(price), packagePrice: 0,
      packageQuantity: matched ? positiveNumber_(matched.package_quantity, 0) : 0,
      packageUnit: matched ? canonicalUnit_(matched.package_unit || matched.recipe_unit) : "",
      packageDescription: matched ? matched.package_description : "", aliasesText: matched ? (matched.aliases || []).join(", ") : "",
      matchedPriceId: matched ? matched.price_id : "", updateCatalog: false,
      catalogLearningNote: missingVariableWeight
        ? "Expense captured. The receipt does not show weight or price per pound, so catalog learning is skipped."
        : matched
          ? "Possible exact catalog match. Confirm the package count, size, unit, and package price before selecting Use for catalog."
          : "New ingredient candidate. To add it to the catalog, enter the quantity represented by this line, its unit and catalog price, then select Add as new catalog item. If the receipt does not provide enough information, leave it unchecked; the expense will still post."
    };
  }).filter(Boolean).slice(0, 100);
  if (!lineItems.length) warnings.push("Item-level prices were not confidently detected; add them during review if catalog learning is needed.");
  return { vendor, transactionDate, totalAmount: totalAmount ? roundMoney_(totalAmount) : 0, reference: referenceMatch ? referenceMatch[1] : "", warnings, lineItems };
}

function findCatalogByName_(name, catalog) {
  const target = normalizeIngredientName_(name);
  return (catalog || []).map(price => {
    const names = [price.ingredient_name, price.product_name].concat(price.aliases || parseJson_(price.aliases_json, [])).map(normalizeIngredientName_).filter(Boolean);
    const exact = names.includes(target), partial = names.some(alias => alias.length > 3 && (target.includes(alias) || alias.includes(target)));
    return { price, score: exact ? 100 : partial ? 60 : 0 };
  }).filter(item => item.score).sort((a, b) => b.score - a.score || String(b.price.checked_at).localeCompare(String(a.price.checked_at)))[0]?.price || null;
}

function findExactCatalogByName_(name, catalog) {
  const target = normalizeIngredientName_(name);
  return (catalog || []).filter(price => {
    const names = [price.ingredient_name, price.product_name].concat(price.aliases || parseJson_(price.aliases_json, [])).map(normalizeIngredientName_).filter(Boolean);
    return names.includes(target);
  }).sort((a, b) => String(b.checked_at).localeCompare(String(a.checked_at)))[0] || null;
}

function normalizeReceiptLineItems_(items) {
  if (typeof items === "string") items = parseJson_(items, []);
  if (!Array.isArray(items)) return [];
  return items.slice(0, 100).map((item, index) => ({
    id: clean_(item && item.id || `line-${index + 1}`, 100), receiptText: clean_(item && item.receiptText, 300),
    ingredientName: clean_(item && item.ingredientName, 300), productName: clean_(item && (item.productName || item.ingredientName), 300),
    packagesPurchased: positiveNumber_(item && item.packagesPurchased, 1), lineTotal: roundMoney_(positiveOrZero_(item && item.lineTotal)),
    packagePrice: roundMoney_(positiveOrZero_(item && item.packagePrice)), packageQuantity: positiveOrZero_(item && item.packageQuantity),
    packageUnit: canonicalUnit_(item && item.packageUnit), packageDescription: clean_(item && item.packageDescription, 300),
    aliasesText: clean_(item && item.aliasesText, 1000), matchedPriceId: clean_(item && item.matchedPriceId, 100), updateCatalog: Boolean(item && item.updateCatalog),
    catalogLearningNote: clean_(item && item.catalogLearningNote, 500)
  })).filter(item => item.ingredientName || item.productName);
}

function updateCatalogFromReceipt_(lineItems, transaction, receiptId, actor) {
  const updates = [];
  (lineItems || []).filter(item => item.updateCatalog).forEach(item => {
    if (!item.ingredientName || !item.packageQuantity || !item.packageUnit) return;
    const packagePrice = item.packagePrice;
    if (!packagePrice) return;
    const existing = item.matchedPriceId ? findRecord_(SHEETS.INGREDIENT_PRICES, "price_id", item.matchedPriceId) : findCatalogByName_(item.ingredientName, activeIngredientPrices_());
    const now = new Date().toISOString(), date = clean_(transaction.transaction_date, 20) || now.slice(0, 10);
    const aliases = [...new Set([item.ingredientName].concat(String(item.aliasesText || "").split(/[,\n]/)).map(normalizeIngredientName_).filter(Boolean))];
    const record = {
      price_id: existing ? existing.price_id : id_("price"), ingredient_name: item.ingredientName, recipe_unit: item.packageUnit,
      package_description: item.packageDescription, package_quantity: item.packageQuantity, package_price: packagePrice,
      supplier: clean_(transaction.vendor || "Wegmans", 200), sku: existing ? existing.sku : "", notes: `Teacher-reviewed receipt ${receiptId}`,
      active: "TRUE", updated_at: now, updated_by: actor, product_name: item.productName || item.ingredientName,
      aliases_json: JSON.stringify(aliases), package_unit: item.packageUnit, price_type: "receipt actual",
      store_location: existing ? existing.store_location : "Culver Ridge", checked_at: date,
      product_url: existing ? existing.product_url : "", source: "reviewed receipt", variable_weight: existing ? existing.variable_weight : "FALSE", estimated_count: existing ? existing.estimated_count : "FALSE"
    };
    if (existing) updateRecord_(SHEETS.INGREDIENT_PRICES, "price_id", record.price_id, record); else appendRecord_(SHEETS.INGREDIENT_PRICES, record);
    updates.push(record);
  });
  return updates;
}

function receiptView_(receipt) {
  if (!receipt) return null;
  const { ocr_text, ...safe } = receipt;
  return Object.assign({}, safe, { total_amount: receipt.total_amount === "" ? "" : positiveOrZero_(receipt.total_amount), line_items: normalizeReceiptLineItems_(receipt.line_items_json) });
}

function safeFileName_(value) {
  return clean_(value, 180).replace(/[\\/:*?"<>|]+/g, "-") || "receipt";
}

function saveInventoryItem(input) {
  const teacher = assertTeacher_();
  if (!FEATURES.INVENTORY) throw new Error("Inventory management is not active.");
  if (!input) throw new Error("Inventory item data is required.");
  return withLock_(() => {
    const name = clean_(input.ingredient_name, 300), unit = clean_(input.inventory_unit, 100);
    if (!name || !unit) throw new Error("Ingredient name and inventory unit are required.");
    const existing = input.inventory_item_id
      ? findRecord_(SHEETS.INVENTORY_ITEMS, "inventory_item_id", input.inventory_item_id)
      : activeInventoryItems_().find(item => ingredientKey_(item.ingredient_name, item.inventory_unit) === ingredientKey_(name, unit));
    if (input.inventory_item_id && !existing) throw new Error("Inventory item not found.");
    const now = new Date().toISOString();
    const record = {
      inventory_item_id: existing ? existing.inventory_item_id : id_("stock"), ingredient_name: name, inventory_unit: unit,
      opening_quantity: existing ? positiveOrZero_(existing.opening_quantity) : positiveOrZero_(input.opening_quantity),
      reorder_level: positiveOrZero_(input.reorder_level), storage_location: clean_(input.storage_location, 200),
      notes: clean_(input.notes, 1000), active: "TRUE", updated_at: now, updated_by: teacher.email
    };
    if (existing) updateRecord_(SHEETS.INVENTORY_ITEMS, "inventory_item_id", record.inventory_item_id, record);
    else appendRecord_(SHEETS.INVENTORY_ITEMS, record);
    audit_(teacher.email, existing ? "update_inventory_item" : "create_inventory_item", "inventory_item", record.inventory_item_id, { ingredientName: name, unit });
    return record;
  });
}

function recordInventoryTransaction(input) {
  const teacher = assertTeacher_();
  if (!FEATURES.INVENTORY) throw new Error("Inventory management is not active.");
  if (!input) throw new Error("Inventory transaction data is required.");
  const item = findRecord_(SHEETS.INVENTORY_ITEMS, "inventory_item_id", input.inventory_item_id);
  if (!item || String(item.active || "TRUE").toUpperCase() === "FALSE") throw new Error("Choose an active inventory item.");
  const type = clean_(input.transaction_type, 50);
  if (!["Receipt", "Usage", "Waste", "Adjustment"].includes(type)) throw new Error("Choose a valid inventory transaction type.");
  let quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || !quantity || (type !== "Adjustment" && quantity < 0)) throw new Error("Enter a valid inventory quantity.");
  if (type === "Usage" || type === "Waste") quantity = -Math.abs(quantity);
  return withLock_(() => appendInventoryTransaction_(item, {
    eventId: clean_(input.event_id, 100), type, quantity, unitCost: positiveOrZero_(input.unit_cost),
    vendor: clean_(input.vendor, 200), sourceId: clean_(input.source_id, 200),
    transactionDate: clean_(input.transaction_date, 20), notes: clean_(input.notes, 1000), actor: teacher.email
  }));
}

function archiveInventoryItem(inventoryItemId) {
  const teacher = assertTeacher_();
  if (!FEATURES.INVENTORY) throw new Error("Inventory management is not active.");
  return withLock_(() => {
    const item = findRecord_(SHEETS.INVENTORY_ITEMS, "inventory_item_id", inventoryItemId);
    if (!item) throw new Error("Inventory item not found.");
    updateRecord_(SHEETS.INVENTORY_ITEMS, "inventory_item_id", inventoryItemId, { active: "FALSE", updated_at: new Date().toISOString(), updated_by: teacher.email });
    audit_(teacher.email, "archive_inventory_item", "inventory_item", inventoryItemId, { ingredientName: item.ingredient_name });
    return { ok: true };
  });
}

function generateEventPurchasePlan(eventId) {
  const teacher = assertTeacher_();
  return withLock_(() => {
    const event = findRecord_(SHEETS.EVENTS, "event_id", eventId);
    if (!event) throw new Error("Event not found.");
    if (eventLifecycle_(event) === "Archived") throw new Error("Restore this event before building a purchase plan.");
    const requirements = ingredientRequirements_(eventId);
    if (!requirements.length) throw new Error("Attach at least one approved recipe before building a purchase plan.");
    const prices = activeIngredientPrices_();
    const inventory = FEATURES.INVENTORY ? inventoryQuantityByKey_() : {};
    const existing = records_(SHEETS.EVENT_PURCHASES).filter(item => String(item.event_id) === String(eventId));
    const now = new Date().toISOString();
    const activeIds = [];
    requirements.forEach(requirement => {
      const prior = existing.find(item => ingredientKey_(item.ingredient_name, item.recipe_unit) === requirement.key && String(item.active || "TRUE").toUpperCase() !== "FALSE");
      const priceMatch = findIngredientPrice_(requirement.ingredientName, requirement.recipeUnit, prices);
      const price = priceMatch && priceMatch.price;
      const inventoryOnHand = inventory[requirement.key];
      const onHand = inventoryOnHand == null ? positiveOrZero_(prior && prior.on_hand_quantity) : positiveOrZero_(inventoryOnHand);
      const qualitativeOnly = !requirement.requiredQuantity && Boolean(requirement.requirementText);
      const toPurchase = qualitativeOnly ? 0 : roundQuantity_(Math.max(requirement.requiredQuantity - onHand, 0));
      const packageQuantity = positiveNumber_(priceMatch && priceMatch.converted, 0);
      const packagesNeeded = packageQuantity ? Math.ceil(toPurchase / packageQuantity) : 0;
      const estimatedCost = price ? roundMoney_(packagesNeeded * positiveNumber_(price.package_price, 0)) : 0;
      const record = {
        purchase_item_id: prior ? prior.purchase_item_id : id_("buy"), event_id: eventId,
        ingredient_name: requirement.ingredientName, recipe_unit: requirement.recipeUnit,
        required_quantity: requirement.requiredQuantity, on_hand_quantity: onHand, to_purchase_quantity: toPurchase,
        package_description: price ? price.package_description : "", package_quantity: packageQuantity, package_price: price ? positiveNumber_(price.package_price, 0) : 0,
        packages_needed: packagesNeeded, estimated_cost: estimatedCost, supplier: price ? price.supplier : "",
        sku: price ? price.sku : "", status: prior ? clean_(prior.status, 50) || (qualitativeOnly ? "As needed" : "Needed") : (qualitativeOnly ? "As needed" : "Needed"),
        notes: prior ? clean_(prior.notes, 1000) : "", source_json: JSON.stringify({ requirements: requirement.sources, price: price ? { priceId: price.price_id, productName: price.product_name || price.ingredient_name, packageUnit: price.package_unit || price.recipe_unit, checkedAt: price.checked_at, freshness: price.freshness, priceType: price.price_type, storeLocation: price.store_location, productUrl: price.product_url } : null }),
        active: "TRUE", updated_at: now, updated_by: teacher.email, requirement_text: requirement.requirementText
      };
      if (prior) updateRecord_(SHEETS.EVENT_PURCHASES, "purchase_item_id", prior.purchase_item_id, record);
      else appendRecord_(SHEETS.EVENT_PURCHASES, record);
      activeIds.push(record.purchase_item_id);
    });
    existing.filter(item => String(item.active || "TRUE").toUpperCase() !== "FALSE" && !activeIds.includes(item.purchase_item_id)).forEach(item => {
      updateRecord_(SHEETS.EVENT_PURCHASES, "purchase_item_id", item.purchase_item_id, { active: "FALSE", updated_at: now, updated_by: teacher.email });
    });
    const costing = eventCosting_(eventId);
    const costSnapshotJson = JSON.stringify({ schemaVersion: 1, eventId, estimatedTotal: costing.estimatedTotal, unpricedCount: costing.unpricedCount, items: costing.items });
    assertSnapshotFits_(costSnapshotJson);
    appendRecord_(SHEETS.COST_SNAPSHOTS, {
      cost_snapshot_id: id_("cost"), event_id: eventId, created_at: now, created_by: teacher.email,
      estimated_total: costing.estimatedTotal, unpriced_count: costing.unpricedCount,
      snapshot_json: costSnapshotJson
    });
    audit_(teacher.email, "generate_purchase_plan", "event", eventId, { estimatedTotal: costing.estimatedTotal, unpricedCount: costing.unpricedCount });
    return costing;
  });
}

function updateEventPurchaseItem(purchaseItemId, input) {
  const teacher = assertTeacher_();
  return withLock_(() => {
    const item = findRecord_(SHEETS.EVENT_PURCHASES, "purchase_item_id", purchaseItemId);
    if (!item || String(item.active || "TRUE").toUpperCase() === "FALSE") throw new Error("Purchase item not found.");
    const statuses = ["Needed", "Ordered", "Purchased", "Received", "Substituted", "Unavailable", "Not needed", "As needed"];
    const status = clean_(input && input.status, 50) || "Needed";
    if (!statuses.includes(status)) throw new Error("Invalid purchasing status.");
    const onHand = positiveOrZero_(input && input.on_hand_quantity);
    const required = positiveOrZero_(item.required_quantity);
    const qualitativeOnly = !required && Boolean(clean_(item.requirement_text, 200));
    const toPurchase = qualitativeOnly ? 0 : roundQuantity_(Math.max(required - onHand, 0));
    const packageQuantity = positiveNumber_(item.package_quantity, 0);
    const packagesNeeded = packageQuantity ? Math.ceil(toPurchase / packageQuantity) : 0;
    const packagePrice = positiveNumber_(item.package_price, 0);
    const patch = {
      on_hand_quantity: onHand, to_purchase_quantity: toPurchase, packages_needed: packagesNeeded,
      estimated_cost: roundMoney_(packagesNeeded * packagePrice), status,
      notes: clean_(input && input.notes, 1000), updated_at: new Date().toISOString(), updated_by: teacher.email
    };
    updateRecord_(SHEETS.EVENT_PURCHASES, "purchase_item_id", purchaseItemId, patch);
    if (FEATURES.INVENTORY && status === "Received" && !records_(SHEETS.INVENTORY_TRANSACTIONS).some(transaction => String(transaction.source_id) === String(purchaseItemId) && transaction.transaction_type === "Receipt")) {
      const quantityReceived = roundQuantity_(positiveOrZero_(patch.packages_needed) * positiveOrZero_(item.package_quantity));
      if (quantityReceived > 0) {
        const inventoryItem = ensureInventoryItem_(item.ingredient_name, item.recipe_unit, teacher.email);
        appendInventoryTransaction_(inventoryItem, {
          eventId: item.event_id, type: "Receipt", quantity: quantityReceived,
          unitCost: quantityReceived ? roundMoney_(positiveOrZero_(patch.estimated_cost) / quantityReceived) : 0,
          vendor: item.supplier, sourceId: purchaseItemId, transactionDate: new Date().toISOString().slice(0, 10),
          notes: `Received from event purchase plan: ${item.package_description || item.ingredient_name}`, actor: teacher.email
        });
      }
    }
    audit_(teacher.email, "update_purchase_item", "event", item.event_id, { purchaseItemId, status, onHand });
    return eventCosting_(item.event_id);
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
      unpublished_at: "", unpublished_by: "", archived_at: "", archived_by: "", source_event_id: "",
      event_budget: "", budget_account_id: ""
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
      event_budget: roundMoney_(positiveOrZero_(input.event_budget)),
      budget_account_id: clean_(input.budget_account_id, 100),
      menu_json: JSON.stringify(normalizeMenu_(input.menu)),
      tasks_json: JSON.stringify(normalizeTasks_(input.tasks))
    };
    const changed = Object.keys(patch).some(field => String(existing[field] || "") !== String(patch[field] || ""));
    if (!changed) return existing;
    const publicChanged = Object.keys(patch).filter(field => !["event_budget", "budget_account_id"].includes(field)).some(field => String(existing[field] || "") !== String(patch[field] || ""));
    const currentPublication = publicationStatus_(existing);
    patch.publication_status = publicChanged && currentPublication === "Published" ? "Revised draft" : currentPublication;
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
    if (status === "Completed" && !finalizedCloseout_(eventId)) throw new Error("Complete this event from its Closeout tab so the operational record is preserved.");
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

function saveEventCloseout(input, finalize) {
  const teacher = assertTeacher_();
  if (!input || !input.event_id) throw new Error("event_id is required.");
  return withLock_(() => {
    const event = findRecord_(SHEETS.EVENTS, "event_id", input.event_id);
    if (!event) throw new Error("Event not found.");
    if (eventLifecycle_(event) === "Archived") throw new Error("Restore this event before saving its closeout.");
    const outcomes = ["Completed as planned", "Completed with changes", "Cancelled"];
    const outcome = clean_(input.outcome, 100) || "Completed as planned";
    if (!outcomes.includes(outcome)) throw new Error("Choose a valid closeout outcome.");
    const guestValue = Number(input.actual_guest_count);
    if (!Number.isFinite(guestValue) || guestValue < 0) throw new Error("Actual guests / orders must be zero or greater.");
    const completedOn = clean_(input.completed_on, 20) || clean_(event.service_date, 20) || new Date().toISOString().slice(0, 10);
    const actualCostValue = Number(input.actual_cost);
    if (!Number.isFinite(actualCostValue) || actualCostValue < 0) throw new Error("Actual cost must be zero or greater.");
    const actualCost = roundMoney_(actualCostValue);
    const linkedSpend = eventActualSpend_(event.event_id);
    const existing = records_(SHEETS.EVENT_CLOSEOUTS).find(item => String(item.event_id) === String(event.event_id));
    const now = new Date().toISOString();
    const isFinal = Boolean(finalize) || Boolean(existing && existing.finalized_at);
    const record = {
      closeout_id: existing ? existing.closeout_id : id_("closeout"), event_id: event.event_id,
      completed_on: completedOn, outcome, actual_guest_count: Math.round(guestValue), actual_cost: actualCost,
      actual_cost_source: actualCost === linkedSpend ? "Posted event transactions" : "Teacher confirmed",
      customer_feedback: clean_(input.customer_feedback, 4000), successes: clean_(input.successes, 4000),
      issues: clean_(input.issues, 4000), follow_up: clean_(input.follow_up, 4000),
      finalized_at: isFinal ? (existing && existing.finalized_at || now) : "",
      finalized_by: isFinal ? (existing && existing.finalized_by || teacher.email) : "",
      created_at: existing ? existing.created_at : now, created_by: existing ? existing.created_by : teacher.email,
      updated_at: now, updated_by: teacher.email
    };
    if (existing) updateRecord_(SHEETS.EVENT_CLOSEOUTS, "closeout_id", record.closeout_id, record);
    else appendRecord_(SHEETS.EVENT_CLOSEOUTS, record);
    if (finalize) {
      updateRecord_(SHEETS.EVENTS, "event_id", event.event_id, {
        lifecycle_status: "Completed", stage: displayStage_("Completed", publicationStatus_(event)),
        updated_at: now, updated_by: teacher.email
      });
    }
    audit_(teacher.email, finalize ? "complete_event" : "save_closeout", "event", event.event_id, {
      closeoutId: record.closeout_id, outcome, actualGuestCount: record.actual_guest_count,
      actualCost, actualCostSource: record.actual_cost_source
    });
    return eventCloseout_(event.event_id);
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
  normalizeTasks_(parseJson_(event.tasks_json, [])).forEach(task => {
    body.appendParagraph(`${task.teamLabel || "Team"} · ${task.station || "Station pending"} · ${task.name}`).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph([task.phase, task.startTime && `Start ${task.startTime}`, task.deadline && `Due ${task.deadline}`, task.durationMinutes && `${task.durationMinutes} minutes`, task.quantity, task.status, task.instructions].filter(Boolean).join(" · "));
    if (task.dependsOn.length) body.appendParagraph(`Depends on: ${task.dependsOn.join(", ")}`);
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
  const costing = eventCosting_(eventId);
  if (costing.items.length) {
    body.appendParagraph("Private costing and purchasing").setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(`Estimated food cost: $${costing.estimatedFoodCost.toFixed(2)} · Cost per guest: $${costing.costPerGuest.toFixed(2)} · Estimated purchase total: $${costing.estimatedTotal.toFixed(2)} · Unpriced ingredients: ${costing.unpricedCount}`);
    if (costing.eventBudget) body.appendParagraph(`Event budget: $${costing.eventBudget.toFixed(2)} · Remaining after estimated purchases: $${costing.budgetVariance.toFixed(2)}`);
    costing.items.forEach(item => {
      const requirement = [item.required_quantity ? `${item.required_quantity} ${item.recipe_unit}`.trim() : "", item.requirement_text].filter(Boolean).join(" · ") || "As needed";
      body.appendParagraph(`${item.ingredient_name} · ${requirement}`).setHeading(DocumentApp.ParagraphHeading.HEADING2);
      body.appendParagraph(item.requirement_text && !item.required_quantity ? `Qualitative requirement · Status: ${item.status || "As needed"}` : `On hand: ${item.on_hand_quantity} · Purchase: ${item.to_purchase_quantity} · Packages: ${item.packages_needed || "Unpriced"} · Estimated cost: $${Number(item.estimated_cost || 0).toFixed(2)} · Status: ${item.status || "Needed"}`);
      if (item.supplier || item.package_description || item.sku) body.appendParagraph(`Supplier: ${item.supplier || "Pending"} · Package: ${item.package_description || "Pending"} · SKU: ${item.sku || "Pending"}`);
      if (item.notes) body.appendParagraph(`Purchasing notes: ${item.notes}`);
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

function generateKitchenManagementDocument(eventId) {
  const teacher = assertTeacher_();
  const event = findRecord_(SHEETS.EVENTS, "event_id", eventId);
  if (!event) throw new Error("Event not found.");
  if (eventLifecycle_(event) === "Archived") throw new Error("Restore this event before generating documents.");
  const plan = analyzeProductionPlan_(event);
  const tasks = plan.tasks.slice().sort((a, b) => {
    const aTime = timeMinutes_(a.startTime), bTime = timeMinutes_(b.startTime);
    return (aTime < 0 ? 9999 : aTime) - (bTime < 0 ? 9999 : bTime) || a.id.localeCompare(b.id);
  });
  const doc = DocumentApp.create(`${event.event_name} · Kitchen Management Plan`);
  const body = doc.getBody();
  body.appendParagraph("GCSD CULINARY PATHWAY").setHeading(DocumentApp.ParagraphHeading.SUBTITLE);
  body.appendParagraph(event.event_name).setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph(`Kitchen Management Plan · ${event.service_date || "Date pending"} · ${event.service_time || "Time pending"}`);
  body.appendTable([
    ["Location", event.location || event.school || "Pending"],
    ["Service format", event.service_format || "Pending"],
    ["Guests / orders", String(event.guest_count || 0)],
    ["Plan readiness", plan.ready ? "Ready" : "Needs review"]
  ]);
  if (plan.issues.length || plan.warnings.length) {
    body.appendParagraph("Readiness review").setHeading(DocumentApp.ParagraphHeading.HEADING1);
    plan.issues.forEach(value => body.appendListItem(`REQUIRED: ${value}`));
    plan.warnings.forEach(value => body.appendListItem(`REVIEW: ${value}`));
  }
  body.appendParagraph("Production timeline").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  tasks.forEach(task => {
    body.appendParagraph(`${task.startTime || "Time pending"} · ${task.id} · ${task.name}`).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph([task.phase, task.teamLabel, task.station, task.durationMinutes && `${task.durationMinutes} minutes`, task.deadline && `Due ${task.deadline}`, task.status].filter(Boolean).join(" · "));
    if (task.quantity) body.appendParagraph(`Production quantity: ${task.quantity}`);
    if (task.dependsOn.length) body.appendParagraph(`Depends on: ${task.dependsOn.join(", ")}`);
    if (task.instructions) body.appendParagraph(`Instructions: ${task.instructions}`);
    if (task.equipment.length) body.appendParagraph(`Equipment: ${task.equipment.join(", ")}`);
    if (task.qualityControls.length) body.appendParagraph(`Quality controls: ${task.qualityControls.join(" · ")}`);
    if (task.handoff) body.appendParagraph(`Handoff: ${task.handoff}`);
  });
  doc.saveAndClose();
  const folderId = PropertiesService.getScriptProperties().getProperty("DOCUMENT_FOLDER_ID");
  const file = DriveApp.getFileById(doc.getId());
  if (folderId) file.moveTo(DriveApp.getFolderById(folderId));
  const record = { document_id: id_("doc"), event_id: eventId, document_type: "Kitchen Management Plan", file_id: doc.getId(), file_url: doc.getUrl(), created_at: new Date().toISOString(), created_by: teacher.email };
  appendRecord_(SHEETS.DOCUMENTS, record);
  audit_(teacher.email, "generate", "document", record.document_id, { eventId, fileId: record.file_id });
  return record;
}

function updateProductionTaskStatus(eventId, taskId, status) {
  const teacher = assertTeacher_();
  const allowed = ["Not started", "Ready", "In progress", "Blocked", "Complete"];
  if (!allowed.includes(status)) throw new Error("Choose a valid production task status.");
  return withLock_(() => {
    const event = findRecord_(SHEETS.EVENTS, "event_id", eventId);
    if (!event) throw new Error("Event not found.");
    if (eventLifecycle_(event) === "Archived") throw new Error("Restore this event before changing task status.");
    const tasks = normalizeTasks_(parseJson_(event.tasks_json, []));
    const task = tasks.find(item => item.id === String(taskId));
    if (!task) throw new Error("Production task not found.");
    task.status = status;
    updateRecord_(SHEETS.EVENTS, "event_id", eventId, { tasks_json: JSON.stringify(tasks) });
    markEventOperationalChange_(event, teacher.email);
    audit_(teacher.email, "update_status", "production_task", `${eventId}:${task.id}`, { status });
    return task;
  });
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
    phase: clean_(task.phase || "Prep", 50),
    name: clean_(task.name || task.product, 300),
    quantity: clean_(task.quantity || task.detail, 200),
    startTime: clean_(task.startTime || task.start_time, 40),
    deadline: clean_(task.deadline, 100),
    durationMinutes: positiveInteger_(task.durationMinutes || task.duration_minutes, 0),
    dependsOn: list_(task.dependsOn || task.depends_on, 30, 100),
    status: clean_(task.status || "Not started", 50),
    instructions: clean_(task.instructions || task.studentDetails, 2000),
    equipment: list_(task.equipment, 30, 200),
    qualityControls: list_(task.qualityControls, 30, 300),
    handoff: clean_(task.handoff || task.dependency, 500)
  })).filter(task => task.name);
}

function analyzeProductionPlan_(event) {
  const tasks = normalizeTasks_(parseJson_(event.tasks_json, []));
  const issues = [];
  const warnings = [];
  const ids = new Set(tasks.map(task => task.id));
  const duplicateIds = tasks.map(task => task.id).filter((id, index, all) => all.indexOf(id) !== index);
  [...new Set(duplicateIds)].forEach(id => issues.push(`Duplicate task ID: ${id}`));
  tasks.forEach(task => {
    task.dependsOn.filter(id => !ids.has(id)).forEach(id => issues.push(`${task.id} depends on missing task ${id}`));
    if (!task.startTime || !task.durationMinutes) warnings.push(`${task.id} needs a start time and duration for conflict checking`);
    if (task.status === "Blocked") issues.push(`${task.id} is blocked`);
  });
  const visiting = new Set(), visited = new Set();
  const byId = Object.fromEntries(tasks.map(task => [task.id, task]));
  tasks.forEach(task => task.dependsOn.forEach(dependencyId => {
    const dependency = byId[dependencyId], taskStart = timeMinutes_(task.startTime);
    if (!dependency) return;
    const dependencyStart = timeMinutes_(dependency.startTime);
    if (taskStart >= 0 && dependencyStart >= 0 && dependency.durationMinutes && taskStart < dependencyStart + dependency.durationMinutes) {
      issues.push(`${task.id} starts before ${dependencyId} is scheduled to finish`);
    }
  }));
  function visit(id) {
    if (visiting.has(id)) { issues.push(`Dependency cycle includes ${id}`); return; }
    if (visited.has(id) || !byId[id]) return;
    visiting.add(id); byId[id].dependsOn.forEach(visit); visiting.delete(id); visited.add(id);
  }
  tasks.forEach(task => visit(task.id));
  const conflicts = [];
  for (let i = 0; i < tasks.length; i += 1) for (let j = i + 1; j < tasks.length; j += 1) {
    const a = tasks[i], b = tasks[j], aStart = timeMinutes_(a.startTime), bStart = timeMinutes_(b.startTime);
    if (aStart < 0 || bStart < 0 || !a.durationMinutes || !b.durationMinutes) continue;
    const shared = a.equipment.filter(item => b.equipment.some(other => other.toLowerCase() === item.toLowerCase()));
    if (shared.length && aStart < bStart + b.durationMinutes && bStart < aStart + a.durationMinutes) conflicts.push({ taskA: a.id, taskB: b.id, equipment: shared });
  }
  conflicts.forEach(item => issues.push(`${item.taskA} and ${item.taskB} overlap on ${item.equipment.join(", ")}`));
  return { tasks, issues: [...new Set(issues)], warnings: [...new Set(warnings)], conflicts, ready: tasks.length > 0 && issues.length === 0 && tasks.every(task => task.status !== "Blocked") };
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
      quantityText: clean_(item && (item.quantityText || item.quantity_text), 100),
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
    quantityText: clean_(item && (item.quantityText || item.quantity_text), 100),
    unit: clean_(item && item.unit, 100), preparation: clean_(item && item.preparation, 300)
  })).filter(item => item.name);
}

function recipeApprovalIssues_(recipe) {
  const issues = [];
  const ingredients = normalizeRecipeIngredients_(parseJson_(recipe.ingredients_json, []));
  if (!String(recipe.name || "").trim()) issues.push("name is missing");
  if (!positiveNumber_(recipe.standard_yield_quantity, 0)) issues.push("standard yield must be greater than zero");
  if (!String(recipe.standard_yield_unit || "").trim()) issues.push("yield unit is missing");
  if (!ingredients.length) issues.push("ingredients are empty");
  ingredients.forEach((ingredient, index) => {
    const numeric = positiveNumber_(ingredient.quantity, 0);
    const qualitative = String(ingredient.quantityText || "").trim();
    if (!numeric && !qualitative) issues.push(`ingredient ${index + 1} (${ingredient.name}) needs a positive quantity or an instruction such as to taste`);
    if (numeric && !String(ingredient.unit || "").trim()) issues.push(`ingredient ${index + 1} (${ingredient.name}) needs a unit`);
  });
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
    if (!positiveNumber_(item.quantity, 0) && item.quantityText) {
      return [item.name, item.quantityText, item.preparation ? `(${item.preparation})` : ""].filter(Boolean).join(" ");
    }
    const scaled = roundQuantity_(item.quantity * factor);
    return [scaled || "", item.unit, item.name, item.preparation ? `(${item.preparation})` : ""].filter(value => value !== "").join(" ");
  });
  return {
    name: clean_(recipe.name, 300), version: Number(recipe.version || attachment.recipe_version || 0),
    yield: `${roundQuantity_(productionTarget)} ${clean_(recipe.standardYieldUnit, 100)}`.trim(),
    standardYieldQuantity: positiveNumber_(recipe.standardYieldQuantity, 0), standardYieldUnit: clean_(recipe.standardYieldUnit, 100),
    productionTarget: roundQuantity_(productionTarget), ingredientData: normalizeRecipeIngredients_(recipe.ingredients || []),
    portion: clean_(recipe.portionSize, 200), ingredients,
    equipment: list_(recipe.equipment, 100, 200), procedure: list_(recipe.procedure, 200, 1000),
    allergens: clean_(recipe.allergens, 2000), safetyControls: clean_(recipe.safetyControls, 4000),
    qualityControls: list_(recipe.qualityControls, 100, 500), competencies: clean_(recipe.competencies, 2000),
    scaleFactor: roundQuantity_(factor), overagePercent: overage
  };
}

function activeIngredientPrices_() {
  return records_(SHEETS.INGREDIENT_PRICES)
    .filter(item => String(item.active || "TRUE").toUpperCase() !== "FALSE")
    .map(item => {
      const checkedAt = clean_(item.checked_at || String(item.updated_at || "").slice(0, 10), 20);
      const ageDays = checkedAt ? Math.max(0, Math.floor((Date.now() - new Date(`${checkedAt}T12:00:00Z`).getTime()) / 86400000)) : null;
      return Object.assign({}, item, {
        aliases: parseJson_(item.aliases_json, []), package_unit: canonicalUnit_(item.package_unit || item.recipe_unit),
        checked_at: checkedAt, age_days: ageDays, freshness: ageDays == null ? "unknown" : ageDays > 45 ? "stale" : ageDays > 30 ? "aging" : "current"
      });
    })
    .sort((a, b) => String(a.ingredient_name).localeCompare(String(b.ingredient_name)) || String(a.recipe_unit).localeCompare(String(b.recipe_unit)));
}

function normalizeIngredientName_(value) {
  return clean_(value, 300).toLowerCase().replace(/\([^)]*\)/g, " ").replace(/\b(fresh|diced|minced|chopped|sliced|grated|shredded|melted|softened|cold|large|small)\b/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function canonicalUnit_(value) {
  const unit = clean_(value, 100).toLowerCase().replace(/\./g, "").trim();
  const aliases = { pound: "lb", pounds: "lb", lbs: "lb", ounce: "oz", ounces: "oz", fluidounce: "fl oz", "fluid ounce": "fl oz", "fluid ounces": "fl oz", floz: "fl oz", gallon: "gal", gallons: "gal", quart: "qt", quarts: "qt", pint: "pt", pints: "pt", cups: "cup", tablespoons: "tbsp", tablespoon: "tbsp", teaspoons: "tsp", teaspoon: "tsp", count: "each", ea: "each", item: "each", items: "each" };
  return aliases[unit] || unit;
}

function unitBase_(quantity, unit) {
  const canonical = canonicalUnit_(unit);
  const factors = { lb: ["mass", 16], oz: ["mass", 1], gal: ["volume", 128], qt: ["volume", 32], pt: ["volume", 16], cup: ["volume", 8], "fl oz": ["volume", 1], tbsp: ["volume", 0.5], tsp: ["volume", 1 / 6], each: ["count", 1] };
  const factor = factors[canonical];
  return factor ? { dimension: factor[0], quantity: positiveNumber_(quantity, 0) * factor[1] } : null;
}

function convertQuantity_(quantity, fromUnit, toUnit) {
  const from = unitBase_(quantity, fromUnit), to = unitBase_(1, toUnit);
  return from && to && from.dimension === to.dimension ? roundQuantity_(from.quantity / to.quantity) : 0;
}

function findIngredientPrice_(name, recipeUnit, prices) {
  const target = normalizeIngredientName_(name), unit = canonicalUnit_(recipeUnit);
  const candidates = (prices || []).map(price => {
    const names = [price.ingredient_name, price.product_name].concat(price.aliases || parseJson_(price.aliases_json, [])).map(normalizeIngredientName_).filter(Boolean);
    const nameScore = names[0] === target ? 100 : names.includes(target) ? 90 : names.some(alias => alias.length > 3 && (target.includes(alias) || alias.includes(target))) ? 60 : 0;
    const packageUnit = canonicalUnit_(price.package_unit || price.recipe_unit);
    const converted = convertQuantity_(price.package_quantity, packageUnit, unit);
    return nameScore && converted ? { price, score: nameScore + (price.freshness === "current" ? 5 : 0), converted } : null;
  }).filter(Boolean).sort((a, b) => b.score - a.score || String(b.price.checked_at).localeCompare(String(a.price.checked_at)));
  return candidates[0] || null;
}

function ingredientRequirements_(eventId) {
  const aggregate = {};
  eventRecipeRecords_(eventId).forEach(attachment => {
    const recipe = parseJson_(attachment.snapshot_json, {});
    const standardYield = positiveNumber_(recipe.standardYieldQuantity, 0);
    const target = positiveNumber_(attachment.required_quantity, 0) * (1 + boundedNumber_(attachment.overage_percent, 0, 100, 0) / 100);
    const factor = standardYield ? target / standardYield : 0;
    const ingredients = normalizeRecipeIngredients_(recipe.ingredients || []);
    const invalid = ingredients.filter(ingredient => (!positiveNumber_(ingredient.quantity, 0) && !String(ingredient.quantityText || "").trim()) || (positiveNumber_(ingredient.quantity, 0) && !String(ingredient.unit || "").trim()));
    if (invalid.length) throw new Error(`Pinned recipe ${clean_(recipe.name, 300)} version ${Number(recipe.version || attachment.recipe_version || 0)} has ingredients missing a usable quantity or unit: ${invalid.map(item => item.name).join(", ")}. Correct and approve the recipe, then refresh the event attachment.`);
    ingredients.forEach(ingredient => {
      const key = ingredientKey_(ingredient.name, ingredient.unit);
      if (!aggregate[key]) aggregate[key] = { key, ingredientName: ingredient.name, recipeUnit: ingredient.unit, requiredQuantity: 0, qualitative: [], sources: [] };
      const quantity = positiveNumber_(ingredient.quantity, 0) ? roundQuantity_(ingredient.quantity * factor) : 0;
      aggregate[key].requiredQuantity = roundQuantity_(aggregate[key].requiredQuantity + quantity);
      if (ingredient.quantityText && !aggregate[key].qualitative.includes(ingredient.quantityText)) aggregate[key].qualitative.push(ingredient.quantityText);
      aggregate[key].sources.push({ menuItemName: attachment.menu_item_name, recipeId: attachment.recipe_id, recipeVersion: Number(attachment.recipe_version || 0), quantity, quantityText: ingredient.quantityText || "" });
    });
  });
  return Object.keys(aggregate).map(key => {
    const item = aggregate[key];
    item.requirementText = item.qualitative.length ? `${item.requiredQuantity ? "plus " : ""}${item.qualitative.join(" / ")}` : "";
    return item;
  }).sort((a, b) => a.ingredientName.localeCompare(b.ingredientName) || a.recipeUnit.localeCompare(b.recipeUnit));
}

function eventCosting_(eventId) {
  const items = records_(SHEETS.EVENT_PURCHASES)
    .filter(item => String(item.event_id) === String(eventId) && String(item.active || "TRUE").toUpperCase() !== "FALSE")
    .map(item => Object.assign({}, item, {
      required_quantity: positiveOrZero_(item.required_quantity), on_hand_quantity: positiveOrZero_(item.on_hand_quantity),
      to_purchase_quantity: positiveOrZero_(item.to_purchase_quantity), package_quantity: positiveOrZero_(item.package_quantity),
      package_price: positiveOrZero_(item.package_price), packages_needed: positiveOrZero_(item.packages_needed),
      estimated_cost: positiveOrZero_(item.estimated_cost), requirement_text: clean_(item.requirement_text, 200), sources: parseJson_(item.source_json, [])
    }))
    .sort((a, b) => String(a.ingredient_name).localeCompare(String(b.ingredient_name)) || String(a.recipe_unit).localeCompare(String(b.recipe_unit)));
  const event = findRecord_(SHEETS.EVENTS, "event_id", eventId) || {};
  const estimatedFoodCost = roundMoney_(items.reduce((total, item) => {
    const required = positiveOrZero_(item.required_quantity), packageQuantity = positiveOrZero_(item.package_quantity), packagePrice = positiveOrZero_(item.package_price);
    return total + (required && packageQuantity && packagePrice ? required / packageQuantity * packagePrice : 0);
  }, 0));
  const estimatedTotal = roundMoney_(items.reduce((total, item) => total + positiveOrZero_(item.estimated_cost), 0));
  const eventBudget = roundMoney_(positiveOrZero_(event.event_budget));
  return {
    items,
    estimatedTotal,
    estimatedFoodCost,
    costPerGuest: positiveInteger_(event.guest_count, 0) ? roundMoney_(estimatedFoodCost / positiveInteger_(event.guest_count, 0)) : 0,
    eventBudget,
    budgetVariance: eventBudget ? roundMoney_(eventBudget - estimatedTotal) : 0,
    budgetAccountId: clean_(event.budget_account_id, 100),
    unpricedCount: items.filter(item => positiveNumber_(item.required_quantity, 0) && (!positiveNumber_(item.package_quantity, 0) || !positiveNumber_(item.package_price, 0))).length,
    stalePriceCount: items.filter(item => parseJson_(item.source_json, {}).price && parseJson_(item.source_json, {}).price.freshness === "stale").length,
    latestSnapshot: records_(SHEETS.COST_SNAPSHOTS).filter(item => String(item.event_id) === String(eventId)).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] || null
  };
}

function eventActualSpend_(eventId) {
  return roundMoney_(records_(SHEETS.BUDGET_TRANSACTIONS)
    .filter(item => String(item.event_id) === String(eventId) && item.status === "Posted" && ["Expense", "Credit"].includes(item.transaction_type))
    .reduce((sum, item) => sum + (item.transaction_type === "Credit" ? -positiveOrZero_(item.amount) : positiveOrZero_(item.amount)), 0));
}

function finalizedCloseout_(eventId) {
  return records_(SHEETS.EVENT_CLOSEOUTS).find(item => String(item.event_id) === String(eventId) && Boolean(item.finalized_at)) || null;
}

function eventCloseout_(eventId) {
  const event = findRecord_(SHEETS.EVENTS, "event_id", eventId) || {};
  const costing = eventCosting_(eventId);
  const linkedSpend = eventActualSpend_(eventId);
  const existing = records_(SHEETS.EVENT_CLOSEOUTS).find(item => String(item.event_id) === String(eventId)) || null;
  const tasks = normalizeTasks_(parseJson_(event.tasks_json, []));
  const followsPostedSpend = existing && !existing.finalized_at && existing.actual_cost_source === "Posted event transactions";
  const actualCost = existing && !followsPostedSpend && String(existing.actual_cost).trim() !== "" ? roundMoney_(positiveOrZero_(existing.actual_cost)) : linkedSpend;
  const record = existing || {
    closeout_id: "", event_id: eventId, completed_on: event.service_date || "", outcome: "Completed as planned",
    actual_guest_count: positiveInteger_(event.guest_count, 0), actual_cost: actualCost,
    actual_cost_source: "Posted event transactions",
    customer_feedback: "", successes: "", issues: "", follow_up: "", finalized_at: "", finalized_by: ""
  };
  return Object.assign({}, record, {
    actual_guest_count: Number(record.actual_guest_count || 0), actual_cost: actualCost,
    summary: {
      plannedGuestCount: positiveInteger_(event.guest_count, 0),
      estimatedFoodCost: costing.estimatedFoodCost,
      estimatedPurchaseTotal: costing.estimatedTotal,
      eventBudget: costing.eventBudget,
      linkedPostedSpend: linkedSpend,
      actualCost,
      budgetRemaining: costing.eventBudget ? roundMoney_(costing.eventBudget - actualCost) : 0,
      taskCount: tasks.length,
      completedTaskCount: tasks.filter(task => task.status === "Complete").length,
      publicationStatus: publicationStatus_(event)
    }
  });
}

function eventWorkflow_(event, context) {
  const menu = parseJson_(event.menu_json, []);
  const tasks = normalizeTasks_(parseJson_(event.tasks_json, []));
  const attachedNames = new Set((context.eventRecipes || []).map(item => String(item.menu_item_name).toLowerCase()));
  const menuMissingRecipes = menu.filter(item => !attachedNames.has(String(item.name).toLowerCase())).length;
  const purchaseReady = Boolean(context.costing.latestSnapshot) && context.costing.unpricedCount === 0;
  const documentTypes = new Set((context.documents || []).map(item => item.document_type));
  const finalized = Boolean(context.closeout && context.closeout.finalized_at);
  const steps = [
    { id: "details", label: "Confirm event details", complete: Boolean(event.event_name && event.service_date && positiveInteger_(event.guest_count, 0)), section: "overview" },
    { id: "menu", label: "Build menu", complete: menu.length > 0, section: "production" },
    { id: "recipes", label: "Attach approved recipes", complete: menu.length > 0 && menuMissingRecipes === 0, section: "production", optional: true },
    { id: "purchasing", label: "Price purchase plan", complete: purchaseReady, section: "costing" },
    { id: "production", label: "Ready production plan", complete: tasks.length > 0 && context.productionPlan.ready, section: "production" },
    { id: "documents", label: "Generate kitchen plan", complete: documentTypes.has("Kitchen Management Plan"), section: "documents", optional: true },
    { id: "publication", label: event.publication_status === "Published" ? "Student plan published" : "Publish student plan", complete: event.publication_status === "Published", section: "publication" },
    { id: "closeout", label: "Complete event closeout", complete: finalized, section: "closeout" }
  ];
  const next = steps.find(step => !step.complete && !step.optional) || steps.find(step => !step.complete) || null;
  return { steps, next, completeCount: steps.filter(step => step.complete).length, totalCount: steps.length };
}

function activeBudgetAccounts_() {
  return records_(SHEETS.BUDGET_ACCOUNTS).filter(item => String(item.active || "TRUE").toUpperCase() !== "FALSE");
}

function activeInventoryItems_() {
  return records_(SHEETS.INVENTORY_ITEMS).filter(item => String(item.active || "TRUE").toUpperCase() !== "FALSE");
}

function financeDashboard_() {
  const transactions = records_(SHEETS.BUDGET_TRANSACTIONS).sort((a, b) => String(b.transaction_date || b.created_at).localeCompare(String(a.transaction_date || a.created_at)));
  const receipts = records_(SHEETS.RECEIPTS).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map(receiptView_);
  const accounts = activeBudgetAccounts_().map(account => {
    const rows = transactions.filter(item => String(item.budget_account_id) === String(account.budget_account_id));
    const committed = roundMoney_(rows.filter(item => item.transaction_type === "Commitment" && item.status === "Active").reduce((sum, item) => sum + positiveOrZero_(item.amount), 0));
    const expenses = rows.filter(item => item.status === "Posted" && ["Expense", "Credit"].includes(item.transaction_type));
    const spent = roundMoney_(expenses.reduce((sum, item) => sum + (item.transaction_type === "Credit" ? -positiveOrZero_(item.amount) : positiveOrZero_(item.amount)), 0));
    const allocated = roundMoney_(positiveOrZero_(account.allocated_amount));
    return Object.assign({}, account, { allocated, committed, spent, available: roundMoney_(allocated - committed - spent) });
  });
  const inventoryTransactions = FEATURES.INVENTORY ? records_(SHEETS.INVENTORY_TRANSACTIONS).sort((a, b) => String(b.transaction_date || b.created_at).localeCompare(String(a.transaction_date || a.created_at))) : [];
  const inventory = (FEATURES.INVENTORY ? activeInventoryItems_() : []).map(item => {
    const movements = inventoryTransactions.filter(transaction => String(transaction.inventory_item_id) === String(item.inventory_item_id));
    const quantityOnHand = roundQuantity_(positiveOrZero_(item.opening_quantity) + movements.reduce((sum, transaction) => sum + Number(transaction.quantity || 0), 0));
    const reorderLevel = positiveOrZero_(item.reorder_level);
    return Object.assign({}, item, { quantityOnHand, reorderLevel, needsReorder: reorderLevel > 0 && quantityOnHand <= reorderLevel });
  }).sort((a, b) => String(a.ingredient_name).localeCompare(String(b.ingredient_name)));
  return {
    accounts, transactions: transactions.slice(0, 100), receipts: receipts.slice(0, 100), inventory, inventoryTransactions: inventoryTransactions.slice(0, 100),
    summary: {
      allocated: roundMoney_(accounts.reduce((sum, item) => sum + item.allocated, 0)),
      committed: roundMoney_(accounts.reduce((sum, item) => sum + item.committed, 0)),
      spent: roundMoney_(accounts.reduce((sum, item) => sum + item.spent, 0)),
      available: roundMoney_(accounts.reduce((sum, item) => sum + item.available, 0)),
      lowStock: inventory.filter(item => item.needsReorder).length,
      receiptDrafts: receipts.filter(item => item.status === "Draft").length
    }
  };
}

function inventoryQuantityByKey_() {
  return Object.fromEntries(financeDashboard_().inventory.map(item => [ingredientKey_(item.ingredient_name, item.inventory_unit), item.quantityOnHand]));
}

function ensureInventoryItem_(name, unit, actor) {
  const existing = activeInventoryItems_().find(item => ingredientKey_(item.ingredient_name, item.inventory_unit) === ingredientKey_(name, unit));
  if (existing) return existing;
  const now = new Date().toISOString();
  const record = {
    inventory_item_id: id_("stock"), ingredient_name: clean_(name, 300), inventory_unit: clean_(unit, 100),
    opening_quantity: 0, reorder_level: 0, storage_location: "", notes: "Created from received event purchase",
    active: "TRUE", updated_at: now, updated_by: actor
  };
  appendRecord_(SHEETS.INVENTORY_ITEMS, record);
  return record;
}

function appendInventoryTransaction_(item, input) {
  const now = new Date().toISOString();
  const record = {
    inventory_transaction_id: id_("stocktx"), inventory_item_id: item.inventory_item_id,
    event_id: clean_(input.eventId, 100), transaction_type: clean_(input.type, 50), quantity: roundQuantity_(Number(input.quantity)),
    unit_cost: roundMoney_(positiveOrZero_(input.unitCost)), vendor: clean_(input.vendor, 200), source_id: clean_(input.sourceId, 200),
    transaction_date: clean_(input.transactionDate, 20) || now.slice(0, 10), notes: clean_(input.notes, 1000), created_at: now, created_by: input.actor
  };
  appendRecord_(SHEETS.INVENTORY_TRANSACTIONS, record);
  audit_(input.actor, "record_inventory_transaction", "inventory_transaction", record.inventory_transaction_id, { inventoryItemId: item.inventory_item_id, eventId: record.event_id, type: record.transaction_type, quantity: record.quantity });
  return record;
}

function ingredientKey_(name, unit) { return `${normalizeIngredientName_(name)}|${canonicalUnit_(unit)}`; }

function safeHttpUrl_(value) {
  const url = clean_(value, 1000);
  return /^https:\/\/[a-z0-9.-]+(?:\/|$)/i.test(url) ? url : "";
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
  const plan = analyzeProductionPlan_(event);
  plan.issues.forEach((message, index) => issue(`production_plan_${index + 1}`, "tasks_text", message));
  plan.warnings.forEach((message, index) => warn(`production_plan_${index + 1}`, "tasks_text", message));
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
      if (["Archived", "Completed"].includes(item.lifecycle_status) || !item.service_date) return false;
      const date = new Date(`${item.service_date}T00:00:00`);
      return !Number.isNaN(date.getTime()) && date >= today && date <= soon;
    }).length,
    attention: events.filter(item => !["Archived", "Completed"].includes(item.lifecycle_status) && item.publication_issues.length).length,
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
  if ([SHEETS.PUBLICATIONS, SHEETS.PUBLICATION_ITEMS, SHEETS.RECIPE_VERSIONS, SHEETS.COST_SNAPSHOTS, SHEETS.INVENTORY_TRANSACTIONS, SHEETS.AUDIT].includes(sheetName)) {
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
function positiveOrZero_(value) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : 0; }
function boundedNumber_(value, min, max, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : Number(fallback || 0); }
function roundQuantity_(value) { const number = Number(value); return Number.isFinite(number) ? Math.round(number * 1000) / 1000 : 0; }
function roundMoney_(value) { const number = Number(value); return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0; }
function timeMinutes_(value) { const match = clean_(value, 40).match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i); if (!match) return -1; let hour = Number(match[1]), minute = Number(match[2]); if (minute > 59 || hour > (match[3] ? 12 : 23)) return -1; if (match[3]) { if (hour === 12) hour = 0; if (match[3].toUpperCase() === "PM") hour += 12; } return hour * 60 + minute; }
function parseJson_(value, fallback) { try { return typeof value === "string" ? JSON.parse(value || "null") || fallback : (value || fallback); } catch (_) { return fallback; } }
function list_(value, limit, max) { const items = Array.isArray(value) ? value : String(value || "").split(/\n|,/); return items.map(item => clean_(item, max)).filter(Boolean).slice(0, limit); }
function menuFromText_(value) { return String(value || "").split(/\n|,/).map(name => ({ name: clean_(name, 300), required: 0 })).filter(item => item.name); }
function isoDate_(value) { if (!value) return ""; const date = value instanceof Date ? value : new Date(value); return Number.isNaN(date.getTime()) ? clean_(value, 20) : Utilities.formatDate(date, "America/New_York", "yyyy-MM-dd"); }
function googleId_(value, label) { const id = String(value || "").trim(); if (!/^[A-Za-z0-9_-]{20,}$/.test(id)) throw new Error(`${label} must be an ID copied from a Google URL, not the full URL.`); return id; }
function normalizeEmails_(value) { return [...new Set(String(value || "").toLowerCase().split(",").map(email => email.trim()).filter(Boolean))].map(email => { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Invalid allowed teacher email: ${email}`); return email; }); }
