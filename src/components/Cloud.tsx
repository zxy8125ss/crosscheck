import { useEffect, useRef, useState } from 'react';
import { useStore, useLive } from '../lib/store';
import { db } from '../lib/db';
import { connect, disconnect, pullOnStart, push, TOKEN_URL, type CloudState } from '../lib/cloud';

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

// 首页提醒：有记录但没开自动备份
export function CloudNudge() {
  const { meta, rawEntries } = useStore();
  const broken = (meta.cloud as CloudState | undefined)?.lastError === '密钥无效或已过期';
  if ((meta.cloud && !broken) || rawEntries.length === 0) return null;
  if (broken) return <a href="#/me" className="block rounded-xl border border-warn/50 bg-warn/10 px-4 py-2.5 text-sm text-warn">自动备份停了：GitHub 密钥失效。点这里重新连接 →</a>;
  return (
    <a href="#/me" className="block rounded-xl border border-warn/50 bg-warn/10 px-4 py-2.5 text-sm text-warn">
      你的记录只存在这台手机上，删掉 App 就没了。点这里开启自动备份 →
    </a>
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
    <section id="backup" className="rounded-card border-2 border-warn/40 bg-card p-4">
      <h2 className="mb-2 font-serif text-lg font-semibold">{state ? '自动备份的密钥失效了，重新连一下' : '开启自动备份'}</h2>
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
    </section>
  );
}
