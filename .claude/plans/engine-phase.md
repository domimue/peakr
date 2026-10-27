# Engine-Phase: Planstart, Intensitätsbänder, Schwierigkeitsregler, Energie, Matching

## Context
Vier Fehler in `/packages/engine` (plus Matching) machen den Plan und die Ernährung unbrauchbar:
- Ein 13,5-km-Long-Run führt zu einem 6,7-km-Long-Run im Plan.
- „Zone 2“ bedeutet je nach Methode bis zu 30 bpm Unterschied.
- Die Schwierigkeit lässt sich nicht nachträglich anpassen.
- Kalorien liegen ~700 kcal zu tief (1560 statt ~2250), Kohlenhydrate bei 58 g.
- Synchronisierte Aktivitäten werden blind an die nächste Einheit gehängt.

Ziel: korrekte, nachvollziehbare Startwerte und Ziele. Jede Regel ist getestet und in CLAUDE.md nachgeführt.

## Befund (gelesen, nichts geändert)
1. **Planstart:** In `baseline/derive.ts` → `deriveVolume` ist `longMin = median(längste Einheit je Woche)`. Ein Long Run alle 2–4 Wochen fällt damit heraus; der Median ist die Easy-Run-Dauer. Zusätzlich markiert `baseline/outliers.ts` alles über `max(Median + 3·MAD, 2,5 × Median)` über **alle** Läufe einer Sportart. Bei 30-min-Easy-Runs fliegt ein 80-min-Long-Run raus. Untergrenzen gibt es keine; `initialLoad` (`plan/generate.ts`) nimmt die Baseline nur als Wert zwischen Anfänger-Anteil und Kapazität.
2. **Zonen:** Steps tragen `{ kind: 'hrZone', value: 'Z2' }`. App, Uhr und Import lösen das über `planHrZones` (`apps/mobile/src/features/training-zones/resolve.ts`) gegen die **Anzeigemethode** auf. Die Vorgabe hängt damit an der Methode. Manuelle Zonengrenzen gibt es schon: Profil → Trainingszonen, Zeile antippen (`zone-override-editor.tsx`). Das ist offenbar nicht auffindbar.
3. **Regler:** existiert nicht. `regeneratePlan` (`plan/edit.ts`) baut ab heute neu und lässt erledigte Einheiten stehen.
4. **Energie** (`energy/goal.ts`, `active.ts`, `nutrition/nutrients.ts`):
   - Die Basis ist Ruheenergie plus Alltag. Bei einer Wearable-Tagessumme setzt `activeEnergyDay` den Alltag aber auf **0**, die Basis wird so praktisch BMR.
   - Das Training kommt nur zu 50 % hinzu (`eatBackPct`).
   - Der Floor hebt still an (`floorApplied`, die UI zeigt es nicht deutlich).
   - Die Wearable-Korrektur ist 0,8; die 50 % sind „eat back“, nicht die Korrektur.
   - Fett ist fix bei 30 % der kcal. Protein wird auf bis zu 2,2 g/kg hochgeschoben.
5. **Matching** (`plan/activities.ts` → `matchActivities`): Es zählen nur gleicher Tag und gleiche Sportart, dann gewinnt die nächste Dauer, egal wie weit weg.

## Umsetzung

### 1 – Planstart (`baseline/`, `plan/generate.ts`, Quiz, Summary)
- **Neu `baseline/classify.ts`:** Läufe, Fahrten und Schwimmeinheiten werden pro Sportart in `easy | long | other` eingeteilt, relativ zur eigenen Verteilung:
  - `long` = Dauer oder Distanz ≥ 1,4 × Median der Sportart und ≥ Mindestdauer (Lauf 60 min, Rad 120 min, Schwimmen 45 min).
  - Sonst `easy`, bzw. `other` bei hartem Training oder Rennen.
