import { test } from 'node:test';
import assert from 'node:assert';

// Sample 1x1 PNG data URL
const SAMPLE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=';

// Provide a minimal Deno shim so the module can be imported under Node
(globalThis as any).Deno = {
  env: { get: (k: string) => process.env[k] },
  serve: () => {}
};
process.env.HF_ENDPOINT_URL = 'https://fake-hf';
process.env.HF_TOKEN = 'test-token';

const { handler } = await import('./index.ts');

test('handler succeeds with base64 image', async () => {
  const origFetch = global.fetch;
  global.fetch = async () =>
    new Response(JSON.stringify([{ score: 0.9, label: 'shirt', box: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 } }]), {
      status: 200
    });

  const req = new Request('http://localhost', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ base64Image: SAMPLE })
  });
  const res = await handler(req);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.status, 'success');
  global.fetch = origFetch;
});

test('handler fails when HF returns error', async () => {
  const origFetch = global.fetch;
  global.fetch = async () => new Response('bad', { status: 500 });
  const req = new Request('http://localhost', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ base64Image: SAMPLE })
  });
  const res = await handler(req);
  assert.strictEqual(res.status, 500);
  const data = await res.json();
  assert.strictEqual(data.status, 'fail');
  global.fetch = origFetch;
});