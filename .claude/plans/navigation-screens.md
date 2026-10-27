# Prompt 3 – Navigation und Screens

## Context
Die App-Navigation stammt aus der Zeit, als Insights ein eigener Tab war und Body nur mit dem Add-on erschien. Mehrere Screens sind schwer lesbar:
- **Today** zeigt eine Woche statt eines Tages.
- **Wochensummen** addieren Lauf- und Rad-km zu einer Zahl.
- **Trainingsarten** sind eine Textwand.
- **Strava-Routen** werden ohne Vorschau hinzugefügt.
- **Body**: Kacheln laufen rechts aus dem Bild. Ursache: `progress-section.tsx` setzt `tiles: { flexDirection: 'row' }` ohne `flexWrap`, mit drei `StatTile` à `flexBasis: 40%`. Der Coach ist ein ungegliederter Textblock.

Ziel: die neue Tab-Struktur, Today als Tagesansicht, ehrliche Wochenvolumen pro Sport, aufgeräumte Screens, eine Glückwunsch-Push und ein überarbeitetes Body-Design. CLAUDE.md wird an den betroffenen Stellen ersetzt.

## 1 – Navigation
**Tabs** (`app/(tabs)/_layout.tsx`): Today · Plan · Gym · Nutrition · Body.
- Die Tabs `insights` und `profile` entfallen, `nutrition.tsx` kommt neu dazu.
- Der Flag `addon_body_nutrition` blendet keine Tabs mehr um. Er entscheidet nur noch über die Inhalte: an = Add-on-Inhalt bzw. Paywall-Vorschau, aus = „coming soon“.

**Profil-Icon oben rechts:**
- Neue Komponente `ui/components/tab-header.tsx` mit Titel und rechts `ProfileButton` (Icon `profile` → `/profile`). Sie wird in den fünf Tab-Screens verwendet: Today, Plan, Gym, Nutrition, Body.
- Für Stack-Screens kommt ein gemeinsames `stackScreenOptions` mit `headerRight: ProfileButton` in die Stack-Layouts, z. B. `app/training/_layout.tsx`, `app/body`, `app/gym`, `app/routes`, `app/health`, `app/integrations`, `app/watch`, `app/strength`, `app/plan-new`.
- Ausgenommen sind Onboarding, Auth, Paywall sowie Profil und Einstellungen selbst.

**Profil** (`/profile`, neuer Stack `app/profile/`, aus `profile-screen.tsx`):
- Persönliches (Körperdaten aus dem Profil)
- Trainingszonen
- Ziel und Plan: Neuen Plan erstellen, Plan-Verlauf, Verfügbarkeit, Schwierigkeit, Pause, Terrain, Pendeln, Reisen, Winter, Kraft-Setup, Trainingsarten, Routen
- Verbindungen (Strava, Uhr)
- Abo

**Einstellungen** (`/settings`, die vorhandenen `app/settings/*`-Screens plus eine neue Index-Seite):
- Benachrichtigungen, Einheiten, Darstellung, Sprache, Haptik, Datenschutz, Account (Logout/Löschen), Lizenzen
- Profil verlinkt auf Einstellungen und umgekehrt.

**Body-Tab:**
- Oben das Ziel als Fortschritt (aus dem Coach hierher verschoben).
- Darunter **Health**: `HealthOverview` aus `features/insights/health`, Training-Tier.
- Darunter Gewicht und Körperzusammensetzung, Messungen, Fortschrittsfotos und Check-in aus dem Body-Add-on, über die vorhandene `useEntitlement('body_nutrition')` gegated.
- Ohne Add-on: Vorschau mit Paywall. Flag aus: Karte „coming soon“.

**Nutrition-Tab:**
- Food Diary mit „Energy today“ (`DiarySection`), Energieziele und Coach.
- Flag aus: Screen „coming soon“ mit Kurzbeschreibung. Ohne Add-on: Vorschau mit Paywall.
- `BodyScreen` wird in `NutritionScreen` und den neuen `BodyScreen` aufgeteilt. Die Section-Komponenten bleiben.

**Plan-Tab:**
- Segmente Weeks / Calendar / History.
- History enthält `PlanInsights` (bisher `progress-screen.tsx`) mit einer inneren Umschaltung „Sessions / Records“ und dem bestehenden Umschalter „Dieser Plan / Gesamt“.
- `/training/insights` und alte Links auf `/insights` leiten auf Plan → History um.
- Der Health-Teil von Insights lebt nur noch im Body-Tab. `insights-screen.tsx` entfällt.

**Maestro:** `.maestro/tabs-smoke.yaml` wird auf die neuen Tabs, das Profil-Icon und Plan → History angepasst.

