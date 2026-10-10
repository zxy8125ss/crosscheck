import type { ChapterFull, FullItem, IndexData, LightItem } from './types';

const BASE = import.meta.env.BASE_URL;
const pad2 = (n: number) => String(n).padStart(2, '0');

let indexPromise: Promise<IndexData> | null = null;
const chapterCache = new Map<number, Promise<ChapterFull>>();

export function loadIndex(): Promise<IndexData> {
  indexPromise ??= fetch(`${BASE}data/index.json`).then(r => {
    if (!r.ok) throw new Error(`加载目录失败：${r.status}`);
    return r.json();
  });
  return indexPromise;
}

export function loadChapter(num: number): Promise<ChapterFull> {
  let p = chapterCache.get(num);
  if (!p) {
    p = fetch(`${BASE}data/ch-${pad2(num)}.json`).then(r => {
      if (!r.ok) throw new Error(`加载第 ${num} 章失败：${r.status}`);
      return r.json();
    });
    p.catch(() => chapterCache.delete(num));
    chapterCache.set(num, p);
  }
  return p;
}

export async function loadAllChapters(): Promise<FullItem[]> {
  const idx = await loadIndex();
  const chs = await Promise.all(idx.chapters.map(c => loadChapter(c.num)));
  return chs.flatMap(c => c.items);
}

export async function loadItem(id: string): Promise<FullItem | undefined> {
  const it = await findLight(id);
  if (!it) return undefined;
  const ch = await loadChapter(it.chapter);
  return ch.items.find(x => x.id === it.id);
}

// 支持旧 id：按 aliases 找到现在的条目
export async function findLight(id: string): Promise<LightItem | undefined> {
  const idx = await loadIndex();
  return idx.items.find(i => i.id === id) ?? idx.items.find(i => i.aliases.includes(id));
}
