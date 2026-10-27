# Garmin-Gesundheitsdaten kommen nicht an – Befund und Plan

## Context
In Insights → Health bleiben Ruhepuls, Stress, Body Battery, Intensitätsminuten, SpO2, Atmung und Gewicht leer, obwohl Garmin Connect die Daten hat. Schlaf und HRV kommen an, Schritte nur über Health Connect. Dein Konto nutzt den **Personal-Key-Modus** (Pull; der OAuth/Starter-Push ist per Flag aus).

## Befund (nur gelesen, nichts geändert)

**Quellen.** developer.garmin.com ist aus dem Container nicht erreichbar (DNS gesperrt). Gelesen habe ich (1) Garmins offiziellen Client `garmin/connect-personal-api-python` (Stand 21.10.2026) und (2) `DynamicsNinja/garminconnect-js`: dessen `src/generated/personal-api.ts` ist aus **Garmins Personal-API-OpenAPI-Spec 1.0.0** generiert und wurde am 23.10.2026 gegen ein echtes Konto geprüft. Die Spec enthält 25 Pfade.

### 1. Endpunkte: was wir aufrufen und was die API anbietet
| Endpunkt (Personal API) | Liefert | Wird bei uns gepullt? |
|---|---|---|
| `/usersummary-service/v2/dailysummaries` | Schritte, Etagen, Kalorien, Ruhepuls, Intensitätsminuten, Stress, Body Battery, Atmung, SpO2 | **ja, aber falsch gelesen** |
| `/sleep-service/sleep/dailySleepSummariesByDate` | Schlaf | ja ✔ |
| `/hrv-service/hrv/daily/{from}/{to}` | HRV | ja ✔ |
| `/weight-service/weight/range/{from}/{to}` | Gewicht, Körperfett, Muskelmasse, BMI | ja (Ursache unklar, siehe unten) |
| `/wellness-service/wellness/daily/spo2acclimation/{day}` | SpO2 pro Tag | nur in `probe` |
| `/wellness-service/wellness/bodyBattery/reports/daily` | Body-Battery-Verlauf | nur in `probe` |
| `/usersummary-service/stats/stress/daily`, `/stats/steps/daily`, `/wellness/dailyHeartRate`, `/fitnessage-service/fitnessage/v2/{day}`, `/activitylist-service/...` | Einzelstatistiken, Fitnessalter, Aktivitäten (mit `vO2MaxValue` pro Aktivität) | nein |

**Hauptursache (sicher):** Deine Vermutung stimmt nicht ganz. Die Tageszusammenfassung wird abgefragt, aber `mapDailySummaries` (`supabase/functions/_shared/health/garmin-personal.ts`) liest **flache v1-Feldnamen** (`totalSteps`, `restingHeartRate`, `averageStressLevel`, `bodyBatteryHighestValue`, `averageSpo2`, `avgWakingRespirationValue` …). Die sind aus dem alten `usersummary/daily`-DTO. Der **v2**-Endpunkt antwortet laut Spec aber `{ data: [ { calendarDate, movement: { steps: { value }, floorsAscended: { value } }, calories: { burnedActive, burnedResting }, heartRate: { restingValue }, intensityMinutes: { moderate, vigorous }, stress: { avgLevel }, bodyBattery: { maxValue, minValue }, respiration: { avgValue }, pulseOx: { avgValue } } ] }`. Jedes Feld kommt also als `null` zurück. Weil der Mapper aus einem fehlenden Wert nie eine Null macht, bleiben genau diese Karten leer. Schlaf und HRV haben eigene Endpunkte mit flachem DTO und funktionieren deshalb. Der Unit-Test hat das nicht gemerkt, weil die Fixture ebenfalls flach war.

**Weitere Ursachen:**
- **Gewicht:** Der Mapper passt eigentlich zum Spec-Format (`dailyWeightSummaries[].latestWeight/allWeightMetrics`). Wahrscheinlichster Grund: Die Karte zeigt nur Werte der **letzten 7 Tage** (`RECENT_DAYS`). Wer sich seltener wiegt, sieht deshalb „Nothing recorded“. Das bestätigt erst die Diagnose.
- **Ein Fehler wirft alles weg:** `pull()` bricht beim ersten Fehler eines Endpunkts ab und verwirft auch die schon geholten Datensätze dieses Durchlaufs. 404/204 werden still übersprungen und nirgends protokolliert.
- **Schritte nur über Health Connect:** Folge der Hauptursache.

