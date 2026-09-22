# Recovered Ingredient Remediation

## Outcome

- **110 of 110** recovered production-recipe ingredient lists were re-transcribed and visually proofread against the surviving source photographs.
- Procedures, yield quantities, portion sizes, catalog IDs, and source-image links were preserved.
- Every recovered recipe remains `productionReady: false` and requires teacher verification before production.
- The reproducible structured source is `data/recovered-recipes.json`; `apps-script/teacher/RecoveredRecipes.gs` is the Apps Script integration generated from the same records.

## 171-entry reconciliation

| Catalog status | Count | Ingredient action |
| --- | ---: | --- |
| Recovered production recipes | 110 | Ingredient lists visually re-transcribed |
| Recovered reference/master formulas (R003–R005) | 3 | Retained as references, not duplicated as production recipes |
| Source photos still missing | 58 | Listed in `docs/missing-recipe-source-list.md` |
| **Catalog total** | **171** | Fully reconciled |

## What changed

The original pass read whole photographed pages. On pages with two or more recipes, OCR crossed columns and sometimes appended procedure text. The remediation workflow now:

1. isolates each recipe region for OCR assistance;
2. uses exact visual transcriptions from the source photographs for the final ingredient arrays;
3. records before/after values in `docs/recovered-ingredient-reconciliation.json`;
4. generates both the structured JSON source and Apps Script data;
5. rejects procedure leakage, common OCR debris, missing lists, and divergence between the two generated representations in automated tests.

The reconciliation JSON intentionally retains the prior ingredient arrays under `before` so each change can be reviewed against the corrected list.
