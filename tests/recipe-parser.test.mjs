import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

async function parser() {
  const source = await readFile(new URL("../site/recipe-parser.js", import.meta.url), "utf8");
  const context = vm.createContext({});
  vm.runInContext(source, context, { filename: "recipe-parser.js" });
  return context.GCSDRecipeParser;
}

test("Recipe Studio parser structures copied recipes for quick review", async () => {
  const subject = await parser();
  const result = subject.parseRecipeText(`Salsa Fresca
Yield: 12 portions

Ingredients
2 lb Roma tomatoes, diced
1/2 cup yellow onion, minced
1 jalapeno pepper, minced
1/4 cup cilantro, chopped
Salt to taste

Directions
1. Combine the tomatoes, onion, jalapeno, and cilantro.
2. Season and chill before service.

https://example.test/salsa`);
  assert.equal(result.name, "Salsa Fresca");
  assert.equal(result.standardYieldQuantity, 12);
  assert.equal(result.standardYieldUnit, "portions");
  assert.match(result.ingredientsText, /Roma tomatoes \| 2 \| lb \| diced/);
  assert.match(result.ingredientsText, /yellow onion \| 0\.5 \| cup \| minced/);
  assert.match(result.ingredientsText, /jalapeno pepper \| 1 \| each \| minced/);
  assert.match(result.ingredientsText, /Salt \| to taste \|  \|/);
  assert.match(result.procedureText, /^Combine the tomatoes/m);
  assert.match(result.sourceNotes, /https:\/\/example\.test\/salsa/);
  assert.deepEqual(Array.from(result.warnings), []);
});

test("Recipe Studio parser reports uncertain missing sections instead of inventing them", async () => {
  const subject = await parser();
  const result = subject.parseRecipeText("Mystery Bread\nA family favorite with a crisp crust.");
  assert.equal(result.name, "Mystery Bread");
  assert.equal(result.standardYieldQuantity, 0);
  assert.equal(result.ingredientsText, "");
  assert.equal(result.procedureText, "");
  assert.match(result.warnings.join(" "), /Yield was not detected/);
  assert.match(result.warnings.join(" "), /No structured ingredient/);
  assert.match(result.warnings.join(" "), /Procedure steps/);
});
