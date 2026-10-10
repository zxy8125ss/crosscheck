import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const start = async (page: Page) => {
  await page.goto('./');
  await page.getByRole('button', { name: /开始这一章/ }).click();
};

test('先写想法 → 揭晓 → 两组标记 → 下一条；刷新后保留', async ({ page }) => {
  await start(page);
  const card = page.locator('article');
  await expect(card.getByText('你现在是怎么做的？为什么？')).toBeVisible();
  await expect(card.getByText('提问由 Crosscheck 生成')).toBeVisible();
  const title = await card.locator('h2').innerText();
  await card.locator('textarea').fill('我平时开车都系安全带');
  await card.getByRole('button', { name: '提交并看原文' }).click();
  await expect(card.getByText('我平时开车都系安全带')).toBeVisible();
  await expect(card.getByText('原书说人话')).toBeVisible();
  await card.getByRole('button', { name: '未曾设想' }).click();
  await card.getByRole('button', { name: /做到了/ }).click();
  await expect(page.locator('article h2')).not.toHaveText(title, { timeout: 5000 });
  await page.reload();
  await expect(page.locator('article h2')).not.toHaveText(title);
  await expect(page.getByText('做到了').first()).toBeVisible();
  await page.screenshot({ path: 'e2e/shots/home.png' });
});

test('直接看：没有对照标记；交叉引用可点', async ({ page }) => {
  await start(page);
  const card = page.locator('article');
  await card.getByRole('button', { name: '直接看' }).click();
  await expect(card.getByText('原书说人话')).toBeVisible();
  await expect(card.getByRole('button', { name: '未曾设想' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: '打算' })).toBeVisible();
  await page.screenshot({ path: 'e2e/shots/revealed.png', fullPage: true });
});

test('单条深链与交叉引用跳转', async ({ page }) => {
  const idx = JSON.parse(readFileSync('public/data/index.json', 'utf8'));
  const ch = JSON.parse(readFileSync('public/data/ch-05.json', 'utf8'));
  const it = ch.items.find((i: any) => i.refs.note?.length);
  await page.goto(`./#/item/${it.id}`);
  await page.getByRole('button', { name: '直接看' }).click();
  const span = it.refs.note[0];
  const target = idx.items.find((x: any) => x.id === span.targets[0]);
  await page.getByRole('link', { name: it.note.slice(span.start, span.end) }).first().click();
  await expect(page.locator('article h2')).toHaveText(target.title);
});

test('搜索与筛选', async ({ page }) => {
  await page.goto('./#/search');
  await page.getByPlaceholder(/搜标题和正文/).fill('彩票');
  await expect(page.getByText('不买彩票').first()).toBeVisible();
  await page.getByPlaceholder(/搜标题和正文/).fill('');
  await page.getByRole('button', { name: /^筛选/ }).click();
  await page.getByRole('button', { name: '极高' }).click();
  await page.getByRole('button', { name: '人身自由' }).click();
  const n = Number((await page.getByText(/^共 \d+ 条/).innerText()).match(/\d+/)![0]);
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(114);
  await page.screenshot({ path: 'e2e/shots/search.png' });
});

test('盲答对质：遮挡 → 作答 → 三块揭晓 → 回传入库', async ({ browser }) => {
  const me = await browser.newPage();
  await me.goto('./#/me');
  await me.getByPlaceholder('对质时朋友看到的名字').fill('一米');
  await me.getByPlaceholder('对质时朋友看到的名字').blur();
  await me.goto('./#/');
  await me.getByRole('button', { name: /开始这一章/ }).click();
  await me.locator('article textarea').fill('我的答案：一直系');
  await me.getByRole('button', { name: '提交并看原文' }).click();
  await me.evaluate(() => { (navigator as any).share = undefined; });
  await me.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await me.getByRole('button', { name: '邀朋友盲答' }).click();
  const invite = (await me.evaluate(() => navigator.clipboard.readText())).split('\n').pop()!;
  expect(invite).toContain('#/duel/');

  const friendCtx = await browser.newContext();
  const friend = await friendCtx.newPage();
  await friend.goto(invite);
  await expect(friend.getByText('一米 已作答')).toBeVisible();
  await expect(friend.getByText('我的答案：一直系')).toHaveCount(0);
  await friend.locator('textarea').fill('朋友：有时候不系');
  await friend.getByPlaceholder(/你的昵称/).fill('阿强');
  await friend.getByRole('button', { name: '提交，看答案' }).click();
  await expect(friend.getByText('我的答案：一直系')).toBeVisible();
  await expect(friend.getByText('朋友：有时候不系')).toBeVisible();
  await expect(friend.getByText('原书说人话')).toBeVisible();
  await friend.screenshot({ path: 'e2e/shots/duel.png', fullPage: true });
  await friend.evaluate(() => { (navigator as any).share = undefined; });
  await friendCtx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await friend.getByRole('button', { name: /发回给/ }).click();
  const reply = (await friend.evaluate(() => navigator.clipboard.readText())).split('\n').pop()!;

  await me.goto(reply);
  await expect(me.getByText('已存入')).toBeVisible();
  await me.goto('./#/me');
  await expect(me.getByText('对质记录（1）')).toBeVisible();
  await me.goto(reply); // 重复打开不重复入库
  await me.goto('./#/me');
  await expect(me.getByText('对质记录（1）')).toBeVisible();
});

test('坏链接提示「链接不完整」', async ({ page }) => {
  await page.goto('./#/duel/05-x?d=abc%3Cscript%3E');
  await expect(page.getByText('链接不完整')).toBeVisible();
});

test('导出 → 清空 → 导入恢复；坏文件不动数据', async ({ page }) => {
  await start(page);
  await page.locator('article textarea').fill('备份测试想法');
  await page.getByRole('button', { name: '提交并看原文' }).click();
  await page.goto('./#/me');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '导出' }).click()]);
  const file = await dl.path();
  expect(dl.suggestedFilename()).toMatch(/^crosscheck-\d{8}\.json$/);
  await page.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('crosscheck'); q.onsuccess = q.onerror = q.onblocked = () => r(0); }));
  await page.reload();
  await expect(page.getByText('还没写过想法')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"x"}') });
  await expect(page.getByText(/导入失败/)).toBeVisible();
  await page.locator('input[type=file]').setInputFiles(file!);
  await page.getByRole('button', { name: '合并（推荐）' }).click();
  await expect(page.getByText('备份测试想法')).toBeVisible();
});

test('离线：飞行模式下打开、展开任意一章', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () => (await caches.keys()).length > 0 && (await (await caches.open((await caches.keys())[0])).keys()).length > 40, null, { timeout: 30_000 });
  await context.setOffline(true);
  await page.reload();
  await page.goto('./#/ch/27');
  await expect(page.getByRole('heading', { name: /第 27 章/ })).toBeVisible();
  await page.getByRole('link').filter({ hasText: /^1\./ }).first().click();
  await page.getByRole('button', { name: '直接看' }).click();
  // 单条页默认展开原文细节
  await expect(page.getByText('政策各地执行不一')).toBeVisible();
  await page.screenshot({ path: 'e2e/shots/offline-item.png', fullPage: true });
  await page.getByRole('button', { name: /做到了/ }).click();
  await expect(page.getByRole('button', { name: /做到了/ })).toHaveClass(/chip-on/);
});
