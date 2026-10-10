// 解析上游 book/*.md，产出章节与条目。纯函数，不读写文件，方便单测。
//
// 交叉引用的识别规则移植自上游 tools/check-refs.mjs：
//   Copyright (c) 2026 eternity4719 — MIT License
//   https://github.com/eternity4719/HowToLiveBetter/blob/main/LICENSE-CODE
import { createHash } from 'node:crypto';

export const FIELD_KEYS = { '成本': 'cost', '说人话': 'plain', '收益': 'benefit', '证据等级': 'gradeText', '来源': 'source', '备注': 'note' };
const FIELD_RE = /^- (成本|说人话|收益|证据等级|来源|备注)：(.*)$/;
const TAG_KEYS = { '钱': 'money', '时间': 'time', '毅力': 'will', '收益': 'level', '口径': 'lens' };
const COST_W = { money: { '0': 0, '少': 1, '多': 2 }, time: { '少': 0, '中': 1, '多': 2 }, will: { '否': 0, '些': 1, '是': 2 } };

export const sha1 = s => createHash('sha1').update(s).digest('hex');
export const normTitle = s => s.replace(/[\s\p{P}\p{S}]/gu, '');
export const pad2 = n => String(n).padStart(2, '0');
export const makeId = (chapter, title) => `${pad2(chapter)}-${sha1(normTitle(title)).slice(0, 8)}`;

export function valueTier(tags) {
  const cs = (COST_W.money[tags.money] ?? 0) + (COST_W.time[tags.time] ?? 0) + (COST_W.will[tags.will] ?? 0);
  if (tags.level === '大') return cs === 0 ? '极高' : cs <= 2 ? '高' : '一般';
  if (tags.level === '中') return cs === 0 ? '高' : '一般';
  return '一般';
}

export function extractUrls(text) {
  return [...(text || '').matchAll(/https?:\/\/[^\s<>）)」』，；。、]+/g)].map(m => m[0].replace(/[.,]+$/, ''));
}

