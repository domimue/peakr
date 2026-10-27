# Prompt 4 – Rezepte und Portionen im Food Logging

## Context
Heute gibt es nur ein rudimentäres Rezept (`features/body/food/screens/recipe-screen.tsx`). Es hat Name, Zutaten aus der lokalen Suche (nur g), Gesamtgewicht und Portionen. Fehlende Teile:
- Foto und Notiz
- Barcode, Favoriten, Zuletzt verwendet und manuelle Eingabe als Zutatenquelle; OFF-Treffer in der Zutatensuche
- Einheiten ml/Stück
- Live-Werte pro Portion
- Loggen nach Portion (½, 1, 1½ …) bzw. Gramm (nur mit gekochtem Gewicht)
- Filter „My recipes“ in der Suche
- Duplizieren und Skalieren
- Abfrage beim Bearbeiten

Basis, auf der der Umbau aufsetzt:
- Einträge im Tagebuch speichern ihre Werte schon als Snapshot (`body_food_entries.kcal/protein_g…`). Die Historie bleibt also von sich aus unberührt; das nutze ich.
- Rezepte sind `body_foods` mit `kind: 'recipe'` und JSON-Spalte `recipe`. Sie synchronisieren schon, laufen offline und gehen über `syncEntryToHealth` nach Health Connect/HealthKit.
- **Keine Supabase-Migration nötig:** Alle neuen Felder (Foto-Pfad, Notiz, Einheiten der Zutaten) kommen ins `recipe`-JSON (Server-Limit 32 KB).

## 1 – Engine (`packages/engine/src/nutrition/recipe.ts`, neu; `recipeOf` bleibt als Wrapper)
- **`RecipeIngredient`:** `per100` und `basis` (g|ml), dazu `amount` in der Basiseinheit und die Eingabeform (`unit: 'g'|'ml'|'piece'|'portion'`, `count`, `portionLabel`). `ingredientAmount()` rechnet über `amountOf` (Stück → `pieceAmount`, Portion → Portionsgröße) um. ml zählt beim Rohgewicht als g und ist als Näherung dokumentiert.
- **`recipeSummary({ ingredients, portions, cookedWeightG? })`** liefert:
  - `total` (kcal/P/C/F) und `rawWeightG`
  - `perPortion`
  - `portionG` und `per100` nur mit gekochtem Gewicht. Ohne gekochtes Gewicht gibt es keine Gramm-Option, weil das Rohgewicht nicht das ist, was man isst.
- **`recipeServing(summary, { portions: n } | { grams: g })`** liefert die Nährwerte einer Menge, z. B. 1,2 kg / 4 Portionen = 300 g pro Portion; 380 g → 380/1200 des Ganzen.
- **`scaleRecipe(recipe, factor)`:** Zutaten, gekochtes Gewicht und Portionen werden × Faktor gerechnet, die Werte pro Portion bleiben gleich („doppelt gekocht“ = doppelt so viele Portionen).
- **`relogEntry(entry, summary)`:** rechnet einen alten Eintrag (Portionen oder Gramm) mit der neuen Fassung neu. Er wird nur verwendet, wenn der Nutzer das ausdrücklich wählt.
- Vitest mit 100 % Abdeckung:
  - Totals und Werte pro Portion
  - Umrechnung von Stück, ml und Portion
  - Skalieren
  - Gramm ohne gekochtes Gewicht → null
  - Rundung

## 2 – Daten (`data/repositories/body-repository.ts`, Schema-Typ `bodyFoods.recipe`)
- **Rezept-JSON:** `{ ingredients, servings, totalWeightG, note, photo: { localUri, remotePath } | null }`. Alte Rezepte lassen sich weiter lesen (fehlende Felder = null, Zutaten ohne `unit` = g).
- **Bei Rezepten speichert `body_foods`:**
  - `per100` = pro 100 g gekochtes Gewicht, falls vorhanden
  - `portions` = `[{label: 'portion', amount: portionG}]`
  - ohne gekochtes Gewicht eine interne Portionsbasis; die Grammwahl wird dann ausgeblendet
- **Foto:** Es kommt in den bestehenden privaten Bucket `body-photos` unter `<userId>/recipes/<id>.<ext>`. Die RLS über den Ordner der User-ID gilt dort schon, deshalb ist keine Storage-Migration nötig. Hochgeladen wird offline-first mit `keepLocalCopy` und `uploadPhoto` aus `data/body-photos.ts`; der Sync-Spec für `body_foods` lädt hoch bzw. löscht, wie bei den Check-in-Fotos.
- **Neue Funktionen:**
  - `duplicateFoodItem(id)` mit dem Namen „… (copy)“
  - `entriesOfFood(id)` (Anzahl und Liste)
  - `updateEntries(entries)` für die ausdrücklich gewählte Neuberechnung
- **Löschen:** `deleteFoodItem` bleibt ein Soft-Delete; Einträge bleiben, weil sie Name und Werte selbst tragen.
- **Suche:** `searchFoodItems` sortiert Favoriten → zuletzt verwendet → Name und bekommt den Filter `kind: 'recipe'`.

