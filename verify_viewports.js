const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');

async function run() {
  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 768, height: 1024 },
    { width: 1366, height: 768 }
  ];

  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: vp });
    const page = await context.newPage();

    console.log(`\nTesting viewport ${vp.width}x${vp.height}...`);

    await page.goto(`file://${process.cwd()}/index.html`);
    // Wait slightly
    await page.waitForTimeout(500);

    // Check main page overflow
    const overflowHome = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    console.log(`Home page overflow: ${overflowHome}`);

    // Force visible chat
    await page.evaluate(() => {
        document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
        document.getElementById('chat').style.display = 'flex';
    });

    await page.waitForTimeout(200);

    const overflowChat = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    console.log(`Chat page overflow: ${overflowChat}`);

    // Check if send button is visible without scrolling
    const sendBtnVisible = await page.evaluate(() => {
        const btn = document.getElementById('send-btn');
        if(!btn) return false;
        const rect = btn.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    });
    console.log(`Send button fully visible: ${sendBtnVisible}`);

    await context.close();
  }

  await browser.close();
  console.log('\nVerification complete.');
}

run().catch(console.error);
