import { test } from 'node:test';
import assert from 'node:assert';
import { uploadAndProcessItem } from './items';

const sampleFile = new File(['dummy'], 'item.png', { type: 'image/png' });

function makeSupabase() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user1' } }, error: null }) },
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'https://example.com/item.png' } })
      })
    },
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id: '123', title: 'item', image_path: 'path' }, error: null })
        })
      })
    })
  };
}

test('uploadAndProcessItem success', async () => {
  const supabase = makeSupabase();
  const origFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ status: 'success', result: [] }), { status: 200 });
  const res = await uploadAndProcessItem(sampleFile, 'title', supabase as any);
  assert.strictEqual(res.fn.ok, true);
  global.fetch = origFetch;
});

test('uploadAndProcessItem handles edge failure', async () => {
  const supabase = makeSupabase();
  const origFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ status: 'fail', error: 'bad' }), { status: 500 });
  const res = await uploadAndProcessItem(sampleFile, 'title', supabase as any);
  assert.strictEqual(res.fn.ok, false);
  global.fetch = origFetch;
});