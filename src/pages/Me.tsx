import { useMemo, useRef, useState } from 'react';
import { useLive, useStore } from '../lib/store';
import { computeStats, monthly, rate } from '../lib/stats';
import { LENSES, LENS_LABEL } from '../lib/types';
import { db, setMeta } from '../lib/db';
import { exportNow, importBackup, validateBackup, type Backup } from '../lib/backup';
import { today } from '../lib/date';
import { itemHref } from '../lib/router';
import { CloudSection } from '../components/Cloud';

export function Me() {
  const { index, entries, rawEntries, meta, byId } = useStore();
  const { all, byLens } = useMemo(() => computeStats(index.items, entries), [index.items, entries]);
  const trend = useMemo(() => monthly(rawEntries, today()), [rawEntries]);
  const duels = useLive(() => db.duels.orderBy('at').reverse().toArray(), []);
  const known = useMemo(() => new Set(index.items.flatMap(i => [i.id, ...i.aliases])), [index.items]);
  const orphans = rawEntries.filter(e => !known.has(e.itemId));
  const thoughts = useMemo(() => rawEntries.flatMap(e => e.thoughts.map(t => ({ ...t, id: e.itemId }))).sort((a, b) => b.at.localeCompare(a.at)), [rawEntries]);

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-2xl font-semibold text-pine">我的</h1>

      <CloudSection />

      <Section title="进度">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Num n={all.done} label="做到了" />
          <Num n={all.plan} label="打算" />
          <Num n={`${Math.round(rate(all) * 100)}%`} label="完成率" />
          <Num n={all.thought} label="写过想法" />
          <Num n={all.new} label="未曾设想" />
          <Num n={all.doubt} label="存疑" />
        </div>
        <p className="mt-2 text-xs text-muted">完成率 = 做到了 ÷（全部 {all.total} 条 − 不适用 {all.na} 条）。四种收益分开看，不合成总分：</p>
        <div className="mt-3 space-y-2.5">
          {LENSES.map(l => {
            const s = byLens[l];
            return (
              <div key={l}>
                <div className="flex justify-between text-sm"><span>换{LENS_LABEL[l]}</span><span className="text-muted">做到 {s.done} / {s.total - s.na} · 未曾设想 {s.new}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sand"><div className="h-full bg-teal" style={{ width: `${rate(s) * 100}%` }} /></div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="每月趋势">
        <Trend data={trend} />
      </Section>

      <Section title={`我的想法（${thoughts.length}）`}>
        {thoughts.length === 0 ? <p className="text-sm text-muted">还没写过想法。</p> : (
          <ul className="space-y-2 text-sm">
            {thoughts.slice(0, 30).map((t, i) => {
              const it = byId.get(t.id) ?? [...byId.values()].find(x => x.aliases.includes(t.id));
              return (
                <li key={i} className="rounded-lg bg-paper p-2.5">
                  <a href={itemHref(t.id)} className="text-xs text-pine">{it ? it.title : '（原书已删除这一条）'}</a>
                  <p className="mt-0.5 whitespace-pre-wrap">{t.text}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{t.at}</p>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {duels.length > 0 && (
        <Section title={`对质记录（${duels.length}）`}>
          <ul className="space-y-2 text-sm">
            {duels.map(d => (
              <li key={d.id} className="rounded-lg bg-paper p-2.5">
                <a href={itemHref(d.itemId)} className="text-xs text-pine">{byId.get(d.itemId)?.title ?? '（原书已删除这一条）'}</a>
                <p className="mt-1"><span className="text-muted">我：</span>{d.myText}</p>
                <p className="mt-0.5"><span className="text-muted">{d.friendName}：</span>{d.friendText}</p>
                <p className="mt-0.5 text-[11px] text-muted">{d.at}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {orphans.length > 0 && <p className="text-xs text-muted">另有 {orphans.length} 条记录对应的条目已被原书删除，记录保留，不计入统计。</p>}

      <BackupSection lastExportAt={meta.lastExportAt as string | undefined} content={index.upstream.commit} />

      <Section title="设置">
        <Nickname value={(meta.nickname as string) ?? ''} />
      </Section>

      <About />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-card bg-card p-4"><h2 className="mb-3 font-serif text-lg font-semibold">{title}</h2>{children}</section>;
}
function Num({ n, label }: { n: number | string; label: string }) {
  return <div className="rounded-xl bg-paper py-2"><div className="font-serif text-xl text-pine">{n}</div><div className="text-[11px] text-muted">{label}</div></div>;
}

function Trend({ data }: { data: { month: string; done: number; thoughts: number }[] }) {
  const W = 320, H = 120, P = 24;
  const max = Math.max(1, ...data.flatMap(d => [d.done, d.thoughts]));
  const x = (i: number) => (data.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (data.length - 1));
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const path = (k: 'done' | 'thoughts') => data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d[k])}`).join('');
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="每月做到了和写想法的条数">
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="rgb(var(--line))" />
        <path d={path('thoughts')} fill="none" stroke="rgb(var(--bark))" strokeWidth="2" />
        <path d={path('done')} fill="none" stroke="rgb(var(--teal))" strokeWidth="2.5" />
        {data.map((d, i) => (
          <g key={d.month}>
            <circle cx={x(i)} cy={y(d.done)} r="3" fill="rgb(var(--teal))" />
            <circle cx={x(i)} cy={y(d.thoughts)} r="2.5" fill="rgb(var(--bark))" />
            {(data.length <= 6 || i % Math.ceil(data.length / 6) === 0) && <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="rgb(var(--muted))">{d.month.slice(2)}</text>}
          </g>
        ))}
      </svg>
      <p className="mt-1 text-xs text-muted"><span className="text-teal">● 当月做到了</span>　<span className="text-bark">● 当月写的想法</span></p>
    </div>
  );
}

function BackupSection({ lastExportAt, content }: { lastExportAt?: string; content: string }) {
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Backup | null>(null);
  const [msg, setMsg] = useState('');
  const stale = !lastExportAt || (Date.parse(today()) - Date.parse(lastExportAt)) / 864e5 > 60;

  const onFile = async (f?: File) => {
    setMsg('');
    if (!f) return;
    try {
      const r = validateBackup(JSON.parse(await f.text()));
      if (!r.ok) { setMsg(`导入失败：${r.error}。现有数据没有改动。`); return; }
      setPending(r.backup);
    } catch { setMsg('导入失败：文件不是有效的 JSON。现有数据没有改动。'); }
    if (file.current) file.current.value = '';
  };
  const run = async (mode: 'merge' | 'replace') => {
    if (!pending) return;
    if (mode === 'replace' && !confirmReplace()) return;
    await importBackup(pending, mode, content);
    setMsg(`已${mode === 'merge' ? '合并' : '覆盖'}导入 ${pending.entries.length} 条记录。`);
    setPending(null);
  };

  return (
    <Section title="备份">
      <p className="text-sm text-muted">数据只存在这台设备的浏览器里。换手机、清浏览器数据前先导出。{lastExportAt ? `上次导出：${lastExportAt}。` : '还没导出过。'}</p>
      {stale && <p className="mt-1 text-sm text-warn">已经很久没备份了，建议导出一次。</p>}
      <div className="mt-3 flex gap-2">
        <button className="btn-primary" onClick={() => exportNow(content)}>导出</button>
        <button className="btn-ghost" onClick={() => file.current?.click()}>导入</button>
        <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
      </div>
      {pending && (
        <div className="mt-3 rounded-xl bg-paper p-3 text-sm">
          <p>备份里有 {pending.entries.length} 条记录、{pending.duels.length} 次对质（{pending.exportedAt.slice(0, 10)} 导出）。怎么导入？</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => run('merge')}>合并（推荐）</button>
            <button className="btn-ghost" onClick={() => run('replace')}>覆盖现有数据</button>
            <button className="btn-ghost" onClick={() => setPending(null)}>取消</button>
          </div>
          <p className="mt-2 text-xs text-muted">合并：同一条保留较新的记录，想法全部保留。覆盖：先自动导出当前数据，再用备份替换。</p>
        </div>
      )}
      {msg && <p className="mt-2 text-sm">{msg}</p>}
    </Section>
  );
}
// 覆盖是不可逆操作，用页面内二次确认替代浏览器弹窗
let replaceArmed = 0;
function confirmReplace() {
  const now = Date.now();
  if (now - replaceArmed < 4000) { replaceArmed = 0; return true; }
  replaceArmed = now;
  alertInline('再点一次「覆盖现有数据」确认（会先自动导出当前数据）');
  return false;
}
function alertInline(text: string) {
  const el = document.createElement('div');
  el.textContent = text;
  el.className = 'fixed inset-x-4 bottom-24 z-50 rounded-xl bg-ink px-4 py-3 text-center text-sm text-paper';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function Nickname({ value }: { value: string }) {
  const [v, setV] = useState(value);
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="w-20 shrink-0 text-muted">我的昵称</span>
      <input value={v} maxLength={12} onChange={e => setV(e.target.value)} onBlur={() => setMeta('nickname', v.trim())}
        placeholder="对质时朋友看到的名字" className="min-w-0 flex-1 rounded-full border border-line bg-paper px-3 py-1.5" />
    </label>
  );
}

function About() {
  const { index } = useStore();
  const u = index.upstream;
  return (
    <Section title="关于">
      <div className="space-y-2 text-sm leading-relaxed">
        <p>Crosscheck：先写自己现在怎么做，再看原书怎么说，最后记下要不要做。书和你都不是标准答案，只是互相核对一遍，「存疑」也是正当的结论。</p>
        <p>内容来自 <a className="text-teal underline" href="https://eternity4719.github.io/HowToLiveBetter/" target="_blank" rel="noopener noreferrer">高性价比人生指南</a>，作者 eternity4719（<a className="text-teal underline" href={u.repo} target="_blank" rel="noopener noreferrer">原仓库</a>），按 <a className="text-teal underline" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> 使用。</p>
        <p>修改说明：本 App 只把原书转换成卡片格式，没有改写正文；每条的提问由 Crosscheck 按固定模板生成，不来自原作者。</p>
        <p className="text-muted">内容版本：原书提交 <code>{u.commit.slice(0, 7)}</code>（{u.commitDate.slice(0, 10)}），同步于 {index.generatedAt.slice(0, 10)}，共 {index.items.length} 条。</p>
        <p className="text-muted">内容可能过时或有错。本 App 不提供医疗、法律、投资建议；政策各地执行不一，办事以当地部门、医生、律师为准。原书的错误请到 <a className="text-teal underline" href={`${u.repo}/issues`} target="_blank" rel="noopener noreferrer">原仓库提 issue</a>。</p>
        <p className="text-muted">个人数据只存在本机浏览器，不上传。GitHub Pages 和备用地址的数据不互通，换地址请用导出 / 导入。</p>
      </div>
    </Section>
  );
}