## 3 – Rezept-Editor (Entwurf über mehrere Screens)
- **Store:** Neuer Zustand-Store `features/body/food/recipe-draft.ts` mit Name, Foto, Notiz, Zutaten, Portionen, gekochtem Gewicht und der ID beim Bearbeiten. Er überlebt das Hin und Her zur Suche und zum Scanner.
- **Zutaten hinzufügen** mit denselben Screens wie beim Loggen, über einen Parameter `mode=ingredient`:
  - `AddFoodScreen`: Suche lokal + OFF mit Attribution und Cache wie bisher, Zuletzt / Favoriten / eigene, „Scan“, „Create food“ (manuell)
  - `ScanScreen` ist dieselbe Komponente und reicht `mode` weiter
  - `FoodFormScreen` (manuelle Eingabe) führt nach dem Speichern zurück in die Mengenwahl
  - `FoodDetailScreen`: dieselbe Mengenwahl (g/ml, Stück, Portionen), der Button heißt „Add to recipe“, legt die Zutat in den Entwurf und kehrt zum Editor zurück (`router.dismissTo`)
- **Editor (`recipe-screen.tsx`, Neubau):**
  - Name, Foto (expo-image-picker wie im Check-in), Notiz
  - Zutatenliste: Zeilen mit Name, Menge und Einheit; Antippen bearbeitet Menge und Einheit, Entfernen ist möglich
  - Stepper für Portionen und optionales gekochtes Gewicht mit Erklärung
  - Live-Karte **„Whole dish“** (kcal, P/C/F, Rohgewicht bzw. gekochtes Gewicht) und **„Per portion“** (kcal, P/C/F, ggf. „≈ 300 g“)
- **Rezept-Detail (`FoodDetailScreen` mit `kind === 'recipe'`):**
  - Foto, Notiz, Zutaten
  - Mengenwahl: Chips ½ · 1 · 1½ · 2 Portionen plus freie Zahl, „Grams“ nur mit gekochtem Gewicht
  - Mahlzeit wählen (Chips, voreingestellt aus der Route), „Add“
  - Aktionen „Edit“, „Duplicate“, „Scale“ (Dialog mit ×½, ×2 oder eigenem Faktor; erzeugt beim Bearbeiten eine neue Fassung), „Delete“ (mit dem Hinweis, dass geloggte Tage bleiben)
- **Bearbeiten speichern:** Wurde das Rezept schon geloggt (`entriesOfFood`), fragt ein Dialog: **„Keep logged days as they are“** (Standard, primär) oder „Also update the N logged entries“ (sekundär, mit Bestätigung, über `relogEntry`). Ohne Einträge kommt keine Frage. Skalieren speichert immer als neue Fassung, ohne Einträge anzufassen.

## 4 – Rezepte in der Suche und beim Loggen
- **`AddFoodScreen`:**
  - In den Suchtreffern stehen Rezepte neben Produkten, mit Badge „Recipe“ und kcal pro Portion statt pro 100 g.
  - Ein Chip-Filter über den Treffern („All · My recipes“) und das bestehende Segment `recipes` heißen jetzt „My recipes“.
  - Favoriten und zuletzt Verwendetes kommen zuerst.
- **Loggen:** über `useLogFood` wie bisher. Der Eintrag speichert Portionen (`unit: 'portion'`, Anzahl) bzw. Gramm, schreibt den Snapshot, `touchFoodItem` und Health.
- **Reste:** Kein neues Konzept, das Rezept wird an einem anderen Tag einfach erneut geloggt.

## 5 – Tests
- **Engine** (Vitest, Abschnitt 1)
- **App** (Jest, `features/body/__tests__/recipes.test.tsx`):
  - Rezept mit Zutat aus Suche, Favoriten und Scan (gemockte Kamera) sowie einer manuellen Zutat anlegen; die Live-Werte für Ganzes und Portion aktualisieren sich
  - Loggen von 1½ Portionen bzw. 380 g mit gekochtem Gewicht; ohne gekochtes Gewicht keine Gramm-Option
  - Bearbeiten nach dem Loggen: Standard „Keep“ → die Werte des alten Eintrags bleiben identisch; die Option „Update“ → neu berechnet
  - Skalieren ×2 → doppelte Portionen, gleiche Werte pro Portion, alte Einträge unverändert
  - Duplizieren; Löschen → Eintrag bleibt im Tagebuch
  - Filter „My recipes“; OFF-Attribution bei OFF-Zutaten; Health-Write wird aufgerufen
  - offline: Rezept ohne Netz anlegen und loggen
  - alte Rezepte ohne neue Felder lassen sich lesen
- Danach `pnpm lint && pnpm typecheck && pnpm test`.

## 6 – Doku
- CLAUDE.md, „Energy & body rules“: kurzer Punkt **Recipes**
  - Werte pro Portion bzw. pro 100 g gekochtes Gewicht
  - geloggte Einträge sind Snapshots und werden nie still umgeschrieben (Abfrage, Standard: unverändert)
  - Löschen lässt Einträge stehen
- `docs/body-addon-setup.md`: kurzer Abschnitt zu Rezepten (keine Einrichtung nötig, Foto im bestehenden Bucket)

## Reihenfolge (je ein Commit, gepusht)
1. Engine
2. Repository, JSON-Format, Foto-Sync, Suche
3. Entwurf-Store und Zutaten-Modus in Add / Scan / Form / Detail
4. Editor-Neubau
5. Rezept-Detail mit Loggen, Duplizieren, Skalieren, Löschen, Abfrage beim Bearbeiten
6. Tests, Doku und Bericht (mit „So legst du dein erstes Rezept an“)

## Verification
- Vitest Engine mit 100 % Abdeckung; Jest wie in Abschnitt 5; Lint und Typecheck
- Manuell auf dem Gerät:
  - Nutrition → Mahlzeit „+“ → „Create recipe“ → Zutaten über Suche, Scan und Favoriten → Portionen 4, gekochtes Gewicht 1200 g
  - 380 g loggen
  - am nächsten Tag 1 Portion loggen
  - Rezept ändern → „Keep“ → der gestrige Eintrag bleibt
