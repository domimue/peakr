import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Simple key/value store for local app settings. Real domain tables follow in later phases. */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
