import { create } from 'zustand';

/**
 * Extra lines for the daily reminder from other parts of the app (the Body add-on's measuring
 * day), keyed by date. The reminder appends a day's line to that day's text, so a day never gets
 * a second push (CLAUDE.md "Account & notifications"). The reminder itself knows nothing about
 * who adds a line – Teil A does not depend on the add-on.
 */

interface ReminderExtrasState {
  lines: Readonly<Record<string, string>>;
  setLines: (lines: Readonly<Record<string, string>>) => void;
}

export const useReminderExtras = create<ReminderExtrasState>((set) => ({
  lines: {},
  setLines: (lines) => set({ lines }),
}));
