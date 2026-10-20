# WORKOUTS.md – Peakr workout library & selection rules

> Keep this file next to CLAUDE.md. It is the source of truth for **which workouts exist** and **how the engine picks them**.
> Workouts are **never generated freely by AI**. They come from these templates + deterministic rules + the user's data.
> All numbers are starting values; keep them in config/data files (`/packages/engine/src/library/*.ts`) so they can be tuned without code changes.

---

## 1. How the engine uses this library

```
Goal + phase + availability + level   →   weekly composition (§9)
weekly composition                    →   pick template types per slot
template type + user level            →   concrete workout (steps, targets, duration)
completed activity + RPE + HR          →   level up / hold / down (§10)
```

### Template schema (TypeScript, in `/packages/engine`)
```ts
type Sport = 'run' | 'bike' | 'swim' | 'strength' | 'brick' | 'xcski' | 'skitour' | 'snowshoe';
type Intensity = 'recovery' | 'easy' | 'moderate' | 'hard';      // drives "no hard days back to back"
type Phase = 'base' | 'build' | 'peak' | 'taper' | 'maintain';

interface WorkoutTemplate {
  id: string;                    // 'run.vo2.intervals'
  sport: Sport;
  type: string;                  // 'vo2_intervals'
  intensity: Intensity;
  phases: Phase[];               // where it may be used
  levels: WorkoutLevel[];        // ordered easy → hard (empty for duration-scaled types)
  durationScaled?: { minMin: number; maxMin: number };   // easy/long types scale by time instead of levels
  terrain?: 'any' | 'flat' | 'climb' | 'descent';        // route matching hint
  indoorAlternativeId?: string;  // weather check & travel mode
  legLoad: 'none' | 'light' | 'heavy';                   // for strength & spacing rules
  whyKey: string;                // i18n key for "Why this session?"
  prerequisites?: { minWeeksInPlan?: number; minLevelOf?: Record<string, number> };
}

interface WorkoutLevel {
  level: number;                 // 1..n
  warmup: Step[]; main: Block[]; cooldown: Step[];
  estLoad: number;               // computed by the load model, cached
}
type Target = { kind: 'hrZone' | 'paceZone' | 'powerZone' | 'cssOffset' | 'rpe'; value: string };
type Step = { durationSec?: number; distanceM?: number; target: Target; note?: string };
type Block = { repeat: number; steps: Step[] };
```
Every template must be exportable to FIT (all watch providers) and WorkoutKit (Apple Watch).

---

## 2. Intensity reference

| Zone | Running (HR) | Running pace label | Cycling (% FTP, if power) | Swimming | RPE (1–10) |
|---|---|---|---|---|---|
| Z1 | recovery | R-easy | < 55 % | very easy | 1–2 |
| Z2 | aerobic / easy | E | 56–75 % | CSS + 10–15 s/100 m | 3–4 |
| Z3 | tempo / marathon | M | 76–90 % | CSS + 5 s | 5–6 |
| Z3–4 | sweet spot / threshold | T | 88–105 % | CSS | 7 |
| Z4 | threshold+ / 10K | T+ | 95–105 % | CSS − 2–3 s | 7–8 |
| Z5 | VO2max / 3–5K | I | 106–120 % | CSS − 5 s | 9 |
| Z5+ | sprints / strides | R | > 120 % | max | 9–10 |

- Running targets: HR first on easy/long sessions, pace (grade-adjusted per CLAUDE.md "Terrain intelligence") on quality sessions; on hilly routes quality sessions may switch to time-based reps + RPE.
- Cycling: HR by default, power if the user has a power meter / smart trainer.
- Swimming: pace per 100 m from CSS test, RPE fallback.

---

## 3. Running

**Duration-scaled (no levels):**

