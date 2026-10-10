import { test, expect } from '@playwright/test';
test('顶栏实色、标题完整在视口内', async ({ page }) => {
  await page.goto('./');
  const h = page.locator('header');
  await expect(h).toHaveCSS('background-color', 'rgb(242, 234, 223)');
  const box = await page.getByRole('link', { name: 'Crosscheck' }).boundingBox();
  expect(box!.y).toBeGreaterThan(8);
  await page.screenshot({ path: 'e2e/shots/top.png', clip: { x: 0, y: 0, width: 390, height: 260 } });
  await page.goto('./#/search');
  const hb = await h.boundingBox(); const sb = await page.getByPlaceholder(/搜标题/).boundingBox();
  expect(sb!.y).toBeGreaterThanOrEqual(hb!.y + hb!.height);
  await page.mouse.wheel(0, 1500); await page.waitForTimeout(300);
  const hb2 = await h.boundingBox(); const sb2 = await page.getByPlaceholder(/搜标题/).boundingBox();
  expect(sb2!.y).toBeGreaterThanOrEqual(hb2!.y + hb2!.height - 1);
});
