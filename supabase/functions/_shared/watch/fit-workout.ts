import { Decoder, Encoder, Profile, Stream } from '@garmin/fitsdk';

import {
  speedFromPace,
  speedFromSwimPace,
  watchName,
  type WatchIntensity,
  type WatchNode,
  type WatchSport,
  type WatchStep,
  type WatchTarget,
  type WatchWorkout,
} from './model.ts';

/**
 * Structured workout as a .FIT workout file, written with Garmin's official FIT JavaScript SDK
 * (`@garmin/fitsdk`). The user saves/shares the file and imports it into Garmin Connect (or copies
 * it to the watch's NEW_FILES folder); other brands that read FIT workouts take it the same way.
 * The same code runs on the device and in an Edge Function.
 *
 * Units written to the file (FIT profile): step duration in ms (time) or cm (distance); a custom
 * heart-rate target is bpm + 100 (below 100 the value would mean "zone"); a custom speed target is
 * mm/s.
 */

const MESG = {
  fileId: Profile.MesgNum.FILE_ID as number,
  workout: Profile.MesgNum.WORKOUT as number,
  workoutStep: Profile.MesgNum.WORKOUT_STEP as number,
};

const SPORT: Record<WatchSport, string> = { run: 'running', bike: 'cycling', swim: 'swimming' };

const INTENSITY: Record<WatchIntensity, string> = {
  warmup: 'warmup',
  active: 'active',
  interval: 'interval',
  recovery: 'recovery',
  rest: 'rest',
  cooldown: 'cooldown',
};

/** FIT "heart rate" values from 0 to 100 mean a zone, so a custom bpm is stored +100. */
const HR_OFFSET = 100;

function target(t: WatchTarget): Record<string, unknown> {
  switch (t.type) {
    case 'open':
      return { targetType: 'open', targetValue: 0 };
    case 'heartRate':
      return {
        targetType: 'heartRate',
        targetValue: 0,
        customTargetValueLow: Math.round(t.lowBpm) + HR_OFFSET,
        customTargetValueHigh: Math.round(t.highBpm) + HR_OFFSET,
      };
    case 'pace':
      return speedTarget(speedFromPace(t.slowestSecPerKm), speedFromPace(t.fastestSecPerKm));
    case 'swimPace':
      return speedTarget(
        speedFromSwimPace(t.slowestSecPer100m),
        speedFromSwimPace(t.fastestSecPer100m),
      );
  }
}

const speedTarget = (lowMs: number, highMs: number) => ({
  targetType: 'speed',
  targetValue: 0,
  customTargetValueLow: Math.round(lowMs * 1000),
  customTargetValueHigh: Math.round(highMs * 1000),
});

function duration(step: WatchStep): Record<string, unknown> {
  if (step.durationSec !== undefined && step.durationSec > 0) {
    return { durationType: 'time', durationValue: Math.round(step.durationSec * 1000) };
  }
  if (step.distanceM !== undefined && step.distanceM > 0) {
    return { durationType: 'distance', durationValue: Math.round(step.distanceM * 100) };
  }
  return { durationType: 'open', durationValue: 0 };
}

/** FIT step messages in order; a repeat becomes its steps followed by one "repeat" step. */
export function fitSteps(nodes: readonly WatchNode[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const add = (message: Record<string, unknown>) =>
    out.push({ ...message, messageIndex: out.length });
  for (const node of nodes) {
    if (node.kind === 'step') {
      add({
        ...(node.name ? { wktStepName: watchName(node.name) } : {}),
        ...duration(node),
        ...target(node.target),
        intensity: INTENSITY[node.intensity],
        ...(node.note ? { notes: node.note.slice(0, 50) } : {}),
      });
      continue;
    }
    const first = out.length;
    for (const step of node.steps) {
      add({
        ...(step.name ? { wktStepName: watchName(step.name) } : {}),
        ...duration(step),
        ...target(step.target),
        intensity: INTENSITY[step.intensity],
        ...(step.note ? { notes: step.note.slice(0, 50) } : {}),
      });
    }
    add({
      durationType: 'repeatUntilStepsCmplt',
      durationValue: first,
      targetType: 'open',
      targetValue: Math.max(1, node.count),
    });
  }
  return out;
}

/** Encodes the workout as the bytes of a .FIT workout file. */
export function encodeWorkoutFit(workout: WatchWorkout): Uint8Array {
  const steps = fitSteps(workout.steps);
  const encoder = new Encoder();
  // The SDK's `Mesg` type only lists a few fields; the messages are plain field maps.
  const fileId: Record<string, unknown> = {
    type: 'workout',
    manufacturer: 'development',
    product: 0,
    // Stable per workout so re-importing the same file replaces instead of duplicating.
    serialNumber: stableSerial(workout.id),
    timeCreated: new Date(`${workout.date}T00:00:00Z`),
  };
  const header: Record<string, unknown> = {
    sport: SPORT[workout.sport],
    capabilities: 0,
    numValidSteps: steps.length,
    wktName: watchName(workout.name, 40),
    ...(workout.sport === 'swim' && workout.poolLengthM
      ? { subSport: 'lapSwimming', poolLength: workout.poolLengthM, poolLengthUnit: 'metric' }
      : {}),
  };
  encoder.onMesg(MESG.fileId, fileId);
  encoder.onMesg(MESG.workout, header);
  for (const step of steps) encoder.onMesg(MESG.workoutStep, step);
  return encoder.close();
}

function stableSerial(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export interface DecodedWorkoutFit {
  name: string | null;
  sport: string | null;
  poolLengthM: number | null;
  steps: Record<string, unknown>[];
  errors: unknown[];
}

/** Reads a workout file back (tests, and a sanity check before sharing a file). */
export function decodeWorkoutFit(bytes: Uint8Array): DecodedWorkoutFit {
  const decoder = new Decoder(Stream.fromByteArray(Array.from(bytes)));
  const { messages, errors } = decoder.read();
  const workout = (messages.workoutMesgs as Record<string, unknown>[] | undefined)?.[0];
  return {
    name: (workout?.wktName as string | undefined) ?? null,
    sport: (workout?.sport as string | undefined) ?? null,
    poolLengthM: (workout?.poolLength as number | undefined) ?? null,
    steps: (messages.workoutStepMesgs as Record<string, unknown>[] | undefined) ?? [],
    errors,
  };
}

export function isWorkoutFit(bytes: Uint8Array): boolean {
  const stream = Stream.fromByteArray(Array.from(bytes));
  if (!Decoder.isFIT(stream)) return false;
  const decoder = new Decoder(Stream.fromByteArray(Array.from(bytes)));
  return decoder.checkIntegrity();
}
