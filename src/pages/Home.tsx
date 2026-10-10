import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { nextItem, newByChapter } from '../lib/deck';
import { computeStats, rate } from '../lib/stats';
import { setMeta } from '../lib/db';
import { loadChapter } from '../lib/content';
import { Card } from '../components/Card';
import { BackupNudge } from '../components/Cloud';
import { RichText } from '../components/RichText';
import { month, today } from '../lib/date';
import type { ChapterFull } from '../lib/types';

export function Home() {
  const { index, entries, meta, installedAt, rawEntries } = useStore();
  const current = (meta.currentChapter as number) ?? 1;
  const introSeen = (meta.introSeen as number[]) ?? [];
  const [cardKey, setCardKey] = useState(0);

  const item = useMemo(() => nextItem(index.items, entries, current), [index.items, entries, current, cardKey]);
  const fresh = useMemo(() => newByChapter(index.items, entries, installedAt), [index.items, entries, installedAt]);
  const { all } = useMemo(() => computeStats(index.items, entries), [index.items, entries]);
  const thisMonth = rawEntries.filter(e => e.action === 'done' && e.actionAt && month(e.actionAt) === month(today())).length;

  // 翻到了新的一章：先看这章的导读
  const showIntro = item && !introSeen.includes(item.chapter);
  useEffect(() => {
    if (item && item.chapter !== current) setMeta('currentChapter', item.chapter);
  }, [item, current]);

  return (
    <div className="space-y-4">
      <BackupNudge />
      <section className="grid grid-cols-3 gap-2 text-center">
        <Stat n={all.done} label="做到了" sub={`本月 ${thisMonth}`} />
        <Stat n={all.new} label="未曾设想" sub="学到的新东西" />
        <Stat n={`${Math.round(rate(all) * 100)}%`} label="完成率" sub={`不适用 ${all.na} 条不计`} />
      </section>

      {[...fresh.entries()].map(([ch, list]) => (
        <button key={ch} onClick={() => { setMeta('currentChapter', ch); }}
          className="w-full rounded-xl border border-teal/40 bg-teal/10 px-4 py-2 text-left text-sm text-teal">
          原书更新：第 {ch} 章有 {list.length} 条新增，点这里接着翻
        </button>
      ))}

      <ChapterPicker current={item?.chapter ?? current} />

      {!item ? (
        <div className="rounded-card bg-card p-8 text-center">
          <p className="font-serif text-xl">全部翻完了</p>
          <p className="mt-2 text-sm text-muted">原书更新后，新条目会出现在这里。</p>
        </div>
      ) : showIntro ? (
        <Intro num={item.chapter} onStart={() => setMeta('introSeen', [...introSeen, item.chapter])} />
      ) : (
        <Card key={`${item.id}-${cardKey}`} item={item} entry={entries.get(item.id)} mode="deck" onDone={() => setCardKey(k => k + 1)} />
      )}
    </div>
  );
}

function Stat({ n, label, sub }: { n: number | string; label: string; sub: string }) {
  return (
    <a href="#/me" className="rounded-xl bg-card px-2 py-3">
      <div className="font-serif text-2xl text-pine">{n}</div>
      <div className="text-xs">{label}</div>
      <div className="mt-0.5 text-[10px] text-muted">{sub}</div>
    </a>
  );
}

function ChapterPicker({ current }: { current: number }) {
  const { index } = useStore();
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      正在翻
      <select value={current} onChange={e => setMeta('currentChapter', Number(e.target.value))}
        className="min-w-0 flex-1 truncate rounded-full border border-line bg-card px-3 py-1.5 text-ink">
        {index.chapters.map(c => <option key={c.num} value={c.num}>第 {c.num} 章 {c.title}</option>)}
      </select>
    </label>
  );
}

function Intro({ num, onStart }: { num: number; onStart: () => void }) {
  const [ch, setCh] = useState<ChapterFull | null>(null);
  useEffect(() => { loadChapter(num).then(setCh); }, [num]);
  return (
    <article className="rounded-card border border-line bg-card p-5">
      <p className="text-xs text-muted">进入新的一章</p>
      <h2 className="mt-1 font-serif text-2xl font-semibold text-pine">第 {num} 章 · {ch?.title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed">
        {ch?.intro.map((p, i) => <p key={i}><RichText text={p} refs={ch.introRefs[i]} /></p>)}
      </div>
      <div className="mt-5 text-right"><button className="btn-primary" onClick={onStart}>开始这一章（{ch?.items.length ?? ''} 条）</button></div>
    </article>
  );
}
