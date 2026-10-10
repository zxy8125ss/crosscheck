// 用 Chromium 把 public/icon.svg 渲染成 PNG 图标（一次性，结果入库）
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const svg = readFileSync('public/icon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
const shot = async (size, file, pad = 0) => {
  await page.setViewportSize({ width: size, height: size });
  const inner = size - pad * 2;
  await page.setContent(`<html><body style="margin:0;background:${pad ? '#29473A' : 'transparent'}"><div style="padding:${pad}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await page.screenshot({ path: `public/${file}`, omitBackground: !pad });
};
await shot(192, 'icon-192.png');
await shot(512, 'icon-512.png');
await shot(512, 'icon-512-maskable.png', 56);
await shot(180, 'apple-touch-icon.png', 0);
await browser.close();
