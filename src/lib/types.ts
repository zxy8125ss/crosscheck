export type Tags = { money: '0' | '少' | '多'; time: '少' | '中' | '多'; will: '否' | '些' | '是'; level: '大' | '中' | '小'; lens: '死亡率' | '金钱' | '时间' | '自由' };
export type Value = '极高' | '高' | '一般';

export interface LightItem {
  id: string; chapter: number; ordinal: number; title: string; plain: string;
  tags: Tags; grade: 'A' | 'B' | 'C' | ''; value: Value;
  flags: { disputed: boolean; todo: boolean }; since: string; aliases: string[];
}
export interface RefSpan { start: number; end: number; targets: string[] }
export type RefField = 'cost' | 'plain' | 'benefit' | 'note' | 'source';
export interface FullItem extends LightItem {
  cost: string; benefit: string; source: string; sources: string[]; note: string;
  refs: Partial<Record<RefField, RefSpan[]>>; sourcePath: string; hash: string;
}
export interface ChapterInfo { num: number; title: string; count: number }
export interface ChapterFull { num: number; title: string; intro: string[]; introRefs: RefSpan[][]; sourcePath: string; items: FullItem[] }
export interface IndexData {
  generatedAt: string; upstream: { repo: string; commit: string; commitDate: string };
  chapters: ChapterInfo[]; items: LightItem[];
}

export type Compare = 'same' | 'new' | 'doubt';
export type Action = 'done' | 'plan' | 'na';
export interface Thought { text: string; at: string }
export interface Entry {
  itemId: string;
  thoughts: Thought[];
  skipped?: boolean;
  compare?: Compare;
  action?: Action;
  actionAt?: string;
  actionHistory: { action: Action | null; at: string }[];
  note?: string;
  noteAt?: string;
  updatedAt: string;
}
export interface Duel { id?: number; itemId: string; friendName: string; myText: string; friendText: string; at: string }

export const LENS_LABEL: Record<Tags['lens'], string> = { '死亡率': '寿命', '金钱': '钱', '时间': '时间精力', '自由': '人身自由' };
export const LENSES: Tags['lens'][] = ['死亡率', '金钱', '时间', '自由'];
export const COMPARE_LABEL: Record<Compare, string> = { same: '所见略同', new: '未曾设想', doubt: '存疑' };
export const ACTION_LABEL: Record<Action, string> = { done: '做到了', plan: '打算', na: '不适用' };
// 「不要做 X」类条目，「做到了」改叫「我做到了」，表示一直没做 X
export const isNegative = (title: string) => /^(不|别|少|拒绝|远离|避免|戒)/.test(title);
export const actionLabel = (a: Action, title: string) => (a === 'done' && isNegative(title) ? '我做到了' : ACTION_LABEL[a]);
export const PROMPT = '你现在是怎么做的？为什么？';