### 2. Backfill
Die Personal API braucht **keinen eigenen Backfill-Aufruf**. Ältere Daten werden einfach über Datumsbereiche abgefragt. Unser Backfill (bis 365 Tage, in 28-Tage-Schritten) existiert und lief nach dem Verbinden an. Er hat aber mit dem kaputten Mapper gearbeitet, ist inzwischen wahrscheinlich als `backfill_done` markiert und läuft nicht neu. Einen manuellen Auslöser gibt es nicht; „Sync now“ holt nur 7 Tage. Starter/OAuth hat laut sekundären Quellen keinen Backfill (Enterprise schon); die App zeigt das bereits an.

### 3. Scopes vs. angebotene Datengruppen
- **Personal Key:** Es gibt keine Scopes. Der Key deckt alle eigenen Daten ab, also ist das **nicht** die Ursache. „Erlaubt“ heißt hier nur: die Gruppe ist in Peakr eingeschaltet (`health_consents`).
- **OAuth (Starter, derzeit aus):** Hier gibt es tatsächlich einen Bug im Connect-Flow. Garmin kennt keinen `scope`-Parameter; der Nutzer wählt die Berechtigungen auf Garmins Seite (`HEALTH_EXPORT`, `ACTIVITY_EXPORT`, `MCT_EXPORT` für Frauengesundheit …). `exchangeCode` liest die erteilten Berechtigungen nie aus (`grantedScopes` liest einen `scope`-Query, den Garmin nicht schickt). Die App bietet deshalb Gesundheitsgruppen an, auch wenn `HEALTH_EXPORT` nie erteilt wurde. Erst eine spätere `userPermissionsChange`-Push-Nachricht korrigiert das.

### Was Garmin auf unserem Tier (Personal) nicht liefert
- **VO2max als Tageswert:** nicht in der Spec. Garmin liefert nur `vO2MaxValue` pro Aktivität in der Aktivitätsliste. Das bleibt „wird von Garmin auf diesem Zugang nicht geliefert“, so wie heute (siehe Frage unten).
- **Training Readiness, Training Status, Hauttemperatur:** nicht in der Spec.
- **Atmung und Körperzusammensetzung** haben auf dem Personal-Tier **keinen eigenen Endpunkt**. Atmung kommt nur aus der Tageszusammenfassung, Körperzusammensetzung aus `weight/range`. Nur SpO2 hat einen eigenen Tagesendpunkt.
- **Fitnessalter:** Endpunkt vorhanden, liefert aber nur den aktuellen Wert pro Tag. Wird nicht gebaut (keine Karte dafür).

## Umsetzung (nach deiner Freigabe)