- **Ausreißer nur innerhalb des Typs:** `suggestSelection` vergleicht Long mit Long und Easy mit Easy (MAD-Zaun pro Gruppe). Gibt es weniger als 3 Einheiten in einer Gruppe, wird diese Gruppe nicht beurteilt.
- **Neue abgeleitete Werte je Sport in `SportVolume`:**
  - `longMin`/`longKm` = Median der Long-Gruppe der letzten 6 Wochen; fehlt diese, die längste Einheit
  - `weeklyMin4`/`weeklyKm4` = Schnitt der letzten 4 Wochen
  - `easyKm`
- **Harte Untergrenzen** (`plan/floors.ts`, rein, getestet):
  - erster Long Run ≥ 0,9 × typischer Long Run (Minuten; km über Easy-Pace)
  - Woche-1-Volumen je Sport ≥ Schnitt der letzten 4 Wochen
- **Durchsetzung in `generatePlan`:**
  - `longMin` und `startLoad` werden auf die Untergrenzen gehoben.
  - Bleibt der fertige Plan trotzdem darunter (z. B. zu wenig Verfügbarkeit), gibt `generatePlan` `{ ok: false, issues: [{ code: 'belowBaseline', … }] }` zurück. Die App zeigt das mit Grund an und baut keinen Plan.
  - Ausnahme ist nur `continuation.firstWeekFactor` (Rückkehr nach Pause oder Verletzung). Dann kommt eine Plan-Notiz `notes.belowBaselineReturn` mit Pausendauer.
- **Quiz** (`packages/quiz/src/onboarding.ts`): Neue Frage pro gewählter Sportart, „Längste Einheit der letzten Wochen“ (eine Zahl in km, Schwimmen in m, alternativ Minuten). Sie geht als `profile.recentLongest[sport]` in die Untergrenzen ein. Wo Strava einen Wert hat, gewinnt der höhere von beiden; die eigene Eingabe in der Summary gewinnt immer.
- **Baseline-Summary** (`apps/mobile/src/features/baseline/screens/baseline-summary-screen.tsx`): neuer Block „Damit startet dein Plan“ pro Sport mit Long-Run-Dauer und -Distanz und Wochenvolumen (min/km). Die Werte kommen aus einer Engine-Vorschau von Woche 1 (`planStartPreview`), jeder ist editierbar (Overrides `longKm`, `weeklyMin`).

### 2 – Intensität statt Zonennummer (`hr.ts`, neu `intensity.ts`)
- **Neu `prescriptionBands(anchors)`:**
  - Anker: gemessene LTHR, sonst geschätzt aus HR-Reserve (`Ruhe + 0,83 × HRR`), sonst aus HRmax (`0,88 × HRmax`).
  - Bänder als Anteil der LTHR: recovery 0,68–0,78 · easy 0,78–0,90 · tempo 0,90–0,95 · threshold 0,95–1,00 · vo2 1,00–1,06 (Obergrenze HRmax).
  - Mit LTHR 178 / HRmax 204 ergibt das easy **139–159**. Mit nur HRmax 204 kommt **140–161**, praktisch derselbe Bereich.
  - Alle Faktoren liegen in `zoneConfig.prescription`.
- **Steps behalten `zone` für das Lastmodell.** Die bpm-Vorgabe kommt aus dem Band der zugehörigen Intensität (Z1 recovery … Z5 vo2), nie aus der Anzeigemethode.
- **Manuelle Zonengrenzen gewinnen:** Hat die Person die Zone einer Intensität von Hand gesetzt, gilt ihr Wert (CLAUDE.md: die eigene Eingabe gewinnt immer). Methode und Strava-Zonen ändern die Vorgaben nicht.
- **App:** `planHrZones` wird zu `planTargetBands` und nutzt `prescriptionBands` plus Overrides. Das betrifft Workout-Screen, Uhr-Export, Import-Last und Forecast.
- **Text:** `targetText` (`packages/quiz/src/workout-text.ts`) zeigt immer bpm, etwa „Locker · 139–159 bpm (Zone 2)“.
- **Profil → Zonen** zeigt weiterhin die gewählte Methode, mit dem Hinweis „Referenz, nicht die Vorgabe deiner Einheiten“. Jede Zeile bekommt ein sichtbares Bearbeiten-Symbol (der Editor existiert schon).
- **Tests:**
  - gleiches Band für %HRmax-, Karvonen- und LTHR-Anzeige
  - Anker-Reihenfolge
  - Override gewinnt
  - easy-Band ≥ 15 bpm breit

