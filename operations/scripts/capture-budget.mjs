import { exec } from 'node:child_process';
import fs from 'node:fs';

async function capture() {
  const profileDir = `/tmp/chrome-budget-${Date.now()}`;
  const chrome = exec(
    `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --remote-debugging-port=9225 --disable-gpu --user-data-dir="${profileDir}" http://127.0.0.1:4334/settings`
  );

  let targets = null;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch('http://127.0.0.1:9225/json');
      targets = await res.json();
      if (targets && targets.length > 0) break;
    } catch {}
  }
  if (!targets) throw new Error('Could not connect to Chrome debugging port');
  const pageTarget = targets.find((t) => t.type === 'page');
  console.log('Target found:', pageTarget?.title, pageTarget?.url);

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

  // 1. Desktop Screenshot: 1280x800, full page or scroll to budget card
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await new Promise((r) => setTimeout(r, 1000));

  // Scroll to budget card to ensure it's in view
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const el = document.getElementById('budget-today-card');
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
      })()
    `,
  });
  await new Promise((r) => setTimeout(r, 500));

  const desktopShot = await send('Page.captureScreenshot', { format: 'png' });
  const desktopBuf = Buffer.from(desktopShot.data, 'base64');
  const desktopPath = '/Users/erocathanh/DU-AN/aiboss-office/DANG-LAM/NOP/a3-settings-budget-desktop.png';
  fs.writeFileSync(desktopPath, desktopBuf);
  console.log('Saved desktop screenshot:', desktopPath, desktopBuf.length, 'bytes');

  // 2. Mobile Screenshot: 390x844
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
  });
  await new Promise((r) => setTimeout(r, 1000));

  // Scroll to budget card
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const el = document.getElementById('budget-today-card');
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
      })()
    `,
  });
  await new Promise((r) => setTimeout(r, 500));

  const mobileShot = await send('Page.captureScreenshot', { format: 'png' });
  const mobileBuf = Buffer.from(mobileShot.data, 'base64');
  const mobilePath = '/Users/erocathanh/DU-AN/aiboss-office/DANG-LAM/NOP/a3-settings-budget-390x844.png';
  fs.writeFileSync(mobilePath, mobileBuf);
  console.log('Saved mobile screenshot:', mobilePath, mobileBuf.length, 'bytes');

  ws.close();
  chrome.kill();
  process.exit(0);
}

capture().catch((err) => {
  console.error(err);
  process.exit(1);
});
