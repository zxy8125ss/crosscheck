import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { loadChapter } from '../lib/content';
import { setMeta } from '../lib/db';
import { go, itemHref } from '../lib/router';
import { RichText } from '../components/RichText';
import { ItemBadges, StateBadge } from '../components/Badges';
import type { ChapterFull } from '../lib/types';

export function Chapters() {
  const { index, entries } = useStore();
  return (
    <div className="space-y-2">
      <h1 className="font-serif text-2xl font-semibold text-pine">章节</h1>
      {index.chapters.map(c => {
        const items = index.items.filter(i => i.chapter === c.num);
        const handled = items.filter(i => entries.get(i.id)?.action).length;
        return (
          <a key={c.num} href={`#/ch/${c.num}`} className="block rounded-xl bg-card px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate"><span className="text-muted">{c.num}.</span> {c.title}</span>
              <span className="shrink-0 text-xs text-muted">{handled}/{c.count}</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-sand">
              <div className="h-full bg-teal" style={{ width: `${(handled / c.count) * 100}%` }} />
            </div>
          </a>
        );
      })}
    </div>
  );
}

export function Chapter({ num }: { num: number }) {
  const { index, entries } = useStore();
  const [ch, setCh] = useState<ChapterFull | null>(null);
  useEffect(() => { setCh(null); loadChapter(num).then(setCh); }, [num]);
  const items = index.items.filter(i => i.chapter === num);
  const info = index.chapters.find(c => c.num === num);
  if (!info) return <p className="text-muted">没有这一章。</p>;
  return (
    <div className="space-y-4">
      <a href="#/ch" className="text-sm text-muted">← 全部章节</a>
      <h1 className="font-serif text-2xl font-semibold text-pine">第 {num} 章 · {info.title}</h1>
      {ch && (
        <details className="rounded-xl bg-card p-4 text-[15px] leading-relaxed" open={false}>
          <summary className="cursor-pointer text-sm text-muted">本章导读</summary>
          <div className="mt-2 space-y-3">{ch.intro.map((p, i) => <p key={i}><RichText text={p} refs={ch.introRefs[i]} /></p>)}</div>
        </details>
      )}
      <button className="btn-primary w-full" onClick={async () => { await setMeta('currentChapter', num); go('#/'); }}>从这一章开始翻</button>
      <ul className="space-y-2">
        {items.map(it => (
          <li key={it.id}>
            <a href={itemHref(it.id)} className="block rounded-xl bg-card px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <span className="leading-snug"><span className="text-muted">{it.ordinal}.</span> {it.title}</span>
                <StateBadge entry={entries.get(it.id)} title={it.title} />
              </div>
              <div className="mt-2"><ItemBadges item={it} /></div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
