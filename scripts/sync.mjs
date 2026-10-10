// 拉取上游 → 解析 → 校验 → 稳定 id 与改名迁移 → 比对 → 输出 JSON 和报告。
//
//   node scripts/sync.mjs                       # 浅克隆上游到临时目录
//   node scripts/sync.mjs --upstream ../upstream  # 用本地已克隆的上游
//   选项：--out public/data  --reports reports  --force（上游没变也重新生成）
//
// 校验失败时退出码 1，不写任何输出文件，线上继续用上一版数据。
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { parseBook, pad2 } from './parse.mjs';

const UPSTREAM_URL = 'https://github.com/eternity4719/HowToLiveBetter';
const MAX_DROP = 0.05;
const SIMILAR = 0.8;

const arg = (name, def) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : def; };
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // 北京日期

// 说人话的相似度：字符二元组的 Dice 系数
const bigrams = s => { const t = s.replace(/[\s\p{P}\p{S}]/gu, ''); const out = new Map(); for (let i = 0; i + 1 < t.length; i++) { const b = t.slice(i, i + 2); out.set(b, (out.get(b) || 0) + 1); } return out; };
export function similarity(a, b) {
  const A = bigrams(a), B = bigrams(b);
  let inter = 0, na = 0, nb = 0;
  for (const v of A.values()) na += v;
  for (const v of B.values()) nb += v;
  for (const [k, v] of A) inter += Math.min(v, B.get(k) || 0);
  return na + nb ? (2 * inter) / (na + nb) : 0;
}

// 把新解析结果和上一版对上号：同 id 直接继承；剩下的按说人话相似度配对，旧 id 进 aliases
export function reconcile(items, prevItems, date) {
  const prevById = new Map(prevItems.map(p => [p.id, p]));
  const matched = new Set();
  const added = [], modified = [], renamed = [];
  const unmatchedNew = [];
  for (const it of items) {
    const p = prevById.get(it.id);
    if (p) {
      matched.add(p.id);
      it.aliases = p.aliases || [];
      it.since = p.since || date;
      if (p.hash !== it.hash) modified.push(it.id);
    } else unmatchedNew.push(it);
  }
  const pool = prevItems.filter(p => !matched.has(p.id));
  for (const it of unmatchedNew) {
    let best = null, score = 0;
    for (const p of pool) {
      if (matched.has(p.id)) continue;
      const s = similarity(it.plain, p.plain || '');
      if (s > score) { score = s; best = p; }
    }
    if (best && score >= SIMILAR) {
      matched.add(best.id);
      it.aliases = [...new Set([...(best.aliases || []), best.id])];
      it.since = best.since || date;
      renamed.push({ from: best.id, to: it.id, fromTitle: best.title, toTitle: it.title, score: Number(score.toFixed(3)) });
      if (best.hash !== it.hash) modified.push(it.id);
    } else {
      it.aliases = [];
      it.since = date;
      added.push(it.id);
    }
  }
  const removed = prevItems.filter(p => !matched.has(p.id)).map(p => ({ id: p.id, title: p.title }));
  return { added, modified, renamed, removed };
}

export function validate({ chapters, items, problems }, prevCount) {
  const errors = [...problems];
  if (prevCount && items.length < prevCount * (1 - MAX_DROP)) errors.push(`条目数从 ${prevCount} 降到 ${items.length}，超过 ${MAX_DROP * 100}%`);
  for (const it of items) {
    const where = `第 ${it.chapter} 节第 ${it.ordinal} 条`;
    if (!it.title) errors.push(`${where}: 缺标题`);
    if (!it.plain) errors.push(`${where}: 缺「说人话」`);
    if (!it.tags || ['money', 'time', 'will', 'level', 'lens'].some(k => !it.tags[k])) errors.push(`${where}: 成本标签不完整`);
  }
  const seen = new Set();
  for (const it of items) { if (seen.has(it.id)) errors.push(`id 重复：${it.id}`); seen.add(it.id); }
  chapters.forEach((c, i) => { if (c.num !== i + 1) errors.push(`章节编号断号：第 ${i + 1} 个文件是第 ${c.num} 节`); });
  for (const c of chapters) {
    const ords = items.filter(i => i.chapter === c.num).map(i => i.ordinal);
    ords.forEach((o, i) => { if (o !== i + 1) errors.push(`第 ${c.num} 节条号断号：第 ${i + 1} 个是第 ${o} 条`); });
  }
  if (!items.length) errors.push('一条都没解析出来');
  return errors;
}

const light = it => ({
  id: it.id, chapter: it.chapter, ordinal: it.ordinal, title: it.title, plain: it.plain,
  tags: it.tags, grade: it.grade, value: it.value,
  flags: { disputed: it.disputed, todo: it.todo }, since: it.since, aliases: it.aliases,
});
const full = it => ({
  ...light(it), cost: it.cost, benefit: it.benefit, source: it.source, sources: it.sources,
  note: it.note, refs: it.refs, sourcePath: it.sourcePath, hash: it.hash,
});

function readUpstream(dir) {
  const bookDir = join(dir, 'book');
  const files = readdirSync(bookDir).filter(f => /^\d\d-.*\.md$/.test(f)).map(name => ({ name, text: readFileSync(join(bookDir, name), 'utf8') }));
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).trim();
  return { files, commit: git('rev-parse', 'HEAD'), commitDate: git('log', '-1', '--format=%cI') };
}

