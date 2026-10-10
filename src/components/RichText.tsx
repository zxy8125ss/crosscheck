// 渲染原文：把「第 X 条」交叉引用变成链接，网址变成外链，**加粗**变成粗体。
// 只改呈现，不改一个字；全部走 React 文本节点，不用 innerHTML。
import type { ReactNode } from 'react';
import type { RefSpan } from '../lib/types';
import { itemHref } from '../lib/router';

const URL_RE = /https?:\/\/[^\s<>）)」』，；。、]+/g;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  // 先去掉网址两侧的尖括号（Markdown 自动链接写法）
  const t = text.replace(/<(https?:\/\/[^>\s]+)>/g, '$1').replace(/\\([*_])/g, '$1');
  let last = 0, k = 0;
  for (const m of t.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,]+$/, '');
    out.push(...bold(t.slice(last, m.index), `${key}-${k++}`));
    out.push(<a key={`${key}-u${k++}`} href={url} target="_blank" rel="noopener noreferrer" className="text-teal underline decoration-dotted break-all">{url}</a>);
    last = m.index! + url.length;
  }
  out.push(...bold(t.slice(last), `${key}-${k++}`));
  return out;
}

function bold(text: string, key: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((s, i) => (i % 2 ? <strong key={`${key}-b${i}`}>{s}</strong> : s));
}

export function RichText({ text, refs, className }: { text: string; refs?: RefSpan[]; className?: string }) {
  if (!text) return null;
  const parts: ReactNode[] = [];
  let last = 0;
  (refs ?? []).forEach((r, i) => {
    if (r.start < last) return;
    parts.push(...inline(text.slice(last, r.start), `t${i}`));
    parts.push(
      <a key={`r${i}`} href={itemHref(r.targets[0])} className="text-pine underline decoration-dashed underline-offset-2">
        {text.slice(r.start, r.end)}
      </a>,
    );
    last = r.end;
  });
  parts.push(...inline(text.slice(last), 'end'));
  return <span className={className}>{parts}</span>;
}