## 2 – Today zeigt einen Tag
In `today-screen.tsx` kommt ein State `selectedDate`, Default heute.
- **Wochenleiste:** Die `WeekStrip` ruft `onSelectDay(date)` auf und setzt nur den gewählten Tag. Keine Navigation zum Plan.
- **Markierung:** Die Leiste markiert den gewählten Tag (gefüllt) und heute (Rahmen) getrennt. Das Accessibility-Label nennt die Typen, Pfeiltasten sind nicht nötig.
- **Wochenwechsel:** kleine Pfeile ‹ › an der Leiste.
- **Punkte:** Sie verwenden schon `typeColor`. Neu ist eine Legende als Zeile unter der Leiste: die Typen des gewählten Tags in Worten („Easy · Strength“). So erklärt sich jede Farbe.
- **Tagesblock** – neue Komponente `features/today/day-session.tsx`. Sie zeigt:
  - Kopf in der Typfarbe: Typ und Titel
  - Dauer als Bereich
  - bpm-Band („Easy · 139–159 bpm (Zone 2)“)
  - gewählte Route: Name, km und Höhenmeter, mit Link zur Routenwahl
  - nummerierte Schritte
  - „Why this session“
  - Aktionen: Erledigt, Öffnen
- **Wiederverwendung:** `stepItems`, `NumberedRow` und `Section` werden aus `workout-screen.tsx` nach `plan/components/workout-steps.tsx` ausgelagert und in beiden Screens genutzt.
- **Ruhetag:** eigene Karte mit Icon, „Rest day“, einem Satz Warum und dem nächsten geplanten Training („Next: Long run, Saturday“).
- **Zurück zu heute:** Ist ein anderer Tag gewählt, zeigt ein Chip „Back to today“ oben eine sichtbare Rückkehr.
- **Weiter auf Today:** Wetter, Pendel-Karte und Match-Fragen bleiben. Die bisherige Wochenkarte mit Segmentbalken wird **eine** Zeile unter dem Tag: Zeit erledigt/geplant und der Pro-Sport-Kurztext. Die Insights-Platzhalterkarten (`today.insight.*`) entfallen.

## 3 – Wochenvolumen pro Sport
**Engine** (`plan/summary.ts` → `weekProgress`):
- Neu sind `minutesDone/minutesPlanned` (Zeit als Gesamtgröße).
- Neu ist `bySport`: Lauf und Rad in km, Schwimmen in m, Kraft in Sessions, Pendeln nicht. Jeweils done/planned, ermittelt über `workoutDistances`; ein Brick zählt anteilig zu Rad und Lauf.
- `kmDone/kmPlanned` bleiben für interne Verwender.

**UI** – neue Komponente `plan/components/sport-volume.tsx`:
- Oben die Zeit („3 h 10 / 5 h 20“), darunter eine Zeile pro gewähltem Sport mit Sportfarbe (`colors.sport*`) und Name („Running 18 / 29 km“).
- Bei nur einem Sport keine Aufschlüsselung, nur „Distanz x / y“.
- Verwendet in der Plan-Wochenkarte (`week-progress-card.tsx`), im Kalender-Wochenkopf (`calendar-view.tsx`, ersetzt `minutesRange · km`) und in der Today-Wochenzeile.
- Imperial: Meilen bzw. Yards über `useUnits`.

## 4 – Trainingsarten
In `workout-types-screen.tsx`:
- **Zeilen:** Pro Typ eine einklappbare Zeile mit Icon, Name, Einzeiler und rechts einem Chip mit Zone und Belastung (neuer kurzer Key `chip`, z. B. „Z1–2 · 3–4/10“). Antippen klappt Beschreibung und Nutzen auf; `accessibilityState.expanded` ist gesetzt.
- **Gruppen und Filter:** Gruppen pro Sport, einklappbar. Oben ein Sport-Filter (Chips). Standard sind die eigenen Sportarten, ein Schalter „Show all“ zeigt alle.
- **Texte:** Die `description`-Texte in `en.json` werden so überarbeitet, dass sie den `short`-Text nicht wiederholen. Die Beschreibung erklärt das Wie, der Einzeiler das Was.
- **Verlinkung aus dem Training:** Das bestehende `focus` öffnet den Typ aufgeklappt, scrollt dorthin und klappt seine Sportgruppe auf.

