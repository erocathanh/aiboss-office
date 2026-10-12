import { exec } from 'node:child_process';
import fs from 'node:fs';

async function main() {
  const chrome = exec(
    `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --remote-debugging-port=9223 --disable-gpu http://127.0.0.1:4330/`
  );

  await new Promise((r) => setTimeout(r, 2000));

  const res = await fetch('http://127.0.0.1:9223/json');
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

  // 1. Mobile emulation: 390x844, scale 3, mobile: true
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
  });

  await new Promise((r) => setTimeout(r, 1000));

  // Capture chat screen first
  const chatShot = await send('Page.captureScreenshot', { format: 'png' });
  const chatBuf = Buffer.from(chatShot.data, 'base64');
  const chatPath = '/Users/erocathanh/DU-AN/aiboss-office/DANG-LAM/NOP/mvp-pha4-mobile-chat.png';
  fs.writeFileSync(chatPath, chatBuf);
  console.log('Saved mobile-chat screenshot:', chatPath, chatBuf.length, 'bytes');

  // Now click the drawer/menu button to show the sidebar/seats list
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const btn = document.querySelector('.nut-danh-ba');
        if (btn) btn.click();
      })()
    `,
  });

  await new Promise((r) => setTimeout(r, 1000));

  // Capture main screen with sidebar/drawer
  const mainShot = await send('Page.captureScreenshot', { format: 'png' });
  const mainBuf = Buffer.from(mainShot.data, 'base64');
  const mainPath = '/Users/erocathanh/DU-AN/aiboss-office/DANG-LAM/NOP/mvp-pha4-mobile-main.png';
  fs.writeFileSync(mainPath, mainBuf);
  console.log('Saved mobile-main screenshot:', mainPath, mainBuf.length, 'bytes');

  ws.close();
  chrome.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
