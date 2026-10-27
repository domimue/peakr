# Neuer Plan ohne neuen Account, Plan-Archiv, Badges, Rückblick, Wochen-Mix

## Context
Ein bestehender Plan lässt sich heute nicht ersetzen:
- Das Quiz ist nur ohne Plan erreichbar.
- Die Paywall überspringt das Erstellen, wenn schon ein Plan existiert.
- `createPlan` **löscht** den alten Plan samt Einheiten (`plan-repository.ts` → `removeAllPlans`, auf dem Server `plans.deleted` mit Kaskade auf `workouts`).

Damit gingen auch Verlauf, Records und Progress verloren; diese rechnen heute nur über den aktuellen Plan (`engine/plan/summary.ts` → `historyByMonth`, `performance`).

Ziel:
- neuer Plan im selben Account, der alte wird archiviert
- Verlauf über alle Pläne, Badges für abgeschlossene Pläne
- ein Rückblick, der den neuen Plan beeinflusst
- ein korrigierter Wochen-Mix

## Befund Wochen-Mix (Teil 4) – aus dem Code, `engine/plan/composition.ts`
- **Halbmarathon und Marathon** (`marathonish`) bekommen **nie VO2-Intervalle**:
  - Build: Quality B = Progression
  - Peak: Race Pace
  - Taper: Tempo
- Bei **≤ 4 Läufen pro Woche** gibt es in Build nur **eine** Qualitätseinheit: Tempo, abwechselnd mit langen Hügeln, wenn das Gelände nicht flach ist.
- Base: Fartlek oder kurze Hügel.
- In deinem Beispiel ist das Ergebnis also gewollt. Es entspricht aber nicht der gängigen Praxis: Halbmarathon-Pläne enthalten in Build und Peak alle 2–3 Wochen auch VO2-Intervalle (z. B. 5 × 1000 m), neben Schwelle und Race Pace.
- Weitere Prüfpunkte im Audit:
  - die Rotation per `weekIndex % 2`, weil Erholungswochen den Takt verschieben
  - die `maxLevelInPhase`-Grenzen
  - die Bedingung „4 Wochen im Plan“ für VO2
  - ob Downgrades wegen „keine zwei harten Tage“ bevorzugt Intervalle treffen

## Umsetzung

### A. Wochen-Mix (Engine, zuerst – unabhängig vom Rest)
1. **Audit-Report** als Engine-Test-Helfer und Doku-Tabelle: Anzahl pro Qualitätstyp (Strides, Hügel kurz/lang, Fartlek, Tempo/Schwelle, VO2, Progression, Race Pace) pro Phase und gesamt, für dein Beispiel und für jedes Rennziel × Level des Fixture-Rasters. Die Ergebnisse kommen in den Bericht und in `WORKOUTS.md` §9.
2. **Rotation statt fester Zuordnung**, deterministisch über einen Zähler der Ladewochen (`buildWeekIndex` gibt es schon):
   - **5K/10K:** Quality A abwechselnd Tempo und lange Hügel; Quality B VO2, alle 3 Wochen ersetzt durch Fartlek.
   - **Halbmarathon:** Quality A rotiert Schwelle → VO2 → Schwelle/Hügel lang. In Peak ist Quality B Race Pace HM, in jeder zweiten Peak-Woche VO2 kurz.
   - **Marathon:** Quality A Schwelle/Hügel, alle 3 Wochen VO2 kurz (Level −1). Quality B Progression bzw. Race Pace M.
   - **Bei ≤ 4 Läufen** (nur eine Qualitätseinheit): Für 10K/HM wechselt sie zwischen Schwelle und VO2 (2:1); bei 5K umgekehrt.
