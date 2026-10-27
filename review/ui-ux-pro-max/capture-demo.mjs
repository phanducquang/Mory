// Read-only visual evidence; run against an isolated demo instance. No real family data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000';
const phase=process.argv[2]||'after';
if (!['before', 'after'].includes(phase)) throw new Error('Use before or after.');
const out=path.join(repo,'review/ui-ux-pro-max',phase);fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch();const findings=[];
try{for(const width of [320,375,390,414,768,1024,1440]){
 const page=await browser.newPage({viewport:{width,height:960},locale:'vi-VN',timezoneId:'Asia/Ho_Chi_Minh'});
 for(const route of ['/home','/timeline','/events','/children','/onboarding','/settings']){
  const response=await page.goto(baseURL+route,{waitUntil:'networkidle',timeout:180000});
  if(response.status()!==200)throw new Error(route+' status '+response.status());
  if (!(await page.locator('.demo-tag').textContent()).includes('Bản trải nghiệm')) throw new Error('Screenshots require demo mode.');
  const info=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,bodySize:getComputedStyle(document.body).fontSize,headingSize:getComputedStyle(document.querySelector('h1')).fontSize,smallControls:[...document.querySelectorAll('button,a.button,input:not([type=checkbox]):not([type=radio]):not([type=file]),select')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&r.height<43.5&&!e.closest('.sr-only')}).map(e=>({tag:e.tagName,class:e.className,height:Math.round(e.getBoundingClientRect().height)}))}));
  findings.push({width,route,...info});
  if([390,1440].includes(width))await page.screenshot({animations:"disabled",path:path.join(out,`${route.slice(1)}-${width}.png`)});
 }
 if(width===390||width===1440){
  await page.goto(baseURL+'/home',{waitUntil:'networkidle'});
  const href=await page.locator('.memory-card').first().getAttribute('href');
  if(href){await page.goto(baseURL+href,{waitUntil:'networkidle'});await page.screenshot({animations:"disabled",path:path.join(out,`event-detail-${width}.png`)});}
  await page.goto(baseURL+'/home',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Lưu kỷ niệm mới',exact:true}).filter({visible:true}).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();await page.screenshot({animations:"disabled",path:path.join(out,`event-form-${width}.png`)});
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Thông báo',exact:true}).click();await page.screenshot({animations:"disabled",path:path.join(out,`notifications-${width}.png`)});
  await page.goto(baseURL+'/children',{waitUntil:'networkidle'});await page.getByRole('button',{name:'Chỉnh sửa hồ sơ',exact:true}).click();await page.screenshot({animations:"disabled",path:path.join(out,`child-form-${width}.png`)});await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Thêm cột mốc riêng',exact:true}).click();await page.screenshot({animations:"disabled",path:path.join(out,`milestone-form-${width}.png`)});await page.keyboard.press('Escape');
 }
 await page.close();console.log(`${phase}: ${width}px captured`);
}
fs.writeFileSync(path.join(out,'demo-measurements.json'),JSON.stringify(findings,null,2));
}finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exit(1)});
