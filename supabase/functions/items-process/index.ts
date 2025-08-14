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
  const headerName = Deno.env.get("INFERENCE_AUTH_HEADER") || "Authorization";
  const prefix = Deno.env.get("INFERENCE_AUTH_PREFIX") || "Bearer";
  if (!token) throw new Error("Missing INFERENCE_API_TOKEN");
  return { [headerName]: prefix ? `${prefix} ${token}` : token, "Content-Type": "application/json" };
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
    const EMBED_URL = Deno.env.get("EMBED_URL");
    const SEGMENT_URL = Deno.env.get("SEGMENT_URL") || DETECT_URL; // fallback to DETECT for segmentation
    
    if (!DETECT_URL || !EMBED_URL) {
      throw new Error("Missing DETECT_URL or EMBED_URL");
    }
    const infHeaders = buildInferenceHeaders();

    // download image
    const { data: img, error: dlErr } = await supabase.storage.from("sila").download(imagePath);
    if (dlErr) throw new Error(`Failed to download image: ${dlErr.message}`);
    const buf = new Uint8Array(await img.arrayBuffer());
    const base64Image = uint8ToBase64(buf);

    // DETECT
    const detectRes = await fetch(DETECT_URL, {
      method: "POST", headers: infHeaders, body: JSON.stringify({ image: base64Image, format: "base64" }),
    });
    if (!detectRes.ok) {
      const t = await detectRes.text().catch(() => "");
      throw new Error(`Detection failed: ${detectRes.status}${t ? ` – ${t.slice(0, 200)}` : ""}`);
    }
    const detectData = await detectRes.json();
    const boxes = Array.isArray(detectData?.boxes) ? detectData.boxes : [];
    if (boxes.length === 0) throw new Error("No objects detected in image");
    const bbox = boxes[0];

    // SEGMENT (using DETECT_URL as fallback since segmentation might not be separate)
    const segmentRes = await fetch(SEGMENT_URL, {
      method: "POST", headers: infHeaders, body: JSON.stringify({ image: base64Image, bbox, format: "base64" }),
    });
    if (!segmentRes.ok) throw new Error(`Segmentation failed: ${segmentRes.status}`);
    const segmentData = await segmentRes.json();
    const maskBase64 = segmentData?.mask;
    const cropBase64 = segmentData?.crop;
    if (!maskBase64 || !cropBase64) throw new Error("Segmentation returned no mask/crop");

    // naive color placeholder
    const color_hex = "#8B5A2B";
    const color_name = "brown";

    // store mask/crop
    const parts = imagePath.split("/");
    const userId = parts[0];
    const itemUuid = parts[2]?.split(".")[0];
    const maskPath = `${userId}/items/${itemUuid}-mask.png`;
    const cropPath = `${userId}/items/${itemUuid}-crop.png`;

    const toBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    await supabase.storage.from("sila").upload(maskPath, toBytes(maskBase64), { contentType: "image/png", upsert: true });
    await supabase.storage.from("sila").upload(cropPath, toBytes(cropBase64), { contentType: "image/png", upsert: true });

    // EMBED with robust fallback
    let embedding;
    let embedUrl = EMBED_URL;
    
    // Try multiple approaches for embedding
    const embedAttempts = [
      // Attempt 1: JSON with inputs key
      { url: embedUrl, body: JSON.stringify({ inputs: cropBase64 }) },
      // Attempt 2: Original format
      { url: embedUrl, body: JSON.stringify({ image: cropBase64, format: "base64" }) },
      // Attempt 3: Try feature-extraction task if image-feature-extraction fails
      { url: embedUrl.replace("image-feature-extraction", "feature-extraction"), body: JSON.stringify({ inputs: cropBase64 }) },
      // Attempt 4: Fallback to different model
      { url: "https://router.huggingface.co/hf-inference/models/laion/CLIP-ViT-B-32-laion2B-s34B-b79K?task=feature-extraction", body: JSON.stringify({ inputs: cropBase64 }) },
    ];

    let embedSuccess = false;
    for (let i = 0; i < embedAttempts.length && !embedSuccess; i++) {
      const attempt = embedAttempts[i];
      console.log(`EMBED attempt ${i + 1}: ${attempt.url.split('?')[0]}?task=${attempt.url.split('task=')[1] || 'unknown'}`);
      
      try {
        const embedRes = await fetch(attempt.url, {
          method: "POST", headers: infHeaders, body: attempt.body,
        });
        
        console.log(`EMBED attempt ${i + 1} status: ${embedRes.status}`);
        
        if (embedRes.ok) {
          const embedData = await embedRes.json();
          embedding = embedData?.embedding || embedData;
          if (embedding && Array.isArray(embedding)) {
            embedSuccess = true;
            console.log(`EMBED success with ${embedding.length} dimensions`);
          }
        } else if (i === embedAttempts.length - 1) {
          const errorText = await embedRes.text().catch(() => "");
          throw new Error(`All embedding attempts failed. Last: ${embedRes.status}${errorText ? ` - ${errorText.slice(0, 100)}` : ""}`);
        }
      } catch (e) {
        if (i === embedAttempts.length - 1) throw e;
        console.log(`EMBED attempt ${i + 1} failed: ${e.message}`);
      }
    }
    
    if (!embedding || !Array.isArray(embedding)) throw new Error("No valid embedding returned from any attempt");

    const { error: upsertErr } = await supabase.from("item_embeddings").upsert({ item_id: itemId, embedding });
    if (upsertErr) throw upsertErr;

    const category = detectData.category || "clothing";
    const subcategory = detectData.subcategory || "item";
    const { error: updErr } = await supabase.from("items").update({
      category, subcategory, color_hex, color_name, mask_path: maskPath, crop_path: cropPath,
    }).eq("id", itemId);
    if (updErr) throw updErr;

    return new Response(JSON.stringify({ ok: true, embedding: Array.isArray(embedding) ? embedding.length : 0 }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("items-process error:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});