import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../site/index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../site/app.js", import.meta.url), "utf8");

test("Recipe Studio exposes the approved Cottage menu browser", () => {
  for (const id of ["studioLibrarySearch", "studioLibraryCategory", "studioLibrarySummary", "studioRecipeLibrary"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /Cottage Menu &amp; Approved Recipes/);
  assert.match(app, /snapshot\.recipes\|\|\[\]/);
  assert.match(app, /function renderStudioLibrary\(\)/);
  assert.match(app, /data-library-recipe/);
  assert.match(app, /openLibraryRecipe/);
});

test("Costing Lab can load any approved Cottage menu recipe, not only event recipes", () => {
  const functionText = app.match(/function costingRecipes\(\)\{[\s\S]*?return found;\}/)?.[0] || "";
  assert.ok(functionText);
  assert.match(functionText, /snapshot\.recipes/);
  assert.match(functionText, /Cottage menu/);
});
