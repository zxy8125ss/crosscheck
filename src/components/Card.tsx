// 单条卡片：遮挡态 → 对照态 → 完成态
import { useEffect, useRef, useState } from 'react';
import type { Action, Compare, Entry, FullItem, LightItem } from '../lib/types';
import { COMPARE_LABEL, PROMPT, actionLabel } from '../lib/types';
import { addThought, setAction, setCompare, setNote, skip } from '../lib/db';
import { loadChapter } from '../lib/content';
import { useStore } from '../lib/store';
import { itemHref } from '../lib/router';
import { duelUrl, MAX_ANSWER, shareLink } from '../lib/duel';
import { today } from '../lib/date';
import { ItemBadges } from './Badges';
import { RichText } from './RichText';

interface Props {
  item: LightItem;
  entry?: Entry;
  mode: 'deck' | 'page';
  onDone?: () => void;
}

export function Card({ item, entry, mode, onDone }: Props) {
  const { index } = useStore();
  const chapterTitle = index.chapters.find(c => c.num === item.chapter)?.title ?? '';
  const revealed = !!entry && (entry.thoughts.length > 0 || !!entry.skipped);
  const [full, setFull] = useState<FullItem | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [justActed, setJustActed] = useState<Action | null>(null);

  useEffect(() => {
    let alive = true;
    setFull(null);
    loadChapter(item.chapter).then(c => { if (alive) setFull(c.items.find(x => x.id === item.id) ?? null); });
    return () => { alive = false; };
  }, [item.id, item.chapter]);

  useEffect(() => { setText(''); setJustActed(null); }, [item.id]);

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    await addThought(item.id, text);
    setText('');
    setBusy(false);
  };

  const act = async (a: Action) => {
    const next = entry?.action === a ? undefined : a;
    await setAction(item.id, next);
    if (mode === 'deck' && next) { setJustActed(next); setTimeout(() => onDone?.(), 650); }
  };

  return (
    <article className="rounded-card border border-line bg-card p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted">
        <a href={`#/ch/${item.chapter}`} className="truncate hover:text-pine">第 {item.chapter} 章 · {chapterTitle} · 第 {item.ordinal} 条</a>
      </div>
      <ItemBadges item={item} />
      <h2 className="mt-3 font-serif text-[1.3rem] font-semibold leading-snug text-ink">{item.title}</h2>

      {!revealed ? (
        <Masked item={item} text={text} setText={setText} busy={busy} onSubmit={submit} onSkip={() => skip(item.id)} />
      ) : (
        <Revealed item={item} full={full} entry={entry!} onAct={act} justActed={justActed} mode={mode} />
      )}
    </article>
  );
}

function Masked({ item, text, setText, busy, onSubmit, onSkip }: { item: LightItem; text: string; setText: (s: string) => void; busy: boolean; onSubmit: () => void; onSkip: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
  }, [text]);
  return (
    <div className="mt-4">
      <p className="font-medium text-pine">{PROMPT}</p>
      <p className="mt-0.5 text-[11px] text-muted">提问由 Crosscheck 生成，不来自原书</p>
      <textarea
        ref={ref}
        rows={2}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="写一句就行，比如：一直没在意 / 已经在做了，因为……"
        className="mt-3 w-full resize-none rounded-xl border border-line bg-paper p-3 text-[15px] leading-relaxed outline-none focus:border-pine"
      />
      <div className="mt-3 flex items-center justify-between">
        <button className="text-sm text-muted underline underline-offset-4" onClick={onSkip}>直接看</button>
        <button className="btn-primary" disabled={!text.trim() || busy} onClick={onSubmit}>提交并看原文</button>
      </div>
      <div className="relative mt-5 overflow-hidden rounded-xl bg-sand/60 p-4" aria-hidden>
        <p className="masked text-[15px] leading-relaxed">{item.plain}</p>
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">原书怎么说，写完再看</div>
      </div>
    </div>
  );
}

