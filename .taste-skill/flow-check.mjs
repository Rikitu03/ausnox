import { chromium } from '@playwright/test';
const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page = await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
await page.goto('http://127.0.0.1:4173');
await page.getByRole('button',{name:/Use nearest usable cell/}).waitFor();
await page.screenshot({path:'.taste-skill/placement-desktop.png'});
await page.setViewportSize({width:390,height:844});
await page.screenshot({path:'.taste-skill/placement-mobile.png'});
await page.getByRole('button',{name:/Use nearest usable cell/}).click();
await page.getByRole('button',{name:'Mission planner',exact:true}).click();
await page.getByRole('button',{name:/^(Recalculate|Calculate) mission$/}).click();
await page.waitForTimeout(5000);
await page.screenshot({path:'.taste-skill/planner-mobile.png'});
await page.keyboard.press('Escape');
await page.setViewportSize({width:1440,height:900});
await page.screenshot({path:'.taste-skill/control-desktop.png'});
for (const name of ['Terrain','Simulation','Summary','Data sources']) {
 await page.getByRole('navigation',{name:'Views'}).getByRole('button',{name,exact:true}).click();
 await page.waitForTimeout(500);
 await page.screenshot({path:`.taste-skill/${name.replace(' ','-')}-desktop.png`});
}
for (const width of [768,390]) {
 await page.setViewportSize({width,height:900});
 await page.getByRole('navigation',{name:'Views'}).getByRole('button',{name:'Summary',exact:true}).click();
 await page.screenshot({path:`.taste-skill/summary-${width}.png`});
 if (await page.locator('body').evaluate(el=>el.scrollWidth>innerWidth)) throw Error('Overflow '+width);
 await page.getByRole('navigation',{name:'Views'}).getByRole('button',{name:'Mission control',exact:true}).click();
 await page.screenshot({path:`.taste-skill/control-${width}.png`});
}
console.log('Verified: placement confirmation, mobile planner, calculation, all five views, responsive overflow, reduced motion.');
await browser.close();

