import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { decode, duelUrl, MAX_ANSWER, MAX_NAME, shareLink, type Invite, type Reply } from '../lib/duel';
import { findLight, loadItem } from '../lib/content';
import { addThought, db, setMeta } from '../lib/db';
import { today } from '../lib/date';
import { PROMPT, type FullItem, type LightItem } from '../lib/types';
import { RichText } from '../components/RichText';
import { itemHref } from '../lib/router';

export function Duel({ data }: { data: string }) {
  const packet = useMemo(() => decode(data), [data]);
  const [item, setItem] = useState<LightItem | null | undefined>(undefined);
  const [full, setFull] = useState<FullItem | undefined>();
  useEffect(() => {
    if (!packet) return;
    findLight(packet.id).then(i => { setItem(i ?? null); if (i) loadItem(i.id).then(setFull); });
  }, [packet]);

  if (!packet) return <Box><p className="font-serif text-lg">链接不完整</p><p className="mt-2 text-sm text-muted">这个对质链接可能被截断或改动过，请让对方重新发一次。</p><a href="#/" className="btn-primary mt-4 inline-block">去首页</a></Box>;
  if (item === undefined) return <p className="text-muted">加载中…</p>;
  return packet.k === 'q' ? <Answer invite={packet} item={item} full={full} /> : <Received reply={packet} item={item} full={full} />;
}

function Box({ children }: { children: React.ReactNode }) {
  return <div className="rounded-card border border-line bg-card p-5">{children}</div>;
}

function Head({ item, from }: { item: LightItem | null; from: string }) {
  return (
    <>
      <p className="text-xs text-muted">{from}</p>
      {item ? <h2 className="mt-2 font-serif text-[1.3rem] font-semibold leading-snug">{item.title}</h2>
        : <p className="mt-2 rounded-lg bg-paper p-2 text-sm text-muted">原书已删除这一条，只能看到双方的答案。</p>}
    </>
  );
}

function Three({ mine, mineLabel, other, otherLabel, item, full }: { mine: string; mineLabel: string; other: string; otherLabel: string; item: LightItem | null; full?: FullItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 space-y-3">
      <Block label={mineLabel} text={mine} tone="bg-sand/70" />
      <Block label={otherLabel} text={other} tone="bg-teal/10" />
      {item && (
        <div className="rounded-xl border border-line p-3">
          <p className="text-xs text-muted">原书说人话</p>
          <p className="mt-1 text-[15px] leading-relaxed"><RichText text={full?.plain ?? item.plain} refs={full?.refs.plain} /></p>
          {full && <button className="mt-2 text-sm text-pine underline" onClick={() => setOpen(v => !v)}>{open ? '收起' : '看收益、证据和来源'}</button>}
          {open && full && (
            <div className="mt-2 space-y-2 text-sm">
              <p><span className="text-muted">收益：</span><RichText text={full.benefit} refs={full.refs.benefit} /></p>
              <p><span className="text-muted">证据等级：</span>{full.grade}</p>
              <p className="break-words"><span className="text-muted">来源：</span><RichText text={full.source} /></p>
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-muted">书和你们都不是标准答案，只是互相核对一遍。</p>
    </div>
  );
}

function Block({ label, text, tone }: { label: string; text: string; tone: string }) {
  // 解出的文字一律按纯文本渲染
  return <div className={`rounded-xl p-3 ${tone}`}><p className="text-xs text-muted">{label}</p><p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed">{text}</p></div>;
}

function Answer({ invite, item, full }: { invite: Invite; item: LightItem | null; full?: FullItem }) {
  const { meta } = useStore();
  const [text, setText] = useState('');
  const [name, setName] = useState((meta.nickname as string) ?? '');
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState('');

  const submit = async () => {
    if (!text.trim()) return;
    if (item) await addThought(item.id, text);
    if (name.trim()) await setMeta('nickname', name.trim());
    setDone(true);
  };
  const reply = async () => {
    const r: Reply = { v: 1, k: 'r', id: invite.id, a: invite.a, n: invite.n, f: text.trim(), fn: name.trim() || '朋友', t: today() };
    const res = await shareLink('Crosscheck 对质结果', `我答完了「${item?.title ?? '这道题'}」，看看我们想的一样吗`, duelUrl(r));
    setMsg(res === 'copied' ? '链接已复制，粘贴发给对方' : res === 'shared' ? '已发出' : '');
  };

  return (
    <Box>
      <Head item={item} from={`${invite.n} 邀你盲答`} />
      {!done ? (
        <div className="mt-4">
          <p className="font-medium text-pine">{PROMPT}</p>
          <p className="mt-0.5 text-[11px] text-muted">提问由 Crosscheck 生成，不来自原书</p>
          <div className="mt-3 rounded-xl bg-sand/60 p-3 text-sm text-muted">{invite.n} 已作答，你答完才能看到 TA 的答案和原书。</div>
          <textarea value={text} onChange={e => setText(e.target.value.slice(0, MAX_ANSWER))} rows={3} placeholder="写一句你现在的做法"
            className="mt-3 w-full rounded-xl border border-line bg-paper p-3 text-[15px] outline-none focus:border-pine" />
          <div className="flex justify-between text-[11px] text-muted"><span>别写隐私，答案会出现在回传链接里</span><span>{text.length}/{MAX_ANSWER}</span></div>
          <input value={name} onChange={e => setName(e.target.value.slice(0, MAX_NAME))} placeholder="你的昵称（对方会看到）"
            className="mt-3 w-full rounded-full border border-line bg-paper px-4 py-2 text-sm" />
          <div className="mt-4 text-right"><button className="btn-primary" disabled={!text.trim()} onClick={submit}>提交，看答案</button></div>
        </div>
      ) : (
        <>
          <Three mine={invite.a} mineLabel={`${invite.n} 的想法`} other={text.trim()} otherLabel="你的想法" item={item} full={full} />
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={reply}>发回给 {invite.n}</button>
            <a className="btn-ghost" href={item ? itemHref(item.id) : '#/'}>在 Crosscheck 里继续</a>
          </div>
          {msg && <p className="mt-2 text-sm text-teal">{msg}</p>}
          <p className="mt-3 text-xs text-muted">你的答案已存为这一条的「我的想法」。Crosscheck 里还有几百条，可以接着翻。</p>
        </>
      )}
    </Box>
  );
}

function Received({ reply, item, full }: { reply: Reply; item: LightItem | null; full?: FullItem }) {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const itemId = item?.id ?? reply.id;
    db.transaction('rw', db.duels, async () => {
      const dup = await db.duels.where('itemId').equals(itemId).filter(d => d.friendName === reply.fn && d.friendText === reply.f && d.at === reply.t).count();
      if (!dup) await db.duels.add({ itemId, friendName: reply.fn, myText: reply.a, friendText: reply.f, at: reply.t });
    }).then(() => setSaved(true));
  }, [reply, item]);
  return (
    <Box>
      <Head item={item} from={`${reply.fn} 答完了你的对质`} />
      <Three mine={reply.a} mineLabel="你的想法" other={reply.f} otherLabel={`${reply.fn} 的想法`} item={item} full={full} />
      {saved && <p className="mt-3 text-sm text-teal">已存入「我的 → 对质记录」。</p>}
      {item && <a className="btn-ghost mt-3 inline-block" href={itemHref(item.id)}>打开这一条</a>}
    </Box>
  );
}
