// Cross-origin iframe test for a CMS visual editor integration (run from a directory where `playwright` is installed).
//  1. Serve a parent page from ANOTHER localhost port, e.g. `python3 -m http.server 4000` with parent.html:
//       <iframe id=f src="http://localhost:3000/fr/guides/<slug>?<editor-param>=<real entry id>" width=1200 height=800></iframe>
//  2. Run the dev server (it must allow localhost in frame-ancestors in development only).
//  3. `node editor_iframe_test.mjs` checks: React hydrated in the frame, edit attributes present, bridge globals defined.
// Adapt the bridge globals (Storyblok: window.StoryblokBridge / storyblokRegisterEvent) and the attribute selector (data-blok-c) per CMS.
// Do NOT use an about:blank parent or route interception: hydration fails and the result is a false negative.
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', m => { const t=m.text(); if (!/WebSocket|HMR|DevTools/.test(t)) console.log('console', m.type()+':', t.slice(0,200)); });
await page.goto('http://localhost:4000/parent.html');
await page.waitForTimeout(12000);
const frame = page.frames().find(f => f.url().includes('_storyblok='));
console.log('FRAME hydrated:', await frame.evaluate(() => Object.keys(document).some(k => k.startsWith('__reactContainer'))));
console.log('tagged blocks:', await frame.locator('[data-blok-c]').count());
console.log('registerEvent:', await frame.evaluate(() => typeof window.storyblokRegisterEvent), '| StoryblokBridge:', await frame.evaluate(() => typeof window.StoryblokBridge));
await browser.close();
