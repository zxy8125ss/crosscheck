import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { liveQuery } from 'dexie';
import { db, ensureInstallDate } from './db';
import { loadIndex } from './content';
import { resolveEntries } from './deck';
import type { Entry, IndexData, LightItem } from './types';

interface Store {
  index: IndexData;
  byId: Map<string, LightItem>;
  entries: Map<string, Entry>;
  rawEntries: Entry[];
  meta: Record<string, unknown>;
  installedAt: string;
}
const Ctx = createContext<Store | null>(null);

export function useLive<T>(query: () => Promise<T>, def: T, deps: unknown[] = []): T {
  const [v, setV] = useState(def);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setV, error: e => console.error(e) });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return v;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [index, setIndex] = useState<IndexData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installedAt, setInstalled] = useState<string | null>(null);
  const rawEntries = useLive(() => db.entries.toArray(), [] as Entry[]);
  const metaRows = useLive(() => db.meta.toArray(), [] as { key: string; value: unknown }[]);

  useEffect(() => {
    loadIndex().then(setIndex).catch(e => setError(String(e.message ?? e)));
    ensureInstallDate().then(setInstalled);
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  const value = useMemo(() => {
    if (!index || !installedAt) return null;
    return {
      index,
      byId: new Map(index.items.map(i => [i.id, i])),
      entries: resolveEntries(index.items, rawEntries),
      rawEntries,
      meta: Object.fromEntries(metaRows.map(m => [m.key, m.value])),
      installedAt,
    };
  }, [index, installedAt, rawEntries, metaRows]);

  if (error) return <div className="p-8 text-center text-muted">内容加载失败：{error}<br />联网后刷新重试。</div>;
  if (!value) return <div className="p-8 text-center text-muted">加载中…</div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider 缺失');
  return s;
}
