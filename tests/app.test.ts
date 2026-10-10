import { describe, it, expect } from 'vitest';
import { nextItem, newByChapter, resolveEntries } from '../src/lib/deck';
import { computeStats, monthly, rate } from '../src/lib/stats';
import { applyFilters, emptyFilters } from '../src/lib/filter';
import { mergeEntries, validateBackup } from '../src/lib/backup';
import { decode, encode } from '../src/lib/duel';
import { parseHash } from '../src/lib/router';
import type { Entry, LightItem } from '../src/lib/types';

const it_ = (chapter: number, ordinal: number, extra: Partial<LightItem> = {}): LightItem => ({
  id: `${chapter}-${ordinal}`, chapter, ordinal, title: `标题${chapter}-${ordinal}`, plain: '',
  tags: { money: '0', time: '少', will: '否', level: '大', lens: '金钱' }, grade: 'A', value: '极高',
  flags: { disputed: false, todo: false }, since: '2026-10-01', aliases: [], ...extra,
});
const en = (itemId: string, extra: Partial<Entry> = {}): Entry => ({ itemId, thoughts: [], actionHistory: [], updatedAt: '2026-10-05', ...extra });
const items = [it_(1, 1), it_(1, 2), it_(2, 1, { value: '高', tags: { money: '0', time: '少', will: '否', level: '中', lens: '死亡率' } }), it_(3, 1, { since: '2026-10-09' })];

describe('继续翻：一章一章翻', () => {
  it('从当前章开始，跳过已标行动的', () => {
    const m = new Map([['1-1', en('1-1', { action: 'done' })]]);
    expect(nextItem(items, m, 1)?.id).toBe('1-2');
  });
  it('本章翻完进入下一章，最后一章后回到第 1 章', () => {
    const m = new Map([['1-1', en('1-1', { action: 'na' })], ['1-2', en('1-2', { action: 'plan' })]]);
    expect(nextItem(items, m, 1)?.id).toBe('2-1');
    expect(nextItem(items, new Map(), 3)?.id).toBe('3-1');
    const m2 = new Map([['3-1', en('3-1', { action: 'done' })]]);
    expect(nextItem(items, m2, 3)?.id).toBe('1-1');
  });
  it('只写了想法、没标行动的仍会出现', () => {
    const m = new Map([['1-1', en('1-1', { thoughts: [{ text: 'x', at: '2026-10-05' }] })]]);
    expect(nextItem(items, m, 1)?.id).toBe('1-1');
  });
  it('全部标完返回空', () => {
    expect(nextItem(items, new Map(items.map(i => [i.id, en(i.id, { action: 'done' })])), 1)).toBeUndefined();
  });
  it('安装之后才出现的条目算新增', () => {
    expect([...newByChapter(items, new Map(), '2026-10-05').keys()]).toEqual([3]);
  });
  it('旧 id 的记录按 aliases 挂到新 id', () => {
    const its = [it_(1, 1, { id: 'new', aliases: ['old'] })];
    const m = resolveEntries(its, [en('old', { action: 'done' })]);
    expect(m.get('new')?.action).toBe('done');
  });
});

describe('统计', () => {
  it('不适用不进分母，口径分开', () => {
    const m = new Map([['1-1', en('1-1', { action: 'done', compare: 'new', thoughts: [{ text: 'a', at: '2026-10-01' }] })], ['1-2', en('1-2', { action: 'na' })]]);
    const { all, byLens } = computeStats(items, m);
    expect(all.done).toBe(1);
    expect(all.new).toBe(1);
    expect(rate(all)).toBeCloseTo(1 / 3);
    expect(byLens['金钱'].done).toBe(1);
    expect(byLens['死亡率'].done).toBe(0);
  });
  it('每月趋势从第一次使用画到本月', () => {
    const r = monthly([en('a', { action: 'done', actionAt: '2026-08-20', thoughts: [{ text: 'x', at: '2026-08-19' }] })], '2026-10-10');
    expect(r).toEqual([{ month: '2026-08', done: 1, thoughts: 1 }, { month: '2026-09', done: 0, thoughts: 0 }, { month: '2026-10', done: 0, thoughts: 0 }]);
  });
});

describe('筛选：同组或、组间且', () => {
  it('组合筛选', () => {
    const f = emptyFilters();
    f.value.add('极高'); f.lens.add('金钱'); f.lens.add('死亡率');
    expect(applyFilters(items, f, new Map()).map(i => i.id)).toEqual(['1-1', '1-2', '3-1']);
    f.state.add('done');
    expect(applyFilters(items, f, new Map([['1-2', en('1-2', { action: 'done' })]])).map(i => i.id)).toEqual(['1-2']);
  });
  it('还没看', () => {
    const f = emptyFilters(); f.state.add('none');
    expect(applyFilters(items, f, new Map([['1-1', en('1-1', { skipped: true })]])).map(i => i.id)).toEqual(['1-2', '2-1', '3-1']);
  });
});

describe('备份', () => {
  it('拒绝损坏或别的文件', () => {
    expect(validateBackup(null).ok).toBe(false);
    expect(validateBackup({ app: 'other' }).ok).toBe(false);
    expect(validateBackup({ app: 'crosscheck', schema: 99, entries: [] }).ok).toBe(false);
    expect(validateBackup({ app: 'crosscheck', schema: 1, entries: [{ itemId: 'x' }] }).ok).toBe(false);
    expect(validateBackup({ app: 'crosscheck', schema: 1, entries: [en('x')], duels: [], meta: [] }).ok).toBe(true);
  });
  it('合并保留较新的记录，想法去重合并', () => {
    const a = en('x', { action: 'plan', updatedAt: '2026-10-01', thoughts: [{ text: 'a', at: '2026-09-01' }] });
    const b = en('x', { action: 'done', updatedAt: '2026-10-05', thoughts: [{ text: 'a', at: '2026-09-01' }, { text: 'b', at: '2026-10-05' }] });
    const [m] = mergeEntries([a], [b]);
    expect(m.action).toBe('done');
    expect(m.thoughts.map(t => t.text)).toEqual(['a', 'b']);
  });
});

describe('盲答链接', () => {
  it('编码解码往返，超长和篡改被拒', () => {
    const p = { v: 1 as const, k: 'q' as const, id: '05-3d14aedd', a: '我从来不买彩票，<b>真的</b>', n: '一米', t: '2026-10-10' };
    expect(decode(encode(p))).toEqual(p);
    expect(decode(encode({ ...p, a: 'x'.repeat(201) }))).toBeNull();
    expect(decode(encode(p).slice(0, 20))).toBeNull();
    expect(decode('不是数据')).toBeNull();
    expect(decode(encode({ ...p, v: 2 } as never))).toBeNull();
  });
  it('200 字中文答案的链接长度', () => {
    const d = encode({ v: 1, k: 'r', id: '05-3d14aedd', a: '我'.repeat(200), n: '一米', f: '你'.repeat(200), fn: '朋友', t: '2026-10-10' });
    expect(d.length).toBeLessThan(2000);
  });
});

describe('路由', () => {
  it('解析各页面', () => {
    expect(parseHash('#/')).toEqual({ name: 'home' });
    expect(parseHash('#/ch/5')).toEqual({ name: 'chapter', num: 5 });
    expect(parseHash('#/item/05-abc')).toEqual({ name: 'item', id: '05-abc' });
    expect(parseHash('#/duel/05-abc?d=xyz')).toEqual({ name: 'duel', id: '05-abc', data: 'xyz' });
  });
});
