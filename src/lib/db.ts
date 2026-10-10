import Dexie, { type Table } from 'dexie';
import type { Action, Compare, Duel, Entry } from './types';
import { today } from './date';

export interface Meta { key: string; value: unknown }

class CrosscheckDB extends Dexie {
  entries!: Table<Entry, string>;
  duels!: Table<Duel, number>;
  meta!: Table<Meta, string>;
  constructor() {
    super('crosscheck');
    this.version(1).stores({
      entries: 'itemId, action, compare, updatedAt',
      duels: '++id, itemId, at',
      meta: 'key',
    });
  }
}
export const db = new CrosscheckDB();
export const SCHEMA = 1;

export async function getMeta<T>(key: string, def: T): Promise<T> {
  const m = await db.meta.get(key);
  return (m?.value as T) ?? def;
}
export const setMeta = (key: string, value: unknown) => db.meta.put({ key, value });

const blank = (itemId: string): Entry => ({ itemId, thoughts: [], actionHistory: [], updatedAt: today() });

async function update(itemId: string, fn: (e: Entry) => void) {
  await db.transaction('rw', db.entries, async () => {
    const e = (await db.entries.get(itemId)) ?? blank(itemId);
    fn(e);
    e.updatedAt = today();
    await db.entries.put(e);
  });
}

export const addThought = (itemId: string, text: string) =>
  update(itemId, e => { e.thoughts.push({ text: text.trim(), at: today() }); e.skipped = false; });

export const skip = (itemId: string) => update(itemId, e => { if (!e.thoughts.length) e.skipped = true; });

export const setCompare = (itemId: string, c: Compare | undefined) => update(itemId, e => { e.compare = c; });

export const setAction = (itemId: string, a: Action | undefined) =>
  update(itemId, e => {
    if (e.action === a) return;
    e.actionHistory.push({ action: e.action ?? null, at: e.actionAt ?? today() });
    e.action = a;
    e.actionAt = a ? today() : undefined;
  });

export const setNote = (itemId: string, note: string) =>
  update(itemId, e => { e.note = note.trim() || undefined; e.noteAt = note.trim() ? today() : undefined; });

// 第一次打开的日期：此前已有的条目不算「新增」
export async function ensureInstallDate(): Promise<string> {
  let d = await getMeta<string | null>('installedAt', null);
  if (!d) { d = today(); await setMeta('installedAt', d); }
  return d;
}
