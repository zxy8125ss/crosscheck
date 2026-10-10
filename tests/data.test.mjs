import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseBook, valueTier, makeId, extractUrls } from '../scripts/parse.mjs';
import { reconcile, validate, similarity } from '../scripts/sync.mjs';
import { search } from '../src/shared/search.js';

const entry = (n, title, { plain = `说人话${n}`, note = '', benefit = '', tags = '钱=0 时间=少 毅力=否 收益=大 口径=金钱', grade = 'A', source = '来源 https://example.org/a' } = {}) => [
  `### ${n}. ${title}`,
  `<!-- 成本标签: ${tags} -->`,
  `- 成本：零`,
  `- 说人话：${plain}`,
  `- 收益：${benefit}`,
  `- 证据等级：${grade}`,
  `- 来源：${source}`,
  `- 备注：${note}`,
  '',
].join('\r\n'); // 故意用 CRLF，上游有 CRLF 文件

const ch = (num, title, intro, entries) => ({
  name: `${String(num).padStart(2, '0')}-${title}.md`,
  text: [`[← 回总目录](../README.md)`, '', `# ${num}. ${title}`, '', ...intro, '', ...entries].join('\r\n'),
});

const fixture = () => [
  ch(1, '不要早死', ['节首导读，第 2 条最重要。'], [
    entry(1, '系安全带', { note: '争议：有人反对。见第 2 条（戴头盔）。', benefit: '依据道路交通安全法第 51 条。' }),
    entry(2, '骑车戴头盔', { benefit: '见第 2 节第 1 条（不抽烟），以及第 1 到 2 条。', tags: '钱=少 时间=少 毅力=否 收益=大 口径=死亡率' }),
  ]),
  ch(2, '不要慢慢死', [], [
    entry(1, '不抽烟', { plain: '戒烟以后早死的概率低很多，越早戒越好。', note: '待核实：某数字', tags: '钱=0 时间=少 毅力=是 收益=中 口径=死亡率', grade: 'B' }),
  ]),
];

describe('parseBook', () => {
  const r = parseBook(fixture());
  it('解析章节、导读和条目（CRLF）', () => {
    expect(r.problems).toEqual([]);
    expect(r.chapters.map(c => [c.num, c.title, c.count])).toEqual([[1, '不要早死', 2], [2, '不要慢慢死', 1]]);
    expect(r.chapters[0].intro).toEqual(['节首导读，第 2 条最重要。']);
    const [a] = r.items;
    expect(a.title).toBe('系安全带');
    expect(a.tags).toEqual({ money: '0', time: '少', will: '否', level: '大', lens: '金钱' });
    expect(a.grade).toBe('A');
    expect(a.sources).toEqual(['https://example.org/a']);
  });
  it('争议看备注开头，待核实看全文', () => {
    expect(r.items[0].disputed).toBe(true);
    expect(r.items[2].disputed).toBe(false);
    expect(r.items[2].todo).toBe(true);
  });
  it('交叉引用：节内、跨节、区间、导读；跳过法条和自引用', () => {
    const [a, b, c] = r.items;
    expect(a.refs.note.map(s => s.targets)).toEqual([[b.id]]);
    expect(a.refs.benefit).toBeUndefined(); // 「道路交通安全法第 51 条」是法条
    expect(b.refs.benefit.map(s => s.targets)).toEqual([[c.id], [a.id]]); // 区间里的自己被去掉
    expect(r.chapters[0].introRefs[0].map(s => s.targets)).toEqual([[b.id]]);
    expect(r.refProblems).toEqual([]);
  });
});

describe('性价比档', () => {
  const t = (money, time, will, level) => valueTier({ money, time, will, level });
  it('与上游 index.html 规则一致', () => {
    expect(t('0', '少', '否', '大')).toBe('极高');
    expect(t('少', '中', '否', '大')).toBe('高');
    expect(t('多', '少', '否', '大')).toBe('高');
    expect(t('多', '中', '否', '大')).toBe('一般');
    expect(t('0', '少', '否', '中')).toBe('高');
    expect(t('0', '少', '些', '中')).toBe('一般');
    expect(t('0', '少', '否', '小')).toBe('一般');
  });
});

describe('稳定 id', () => {
  it('只取决于章节和标题，标点空格不影响', () => {
    expect(makeId(5, '不买彩票')).toBe(makeId(5, '不买 彩票。'));
    expect(makeId(5, '不买彩票')).not.toBe(makeId(6, '不买彩票'));
  });
  it('章中插入一条，其他条目 id 不变', () => {
    const before = parseBook(fixture()).items.map(i => i.id);
    const f = fixture();
    f[0].text = f[0].text.replace('### 1. 系安全带', `${entry(1, '新插的一条')}\r\n### 2. 系安全带`).replace('### 2. 骑车戴头盔', '### 3. 骑车戴头盔');
    const after = parseBook(f).items.map(i => i.id);
    expect(after).toHaveLength(4);
    for (const id of before) expect(after).toContain(id);
  });
  it('提取来源链接时去掉中文标点', () => {
    expect(extractUrls('见 <https://a.org/x>；另见 https://b.org/y。')).toEqual(['https://a.org/x', 'https://b.org/y']);
  });
});

