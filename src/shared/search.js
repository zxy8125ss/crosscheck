// 搜索：本地全文子串匹配（构建测试和浏览器共用）。
// 全书只有几百条，逐条 includes 足够快，对中文也比分词索引准；原站同样这么做。
// 曾试过 MiniSearch 双字索引，序列化后 5.6 MB（gzip 1.3 MB），不值得。

const clean = s => (s || '').replace(/\*\*/g, '').replace(/\\([*_])/g, '$1').toLowerCase();

// 拆查询：空格分隔的多个词，全部命中才算（AND）
export const parseQuery = q => clean(q).split(/\s+/).filter(Boolean);

// item 至少有 title、plain；有完整字段时一并搜
// 英文和数字按整词匹配（「aed」不能命中「paid」），中文按子串
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matcher = t => /^[a-z0-9.%-]+$/.test(t)
  ? (s => new RegExp(`(^|[^a-z0-9])${escapeRe(t)}($|[^a-z0-9])`).test(s))
  : (s => s.includes(t));

export function scoreItem(item, terms) {
  if (!terms.length) return 0;
  const title = clean(item.title), plain = clean(item.plain);
  const rest = clean([item.cost, item.benefit, item.note, item.source].join('\n'));
  let score = 0;
  for (const t of terms) {
    const hit = matcher(t);
    if (hit(title)) score += 10;
    else if (hit(plain)) score += 4;
    else if (hit(rest)) score += 1;
    else return 0;
  }
  return score;
}

export function search(items, query) {
  const terms = parseQuery(query);
  return items
    .map(it => ({ it, s: scoreItem(it, terms) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || a.it.chapter - b.it.chapter || a.it.ordinal - b.it.ordinal)
    .map(x => x.it);
}
