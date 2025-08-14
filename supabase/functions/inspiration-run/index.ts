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
    const urlWithoutToken = url.replace(/[\?&].*$/, '');
    
    console.log(`[${stage}] ${response.status} ${urlWithoutToken} - ${responseText.slice(0, 120)}`);
    
    if (response.status === 404) {
      throw new Error(`${stage} not deployed (404) at ${urlWithoutToken}`);
    }
    
    if (response.ok) {
      return JSON.parse(responseText);
    }
    
    if (response.status >= 500 && attempt < maxRetries) {
      console.log(`[${stage}] Retrying in ${delays[attempt]}ms...`);
      await new Promise(resolve => setTimeout(resolve, delays[attempt]));
      continue;
    }
    
    throw new Error(`${stage} failed: ${response.status} - ${responseText.slice(0, 200)}`);
  }
}

async function extractDominantColor(base64Image: string): Promise<{ colorName: string; colorHex: string }> {
  try {
    const base64Data = base64Image.replace(/^data:image\/[^;]+;base64,/, '');
    const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    const isPNG = imageBytes[0] === 0x89 && imageBytes[1] === 0x50;
    const isJPEG = imageBytes[0] === 0xFF && imageBytes[1] === 0xD8;
    
    if (!isPNG && !isJPEG) {
      throw new Error("Unsupported image format for color extraction");
    }
    
    let r = 0, g = 0, b = 0, samples = 0;
    
    for (let i = 100; i < imageBytes.length - 2; i += 100) {
      r += imageBytes[i];
      g += imageBytes[i + 1];  
      b += imageBytes[i + 2];
      samples++;
    }
    
    if (samples === 0) {
      throw new Error("No color samples extracted");
    }
    
    r = Math.round(r / samples);
    g = Math.round(g / samples);
    b = Math.round(b / samples);
    
    const colorHex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    const colorName = mapRgbToColorName(r, g, b);
    
    return { colorName, colorHex };
  } catch (error) {
    console.warn("Color extraction failed:", error.message);
    return { colorName: "brown", colorHex: "#8B5A2B" };
  }
}

function mapRgbToColorName(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = (r + g + b) / 3;
  const saturation = max === 0 ? 0 : (max - min) / max;
  
  if (saturation < 0.3) {
    if (brightness < 60) return "black";
    if (brightness < 120) return "gray";
    if (brightness < 200) return "light gray";
    return "white";
  }
  
  if (r > g && r > b) {
    if (g > b * 1.5) return "yellow";
    if (b > g * 1.2) return "purple";
    return "red";
  }
  
  if (g > r && g > b) {
    if (r > b * 1.2) return "yellow";
    if (b > r * 1.2) return "teal";
    return "green";
  }
  
  if (b > r && b > g) {
    if (r > g * 1.2) return "purple";
    if (g > r * 1.2) return "teal";
    return "blue";
  }
  
  if (r > 150 && g > 100 && b < 100) return "orange";
  if (r > 100 && g < 100 && b > 100) return "purple";
  if (r < 100 && g > 100 && b > 100) return "cyan";
  
  return "brown";
}

function rand(min: number, max: number) { return Math.random() * (max - min) + min; }

async function createStubDetections(queryId: string, supabase: any) {
  const dim = Number(Deno.env.get("EMBEDDING_DIM") ?? 512);
  const mkVec = () => Array.from({ length: dim }, () => Math.random());
  
  const fake = [
    { bbox: [rand(0.1, 0.3), rand(0.1, 0.3), rand(0.4, 0.6), rand(0.5, 0.8)], category: "top" },
    { bbox: [rand(0.4, 0.5), rand(0.2, 0.35), rand(0.8, 0.95), rand(0.9, 0.98)], category: "bottom" },
  ];
  
  for (const f of fake) {
    await supabase.from("inspiration_detections").insert({
      query_id: queryId, 
      bbox: f.bbox, 
      category: f.category, 
      mask_path: null, 
      crop_path: null, 
      embedding: mkVec(),
    });
  }
  
  return fake.length;
}