describe('reconcile：比对与改名迁移', () => {
  const prev = parseBook(fixture()).items;
  reconcile(prev, [], '2026-10-01');
  const snapshot = prev.map(p => ({ id: p.id, title: p.title, plain: p.plain, hash: p.hash, aliases: p.aliases, since: p.since }));

  it('首次同步全部算新增，since 为当天', () => {
    expect(snapshot.every(p => p.since === '2026-10-01')).toBe(true);
  });
  it('标题改了：按说人话找回，旧 id 进 aliases，since 继承', () => {
    const f = fixture();
    f[1].text = f[1].text.replace('不抽烟', '别抽烟');
    const items = parseBook(f).items;
    const d = reconcile(items, snapshot, '2026-10-10');
    const moved = items.find(i => i.title === '别抽烟');
    const old = snapshot.find(p => p.title === '不抽烟');
    expect(moved.aliases).toEqual([old.id]);
    expect(moved.since).toBe('2026-10-01');
    expect(d.renamed).toHaveLength(1);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });
  it('真正的新增与删除', () => {
    const f = fixture();
    f[1].text = f[1].text.replace(/### 1\. 不抽烟[\s\S]*$/, entry(1, '完全不同的一条', { plain: '和原来那条毫无关系的说明文字内容' }));
    const items = parseBook(f).items;
    const d = reconcile(items, snapshot, '2026-10-10');
    expect(d.added).toHaveLength(1);
    expect(d.removed.map(r => r.title)).toEqual(['不抽烟']);
  });
  it('内容改了算修改', () => {
    const f = fixture();
    f[0].text = f[0].text.replace('争议：有人反对。', '争议：有人强烈反对。');
    const d = reconcile(parseBook(f).items, snapshot, '2026-10-10');
    expect(d.modified).toHaveLength(1);
  });
  it('相似度', () => {
    expect(similarity('戒烟以后早死的概率低很多', '戒烟以后早死的概率低很多')).toBe(1);
    expect(similarity('戒烟', '买房')).toBe(0);
  });
});

describe('validate：校验失败就中止', () => {
  it('正常数据通过', () => {
    expect(validate(parseBook(fixture()), 3)).toEqual([]);
  });
  it('条目数下降超过 5%', () => {
    expect(validate(parseBook(fixture()), 100).join()).toMatch(/降到/);
  });
  it('缺说人话、条号断号', () => {
    const f = fixture();
    f[0].text = f[0].text.replace(/- 说人话：说人话1\r\n/, '').replace('### 2. 骑车戴头盔', '### 3. 骑车戴头盔');
    const errs = validate(parseBook(f), 0).join('\n');
    expect(errs).toMatch(/缺「说人话」/);
    expect(errs).toMatch(/断号/);
  });
});

describe('搜索', () => {
  const items = parseBook(fixture()).items;
  it('多词 AND，标题优先', () => {
    // 「系安全带」的备注里提到戴头盔，排在标题命中之后
    expect(search(items, '头盔').map(i => i.title)).toEqual(['骑车戴头盔', '系安全带']);
    expect(search(items, '戒烟 早死').map(i => i.title)).toEqual(['不抽烟']);
    expect(search(items, '戒烟 头盔')).toEqual([]);
  });
  it('英文按整词', () => {
    const its = [{ title: '学会用 AED', plain: '' }, { title: 'paid 会员', plain: '' }];
    expect(search(its, 'aed').map(i => i.title)).toEqual(['学会用 AED']);
  });
});

// 用真实上游跑一遍，数字与上游 README 自己声明的统计比对（不写死在测试里）
const UP = resolve(process.env.UPSTREAM || '../upstream');
describe.skipIf(!existsSync(resolve(UP, 'book')))('真实上游', () => {
  const files = readdirSync(resolve(UP, 'book')).filter(f => /^\d\d-.*\.md$/.test(f)).map(name => ({ name, text: readFileSync(resolve(UP, 'book', name), 'utf8') }));
  const r = parseBook(files);
  const readme = readFileSync(resolve(UP, 'README.md'), 'utf8');
  const num = re => Number(re.exec(readme)?.[1]);
  it('没有解析问题，校验通过', () => {
    expect(r.problems).toEqual([]);
    expect(validate(r, 0)).toEqual([]);
  });
  it('条目数、A 级、极高、争议、待核实与 README 一致', () => {
    expect(r.items.length).toBe(num(/(\d+) 条建议/));
    expect(r.items.filter(i => i.grade === 'A').length).toBe(num(/A ?级 ?(\d+)/));
    expect(r.items.filter(i => i.value === '极高').length).toBe(num(/极高 ?(\d+)/));
    expect(r.items.filter(i => i.disputed).length).toBe(num(/(\d+) 条标注了争议/));
    expect(r.items.filter(i => i.todo).length).toBe(num(/(\d+) 处标注了 TODO/));
  });
  it('正文交叉引用数与上游对照表一致', () => {
    const t = readFileSync(resolve(UP, 'docs/引用对照.md'), 'utf8');
    let sec = '', rows = 0;
    for (const l of t.split('\n')) { if (l.startsWith('## ')) sec = l; else if (!sec.includes('docs/') && /^\| (?!出处|---)/.test(l)) rows++; }
    const mine = r.items.reduce((n, i) => n + Object.values(i.refs).flat().reduce((a, s) => a + s.targets.length, 0), 0)
      + r.chapters.reduce((n, c) => n + c.introRefs.flat().reduce((a, s) => a + s.targets.length, 0), 0);
    // 上游对照表含自引用行，我们不链接自引用
    const self = (t.match(/引用了它自己/g) || []).length;
    expect(mine).toBe(rows - self);
  });
});