### 3 – Schwierigkeitsregler 1–10 (`plan/difficulty.ts`)
- `profile.difficulty` (Standard 5). Faktor `m = 1 + (d − 5) × 0,04`, also 0,80 bis 1,20. Er wirkt auf die Ziel-Last der neu generierten Wochen. Das Wachstum pro Ladewoche wird `1 + (0,07 × m)`, höchstens 1,095.
- **Sicherheitsregeln bleiben unverändert und gelten danach:**
  - +10 %-Cap auf die Referenzwoche (`capLoad`)
  - Erholungswochen bei 70 %
  - 80/20
  - keine zwei harten Tage hintereinander
  - Untergrenzen aus 1
- **Anwendung:** über `regeneratePlan` ab heute; erledigte Wochen und Einheiten bleiben unberührt.
- **Vorschau:** `previewDifficulty(state, input, today, level)` vergleicht vorher und nachher über die nächsten 4 Wochen: Einheiten pro Woche, Volumen je Sport (min, km), längste Einheit je Sport.
- **App:** Einstellungen → Training → Regler, Vorschau-Sheet, „Übernehmen“. Darunter der Hinweis: „Stimmt der Startpunkt nicht, korrigiere die Startwerte“ mit Link zur Baseline.

### 4 – Energie und Makros (`energy/`, `nutrition/nutrients.ts`)
- **Alltagsfaktor** `everydayActivity: homeOffice 1,2 · desk 1,3 · moderate 1,45 · onFeet 1,6`, ohne Sport. Wird einmal im Onboarding des Body-Add-ons gefragt und ist im Profil änderbar.
- **Basis** = BMR (Mifflin bzw. Katch, wie bisher) × Faktor. Die Basis bleibt stabil; Schritte und die Wearable-Tagessumme fließen nicht mehr in die Basis, sondern nur in den Abgleich, und das adaptive TDEE korrigiert sie weiter.
- **Training** (deine Wahl):
  - Die Wochensumme steht am Montag fest: `7 × (Basis − Defizit) + geplantes Training der Woche`.
  - Sie wird nach geplantem Bedarf auf die Tage verteilt (bestehendes `weeklyPlan`, ohne eat-back-Prozent); Trainingstage liegen höher, kein Tag unter dem Floor.
  - Weicht das tatsächliche Training klar ab (±25 % der bisherigen Wochenlast), erscheint ein Hinweis. Die Zahl wird nicht neu geschrieben.
  - `eatBackPct` und der Tagesmodus entfallen.
- **Korrektur** der gerätegemeldeten Aktivenergie: 0,75 statt 0,8. In CLAUDE.md steht heute 0,8; ich setze beides auf 0,75, wie du es willst.
- **Floor nie still:**
  - `goalTargets` liefert `status: 'ok' | 'belowFloor'` mit `requestedRate` und `proposedRate`; `proposedRate` ist die schnellste Rate, die den Floor hält.
  - Bei `belowFloor` sperrt die App das Ziel mit Hinweis und Button „0,x kg/Woche übernehmen“.
  - Alle Regeln aus „Energy & body rules“ und „Weight goal rules“ bleiben (Max-Rate, BMI, U18, Rapid-Loss, ±150 kcal).