| Template | Intensity | Prescription | Notes |
|---|---|---|---|
| `run.recovery` | recovery | 20–35 min Z1 | Day after hard sessions, travel mode |
| `run.easy` | easy | 25–75 min Z2 | Core of every plan; length from weekly volume |
| `run.commute` | easy | From user's commute settings, Z2, one step per leg | Placed first, never moved by the load rules (CLAUDE.md "Commuting") |
| `walk.commute` | recovery | From user's commute settings, Z1, one step per leg | Walking factor 0.5 in the load config |
| `run.easy_strides` | easy | Easy run + 4–8 × 20 s strides (fast, relaxed), 60–90 s walk/jog | From base week 3; counts as easy |
| `run.long` | moderate | 45–180 min Z2 (cap: 5K/10K 90, HM 135, M 180, fitness 100) | +10 min/week max, back −20 % in recovery weeks; hilly route preferred if terrain goal |
| `run.uphill_hike` | moderate | 30–150 min steep hiking/running Z2–3, +300 to +1500 m | Mountain/trail events only |

**Levelled:**

`run.progression` (moderate, base/build)
| L | Main set |
|---|---|
| 1 | 30 min: 25 Z2 → 5 Z3 |
| 2 | 35 min: 27 Z2 → 8 Z3 |
| 3 | 40 min: 30 Z2 → 10 Z3 |
| 4 | 45 min: 30 Z2 → 10 Z3 → 5 Z4 |
| 5 | 50 min: 30 Z2 → 15 Z3 → 5 Z4 |
| 6 | 60 min: 35 Z2 → 15 Z3 → 10 Z4 |

`run.fartlek` (hard, base/build) – time-based, ideal for hills and beginners
| L | Main set (on Z4 / off Z1–2) |
|---|---|
| 1 | 6 × 1′ / 1′ |
| 2 | 8 × 1′ / 1′ |
| 3 | 6 × 2′ / 1′ |
| 4 | 5 × 3′ / 1′30 |
| 5 | Pyramid 1-2-3-2-1′ / half recoveries |
| 6 | Pyramid 1-2-3-4-3-2-1′ / half recoveries |

`run.hills_short` (hard, base/build, terrain: climb 6–10 %) – power & economy
| L | Main set (walk/jog down recovery) |
|---|---|
| 1 | 6 × 30 s |
| 2 | 8 × 30 s |
| 3 | 8 × 45 s |
| 4 | 10 × 45 s |
| 5 | 8 × 60 s |
| 6 | 10 × 60 s |

`run.hills_long` (hard, build, terrain: climb 4–6 %) – strength endurance, Z4
| L | Main set (jog down recovery) |
|---|---|
| 1 | 4 × 2′ |
| 2 | 5 × 2′ |
| 3 | 4 × 3′ |
| 4 | 5 × 3′ |
| 5 | 4 × 4′ |
| 6 | 5 × 4′ |

`run.tempo` (hard, base L1–3 / build / peak) – threshold, T pace or Z3–4
| L | Main set (recovery jog) |
|---|---|
| 1 | 2 × 8′ T / 2′ |
| 2 | 3 × 8′ T / 2′ |
| 3 | 2 × 12′ T / 2′ |
| 4 | 20′ continuous T |
| 5 | 3 × 10′ T / 90 s |
| 6 | 25′ continuous T |
| 7 | 3 × 12′ T / 90 s |
| 8 | 2 × 20′ T / 2′ |

`run.vo2_intervals` (hard, build/peak; prerequisite: 4 weeks in plan) – I pace or Z5
| L | Distance version (track/flat) | Time version (hilly) | Recovery |
|---|---|---|---|
| 1 | 6 × 400 m | 6 × 1′30 | 90 s jog |
| 2 | 8 × 400 m | 8 × 1′30 | 90 s |
| 3 | 5 × 800 m | 5 × 3′ | 2′ |
| 4 | 6 × 800 m | 6 × 3′ | 2′ |
| 5 | 5 × 1000 m | 5 × 3′45 | 2′30 |
| 6 | 6 × 1000 m | 6 × 3′45 | 2′30 |
| 7 | 5 × 1200 m | 5 × 4′30 | 3′ |
| 8 | 4 × 1600 m | 4 × 6′ | 3′ |

`run.race_pace` (hard, peak; HM/M goals) – inside an easy run or long run
| L | HM goal | Marathon goal |
|---|---|---|
| 1 | 3 km HMP | 5 km MP in long run |
| 2 | 2 × 3 km HMP / 3′ | 8 km MP |
| 3 | 2 × 4 km HMP / 3′ | 10 km MP |
| 4 | 3 × 4 km HMP / 3′ | 2 × 6 km MP / 2 km easy |
| 5 | 2 × 5 km HMP / 3′ | 14 km MP |
| 6 | 10 km HMP continuous | 16–18 km MP |

