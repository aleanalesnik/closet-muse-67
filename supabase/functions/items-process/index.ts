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
    const baseUrl = Deno.env.get("INFERENCE_BASE_URL");
    const DETECT = Deno.env.get("DETECT_ENDPOINT");
    const SEGMENT = Deno.env.get("SEGMENT_ENDPOINT");
    const EMBED = Deno.env.get("EMBED_ENDPOINT");
    if (!baseUrl || !DETECT || !SEGMENT || !EMBED) {
      throw new Error("Missing one or more inference endpoints/base URL");
    }
    const infHeaders = buildInferenceHeaders();

    // download image
    const { data: img, error: dlErr } = await supabase.storage.from("sila").download(imagePath);
    if (dlErr) throw new Error(`Failed to download image: ${dlErr.message}`);
    const buf = new Uint8Array(await img.arrayBuffer());
    const base64Image = uint8ToBase64(buf);

    // DETECT
    const detectRes = await fetch(`${baseUrl}${DETECT}`, {
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

    // SEGMENT
    const segmentRes = await fetch(`${baseUrl}${SEGMENT}`, {
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

    // EMBED
    const embedRes = await fetch(`${baseUrl}${EMBED}`, {
      method: "POST", headers: infHeaders, body: JSON.stringify({ image: cropBase64, format: "base64" }),
    });
    if (!embedRes.ok) throw new Error(`Embedding failed: ${embedRes.status}`);
    const embedData = await embedRes.json();
    const embedding = embedData?.embedding;
    if (!embedding) throw new Error("Embedding missing from response");

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