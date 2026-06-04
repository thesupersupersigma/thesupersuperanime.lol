const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://anitaku.to/naruto-episode-1', { waitUntil: 'networkidle', timeout: 20000 });
  
  // Dump entire page HTML around the video player area
  const html = await page.evaluate(() => {
    const player = document.querySelector('.anime_video_body') || 
                   document.querySelector('.play-video') ||
                   document.querySelector('#load_anime');
    return player ? player.innerHTML.substring(0, 3000) : 'player div not found — dumping body: ' + document.body.innerHTML.substring(0, 3000);
  });
  console.log(html);
  
  await browser.close();
})().catch(console.error);
