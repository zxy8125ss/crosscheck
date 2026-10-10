// 进度统计。纯函数。不同口径分开算，不合成总分。
import type { Entry, LightItem, Tags } from './types';
import { LENSES } from './types';
import { month } from './date';

export interface LensStat { total: number; na: number; done: number; plan: number; thought: number; same: number; new: number; doubt: number }
const empty = (): LensStat => ({ total: 0, na: 0, done: 0, plan: 0, thought: 0, same: 0, new: 0, doubt: 0 });

export function computeStats(items: LightItem[], entries: Map<string, Entry>) {
  const all = empty();
  const byLens = Object.fromEntries(LENSES.map(l => [l, empty()])) as Record<Tags['lens'], LensStat>;
  for (const it of items) {
    const e = entries.get(it.id);
    for (const s of [all, byLens[it.tags.lens]]) {
      s.total++;
      if (!e) continue;
      if (e.action) s[e.action]++;
      if (e.thoughts.length) s.thought++;
      if (e.compare) s[e.compare]++;
    }
  }
  return { all, byLens };
}

// 完成率 = 做到了 ÷（总数 − 不适用）
export const rate = (s: LensStat) => (s.total - s.na > 0 ? s.done / (s.total - s.na) : 0);

// 每月：新增「做到了」数、新写想法数；从第一次使用的月份到本月
export function monthly(entries: Entry[], now: string) {
  const done = new Map<string, number>(), thoughts = new Map<string, number>();
  let first = now;
  for (const e of entries) {
    if (e.action === 'done' && e.actionAt) { const m = month(e.actionAt); done.set(m, (done.get(m) ?? 0) + 1); if (e.actionAt < first) first = e.actionAt; }
    for (const t of e.thoughts) { const m = month(t.at); thoughts.set(m, (thoughts.get(m) ?? 0) + 1); if (t.at < first) first = t.at; }
  }
  const months: string[] = [];
  let [y, mo] = month(first).split('-').map(Number);
  const [ey, em] = month(now).split('-').map(Number);
  while (y < ey || (y === ey && mo <= em)) { months.push(`${y}-${String(mo).padStart(2, '0')}`); mo++; if (mo > 12) { mo = 1; y++; } }
  return months.map(m => ({ month: m, done: done.get(m) ?? 0, thoughts: thoughts.get(m) ?? 0 }));
}