`run.downhill` (moderate, build; mountain events only; legLoad heavy-eccentric)
| L | Main set |
|---|---|
| 1 | 4 × 2′ controlled descent in an easy run |
| 2 | 6 × 2′ |
| 3 | 3 × 5′ |
| 4 | 15′ continuous descent |

Indoor alternatives: easy/long → treadmill same time (1 % incline, or matched to planned gradient); hills → treadmill 6–8 %; intervals/tempo → treadmill same structure. The treadmill is adapted, not copied: heart rate leads (it runs higher indoors – fan), the pace limit is shown as km/h, reps start once the belt is at speed, runs ≥ 75 min may be split in two halves, and runs > 90 min or with long descents (no decline on a treadmill) offer "move to another day" first.

---

## 4. Cycling

**Duration-scaled:**

| Template | Intensity | Prescription |
|---|---|---|
| `bike.recovery` | recovery | 30–45 min Z1, high cadence |
| `bike.endurance` | easy | 45–120 min Z2 |
| `bike.long` | moderate | 90–360 min Z2, terrain per goal (gran fondo: elevation progression) |
| `bike.commute` | easy | From user's commute settings, Z1–2 (see CLAUDE.md "Commuting") |

**Levelled:**

`bike.tempo` (moderate, base/build) – Z3
| L | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Main | 2 × 10′ / 5′ | 2 × 15′ / 5′ | 3 × 15′ / 5′ | 2 × 20′ / 5′ | 2 × 25′ / 5′ | 2 × 30′ / 5′ |

`bike.sweetspot` (hard, base/build) – 88–94 % FTP / upper Z3
| L | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Main | 3 × 8′ / 4′ | 3 × 10′ / 4′ | 3 × 12′ / 4′ | 2 × 20′ / 5′ | 3 × 15′ / 5′ | 2 × 25′ / 5′ | 3 × 20′ / 5′ |

`bike.threshold` (hard, build/peak) – 95–105 % FTP / Z4
| L | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Main | 4 × 5′ / 3′ | 3 × 8′ / 4′ | 4 × 8′ / 4′ | 3 × 10′ / 5′ | 2 × 15′ / 5′ | 3 × 12′ / 5′ | 2 × 20′ / 5′ |

`bike.vo2` (hard, build/peak) – 106–120 % / Z5
| L | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Main | 5 × 2′ / 2′ | 6 × 2′ / 2′ | 5 × 3′ / 3′ | 6 × 3′ / 3′ | 5 × 4′ / 4′ | 4 × 5′ / 5′ |

`bike.climb` (hard, build; terrain: climb, or trainer resistance)
| L | Main set |
|---|---|
| 1 | 3 × 5′ Z3 seated |
| 2 | 3 × 8′ Z3 seated |
| 3 | 3 × 8′ Z4, 1′ standing every 4′ |
| 4 | 3 × 10′ Z4 |
| 5 | 2 × 15′ Z4 |
| 6 | 3 × 12′ Z4 alternating seated/standing |

`bike.cadence` (easy, base) – inside an endurance ride
| L | Main set |
|---|---|
| 1 | 6 × 1′ at 105+ rpm / 2′ easy |
| 2 | 8 × 1′ at 110+ rpm |
| 3 | 4 × 5′ low cadence 55–65 rpm Z3 (skip if knee issues) |
| 4 | Mix of 2 and 3 |

Indoor alternative: any bike session → indoor trainer, same structure (endurance capped at 90 min indoors unless user allows more).

---

## 5. Swimming

Distances adapt to pool length (25 m / 50 m); open water uses time.

| Template | Intensity | Purpose |
|---|---|---|
| `swim.technique` | easy | Drills, kick, pull; for beginners and as warm-up blocks |
| `swim.aerobic` | easy | Continuous / long reps at CSS + 10 s |
| `swim.css` | hard | Threshold reps at CSS |
| `swim.speed` | hard | Short fast reps, long rest |
| `swim.openwater` | moderate | Sighting, drafting, continuous swim (summer, OW goals) |

