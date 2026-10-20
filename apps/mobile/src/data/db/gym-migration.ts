import { migrateStrengthData } from '@peakr/engine';
import { desc, eq } from 'drizzle-orm';

import { newId } from '../ids';
import { writeImport } from '../repositories/gym-repository';
import { db } from './client';
import { appSettings, customExercises, routines, strengthLogs } from './schema';

/** Set once the Phase 3 strength data has been copied into the gym tables. */
export const GYM_MIGRATION_KEY = 'gym_migration_v1';

/**
 * Copies Phase 3 strength data (routines, custom exercises, logs) into the gym tables, once, in a
 * single transaction: either everything arrives or nothing changes and it runs again next start.
 * The old tables are left untouched as a fallback.
 */
export function migrateGymData(): void {
  db.transaction((tx) => {
    const done = tx.select().from(appSettings).where(eq(appSettings.key, GYM_MIGRATION_KEY)).get();
    if (done) return;
    const data = migrateStrengthData(
      {
        // Phase 3 listed routines by last change; keep that order.
        routines: tx
          .select()
          .from(routines)
          .orderBy(desc(routines.updatedAt))
          .all()
          .map(({ id, name, durationMin, exercises }) => ({ id, name, durationMin, exercises })),
        customExercises: tx
          .select()
          .from(customExercises)
          .orderBy(customExercises.createdAt)
          .all()
          .map((r) => r.data),
        logs: tx.select().from(strengthLogs).all(),
      },
      newId,
    );
    writeImport(tx, { ...data }, Date.now());
    tx.insert(appSettings)
      .values({ key: GYM_MIGRATION_KEY, value: String(Date.now()) })
      .run();
  });
}
