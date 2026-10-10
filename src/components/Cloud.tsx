import { useEffect, useRef, useState } from 'react';
import { useStore, useLive } from '../lib/store';
import { db } from '../lib/db';
import { connect, disconnect, pullOnStart, push, TOKEN_URL, type CloudState } from '../lib/cloud';
import { backupSig, shareBackup } from '../lib/backup';
import { today } from '../lib/date';
import type { Duel } from '../lib/types';

// 挂在 App 根部：启动时拉一次云端；之后记录一变，3 秒后自动存上去；切到后台时立即存
export function CloudSync() {
  const { meta } = useStore();
  const connected = !!meta.cloud;
  const sig = useLive(async () => {
    const [n, last, d] = await Promise.all([db.entries.count(), db.entries.orderBy('updatedAt').last(), db.duels.count()]);
    // updatedAt 只精确到天，再拼上全部条目的内容长度兜底
    const all = await db.entries.toArray();
    return `${n}|${last?.updatedAt}|${d}|${all.reduce((s, e) => s + JSON.stringify(e).length, 0)}`;
  }, '');
  const first = useRef(true);

  useEffect(() => { if (connected) pullOnStart(); }, [connected]);
  useEffect(() => {
    if (!connected || !sig) return;
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => push(), 3000);
    return () => clearTimeout(t);
  }, [sig, connected]);
  useEffect(() => {
    if (!connected) return;
    const on = () => { if (document.visibilityState === 'hidden') push(); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [connected]);
  return null;
}

// 首页提醒：有没备份的新记录时出现，点一下发到微信。开了 GitHub 自动备份就不提醒。
// 分享面板必须由用户点按钮触发，浏览器不允许自动弹出。
export function BackupNudge() {
  const { meta, rawEntries, index } = useStore();
  const duels = useLive(() => db.duels.toArray(), [] as Duel[]);
  const [msg, setMsg] = useState('');
  const cloud = meta.cloud as CloudState | undefined;
  const broken = cloud?.lastError === '密钥无效或已过期';
  if (cloud && !broken) return null;
  const sig = backupSig(rawEntries, duels);
  const never = !meta.lastShareSig;
  const days = meta.lastExportAt ? (Date.parse(today()) - Date.parse(meta.lastExportAt as string)) / 864e5 : Infinity;
  const marks = rawEntries.filter(e => e.thoughts.length || e.action).length;
  const due = sig !== meta.lastShareSig && (never ? marks >= 1 : days >= 7);
  if (msg) return <p className="rounded-xl bg-teal/10 px-4 py-2.5 text-sm text-teal">{msg}</p>;
  if (!due) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-warn/50 bg-warn/10 px-4 py-2.5 text-sm">
      <span className="text-warn">{never ? '记录只存在这台手机上，删掉 App 就没了。' : `有新记录还没备份（上次 ${meta.lastExportAt}）。`}</span>
      <button className="btn-primary shrink-0 !py-1.5" onClick={async () => {
        const r = await shareBackup(index.upstream.commit);
        if (r === 'shared') setMsg('已备份。选的是「文件传输助手」的话，在微信里就能找到这份文件。');
        if (r === 'downloaded') setMsg('备份文件已下载到手机。');
      }}>发到微信</button>
    </div>
  );
}

export function CloudSection() {
  const { meta } = useStore();
  const state = meta.cloud as CloudState | undefined;
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const go = async () => {
    setBusy(true); setErr('');
    try { await connect(token); setToken(''); }
    catch (e) { setErr((e as Error).message === 'Failed to fetch' ? '连不上 GitHub，检查网络后再试' : (e as Error).message); }
    setBusy(false);
  };

  if (state && state.lastError !== '密钥无效或已过期') {
    return (
      <section id="backup" className="rounded-card bg-card p-4">
        <h2 className="mb-2 font-serif text-lg font-semibold">自动备份</h2>
        <p className="text-sm">已开启，存在 GitHub 账号 <b>{state.login}</b> 下的私密位置。每次标记后自动保存，删掉 App、换手机后连同一个账号就能恢复。</p>
        <p className="mt-1 text-xs text-muted">
          {state.lastError ? <span className="text-warn">上次保存失败：{state.lastError}，联网后会自动重试。</span>
            : state.lastSaved ? `上次保存：${new Date(state.lastSaved).toLocaleString('zh-CN', { hour12: false })}` : '正在保存…'}
        </p>
        <div className="mt-3 flex gap-2">
          <button className="btn-ghost" onClick={() => push()}>立即保存</button>
          <button className="btn-ghost text-muted" onClick={() => disconnect()}>关闭自动备份</button>
        </div>
      </section>
    );
  }
  return (
    <details id="backup" className="rounded-card bg-card p-4" open={!!state}>
      <summary className="cursor-pointer font-serif text-lg font-semibold">{state ? '自动备份的密钥失效了，重新连一下' : '自动备份到 GitHub（需要能访问 GitHub）'}</summary>
      <p className="text-sm">记录会自动存到你自己的 GitHub 账号里（私密，只有你能看到），删掉 App、换手机都能恢复。只需要做一次：</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
        <li><a href={TOKEN_URL} target="_blank" rel="noopener noreferrer" className="text-teal underline">点这里打开 GitHub</a>，把 Expiration 改成 No expiration（不然 30 天后失效），拉到最下面点绿色的 Generate token，再点复制。</li>
        <li>回到这里粘贴，点「开启」。</li>
      </ol>
      <input value={token} onChange={e => setToken(e.target.value)} placeholder="粘贴以 ghp_ 开头的密钥" autoComplete="off" spellCheck={false}
        className="mt-3 w-full rounded-full border border-line bg-paper px-4 py-2 font-mono" />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted">密钥只存在这台手机，只能读写备份，不能动你的仓库。</span>
        <button className="btn-primary" disabled={!token.trim() || busy} onClick={go}>{busy ? '连接中…' : '开启'}</button>
      </div>
      {err && <p className="mt-2 text-sm text-warn">{err}</p>}
    </details>
  );
}
