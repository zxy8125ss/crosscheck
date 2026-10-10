// 组合筛选：同一组多选为「或」，不同组之间为「且」，与原站一致。纯函数。
import type { Entry, LightItem } from './types';

export type StateKey = 'none' | 'thought' | 'done' | 'plan' | 'na' | 'new' | 'doubt';
export interface Filters {
  chapter: number | null;
  value: Set<string>; lens: Set<string>; grade: Set<string>;
  money: Set<string>; time: Set<string>; will: Set<string>;
  state: Set<StateKey>; flag: Set<'disputed' | 'todo'>;
}
export const emptyFilters = (): Filters => ({
  chapter: null, value: new Set(), lens: new Set(), grade: new Set(),
  money: new Set(), time: new Set(), will: new Set(), state: new Set(), flag: new Set(),
});

export const GROUPS = {
  value: { label: '性价比', options: [['极高', '极高'], ['高', '高'], ['一般', '一般']] },
  lens: { label: '换回什么', options: [['死亡率', '寿命'], ['金钱', '钱'], ['时间', '时间精力'], ['自由', '人身自由']] },
  grade: { label: '证据等级', options: [['A', 'A 级'], ['B', 'B 级'], ['C', 'C 级']] },
  money: { label: '花钱', options: [['0', '不花钱'], ['少', '少'], ['多', '多']] },
  time: { label: '花时间', options: [['少', '顺手'], ['中', '几小时'], ['多', '每天占用']] },
  will: { label: '要毅力', options: [['否', '不用'], ['些', '一点'], ['是', '很多']] },
  state: { label: '我的状态', options: [['none', '还没看'], ['thought', '写过想法'], ['done', '做到了'], ['plan', '打算'], ['na', '不适用'], ['new', '未曾设想'], ['doubt', '存疑']] },
  flag: { label: '只看', options: [['disputed', '有争议'], ['todo', '待核实']] },
} as const;

const stateOf = (e?: Entry): Set<StateKey> => {
  const s = new Set<StateKey>();
  if (!e || (!e.action && !e.thoughts.length && !e.skipped)) s.add('none');
  if (e?.thoughts.length) s.add('thought');
  if (e?.action) s.add(e.action);
  if (e?.compare === 'new') s.add('new');
  if (e?.compare === 'doubt') s.add('doubt');
  return s;
};

export function applyFilters<T extends LightItem>(items: T[], f: Filters, entries: Map<string, Entry>): T[] {
  return items.filter(i => {
    if (f.chapter && i.chapter !== f.chapter) return false;
    if (f.value.size && !f.value.has(i.value)) return false;
    if (f.lens.size && !f.lens.has(i.tags.lens)) return false;
    if (f.grade.size && !f.grade.has(i.grade)) return false;
    if (f.money.size && !f.money.has(i.tags.money)) return false;
    if (f.time.size && !f.time.has(i.tags.time)) return false;
    if (f.will.size && !f.will.has(i.tags.will)) return false;
    if (f.flag.size && ![...f.flag].some(k => i.flags[k])) return false;
    if (f.state.size) { const s = stateOf(entries.get(i.id)); if (![...f.state].some(k => s.has(k))) return false; }
    return true;
  });
}

export const activeCount = (f: Filters) =>
  (f.chapter ? 1 : 0) + [f.value, f.lens, f.grade, f.money, f.time, f.will, f.state, f.flag].reduce((n, s) => n + s.size, 0);
