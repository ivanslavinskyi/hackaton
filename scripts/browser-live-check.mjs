import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
mkdirSync('test-results',{recursive:true});
// Optional paid smoke test: sends one question using the running server's API key.
const base=process.env.MARKET_RADAR_TEST_URL||'http://127.0.0.1:3000';
const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'}),headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);
 await page.getByRole('heading',{name:'The market, from more than one angle.'}).waitFor();
 await page.getByRole('link',{name:'AI Analyst',exact:true}).click();
 await page.getByLabel('Ask the AI Analyst').fill('Compare Python with Docker in the last two snapshots. Explain counts and shares.');
 await page.getByRole('button',{name:'Ask analyst',exact:true}).click();
 await page.locator('.message-assistant').waitFor({timeout:60000});
 await page.locator('.analyst-working').waitFor({state:'hidden',timeout:60000});
 assert.equal(await page.locator('.chat-error').count(),0,'Unexpected UI error');
 const answer=await page.locator('.message-assistant').innerText();
 assert.match(answer,/Python/);assert.match(answer,/Docker/);
 assert.ok(await page.locator('.finding-citations button').count()>0);
 await page.screenshot({path:'test-results/ui-production-live.png',fullPage:true});
 assert.equal(errors.length,0);
 console.log(JSON.stringify({productionBrowserAI:'passed',answer,jsErrors:errors}));
 await page.reload();
 await page.getByRole('link',{name:'AI Analyst',exact:true}).click();
 await page.locator('.message-assistant').waitFor();
 console.log('Production conversation restored after reload.');
}finally{await browser.close();}
