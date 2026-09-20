const RECIPE_IMPORT_MAX_HTML = 2000000;
const RECIPE_IMPORT_CACHE_SECONDS = 3600;

function doGet(event) {
  const callback = String(event && event.parameter && event.parameter.callback || "");
  let payload;
  try {
    payload = importRecipeUrl_(String(event && event.parameter && event.parameter.url || ""));
  } catch (error) {
    payload = { ok: false, error: error && error.message ? error.message : String(error) };
  }
  const json = JSON.stringify(payload);
  if (callback) {
    if (!/^[A-Za-z_$][0-9A-Za-z_$\.]{0,100}$/.test(callback)) return ContentService.createTextOutput("Invalid callback.").setMimeType(ContentService.MimeType.TEXT);
    return ContentService.createTextOutput(`${callback}(${json});`).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function importRecipeUrl_(value) {
  const url = validateRecipeUrl_(value);
  const cache = typeof CacheService !== "undefined" ? CacheService.getScriptCache() : null;
  const cacheKey = `recipe:${Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, url)).slice(0, 40)}`;
  const cached = cache && cache.get(cacheKey);
  if (cached) return JSON.parse(cached);
  const html = fetchRecipeHtml_(url);
  const candidates = recipeJsonLd_(html);
  if (!candidates.length) throw new Error("This webpage does not provide readable structured recipe data. Use copied text or the screenshot reader instead.");
  const best = candidates.sort((a, b) => recipeScore_(b) - recipeScore_(a))[0];
  const result = { ok: true, recipe: normalizeRecipe_(best, url), warnings: [] };
  if (!result.recipe.ingredients.length) result.warnings.push("The webpage did not provide structured ingredients.");
  if (!result.recipe.instructions.length) result.warnings.push("The webpage did not provide structured instructions.");
  if (cache) cache.put(cacheKey, JSON.stringify(result), RECIPE_IMPORT_CACHE_SECONDS);
  return result;
}

function validateRecipeUrl_(value) {
  const url = String(value || "").trim();
  if (!url || url.length > 1800) throw new Error("Paste a complete recipe webpage URL.");
  const match = url.match(/^https:\/\/([^\/?#]+)(?:[\/?#]|$)/i);
  if (!match) throw new Error("Recipe imports require a public HTTPS webpage.");
  const host = match[1].replace(/^.*@/, "").replace(/:\d+$/, "").toLowerCase();
  if (!host || host === "localhost" || /\.(?:local|internal|localhost)$/.test(host) || /^\[/.test(host) || /^\d+(?:\.\d+){3}$/.test(host)) throw new Error("That recipe host is not allowed.");
  return url;
}

function fetchRecipeHtml_(startUrl) {
  let url = startUrl;
  for (let redirect = 0; redirect < 4; redirect += 1) {
    validateRecipeUrl_(url);
    const response = UrlFetchApp.fetch(url, {
      followRedirects: false,
      muteHttpExceptions: true,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GCSD-Cottage-Recipe-Importer/1.0)" }
    });
    const code = response.getResponseCode();
    if ([301, 302, 303, 307, 308].indexOf(code) !== -1) {
      const location = String(response.getHeaders().Location || response.getHeaders().location || "");
      url = recipeRedirectUrl_(url, location);
      continue;
    }
    if (code < 200 || code >= 300) throw new Error(`The recipe webpage returned HTTP ${code}. Try copied text instead.`);
    const html = response.getContentText();
    if (!html || html.length > RECIPE_IMPORT_MAX_HTML) throw new Error("That webpage is empty or too large to import safely. Try copied text instead.");
    return html;
  }
  throw new Error("The recipe webpage redirected too many times.");
}

function recipeRedirectUrl_(current, location) {
  if (/^https:\/\//i.test(location)) return validateRecipeUrl_(location);
  const origin = current.match(/^(https:\/\/[^\/]+)/i);
  if (origin && /^\//.test(location)) return validateRecipeUrl_(`${origin[1]}${location}`);
  throw new Error("The recipe webpage redirected to an unsupported address.");
}

function recipeJsonLd_(html) {
  const recipes = [];
  const pattern = /<script\b[^>]*type\s*=\s*["']application\/ld\+json[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(String(html || ""))) !== null) {
    const raw = match[1].replace(/^\s*<!--|-->\s*$/g, "").trim();
    if (!raw) continue;
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (_) { try { parsed = JSON.parse(decodeRecipeEntities_(raw)); } catch (_) { continue; } }
    collectRecipeNodes_(parsed, recipes);
  }
  return recipes;
}

function collectRecipeNodes_(root, output) {
  const stack = [root];
  let visited = 0;
  while (stack.length && visited < 10000) {
    const value = stack.pop();
    visited += 1;
    if (!value || typeof value !== "object") continue;
    if (Array.isArray(value)) { value.forEach(item => stack.push(item)); continue; }
    const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
    if (types.some(type => String(type).toLowerCase() === "recipe")) output.push(value);
    Object.keys(value).forEach(key => { if (key === "@context") return; const child = value[key]; if (child && typeof child === "object") stack.push(child); });
  }
}

function recipeScore_(recipe) {
  return (recipe.name ? 10 : 0) + (Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient.length : 0) + (recipe.recipeInstructions ? 10 : 0);
}

function normalizeRecipe_(recipe, url) {
  const yields = Array.isArray(recipe.recipeYield) ? recipe.recipeYield : [recipe.recipeYield];
  const yieldValue = yields.find(value => /\d.*[A-Za-z]|[A-Za-z].*\d/.test(String(value))) || yields.find(value => /\d/.test(String(value))) || yields[0];
  const author = recipeAuthor_(recipe.author);
  return {
    name: cleanRecipeText_(recipe.name),
    category: cleanRecipeText_(Array.isArray(recipe.recipeCategory) ? recipe.recipeCategory.join(", ") : recipe.recipeCategory),
    cuisine: cleanRecipeText_(Array.isArray(recipe.recipeCuisine) ? recipe.recipeCuisine.join(", ") : recipe.recipeCuisine),
    yield: cleanRecipeText_(yieldValue),
    ingredients: (Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : [recipe.recipeIngredient]).map(cleanRecipeText_).filter(Boolean).slice(0, 200),
    instructions: flattenRecipeInstructions_(recipe.recipeInstructions).slice(0, 100),
    author: cleanRecipeText_(author),
    sourceUrl: url
  };
}

function recipeAuthor_(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value.map(recipeAuthor_).filter(Boolean).join(", ");
  if (typeof value === "string") return value;
  return value && typeof value === "object" ? String(value.name || "") : "";
}

function flattenRecipeInstructions_(value) {
  const output = [];
  function visit(item) {
    if (!item) return;
    if (Array.isArray(item)) { item.forEach(visit); return; }
    if (typeof item === "string") { const text = cleanRecipeText_(item); if (text) output.push(text); return; }
    if (item.itemListElement) { visit(item.itemListElement); return; }
    const text = cleanRecipeText_(item.text || item.description || "");
    if (text) output.push(text);
  }
  visit(value);
  return output;
}

function cleanRecipeText_(value) {
  return decodeRecipeEntities_(String(value == null ? "" : value).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodeRecipeEntities_(value) {
  const named = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
  return String(value || "").replace(/&(#x?[0-9a-f]+|amp|quot|apos|lt|gt|nbsp);/gi, (_, entity) => {
    if (entity.charAt(0) !== "#") return named[entity.toLowerCase()] || _;
    const hexadecimal = entity.charAt(1).toLowerCase() === "x";
    const code = parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    return isFinite(code) ? String.fromCharCode(code) : _;
  });
}