async function createRealDetections(queryId: string, imagePath: string, supabase: any) {
  const DETECT_URL = Deno.env.get("DETECT_URL");
  const SEGMENT_URL = Deno.env.get("SEGMENT_URL");
  const EMBED_URL = Deno.env.get("EMBED_URL");
  
  if (!DETECT_URL || !EMBED_URL) {
    throw new Error("Missing DETECT_URL or EMBED_URL for real inference");
  }
  
  const infHeaders = buildInferenceHeaders();
  
  // Download image
  const { data: img, error: dlErr } = await supabase.storage.from("sila").download(imagePath);
  if (dlErr) throw new Error(`Failed to download image: ${dlErr.message}`);
  const buf = new Uint8Array(await img.arrayBuffer());
  const base64Image = uint8ToBase64(buf);
  
  // DETECT
  console.log(`[DETECT] Starting detection...`);
  const detectData = await callInferenceWithRetry(
    DETECT_URL, 
    { inputs: base64Image }, 
    "DETECT", 
    infHeaders
  );
  
  const boxes = Array.isArray(detectData?.boxes) ? detectData.boxes : [];
  if (boxes.length === 0) throw new Error("No objects detected in image");
  
  let detectionCount = 0;
  
  // Process each detected object
  for (let i = 0; i < Math.min(boxes.length, 5); i++) { // Limit to 5 detections
    const bbox = boxes[i];
    
    // SEGMENT (optional)
    let maskBase64 = null;
    let cropBase64 = base64Image;
    
    if (SEGMENT_URL) {
      console.log(`[SEGMENT] Processing detection ${i + 1}...`);
      try {
        const segmentData = await callInferenceWithRetry(
          SEGMENT_URL, 
          { inputs: { image: base64Image, bbox } }, 
          "SEGMENT", 
          infHeaders
        );
        
        maskBase64 = segmentData?.mask || null;
        cropBase64 = segmentData?.crop || base64Image;
      } catch (error) {
        console.warn(`[SEGMENT] Failed for detection ${i + 1}:`, error.message);
      }
    }
    
    // EMBED
    console.log(`[EMBED] Processing detection ${i + 1}...`);
    const embedData = await callInferenceWithRetry(
      EMBED_URL, 
      { inputs: cropBase64 }, 
      "EMBED", 
      infHeaders
    );
    
    const embedding = embedData?.embedding;
    if (!embedding || !Array.isArray(embedding)) {
      console.warn(`[EMBED] Invalid embedding for detection ${i + 1}, skipping`);
      continue;
    }
    
    // Extract color and category
    const { colorName, colorHex } = await extractDominantColor(cropBase64);
    const category = detectData.category || "clothing";
    
    // Store paths
    const parts = imagePath.split("/");
    const userId = parts[0];
    const queryUuid = parts[2]?.split(".")[0];
    const maskPath = maskBase64 ? `${userId}/inspo/${queryUuid}-det${i}-mask.png` : null;
    const cropPath = `${userId}/inspo/${queryUuid}-det${i}-crop.png`;
    
    // Save crop and mask to storage
    const toBytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    
    await supabase.storage.from("sila").upload(cropPath, toBytes(cropBase64), { 
      contentType: "image/png", 
      upsert: true 
    });
    
    if (maskBase64) {
      await supabase.storage.from("sila").upload(maskPath, toBytes(maskBase64), { 
        contentType: "image/png", 
        upsert: true 
      });
    }
    
    // Save detection to DB
    await supabase.from("inspiration_detections").insert({
      query_id: queryId,
      bbox,
      category,
      mask_path: maskPath,
      crop_path: cropPath,
      embedding,
    });
    
    detectionCount++;
    console.log(`[SUCCESS] Detection ${i + 1} saved with ${embedding.length}D embedding`);
  }
  
  return detectionCount;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  
  try {
    const body = await req.json().catch(() => ({}));
    const supabase = getServiceClient();
    const STUB_MODE = Number(Deno.env.get("STUB_MODE") ?? 1); // Default to stub mode
    
    console.log(`[INSPO] Running in ${STUB_MODE ? 'STUB' : 'REAL'} mode`);

    // Find a queued query if none provided
    let queryId: string | null = body?.queryId ?? null;
    let imagePath: string | null = null;
    
    if (!queryId) {
      const { data: q } = await supabase
        .from("inspiration_queries")
        .select("id, image_path")
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!q) return new Response(null, { status: 204, headers: cors });
      queryId = q.id;
      imagePath = q.image_path;
    } else {
      // Get image path for provided query
      const { data: q } = await supabase
        .from("inspiration_queries")
        .select("image_path")
        .eq("id", queryId)
        .single();
      if (!q) throw new Error("Query not found");
      imagePath = q.image_path;
    }

    await supabase.from("inspiration_queries").update({ status: "processing" }).eq("id", queryId);

    let detectionCount = 0;
    
    if (STUB_MODE) {
      // Create fake detections
      detectionCount = await createStubDetections(queryId, supabase);
      console.log(`[STUB] Created ${detectionCount} fake detections`);
    } else {
      // Create real detections using inference pipeline
      detectionCount = await createRealDetections(queryId, imagePath, supabase);
      console.log(`[REAL] Created ${detectionCount} real detections`);
    }

    await supabase.from("inspiration_queries").update({ status: "done" }).eq("id", queryId);

    return new Response(JSON.stringify({ 
      ok: true, 
      queryId, 
      detections: detectionCount, 
      mode: STUB_MODE ? "stub" : "real"
    }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
    
  } catch (e) {
    // Try to mark errored queries
    try {
      const cloned = await req.clone().json().catch(() => ({}));
      if (cloned?.queryId) {
        const supabase = getServiceClient();
        await supabase.from("inspiration_queries").update({ 
          status: "error", 
          error: String(e?.message ?? e) 
        }).eq("id", cloned.queryId);
      }
    } catch {}
    
    console.error("inspiration-run error:", e);
    return new Response(JSON.stringify({ 
      ok: false, 
      error: String(e?.message ?? e) 
    }), {
      status: 500, 
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});