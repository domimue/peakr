import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';

import migrations from '../../../drizzle/migrations';
import { db } from './client';

/** Applies pending Drizzle migrations to the local SQLite database on app start. */
export function useDatabaseMigrations() {
  return useMigrations(db, migrations);
}