`swim.technique`
| L | Total | Content |
|---|---|---|
| 1 | 600 m | 12 × 25 drill (catch-up, side kick) / 30 s, 4 × 50 easy |
| 2 | 900 m | + kick 4 × 50 with board |
| 3 | 1200 m | drills + 4 × 100 easy |
| 4 | 1500 m | drills + 6 × 100 easy + pull buoy 200 |

`swim.aerobic`
| L | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Main | 4 × 100 / 20 s | 6 × 100 / 20 s | 4 × 200 / 30 s | 3 × 300 / 30 s | 2 × 500 / 45 s | 1 × 1500 |

`swim.css` (prerequisite: can swim 400 m continuously)
| L | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Main | 8 × 50 / 15 s | 6 × 100 / 15 s | 8 × 100 / 15 s | 10 × 100 / 15 s | 5 × 200 / 20 s | 4 × 300 / 20 s | 3 × 400 / 30 s |

`swim.speed`
| L | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| Main | 8 × 25 fast / 30 s | 12 × 25 fast / 30 s | 8 × 50 CSS − 5 s / 30 s | 10 × 50 CSS − 5 s / 30 s |

`swim.openwater` (L1 15 min continuous + 6 × sighting, L2 25 min, L3 35 min with 3 × 3′ race effort, L4 45 min + drafting practice)

Weather: outdoor swim → pool alternative. Pool closed / travel: swim replaced by bike or run of equivalent load, or dryland band work (10 min).

---

## 6. Multisport & winter

`brick` (hard, build/peak; triathlon & duathlon)
| L | Bike | Run straight after |
|---|---|---|
| 1 | 45′ Z2 | 10′ easy |
| 2 | 60′ Z2 | 15′ easy |
| 3 | 75′ incl. 2 × 10′ race effort | 20′ incl. 10′ race pace |
| 4 | 90′ incl. 2 × 15′ race effort | 30′ incl. 15′ race pace |
| 5 | Race simulation: 70 % of race bike duration | 40 % of race run duration |

Winter (see CLAUDE.md "Winter sports"):

| Template | Intensity | Prescription |
|---|---|---|
| `xcski.easy` | easy | 45–120 min Z2 (variant of run.easy / run.long / bike.endurance) |
| `xcski.intervals` | hard | L1 5 × 3′ Z4 / 2′ … L4 5 × 6′ Z4 / 3′ (variant of tempo/threshold in base) |
| `skitour.ascent` | moderate | +400 to +1500 m at Z2–3; load includes ascent; descent counted as low load |
| `snowshoe.easy` | easy | 45–150 min Z2, variant of long run |

Key quality sessions for a race goal stay in the target sport (CLAUDE.md).

---

## 7. Benchmarks (tests)

| Test | When | Updates |
|---|---|---|
| Run: 5K time trial or 30-min run (avg HR of last 20 min = LTHR) | start of plan (optional), every 6–8 weeks in base/build | pace zones, LTHR zones, race prediction |
| Swim: CSS test 400 m + 200 m | start, every 6–8 weeks | CSS pace zones |
| Bike: 20-min test (FTP ≈ 95 %) or ramp test on trainer | if power available | power zones |
| Resting HR | continuously from Health Connect/HealthKit/watch | Karvonen zones |

Tests are optional and replace a quality session in that week; the app also estimates fitness passively (pace or power at a given HR, grade-adjusted).

---

## 8. Strength – freedom of choice

Strength is a first-class sport. The user chooses **how** they want to do strength; the engine only decides **when** and **how much** so it fits the endurance plan.

### 8.1 Strength modes (user picks one in onboarding / Profile, can change anytime)

| Mode | What the user gets |
|---|---|
| **Peakr programme** | A ready programme that follows the endurance phases (§8.4) |
| **My split** | User picks a split, the engine fills the days: Full body, Upper/Lower, **Push/Pull/Legs**, Body-part split (Chest, Back, Shoulders, Arms, Legs), Glutes & legs focus, Runner's strength, Core & mobility, Kettlebell/home dumbbells, Bodyweight/hotel |
| **My own routines** | User builds routines (exercises, sets, reps/weight or time, rest) or imports them (Hevy); the engine schedules them |
| **Free / log only** | No planned strength sessions; user logs whatever they do (detailed or quick log). Logged sessions still count towards load and spacing rules |

