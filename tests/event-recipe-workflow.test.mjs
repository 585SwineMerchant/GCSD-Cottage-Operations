import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const teacher = fs.readFileSync(new URL("../apps-script/teacher/Index.html", import.meta.url), "utf8");
const teacherCode = fs.readFileSync(new URL("../apps-script/teacher/Code.gs", import.meta.url), "utf8");
const starterRecipes = fs.readFileSync(new URL("../apps-script/teacher/PathwayRecipes.gs", import.meta.url), "utf8");

test("Cottage master menu exposes only approved recipes for one-click event assignment", () => {
  for (const id of [
    "eventRecipeSearch",
    "eventRecipeLibrarySummary",
    "eventRecipeSearchResults",
    "quickRecipeRequired",
    "quickRecipeOverage"
  ]) {
    assert.match(teacher, new RegExp(`id="${id}"`));
  }
  assert.match(teacher, /Cottage master menu/);
  assert.match(teacher, /filter\(r=>r\.status==="Approved"\)/);
  assert.match(teacher, /data-quick-add-recipe/);
  assert.doesNotMatch(teacher, /data-review-event-recipe/);
});

test("one-click recipe addition creates the menu item before attaching the approved version", () => {
  const handler = teacher.match(/async function quickAddEventRecipe\(recipeId\)\{[\s\S]*?\}\n    function renderProductionPlan/)?.[0] || "";
  assert.ok(handler, "quickAddEventRecipe handler should exist");
  assert.ok(handler.indexOf("menu.push") < handler.indexOf("saveCurrent"));
  assert.ok(handler.indexOf("saveCurrent") < handler.indexOf('call("attachRecipeToEvent"'));
  assert.match(handler, /recipe\.status!=="Approved"/);
  assert.match(handler, /added to the menu and attached to this event/);
});

test("source-approved Culinary 1 & 2 starter recipes are syncable into the teacher library", () => {
  const starterCount = (starterRecipes.match(/"id":\s*"ca12-/g) || []).length;
  assert.equal(starterCount, 37);
  assert.match(starterRecipes, /status: "Approved"/);
  assert.match(teacherCode, /function syncStarterPathwayRecipes\(\)/);
  assert.match(teacher, /id="syncStarterRecipes"/);
});

test("manual recipe attachment remains available as an advanced option", () => {
  assert.match(teacher, /Advanced: attach a different recipe to an existing menu item/);
  assert.match(teacher, /id="attachRecipeButton"/);
});