### A. Mapper und Pull (`supabase/functions/_shared/health/garmin-personal.ts`)
- `mapDailySummaries` auf das v2-Format umschreiben (`data[]` mit verschachtelten Gruppen, siehe oben). Der v1-Flachpfad bleibt als Rückfall erhalten (kostet nichts, schützt vor Formatwechseln). Intensitätsminuten bleiben `moderate + 2 × vigorous`, Body Battery kommt aus `bodyBattery.maxValue/minValue`.
- Neuer Mapper `mapSpo2Day` für `spo2acclimation/{day}` (`averageSpO2`). Er wird nur im **Recent-Fenster** abgefragt und nur für Tage, an denen die Tageszusammenfassung kein `pulseOx` hatte (höchstens 7 Aufrufe).
- `pull()` arbeitet pro Endpunkt. Nur 401/429 brechen ab, andere Fehler werden notiert und die übrigen Endpunkte laufen weiter. Schon geholte Datensätze werden immer zurückgegeben.
- `pull()` liefert zusätzlich `endpoints: Record<Endpoint, { at, status, records, error }>` für die Diagnose. `error` ist nur die Fehlerart, nie Garmins Antworttext, gemäß der bestehenden Regel.
- Alles läuft weiter über `GarminHealthProvider` (`provider.ts`), `onlyEnabled`, `storeHealthRecords` (gleiche Speicherung, Dedup über `sourceId`/Tag) und die Engine-Baseline. An der Dedup- und Baseline-Logik ändere ich nichts.
- **VO2max (deine Entscheidung):** Neuer Endpunkt `/activitylist-service/activities/search/activities` mit `startDate`/`endDate`, Mapper `mapActivityVo2max`. Pro Tag kommt Garmins `vO2MaxValue` der letzten Aktivität mit Wert hinein, `detail` enthält Aktivitätsname, Typ und ID. Nichts wird nachgerechnet. Die Karte zeigt „Garmin · aus deiner Aktivität vom …“. Für das Recency-Fenster gelten 30 Tage, weil der Wert nur bei passenden Aktivitäten entsteht. `vo2max` kommt in `DELIVERY.personal_key.provides` und wird über die Gruppe `activity` gesteuert. Die Aktivitäten selbst werden **nicht** gespeichert und nicht in die Aktivitäts-Pipeline übernommen.
- `fitness_age` bleibt aus `provides`. Die Kommentare zu den Quellen werden korrigiert (Spec 1.0.0 statt „nicht verifiziert“).

### B. Backfill mit manuellem Auslöser
- Migration `supabase/migrations/2026110900000x_health_diagnostics.sql`: In `health_sync_state` kommen `parser_version int`, `endpoints jsonb` (letzte Abfrage je Endpunkt) und `backfill_requested_at`.
- `pullFor` (`supabase/functions/garmin-health/index.ts`): Ist `parser_version` kleiner als die aktuelle Version, wird der Backfill automatisch zurückgesetzt (`backfill_before = null, backfill_done = false`). Damit holt der nächste Lauf nach dem Deploy das ganze Jahr neu. Die Schreibvorgänge sind idempotent.
- Neue Route `POST /garmin-health/backfill`: setzt den Backfill zurück und startet ihn (`EdgeRuntime.waitUntil`). In der App gibt es dafür den Button „Ältere Daten neu laden“ unter Insights → Health → Einstellungen (nur auf dem Pull-Tier).

### C. Leere Karten: vier Fälle pro Metrik
`apps/mobile/src/features/insights/health/model.ts` → `metricState` unterscheidet:
1. `not_permitted`: Gruppe nicht eingeschaltet, auf OAuth zusätzlich die Garmin-Berechtigung fehlt. Die Karte bleibt sichtbar und bekommt die Aktion „Einschalten“ (öffnet `/health/consent`) bzw. „bei Garmin erlauben“. Heute werden diese Karten versteckt.
2. `not_provided`: Weder Garmin-Zugang noch Health Connect liefern die Metrik. Der Text sagt es so klar wie heute bei VO2max und nennt die Quelle („Garmin liefert das auf diesem Zugang nicht“).
3. `no_data` mit **metrikspezifischem Grund**, ein i18n-Key pro Metrik:
   - Schlaf, HRV: „nur über Nacht getragen“.
   - Ruhepuls, Stress, Body Battery, Schritte, Intensitätsminuten: „laufend aufgezeichnet; seit X keine Daten. Die Uhr hat vermutlich nicht synchronisiert.“ Dazu der letzte Sync-Zeitpunkt.
   - SpO2: „nur wenn Pulsoximeter in den Uhr-Einstellungen aktiv ist“.
   - Atmung: „nur Uhren mit Atemfrequenz-Messung“.
   - Gewicht: „nur nach Wiegen mit verbundener Waage oder Eintrag in Garmin Connect“.
   - Ist der letzte Sync-Fehler gesetzt, steht der Fehler statt der Vermutung da.
4. `other_source` / `older`: Gibt es Werte aus Health Connect oder nur ältere Werte, zeigt die Karte den letzten Wert mit Quelle und Datum („72,4 kg · 14. Okt · Health Connect“) statt „nichts aufgezeichnet“.
- Das Recency-Fenster wird pro Metrik einstellbar: Gewicht und Körperzusammensetzung 30 Tage, alle anderen 7 Tage, als Konfig in `metrics.ts`.
- Den falschen Satz in `en.json` (`health.missing.no_data`) ersetze ich durch die Keys pro Metrik. Der Test, der jeden Health-String auf Diagnosebegriffe prüft, läuft weiter darüber.

