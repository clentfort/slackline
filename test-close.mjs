import { chromium } from 'playwright';
async function test() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  console.log('Connected');
  await browser.close();
  console.log('Closed');
}
test();
