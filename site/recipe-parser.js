(() => {
  const unicodeFractions = { "¼": .25, "½": .5, "¾": .75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": .125, "⅜": .375, "⅝": .625, "⅞": .875 };
  const unitAliases = {
    c: "cup", cup: "cup", cups: "cup", tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp",
    tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp", lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
    oz: "oz", ounce: "oz", ounces: "oz", "fl oz": "fl oz", pint: "pt", pints: "pt", quart: "qt", quarts: "qt",
    gallon: "gal", gallons: "gal", g: "g", gram: "g", grams: "g", kg: "kg", kilogram: "kg", kilograms: "kg",
    ml: "ml", milliliter: "ml", milliliters: "ml", l: "l", liter: "l", liters: "l", each: "each",
    clove: "each", cloves: "each", bunch: "each", bunches: "each", can: "each", cans: "each", package: "each", packages: "each"
  };
  const headings = {
    ingredients: /^(?:ingredients?|what you(?:'|’)ll need)$/i,
    procedure: /^(?:directions?|instructions?|method|preparation|steps?)$/i,
    equipment: /^(?:equipment|tools?|supplies)$/i,
    allergens: /^(?:allergens?|allergy information)$/i
  };

  function cleanLine(value) {
    return String(value || "").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim();
  }

  function quantityValue(value) {
    const text = cleanLine(value).replace(/^(?:about|approximately|approx\.?|~)\s*/i, "");
    if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
    const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/), fraction = text.match(/^(\d+)\/(\d+)$/), unicode = text.match(/^(\d+)?\s*([¼½¾⅓⅔⅛⅜⅝⅞])$/);
    if (mixed && Number(mixed[3])) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    if (fraction && Number(fraction[2])) return Number(fraction[1]) / Number(fraction[2]);
    if (unicode) return Number(unicode[1] || 0) + unicodeFractions[unicode[2]];
    return 0;
  }

  function headingFor(line) {
    const candidate = cleanLine(line).replace(/[:\-–—]+$/, "");
    return Object.keys(headings).find(key => headings[key].test(candidate)) || "";
  }

  function ingredientFromLine(value) {
    let line = cleanLine(value).replace(/^[•*·▪◦‣-]\s*/, "");
    if (!line || headingFor(line)) return null;
    const quantityMatch = line.match(/^(?:(?:about|approximately|approx\.?|~)\s*)?(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?\s*[¼½¾⅓⅔⅛⅜⅝⅞]?|[¼½¾⅓⅔⅛⅜⅝⅞])(?:\s+|$)/i);
    let quantity = 0, quantityText = "", unit = "";
    if (quantityMatch) {
      quantity = quantityValue(quantityMatch[1]);
      line = line.slice(quantityMatch[0].length).trim();
      const unitMatch = line.match(/^(fl\s*oz|cups?|c|tablespoons?|tbsp|teaspoons?|tsp|pounds?|lbs?|ounces?|oz|pints?|quarts?|gallons?|grams?|g|kilograms?|kg|milliliters?|ml|liters?|l|each|cloves?|bunch(?:es)?|cans?|packages?)\.?\s+/i);
      if (unitMatch) {
        const key = unitMatch[1].toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
        unit = unitAliases[key] || key;
        line = line.slice(unitMatch[0].length).trim();
      } else unit = "each";
    } else {
      const qualitative = line.match(/\b(to taste|as needed|for garnish|for serving)\b/i);
      if (!qualitative) return null;
      quantityText = qualitative[1].toLowerCase();
      line = line.replace(qualitative[0], "").replace(/[,;\s]+$/, "").trim();
    }
    line = line.replace(/^of\s+/i, "");
    const parts = line.split(/,(.+)/).map(cleanLine);
    const name = parts[0], preparation = parts[1] || "";
    return name ? { name, quantity, quantityText, unit, preparation } : null;
  }

  function ingredientText(item) {
    const amount = item.quantity ? String(Math.round(item.quantity * 10000) / 10000) : item.quantityText;
    return [item.name, amount, item.unit, item.preparation].join(" | ");
  }

  function parseRecipeText(value) {
    const raw = String(value || "").replace(/\r/g, "");
    const lines = raw.split(/\n+/).map(cleanLine).filter(Boolean);
    const sections = { ingredients: [], procedure: [], equipment: [], allergens: [] };
    let current = "", sawHeading = false;
    lines.forEach(line => {
      const heading = headingFor(line);
      if (heading) { current = heading; sawHeading = true; return; }
      if (/^(?:notes?|nutrition(?: facts)?|reviews?|related recipes?|storage|tips?)\s*:?$/i.test(line)) { current = ""; return; }
      if (current && !/^https?:\/\//i.test(line) && !/\b(?:yield|serves?|servings?|makes|prep time|cook time|total time)\b/i.test(line)) sections[current].push(line);
    });
    if (!sawHeading) {
      lines.forEach(line => {
        if (ingredientFromLine(line)) sections.ingredients.push(line);
        else if (/^(?:step\s*)?\d+[.)]\s+/.test(line) || /^(?:mix|stir|combine|heat|cook|bake|roast|whisk|add|place|season|serve|chill|refrigerate|preheat|bring|reduce|remove|fold|knead|rest)\b/i.test(line)) sections.procedure.push(line);
      });
    }
    const ingredients = sections.ingredients.map(ingredientFromLine).filter(Boolean);
    const procedures = sections.procedure.map(line => line.replace(/^(?:step\s*)?\d+[.)]\s*/i, "").trim()).filter(Boolean);
    const yieldLine = lines.find(line => /\b(?:yield|serves?|servings?|makes)\b/i.test(line)) || "";
    const yieldMatch = yieldLine.match(/\b(?:yield|serves?|servings?|makes)\s*:?\s*(\d+(?:\.\d+)?)\s*([a-z][a-z -]*)?/i);
    const title = lines.find(line => !headingFor(line) && !/^https?:\/\//i.test(line) && !/\b(?:yield|serves?|servings?|makes|prep time|cook time|total time)\b/i.test(line) && !ingredientFromLine(line) && line.length <= 160) || "";
    const urls = [...new Set((raw.match(/https?:\/\/[^\s]+/gi) || []).map(url => url.replace(/[),.;]+$/, "")))];
    const warnings = [];
    if (!title) warnings.push("Recipe title was not detected.");
    if (!yieldMatch) warnings.push("Yield was not detected.");
    if (!ingredients.length) warnings.push("No structured ingredient quantities were detected.");
    if (!procedures.length) warnings.push("Procedure steps were not detected.");
    return {
      name: title,
      standardYieldQuantity: yieldMatch ? Number(yieldMatch[1]) : 0,
      standardYieldUnit: yieldMatch ? cleanLine(yieldMatch[2] || "portions").replace(/[.]+$/, "") : "",
      ingredientsText: ingredients.map(ingredientText).join("\n"),
      procedureText: procedures.join("\n"),
      equipmentText: sections.equipment.map(line => line.replace(/^[•*·▪◦‣-]\s*/, "")).join("\n"),
      allergens: sections.allergens.join("; "),
      sourceNotes: urls.length ? `Source: ${urls.join(", ")}` : "",
      warnings,
      extractedLineCount: lines.length
    };
  }

  globalThis.GCSDRecipeParser = Object.freeze({ parseRecipeText, ingredientFromLine, quantityValue });
})();