Each mode can be combined with a **strength priority**: `endurance first` (default when a race goal exists), `balanced`, `strength first` (keeps strength volume during build/peak, endurance adapts instead).

### 8.2 Splits (templates for "My split")

| Split | Days/week | Session rotation | legLoad per session |
|---|---|---|---|
| Full body | 2–3 | A / B (/ C) | light–heavy |
| Upper / Lower | 2–4 | Upper, Lower | Upper none, Lower heavy |
| Push / Pull / Legs | 3–6 | Push, Pull, Legs | Push none, Pull none (light if deadlifts), Legs heavy |
| Body-part | 4–5 | Chest, Back, Shoulders, Arms, Legs | only Legs heavy |
| Glutes & legs focus | 2–3 | Glutes A, Legs B (+ Upper) | heavy |
| Runner's strength | 2 | Single-leg, hips, calves, core | light–heavy |
| Core & mobility | 2–4 | Core, Mobility | none |
| Kettlebell / home DB | 2–3 | Full body A/B | light |
| Bodyweight / hotel | 2–3 | Full body A/B | light |

### 8.3 Scheduling rules with endurance (apply to all modes)

- **Heavy-leg sessions** (squat, deadlift, heavy lunges, leg press, plyometrics; any user routine whose exercises are tagged `legLoad: heavy`): not on the day before a long session or key quality session, not the day after a long run with a long descent. Best placed on the **same day as a hard endurance session** (after it, ≥ 6 h apart if possible) or after an easy day. They count as "hard" for the no-back-to-back rule.
- **Upper-body / push / pull / core / mobility**: can go anywhere, also on the same day as easy or long sessions; they count as "easy" for spacing.
- **Phase scaling for leg volume** (endurance first): base 100 %, build 80 %, peak 50 %, taper 0 % heavy legs (upper ≤ 30 %), recovery weeks −40 %. `balanced` uses 100/90/70/30; `strength first` keeps 100 % except taper week.
- If the user's split needs more days than available, the engine merges sessions (e.g. Push + Pull → Upper) and says so.
- Imported or logged sessions without exercise detail are treated as `legLoad: light` unless the user marks them "legs".

### 8.4 Peakr programme parameters

| Phase | Focus | Sets × reps | Effort | Frequency |
|---|---|---|---|---|
| Base | General strength / hypertrophy | 3 × 8–12 | RPE 7–8 | 2× |
| Build | Max strength + plyometrics (runners) | 3–4 × 4–6 + 3 × 6–10 jumps | RPE 8 | 1–2× |
| Peak | Maintenance | 2 × 3–5 | RPE 7 | 1× |
| Taper | Mobility & core only | – | easy | 0–1× |
| Maintain / fitness / weight loss | Balanced | 3 × 8–12 | RPE 7–8 | 2–3× |

### 8.5 Progression (all strength modes with planned sets)

- **Double progression**: each exercise has a rep range; when all sets reach the top of the range at RPE ≤ 8, increase weight by 2.5–5 % (upper) or 5 % (lower) next time; otherwise add reps.
- Bodyweight exercises progress by reps, tempo or harder variation (e.g. push-up → feet elevated → archer).
- Deload in recovery weeks: −40 % sets, same weights.
- After a pause: resume at 80–90 % of previous weights.

### 8.6 Exercise library (starter set, extendable; users can add custom exercises)

Fields: `id, name, pattern, muscles[], equipment[] (barbell, dumbbell, kettlebell, machine, cable, band, bodyweight, box), legLoad, unilateral, howToKey, videoUrl?`

