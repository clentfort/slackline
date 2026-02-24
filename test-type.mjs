import { chromium } from 'playwright';
async function test() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  console.log('browser.disconnect:', typeof browser.disconnect);
  await browser.close();
}
test();