## 5 – Strava-Routen mit Vorschau
- **Engine:** `RecognisedRoute` bekommt `elevationGainM` (Median), `typicalDurationSec` (Median) und das schon vorhandene `lastDate`/`occurrences`; `TrackActivity` liefert dafür `durationSec` und `elevationGainM`. Neu ist die Konfiguration `minDistanceM` pro Sport (Lauf 2 km, Rad 8 km) als Rauschfilter. Tests dazu.
- **Liste:** Die ganze Zeile öffnet `routes/suggestion/[key]`.
- **Detail-Screen:** Karte (`RouteMap`), Höhenprofil (`ElevationChart`, sobald der Stream da ist), Distanz, Höhenmeter, wie oft, zuletzt, typische Dauer, ein editierbarer Name und „Add“.
- **Namensvorschlag:**
  - Startet die Route innerhalb von 300 m vom Zuhause-Startpunkt (`start-point.ts`): „Home loop 5.5 km“.
  - Sonst Reverse-Geocoding des Startpunkts über `expo-location` `reverseGeocodeAsync`. Das ist bereits Dependency und nutzt den Geocoder des Systems, also keinen bezahlten Dienst. Ergebnis z. B. „Seefeld loop 5.5 km“.
  - Fallback ist der heutige Name.
- **Umbenennen:** Bibliotheksrouten werden im bestehenden `route-detail-screen.tsx` umbenennbar.

## 6 – Glückwunsch-Push
- **Wann:** In `data/activities/process.ts` wird nach einer **automatisch sicheren** Verknüpfung (Notice mit Link, nicht aus einer offenen Frage) eine lokale Benachrichtigung geplant. Kategorie `congrats`, eigener Android-Channel, Text z. B. „Nice work – Thursday’s long run is done (14.2 km)“.
- **Höchstens eine pro Session:** Die Workout-IDs mit bereits gesendetem Glückwunsch werden in `appSettings` gemerkt.
- **Unbestätigte Matches:** Offene „Which session was this?“-Fragen lösen nichts aus. Wird die Frage später in der App beantwortet, kommt keine Push, weil der Nutzer schon in der App ist und die In-App-Notice sieht.
- **Vordergrund:** Der Handler in `background-task.ts` unterdrückt `congrats` im Vordergrund (die In-App-Notice reicht). Im Hintergrund – die App wurde von der Aktivitäts-Push geweckt – erscheint sie.
- **Einstellung:** Schalter „Congratulations after a session“ in Einstellungen → Benachrichtigungen, standardmäßig an, gespeichert auf dem Gerät.
- **CLAUDE.md** „Account & notifications“: Die Tageserinnerung bleibt genau eine pro Tag. Die Glückwunsch-Push wird als eigene Kategorie mit den obigen Regeln beschrieben.

## 7 – Body-Screen
**Theme** (`packages/theme`):
- Neue Skala `changeColors` pro Schema: `favourable`, `unfavourable`, `neutral`, plus `*Text`-Varianten für Text auf hellem Grund.
- Neu sind `chartColors` (`resting`, `active`, `intake`, `trend`, `target`).
- Neue Tests:
  - Kontrast ≥ 4.5:1 für Text-Tokens auf bg und surface, dunkel und hell
  - ≥ 3:1 für Füllungen
  - unterscheidbar von Volt und voneinander
- Tokens als `colors.changeFavourable` usw. in `src/ui/theme`.

**Engine** (`body/change.ts`):
- `changeTone(metric, goalDirection, delta)` → `favourable | unfavourable | neutral`. Eine Tabelle pro Metrik: Gewicht, Körperfett, Taille, Hüfte, Brust, Arme, Oberschenkel, Magermasse, Ruhepuls, HRV, Schlaf.
- Die Richtung hängt bei Gewicht und Umfängen vom Ziel ab: Abnehmen → runter ist günstig, Aufbauen → bei Gewicht, Brust und Armen rauf, Halten → nahe 0 ist günstig.
- Unterhalb einer Rauschschwelle ist das Ergebnis neutral. Tests für alle Ziele.

**UI:**
- **`StatTile` neu:** Label klein, grau, in Versalien; Wert groß; Kontextzeile mit Pfeil oder Vorzeichen plus Änderungsfarbe („▼ 0.6 kg · last 7 days“). Die Farbe trägt nie allein Bedeutung.
- **Neues `TileGrid`:** zweispaltig, `flexWrap`; bei großer Schrift (`useWindowDimensions().fontScale` > 1.3) oder unter 360 dp einspaltig. `numberOfLines` wird nicht abgeschnitten, Werte umbrechen statt zu clippen.
- **Reihenfolge im Body-Tab:**
  1. Zielkarte mit Fortschritt
  2. Health-Kacheln
  3. Gewicht & Körper (Trend-Kacheln, Trendchart)
  4. Messungen als Tabelle: Label links, aktueller Wert rechtsbündig, Änderung in eigener rechtsbündiger Spalte in der Änderungsfarbe mit Vorzeichen
  5. Zusammensetzung und Indizes
  6. Fotos und Check-in
