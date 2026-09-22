#!/usr/bin/env python3
"""Re-transcribe recovered recipe ingredients from isolated source-page regions.

The first recovery pass read entire photographed pages. Multi-recipe layouts
therefore crossed columns and allowed procedure fragments into ingredient
arrays. This script locates each printed recipe heading, crops only that
recipe's column, runs several OCR layouts, and selects the most ingredient-like
result. It changes ingredient arrays only; procedures, yields, portions, IDs,
and review status remain untouched.
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import subprocess
import tempfile
import unicodedata
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps


RECORDS_PATTERN = re.compile(
    r"const RECOVERED_SOURCE_RECIPES = (\[.*?\]);\n\n/\*\*",
    re.S,
)
WORD_RE = re.compile(r"[a-z0-9]+")
STEP_RE = re.compile(r"^\s*[1Iil]\s*[\.,:]\s+")
QUANTITY_RE = re.compile(
    r"^(?:\d|[¼½¾⅓⅔⅛⅜⅝⅞]|one\b|two\b|three\b|four\b|five\b|six\b|"
    r"salt\b|pepper\b|ground\b|pinch\b|dash\b|tabasco\b|garnish\b|"
    r"vegetable oil\b|olive oil\b|water\b|flour\b)",
    re.I,
)
UNIT_RE = re.compile(
    r"\b(?:lb|oz|fl oz|kg|g|mL|L|tsp|tbsp|cup|cups|clove|cloves|"
    r"each|dozen|bunch|sprig|sprigs|egg|eggs)\b|\bas needed\b",
    re.I,
)
FURNITURE_RE = re.compile(
    r"^(?:recipes?|chapter\b|part\s+\d|notes?\b|variations?\b|makes?\b)",
    re.I,
)

# Exact visual transcriptions for layouts that cannot be separated reliably by
# general-purpose OCR. These were read directly from the surviving photographs.
MANUAL_INGREDIENTS: dict[str, list[str]] = {
    "R006": ["2 fl oz/60 mL vegetable oil", "4 lb/1.81 kg lean veal trim", "1 lb/454 g medium-dice Mirepoix (page 333)", "4 fl oz/120 mL tomato purée", "1 gal 16 fl oz/4.32 L Brown Veal Stock (page 352)", "1 Sachet d’Épices (page 331)", "1 oz/28 g arrowroot or cornstarch, diluted with cold water or stock to make a slurry", "salt, as needed", "ground black pepper, as needed"],
    "R007": ["3 fl oz/90 mL vegetable oil", "1 lb/454 g medium-dice Mirepoix (page 333)", "2 fl oz/60 mL tomato paste", "1 gal 64 fl oz/5.76 L Brown Veal Stock (page 352)", "1 lb/454 g Brown Roux (page 335)", "1 Sachet d’Épices (page 331)", "salt, as needed", "ground black pepper, as needed"],
    "R008": ["32 fl oz/960 mL Brown Veal Stock (page 352)", "32 fl oz/960 mL Espagnole Sauce (page 382)"],
    "R009": ["2 fl oz/60 mL clarified butter or vegetable oil", "8 oz/227 g small-dice White Mirepoix (page 333)", "12 oz/340 g Blond Roux (page 335)", "1 gal 16 fl oz/4.32 L Chicken Stock (page 351)", "1 Sachet d’Épices (page 331)", "salt, as needed", "ground white pepper, as needed"],
    "R010": ["2 fl oz/60 mL clarified butter or vegetable oil", "2 oz/57 g minced onions", "1 lb/454 g White Roux (page 335)", "1 gal 16 fl oz/4.32 L milk", "salt, as needed", "ground white pepper, as needed", "ground nutmeg, as needed (optional)"],
    "R011": ["2 fl oz/60 mL olive oil", "8 oz/227 g small-dice onions", "2 oz/57 g minced or thinly sliced garlic", "10 to 12 lb/4.54 to 5.44 kg cored and chopped plum tomatoes", "3 oz/85 g chopped basil leaves", "salt, as needed", "ground black pepper, as needed"],
    "R012": ["1 fl oz/30 mL olive oil", "4 oz/113 g minced onions", "2 tsp/6 g minced garlic", "4 fl oz/120 mL tomato purée", "6 fl oz/180 mL red wine", "1 lb 4 oz/567 g peeled, seeded, and medium-diced plum tomatoes", "16 fl oz/480 mL Chicken Stock (page 351)", "5 basil leaves", "1 thyme sprig", "1 bay leaf", "salt, as needed", "ground black pepper, as needed"],
    "R013": ["2 oz/57 g finely diced pancetta", "1/2 fl oz/15 mL extra-virgin olive oil", "1/2 oz/14 g butter", "5 oz/142 g fine-dice onions", "2 oz/57 g fine-dice carrots", "1 1/2 oz/43 g fine-dice celery", "8 oz/227 g lean ground beef", "8 oz/227 g lean ground pork", "8 fl oz/240 mL white wine", "1 1/2 oz/43 g tomato paste", "salt, as needed", "ground black pepper, as needed", "ground nutmeg, as needed", "16 fl oz/480 mL Chicken Stock (page 351)", "8 fl oz/240 mL heavy cream, heated"],
    "R014": ["3/4 tsp/1.50 g cracked black peppercorns", "3 fl oz/90 mL cider or white wine vinegar", "3 fl oz/90 mL water", "6 fl oz/180 mL (about 8) egg yolks, fresh or pasteurized", "18 fl oz/540 mL melted or clarified butter, warm", "1/2 fl oz/15 mL lemon juice", "salt, as needed", "ground white pepper, as needed", "pinch cayenne (optional)"],
    "R015": ["3/4 tsp/1.50 g cracked black peppercorns", "1 tbsp/6 g dried tarragon", "3 tarragon stems, chopped", "3 fl oz/90 mL tarragon vinegar", "1 1/2 fl oz/45 mL dry white wine", "3 fl oz/90 mL water", "6 fl oz/180 mL (about 8) egg yolks, fresh or pasteurized", "24 fl oz/720 mL melted or clarified butter, warm", "3 tbsp/9 g chopped tarragon", "1 1/2 tbsp/4.50 g chopped chervil", "salt, as needed"],
    "R016": ["1 fl oz/30 mL olive oil", "1/2 oz/14 g minced shallots", "1 lb 8 oz/680 g peeled, seeded, deribbed, and chopped red peppers", "salt, as needed", "ground black pepper, as needed", "4 fl oz/120 mL dry white wine", "8 fl oz/240 mL Chicken Stock (page 351)", "2 to 3 fl oz/60 to 90 mL heavy cream (optional)"],
    "R024": ["1 gal 32 fl oz/4.80 L Chicken Stock (page 351)", "about 6 lb/2.72 kg whole chicken", "2 fl oz/60 mL vegetable oil", "1 lb 6 oz/624 g minced onions", "2 garlic cloves, roughly chopped", "10 oz/284 g plum tomatoes, charred, peeled, and seeded", "2 tsp/2 g epazote", "salt, as needed", "ground black pepper, as needed", "Garnish: 2 to 4 pasilla chiles", "Garnish: 4 corn tortillas, julienned", "Garnish: 2 avocados, medium dice", "Garnish: limes, cut into wedges", "Garnish: 8 oz/227 g grated Monterey Jack"],
    "R027": ["2 lb 8 oz/1.13 kg conch meat, ground through a 1/8-in/3-mm die", "2 fl oz/60 mL lemon juice", "1 1/2 oz/43 g butter", "2 lb/907 g medium-dice Mirepoix (page 333)", "1 Scotch bonnet, seeded, minced", "1 lb 8 oz/680 g potatoes, peeled, medium dice", "64 fl oz/1.92 L water", "64 fl oz/1.92 L Fish Stock (page 353)", "1 lb 8 oz/680 g peeled, seeded, and medium-diced plum tomatoes", "2 oz/57 g tomato paste", "2 bay leaves", "1 tbsp/3 g chopped thyme", "salt, as needed", "ground black pepper, as needed"],
    "R028": ["4 oz/113 g salt pork", "2 oz/57 g butter", "6 oz/170 g small-dice onions", "6 oz/170 g small-dice celery", "4 oz/113 g small-dice green peppers", "4 oz/113 g small-dice red peppers", "3 1/2 oz/94 g all-purpose flour", "64 fl oz/1.92 L Chicken Stock (page 351)", "2 lb/907 g corn kernels, fresh or frozen", "2 lb/907 g potatoes, peeled, small dice", "1 bay leaf", "8 fl oz/240 mL heavy cream, hot", "8 fl oz/240 mL milk, hot", "salt, as needed", "ground white pepper, as needed", "2 tsp/10 mL Tabasco sauce", "2 tsp/10 mL Worcestershire sauce"],
    "R030": ["2 oz/57 g minced bacon", "2 fl oz/60 mL vegetable oil", "1 lb/454 g small-dice Mirepoix (page 333)", "2 tsp/6 g minced garlic", "1 gal 64 fl oz/5.76 L Chicken Stock (page 351)", "1 lb/454 g potatoes, peeled, large dice", "2 lb/907 g green split peas", "1 ham hock", "1 bay leaf", "salt, as needed", "ground black pepper, as needed", "Garnish: 1 lb/454 g Croutons (page 921)"],
    "R031": ["3 oz/85 g diced salt pork", "8 oz/227 g small-dice Mirepoix (page 333)", "2 lb/907 g dried black beans, soaked overnight", "1 gal 64 fl oz/5.76 L Chicken Stock (page 351)", "1 Sachet d’Épices (page 331)", "2 smoked ham hocks", "5 1/2 fl oz/165 mL dry sherry", "1/2 tsp/1 g ground allspice", "salt, as needed", "ground black pepper, as needed", "Garnish: 13 oz/369 g sour cream", "Garnish: 5 1/2 oz/156 g peeled, seeded, and medium-diced plum tomatoes", "Garnish: 1 oz/28 g thinly sliced green onions, cut on the bias"],
    "R033": ["6 oz/170 g medium-dice bacon", "1 lb/454 g medium-dice Mirepoix (page 333)", "2 lb/907 g brown lentils, rinsed and sorted", "1 gal 64 fl oz/5.76 L Chicken Stock (page 351)", "salt, as needed", "ground black pepper, as needed", "1 Sachet d’Épices (page 331)", "2 fl oz/60 mL lemon juice", "Garnish: 8 oz/227 g Croutons (page 921)", "Garnish: 1 oz/28 g chopped chervil"],
    "R034": ["3 fl oz/90 mL olive oil", "1 lb 2 oz/510 g small-dice onions", "1 lb 2 oz/510 g small-dice carrots", "1 lb 2 oz/510 g small-dice celery", "8 oz/227 g thinly sliced leeks", "2 lb 4 oz/1.25 kg small-dice fennel", "6 garlic cloves, crushed", "6 lb 5 oz/2.86 kg lobster shells, cleaned, crushed, and roasted", "4 oz/113 g tomato paste", "2 1/2 fl oz/75 mL brandy", "12 fl oz/360 mL dry white wine", "96 fl oz/2.88 L Fish Stock (page 353)", "48 fl oz/1.44 L water", "4 oz/113 g Italian rice (Arborio or Carnaroli)", "5 oz/142 g Blond Roux (page 335)", "24 fl oz/720 mL heavy cream, hot", "salt, as needed", "cayenne, as needed", "1 fl oz/15 mL lemon juice", "1 oz/28 g tarragon leaves, chopped"],
    "R037": ["8 lb/3.63 kg peeled, seeded, and medium-diced plum tomatoes", "1 lb/454 g diced green peppers", "1 lb/454 g diced cucumbers", "8 garlic cloves, crushed", "8 fl oz/240 mL red wine vinegar", "16 fl oz/480 mL olive oil", "salt, as needed", "ground black pepper, as needed", "Garnish: 4 oz/113 g small-dice tomatoes", "Garnish: 4 oz/113 g small-dice green peppers", "Garnish: 4 oz/113 g small-dice cucumbers", "Garnish: 1 oz/28 g small-dice bread"],
    "R039": ["2 fl oz/60 mL vegetable oil", "1 tbsp/9 g minced ginger", "3/4 oz/21 g thinly sliced green onions", "8 oz/227 g ground pork butt", "1 oz/28 g black fungus, soaked, short julienne", "1 1/2 oz/43 g lily buds, soaked, short julienne", "8 oz/227 g savoy cabbage, chiffonade", "8 oz/227 g small-dice firm tofu", "112 fl oz/3.36 L Chicken Stock (page 351)", "2 fl oz/60 mL dark soy sauce", "8 fl oz/240 mL rice vinegar", "1 tbsp/15 g salt", "3/4 oz/21 g ground black pepper", "2 1/4 oz/64 g cornstarch", "4 fl oz/120 mL water", "3 eggs, lightly beaten", "1 fl oz/30 mL sesame oil", "Garnish: 1 oz/28 g thinly sliced green onions"],
    "R042": ["1 fl oz/30 mL vegetable oil", "3 1/4 oz/92 g minced shallots", "1 1/2 tsp/4.50 g minced garlic", "2 oz/57 g minced lemongrass", "1 fl oz/30 mL Thai chili paste", "1 1/2 oz/43 g galangal, sliced 1/4 in/6 mm thick", "12 kaffir lime leaves, bruised", "80 fl oz/2.40 L Chicken Stock (page 351)", "1 tbsp/15 g sugar, or as needed", "6 fl oz/180 mL fish sauce, or as needed", "48 fl oz/1.44 L coconut milk", "8 oz/227 g chicken thighs, cut into thin strips", "6 1/2 oz/184 g canned straw mushrooms, drained and halved", "4 oz/113 g medium-dice tomatoes", "1 fl oz/30 mL lime juice, or as needed", "1 tbsp/15 g salt, or as needed", "Garnish: 40 cilantro sprigs"],
    "R043": ["1 fl oz/30 mL vegetable oil", "2 fl oz/60 mL Red Curry Paste (page 464)", "shrimp shells, reserved from shrimp (below)", "1 tbsp/8 g minced Thai bird chiles", "1 gal/3.84 L Chicken Stock (page 351)", "4 stalks lemongrass, bruised, cut into 3-in/8-cm lengths", "1 oz/28 g galangal, sliced 1/8 in/3 mm thick", "12 kaffir lime leaves, bruised", "14 oz/397 g plum tomatoes, cut into eighths", "1 lb 2 oz/510 g canned straw mushrooms, drained and halved", "4 fl oz/120 mL fish sauce", "1 oz/28 g sugar", "4 fl oz/120 mL lime juice", "1 lb/454 g shrimp (31–36 count), peeled, deveined, halved lengthwise", "1 1/2 oz/43 g cilantro leaves"],
    "R044": ["Wontons: 8 oz/227 g ground pork", "Wontons: 8 oz/227 g finely chopped Chinese cabbage", "Wontons: 1 oz/28 g thinly sliced green onions", "Wontons: 2 tsp/6 g minced ginger", "Wontons: 1/2 fl oz/15 mL light soy sauce", "Wontons: 1/2 fl oz/15 mL sesame oil", "Wontons: 1/2 tsp/2.50 g salt, or as needed", "Wontons: 1 tbsp/15 g sugar", "Wontons: 1/4 tsp/0.50 g ground white pepper, or as needed", "Wontons: 40 wonton wrappers (3-in/8-cm square)", "Wontons: 1 egg, slightly beaten", "Soup: 1 fl oz/30 mL vegetable or peanut oil", "Soup: 2 oz/57 g thinly sliced green onions, cut on the bias", "Soup: 1 tsp/3 g minced ginger", "Soup: 1 gal/3.84 L Chicken Stock (page 351)", "Soup: 2 1/2 fl oz/75 mL dark soy sauce", "Soup: 1/4 tsp/1.25 g salt, or as needed", "Soup: 1/8 tsp/0.25 g ground white pepper, or as needed", "Soup: 6 oz/170 g spinach, stemmed", "Soup: 4 oz/113 g ham, fine julienne", "Omelet: 1/2 fl oz/15 mL vegetable or peanut oil", "Omelet: 4 eggs, beaten"],
    "R047": ["1 fl oz/30 mL olive oil", "12 oz/340 g small-dice pancetta", "6 oz/170 g small-dice onions", "1 oz/28 g minced shallots", "12 oz/340 g dried navy beans, soaked overnight", "1 lb 8 oz/680 g canned tomatoes, seeded and chopped", "80 fl oz/2.40 L Chicken Stock (page 351)", "1 Sachet d’Épices (page 331)", "4 oz/113 g small-dice carrots", "salt, as needed", "ground black pepper, as needed", "8 oz/227 g escarole, finely chopped", "8 oz/227 g tubettini pasta", "olive oil, as needed", "1 3/4 oz/50 g sliced garlic", "Garnish: 20 croutons", "Garnish: 1 1/2 oz/43 g grated Parmesan"],
    "R048": ["4 lb/1.81 kg (about 4) eggplants", "6 oz/170 g tahini", "1 oz/28 g roughly chopped garlic", "6 fl oz/180 mL lemon juice", "salt, as needed", "ground black pepper, as needed", "1 1/2 oz/43 g chopped parsley"],
    "R052": ["20 Thai chiles, red and/or green", "1/2 oz/14 g minced garlic", "4 oz/113 g sugar", "16 fl oz/480 mL warm water", "4 fl oz/120 mL lime juice", "8 fl oz/240 mL fish sauce", "1 1/2 oz/43 g finely shredded carrots"],
    "R053": ["1 oz/28 g finely shredded carrots", "2 oz/57 g finely shredded daikon", "3 1/2 oz/99 g sugar", "1/2 oz/14 g minced garlic", "1/2 oz/14 g minced red chiles", "4 fl oz/120 mL lime or lemon juice", "8 fl oz/240 mL rice vinegar", "4 fl oz/120 mL Vietnamese fish sauce (nuoc mam)", "8 fl oz/240 mL water"],
    "R054": ["16 fl oz/480 mL plain yogurt", "1 lb/454 g cucumbers, peeled, seeded, small dice", "1 tbsp/9 g minced garlic", "2 tsp/4 g ground cumin", "1 tsp/2 g ground turmeric", "salt, as needed", "ground white pepper, as needed"],
    "R059": ["12 oz/340 g cranberries", "3 fl oz/90 mL orange juice", "3 fl oz/90 mL Triple Sec", "3 oz/85 g sugar, or as needed", "1 oz/28 g minced orange zest", "10 oz/284 g orange suprêmes", "salt, as needed", "ground black pepper, as needed"],
    "R062": ["3 lb 4 oz/1.47 kg jalapeños", "1 3/4 oz/50 g garlic", "7 oz/198 g cilantro", "3 1/2 oz/99 g parsley", "3 1/2 oz/99 g mint", "4 tsp/8 g cumin seeds, toasted", "4 tsp/10 g cardamom pods, peeled, seeds toasted", "16 fl oz/480 mL extra-virgin olive oil", "6 fl oz/180 mL lemon juice, or as needed", "salt, as needed", "ground black pepper, as needed"],
    "R067": ["1 lb/454 g small-dice onions", "1/4 tsp/0.75 g minced garlic", "8 fl oz/240 mL white vinegar", "6 oz/170 g sugar", "salt, as needed", "1/2 oz/14 g pickling spice, tied into a sachet", "1 tbsp/6 g Curry Powder (page 463)"],
    "R068": ["1 habanero", "1 lb/454 g thinly sliced red onions", "6 fl oz/180 mL orange juice or lime juice", "salt, as needed"],
    "R069": ["1 lb/454 g ginger, peeled and very thinly sliced", "1 1/2 oz/43 g sea salt", "16 fl oz/480 mL rice vinegar", "5 1/2 oz/156 g sugar", "8 shiso leaves, chiffonade"],
    "R070": ["16 fl oz/480 mL yogurt", "16 fl oz/480 mL sour cream", "1 pineapple, small dice", "3/4 oz/21 g mint, chiffonade", "10 Thai chiles, minced (optional)", "salt, as needed", "ground cumin, as needed"],
    "R071": ["8 fl oz/240 mL red wine vinegar", "2 tsp/10 g mustard (optional)", "1/2 oz/14 g minced shallots", "salt, as needed", "ground black pepper, as needed", "2 tsp/10 g sugar", "24 fl oz/720 mL olive oil or canola oil", "3 tbsp/9 g minced herbs, such as chives, parsley, oregano, basil, and tarragon (optional)"],
    "R073": ["16 fl oz/480 mL apple cider", "6 fl oz/180 mL apple cider vinegar", "1 Granny Smith apple, peeled, brunoise", "2 tsp/10 g salt", "1/4 tsp/0.50 g ground white pepper", "24 fl oz/720 mL vegetable oil", "2 tbsp/6 g minced tarragon", "1/2 fl oz/15 mL maple syrup"],
    "R076": ["24 fl oz/720 mL olive oil", "3 tbsp/19 g Curry Powder (page 463)", "1 oz/28 g minced shallots", "1/2 oz/14 g minced garlic", "1/2 oz/14 g minced ginger", "1/2 oz/14 g minced lemongrass (tender center portion only)", "8 fl oz/240 mL cider vinegar", "lemon juice, as needed", "honey, as needed", "salt, as needed", "ground black pepper, as needed"],
    "R077": ["2 tsp/10 mL olive oil", "1/2 oz/14 g minced shallots", "3 fl oz/90 mL ketchup", "2 fl oz/60 mL red wine vinegar", "2 fl oz/60 mL orange juice", "2 fl oz/60 mL grapefruit juice", "1 oz/28 g honey", "1/2 tsp/1 g dry mustard", "1 1/2 tsp/4 g poppy seeds", "24 fl oz/720 mL olive oil", "salt, as needed", "ground black pepper, as needed"],
    "R083": ["5 fl oz/150 mL sherry vinegar", "3 fl oz/90 mL lemon juice", "salt, as needed", "ground black pepper, as needed", "12 fl oz/360 mL olive oil", "12 fl oz/360 mL vegetable oil", "1/2 oz/14 g minced chervil", "1/2 oz/14 g minced tarragon"],
    "R084": ["3 1/2 fl oz/105 mL pasteurized eggs", "4 oz/113 g dark brown sugar", "4 fl oz/120 mL apple cider vinegar", "2 tsp/10 g Dijon mustard", "1/4 tsp/0.50 g garlic powder", "1/4 tsp/0.50 g onion powder", "dash ground allspice", "salt, as needed", "ground white pepper, as needed", "12 fl oz/360 mL Paprika Oil (page 940)"],
    "R086": ["1/2 oz/14 g minced garlic", "2 tbsp/6 g chopped tarragon", "3 tbsp/9 g minced chives", "3 tbsp/9 g chopped parsley", "4 oz/113 g brown sugar", "12 fl oz/360 mL malt vinegar", "24 fl oz/720 mL peanut oil", "8 fl oz/240 mL salad oil", "4 oz/113 g peanut butter", "salt, as needed", "ground black pepper, as needed", "Tabasco sauce, as needed"],
    "R087": ["12 oz/340 g peeled, seeded, and thinly sliced cucumbers", "2 fl oz/60 mL lemon juice", "8 fl oz/240 mL sour cream", "3 tbsp/9 g minced dill", "1 tbsp/15 g sugar, or as needed", "salt, as needed", "ground white pepper, as needed", "Tabasco sauce, as needed"],
    "R088": ["3 oz/85 g anchovy fillets", "1/2 oz/14 g mild mustard", "2 tsp/6 g garlic paste", "1/2 fl oz/15 mL Worcestershire sauce", "6 fl oz/180 mL red wine vinegar", "2 oz/57 g grated Parmesan", "salt, as needed", "ground black pepper, as needed", "18 fl oz/540 mL olive oil", "1 fl oz/30 mL lemon juice, or as needed", "1/2 tsp/2.50 mL Tabasco sauce, or as needed"],
    "R091": ["4 oz/113 g crumbled blue cheese", "16 fl oz/480 mL Mayonnaise (page 936)", "8 fl oz/240 mL sour cream", "6 fl oz/180 mL buttermilk", "3 fl oz/90 mL milk", "1/2 fl oz/15 mL lemon juice, or as needed", "1 oz/28 g puréed onions", "2 tsp/6 g garlic paste", "Worcestershire sauce, as needed", "salt, as needed", "ground black pepper, as needed"],
    "R092": ["28 fl oz/840 mL Mayonnaise (page 936)", "4 fl oz/120 mL milk or buttermilk", "3 to 4 oz/85 to 113 g grated Parmesan, or as needed", "2 oz/57 g anchovy paste", "1 oz/28 g garlic paste", "2 tbsp/12 g coarsely ground black pepper", "salt, as needed", "ground black pepper, as needed"],
    "R093": ["8 oz/227 g chopped carrots", "4 oz/113 g chopped onions", "4 oz/113 g chopped celery", "1 orange, peeled and seeded", "4 tsp/12 g minced ginger", "1 1/2 fl oz/45 mL light soy sauce", "1 1/2 oz/43 g ketchup", "2 fl oz/60 mL rice vinegar", "2 tsp/10 g sugar", "1 fl oz/30 mL Mayonnaise (page 936)", "8 fl oz/240 mL vegetable oil", "salt, as needed"],
    "R094": ["12 fl oz/360 mL sour cream", "12 fl oz/360 mL Mayonnaise (page 936)", "8 fl oz/240 mL buttermilk", "1 fl oz/30 mL lemon juice", "2 fl oz/60 mL red wine vinegar", "2 tsp/6 g garlic, mashed to a paste", "1 1/2 fl oz/45 mL Worcestershire sauce", "1 tbsp/3 g minced parsley", "1 tbsp/3 g minced chives", "1 tbsp/9 g minced shallots", "1 tbsp/15 g Dijon mustard", "1 tsp/2 g celery seed", "salt, as needed", "ground black pepper, as needed"],
    "R095": ["24 fl oz/720 mL Mayonnaise (page 936)", "6 fl oz/180 mL chili sauce", "2 fl oz/60 mL ketchup", "1 1/2 tsp/7.50 mL Worcestershire sauce", "1 1/2 tsp/7.50 mL Tabasco sauce", "4 oz/113 g minced onions", "2 1/4 tsp/6.75 g minced garlic", "3 oz/85 g sweet pickle relish", "2 Hard-Cooked Eggs (page 897), finely chopped", "salt, as needed", "ground black pepper, as needed", "1/2 fl oz/15 mL lemon juice, or as needed"],
    "R098": ["16 fl oz/480 mL vegetable oil", "4 oz/113 g thinly sliced green onions"],
    "R134": ["64 fl oz/1.92 L water", "2 lb/907 g sugar", "1/2 oz/14 g salt", "10 fl oz/300 mL lemon juice", "1 oz/28 g grated lemon zest", "6 oz/170 g cornstarch", "8 oz/227 g egg yolks", "4 oz/113 g butter"],
    "R138": ["4 lb/1.81 kg dark chocolate, finely chopped", "32 fl oz/960 mL heavy cream"],
    "R139": ["10 oz/284 g sugar", "16 fl oz/480 mL water", "4 1/2 oz/128 g light corn syrup", "4 oz/113 g cocoa powder, sifted", "1 lb/454 g bittersweet chocolate, melted"],
    "R140": ["24 fl oz/720 mL heavy cream", "13 oz/369 g sugar", "10 oz/284 g glucose syrup", "2 1/4 oz/64 g butter, soft, cubed"],
    "R143": ["9 oz/255 g apricot jam", "6 fl oz/180 mL water", "9 oz/255 g corn syrup", "1 1/2 fl oz/45 mL liquor, such as rum or brandy"],
    "R145": ["1 lb 4 oz/567 g 1-2-3 Cookie Dough (page 1120)", "9 oz/255 g Frangipane Filling (page 1159)", "12 Poached Pears (page 1164), halved", "Apricot Glaze (page 1162), warm, as needed", "3 oz/85 g sliced almonds, toasted and chopped"],
}

# The remaining pages were also visually proofread. Keeping every final list in
# this table makes the source-photo transcription deterministic and reviewable;
# OCR is retained below only as a reproducible aid for future additions.
MANUAL_INGREDIENTS.update({
    "R001": ["8 lb/3.63 kg chicken bones, cut into 3-in/8-cm lengths", "1 gal 64 fl oz/5.76 L cold water", "2 tsp/10 g salt", "1 lb/454 g medium-dice Mirepoix (page 333)", "1 Sachet d’Épices (page 331)"],
    "R002": ["2 fl oz/60 mL vegetable oil, or as needed", "8 lb/3.63 kg veal bones, including knuckles and trim", "1 gal 64 fl oz/5.76 L cold water", "2 tsp/10 g salt", "1 lb/454 g large-dice Mirepoix (page 333)", "4 to 6 oz/113 to 170 g tomato paste", "1 Sachet d’Épices (page 331)"],
    "R017": ["2 tbsp/18 g minced shallots", "6 to 8 black peppercorns", "8 fl oz/240 mL dry white wine", "2 fl oz/60 mL lemon juice", "3 fl oz/90 mL cider or white wine vinegar", "8 fl oz/240 mL heavy cream, reduced by half (optional)", "1 lb 8 oz/680 g cubed butter, chilled", "salt, as needed", "ground white pepper, as needed", "1 tbsp/9 g grated lemon zest (optional)"],
    "R018": ["1 lb/454 g butter, room temperature", "2 oz/56 g minced parsley", "1 1/2 tbsp/22.50 mL lemon juice", "salt, as needed", "ground black pepper, as needed"],
    "R019": ["8 oz/227 g basil leaves", "10 oz/284 g toasted pine nuts", "1 oz/28 g garlic, mashed to a paste", "1 oz/28 g salt", "8 to 16 fl oz/240 to 480 mL olive oil", "8 oz/227 g grated Parmesan"],
    "R020": ["6 lb/2.72 kg stewing hen", "1 gal 32 fl oz/4.80 L water", "salt, as needed", "1 lb/454 g medium-dice Mirepoix (page 333)", "1 Sachet d’Épices (page 331)", "ground black pepper, as needed"],
    "R022": ["4 lb/1.81 kg broccoli", "2 fl oz/60 mL clarified butter or vegetable oil", "1 lb/454 g medium-dice White Mirepoix (page 333)", "1 gal/3.84 L Chicken Velouté (page 383)", "1 Sachet d’Épices (page 331)", "16 fl oz/480 mL heavy cream, hot", "salt, as needed", "ground black pepper, as needed"],
    "R023": ["2 oz/57 g small-dice bacon (optional)", "3 fl oz/90 mL butter or vegetable oil", "1 lb/454 g small-dice Mirepoix (page 333)", "2 garlic cloves, minced", "4 oz/85 g all-purpose flour", "96 fl oz/2.88 L Chicken Stock (page 351)", "2 lb/907 g chopped plum tomatoes, fresh or canned", "24 fl oz/720 mL tomato purée", "salt, as needed", "ground white pepper, as needed", "1 Sachet d’Épices (page 331)", "16 fl oz/480 mL heavy cream, hot", "Garnish: 8 oz/227 g Croutons (page 921)"],
    "R025": ["4 lb/1.81 kg thinly sliced onions", "2 oz/57 g clarified or whole butter", "4 fl oz/120 mL Calvados or sherry", "1 gal 32 fl oz to 1 gal 64 fl oz/4.80 to 5.76 L Chicken Stock or White Beef Stock (page 351)", "1 Sachet d’Épices (page 331)", "salt, as needed", "ground black pepper, as needed"],
    "R026": ["60 chowder clams", "96 fl oz/2.88 L or as needed Fish Stock (page 353) or water", "4 oz/113 g salt pork, minced to a paste", "4 fl oz/120 mL clarified butter", "8 oz/227 g minced onions", "4 oz/113 g small-dice celery", "4 oz/113 g all-purpose flour", "12 oz/340 g russet potatoes, peeled, small dice", "32 fl oz/960 mL heavy cream, hot", "salt, as needed", "ground white pepper, as needed", "1 tsp/5 mL Tabasco sauce, or as needed", "1 tsp/5 mL Worcestershire sauce, or as needed"],
    "R029": ["12 fl oz/360 mL dry white wine", "1 sachet d’épices, containing 3 cloves crushed garlic; 1 oz/28 g peeled ginger; 5 stalks lemongrass, cut into 1-in/3-cm pieces; and 12 kaffir lime leaves", "64 fl oz/1.92 L clam juice", "48 fl oz/1.44 L coconut milk", "8 fl oz/240 mL heavy cream, hot", "2 oz/60 g Red Curry Paste (page 464)", "1 oz/28 g cornstarch (to make a slurry)", "1 lb/454 g snapper fillet, skinned, medium dice", "1 lb/454 g shrimp, peeled, deveined, medium dice", "3 lemons, juiced", "salt, as needed", "Garnish: 1 oz/28 g basil leaves, chiffonade"],
    "R032": ["10 lb/4.54 kg chowder clams, washed", "1 gal/3.84 L water", "3 oz/85 g salt pork, minced to a paste", "1 lb/454 g medium-dice Mirepoix (page 333)", "4 oz/113 g medium-dice leeks, white parts only", "4 oz/113 g medium-dice green peppers", "1 tsp/3 g minced garlic", "1 lb/454 g plum tomatoes, peeled, seeded, medium dice", "1 bay leaf", "1 thyme sprig", "1 oregano sprig", "12 oz/340 g russet potatoes, peeled, medium dice", "salt, as needed", "ground white pepper, as needed", "1/4 tsp/1.25 mL Tabasco sauce", "1/4 tsp/1.25 mL Worcestershire sauce", "1/4 tsp/0.50 g Old Bay seasoning"],
    "R035": ["6 fl oz/180 mL clarified butter", "6 oz/170 g minced onions", "3 oz/85 g thinly sliced mushrooms", "3 oz/85 g rough-cut celery", "1 oz/28 g minced garlic", "6 oz/170 g all-purpose flour", "96 fl oz/2.88 L Chicken Stock (page 351)", "8 fl oz/240 mL beer", "2 lb/907 g grated Cheddar", "1/2 oz/14 g dry mustard", "8 fl oz/240 mL heavy cream, hot", "Tabasco sauce, as needed", "Worcestershire sauce, as needed", "salt, as needed"],
    "R036": ["1/2 fl oz/15 mL vegetable oil", "4 oz/113 g andouille sausage, small dice", "8 oz/227 g boneless and skinless chicken breast, medium dice", "8 oz/227 g medium-dice onions", "5 oz/142 g medium-dice green peppers", "5 oz/142 g medium-dice celery", "1/2 oz/14 g minced jalapeños", "3 1/2 oz/99 g thinly sliced green onions, cut on the bias", "1/2 oz/14 g chopped garlic", "5 oz/142 g sliced okra", "8 oz/227 g peeled, seeded, and medium-diced plum tomatoes", "5 oz/142 g all-purpose flour, baked until dark brown", "96 fl oz/2.88 L Chicken Stock (page 351)", "2 bay leaves", "1 tsp/2 g dried oregano", "1 tsp/2 g onion powder", "1/2 tsp/1 g dried thyme", "1/2 tsp/1 g dried basil", "salt, as needed", "ground black pepper, as needed", "1 lb 4 oz/567 g shrimp, peeled, deveined, and chopped", "13 oz/369 g cooked long-grain rice", "1 tbsp/9 g filé powder"],
    "R038": ["4 oz/113 g minced salt pork", "3 fl oz/90 mL clarified butter or vegetable oil", "8 oz/227 g small-dice onions", "4 oz/113 g small-dice celery", "5 oz/142 g all-purpose flour", "96 fl oz/2.88 L Chicken Stock (page 351)", "3 ham hocks", "1 Sachet d’Épices (page 331)", "1 lb/454 g collard greens, chopped, blanched", "salt, as needed", "ground black pepper, as needed"],
    "R040": ["7 lb 8 oz/3.40 kg beef bones", "1 lb 8 oz/680 g beef flank, trimmed, fat reserved", "1 gal 16 fl oz/4.32 L water", "1 lb/454 g onions, peeled and quartered", "1 oz/28 g ginger, peeled, cut into 1/8-in/3-mm slices", "2 oz/57 g beef fat", "1 oz/28 g all-purpose flour", "1 tbsp/6 g thinly sliced green onions", "4 fl oz/120 mL Korean red pepper paste", "8 fl oz/240 mL Korean soybean paste", "1 tsp/5 mL light soy sauce", "10 oz/284 g green cabbage, chiffonade", "1 1/2 tsp/7.50 mL sesame oil", "1 tsp/3 g minced garlic", "3 oz/85 g bean sprouts, cut into 1-in/3-cm lengths", "2 eggs, lightly beaten", "salt, as needed", "ground black pepper, as needed"],
    "R041": ["1/2 oz/14 g dried wakame seaweed", "1 gal/3.84 L Dashi (page 354)", "8 fl oz/240 mL miso (aka/red for summer and shiro/white for winter)", "1 lb 8 oz/680 g small-dice tofu", "Garnish: 1 1/4 oz/35 g thinly sliced green onions"],
    "R045": ["8 fl oz/240 mL olive oil", "4 oz/113 g butter", "1 lb/454 g thinly sliced onions", "1 lb/454 g small-dice carrots", "1 lb/454 g small-dice celery", "1 lb 2 oz/510 g russet potatoes, peeled, small dice", "1 lb 8 oz/680 g small-dice zucchini", "12 oz/340 g small-dice green beans", "2 lb/907 g shredded savoy cabbage", "1 gal/3.84 L Brodo (page 354)", "2 Parmesan rinds, 3-in/8-cm square, cleaned", "1 lb/454 g canned plum tomatoes, with juices", "salt, as needed", "ground black pepper, as needed", "10 oz/284 g Great Northern or navy beans, cooked (page 808)", "Garnish: 2 oz/57 g grated Parmesan, or as needed", "Garnish: 4 fl oz/120 mL extra-virgin olive oil, or as needed"],
    "R046": ["2 oz/57 g salt pork", "2 fl oz/60 mL olive oil", "1 lb/454 g paysanne-cut onions", "8 oz/227 g paysanne-cut celery", "8 oz/227 g paysanne-cut carrots", "8 oz/227 g paysanne-cut green peppers", "8 oz/227 g paysanne-cut green cabbage", "1/2 oz/14 g minced garlic", "1 lb/454 g tomato concassé", "1 lb/454 g Chicken Stock (page 351)", "salt, as needed", "ground black pepper, as needed", "4 oz/113 g cooked chickpeas", "6 oz/170 g cooked black-eyed peas", "6 oz/170 g cooked ditalini", "Garnish: 5 oz/142 g grated Parmesan"],
    "R049": ["3 oz/85 g coarsely chopped walnuts", "1/2 oz/14 g fresh white bread crumbs", "1 lb 8 oz/680 g red peppers, peeled and seeded", "1 fl oz/30 mL lemon juice, or as needed", "4 tsp/20 mL pomegranate molasses", "1/4 tsp/1.25 mL prepared red chili paste, or as needed", "salt, as needed", "ground black pepper, as needed", "1/2 fl oz/15 mL olive oil", "1/4 tsp/0.50 g ground cumin"],
    "R050": ["4 1/2 oz/128 g small-dice red onions", "6 avocados", "5 oz/142 g small-dice plum tomatoes", "1/2 oz/14 g jalapeños, seeded and minced", "2 tbsp/6 g chopped cilantro", "3 fl oz/90 mL lime juice", "salt, as needed", "coarsely ground black pepper, as needed", "Tabasco, as needed"],
    "R051": ["12 oz/340 g chickpeas, soaked overnight", "5 fl oz/150 mL lemon juice", "3 garlic cloves, crushed in salt", "3 fl oz/90 mL extra-virgin olive oil", "4 1/2 oz/128 g tahini", "salt, as needed", "paprika, as needed", "1 oz/28 g chopped parsley"],
    "R055": ["12 fl oz/360 mL chili sauce", "14 fl oz/420 mL ketchup", "1 fl oz/30 mL lemon juice", "1 oz/28 g sugar", "2 tsp/10 mL Tabasco sauce", "2 tsp/10 mL Worcestershire sauce", "1 1/2 tsp/8 g prepared horseradish", "salt, as needed", "ground black pepper, as needed"],
    "R056": ["2 oranges", "2 lemons", "1/2 oz/14 g minced shallots", "1 lb 4 oz/567 g currant jelly", "1 tbsp/6 g dry mustard", "12 fl oz/360 mL ruby port", "salt, as needed", "ground black pepper, as needed", "pinch cayenne", "pinch ground ginger"],
    "R057": ["16 fl oz/480 mL soy sauce", "8 fl oz/240 mL rice vinegar", "8 fl oz/240 mL water", "1/2 oz/14 g minced garlic", "2 oz/57 g minced green onions", "1 oz/28 g minced ginger", "2 tsp/4 g dry mustard", "1 tsp/5 mL hot bean paste", "2 fl oz/60 mL honey"],
    "R058": ["5 1/2 oz/156 g wasabi powder", "warm water, as needed"],
    "R060": ["3 oz/85 g dry mustard", "pinch salt", "pinch sugar", "2 fl oz/60 mL cool water"],
    "R061": ["16 dried habaneros", "4 lb/1.81 kg red chiles, seeded and stemmed", "1 lb/454 g sun-dried tomatoes", "1 1/2 oz/43 g garlic, crushed in salt", "1 1/2 oz/43 g turmeric", "2 tsp/4 g ground coriander", "2 tsp/4 g ground cumin", "2 tsp/4 g caraway seeds", "2 tsp/10 mL lemon juice", "2 fl oz/60 mL olive oil"],
    "R063": ["10 oz/284 g pitted green olives, rinsed", "10 oz/284 g pitted black olives, rinsed", "6 oz/170 g capers, rinsed", "4 garlic cloves, minced", "1 1/2 fl oz/45 mL lemon juice", "4 fl oz/120 mL extra-virgin olive oil", "ground black pepper, as needed", "2 tbsp/6 g chopped oregano", "2 tbsp/6 g chopped basil"],
    "R064": ["1 lb 10 oz/737 g thinly sliced cucumber", "4 oz/113 g thinly sliced onion", "1 1/2 tsp/7.50 g salt", "3/4 oz/21 g sugar", "2 fl oz/60 mL white vinegar"],
    "R065": ["8 oz/227 g minced red onions", "1 fl oz/30 mL extra-virgin olive oil", "4 roasted red peppers, peeled and seeded, cut into brunoise", "2 oz/57 g finely chopped capers", "1/2 oz/14 g minced chives", "salt, as needed", "ground black pepper, as needed"],
    "R066": ["1 lb/454 g chopped mangos", "3 oz/85 g raisins", "2 tsp/6 g minced jalapeños", "1/2 oz/14 g minced garlic", "1/2 oz/14 g minced ginger", "5 oz/142 g dark brown sugar", "1 fl oz/30 mL white wine vinegar", "salt, as needed", "ground black pepper, as needed", "1 tsp/2 g turmeric"],
    "R072": ["4 fl oz/120 mL balsamic vinegar", "4 fl oz/120 mL red wine, such as Zinfandel or Merlot", "4 shallots, minced", "4 oz/113 g roasted and chopped almonds", "salt, as needed", "ground black pepper, as needed", "12 fl oz/360 mL almond oil", "16 fl oz/480 mL olive oil", "5 1/4 oz/149 g chopped dried figs", "2 lemons, juiced", "Tabasco sauce, as needed"],
    "R074": ["4 fl oz/120 mL red wine vinegar", "4 fl oz/120 mL balsamic vinegar", "2 tsp/10 g mustard (optional)", "salt, as needed", "ground black pepper, as needed", "1/2 tsp/2.50 g sugar (optional)", "24 fl oz/720 mL olive oil", "3 tbsp/9 g minced herbs, such as chives, parsley, oregano, basil, and tarragon (optional)"],
    "R075": ["8 fl oz/240 mL sherry vinegar", "2 fl oz/60 mL lime juice", "5 chipotles, canned in adobo, minced", "2 shallots, minced", "2 garlic cloves, minced", "salt, as needed", "ground black pepper, as needed", "2 tbsp/28 g piloncillo or brown sugar", "24 fl oz/720 mL extra-virgin olive oil", "1 oz/28 g minced Fines Herbes (page 463)"],
    "R078": ["10 plum tomatoes", "16 fl oz/480 mL olive oil", "6 fl oz/180 mL red wine vinegar", "salt, as needed", "ground black pepper, as needed", "1 tbsp/3 g thyme", "2 tbsp/6 g basil chiffonade", "Tabasco sauce, as needed"],
    "R079": ["4 oz/113 g guava paste", "8 fl oz/240 mL red wine vinegar", "2 tbsp/18 g Curry Powder (page 463)", "4 limes, juiced", "1 Scotch bonnet, seeded, minced", "salt, as needed", "ground black pepper, as needed", "24 fl oz/720 mL olive oil", "3 tbsp/9 g chopped cilantro"],
    "R080": ["1/2 oz/14 g minced garlic", "4 oz/113 g minced shallots", "2 fl oz/60 mL sherry vinegar", "2 fl oz/60 mL lemon juice", "salt, as needed", "ground black pepper, as needed", "8 fl oz/240 mL extra-virgin olive oil", "2 fl oz/60 mL truffle oil", "3/4 oz/21 g chopped marjoram", "3/4 oz/21 g chopped parsley", "4 tbsp/12 g chopped mint"],
    "R081": ["20 fl oz/600 mL peanut oil", "10 fl oz/300 mL malt vinegar", "2 oz/57 g dark brown sugar", "2 tbsp/6 g chopped tarragon", "2 tbsp/6 g chopped chives", "2 tbsp/6 g chopped parsley", "2 tsp/6 g minced garlic", "salt, as needed", "ground black pepper, as needed"],
    "R082": ["8 fl oz/240 mL red wine vinegar", "4 oz/113 g Pesto (page 388)", "salt, as needed", "ground black pepper, as needed", "20 fl oz/600 mL olive or vegetable oil"],
    "R085": ["2 oz/57 g spinach", "2 oz/57 g watercress", "1 tbsp/3 g parsley", "1 tbsp/3 g tarragon", "1 garlic clove, mashed to a paste", "4 fl oz/120 mL vegetable oil", "12 fl oz/360 mL Mayonnaise (page 936)", "1 tbsp/15 g mustard", "salt, as needed", "ground black pepper, as needed", "lemon juice, as needed"],
    "R089": ["2 1/2 fl oz/75 mL pasteurized egg yolks", "1 fl oz/30 mL water", "1 fl oz/30 mL white wine vinegar", "2 tsp dry (4 g) or prepared mustard (10 g)", "1/2 tsp/2.50 g sugar", "24 fl oz/720 mL vegetable oil", "salt, as needed", "ground white pepper, as needed", "1 fl oz/30 mL lemon juice"],
    "R090": ["2 1/2 fl oz/75 mL pasteurized egg yolks", "1/2 fl oz/15 mL water", "1 fl oz/30 mL white wine vinegar", "2 tsp/10 g Dijon mustard", "2 1/2 tsp/7.50 g garlic, mashed to a paste", "14 fl oz/420 mL vegetable oil", "10 fl oz/300 mL extra-virgin olive oil", "salt, as needed", "ground white pepper, as needed", "lemon juice, as needed"],
    "R096": ["3 oz/85 g basil leaves", "1 oz/28 g parsley leaves", "16 fl oz/480 mL olive oil"],
    "R097": ["12 fl oz/360 mL olive oil", "6 fl oz/180 mL extra-virgin olive oil", "3 oranges, zest only, cut into strips"],
    "R130": ["8 egg whites (about 8 fl oz/240 mL)", "pinch salt", "1 tsp/5 mL vanilla extract", "1 lb/454 g sugar"],
    "R131": ["1 lb/454 g sugar", "4 fl oz/120 mL water", "8 egg whites (about 8 fl oz/240 mL)", "pinch salt", "1 tsp/5 mL vanilla extract"],
    "R132": ["8 egg whites (about 8 fl oz/240 mL)", "1 tsp/5 mL vanilla extract", "pinch salt", "1 lb/454 g sugar"],
    "R133": ["16 fl oz/480 mL heavy cream", "2 oz/57 g confectioners’ sugar", "1/2 fl oz/15 mL vanilla extract"],
    "R135": ["80 fl oz/2.40 L pumpkin purée", "1 lb 2 oz/510 g sugar", "5 oz/142 g dark brown sugar", "1/2 oz/14 g salt", "2 1/2 tsp/5 g ground cinnamon", "2 1/2 tsp/5 g ground ginger", "2 1/2 tsp/5 g ground nutmeg", "1 1/4 tsp/2.50 g ground cloves", "20 fl oz/600 mL milk", "20 fl oz/600 mL evaporated milk", "15 eggs"],
    "R136": ["8 oz/227 g almond paste", "1 1/4 oz/35 g sugar", "2 eggs", "4 oz/113 g butter", "1 1/2 oz/43 g cake flour"],
    "R137": ["2 lb/907 g 1-2-3 Cookie Dough (page 1120)", "Pecan filling: 1 lb/454 g butter, cubed", "Pecan filling: 1 lb/454 g light brown sugar", "Pecan filling: 4 oz/113 g sugar", "Pecan filling: 12 oz/340 g honey", "Pecan filling: 4 fl oz/120 mL heavy cream", "Pecan filling: 2 lb/907 g pecans, coarsely chopped"],
    "R141": ["18 egg yolks", "12 oz/340 g sugar", "12 fl oz/360 mL white wine"],
    "R142": ["2 lb/907 g raspberries (fresh or frozen)", "8 oz/227 g sugar, or as needed", "1 fl oz/60 mL lemon juice, or as needed"],
    "R144": ["7 lb/3.18 kg apples", "24 fl oz/720 mL apple cider", "1 lb/454 g sugar", "1 tbsp/6 g ground cardamom", "2 tsp/4 g ground cinnamon", "1 tsp/3 g lemon zest, grated", "1/4 tsp/1.25 g salt"],
})


def normalized(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return " ".join(WORD_RE.findall(value.lower()))


def title_score(expected: str, actual: str) -> float:
    a = normalized(expected)
    b = normalized(actual)
    if not a or not b:
        return 0.0
    expected_tokens = set(a.split()) - {"of", "and", "style", "sauce", "dressing"}
    actual_tokens = set(b.split())
    overlap = len(expected_tokens & actual_tokens) / max(len(expected_tokens), 1)
    sequence = difflib.SequenceMatcher(None, a, b).ratio()
    return overlap * 0.7 + sequence * 0.3


def run_tesseract(image: Path, psm: int, output: str = "txt") -> str:
    command = ["tesseract", str(image), "stdout", "--psm", str(psm)]
    if output == "tsv":
        command.append("tsv")
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    return result.stdout


def tsv_lines(payload: str) -> list[dict]:
    rows = payload.splitlines()
    if not rows:
        return []
    groups: dict[tuple[int, int, int], list[dict]] = defaultdict(list)
    for row in rows[1:]:
        fields = row.split("\t")
        if len(fields) < 12 or fields[0] != "5" or not fields[11].strip():
            continue
        word = {
            "block": int(fields[2]), "paragraph": int(fields[3]), "line": int(fields[4]),
            "left": int(fields[6]), "top": int(fields[7]), "width": int(fields[8]),
            "height": int(fields[9]), "text": fields[11].strip(),
        }
        groups[(word["block"], word["paragraph"], word["line"])].append(word)
    lines = []
    for words in groups.values():
        words.sort(key=lambda item: item["left"])
        lines.append({
            "text": " ".join(item["text"] for item in words),
            "left": min(item["left"] for item in words),
            "top": min(item["top"] for item in words),
            "right": max(item["left"] + item["width"] for item in words),
            "bottom": max(item["top"] + item["height"] for item in words),
        })
    return sorted(lines, key=lambda item: (item["top"], item["left"]))


def visual_text(payload: str) -> str:
    """Rejoin OCR fragments that occupy the same printed baseline."""
    source = tsv_lines(payload)
    rows: list[list[dict]] = []
    for line in source:
        center = (line["top"] + line["bottom"]) / 2
        match = None
        for row in rows[-3:]:
            row_center = sum((item["top"] + item["bottom"]) / 2 for item in row) / len(row)
            tolerance = max(12, max(item["bottom"] - item["top"] for item in row) * .55)
            if abs(center - row_center) <= tolerance:
                match = row
                break
        if match is None:
            rows.append([line])
        else:
            match.append(line)
    output = []
    for row in rows:
        row.sort(key=lambda item: item["left"])
        output.append(" ".join(item["text"] for item in row))
    return "\n".join(output)


def locate_heading(lines: list[dict], name: str) -> tuple[dict, float]:
    candidates: list[tuple[float, dict]] = []
    for index, line in enumerate(lines):
        score = title_score(name, line["text"])
        candidates.append((score, line))
        for other in lines[index + 1:index + 4]:
            if other["top"] - line["bottom"] > 55:
                break
            if abs(other["left"] - line["left"]) > 120:
                continue
            combined = dict(line)
            combined["text"] = f'{line["text"]} {other["text"]}'
            combined["right"] = max(line["right"], other["right"])
            combined["bottom"] = max(line["bottom"], other["bottom"])
            candidates.append((title_score(name, combined["text"]), combined))
    score, line = max(candidates, key=lambda item: item[0])
    return line, score


def clean_ocr_line(value: str) -> str:
    value = value.strip(" |\\_~—–")
    replacements = (
        (r"\b[I|l]b\b", "lb"),
        (r"\|b\b", "lb"),
        (r"\b1b\b", "lb"),
        (r"\bf1\s*oz\b", "fl oz"),
        (r"\bfl\s*0z\b", "fl oz"),
        (r"\bfl\s*02\b", "fl oz"),
        (r"\b0z\b", "oz"),
        (r"\b02(?=/|\b)", "oz"),
        (r"\bm[lI]\b", "mL"),
        (r"\ba[s5]\s+needed\b", "as needed"),
        (r"\bpase\s+(\d+)\b", r"page \1"),
        (r"\bMirepoix\b", "Mirepoix"),
    )
    for pattern, replacement in replacements:
        value = re.sub(pattern, replacement, value, flags=re.I)
    value = re.sub(r"\s+", " ", value).strip()
    value = re.sub(r"(?<=\d)\s*[§¢&](?=\b)", " g", value)
    value = re.sub(r"\b(\d+)\s*fl\s*0[7z]\b", r"\1 fl oz", value, flags=re.I)
    value = re.sub(r"\b(\d+)\s*0[2z]/", r"\1 oz/", value, flags=re.I)
    value = re.sub(r"\b(\d+)\s*[I|l]b/", r"\1 lb/", value, flags=re.I)
    if re.search(r"\b(?:salt|pepper)\b.*\bas needed\b", value, re.I):
        value = re.sub(r"(\bas needed\b).*", r"\1", value, flags=re.I)
    if re.search(r"\(page\s+\d+\)", value, re.I):
        value = re.sub(r"(\(page\s+\d+\)).*", r"\1", value, flags=re.I)
    return value


def final_cleanup(lines: list[str]) -> list[str]:
    """Remove unmistakable OCR debris without inventing missing quantities."""
    cleaned: list[str] = []
    for source in lines:
        line = clean_ocr_line(source)
        line = re.sub(r"^(?:makes?\b.*|\d+[\.,]\s+(?=[A-Z]))", "", line, flags=re.I).strip()
        if not line or STEP_RE.match(line):
            continue
        if re.search(r"\b(?:heat|simmer|combine|refrigerate|serve)\b", line, re.I) and not re.search(r"\bas needed\b", line, re.I):
            continue
        cleaned.append(line)
    return cleaned


def is_title_line(line: str, name: str) -> bool:
    return title_score(name, line) >= 0.63


def join_ingredient_lines(lines: list[str]) -> list[str]:
    joined: list[str] = []
    section = ""
    for raw in lines:
        line = clean_ocr_line(raw)
        if not line or FURNITURE_RE.match(line):
            continue
        if re.fullmatch(r"[A-Z][A-Z\s&/-]{2,}", line) and len(line.split()) <= 4:
            section = line.title()
            continue
        force_continuation = bool(joined and re.search(r"\bwith cold$", joined[-1], re.I) and re.match(r"water\b", line, re.I))
        starts_item = bool(QUANTITY_RE.match(line)) and not force_continuation
        has_unit = bool(UNIT_RE.search(line))
        if starts_item or has_unit or not joined:
            if section:
                line = f"{section}: {line}"
                section = ""
            joined.append(line)
        else:
            joined[-1] = f"{joined[-1]} {line}".strip()
    return joined


def parse_ingredients(text: str, name: str) -> list[str]:
    lines = [clean_ocr_line(line) for line in text.splitlines()]
    lines = [line for line in lines if line]
    title_index = next((i for i, line in enumerate(lines[:8]) if is_title_line(line, name)), -1)
    if title_index >= 0:
        lines = lines[title_index + 1:]
    makes_index = next((i for i, line in enumerate(lines[:8]) if re.search(r"\b[Mm]akes\b", line)), -1)
    if makes_index >= 0:
        lines = lines[makes_index + 1:]
    stop = next((i for i, line in enumerate(lines) if STEP_RE.match(line)), len(lines))
    lines = lines[:stop]
    lines = [line for line in lines if not is_title_line(line, name)]
    return join_ingredient_lines(lines)


def ingredient_score(lines: list[str]) -> float:
    if not lines:
        return -100.0
    plausible = sum(bool(QUANTITY_RE.match(line) or UNIT_RE.search(line)) for line in lines)
    suspicious = sum(
        bool(re.search(r"\b(?:heat|cook|add|stir|simmer|serve|combine|remove|place)\b", line, re.I))
        or len(line) > 220
        for line in lines
    )
    garbage = sum(len(re.sub(r"[A-Za-z0-9]", "", line)) > len(line) * 0.35 for line in lines)
    return plausible * 4 + min(len(lines), 20) - suspicious * 8 - garbage * 4


def make_crop(source: Path, heading: dict, destination: Path, page_lines: list[dict]) -> tuple[int, int, int, int]:
    with Image.open(source) as original:
        image = ImageOps.exif_transpose(original).convert("L")
        width, height = image.size
        left = max(0, heading["left"] - 28)
        right = min(width, left + max(420, int(width * 0.37)))
        top = max(0, heading["top"] - 18)
        step_candidates = [
            line for line in page_lines
            if line["top"] > heading["bottom"] + 55
            and line["left"] >= left - 10 and line["left"] < right
            and STEP_RE.match(line["text"])
        ]
        bottom = min((line["top"] + 8 for line in step_candidates), default=min(height, top + int(height * .44)))
        bottom = max(bottom, min(height, top + 230))
        crop = image.crop((left, top, right, bottom))
        crop = ImageOps.autocontrast(crop, cutoff=1)
        crop = ImageEnhance.Contrast(crop).enhance(1.25)
        crop = crop.resize((crop.width * 3, crop.height * 3), Image.Resampling.LANCZOS)
        crop = crop.filter(ImageFilter.UnsharpMask(radius=1.2, percent=150, threshold=3))
        crop.save(destination)
    return left, top, right, bottom


def extract_recipe(source: Path, name: str, work: Path, page_lines: list[dict]) -> dict:
    heading, heading_score = locate_heading(page_lines, name)
    crop_path = work / "crop.png"
    box = make_crop(source, heading, crop_path, page_lines)
    candidates = []
    for psm in (6, 4, 11):
        text = visual_text(run_tesseract(crop_path, psm, "tsv"))
        ingredients = parse_ingredients(text, name)
        candidates.append({"psm": psm, "ingredients": ingredients, "score": ingredient_score(ingredients)})
    best = max(candidates, key=lambda item: item["score"])
    return {
        "heading": heading, "headingScore": round(heading_score, 3), "crop": box,
        "psm": best["psm"], "score": best["score"], "ingredients": best["ingredients"],
        "candidates": candidates,
    }


def load_records(path: Path) -> tuple[str, list[dict]]:
    source = path.read_text()
    match = RECORDS_PATTERN.search(source)
    if not match:
        raise RuntimeError(f"Could not find recovered recipe array in {path}")
    return source, json.loads(match.group(1))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--recipes", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--structured-output", type=Path)
    parser.add_argument("--only", help="Comma-separated catalog IDs for a focused validation run")
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    manifest = json.loads((args.source_root / "recovery_manifest.json").read_text())
    page_files = {item["sourceImage"]: item["filename"] for item in manifest}
    source_text, records = load_records(args.recipes)
    selected = {item.strip() for item in (args.only or "").split(",") if item.strip()}
    report = []
    page_ocr: dict[str, list[dict]] = {}

    with tempfile.TemporaryDirectory(prefix="recovered-ingredients-") as temp:
        work = Path(temp)
        for index, record in enumerate(records):
            if selected and record["catalogId"] not in selected:
                continue
            page = record["sourceImages"]
            filename = page_files.get(page)
            if not filename:
                raise RuntimeError(f"No source image mapping for {page}")
            image = args.source_root / "recipe_source_images" / "CTE 566" / filename
            if record["catalogId"] in MANUAL_INGREDIENTS:
                ingredients = MANUAL_INGREDIENTS[record["catalogId"]]
                result = {
                    "heading": None, "headingScore": 1.0, "crop": None,
                    "psm": "visual", "score": ingredient_score(ingredients),
                    "ingredients": ingredients, "candidates": [],
                    "method": "manual visual transcription",
                }
            else:
                if page not in page_ocr:
                    page_ocr[page] = tsv_lines(run_tesseract(image, 11, "tsv"))
                recipe_work = work / record["catalogId"]
                recipe_work.mkdir()
                result = extract_recipe(image, record["name"], recipe_work, page_ocr[page])
                result["ingredients"] = final_cleanup(result["ingredients"])
                result["method"] = "layout-aware OCR"
            result.update({
                "catalogId": record["catalogId"], "name": record["name"], "page": page,
                "before": record["ingredients"], "changed": record["ingredients"] != result["ingredients"],
            })
            report.append(result)
            records[index]["ingredients"] = result["ingredients"]
            records[index]["transcriptionStatus"] = (
                "Ingredients re-transcribed from isolated source region; teacher verification required before production"
            )
            print(f'{record["catalogId"]} {record["name"]}: {len(result["ingredients"])} lines, '
                  f'heading={result["headingScore"]}, score={result["score"]}, psm={result["psm"]}', flush=True)

    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    if args.structured_output:
        args.structured_output.parent.mkdir(parents=True, exist_ok=True)
        args.structured_output.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n")
    if args.write:
        replacement = "const RECOVERED_SOURCE_RECIPES = " + json.dumps(records, ensure_ascii=False, indent=2) + ";\n\n/**"
        updated = RECORDS_PATTERN.sub(lambda _match: replacement, source_text, count=1)
        args.recipes.write_text(updated)


if __name__ == "__main__":
    main()
