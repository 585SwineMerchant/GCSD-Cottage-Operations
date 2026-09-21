import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const teacher = fs.readFileSync(new URL("../apps-script/teacher/Index.html", import.meta.url), "utf8");

test("event recipe picker searches the full library and exposes draft review", () => {
  for (const id of [
    "eventRecipeSearch",
    "eventRecipeLibrarySummary",
    "eventRecipeSearchResults",
    "quickRecipeRequired",
    "quickRecipeOverage"
  ]) {
    assert.match(teacher, new RegExp(`id="${id}"`));
  }
  assert.match(teacher, /state\.recipes\|\|\[\]/);
  assert.match(teacher, /data-quick-add-recipe/);
  assert.match(teacher, /data-review-event-recipe/);
  assert.match(teacher, /Review draft/);
});

test("one-click recipe addition creates the menu item before attaching the approved version", () => {
  const handler = teacher.match(/async function quickAddEventRecipe\(recipeId\)\{[\s\S]*?\}\n    function renderProductionPlan/)?.[0] || "";
  assert.ok(handler, "quickAddEventRecipe handler should exist");
  assert.ok(handler.indexOf("menu.push") < handler.indexOf("saveCurrent"));
  assert.ok(handler.indexOf("saveCurrent") < handler.indexOf('call("attachRecipeToEvent"'));
  assert.match(handler, /recipe\.status!=="Approved"/);
  assert.match(handler, /added to the menu and attached to this event/);
});

test("manual recipe attachment remains available as an advanced option", () => {
  assert.match(teacher, /Advanced: attach a different recipe to an existing menu item/);
  assert.match(teacher, /id="attachRecipeButton"/);
});
