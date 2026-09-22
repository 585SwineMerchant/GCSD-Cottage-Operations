import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const structured = JSON.parse(fs.readFileSync(new URL("../data/recovered-recipes.json", import.meta.url), "utf8"));
const appsScript = fs.readFileSync(new URL("../apps-script/teacher/RecoveredRecipes.gs", import.meta.url), "utf8");
const match = appsScript.match(/const RECOVERED_SOURCE_RECIPES = (\[.*?\]);\n\n\/\*\*/s);
assert.ok(match, "RecoveredRecipes.gs must contain the generated recipe array");
const embedded = JSON.parse(match[1]);

test("structured source and Apps Script integration contain the same 110 drafts", () => {
  assert.equal(structured.length, 110);
  assert.deepEqual(embedded, structured);
  assert.equal(new Set(structured.map((recipe) => recipe.catalogId)).size, 110);
  for (const recipe of structured) {
    assert.equal(recipe.productionReady, false);
    assert.match(recipe.approvalStatus, /teacher review/i);
    assert.match(recipe.transcriptionStatus, /teacher verification required/i);
  }
});

test("ingredient lists contain no procedure leakage or common OCR debris", () => {
  const procedureStart = /^\s*\d+[.,]\s+/;
  const procedureLanguage = /\b(?:heat|cook|stir|simmer|serve|refrigerate|strain)\b/i;
  const ocrDebris = /[§¢|]|\b(?:fakes|chapter)\b/i;

  for (const recipe of structured) {
    assert.ok(recipe.ingredients.length > 0, `${recipe.catalogId} has no ingredients`);
    for (const ingredient of recipe.ingredients) {
      assert.doesNotMatch(ingredient, procedureStart, `${recipe.catalogId}: ${ingredient}`);
      assert.doesNotMatch(ingredient, procedureLanguage, `${recipe.catalogId}: ${ingredient}`);
      assert.doesNotMatch(ingredient, ocrDebris, `${recipe.catalogId}: ${ingredient}`);
      assert.ok(ingredient.length < 300, `${recipe.catalogId} has an implausibly long ingredient line`);
    }
  }
});

test("known multi-column failures are transcribed exactly", () => {
  const byId = Object.fromEntries(structured.map((recipe) => [recipe.catalogId, recipe]));
  assert.deepEqual(byId.R008.ingredients, [
    "32 fl oz/960 mL Brown Veal Stock (page 352)",
    "32 fl oz/960 mL Espagnole Sauce (page 382)"
  ]);
  assert.equal(byId.R010.ingredients[0], "2 fl oz/60 mL clarified butter or vegetable oil");
  assert.equal(byId.R044.ingredients.at(-1), "Omelet: 4 eggs, beaten");
  assert.equal(byId.R093.ingredients[0], "8 oz/227 g chopped carrots");
  assert.deepEqual(byId.R138.ingredients, [
    "4 lb/1.81 kg dark chocolate, finely chopped",
    "32 fl oz/960 mL heavy cream"
  ]);
});
