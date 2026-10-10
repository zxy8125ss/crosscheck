// M0 内容审计：统计上游 book/ 的真实结构，核对解析假设。只读，不改上游。
// 用法：node scripts/audit.mjs <上游仓库路径>
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.argv[2] || '../upstream');
const files = readdirSync(resolve(ROOT, 'book')).filter(f => /^\d\d-.*\.md$/.test(f)).sort();
const COST_W = { money: { '0': 0, '少': 1, '多': 2 }, time: { '少': 0, '中': 1, '多': 2 }, will: { '否': 0, '些': 1, '是': 2 } };
const FIELD = /^- (成本|说人话|收益|证据等级|来源|备注)：(.*)$/;

const out = { sections: [], items: [], problems: [] };
const tally = (obj, k) => { obj[k] = (obj[k] || 0) + 1; };
const stats = { grade: {}, money: {}, time: {}, will: {}, level: {}, lens: {}, ratio: {}, tagKeys: {} };
let strayLines = 0, h1Mismatch = 0;

for (const f of files) {
  const num = Number(f.slice(0, 2));
  const lines = readFileSync(resolve(ROOT, 'book', f), 'utf8').split(/\r?\n/);
  const sec = { num, file: f, title: null, introParas: 0, items: 0 };
  let item = null, seenItem = false, prevNum = 0;
  const flush = () => { if (item) { out.items.push(item); sec.items++; } item = null; };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if ((m = /^# (\d+)\. (.+)$/.exec(line))) { sec.title = m[2]; if (Number(m[1]) !== num) h1Mismatch++; continue; }
    if ((m = /^### (\d+)\. (.+)$/.exec(line))) {
      flush(); seenItem = true;
      const n = Number(m[1]);
      if (n !== prevNum + 1) out.problems.push(`${f}: 条号不连续 ${prevNum} → ${n}`);
      prevNum = n;
      item = { sec: num, n, title: m[2].trim(), fields: {}, tags: null, extra: 0 };
      continue;
    }
    if (!item) { if (!seenItem && line && !line.startsWith('[') && !line.startsWith('#')) sec.introParas++; continue; }
    if ((m = /^<!--\s*成本标签:\s*(.*?)\s*-->/.exec(line))) {
      item.tags = {};
      for (const kv of m[1].split(/\s+/)) { const [k, v] = kv.split('='); item.tags[k] = v; tally(stats.tagKeys, k); }
      continue;
    }
    if ((m = FIELD.exec(line))) {
      if (item.fields[m[1]] !== undefined) out.problems.push(`${f} 第 ${item.n} 条: 字段「${m[1]}」重复`);
      item.fields[m[1]] = m[2];
      continue;
    }
    if (line.trim() && !/^#{1,2} /.test(line)) { item.extra++; strayLines++; }
    if (/^#{1,2} /.test(line)) flush();
  }
  flush();
  out.sections.push(sec);
}

for (const it of out.items) {
  const id = `${it.sec} 节第 ${it.n} 条`;
  for (const k of ['成本', '说人话', '收益', '证据等级', '来源']) if (!it.fields[k]) out.problems.push(`${id}: 缺「${k}」`);
  if (!it.tags) { out.problems.push(`${id}: 缺成本标签`); continue; }
  const g = /^\s*([ABC])/.exec(it.fields['证据等级'] || '');
  tally(stats.grade, g ? g[1] : '无');
  const t = it.tags;
  tally(stats.money, t['钱']); tally(stats.time, t['时间']); tally(stats.will, t['毅力']); tally(stats.level, t['收益']); tally(stats.lens, t['口径']);
  const cs = (COST_W.money[t['钱']] ?? 0) + (COST_W.time[t['时间']] ?? 0) + (COST_W.will[t['毅力']] ?? 0);
  const ratio = t['收益'] === '大' ? (cs === 0 ? '极高' : cs <= 2 ? '高' : '一般') : t['收益'] === '中' ? (cs === 0 ? '高' : '一般') : '一般';
  tally(stats.ratio, ratio);
  it.dispute = /^争议/.test(it.fields['备注'] || '');
  it.todo = /待核实|TODO/.test(['来源', '收益', '备注', '成本'].map(k => it.fields[k] || '').join(''));
}

// 标题重复（影响按标题生成 id）
const norm = s => s.replace(/[\s\p{P}\p{S}]/gu, '');
const seen = new Map(); const dupTitles = [];
for (const it of out.items) { const k = `${it.sec}|${norm(it.title)}`; if (seen.has(k)) dupTitles.push(`${it.sec} 节：「${it.title}」第 ${seen.get(k)} 与第 ${it.n} 条`); else seen.set(k, it.n); }

const len = k => out.items.map(i => (i.fields[k] || '').length);
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) * p)]; };
const indexBytes = Buffer.byteLength(JSON.stringify(out.items.map(i => ({ id: '00-00000000', s: i.sec, o: i.n, t: i.title, p: i.fields['说人话'] || '', g: i.fields['证据等级']?.[0], tg: i.tags }))));
const fullBytes = Buffer.byteLength(JSON.stringify(out.items));
const docs = readdirSync(resolve(ROOT, 'docs')).filter(f => f.endsWith('.md') && f !== '引用对照.md');
const refsMd = readFileSync(resolve(ROOT, 'docs/引用对照.md'), 'utf8');
const refCount = /共 (\d+) 处引用/.exec(refsMd)?.[1];
const ppl = out.items.filter(i => !i.fields['说人话']).length;

console.log(JSON.stringify({
  sections: out.sections.length,
  sectionList: out.sections.map(s => `${s.num} ${s.title}（${s.items} 条，节首 ${s.introParas} 段）`),
  items: out.items.length,
  h1Mismatch, strayLines,
  disputes: out.items.filter(i => i.dispute).length,
  todos: out.items.filter(i => i.todo).length,
  missingPlain: ppl,
  stats,
  lengths: Object.fromEntries(['标题', '说人话', '收益', '来源', '备注'].map(k => {
    const a = k === '标题' ? out.items.map(i => i.title.length) : len(k);
    return [k, { p50: pct(a, .5), p90: pct(a, .9), max: Math.max(...a) }];
  })),
  dupTitles,
  bytes: { indexJsonApprox: indexBytes, fullJsonApprox: fullBytes },
  docs, refCount,
  problems: out.problems,
}, null, 2));