function Revealed({ item, full, entry, onAct, justActed, mode }: { item: LightItem; full: FullItem | null; entry: Entry; onAct: (a: Action) => void; justActed: Action | null; mode: Props['mode'] }) {
  const [showThought, setShowThought] = useState(true);
  const [expand, setExpand] = useState(mode === 'page');
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNoteText] = useState(entry.note ?? '');
  const [copied, setCopied] = useState(false);
  const latest = entry.thoughts.at(-1);

  const { meta } = useStore();
  const [duelMsg, setDuelMsg] = useState('');
  const invite = async () => {
    if (!latest) return;
    if (latest.text.length > MAX_ANSWER) { setDuelMsg(`想法超过 ${MAX_ANSWER} 字，链接太长，先精简一下再发`); return; }
    const n = ((meta.nickname as string) || '一位朋友').slice(0, 12);
    const r = await shareLink('Crosscheck 盲答', `「${item.title}」——你现在是怎么做的？先答，再看我的答案和原书。`, duelUrl({ v: 1, k: 'q', id: item.id, a: latest.text, n, t: today() }));
    setDuelMsg(r === 'copied' ? '链接已复制，粘贴发给朋友' : r === 'shared' ? '已发出' : '');
  };

  const share = async () => {
    const url = `${location.origin}${location.pathname}${itemHref(item.id)}`;
    const text = `${item.title}\n${item.plain}`;
    try {
      if (navigator.share) await navigator.share({ title: item.title, text, url });
      else { await navigator.clipboard.writeText(`${text}\n${url}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    } catch { /* 用户取消 */ }
  };

  return (
    <div className="mt-4 space-y-4">
      {latest && (
        <div className="rounded-xl bg-sand/70 p-3">
          <button className="flex w-full items-center justify-between text-xs text-bark" onClick={() => setShowThought(v => !v)}>
            <span>我的想法 · {latest.at}</span><span>{showThought ? '收起' : '展开'}</span>
          </button>
          {showThought && <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-relaxed">{latest.text}</p>}
        </div>
      )}

      <div>
        <p className="text-xs text-muted">原书说人话</p>
        <p className="mt-1 text-[15px] leading-relaxed"><RichText text={full?.plain ?? item.plain} refs={full?.refs.plain} /></p>
      </div>

      {full && (
        <div>
          <button className="text-sm text-pine underline underline-offset-4" onClick={() => setExpand(v => !v)}>{expand ? '收起原文细节' : '看成本、收益、证据和来源'}</button>
          {expand && <Details full={full} />}
        </div>
      )}

      {latest && (
        <Row label="和你想的比">
          {(['same', 'new', 'doubt'] as Compare[]).map(c => (
            <button key={c} className={entry.compare === c ? 'chip-on' : 'chip'} onClick={() => setCompare(item.id, entry.compare === c ? undefined : c)}>{COMPARE_LABEL[c]}</button>
          ))}
        </Row>
      )}

      <Row label="你打算">
        {(['done', 'plan', 'na'] as Action[]).map(a => (
          <button key={a} className={entry.action === a ? 'chip-on' : 'chip'} onClick={() => onAct(a)}>{actionLabel(a, item.title)}</button>
        ))}
      </Row>
      {justActed && <p className="text-center text-sm text-teal">已记下，下一条</p>}

      <div className="flex flex-wrap gap-2 border-t border-line pt-3 text-sm">
        <button className="btn-ghost" onClick={() => setNoteOpen(v => !v)}>{entry.note ? '笔记' : '加笔记'}</button>
        <button className="btn-ghost" onClick={share}>{copied ? '已复制' : '分享'}</button>
        {latest && <button className="btn-ghost" onClick={invite}>邀朋友盲答</button>}
      </div>
      {latest && <p className="-mt-2 text-[11px] text-muted">盲答链接里带着你的想法，只压缩不加密，转发后谁都能看到，别写隐私。{duelMsg && <span className="text-teal"> {duelMsg}</span>}</p>}
      {noteOpen ? (
        <div>
          <textarea value={note} onChange={e => setNoteText(e.target.value)} rows={3} placeholder="看完后想补充的"
            className="w-full rounded-xl border border-line bg-paper p-3 text-[15px] outline-none focus:border-pine" />
          <div className="mt-2 text-right"><button className="btn-primary" onClick={async () => { await setNote(item.id, note); setNoteOpen(false); }}>保存笔记</button></div>
        </div>
      ) : entry.note ? (
        <p className="whitespace-pre-wrap rounded-xl bg-paper p-3 text-sm text-muted">笔记（{entry.noteAt}）：{entry.note}</p>
      ) : null}
      {entry.thoughts.length > 1 && (
        <details className="text-sm text-muted">
          <summary>以前的想法（{entry.thoughts.length - 1}）</summary>
          {entry.thoughts.slice(0, -1).reverse().map((t, i) => <p key={i} className="mt-1 whitespace-pre-wrap">{t.at}：{t.text}</p>)}
        </details>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-14 shrink-0 text-xs text-muted">{label}</span>
      {children}
    </div>
  );
}

function Details({ full }: { full: FullItem }) {
  const rows: [string, string, keyof FullItem['refs'] | null][] = [
    ['成本', full.cost, 'cost'], ['收益', full.benefit, 'benefit'], ['证据等级', full.grade, null], ['来源', full.source, 'source'], ['备注', full.note, 'note'],
  ];
  return (
    <dl className="mt-3 space-y-3 text-[14px] leading-relaxed">
      {rows.filter(([, v]) => v).map(([k, v, f]) => (
        <div key={k}>
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="mt-0.5 break-words"><RichText text={v} refs={f ? full.refs[f] : undefined} /></dd>
        </div>
      ))}
      <p className="rounded-lg bg-paper p-2 text-xs text-muted">政策各地执行不一，办事以当地部门、医生、律师为准。</p>
    </dl>
  );
}