### D. OAuth-Berechtigungen (Connect-Flow, Starter-Pfad)
- In `garmin.exchangeCode` (`supabase/functions/_shared/providers.ts`) nach dem Token-Tausch `GET https://apis.garmin.com/wellness-api/rest/user/permissions` aufrufen. Das ist unverifiziert und als solches markiert, gleiche Quelle wie `user/id`.
- Die Berechtigungen werden in `integrations` gespeichert; die bestehende `userPermissionsChange`-Behandlung aktualisiert sie.
- `/garmin-health/status` liefert `permitted: HealthGroup[]`. Der Consent-Screen sperrt Gruppen ohne Garmin-Berechtigung und erklärt das.
- Auf dem Personal Key gelten alle Gruppen als erlaubt.

### E. Diagnose-Screen (Developer-Flag)
- Neues Flag `healthDiagnostics` in `apps/mobile/src/config/feature-flags.ts`, aufgenommen in `personalBuildFlags`.
- Route `apps/mobile/app/dev/health-diagnostics.tsx`, erreichbar über einen Eintrag unter Health-Einstellungen, nur wenn das Flag an ist.
- Server: `GET /garmin-health/diagnostics` liefert pro Endpunkt letzte Abfrage, HTTP-Status, Anzahl Datensätze und letzten Fehler, außerdem Modus, Backfill-Stand und `parser_version`.
- Zusätzlich lokal pro Metrik: Anzahl Werte je Quelle (Garmin / Health Connect) und der jüngste Tag. Das liest das Health-Repository auf dem Gerät.

### F. Tests und Doku
- `packages/health/src/garmin-health.test.ts`: v2-Fixture nach Spec, eine v1-Fixture als Rückfall, SpO2-Tagesmapper, Fortsetzen nach einem Fehler, `endpoints`-Statistik, Reset über `parser_version`.
- `apps/mobile/src/features/insights/__tests__/health-screens.test.tsx` und die `model`-Tests: alle vier Fälle, Gewicht mit 30-Tage-Fenster, Quelle Health Connect.
- `docs/health-garmin.md`: Quellen, Endpunkt-Tabelle, „nicht auf diesem Tier“, Backfill-Button, Diagnose.
- `.claude/queue.md`: Eintrag und stündlicher Check-in laut CLAUDE.md. Der dort eingetragene Trigger gehört zu einem anderen Branch; ich prüfe ihn und lege ihn bei Bedarf neu an.

## Verification
- `pnpm lint && pnpm typecheck && pnpm test`, dazu `deno check` der Edge Functions.
- Auf deinem Konto nach Deploy (`supabase db push`, `supabase functions deploy garmin-health oauth watch-webhook`) und neuem Personal Build:
  1. Health → Einstellungen → „Ältere Daten neu laden“. Oder einfach warten: Die `parser_version` startet den Neu-Backfill von selbst.
  2. Den Diagnose-Screen öffnen. `dailySummaries` sollte HTTP 200 und mehr als 0 Datensätze zeigen.
  3. Erwartet: Ruhepuls, Stress, Body Battery, Schritte (jetzt von Garmin, Health Connect nur noch als Rückfall), Intensitätsminuten, sowie SpO2 und Atmung, falls die Uhr sie misst. Dazu ein Jahr Verlauf.
  4. Gewicht: Wert mit Datum, wenn du dich in den letzten 30 Tagen gewogen hast. Sonst „zuletzt am …“.
  5. VO2max zeigt Garmins Wert aus deiner letzten Aktivität mit VO2max, mit Datum. Das klappt bei Läufen oder Radfahrten mit Leistungsmesser in den letzten 30 Tagen.
- Unbestätigt bis zum ersten echten Lauf: die Einheit von `movement.floorsAscended.value` (Etagen oder Meter). Bitte einmal mit Garmin Connect vergleichen; `probe` zeigt die Rohdaten.
