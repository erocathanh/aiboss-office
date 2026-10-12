import { exec } from 'node:child_process';
import fs from 'node:fs';

async function main() {
  const chrome = exec(
    `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --remote-debugging-port=9224 --disable-gpu http://127.0.0.1:4330/`
  );

  await new Promise((r) => setTimeout(r, 2000));

  const res = await fetch('http://127.0.0.1:9224/json');
  const targets = await res.json();
  const pageTarget = targets.find((t) => t.type === 'page');
  console.log('Page target:', pageTarget?.title, pageTarget?.url);

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));

  let msgId = 1;
  function send(method, params = {}) {
    return new Promise((resolve) => {
      const id = msgId++;
      const handler = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id === id) {
          ws.removeEventListener('message', handler);
          resolve(msg.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // 1. DESKTOP 1440x900 screenshot: mvp-pha4b-main.png
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await new Promise((r) => setTimeout(r, 1200));

  const desktopShot = await send('Page.captureScreenshot', { format: 'png' });
  const desktopBuf = Buffer.from(desktopShot.data, 'base64');
  const desktopPath = '/Users/erocathanh/DU-AN/aiboss-office/DANG-LAM/NOP/mvp-pha4b-main.png';
  fs.writeFileSync(desktopPath, desktopBuf);
  console.log('Saved desktop main:', desktopPath, desktopBuf.length, 'bytes');

  // 2. MOBILE 390x844 Setup
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
  });
  await new Promise((r) => setTimeout(r, 1000));

  // Check top bar buttons on mobile
  const buttonEval = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const buttons = document.querySelectorAll('.nhom-bo-cuc .nut-bc');
        const gear = document.querySelector('.boc-cai-dat .nut-cai-dat');
        const nhom = document.querySelector('.nhom-bo-cuc');
        const details = Array.from(buttons).map(b => ({
          bc: b.getAttribute('data-bc'),
          title: b.getAttribute('title'),
          display: getComputedStyle(b).display,
          width: b.offsetWidth,
          height: b.offsetHeight,
          visible: b.offsetWidth > 0 && b.offsetHeight > 0 && getComputedStyle(b).display !== 'none'
        }));
        return {
          buttonCount: buttons.length,
          nhomDisplay: getComputedStyle(nhom).display,
          gearVisible: gear ? (gear.offsetWidth > 0 && getComputedStyle(gear).display !== 'none') : false,
          buttons: details
        };
      })()
    `,
    returnByValue: true,
  });
  console.log('Mobile Topbar Button Inspection:', JSON.stringify(buttonEval.result.value, null, 2));

  // Screenshot: mvp-pha4b-mobile-topbar.png (Default medium chat)
  const topbarShot = await send('Page.captureScreenshot', { format: 'png' });
  const topbarBuf = Buffer.from(topbarShot.data, 'base64');
  const topbarPath = '/Users/erocathanh/DU-AN/aiboss-office/DANG-LAM/NOP/mvp-pha4b-mobile-topbar.png';
  fs.writeFileSync(topbarPath, topbarBuf);
  console.log('Saved mobile topbar:', topbarPath, topbarBuf.length, 'bytes');

  // 3. Measure Medium Font Size & Save mvp-pha4b-chat-medium.png
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        document.documentElement.setAttribute('data-text-size', 'medium');
        localStorage.setItem('aiboss-office.text-size', 'medium');
      })()
    `,
  });
  await new Promise((r) => setTimeout(r, 500));

  const medMeasure = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const bong = document.querySelector('.bong');
        return bong ? getComputedStyle(bong).fontSize : null;
      })()
    `,
    returnByValue: true,
  });
  const medFontSize = medMeasure.result.value;
  console.log('Medium Font Size on .bong:', medFontSize);

  const medShot = await send('Page.captureScreenshot', { format: 'png' });
  const medBuf = Buffer.from(medShot.data, 'base64');
  const medPath = '/Users/erocathanh/DU-AN/aiboss-office/DANG-LAM/NOP/mvp-pha4b-chat-medium.png';
  fs.writeFileSync(medPath, medBuf);
  console.log('Saved chat medium screenshot:', medPath, medBuf.length, 'bytes');

  // 4. Measure Large Font Size & Save mvp-pha4b-chat-large.png
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        document.documentElement.setAttribute('data-text-size', 'large');
        localStorage.setItem('aiboss-office.text-size', 'large');
      })()
    `,
  });
  await new Promise((r) => setTimeout(r, 500));

  const lrgMeasure = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const bong = document.querySelector('.bong');
        return bong ? getComputedStyle(bong).fontSize : null;
      })()
    `,
    returnByValue: true,
  });
  const lrgFontSize = lrgMeasure.result.value;
  console.log('Large Font Size on .bong:', lrgFontSize);

  const lrgShot = await send('Page.captureScreenshot', { format: 'png' });
  const lrgBuf = Buffer.from(lrgShot.data, 'base64');
  const lrgPath = '/Users/erocathanh/DU-AN/aiboss-office/DANG-LAM/NOP/mvp-pha4b-chat-large.png';
  fs.writeFileSync(lrgPath, lrgBuf);
  console.log('Saved chat large screenshot:', lrgPath, lrgBuf.length, 'bytes');

  // 5. Navigate to /settings (390x844) & Save mvp-pha4b-settings-mobile.png
  await send('Page.navigate', { url: 'http://127.0.0.1:4330/settings' });
  await new Promise((r) => setTimeout(r, 1500));

  const settingsShot = await send('Page.captureScreenshot', { format: 'png' });
  const settingsBuf = Buffer.from(settingsShot.data, 'base64');
  const settingsPath = '/Users/erocathanh/DU-AN/aiboss-office/DANG-LAM/NOP/mvp-pha4b-settings-mobile.png';
  fs.writeFileSync(settingsPath, settingsBuf);
  console.log('Saved settings mobile screenshot:', settingsPath, settingsBuf.length, 'bytes');

  // Print ratio calculation
  const medNum = parseFloat(medFontSize);
  const lrgNum = parseFloat(lrgFontSize);
  const ratio = (lrgNum / medNum).toFixed(3);
  console.log(`\n=== FONT SIZE MEASUREMENT RESULT ===`);
  console.log(`Medium: ${medFontSize} (${medNum}px)`);
  console.log(`Large: ${lrgFontSize} (${lrgNum}px)`);
  console.log(`Ratio: ${ratio} (Expected: ~1.25)`);

  ws.close();
  chrome.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
