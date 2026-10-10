// 「继续翻」的顺序：一章一章翻。纯函数，便于单测。
import type { Entry, LightItem } from './types';

export const isDone = (e?: Entry) => !!e?.action;

// 从 startChapter 开始，按章节、条号找第一条没标行动的；本章翻完进入下一章，到最后一章后回到第 1 章
export function nextItem(items: LightItem[], entries: Map<string, Entry>, startChapter: number): LightItem | undefined {
  const sorted = [...items].sort((a, b) => a.chapter - b.chapter || a.ordinal - b.ordinal);
  const after = sorted.filter(i => i.chapter >= startChapter);
  const before = sorted.filter(i => i.chapter < startChapter);
  return [...after, ...before].find(i => !isDone(entries.get(i.id)));
}

// 第一次打开之后才出现、还没处理的条目，按章节计数
export function newByChapter(items: LightItem[], entries: Map<string, Entry>, installedAt: string): Map<number, LightItem[]> {
  const out = new Map<number, LightItem[]>();
  for (const i of items) {
    if (i.since > installedAt && !isDone(entries.get(i.id))) {
      out.set(i.chapter, [...(out.get(i.chapter) ?? []), i]);
    }
  }
  return out;
}

// 按 aliases 把个人记录挂到现在的 id 上（原书改了标题时用）
export function resolveEntries(items: LightItem[], raw: Entry[]): Map<string, Entry> {
  const alias = new Map<string, string>();
  for (const i of items) for (const a of i.aliases) alias.set(a, i.id);
  const out = new Map<string, Entry>();
  for (const e of raw) {
    const id = alias.get(e.itemId) ?? e.itemId;
    const prev = out.get(id);
    if (!prev || prev.updatedAt < e.updatedAt) out.set(id, { ...e, itemId: id });
  }
  return out;
}
