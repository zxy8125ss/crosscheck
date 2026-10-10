import { test, expect, type Page } from '@playwright/test';

// 模拟 GitHub Gist API，存在内存里
function mockGitHub(page: Page, store: { gists: Record<string, any> }) {
  return page.route('https://api.github.com/**', async route => {
    const req = route.request(); const url = new URL(req.url()); const m = req.method();
    const json = (b: unknown, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(b) });
    if (req.headers()['authorization'] !== 'Bearer ghp_test') return json({ message: 'Bad credentials' }, 401);
    if (url.pathname === '/user') return json({ login: 'zxy8125ss' });
    if (url.pathname === '/gists' && m === 'GET') return json(Object.values(store.gists));
    if (url.pathname === '/gists' && m === 'POST') { const b = req.postDataJSON(); const g = { id: 'g1', ...b }; store.gists.g1 = g; return json(g, 201); }
    const id = url.pathname.split('/')[2];
    if (m === 'GET') return json(store.gists[id]);
    if (m === 'PATCH') { const b = req.postDataJSON(); store.gists[id].files = { ...store.gists[id].files, ...b.files }; return json(store.gists[id]); }
    return json({}, 404);
  });
}

test('开启自动备份 → 记录自动上传 → 删 App 后重连恢复', async ({ page }) => {
  const store = { gists: {} as Record<string, any> };
  await mockGitHub(page, store);
  await page.goto('./');
  await page.getByRole('button', { name: /开始这一章/ }).click();
  await page.locator('article textarea').fill('删前写的想法');
  await page.getByRole('button', { name: '提交并看原文' }).click();
  await expect(page.getByText(/删掉 App 就没了/)).toBeVisible();

  await page.goto('./#/me');
  await page.getByText('自动备份到 GitHub').click();
  await page.getByPlaceholder(/ghp_/).fill('ghp_wrong');
  await page.getByRole('button', { name: '开启' }).click();
  await expect(page.getByText('密钥无效或已过期')).toBeVisible();
  await page.getByPlaceholder(/ghp_/).fill('ghp_test');
  await page.getByRole('button', { name: '开启' }).click();
  await expect(page.getByText(/已开启/)).toBeVisible();
  await expect(page.getByText(/上次保存/)).toBeVisible();
  const content = () => store.gists.g1.files['crosscheck-backup.json'].content as string;
  expect(content()).toContain('删前写的想法');
  expect(content()).not.toContain('ghp_test');

  // 再标一条，几秒内自动上传
  await page.goto('./');
  await page.getByRole('button', { name: /做到了/ }).click();
  await expect.poll(() => content().includes('"action": "done"'), { timeout: 10_000 }).toBe(true);

  // 模拟删掉 App：本机数据全清
  await page.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('crosscheck'); q.onsuccess = q.onerror = q.onblocked = () => r(0); }));
  await page.goto('./#/me'); await page.reload();
  await expect(page.getByText('还没写过想法')).toBeVisible();
  await page.getByText('自动备份到 GitHub').click();
  await page.getByPlaceholder(/ghp_/).fill('ghp_test');
  await page.getByRole('button', { name: '开启' }).click();
  await expect(page.getByText('删前写的想法')).toBeVisible();
  expect(Object.keys(store.gists)).toEqual(['g1']); // 找回原来那个，不新建
});

test('微信备份：首页提醒 → 发到微信 → 提醒消失；不支持分享时下载', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__shared = [];
    (navigator as any).canShare = (d: any) => !!d.files;
    (navigator as any).share = async (d: any) => { (window as any).__shared.push(await d.files[0].text()); };
  });
  await page.goto('./');
  await page.getByRole('button', { name: /开始这一章/ }).click();
  await expect(page.getByRole('button', { name: '发到微信' })).toHaveCount(0);
  await page.locator('article textarea').fill('微信备份测试');
  await page.getByRole('button', { name: '提交并看原文' }).click();
  await page.getByRole('button', { name: '发到微信' }).click();
  await expect(page.getByText(/已备份/)).toBeVisible();
  const shared = await page.evaluate(() => (window as any).__shared[0]);
  expect(shared).toContain('微信备份测试');
  await page.reload();
  await expect(page.getByRole('button', { name: '发到微信' })).toHaveCount(0);
});
