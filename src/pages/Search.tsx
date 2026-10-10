import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { loadAllChapters } from '../lib/content';
import { search } from '../shared/search.js';
import { GROUPS, activeCount, applyFilters, emptyFilters, type Filters } from '../lib/filter';
import { itemHref } from '../lib/router';
import { ItemBadges, StateBadge } from '../components/Badges';
import type { FullItem, LightItem } from '../lib/types';

let lastQuery = '';
let lastFilters = emptyFilters();

export function Search() {
  const { index, entries } = useStore();
  const [q, setQ] = useState(lastQuery);
  const [f, setF] = useState<Filters>(lastFilters);
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState<FullItem[] | null>(null);
  const [limit, setLimit] = useState(40);

  useEffect(() => { loadAllChapters().then(setFull).catch(() => {}); }, []);
  useEffect(() => { lastQuery = q; lastFilters = f; setLimit(40); }, [q, f]);

  const pool: LightItem[] = full ?? index.items;
  const results = useMemo(() => {
    const base = q.trim() ? (search(pool, q) as LightItem[]) : pool;
    return applyFilters(base, f, entries);
  }, [pool, q, f, entries]);

  const toggle = (group: keyof typeof GROUPS, v: string) => setF(prev => {
    const next = { ...prev, [group]: new Set(prev[group] as Set<string>) } as Filters;
    const s = next[group] as Set<string>;
    s.has(v) ? s.delete(v) : s.add(v);
    return next;
  });
  const n = activeCount(f);

  return (
    <div className="space-y-3">
      <div className="sticky top-[calc(env(safe-area-inset-top)+3.25rem)] z-10 -mx-4 bg-paper px-4 pb-2 pt-1">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜标题和正文，多个词用空格隔开" type="search"
          className="w-full rounded-full border border-line bg-card px-4 py-2.5 outline-none focus:border-pine" />
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-muted">共 {results.length} 条{!full && q && '（正文加载中，先搜标题和说人话）'}</span>
          <div className="flex gap-2">
            {n > 0 && <button className="text-muted underline" onClick={() => setF(emptyFilters())}>清空</button>}
            <button className={n ? 'chip-on' : 'chip'} onClick={() => setOpen(v => !v)}>筛选{n ? ` ${n}` : ''}</button>
          </div>
        </div>
      </div>

      {open && (
        <div className="space-y-3 rounded-card bg-card p-4 text-sm">
          <label className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-xs text-muted">章节</span>
            <select value={f.chapter ?? ''} onChange={e => setF({ ...f, chapter: e.target.value ? Number(e.target.value) : null })}
              className="min-w-0 flex-1 rounded-full border border-line bg-paper px-3 py-1">
              <option value="">全部</option>
              {index.chapters.map(c => <option key={c.num} value={c.num}>{c.num}. {c.title}</option>)}
            </select>
          </label>
          {(Object.keys(GROUPS) as (keyof typeof GROUPS)[]).map(g => (
            <div key={g} className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 shrink-0 text-xs text-muted">{GROUPS[g].label}</span>
              {GROUPS[g].options.map(([v, label]) => (
                <button key={v} className={(f[g] as Set<string>).has(v) ? 'chip-on' : 'chip'} onClick={() => toggle(g, v)}>{label}</button>
              ))}
            </div>
          ))}
          <p className="text-xs text-muted">同一行多选是「或」，不同行之间是「且」。</p>
        </div>
      )}

      {results.length === 0 ? (
        <p className="rounded-card bg-card p-6 text-center text-muted">没有结果。{n ? '试试去掉几个筛选条件。' : '换个词试试。'}</p>
      ) : (
        <ul className="space-y-2">
          {results.slice(0, limit).map(it => (
            <li key={it.id}>
              <a href={itemHref(it.id)} className="block rounded-xl bg-card px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs text-muted">第 {it.chapter} 章第 {it.ordinal} 条</span>
                  <StateBadge entry={entries.get(it.id)} title={it.title} />
                </div>
                <p className="mt-1 font-medium leading-snug">{it.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{it.plain}</p>
                <div className="mt-2"><ItemBadges item={it} /></div>
              </a>
            </li>
          ))}
          {results.length > limit && <li><button className="btn-ghost w-full" onClick={() => setLimit(l => l + 40)}>再看 40 条</button></li>}
        </ul>
      )}
    </div>
  );
}
