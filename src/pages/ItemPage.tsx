import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { findLight } from '../lib/content';
import { Card } from '../components/Card';
import type { LightItem } from '../lib/types';

export function ItemPage({ id }: { id: string }) {
  const { entries } = useStore();
  const [item, setItem] = useState<LightItem | null | undefined>(undefined);
  useEffect(() => { findLight(id).then(i => setItem(i ?? null)); }, [id]);
  if (item === undefined) return <p className="text-muted">加载中…</p>;
  if (item === null) return <p className="rounded-card bg-card p-6 text-muted">原书里已经没有这一条了（可能被作者删除）。</p>;
  return (
    <div className="space-y-3">
      <button className="text-sm text-muted" onClick={() => history.length > 1 ? history.back() : (location.hash = '#/')}>← 返回</button>
      <Card item={item} entry={entries.get(item.id)} mode="page" />
    </div>
  );
}
