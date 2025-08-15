// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';

const HF_ENDPOINT_URL = Deno.env.get('HF_ENDPOINT_URL')!;
const HF_TOKEN = Deno.env.get('HF_TOKEN')!;

type DetectReq = {
  imageUrl?: string;
  base64Image?: string;
  threshold?: number;
};

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const start = performance.now();
  try {
    const body = (await req.json()) as DetectReq;
    const threshold = body.threshold ?? 0.5;

    let dataUrl: string | undefined = body.base64Image;

    // Prefer URL path to keep client payload tiny
    if (!dataUrl && body.imageUrl) {
      const imgRes = await fetch(body.imageUrl);
      if (!imgRes.ok) throw new Error(`Fetch image failed: ${imgRes.status}`);
      const mime = imgRes.headers.get('content-type') ?? 'image/png';
      const bytes = new Uint8Array(await imgRes.arrayBuffer());
      const b64 = encodeBase64(bytes);
      dataUrl = `data:${mime};base64,${b64}`;
    }

    if (!dataUrl) throw new Error('No image provided');

    const hfReq = {
      inputs: dataUrl, // HF expects a data URL string
      parameters: { threshold },
    };

    const hf = await fetch(HF_ENDPOINT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(hfReq),
    });

    const latencyMs = Math.round(performance.now() - start);
    if (!hf.ok) {
      const errTxt = await hf.text().catch(() => '');
      return Response.json(
        { status: 'fail', latencyMs, error: errTxt || hf.statusText, stop: 'hf_error' },
        { status: 502 },
      );
    }

    const result = await hf.json();
    return Response.json({
      status: 'success',
      model: 'valentinafeve/yolos-fashionpedia',
      latencyMs,
      result,
    });
  } catch (e) {
    const latencyMs = Math.round(performance.now() - start);
    return Response.json(
      { status: 'fail', latencyMs, error: String(e?.message ?? e), stop: 'exception' },
      { status: 500 },
    );
  }
});
