// deno-lint-ignore-file no-explicit-any
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';

const HF_ENDPOINT_URL = Deno.env.get('HF_ENDPOINT_URL')!;
const HF_TOKEN = Deno.env.get('HF_TOKEN')!;

type DetectReq = {
  imageUrl?: string;
  base64Image?: string;
  threshold?: number;
};

// ---- CORS (robust) ----
const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
});

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const baseHeaders = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: baseHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method Not Allowed' }), { 
      status: 200,
      headers: { ...baseHeaders, 'Content-Type': 'application/json' }
    });
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
      return new Response(JSON.stringify(
        { status: 'fail', latencyMs, error: errTxt || hf.statusText, stop: 'hf_error' }
      ), {
        status: 200,
        headers: { ...baseHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await hf.json();
    
    // Extract normalized label for title building
    function topLabelFromYolos(result: any): string | undefined {
      const arr = Array.isArray(result) ? result : [];
      if (!arr.length) return undefined;
      const best = arr.reduce((a:any,b:any)=> ((b?.score??0)>(a?.score??0)?b:a), arr[0]);
      const raw = (best?.label ?? best?.class ?? best?.category ?? "").toString();
      // normalize a bit
      return raw.replace(/_/g, " ").toLowerCase();
    }
    
    const proposedTitle = topLabelFromYolos(result);

    // Extract proposedBbox from top detection
    const top = Array.isArray(result) && result.length ? result[0] : null;
    const proposedBbox = top?.box
      ? [top.box.xmin, top.box.ymin, top.box.xmax, top.box.ymax]
      : null;
    
    return new Response(JSON.stringify({
      status: 'success',
      model: 'valentinafeve/yolos-fashionpedia',
      latencyMs,
      result,
      proposedTitle,
      proposedBbox
    }), {
      status: 200,
      headers: { ...baseHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const latencyMs = Math.round(performance.now() - start);
    return new Response(JSON.stringify(
      { status: 'fail', latencyMs, error: String(e?.message ?? e), stop: 'exception' }
    ), {
      status: 200,
      headers: { ...baseHeaders, 'Content-Type': 'application/json' },
    });
  }
});
