import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 隐私模式 */ } },
};

export function WeChatHint() {
  if (!/MicroMessenger/i.test(navigator.userAgent)) return null;
  return (
    <div className="sticky top-0 z-30 bg-bark px-4 py-2 text-center text-sm text-paper">
      微信里无法安装和长期保存，点右上角「…」→「在浏览器打开」
    </div>
  );
}

interface BIPEvent extends Event { prompt: () => Promise<void> }

export function InstallHint() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [hidden, setHidden] = useState(() => store.get('installHintHidden') === '1');
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone;
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    addEventListener('beforeinstallprompt', on);
    return () => removeEventListener('beforeinstallprompt', on);
  }, []);
  if (standalone || hidden || /MicroMessenger/i.test(navigator.userAgent) || (!evt && !ios)) return null;
  const close = () => { store.set('installHintHidden', '1'); setHidden(true); };
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-sand px-4 py-2.5 text-sm">
      {evt ? <span>装到主屏幕，像 App 一样离线用</span> : <span>装到主屏幕：Safari 底部「分享」→「添加到主屏幕」</span>}
      <div className="flex shrink-0 gap-2">
        {evt && <button className="btn-primary !py-1" onClick={() => evt.prompt().then(close)}>安装</button>}
        <button className="text-muted" onClick={close}>×</button>
      </div>
    </div>
  );
}

export function UpdateBanner() {
  const { needRefresh: [need], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) { if (reg) setInterval(() => reg.update(), 60 * 60 * 1000); },
  });
  if (!need) return null;
  return (
    <button onClick={() => updateServiceWorker(true)} className="sticky top-0 z-30 w-full bg-teal px-4 py-2 text-center text-sm text-paper">
      内容已更新，点击刷新
    </button>
  );
}