| Pattern | Exercises |
|---|---|
| Squat | Back squat, Front squat, Goblet squat, Leg press, Bodyweight squat, Split squat, Bulgarian split squat |
| Hinge | Deadlift, Romanian deadlift, Single-leg RDL, Hip thrust, Glute bridge, Kettlebell swing, Good morning |
| Lunge / single leg | Walking lunge, Reverse lunge, Step-up, Lateral lunge, Pistol squat progression |
| Calf / foot | Standing calf raise, Bent-knee calf raise, Tibialis raise, Single-leg hops in place |
| Push horizontal | Bench press, Dumbbell press, Incline press, Push-up, Dips |
| Push vertical | Overhead press, Dumbbell shoulder press, Pike push-up, Lateral raise |
| Pull horizontal | Barbell row, Dumbbell row, Seated cable row, Inverted row, Face pull |
| Pull vertical | Pull-up, Chin-up, Lat pulldown, Band-assisted pull-up |
| Arms | Biceps curl, Hammer curl, Triceps pushdown, Overhead triceps extension |
| Core | Plank, Side plank, Dead bug, Bird dog, Pallof press, Hanging knee raise, Copenhagen plank, Ab wheel |
| Plyometrics | Pogo hops, Box jump, Broad jump, Bounding, A-skips |
| Mobility | Hip flexor stretch, Ankle dorsiflexion, Thoracic rotation, 90/90 hips, Hamstring floss |

### 8.7 Logging & imports

- **Detailed log**: sets × reps × weight (or time), RPE per set or per session; from planned routines pre-filled.
- **Quick log**: duration + session RPE + "legs yes/no".
- **Watch**: strength activities from Garmin (Activity API, incl. exercise sets when the watch recorded them), COROS, Suunto, Apple Watch (HealthKit) arrive via the normal import pipeline. Pushing strength workouts to watches: Garmin and Apple (WorkoutKit) where supported; COROS push does not support strength → shown in the app only.
- **Hevy**: Hevy's public API uses a **personal API key** (Hevy Pro required, no OAuth). User pastes the key in Profile → Connections → Hevy; stored encrypted server-side; Edge Function polls workouts (no webhooks documented) → imported with exercises, sets, weights; Hevy routines can be imported as "My own routines". Writing routines back to Hevy only if the API supports it (verify before building).
- **Strava** `WeightTraining` / `Workout` activities: duration + HR only → quick-log style.
- **Health Connect / HealthKit** strength sessions: duration + calories → quick-log style.
- Deduplication as in CLAUDE.md (same start ±5 min); a detailed source (Hevy, Garmin with sets) wins over a summary source.

---

## 9. Weekly composition (which slots each week)

Slots are filled in this priority: long → key quality → second quality → strength → easy → commute already placed first (CLAUDE.md).

### Running goals (sessions = run sessions per week)
| Sessions | Base | Build | Peak | Taper week |
|---|---|---|---|---|
| 3 | Long, Easy+strides, Fartlek/Hills short | Long, Quality A, Easy | Long (with race pace), Quality A, Easy | Short easy, 1 short sharp session, rest |
| 4 | Long, Easy, Easy+strides, Fartlek/Hills short | Long, Quality A, Easy, Easy+strides | Long, Quality A, Race pace, Easy | 3 short runs incl. strides |
| 5–6 | Long, 3–4 Easy (strides), 1 Fartlek/Hills | Long, Quality A, Quality B, Easy × 2–3 | Long, Quality A, Race pace, Easy × 2–3 | volume −40 to −60 % |

- Quality A = Tempo (alternating with Hills long); Quality B = VO2 intervals (10K/5K emphasis) or Progression (HM/M emphasis).
- Base: no VO2 intervals before week 4; Tempo max L3.

