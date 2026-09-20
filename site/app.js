(() => {
  const config = window.GCSD_CONFIG || {};
  const CACHE_KEY = "gcsdCulinaryOperationsPublishedSnapshotV1";
  const q = selector => document.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  const dateLabel = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Date pending";
  const publishedLabel = value => value ? new Date(value).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Not yet published";

  let snapshot = { schemaVersion: 3, revision: 0, publishedAt: "", events: [], yearArchive: [], priceCatalog: [] };
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
    updateCostRecipeOptions();
    if (!q("#costingView").hidden) renderCostAnalysis();
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

  let costRows = [];
  const canonicalUnit = value => ({ pounds:"lb", pound:"lb", lbs:"lb", ounces:"oz", ounce:"oz", gallons:"gal", gallon:"gal", quarts:"qt", quart:"qt", pints:"pt", pint:"pt", cups:"cup", tablespoons:"tbsp", tablespoon:"tbsp", teaspoons:"tsp", teaspoon:"tsp", count:"each", ea:"each" }[String(value||"").toLowerCase().replace(/\./g,"").trim()] || String(value||"").toLowerCase().replace(/\./g,"").trim());
  const normalizedName = value => String(value||"").toLowerCase().replace(/\([^)]*\)/g," ").replace(/\b(fresh|diced|minced|chopped|sliced|grated|shredded|melted|softened|cold|large|small)\b/g," ").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
  function baseQuantity(quantity,unit){const values={lb:["mass",16],oz:["mass",1],gal:["volume",128],qt:["volume",32],pt:["volume",16],cup:["volume",8],"fl oz":["volume",1],tbsp:["volume",.5],tsp:["volume",1/6],each:["count",1]},value=values[canonicalUnit(unit)];return value?{dimension:value[0],quantity:Number(quantity||0)*value[1]}:null;}
  function convertQuantity(quantity,fromUnit,toUnit){const from=baseQuantity(quantity,fromUnit),to=baseQuantity(1,toUnit);return from&&to&&from.dimension===to.dimension?from.quantity/to.quantity:0;}
  function catalogMatch(name,unit){const target=normalizedName(name);return (snapshot.priceCatalog||[]).map(product=>{const names=[product.ingredientName,product.productName,...(product.aliases||[])].map(normalizedName).filter(Boolean),score=names[0]===target?100:names.includes(target)?90:names.some(alias=>alias.length>3&&(target.includes(alias)||alias.includes(target)))?60:0,converted=convertQuantity(product.packageQuantity,product.packageUnit,unit);return score&&converted?{product,score,packageQuantity:converted}:null}).filter(Boolean).sort((a,b)=>b.score-a.score||String(b.product.checkedAt||"").localeCompare(String(a.product.checkedAt||"")))[0]||null;}
  function costingRecipes(){const found=[];(snapshot.events||[]).forEach(event=>(event.menu||[]).forEach(item=>{if(item.recipe&&!found.some(entry=>entry.key===`${item.recipe.name}|${item.recipe.version}`))found.push({key:`${item.recipe.name}|${item.recipe.version}`,eventName:event.name,recipe:item.recipe})}));return found;}
  function updateCostRecipeOptions(){const select=q("#costRecipe"),current=select.value;select.innerHTML=`<option value="">Start with a blank cost sheet</option>${costingRecipes().map((entry,index)=>`<option value="${index}">${esc(entry.recipe.name)} · v${Number(entry.recipe.version||0)} · ${esc(entry.eventName)}</option>`).join("")}`;if([...select.options].some(option=>option.value===current))select.value=current;}
  function costRowHtml(row,index){return `<div class="cost-row" data-cost-row="${index}"><label class="wide">Ingredient<input data-cost-field="name" value="${esc(row.name||'')}"></label><label>EP recipe quantity<input data-cost-field="quantity" type="number" min="0" step="any" value="${esc(row.quantity||'')}"></label><label>Unit<input data-cost-field="unit" value="${esc(row.unit||'')}"></label><label>AP/EP yield %<input data-cost-field="yieldPercent" type="number" min="1" max="100" step="0.1" value="${esc(row.yieldPercent||100)}"></label><label>Instruction<input data-cost-field="quantityText" value="${esc(row.quantityText||'')}"></label><button class="secondary remove-cost-row" type="button" data-remove-cost-row="${index}">Remove</button></div>`;}
  function renderCostRows(){q("#costIngredients").innerHTML=costRows.length?costRows.map(costRowHtml).join(""):'<p class="empty">Add an ingredient or load a published recipe.</p>';q("#costIngredients").querySelectorAll("[data-cost-field]").forEach(input=>input.addEventListener("input",event=>{const row=costRows[Number(event.target.closest("[data-cost-row]").dataset.costRow)],field=event.target.dataset.costField;row[field]=["quantity","yieldPercent"].includes(field)?Number(event.target.value||0):event.target.value;row.perPortion=field==="quantity"&&Number(q("#costYield").value)>0?row.quantity/Number(q("#costYield").value):row.perPortion;renderCostAnalysis();}));q("#costIngredients").querySelectorAll("[data-remove-cost-row]").forEach(button=>button.onclick=()=>{costRows.splice(Number(button.dataset.removeCostRow),1);renderCostRows();renderCostAnalysis();});renderCostAnalysis();}
  function analyzedRows(){return costRows.map(row=>{const ep=Number(row.quantity||0),yieldPercent=Math.max(1,Math.min(100,Number(row.yieldPercent||100))),ap=ep/(yieldPercent/100),match=ep&&row.unit?catalogMatch(row.name,row.unit):null,packages=match?Math.ceil(ap/match.packageQuantity):0,consumptionCost=match?ap/match.packageQuantity*Number(match.product.packagePrice||0):0,purchaseCost=match?packages*Number(match.product.packagePrice||0):0;return{...row,ep,ap,yieldPercent,match,packages,consumptionCost,purchaseCost}});}
  function renderCostAnalysis(){const rows=analyzedRows(),yieldCount=Math.max(1,Number(q("#costYield").value||1)),recipeCost=rows.reduce((sum,row)=>sum+row.consumptionCost,0),purchaseTotal=rows.reduce((sum,row)=>sum+row.purchaseCost,0),portionCost=recipeCost/yieldCount,targetPct=Math.max(1,Number(q("#targetFoodCost").value||30))/100,suggested=portionCost/targetPct,menuPrice=Number(q("#menuPrice").value||0),actualPct=menuPrice?portionCost/menuPrice*100:0,contribution=menuPrice?menuPrice-portionCost:0,salesMix=Number(q("#salesMix").value||0),popBenchmark=Number(q("#popularityBenchmark").value||0),marginBenchmark=Number(q("#marginBenchmark").value||0);let classification="Add sales-mix and margin benchmarks";if(salesMix&&popBenchmark&&menuPrice&&marginBenchmark>=0){classification=salesMix>=popBenchmark?(contribution>=marginBenchmark?"Star":"Plowhorse"):(contribution>=marginBenchmark?"Puzzle":"Dog")};q("#costMetrics").innerHTML=`<div class="metric-stack"><div class="metric-card"><span>Recipe food cost</span><strong>$${recipeCost.toFixed(2)}</strong></div><div class="metric-card"><span>Cost per portion</span><strong>$${portionCost.toFixed(2)}</strong></div><div class="metric-card"><span>Target menu price</span><strong>$${suggested.toFixed(2)}</strong></div><div class="metric-card"><span>Food-cost % at proposed price</span><strong>${menuPrice?actualPct.toFixed(1)+'%':'—'}</strong></div><div class="metric-card"><span>Contribution margin</span><strong>${menuPrice?'$'+contribution.toFixed(2):'—'}</strong></div><div class="metric-card"><span>Menu engineering</span><strong>${esc(classification)}</strong></div><div class="metric-card"><span>Package purchase estimate</span><strong>$${purchaseTotal.toFixed(2)}</strong></div></div>`;q("#marketOrder").innerHTML=rows.length?rows.map(row=>{const p=row.match?.product,age=p?.checkedAt?Math.floor((Date.now()-new Date(`${p.checkedAt}T12:00:00Z`).getTime())/86400000):null;return `<tr><td>${esc(row.name)}${row.quantityText?`<small>${esc(row.quantityText)}</small>`:''}</td><td>${row.ep?`${row.ap.toFixed(3)} ${esc(row.unit)} (${row.yieldPercent}% yield)`:'Qualitative / as needed'}</td><td>${p?`${esc(p.productName)}<small>${esc(p.packageDescription)}</small>`:'No catalog match'}</td><td>${p?row.packages:'—'}</td><td>${p?'$'+row.purchaseCost.toFixed(2):'—'}</td><td>${p?`${esc(p.supplier)} · ${esc(p.storeLocation||'')}<small>${esc(p.priceType||'estimate')} · checked ${esc(p.checkedAt||'unknown')}${age>45?' · STALE':''}${p.variableWeight?' · variable weight':''}</small>`:'Add or revise the ingredient name/unit'}</td></tr>`}).join(''):'<tr><td colspan="6">No ingredients entered.</td></tr>';}
  function loadCostRecipe(){const entry=costingRecipes()[Number(q("#costRecipe").value)];if(!entry)return;const recipe=entry.recipe,yieldMatch=String(recipe.yield||"").match(/([\d.]+)/),standard=Number(recipe.standardYieldQuantity||recipe.productionTarget||(yieldMatch&&yieldMatch[1])||12),rawItems=(recipe.ingredientData||[]).length?recipe.ingredientData:list(recipe.ingredients).map(value=>{const match=String(value).match(/^([\d.]+)\s+(lb|oz|fl oz|gal|qt|pt|cup|tbsp|tsp|each)\s+(.+)$/i);return match?{quantity:Number(match[1]),unit:match[2],name:match[3].replace(/\s+\([^)]*\)$/,"")}:{quantity:0,unit:"",name:String(value),quantityText:"as directed"}});q("#costTitle").value=`${recipe.name} · Version ${Number(recipe.version||0)}`;q("#costYield").value=standard;costRows=rawItems.map(item=>({name:item.name,quantity:Number(item.quantity||0),unit:item.unit||"",quantityText:item.quantityText||"",yieldPercent:100,perPortion:Number(item.quantity||0)/Math.max(standard,1)}));renderCostRows();}
  const STUDIO_KEY="gcsdCottageRecipeStudioV1";
  const studioFields={searchTerms:"studioSearchTerms",intakeText:"studioIntakeText",name:"studioName",category:"studioCategory",standardYieldQuantity:"studioYieldQuantity",standardYieldUnit:"studioYieldUnit",portionSize:"studioPortion",allergens:"studioAllergens",competencies:"studioCompetencies",ingredientsText:"studioIngredients",equipmentText:"studioEquipment",procedureText:"studioProcedure",safetyControls:"studioSafety",qualityControlsText:"studioQuality",sourceNotes:"studioSourceNotes"};
  let studioImageFile=null,studioImageBitmap=null,studioCrop={x:0,y:0,width:1,height:1},studioCropStart=null,studioOcrPromise=null;
  function studioStatus(message,error=false){const node=q("#studioStatus");node.textContent=message;node.style.borderLeftColor=error?"#9a3026":"";}
  function studioIntakeStatus(message,error=false){const node=q("#studioIntakeStatus");node.textContent=message;node.style.borderLeftColor=error?"#9a3026":"";}
  function readStudioFields(){return Object.fromEntries(Object.entries(studioFields).map(([key,id])=>[key,q(`#${id}`).value.trim()]));}
  function writeStudioFields(data={}){Object.entries(studioFields).forEach(([key,id])=>q(`#${id}`).value=data[key]??"");}
  function draftNumber(value){const text=String(value||"").trim();if(/^\d+(?:\.\d+)?$/.test(text))return Number(text);const mixed=text.match(/^(\d+)\s+(\d+)\/(\d+)$/),fraction=text.match(/^(\d+)\/(\d+)$/);if(mixed&&Number(mixed[3]))return Number(mixed[1])+Number(mixed[2])/Number(mixed[3]);if(fraction&&Number(fraction[2]))return Number(fraction[1])/Number(fraction[2]);return 0;}
  function studioIngredients(text){return String(text||"").split(/\n+/).map(line=>{const [name="",amount="",unit="",preparation=""] = line.split("|").map(value=>value.trim()),quantity=draftNumber(amount);return{name,quantity,quantityText:quantity?"":amount,unit,preparation}}).filter(item=>item.name);}
  function studioExport(){const data=readStudioFields();return{schema:"gcsd-cottage-recipe-draft",schemaVersion:1,exportedAt:new Date().toISOString(),privacy:"No student identity or submission record is included.",recipe:{name:data.name,category:data.category,standardYieldQuantity:Number(data.standardYieldQuantity||0),standardYieldUnit:data.standardYieldUnit,portionSize:data.portionSize,allergens:data.allergens,competencies:data.competencies,ingredients:studioIngredients(data.ingredientsText),equipment:list(data.equipmentText),procedure:String(data.procedureText||"").split(/\n+/).map(value=>value.trim()).filter(Boolean),safetyControls:data.safetyControls,qualityControls:String(data.qualityControlsText||"").split(/\n+/).map(value=>value.trim()).filter(Boolean),sourceNotes:data.sourceNotes}};}
  function applyRecipeExtraction(parsed){if(!parsed)return;const hasDraft=["studioName","studioIngredients","studioProcedure"].some(id=>q(`#${id}`).value.trim());if(hasDraft&&!window.confirm("Replace the current title, ingredients, and procedure with the extracted recipe?"))return;const values={name:parsed.name,standardYieldQuantity:parsed.standardYieldQuantity||"",standardYieldUnit:parsed.standardYieldUnit,ingredientsText:parsed.ingredientsText,procedureText:parsed.procedureText,equipmentText:parsed.equipmentText,allergens:parsed.allergens,sourceNotes:parsed.sourceNotes};Object.entries(values).forEach(([key,value])=>{if(value!==undefined&&value!==null&&String(value).trim()!=="")q(`#${studioFields[key]}`).value=value});const warnings=q("#studioWarnings"),messages=parsed.warnings||[];warnings.hidden=!messages.length;warnings.innerHTML=messages.length?`<strong>Check these fields:</strong><ul>${messages.map(message=>`<li>${esc(message)}</li>`).join("")}</ul>`:"";studioIntakeStatus(`Read ${Number(parsed.extractedLineCount||0)} lines. Review every field before exporting.`);saveStudioDraft();q("#studioName").scrollIntoView({behavior:"smooth",block:"center"})}
  function readStudioText(){const text=q("#studioIntakeText").value.trim();if(!text){studioIntakeStatus("Paste recipe text first.",true);return}applyRecipeExtraction(globalThis.GCSDRecipeParser.parseRecipeText(text))}
  function loadStudioOcr(){if(globalThis.Tesseract)return Promise.resolve(globalThis.Tesseract);if(studioOcrPromise)return studioOcrPromise;studioOcrPromise=new Promise((resolve,reject)=>{const script=document.createElement("script");script.src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";script.crossOrigin="anonymous";script.onload=()=>globalThis.Tesseract?resolve(globalThis.Tesseract):reject(new Error("Screenshot reader did not initialize."));script.onerror=()=>reject(new Error("Screenshot reader could not load. Paste copied recipe text instead."));document.head.appendChild(script)}).catch(error=>{studioOcrPromise=null;throw error});return studioOcrPromise}
  function drawStudioCrop(){const canvas=q("#studioCropCanvas");if(!studioImageBitmap)return;const maxWidth=1000,scale=Math.min(1,maxWidth/studioImageBitmap.width);canvas.width=Math.max(1,Math.round(studioImageBitmap.width*scale));canvas.height=Math.max(1,Math.round(studioImageBitmap.height*scale));const context=canvas.getContext("2d"),selection={x:studioCrop.x*canvas.width,y:studioCrop.y*canvas.height,width:studioCrop.width*canvas.width,height:studioCrop.height*canvas.height};context.drawImage(studioImageBitmap,0,0,canvas.width,canvas.height);context.fillStyle="rgba(10,40,30,.58)";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(studioImageBitmap,studioCrop.x*studioImageBitmap.width,studioCrop.y*studioImageBitmap.height,studioCrop.width*studioImageBitmap.width,studioCrop.height*studioImageBitmap.height,selection.x,selection.y,selection.width,selection.height);context.strokeStyle="#e1a92b";context.lineWidth=4;context.strokeRect(selection.x,selection.y,selection.width,selection.height)}
  async function setStudioImage(file){if(!file)return;if(!/^image\//.test(file.type)||file.size>10*1024*1024){studioIntakeStatus("Use a PNG, JPEG, or WebP screenshot smaller than 10 MB.",true);return}studioImageFile=file;if(studioImageBitmap)studioImageBitmap.close();studioImageBitmap=await createImageBitmap(file);studioCrop={x:0,y:0,width:1,height:1};q("#studioCropPanel").hidden=false;q("#studioDropZone").classList.add("ready");drawStudioCrop();studioIntakeStatus(`${file.name||"Pasted screenshot"} is ready. Drag around the recipe before reading it.`)}
  function studioCropPoint(event){const canvas=q("#studioCropCanvas"),rect=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))}}
  function preparedStudioImage(){if(!studioImageBitmap)throw new Error("Choose or paste a screenshot first.");const sx=Math.round(studioCrop.x*studioImageBitmap.width),sy=Math.round(studioCrop.y*studioImageBitmap.height),sw=Math.max(1,Math.round(studioCrop.width*studioImageBitmap.width)),sh=Math.max(1,Math.round(studioCrop.height*studioImageBitmap.height));let scale=Math.max(1,1400/sw);scale=Math.min(scale,3000/sh,3);const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(sw*scale));canvas.height=Math.max(1,Math.round(sh*scale));const context=canvas.getContext("2d",{willReadFrequently:true});context.imageSmoothingEnabled=true;context.imageSmoothingQuality="high";context.drawImage(studioImageBitmap,sx,sy,sw,sh,0,0,canvas.width,canvas.height);const image=context.getImageData(0,0,canvas.width,canvas.height),pixels=image.data;for(let index=0;index<pixels.length;index+=4){const gray=.299*pixels[index]+.587*pixels[index+1]+.114*pixels[index+2],contrast=Math.max(0,Math.min(255,(gray-128)*1.35+128));pixels[index]=pixels[index+1]=pixels[index+2]=contrast>246?255:contrast}context.putImageData(image,0,0);return canvas}
  async function readStudioScreenshot(){if(!studioImageFile||!studioImageBitmap){studioIntakeStatus("Choose or paste a screenshot first.",true);return}const button=q("#readStudioScreenshot");button.disabled=true;let worker;try{studioIntakeStatus("Preparing the selected recipe area…");const image=preparedStudioImage(),Tesseract=await loadStudioOcr();worker=await Tesseract.createWorker("eng",1,{logger:message=>{if(message.status==="recognizing text")studioIntakeStatus(`Reading selected recipe area… ${Math.round(Number(message.progress||0)*100)}%`)}});await worker.setParameters({tessedit_pageseg_mode:"6",preserve_interword_spaces:"1"});const result=await worker.recognize(image),text=String(result?.data?.text||"").trim();if(!text)throw new Error("No readable recipe text was found. Draw a tighter box around the recipe or paste its text.");q("#studioIntakeText").value=text;const parsed=globalThis.GCSDRecipeParser.parseRecipeText(text);parsed.warnings=["Screenshot reading can confuse fractions and small print. Verify every quantity against the original recipe.",...(parsed.warnings||[])];applyRecipeExtraction(parsed)}catch(error){studioIntakeStatus(error.message||String(error),true)}finally{if(worker)try{await worker.terminate()}catch(_){/* worker cleanup is best effort */}button.disabled=false}}
  function saveStudioDraft(){const data=readStudioFields();try{localStorage.setItem(STUDIO_KEY,JSON.stringify(data));studioStatus("Draft saved on this device. Nothing was sent to the teacher system.")}catch(_){studioStatus("This browser could not save the local draft. Copy or download the export instead.",true)}}
  function loadStudioDraft(){try{const saved=JSON.parse(localStorage.getItem(STUDIO_KEY)||"null");if(saved){writeStudioFields(saved);studioStatus("Saved local draft loaded. Nothing has been submitted.")}}catch(_){/* local storage is optional */}}
  async function copyStudioExport(){const text=JSON.stringify(studioExport(),null,2);try{await navigator.clipboard.writeText(text);studioStatus("Teacher-review export copied. Send it through the teacher-approved classroom workflow.")}catch(_){const area=document.createElement("textarea");area.value=text;document.body.appendChild(area);area.select();document.execCommand("copy");area.remove();studioStatus("Teacher-review export copied. Send it through the teacher-approved classroom workflow.")}}
  function downloadStudioExport(){const payload=studioExport(),blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),link=document.createElement("a"),safe=(payload.recipe.name||"recipe-draft").replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"").toLowerCase()||"recipe-draft";link.href=url;link.download=`${safe}.json`;link.click();URL.revokeObjectURL(url);studioStatus("Recipe Studio JSON downloaded for teacher review.")}
  function clearStudioDraft(){if(!window.confirm("Clear the Recipe Studio draft saved in this browser?"))return;localStorage.removeItem(STUDIO_KEY);writeStudioFields({});studioStatus("Local Recipe Studio draft cleared.")}
  function showStudentView(view){q("#eventsView").hidden=view!=="events";q("#costingView").hidden=view!=="costing";q("#studioView").hidden=view!=="studio";document.querySelectorAll("[data-student-view]").forEach(button=>button.classList.toggle("active",button.dataset.studentView===view));if(view==="costing"){updateCostRecipeOptions();renderCostAnalysis();}}

  q("#refreshEventData").addEventListener("click", refresh);
  document.querySelectorAll("[data-student-view]").forEach(button=>button.onclick=()=>showStudentView(button.dataset.studentView));
  q("#costRecipe").addEventListener("change",loadCostRecipe);
  q("#addCostIngredient").onclick=()=>{costRows.push({name:"",quantity:0,unit:"",quantityText:"",yieldPercent:100,perPortion:0});renderCostRows();};
  ["#targetFoodCost","#menuPrice","#salesMix","#popularityBenchmark","#marginBenchmark"].forEach(selector=>q(selector).addEventListener("input",renderCostAnalysis));
  q("#costYield").addEventListener("input",()=>{const target=Math.max(1,Number(q("#costYield").value||1));costRows.forEach(row=>{if(Number.isFinite(row.perPortion))row.quantity=row.perPortion*target});renderCostRows();});
  q("#printCosting").onclick=()=>{document.body.classList.add("printing-costing");window.print();window.setTimeout(()=>document.body.classList.remove("printing-costing"),100);};
  q("#studioGoogleSearch").onclick=()=>window.open(`https://www.google.com/search?q=${encodeURIComponent(q("#studioSearchTerms").value.trim()||"professional standardized recipe")}`,"_blank","noopener");
  q("#readStudioText").onclick=readStudioText;
  q("#readStudioScreenshot").onclick=readStudioScreenshot;
  q("#studioScreenshot").onchange=event=>setStudioImage(event.target.files[0]).catch(error=>studioIntakeStatus(error.message||String(error),true));
  q("#studioDropZone").addEventListener("paste",event=>{const file=[...(event.clipboardData?.files||[])].find(item=>/^image\//.test(item.type));if(!file)return;event.preventDefault();setStudioImage(file).catch(error=>studioIntakeStatus(error.message||String(error),true))});
  q("#studioDropZone").onclick=()=>q("#studioDropZone").focus();
  q("#studioCropCanvas").addEventListener("pointerdown",event=>{studioCropStart=studioCropPoint(event);event.currentTarget.setPointerCapture(event.pointerId)});
  q("#studioCropCanvas").addEventListener("pointermove",event=>{if(!studioCropStart)return;const point=studioCropPoint(event),x=Math.min(studioCropStart.x,point.x),y=Math.min(studioCropStart.y,point.y);studioCrop={x,y,width:Math.max(.01,Math.abs(point.x-studioCropStart.x)),height:Math.max(.01,Math.abs(point.y-studioCropStart.y))};drawStudioCrop()});
  q("#studioCropCanvas").addEventListener("pointerup",()=>{studioCropStart=null;studioIntakeStatus("Recipe area selected. Click Read selected recipe area.")});
  q("#resetStudioCrop").onclick=()=>{studioCrop={x:0,y:0,width:1,height:1};drawStudioCrop();studioIntakeStatus("Using the full screenshot. A tight recipe-only selection usually reads better.")};
  q("#saveStudioDraft").onclick=saveStudioDraft;
  q("#copyStudioExport").onclick=copyStudioExport;
  q("#downloadStudioExport").onclick=downloadStudioExport;
  q("#clearStudioDraft").onclick=clearStudioDraft;
  loadStudioDraft();
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