3. **Taper HM:** Die kurze scharfe Einheit wechselt zwischen Tempo und VO2-Kurzform.
4. **Erholungswochen:** Sie zählen nicht zur Rotation; der Takt läuft über Ladewochen.
5. **Prüfen und dokumentieren:** ob Downgrades wegen „keine zwei harten Tage“ Intervalle bevorzugt treffen; falls ja, wird zuerst die Einheit mit tieferer Priorität herabgestuft.
6. **Neue Raster-Property-Tests:**
   - In Build/Peak von 5K/10K/HM erscheinen Schwelle und VO2 je mindestens einmal in jedem 3-Wochen-Fenster.
   - Beim Marathon erscheint VO2 mindestens alle 4 Ladewochen.
   - 80/20, keine zwei harten Tage hintereinander und das +10-%-Cap bleiben grün, auch bei Difficulty 1 und 10.
   - Diese Regeln kommen in `WORKOUTS.md` §9.

### B. Plan-Archiv und Abschluss-Status (Daten und Engine)
- **SQLite** `plans`: neue Spalten
  - `status`: `active | archived`
  - `archived_at`
  - `outcome`: `replaced | finished | completed`
  - `summary` (JSON: Sessions geplant/erledigt pro Typ, Minuten, km, Completion-Rate, Ziel, Daten)
  - `review` (JSON, Teil D)
- **Supabase** `plans`: dieselben Spalten. Eine Migration erlaubt ein neues `status`/`archived`, und `plans_keep_deleted` bleibt.
- **Neuer Plan:** archiviert statt löscht. `createPlan` setzt den alten Plan auf `archived`; dessen geplante Einheiten ab heute werden entfernt, erledigte und übersprungene bleiben.
- **Sync** (`data/sync/merge.ts`, `remote.ts`):
  - Der aktive Plan synct wie heute.
  - Archivierte Pläne werden einmal hochgeladen, sind danach read-only und werden auf anderen Geräten als Archiv gezogen.
  - `getPlan()` liefert nur den aktiven Plan.
- **Engine** `plan/outcome.ts`: `planOutcome(state, today, replacedEarly)`.
  - `completed`: Der Plan lief bis zur letzten Woche und mindestens **80 % der geplanten Einheiten** sind erledigt. Ich zähle Einheiten und nicht Last, weil du „Einheiten“ gesagt hast und es leicht nachvollziehbar ist. Pendelfahrten und Erholungs-Einheiten zählen mit; Pausentage zählen nicht als geplant.
  - `finished`: bis zum Ende gelaufen, aber unter 80 %.
  - `replaced`: vorzeitig gewechselt, nie `completed`.
  - Schwelle in `planConfig.completion.minShare = 0.8`.
- **Ein Plan endet von selbst:** Wenn das Zieldatum vorbei ist, archiviert die App ihn mit `finished`/`completed` und bietet „Neuen Plan erstellen“ an.
- **Rückgängig:** Am selben Tag kann der neue Plan verworfen werden; der alte wird wieder aktiv, und gelöschte zukünftige Einheiten werden aus dem Archiv wiederhergestellt. Dafür bleibt der vollständige alte Zustand bis Tagesende gespeichert.
- **Kontolöschung:** Archivierte Pläne gehen mit (Kaskade auf `plans`/`workouts` gibt es schon).
- **Export:** Einen allgemeinen Daten-Export gibt es in der App nicht (nur den Body-Export). Ich ergänze einen JSON-Export der Plan-Historie in Profil → Account; das ist klein.

### C. „Neuen Plan erstellen“ (App)
- **Profil:**
  - Das aktuelle Ziel wird angezeigt, mit der Zeile „Neuen Plan erstellen“.
  - Ohne Abo oder Trial führt die Zeile zur Paywall.
- **Ablauf** in neuen Routen `/plan-new/*`, die das Onboarding wiederverwenden:
  1. Rückblick (D)
  2. Quiz mit vorausgefüllten Antworten aus `plan.input` und dem Quiz-Store; erledigte Einmal-Schritte (Disclaimer) werden übersprungen
  3. Strava-Neukalibrierung (bestehender Baseline-Flow; ohne Strava-Verbindung anbieten und überspringbar)
  4. Baseline-Summary mit den Untergrenzen
  5. Prognose mit Woche-1-Vorschau
  6. Bestätigung
  7. neuer Plan