function main() {
  const outDir = resolve(arg('--out', 'public/data'));
  const reportDir = resolve(arg('--reports', 'reports'));
  let upstream = arg('--upstream');
  if (!upstream) {
    upstream = mkdtempSync(join(tmpdir(), 'htlb-'));
    execFileSync('git', ['clone', '--depth', '1', UPSTREAM_URL, upstream], { stdio: 'inherit' });
  }
  const { files, commit, commitDate } = readUpstream(resolve(upstream));

  const prevVersionPath = join(outDir, 'version.json');
  const prevVersion = existsSync(prevVersionPath) ? JSON.parse(readFileSync(prevVersionPath, 'utf8')) : null;
  if (prevVersion?.upstream?.commit === commit && !process.argv.includes('--force')) {
    console.log(`上游没有变化（${commit.slice(0, 7)}），跳过。`);
    return;
  }
  const prevIndexPath = join(outDir, 'index.json');
  const prevItems = existsSync(prevIndexPath) ? JSON.parse(readFileSync(prevIndexPath, 'utf8')).items : [];
  // 比对内容哈希要用完整条目
  for (const p of prevItems) {
    const chPath = join(outDir, `ch-${pad2(p.chapter)}.json`);
    if (!p.hash && existsSync(chPath)) {
      const ch = JSON.parse(readFileSync(chPath, 'utf8'));
      p.hash = ch.items.find(x => x.id === p.id)?.hash;
    }
  }

  const parsed = parseBook(files);
  const date = today();
  const errors = validate(parsed, prevItems.length);
  if (errors.length) {
    console.error(`校验失败（${errors.length} 项），不输出任何文件：\n` + errors.slice(0, 50).join('\n'));
    process.exit(1);
  }
  const diff = reconcile(parsed.items, prevItems, date);
  const { chapters, items, refProblems } = parsed;

  mkdirSync(outDir, { recursive: true });
  mkdirSync(reportDir, { recursive: true });
  const upstreamInfo = { repo: UPSTREAM_URL, commit, commitDate };
  const write = (name, data) => writeFileSync(join(outDir, name), JSON.stringify(data));

  write('index.json', {
    generatedAt: new Date().toISOString(), upstream: upstreamInfo,
    chapters: chapters.map(c => ({ num: c.num, title: c.title, count: c.count })),
    items: items.map(light),
  });
  for (const c of chapters) {
    write(`ch-${pad2(c.num)}.json`, {
      num: c.num, title: c.title, intro: c.intro, introRefs: c.introRefs, sourcePath: c.file,
      items: items.filter(i => i.chapter === c.num).map(full),
    });
  }

  const count = (k) => items.reduce((o, i) => ((o[i[k]] = (o[i[k]] || 0) + 1), o), {});
  const stats = {
    chapters: chapters.length, items: items.length, grade: count('grade'), value: count('value'),
    disputed: items.filter(i => i.disputed).length, todo: items.filter(i => i.todo).length,
    refs: items.reduce((n, i) => n + Object.values(i.refs).flat().reduce((a, s) => a + s.targets.length, 0), 0)
      + chapters.reduce((n, c) => n + c.introRefs.flat().reduce((a, s) => a + s.targets.length, 0), 0),
  };
  write('version.json', { generatedAt: new Date().toISOString(), date, upstream: upstreamInfo, stats, diff });

  const lines = [
    `# 同步报告 ${date}`, '',
    `- 上游提交：\`${commit}\`（${commitDate}）`,
    `- 上一版：${prevVersion ? `\`${prevVersion.upstream.commit}\`` : '无（首次同步）'}`,
    `- ${stats.chapters} 节 ${stats.items} 条；A/B/C ${stats.grade.A ?? 0}/${stats.grade.B ?? 0}/${stats.grade.C ?? 0}；极高/高/一般 ${stats.value['极高'] ?? 0}/${stats.value['高'] ?? 0}/${stats.value['一般'] ?? 0}；争议 ${stats.disputed}；待核实 ${stats.todo}；交叉引用 ${stats.refs} 处`,
    '', `## 变化`, '',
    `- 新增 ${diff.added.length} 条，修改 ${diff.modified.length} 条，改名 ${diff.renamed.length} 条，删除 ${diff.removed.length} 条`,
    ...(prevItems.length ? diff.added.map(id => `  - 新增 ${id}「${items.find(i => i.id === id).title}」`) : []),
    ...diff.renamed.map(r => `  - 改名 ${r.from} → ${r.to}（相似度 ${r.score}）：「${r.fromTitle}」→「${r.toTitle}」`),
    ...diff.removed.map(r => `  - 删除 ${r.id}「${r.title}」（个人记录保留，前端标「原书已删除」）`),
    '', '## 交叉引用异常（不中止）', '',
    ...(refProblems.length ? refProblems.map(p => `- ${p}`) : ['无']),
  ];
  writeFileSync(join(reportDir, `sync-${date}.md`), lines.join('\n') + '\n');
  console.log(lines.slice(0, 8).join('\n'));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
