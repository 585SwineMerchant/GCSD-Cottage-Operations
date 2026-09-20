import assert from "node:assert/strict";
import test from "node:test";
import { inspectConfiguration } from "../scripts/check-google-readiness.mjs";

test("blank Google URLs are reported as intentionally pending", () => {
  const result = inspectConfiguration({ publicFeedUrl: "", teacherCommandCenterUrl: "", recipeImportUrl: "" });
  assert.equal(result.connected, false);
  assert.equal(result.issues.length, 0);
  assert.equal(result.pending.length, 3);
});

test("only production Apps Script exec URLs pass readiness validation", () => {
  const valid = inspectConfiguration({
    publicFeedUrl: "https://script.google.com/macros/s/public_feed_123/exec",
    teacherCommandCenterUrl: "https://script.google.com/a/macros/greececsd.org/s/teacher_app_456/exec",
    recipeImportUrl: "https://script.google.com/macros/s/recipe_import_789/exec"
  });
  assert.equal(valid.connected, true);
  assert.deepEqual(valid.issues, []);

  const invalid = inspectConfiguration({
    publicFeedUrl: "https://script.google.com/macros/s/public_feed_123/dev",
    teacherCommandCenterUrl: "https://example.test/exec",
    recipeImportUrl: "https://script.google.com/macros/s/recipe_import_789/exec"
  });
  assert.equal(invalid.connected, false);
  assert.equal(invalid.issues.length, 2);
});