- **Startwerte:** Die Einheiten des alten Plans sind echter Verlauf. Daraus leite ich die Startwerte ab (typischer Long Run, Wochenminuten pro Sport der letzten 4 Wochen, Level pro Template) und nehme sie als **primäre** Quelle; die Strava-Baseline ergänzt. Dafür braucht es eine Engine-Funktion `historyBaseline(archivedState, today)` mit denselben Typen wie `BaselineResult`. Die Untergrenzen nehmen das Maximum.
- **Bestätigung:**
  - Startdatum des neuen Plans
  - „Dein aktueller Plan wird archiviert“
  - was bleibt (Einheiten, Aktivitäten, Gym, Body)
  - was wegfällt (geplante Einheiten ab heute, manuelle Änderungen, Overrides, Reisen)
- **Engine:** Ein `belowBaseline`-Ergebnis zeigt die Meldung und baut nichts.
- **Uhr:** Die Uhr-Synchronisierung (auto-sync, plan-sync) räumt die Einheiten des alten Plans ab wie nach einer Regeneration.
- **Paywall:** Der Fall `if (plan.data)` bleibt für das Erst-Onboarding; der neue Ablauf hat keinen Kaufschritt. Es gibt nirgends einen Link zum Web-Checkout.

### D. Rückblick „Wie war dein letzter Plan?“ (Vorschlag)
1. **Gemessen** (Engine `planReview(state, activities, zones)`, nichts erfunden):
   - Completion gesamt und pro Typ (long, quality, easy, strength, commute)
   - die am häufigsten ausgelassenen Einheiten
   - Ist-Last zu Plan-Last
   - Long Runs: Anteil der Zeit im easy-Band; HR-Drift zweite zu erster Hälfte, wo es einen HR-Stream gibt
   - Qualitätseinheiten: wie viele erledigt, wie viele herabgestuft
   - grade-adjusted Easy-Pace erstes zu letztem Drittel
   - Pausen und verpasste Wochen
   - Fehlt etwas, steht dort „nicht genug Daten“.
2. **Gefragt** (ein Tipp je Frage, alles optional):
   - Gesamtgefühl: zu leicht / passend / zu hart
   - Long Runs: gut / zu lang / zu kurz
   - Qualitätseinheiten: zu wenig / passend / zu viel
   - Wochenzeit: zu viel / passend / zu wenig
   - Pause wegen Beschwerden nötig? ja/nein (ohne Diagnose)
   - Wunsch: mehr Intervalle / mehr lockerer Umfang / mehr Kraft / weniger Tage
3. **Wirkung** (Engine `reviewAdjustments(review, measured)`, transparent und innerhalb aller Sicherheitsregeln):
   - **Start-Level pro Template:** aus dem alten Plan übernommen. Erledigt ≥ 80 % und „passend/zu leicht“ → +1; „zu hart“ oder < 60 % erledigt → −1 (Untergrenze Level 1).
   - **Difficulty:** Vorschlag ±1 bei „zu leicht/zu hart“, wird angezeigt und ist abwählbar.
   - **Quality-Mix:** Ein neues Profilfeld `qualityEmphasis: 'more' | 'balanced' | 'less'` steuert die Rotation aus A, z. B. „mehr Intervalle“ → VO2 im Verhältnis 1:1. 80/20 bleibt.
   - **Kraft-Priorität:** aus dem Wunsch übernommen.
   - **Untergrenzen:** nie unter dem tatsächlich Erreichten. Ausnahme: Bei „Pause wegen Beschwerden“ gelten die Resume-Regeln, und die App sagt warum.
   - Jede Wirkung steht als Zeile mit Grund im Rückblick („Deine Long Runs liefen gut (92 %) – der neue Plan startet mit Level 4“).