- **Kontrast:** dieselben Regeln in dunkel und hell.

**Coach** (`coach-card.tsx`, ins Nutrition-Tab verschoben, weil er Energie und Essen bewertet):
- **Kopf:** eine Reihe mit drei bis vier kleinen Kennzahlen (Gewichtstrend, geloggte Tage, erledigte Sessions, ⌀ Aufnahme), jeweils Wert und Änderungsfarbe.
- **Darunter:** höchstens drei Kernaussagen, je eine Zeile mit Icon und Ton (gutes Zeichen / im Blick behalten). Die Erklärung kommt per Antippen.
- **Ganze Karte einklappbar:** Zusammenfassung sichtbar, Details (Anpassungen mit „Apply“, Hinweise) aufklappbar.
- **Leere Woche:** Unter einer Datenschwelle (< 3 geloggte Tage und < 2 Wiegungen) erscheint nur ein Satz und ein Hinweis, z. B. „Log three days this week and I can show you a trend.“ Keine Prozente, kein leerer Balken, kein Zählen dessen, was fehlt.
- **Wortwahl:** keine Vorwürfe, z. B. „Only 0 days“ fällt weg. Die Engine liefert dafür `coach.dataState: 'enough' | 'thin'` (Test).
- **Zielbalken:** verlässt den Coach und kommt oben in den Body-Tab.

**Charts** (`energy-bars-chart.tsx`, `trend-chart.tsx`):
- Sie verwenden `chartColors`: Ruhe, aktiv, Aufnahme.
- Sichtbare Legende mit Farbfeld und Wort für jede Serie.

Alle Blöcke bekommen Karten mit Überschriften.

## 8 – CLAUDE.md
Ersetzt bzw. ergänzt werden:
- **UI patterns:**
  - Navigation: neue Tabs, Profil-Icon, Profil vs. Einstellungen, Body mit Health, Plan mit History, Nutrition mit coming soon
  - Today: ein Tag, Wochenleiste als Tagesauswahl
  - Plan: Wochenvolumen als Zeit plus pro Sport
  - Insights entfällt
  - Profile → Profile/Settings
  - Body: Kacheln, Änderungsfarben, Coach
- **Health:** lebt im Body-Tab.
- **Account & notifications:** Glückwunsch-Push als eigene Kategorie.
- **Branding:** Änderungs- und Chartfarben als eigene Skalen im Theme.
- **Plan history:** Insights-Verweise werden auf Plan → History angepasst.

## Reihenfolge
Jeder Schritt ist ein eigener Commit mit Tests und `pnpm lint && pnpm typecheck && pnpm test`:
1. Theme- und Engine-Bausteine: `changeColors`, `chartColors`, `weekProgress.bySport`, `changeTone`, Route-Statistik und -Filter, `coach.dataState`
2. Navigation: Tabs, Profil-Icon, Profil und Einstellungen, Plan → History, Body/Nutrition-Aufteilung, Redirects, Maestro
3. Today als Tag
4. Wochenvolumen in Plan, Kalender und Today
5. Trainingsarten
6. Routenvorschau
7. Glückwunsch-Push
8. Body-Design und Coach
9. CLAUDE.md und Bericht

## Verification
- **Engine/Theme:** Vitest mit 100 % Coverage, darunter:
  - `bySport` mit Bricks und Imperial in der UI
  - `changeTone` für alle Ziele
  - Routenfilter und -statistik
  - Kontrasttests der neuen Farben
- **App (Jest):**
  - Tabs ohne Profil-Tab; Profil-Icon öffnet `/profile`; Einstellungen erreichbar
  - Today: Tageswechsel ohne Navigation, Ruhetag, „Back to today“
  - Wochenzeilen pro Sport, bei einem Sport nur Distanz
  - Trainingsarten aufklappen, Filter, Fokus
  - Routen-Detail mit Add und Name
  - Glückwunsch nur bei sicherem Link, einmal pro Session, abschaltbar
  - Body-Grid und Coach im leeren Zustand
- **Große Schrift:** Render-Test mit `fontScale` 2, keine fixen Breiten.
- **Maestro:** `tabs-smoke.yaml` wird aktualisiert. Ausführen geht in diesem Container nicht: Es gibt weder Emulator noch Maestro-CLI. Der Lauf muss bei dir passieren, ich nenne das im Bericht.
- **Manuell:**
  - Today: Tage antippen
  - Plan → History
  - Profil-Icon
  - Body bei kleinster Breite und größter Schrift, in dunkel und hell
  - Strava-Route ansehen und hinzufügen
