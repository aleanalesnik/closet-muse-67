import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

function buildInferenceHeaders() {
  const token = Deno.env.get("INFERENCE_API_TOKEN");
  const name = Deno.env.get("INFERENCE_AUTH_HEADER") || "Authorization";
  const prefix = Deno.env.get("INFERENCE_AUTH_PREFIX") || "Bearer";
  if (!token) throw new Error("Missing INFERENCE_API_TOKEN");
  return { [name]: prefix ? `${prefix} ${token}` : token, "Content-Type": "application/json" };
}

function uint8ToBase64(u8: Uint8Array) {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < u8.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK) as unknown as number[]);
  }
  // deno-lint-ignore no-deprecated-deno-api
  return btoa(binary);
}

async function callInferenceWithRetry(url: string, body: object, stage: string, headers: Record<string, string>) {
  const maxRetries = 2;
  const delays = [250, 750]; // ms
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
    
    const responseText = await response.text();
    const urlWithoutToken = url.replace(/[\?&].*$/, ''); // Remove query params that might contain tokens
    
    console.log(`[${stage}] ${response.status} ${urlWithoutToken} - ${responseText.slice(0, 120)}`);
    
    if (response.status === 404) {
      throw new Error(`${stage} not deployed (404) at ${urlWithoutToken}`);
    }
    
    if (response.ok) {
      return JSON.parse(responseText);
    }
    
    // 5xx errors: retry with backoff
    if (response.status >= 500 && attempt < maxRetries) {
      console.log(`[${stage}] Retrying in ${delays[attempt]}ms...`);
      await new Promise(resolve => setTimeout(resolve, delays[attempt]));
      continue;
    }
    
    // Final failure
    throw new Error(`${stage} failed: ${response.status} - ${responseText.slice(0, 200)}`);
  }
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const { itemId, imagePath } = await req.json();
    if (!itemId || !imagePath) {
      return new Response(JSON.stringify({ ok: false, error: "itemId and imagePath required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = getServiceClient();
    const DETECT_URL = Deno.env.get("DETECT_URL");
    const SEGMENT_URL = Deno.env.get("SEGMENT_URL");
    const EMBED_URL = Deno.env.get("EMBED_URL");
    
    if (!DETECT_URL || !SEGMENT_URL || !EMBED_URL) {
      throw new Error("Missing DETECT_URL, SEGMENT_URL, or EMBED_URL");
    }
    const infHeaders = buildInferenceHeaders();

    // Download image
    const { data: img, error: dlErr } = await supabase.storage.from("sila").download(imagePath);
    if (dlErr) throw new Error(`Failed to download image: ${dlErr.message}`);
    const buf = new Uint8Array(await img.arrayBuffer());
    const base64Image = uint8ToBase64(buf);

    // STEP 1: DETECT
    console.log(`[DETECT] Starting detection...`);
    const detectData = await callInferenceWithRetry(
      DETECT_URL, 
      { image: base64Image, format: "base64" }, 
      "DETECT", 
      infHeaders
    );
    
    const boxes = Array.isArray(detectData?.boxes) ? detectData.boxes : [];
    if (boxes.length === 0) throw new Error("No objects detected in image");
    const bbox = boxes[0];
    const category = detectData.category || "clothing";
    const subcategory = detectData.subcategory || "item";

    // STEP 2: SEGMENT
    console.log(`[SEGMENT] Starting segmentation...`);
    const segmentData = await callInferenceWithRetry(
      SEGMENT_URL, 
      { image: base64Image, bbox, format: "base64" }, 
      "SEGMENT", 
      infHeaders
    );
    
    const maskBase64 = segmentData?.mask;
    const cropBase64 = segmentData?.crop;
    if (!maskBase64 || !cropBase64) throw new Error("Segmentation returned no mask/crop");

    // Store mask/crop
    const parts = imagePath.split("/");
    const userId = parts[0];
    const itemUuid = parts[2]?.split(".")[0];
    const maskPath = `${userId}/items/${itemUuid}-mask.png`;
    const cropPath = `${userId}/items/${itemUuid}-crop.png`;

    const toBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    await supabase.storage.from("sila").upload(maskPath, toBytes(maskBase64), { contentType: "image/png", upsert: true });
    await supabase.storage.from("sila").upload(cropPath, toBytes(cropBase64), { contentType: "image/png", upsert: true });

    // STEP 3: EMBED
    console.log(`[EMBED] Starting embedding...`);
    const embedData = await callInferenceWithRetry(
      EMBED_URL, 
      { image: cropBase64, format: "base64" }, 
      "EMBED", 
      infHeaders
    );
    
    const embedding = embedData?.embedding;
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error("Embedding returned no valid embedding array");
    }

    // Store results
    const { error: upsertErr } = await supabase.from("item_embeddings").upsert({ item_id: itemId, embedding });
    if (upsertErr) throw upsertErr;

    const color_hex = "#8B5A2B"; // placeholder
    const color_name = "brown"; // placeholder
    
    const { error: updErr } = await supabase.from("items").update({
      category, subcategory, color_hex, color_name, mask_path: maskPath, crop_path: cropPath,
    }).eq("id", itemId);
    if (updErr) throw updErr;

    console.log(`[SUCCESS] Pipeline completed - embedding dims: ${embedding.length}`);
    return new Response(JSON.stringify({ ok: true, embedding_dims: embedding.length }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("items-process error:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});