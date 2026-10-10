// 导出 / 导入个人数据。校验与合并是纯函数，便于单测。
import type { Duel, Entry } from './types';
import { db, SCHEMA, type Meta } from './db';
import { today } from './date';

export interface Backup { app: 'crosscheck'; schema: number; exportedAt: string; content?: string; entries: Entry[]; duels: Duel[]; meta: Meta[] }

export function validateBackup(data: unknown): { ok: true; backup: Backup } | { ok: false; error: string } {
  const d = data as Partial<Backup> | null;
  if (!d || typeof d !== 'object') return { ok: false, error: '不是有效的备份文件' };
  if (d.app !== 'crosscheck') return { ok: false, error: '这不是 Crosscheck 的备份文件' };
  if (typeof d.schema !== 'number' || d.schema > SCHEMA) return { ok: false, error: '备份来自更新的版本，请先刷新 App' };
  if (!Array.isArray(d.entries) || !Array.isArray(d.duels ?? []) || !Array.isArray(d.meta ?? [])) return { ok: false, error: '备份文件结构不完整' };
  for (const e of d.entries) {
    if (!e || typeof e.itemId !== 'string' || !Array.isArray(e.thoughts) || !Array.isArray(e.actionHistory) || typeof e.updatedAt !== 'string')
      return { ok: false, error: '备份里有损坏的记录' };
    if (e.action && !['done', 'plan', 'na'].includes(e.action)) return { ok: false, error: '备份里有损坏的记录' };
    if (e.thoughts.some(t => typeof t?.text !== 'string' || typeof t?.at !== 'string')) return { ok: false, error: '备份里有损坏的记录' };
  }
  return { ok: true, backup: { duels: [], meta: [], ...d } as Backup };
}

// 合并：同一条以 updatedAt 较晚的为准，想法按日期合并去重
export function mergeEntries(local: Entry[], incoming: Entry[]): Entry[] {
  const map = new Map(local.map(e => [e.itemId, e]));
  for (const inc of incoming) {
    const cur = map.get(inc.itemId);
    if (!cur) { map.set(inc.itemId, inc); continue; }
    const base = inc.updatedAt > cur.updatedAt ? inc : cur;
    const seen = new Set<string>();
    const thoughts = [...cur.thoughts, ...inc.thoughts]
      .filter(t => { const k = `${t.at}\u0000${t.text}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => a.at.localeCompare(b.at));
    map.set(inc.itemId, { ...base, thoughts });
  }
  return [...map.values()];
}

export function mergeDuels(local: Duel[], incoming: Duel[]): Duel[] {
  const key = (d: Duel) => `${d.itemId}|${d.friendName}|${d.at}|${d.friendText}`;
  const seen = new Set(local.map(key));
  return [...local, ...incoming.filter(d => !seen.has(key(d))).map(({ id: _id, ...rest }) => rest as Duel)];
}

export async function makeBackup(content?: string): Promise<Backup> {
  const [entries, duels, meta] = await Promise.all([db.entries.toArray(), db.duels.toArray(), db.meta.toArray()]);
  return { app: 'crosscheck', schema: SCHEMA, exportedAt: new Date().toISOString(), content, entries, duels, meta };
}

export function download(backup: Backup) {
  const blob = new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `crosscheck-${today().replace(/-/g, '')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function exportNow(content?: string) {
  download(await makeBackup(content));
  await db.meta.put({ key: 'lastExportAt', value: today() });
}

// mode = merge | replace。replace 前先把当前数据导出一份
export async function importBackup(b: Backup, mode: 'merge' | 'replace', content?: string) {
  if (mode === 'replace') await exportNow(content);
  await db.transaction('rw', db.entries, db.duels, db.meta, async () => {
    if (mode === 'replace') {
      await Promise.all([db.entries.clear(), db.duels.clear()]);
      await db.entries.bulkPut(b.entries);
      await db.duels.bulkAdd(b.duels.map(({ id: _id, ...d }) => d as Duel));
      for (const m of b.meta) if (m.key !== 'installedAt' && m.key !== 'lastExportAt') await db.meta.put(m);
    } else {
      await db.entries.bulkPut(mergeEntries(await db.entries.toArray(), b.entries));
      const local = await db.duels.toArray();
      const add = mergeDuels(local, b.duels).slice(local.length);
      if (add.length) await db.duels.bulkAdd(add);
    }
  });
}