- Der Rückblick wird mit dem archivierten Plan gespeichert und ist überspringbar.

### E. Verlauf, Records, Progress mit zwei Bereichen
- **Engine** (`plan/summary.ts`): `historyByMonth` und `performance` nehmen **mehrere Pläne** (aktiv + archiviert) plus **ungeplante Aktivitäten** (nicht verknüpfte Activities).
- **Umschalter** „Dieser Plan / Gesamt“, immer beschriftet.
- **Bestwerte:** Sie sind immer „Gesamt“ und so beschriftet.
- **Bereich:** Wochen-Chart und Summen folgen dem gewählten Bereich.
- **Verlauf:** Insights → Training zeigt alle erledigten Einheiten aller Pläne plus ungeplante, jeweils mit Plan-Etikett.
- **Archiv:** Profil → Plan-Verlauf listet die archivierten Pläne mit Ziel, Daten, Status und Completion, read-only aufrufbar.

### F. Badges
- Abgeleitet aus archivierten Plänen mit `outcome = completed`, also keine eigene Tabelle; sie synchronisieren damit über `plans`.
- **Ein Badge pro abgeschlossenem Plan:** Ziel + Monat, z. B. „Halbmarathon-Plan · Mär 2027“.
- **Vorschlag für drei weitere:**
  - erster abgeschlossener Plan
  - erster abgeschlossener Triathlon- bzw. Multisport-Plan
  - Plan mit mindestens 95 % erledigt („durchgezogen“)
- Keine Streaks, nichts zu Gewicht oder Essen.
- **Anzeige:**
  - Profil → Plan-Verlauf und Insights → Records
  - eigene Grafik aus Peakr-Mark und Workout-Typ-Icon mit Volt-Akzent, keine fremden Assets

### G. CLAUDE.md / WORKOUTS.md
- **CLAUDE.md:**
  - Monetisation und App-only flow: neuer Plan ohne neuen Account
  - UI patterns: Profil (Ziel, „Neuen Plan erstellen“, Plan-Verlauf) und Insights (zwei Bereiche, Badges)
  - Training engine rules: Archiv, Abschluss-Status, Rückblick-Wirkungen
- **WORKOUTS.md §9:** Rotation und Quality-Mix pro Ziel, Audit-Tabelle.

## Reihenfolge
Jeder Schritt ist ein eigener Commit mit Tests und `pnpm lint && pnpm typecheck && pnpm test`:
1. A
2. B
3. E + F
4. C
5. D
6. Doku

Die Aufgabe kommt in `.claude/queue.md` mit stündlichem Check-in.

## Verification
- **Engine:**
  - Audit-Tabellen vor und nach der Änderung
  - Property-Tests zum Mix über das Raster (auch Difficulty 1/10)
  - `planOutcome` (completed, finished, replaced, 80-%-Grenze, Pausen)
  - `historyBaseline`
  - `planReview` / `reviewAdjustments` (inklusive Beschwerden → Resume-Regeln)
  - `performance` mit mehreren Plänen und ungeplanten Aktivitäten
- **App (Jest):**
  - Profil-Zeile und Paywall ohne Abo
  - vorausgefülltes Quiz
  - Bestätigung
  - alter Plan archiviert und Einheiten erhalten
  - Rückgängig am selben Tag
  - Umschalter der Bereiche
  - Badge erscheint nur bei `completed`
  - Sync: archivierter Plan wird hoch- und auf ein zweites Gerät heruntergeladen (Mock-Tests in `data/sync/__tests__`)
- **Manuell:**
  - Profil → „Neuen Plan erstellen“: Rückblick → Quiz → Strava → Prognose → Bestätigung
  - Records „Gesamt“ enthält die alten Einheiten
  - Plan-Verlauf zeigt den alten Plan als „ersetzt“
  - der neue HM-Plan enthält VO2-Intervalle