// files: [{ name: '05-不要浪费钱.md', text }]
export function parseBook(files) {
  const chapters = [];
  const items = [];
  const problems = [];
  for (const { name, text } of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    const num = Number(name.slice(0, 2));
    const ch = { num, title: null, intro: [], file: `book/${name}` };
    let item = null;
    const flush = () => { if (item) items.push(item); item = null; };
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trimEnd();
      let m;
      if ((m = /^# (\d+)\. (.+)$/.exec(line))) {
        ch.title = m[2].trim();
        if (Number(m[1]) !== num) problems.push(`${name}: 一级标题序号 ${m[1]} 与文件名 ${num} 不一致`);
        continue;
      }
      if ((m = /^### (\d+)\. (.+)$/.exec(line))) {
        flush();
        item = { chapter: num, ordinal: Number(m[1]), title: m[2].trim(), tags: null, cost: '', plain: '', benefit: '', gradeText: '', source: '', note: '' };
        continue;
      }
      if (/^#{1,2} /.test(line)) { flush(); continue; }
      if (!item) {
        // 节首导读：第一条之前的非空段落，跳过「← 回总目录」这类导航
        if (line.trim() && !/^\[←/.test(line) && !/^#/.test(line)) ch.intro.push(line);
        continue;
      }
      if ((m = /^<!--\s*成本标签:\s*(.*?)\s*-->/.exec(line))) {
        item.tags = {};
        for (const kv of m[1].split(/\s+/)) { const [k, v] = kv.split('='); if (TAG_KEYS[k]) item.tags[TAG_KEYS[k]] = v; }
        continue;
      }
      if ((m = FIELD_RE.exec(line))) { item[FIELD_KEYS[m[1]]] = m[2]; continue; }
      if (line.trim()) problems.push(`${name} 第 ${item.ordinal} 条: 无法识别的行「${line.slice(0, 30)}」`);
    }
    flush();
    if (!ch.title) problems.push(`${name}: 缺一级标题`);
    chapters.push(ch);
  }

  for (const it of items) {
    const g = /^\s*([ABC])/.exec(it.gradeText);
    it.grade = g ? g[1] : '';
    it.disputed = /^争议/.test(it.note);
    it.todo = /待核实|TODO/.test(it.cost + it.benefit + it.source + it.note);
    it.value = it.tags ? valueTier(it.tags) : '一般';
    it.sources = extractUrls(it.source);
    it.id = makeId(it.chapter, it.title);
    it.sourcePath = chapters.find(c => c.num === it.chapter).file;
    it.hash = sha1([it.title, JSON.stringify(it.tags), it.cost, it.plain, it.benefit, it.gradeText, it.source, it.note].join('\u0000')).slice(0, 16);
    delete it.gradeText;
  }

  const refProblems = resolveRefs(chapters, items);
  for (const ch of chapters) ch.count = items.filter(i => i.chapter === ch.num).length;
  return { chapters, items, problems, refProblems };
}

// ---------- 交叉引用（移植自上游 tools/check-refs.mjs） ----------
const SPEC = '[\\d、,\\s]+?(?:(?:到|至)\\s*第?\\s*\\d+)?';
const RANGE = /^\s*(\d+)\s*(?:到|至)\s*第?\s*(\d+)\s*$/;
const CITE = /(《[^》]*》|〔[^〕]*〕|\d+\s*号|该(?:解释|意见|办法|规定|条例|通知|法)|[^\s，。；：、（）「」]{0,8}(?:法|条例|办法|规定|准则|细则|公约))$/;
// 节内裸引用只在这几栏找（来源栏的「第 N 条」几乎都是法条）；跨节引用来源栏也找
const IN_FIELDS = ['cost', 'plain', 'benefit', 'note'];
const CROSS_FIELDS = ['cost', 'plain', 'benefit', 'note', 'source'];

const nums = s => {
  const out = [];
  for (const part of s.split(/[、,]/)) {
    const r = RANGE.exec(part);
    if (r) { const [a, b] = [Number(r[1]), Number(r[2])]; if (b >= a && b - a <= 30) for (let i = a; i <= b; i++) out.push(i); continue; }
    const n = Number(part.trim());
    if (part.trim() && Number.isFinite(n)) out.push(n);
  }
  return out;
};

// 在一段文字里找引用，返回 [{start, end, targets:[id]}]；start/end 是 JS 字符串下标
export function findRefs(text, { chapter, ordinal, inEntryField, crossField, byPos }) {
  const spans = [];
  const problems = [];
  if (crossField) {
    for (const m of text.matchAll(new RegExp(`第\\s*(\\d+)\\s*节第\\s*(${SPEC})\\s*条`, 'g'))) {
      const sec = Number(m[1]);
      const targets = nums(m[2]).map(x => byPos.get(`${sec}|${x}`)).filter(Boolean);
      if (targets.length) spans.push({ start: m.index, end: m.index + m[0].length, targets });
      else problems.push(`第 ${chapter} 节第 ${ordinal ?? '节首'}：「${m[0]}」指向不存在的条目`);
    }
  }
  if (!inEntryField) return { spans, problems };
  const crossRe = new RegExp(`第\\s*\\d+\\s*节第\\s*${SPEC}\\s*条`, 'g');
  const taken = spans.map(s => [s.start, s.end]);
  for (const m of text.matchAll(new RegExp(`第\\s*(${SPEC})\\s*条`, 'g'))) {
    const start = m.index, end = start + m[0].length;
    if (taken.some(([a, b]) => start < b && end > a)) continue;
    // 跨节写法里的「第 X 条」部分已经处理过
    const before = text.slice(0, start);
    if (/第\s*\d+\s*节$/.test(before)) continue;
    const tail = before.replace(crossRe, '').replace(/\s+$/, '');
    if (CITE.test(tail)) continue;
    const xs = nums(m[1]);
    const targets = xs.map(x => byPos.get(`${chapter}|${x}`)).filter(Boolean);
    if (targets.length === xs.length && targets.length) spans.push({ start, end, targets });
    else if (xs.length) problems.push(`第 ${chapter} 节第 ${ordinal ?? '节首'}：「${m[0]}」本节没有这一条（可能是法条条款号）`);
  }
  spans.sort((a, b) => a.start - b.start);
  return { spans, problems };
}

function resolveRefs(chapters, items) {
  const byPos = new Map(items.map(i => [`${i.chapter}|${i.ordinal}`, i.id]));
  const problems = [];
  for (const it of items) {
    it.refs = {};
    for (const f of CROSS_FIELDS) {
      if (!it[f]) continue;
      const r = findRefs(it[f], { chapter: it.chapter, ordinal: it.ordinal, inEntryField: IN_FIELDS.includes(f), crossField: true, byPos });
      problems.push(...r.problems);
      // 自引用不链接
      const spans = r.spans.map(s => ({ ...s, targets: s.targets.filter(t => t !== it.id) })).filter(s => s.targets.length);
      if (spans.length) it.refs[f] = spans;
    }
  }
  for (const ch of chapters) {
    ch.introRefs = ch.intro.map(p => findRefs(p, { chapter: ch.num, ordinal: null, inEntryField: true, crossField: true, byPos }).spans);
  }
  return problems;
}