- **Makros** (`macroTargets`):
  - Protein `proteinGPerKg` Standard 1,9, einstellbar 1,6–2,2
  - Fett 0,9 g/kg, einstellbar 0,8–1,0, nie unter 0,6 g/kg
  - Kohlenhydrate = Rest, steigen also an Trainingstagen
  - Test: 80 kg, 2250 kcal → 152 g P / 72 g F / 248 g KH
- **Aufschlüsselung:** `targetBreakdown()` zeigt Ruheenergie, Alltag, Training (Tagesanteil) und Defizit; im Body-Screen als kleine Tabelle.

### 5 – Matching mit Konfidenz (`plan/activities.ts`)
- **`matchScore(workout, activity)`**, Werte 0–1, alle Gewichte in `planConfig.activities.match`:
  - Sportart: Pflicht; Winter-Variante und Brick zählen
  - Datum: gleicher Tag 1,0, ±1 Tag 0,5
  - Dauer: `1 − |Δ| / geplant`, begrenzt
  - Distanz: wie Dauer, wenn geplant vorhanden
- **Ergebnis:**
  - ≥ 0,75 und eindeutig (Abstand ≥ 0,15 zum Zweiten) → `links`
  - 0,40–0,75 → `questions` mit Kandidaten
  - < 0,40 → `unplanned`; zählt zur Wochenlast, die geplante Einheit bleibt offen
- **App** (`data/activities/apply.ts`):
  - Bei einem Auto-Link zeigt der Hinweis „Rückgängig“; das entfernt den Link und setzt den Status zurück.
  - Offene Fragen landen in einer lokalen Tabelle `activity_questions`. Today zeigt dazu die Karte „Welche Einheit war das?“ mit den Kandidaten und „Keine davon“, was als ungeplant zählt.

### CLAUDE.md (wird mitgeändert)
- **Baseline:** Ausreißer nach Typ; Untergrenzen; Quizfrage; Summary zeigt die Startwerte.
- **Training engine rules:**
  - Vorgabe als Intensitätsband, nicht als Zonennummer
  - Anker und Faktoren
  - Override gewinnt
  - Regler 1–10 innerhalb der Regeln
  - Matching-Konfidenz
- **Energy:**
  - Alltagsfaktor
  - Training als Wochensumme nach Plan verteilt
  - Korrektur 0,75
  - Floor nie still mit Vorschlag
  - Makro-Regeln

## Reihenfolge
Fünf Commits, jeder mit eigenen Tests, in dieser Reihenfolge:
1. Planstart
2. Bänder
3. Regler
4. Energie
5. Matching

Jeweils `pnpm lint && pnpm typecheck && pnpm test`. Die Aufgabe kommt in `.claude/queue.md` mit stündlichem Check-in.

## Verification
- **Engine-Tests:**
  - Fall „13,5-km-Long-Run plus 6,7-km-Easy-Runs“: Long-Gruppe erkannt, Plan-Long-Run ≥ 12,2 km
  - `belowBaseline` bei zu wenig Verfügbarkeit
  - Pausen-Ausnahme mit Notiz
  - gleiche Bänder über alle Methoden
  - Regler 1 und 10: Cap, Erholungswoche, 80/20, keine harten Tage hintereinander, Untergrenzen
  - Energie: Beispiel 80 kg ≈ 2250 kcal; `belowFloor` liefert Vorschlag; Makro-Fall
  - Matching: sicher / unsicher / keiner
- **App-Tests:**
  - Summary zeigt die Startwerte
  - Workout zeigt „139–159 bpm (Zone 2)“
  - Regler-Vorschau
  - Floor-Hinweis
  - Match-Frage und Rückgängig
- **Manuell im App-Build:**
  - Strava neu kalibrieren → Summary zeigt Long Run ~13 km
  - neuer Plan
  - Workout-Screen mit bpm
  - Regler auf 7 → Vorschau
  - Body: Aufschlüsselung und Makros