### Get fitter / lose weight
- 80–90 % of endurance time in Z1–2. From week 4: one light quality session (Fartlek L1–4, Tempo L1–3, Sweet spot L1–3) every week, alternating sports.
- Strength 2–3× per week in the user's chosen mode.
- Long session every week (run or bike, user's preference), modest cap.
- Commutes count as easy sessions.

### Cycling goals
| Phase | Composition |
|---|---|
| Base | Long ride, Endurance × 1–2, Sweet spot or Tempo, Cadence drills in endurance |
| Build | Long ride (elevation progression), Threshold, VO2 or Climb, Endurance |
| Peak | Long ride race-like, Threshold/Climb, short VO2, easy |
| Taper | 2 short rides with openers, rest |

### Triathlon / multisport
- Time split by goal and weakest sport (CLAUDE.md), each sport gets: 1 key session + 1–2 easy/technique sessions.
- Build/peak: 1 brick per week (or every 2 weeks for sprint distance).
- Swim beginners: technique-first (swim.technique L1–4) before CSS work.

---

## 10. Level selection & progression

**Start level** (per template type) from the quiz:
| Profile | Start level |
|---|---|
| Beginner (< 6 months regular, or cannot run 30 min continuously) | 1 |
| Intermediate (regular for 6+ months) | 3 |
| Advanced (race history, ≥ 4 sessions/week) | 5 |
Race time / CSS / FTP adjust zones, not levels.

**Start level from recent activities** (optional Strava baseline, CLAUDE.md "Baseline from past activities"): the class is derived **per sport** from the last 60 days – sessions/week, weekly minutes and longest session must all reach the thresholds (`planConfig.baseline.levels`), e.g. run intermediate ≥ 2/week, ≥ 90 min, ≥ 30 min; advanced ≥ 4/week, ≥ 240 min, ≥ 75 min. Below the minimum number of activities the quiz answer stays. The user can change every class on the summary screen. The same baseline sets week 1 to the current weekly load (within the capacity of the availability, never below the beginner share) and the first long session to the typical weekly longest session.

Which baseline activities count per derived value (reference data only – never history, load, records or plan completion):
| Value | Counts | Left out | Minimum |
|---|---|---|---|
| Volume, frequency, longest session | all, incl. indoor/treadmill, manual, without HR | – | 3 activities over ≥ 2 full weeks |
| Terrain (gain per km) | outdoor run/bike with distance and gain | indoor, manual | 3 |
| Easy pace (grade-adjusted) | outdoor runs ≥ 1 km; easy = avg HR ≤ top of Z2 (Strava zones if the user set them), otherwise the slowest third | treadmill, manual, races | 4 runs, 3 easy |
| Pace–HR relation (Theil–Sen) | outdoor runs ≥ 1 km with HR | treadmill, manual, races | 4 |
| HRmax | 2nd highest max HR; used only above the age estimate | manual | 3 |
| LTHR | hard runs (else rides): 95 % of the best 20 min, or avg HR of 20–60 min efforts ≥ 85 % HRmax | manual, no HR, swims | 2 efforts |
| CSS (estimate) | fastest third of swims ≥ 400 m × 0.97 | manual | 3 |
| Weekly load | all (no HR → Zone 2), trimmed mean of the last 4 full weeks | – | as volume |
| Resting HR | not available from Strava – quiz/zone settings only | | |

Preselection: everything is ticked except Strava races and sessions far longer than the rest of the sport (> median + 3 × MAD and > 2.5 × median). Hard sessions stay ticked because LTHR needs them. The user's own entries always beat derived values.

**After each completed session of a levelled type:**
- Completed, targets met (HR/pace/power within range ≥ 80 % of work time), RPE ≤ planned → **+1 level** next time (max +1 per week per type).
- Completed but RPE above planned or targets missed → **hold**.
- Not completed / skipped twice in a row → **−1 level**.
- Recovery week → that week uses **−1 level**, then continues.
- Pause: ≤ 7 days → −1 level; ≤ 14 days → −2 levels; longer → back to base rules (CLAUDE.md).
- A level may never be raised in a way that breaks the weekly +10 % load cap; if it would, hold.

**Passive fitness updates**: rising pace/power at the same HR (grade-adjusted, 3+ comparable sessions) → update zones and race prediction; notify user with the reason.

---

## 11. Hard / easy classification (for "no hard days back to back")

| Hard | Easy / recovery |
|---|---|
| Any template with intensity `hard`; `run.long` ≥ 90 min; `bike.long` ≥ 3 h; long/steep hilly sessions (≥ 25 m gain per km running, ≥ 15 m per km cycling); strength with `legLoad: heavy`; brick | `easy`, `recovery`, upper-body/core/mobility strength, commutes, technique swims |

`moderate` sessions count as hard if the day before or after already has a hard session **and** the user is a beginner; otherwise easy.

---

## 12. "Why this session?" texts

Every template has a `whyKey` with a short explanation (1–2 sentences, plain language) plus a dynamic sentence from the scheduler, e.g. "Strength comes on Wednesday, so today stays easy." Keys live in `locales/en.json` under `why.*`. English first.
