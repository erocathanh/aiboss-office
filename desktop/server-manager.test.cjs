'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { probeServer } = require('./server-manager.cjs');

test('probeServer returns true for responding server and false for closed port', async () => {
  // Test closed port
  const offline = await probeServer(59123, 200);
  assert.equal(offline, false);

  // Test active HTTP server
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const testPort = server.address().port;

  try {
    const online = await probeServer(testPort, 1000);
    assert.equal(online, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
