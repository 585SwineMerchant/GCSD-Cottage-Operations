import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

async function importContext(html, responseCode = 200) {
  const source = await readFile(new URL("../apps-script/recipe-import/Code.gs", import.meta.url), "utf8");
  const cache = new Map();
  const context = vm.createContext({
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => responseCode, getHeaders: () => ({}), getContentText: () => html }) },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key) || null, put: (key, value) => cache.set(key, value) }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" },
      computeDigest: (_algorithm, value) => [...Buffer.from(String(value))],
      base64EncodeWebSafe: bytes => Buffer.from(bytes).toString("base64url")
    },
    ContentService: { MimeType: { TEXT: "text", JAVASCRIPT: "javascript", JSON: "json" }, createTextOutput: content => ({ content, setMimeType(mimeType) { this.mimeType = mimeType; return this; } }) }
  });
  vm.runInContext(source, context, { filename: "recipe-import/Code.gs" });
  return context;
}

test("recipe URL importer extracts exact JSON-LD recipe fields", async () => {
  const html = `<html><head><script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org", "@type": "Recipe", name: "Best Homemade Alfredo Sauce",
    recipeYield: "2 cups", recipeCategory: "Sauce", author: { "@type": "Person", name: "Nichole" },
    recipeIngredient: ["1/2 cup butter", "1 1/2 cups heavy whipping cream", "2 teaspoons minced garlic"],
    recipeInstructions: [
      { "@type": "HowToStep", text: "Add the butter and cream to a skillet." },
      { "@type": "HowToStep", text: "Whisk in the remaining ingredients." }
    ]
  })}</script></head></html>`;
  const context = await importContext(html);
  const result = context.importRecipeUrl_("https://example.test/alfredo");
  assert.equal(result.ok, true);
  assert.equal(result.recipe.name, "Best Homemade Alfredo Sauce");
  assert.equal(result.recipe.yield, "2 cups");
  assert.equal(result.recipe.ingredients[1], "1 1/2 cups heavy whipping cream");
  assert.deepEqual(Array.from(result.recipe.instructions), ["Add the butter and cream to a skillet.", "Whisk in the remaining ingredients."]);
  assert.equal(result.recipe.author, "Nichole");
});

test("recipe URL importer reads recipes nested in an @graph and HowToSection", async () => {
  const html = `<script type='application/ld+json'>${JSON.stringify({ "@context": "https://schema.org", "@graph": [
    { "@type": "WebPage", name: "Page" },
    { "@type": ["Recipe", "CreativeWork"], name: "Bread", recipeIngredient: ["2 cups flour"], recipeInstructions: [{ "@type": "HowToSection", name: "Dough", itemListElement: [{ "@type": "HowToStep", text: "Mix the dough." }] }] }
  ] })}</script>`;
  const context = await importContext(html);
  const result = context.importRecipeUrl_("https://example.test/bread");
  assert.equal(result.recipe.name, "Bread");
  assert.deepEqual(Array.from(result.recipe.instructions), ["Mix the dough."]);
});

test("recipe URL importer rejects unsafe or non-recipe requests", async () => {
  const context = await importContext("<html>No structured recipe</html>");
  assert.throws(() => context.importRecipeUrl_("http://example.test/recipe"), /HTTPS/);
  assert.throws(() => context.importRecipeUrl_("https://127.0.0.1/recipe"), /not allowed/);
  assert.throws(() => context.importRecipeUrl_("https://example.test/article"), /structured recipe data/);
  const response = context.doGet({ parameter: { callback: "recipeCallback", url: "https://example.test/article" } });
  assert.equal(response.mimeType, "javascript");
  assert.match(response.content, /^recipeCallback\(\{"ok":false/);
});
