import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useEffect, useState } from 'react';

import migrations from '../../../drizzle/migrations';
import { db } from './client';
import { migrateGymData } from './gym-migration';

/**
 * Applies pending Drizzle migrations to the local SQLite database on app start, then the one-time
 * data migration of Phase 3 strength data into the gym tables.
 */
export function useDatabaseMigrations() {
  const schema = useMigrations(db, migrations);
  const [data, setData] = useState<{ done: boolean; error?: Error }>({ done: false });
  useEffect(() => {
    if (!schema.success) return;
    // Runs right after the schema migrations, before the app shows any data.
    void Promise.resolve()
      .then(migrateGymData)
      .then(
        () => setData({ done: true }),
        (e: unknown) =>
          setData({ done: false, error: e instanceof Error ? e : new Error(String(e)) }),
      );
  }, [schema.success]);
  return { success: schema.success && data.done, error: schema.error ?? data.error };
}
