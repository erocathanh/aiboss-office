import http from 'node:http';
import { execSync } from 'node:child_process';

const postData = JSON.stringify({
  ma_o: 'o-1',
  ma_nhan_su: 'marketing-lead',
  cau_hoi: 'bạn là ai, giúp gì được cho tôi',
  phien_moi: true,
});

const req = http.request(
  {
    hostname: '127.0.0.1',
    port: 4330,
    path: '/api/chat',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
  },
  (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS:`, res.headers);

    let fullText = '';
    let sessionId = '';
    let inspectedProc = false;

    res.on('data', (chunk) => {
      const str = chunk.toString();
      const lines = str.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.ma_phien) sessionId = data.ma_phien;
          if (data.chu) fullText += data.chu;
          if (data.xong) {
            console.log('\n--- SESSION FINISHED ---');
          }
        } catch {}
      }

      if (!inspectedProc) {
        inspectedProc = true;
        try {
          const lsofOut = execSync('lsof -a -c claude -d cwd 2>/dev/null || true', { encoding: 'utf-8' });
          console.log('\n--- LSOF CWD INSPECTION ---');
          console.log(lsofOut);
        } catch (e) {
          console.log('Error inspecting lsof:', e.message);
        }
      }
    });

    res.on('end', () => {
      console.log('\n--- FINAL RESULT ---');
      console.log('Session ID:', sessionId);
      console.log('Full Text Length:', fullText.length);
      console.log('\nFirst 10 lines of response:');
      const textLines = fullText.split('\n').filter((l) => l.trim().length > 0);
      console.log(textLines.slice(0, 10).join('\n'));
    });
  }
);

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(postData);
req.end();
