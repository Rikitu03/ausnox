import { chromium } from '@playwright/test';
const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:4173');
await page.waitForTimeout(6000);
for (const width of [1440,768,390]) {
 await page.setViewportSize({width,height:900});
 await page.screenshot({path:`.taste-skill/after-${width}.png`});
 console.log(width, await page.locator('body').evaluate(el=>({scroll:el.scrollWidth,width:innerWidth})));
}
await browser.close();
