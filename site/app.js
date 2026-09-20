(() => {
  const config = window.GCSD_CONFIG || {};
  const CACHE_KEY = "gcsdCulinaryOperationsPublishedSnapshotV1";
  const q = selector => document.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  const dateLabel = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Date pending";
  const publishedLabel = value => value ? new Date(value).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Not yet published";

  let snapshot = { schemaVersion: 1, revision: 0, publishedAt: "", events: [], yearArchive: [] };
  let teamFilter = "all";

  function list(value) {
    return (Array.isArray(value) ? value : String(value || "").split(/\n|,/)).map(item => String(item || "").trim()).filter(Boolean);
  }

  function timeValue(value) {
    const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
    if (!match) return 9999;
    let hour = Number(match[1]);
    if (match[3]) hour = (hour % 12) + (match[3].toUpperCase() === "PM" ? 12 : 0);
    return hour * 60 + Number(match[2]);
  }

  function taskHtml(task, eventId) {
    return `<article class="task">
      <header><div><span>${esc(task.phase || "Production")} · ${esc(task.teamLabel || "Team")} · ${esc(task.station || "Station pending")}</span><h4>${esc(task.name)}</h4></div><strong>${esc(task.status || "Not started")}</strong></header>
      <p>${esc(task.instructions || "")}</p>
      <dl>
        <div><dt>Schedule</dt><dd>${esc([task.startTime && `Start ${task.startTime}`, task.durationMinutes && `${task.durationMinutes} minutes`, task.deadline && `Due ${task.deadline}`].filter(Boolean).join(" · ") || "Teacher will confirm")}</dd></div>
        <div><dt>Quantity</dt><dd>${esc(task.quantity || "Teacher will confirm")}</dd></div>
        <div><dt>Depends on</dt><dd>${esc(list(task.dependsOn).join(", ") || "No prerequisite task")}</dd></div>
        <div><dt>Equipment</dt><dd>${esc(list(task.equipment).join(", ") || "See teacher direction")}</dd></div>
        <div><dt>Quality controls</dt><dd>${esc(list(task.qualityControls).join(" · ") || "Meet the approved product standard")}</dd></div>
        <div><dt>Handoff</dt><dd>${esc(task.handoff || "No dependency recorded")}</dd></div>
      </dl>
      ${task.recipe ? `<div class="task-actions"><button class="secondary" type="button" data-recipe-event="${esc(eventId)}" data-recipe-task="${esc(task.id)}">Open approved recipe</button></div>` : ""}
    </article>`;
  }

  function eventHtml(event) {
    const menu = event.menu || [];
    const tasks = (event.tasks || []).filter(task => teamFilter === "all" || String(task.teamLabel || "Team") === teamFilter).map(task => ({
      ...task,
      recipe: task.recipe || menu.find(item => String(item.name || "").toLowerCase() === String(task.name || "").toLowerCase())?.recipe
    })).sort((a, b) => timeValue(a.startTime) - timeValue(b.startTime) || String(a.name || "").localeCompare(String(b.name || "")));
    return `<article class="event">
      <header class="event-header"><div><span>Revision ${Number(event.version || snapshot.revision || 0)} · Published</span><h2>${esc(event.name)}</h2><p>${esc(event.clientDisplayName || "Private event")}</p></div><strong>${dateLabel(event.serviceDate)}<br>${esc(event.serviceTime || "Time pending")}</strong></header>
      <div class="brief">
        <div><span>Location and service</span><strong>${esc([event.location, event.serviceFormat].filter(Boolean).join(" · ") || "Teacher will confirm")}</strong></div>
        <div><span>Guests / orders</span><strong>${Number(event.guestCount || 0)}</strong></div>
        <div><span>Dietary and allergen controls</span><strong>${esc(event.allergens || "See teacher direction")}</strong></div>
        <div><span>Customer commitment</span><strong>${esc(event.requirements || "See teacher direction")}</strong></div>
        <div><span>Learning focus</span><strong>${esc(event.learningFocus || "Teacher will identify the event-level focus")}</strong></div>
        <div><span>Safety and sanitation controls</span><strong>${esc(event.safetyControls || "Follow the approved kitchen safety plan")}</strong></div>
      </div>
      <div class="menu">${menu.map(item => item.recipe ? `<button class="secondary" type="button" data-menu-recipe-event="${esc(event.id)}" data-menu-recipe-name="${esc(item.name)}">${esc(item.name)}${Number(item.required || 0) ? ` · ${Number(item.required)}` : ""} · Recipe v${Number(item.recipeVersion || item.recipe.version || 0)}</button>` : `<span>${esc(item.name)}${Number(item.required || 0) ? ` · ${Number(item.required)}` : ""}${item.portion ? ` · ${esc(item.portion)}` : ""}</span>`).join("")}</div>
      <div class="tasks-heading"><div><p class="eyebrow">Production assignments</p><h3>${teamFilter === "all" ? "All teams and stations" : esc(teamFilter)}</h3></div><button class="secondary" type="button" data-print-event="${esc(event.id)}">Print packet</button></div>
      <div class="tasks">${tasks.length ? tasks.map(task => taskHtml(task, event.id)).join("") : "<p>No assignments match this filter.</p>"}</div>
    </article>`;
  }

  function render() {
    const events = snapshot.events || [];
    const teams = [...new Set(events.flatMap(event => (event.tasks || []).map(task => String(task.teamLabel || "Team"))))].sort();
    q("#teamFilter").innerHTML = `<option value="all">All teams</option>${teams.map(team => `<option value="${esc(team)}" ${team === teamFilter ? "selected" : ""}>${esc(team)}</option>`).join("")}`;
    q("#eventList").innerHTML = events.map(eventHtml).join("");
    q("#eventWorkspace").hidden = !events.length;
    q("#emptyState").hidden = Boolean(events.length);
    q("#publicationStatus").textContent = events.length ? `${events.length} published Event Order${events.length === 1 ? "" : "s"}` : "No published Event Order";
    q("#publicationMeta").textContent = snapshot.publishedAt ? `Published ${publishedLabel(snapshot.publishedAt)} · Revision ${Number(snapshot.revision || 0)}${snapshot.stale ? " · saved copy" : ""}` : "";
    q("#errorNotice").hidden = !snapshot.notice;
    q("#errorNotice").textContent = snapshot.notice || "";
  }

  function loadJsonp(url) {
    return new Promise((resolve, reject) => {
      const callback = `gcsdCulinaryFeed_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement("script");
      let finished = false;
      const finish = (error, value) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeout);
        delete window[callback];
        script.remove();
        error ? reject(error) : resolve(value);
      };
      const timeout = window.setTimeout(() => finish(new Error("The publication feed did not respond.")), 15000);
      window[callback] = value => finish(null, value);
      script.onerror = () => finish(new Error("The publication feed could not be loaded."));
      const separator = url.includes("?") ? "&" : "?";
      script.src = `${url}${separator}callback=${encodeURIComponent(callback)}&_=${Date.now()}`;
      document.head.appendChild(script);
    });
  }

  function saveSnapshot(value) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(value)); } catch (_) { /* browser storage is optional */ }
  }

  function savedSnapshot() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (_) { return null; }
  }

  async function refresh() {
    const button = q("#refreshEventData");
    button.disabled = true;
    button.textContent = "Checking…";
    try {
      if (!config.publicFeedUrl) {
        snapshot = { schemaVersion: 1, revision: 0, publishedAt: "", events: [], yearArchive: [], notice: "The version-two publication feed has not been connected yet." };
      } else {
        const next = await loadJsonp(config.publicFeedUrl);
        if (!next || !Array.isArray(next.events)) throw new Error("The publication feed returned an invalid response.");
        snapshot = { schemaVersion: 1, revision: 0, publishedAt: "", events: [], yearArchive: [], ...next };
        delete snapshot.notice;
        delete snapshot.stale;
        saveSnapshot(snapshot);
      }
    } catch (error) {
      const saved = savedSnapshot();
      snapshot = saved && Array.isArray(saved.events)
        ? { ...saved, stale: true, notice: `Unable to check for an update. Continuing to display Revision ${Number(saved.revision || 0)}, published ${publishedLabel(saved.publishedAt)}.` }
        : { schemaVersion: 1, revision: 0, publishedAt: "", events: [], yearArchive: [], notice: error.message || String(error) };
    } finally {
      button.disabled = false;
      button.textContent = "Refresh Event Data";
      render();
    }
  }

  function openRecipe(eventId, taskId, menuName) {
    const event = (snapshot.events || []).find(item => item.id === eventId);
    const task = event?.tasks?.find(item => item.id === taskId);
    const menuItem = event?.menu?.find(item => String(item.name || "").toLowerCase() === String(menuName || task?.name || "").toLowerCase());
    const recipe = task?.recipe || menuItem?.recipe;
    if (!recipe) return;
    q("#recipeContent").innerHTML = `<p class="eyebrow">Teacher-approved production recipe · Version ${Number(recipe.version || 0)}</p><h2>${esc(recipe.name)}</h2><p>${esc([recipe.yield && `Yield ${recipe.yield}`, recipe.portion && `Portion ${recipe.portion}`, recipe.overagePercent && `${recipe.overagePercent}% production overage`].filter(Boolean).join(" · "))}</p><div class="recipe-grid"><section><h3>Ingredients</h3><ul>${list(recipe.ingredients).map(item => `<li>${esc(item)}</li>`).join("")}</ul></section><section><h3>Equipment</h3><ul>${list(recipe.equipment).map(item => `<li>${esc(item)}</li>`).join("")}</ul></section><section><h3>Procedure</h3><ol>${list(recipe.procedure).map(item => `<li>${esc(item)}</li>`).join("")}</ol></section><section><h3>Quality controls</h3><ul>${list(recipe.qualityControls).map(item => `<li>${esc(item)}</li>`).join("")}</ul></section></div><p><strong>Allergens:</strong> ${esc(recipe.allergens || "See Event Order")}</p><p><strong>Safety controls:</strong> ${esc(recipe.safetyControls || "Follow the approved kitchen safety plan")}</p>${recipe.competencies?`<p><strong>Learning focus:</strong> ${esc(recipe.competencies)}</p>`:""}`;
    q("#recipeDialog").showModal();
  }

  function printEvent(eventId) {
    const event = (snapshot.events || []).find(item => item.id === eventId);
    if (!event) return;
    const tasks = (event.tasks || []).filter(task => teamFilter === "all" || String(task.teamLabel || "Team") === teamFilter);
    q("#printArea").innerHTML = `<h1>${esc(event.name)}</h1><p>${esc(event.clientDisplayName || "Private event")} · ${dateLabel(event.serviceDate)} · ${esc(event.serviceTime || "")}</p><p><strong>Commitment:</strong> ${esc(event.requirements || "")}</p><p><strong>Allergens:</strong> ${esc(event.allergens || "")}</p><p><strong>Learning focus:</strong> ${esc(event.learningFocus || "")}</p><p><strong>Safety controls:</strong> ${esc(event.safetyControls || "")}</p>${tasks.map(task => `<section class="print-task"><h2>${esc(task.teamLabel || "Team")} · ${esc(task.station || "Station")}</h2><h3>${esc(task.name)}</h3><p>${esc(task.quantity || "")} · ${esc(task.deadline || "")}</p><p>${esc(task.instructions || "")}</p><p><strong>Equipment:</strong> ${esc(list(task.equipment).join(", "))}</p><p><strong>Quality controls:</strong> ${esc(list(task.qualityControls).join(" · "))}</p><p><strong>Handoff:</strong> ${esc(task.handoff || "")}</p></section>`).join("")}`;
    window.print();
  }

  q("#refreshEventData").addEventListener("click", refresh);
  q("#teamFilter").addEventListener("change", event => { teamFilter = event.target.value; render(); });
  q("#recipeDialog").querySelector(".dialog-close").addEventListener("click", () => q("#recipeDialog").close());
  document.addEventListener("click", event => {
    const recipe = event.target.closest("[data-recipe-task]");
    if (recipe) openRecipe(recipe.dataset.recipeEvent, recipe.dataset.recipeTask);
    const menuRecipe = event.target.closest("[data-menu-recipe-event]");
    if (menuRecipe) openRecipe(menuRecipe.dataset.menuRecipeEvent, "", menuRecipe.dataset.menuRecipeName);
    const print = event.target.closest("[data-print-event]");
    if (print) printEvent(print.dataset.printEvent);
  });

  const teacherLink = q("#teacherCommandCenterLink");
  if (config.teacherCommandCenterUrl) {
    teacherLink.href = config.teacherCommandCenterUrl;
    teacherLink.hidden = false;
  }

  refresh();
})();
