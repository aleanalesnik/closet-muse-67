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

async function extractDominantColor(base64Image: string): Promise<{ colorName: string; colorHex: string }> {
  try {
    // Remove data URL prefix if present
    const base64Data = base64Image.replace(/^data:image\/[^;]+;base64,/, '');
    const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    // Simple PNG/JPEG header detection for basic parsing
    const isPNG = imageBytes[0] === 0x89 && imageBytes[1] === 0x50;
    const isJPEG = imageBytes[0] === 0xFF && imageBytes[1] === 0xD8;
    
    if (!isPNG && !isJPEG) {
      throw new Error("Unsupported image format for color extraction");
    }
    
    // For simplicity, extract color from a sample of pixels
    // This is a basic heuristic - in production you'd use proper image decoding
    let r = 0, g = 0, b = 0, samples = 0;
    
    // Sample every 100th byte as RGB approximation (very rough heuristic)
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
    // Fallback to brown as before
    return { colorName: "brown", colorHex: "#8B5A2B" };
  }
}

function mapRgbToColorName(r: number, g: number, b: number): string {
  // Simple color mapping based on dominant channel and brightness
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = (r + g + b) / 3;
  const saturation = max === 0 ? 0 : (max - min) / max;
  
  // Low saturation colors (grays)
  if (saturation < 0.3) {
    if (brightness < 60) return "black";
    if (brightness < 120) return "gray";
    if (brightness < 200) return "light gray";
    return "white";
  }
  
  // High saturation colors
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
  
  // Mixed colors
  if (r > 150 && g > 100 && b < 100) return "orange";
  if (r > 100 && g < 100 && b > 100) return "purple";
  if (r < 100 && g > 100 && b > 100) return "cyan";
  
  return "brown"; // fallback
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

function isHFHosted(url: string) {
  return /huggingface\.co\/|router\.huggingface\.co\//.test(url);
}

function normalizeSecret(v?: string | null) {
  const s = (v ?? "").trim().toLowerCase();
  if (!s || s === "none" || s === "false" || s === "0") return null;
  return v!.trim();
}

const CLOTHING_VOCAB = [
  "t-shirt","shirt","blouse","sweater","hoodie","cardigan",
  "jacket","blazer","coat","dress","skirt","jeans","trousers","shorts",
  "boots","sneakers","heels","loafers",
  "handbag","tote bag","crossbody bag","backpack",
  "hat","scarf","belt"
];

const CATEGORY_MAP: Record<string,"top"|"bottom"|"shoes"|"bag"|"accessory"> = {
  "t-shirt":"top","shirt":"top","blouse":"top","sweater":"top","hoodie":"top","cardigan":"top",
  "jacket":"top","blazer":"top","coat":"top","dress":"top",
  "skirt":"bottom","jeans":"bottom","trousers":"bottom","shorts":"bottom",
  "boots":"shoes","sneakers":"shoes","heels":"shoes","loafers":"shoes",
  "handbag":"bag","tote bag":"bag","crossbody bag":"bag","backpack":"bag",
  "hat":"accessory","scarf":"accessory","belt":"accessory"
};

async function zeroShotClassify(base64Img: string) {
  const CLASSIFY_URL = normalizeSecret(Deno.env.get("CLASSIFY_URL"));
  if (!CLASSIFY_URL) return null; // <- allow missing
  
  const res = await fetch(CLASSIFY_URL, {
    method: "POST",
    headers: { ...buildInferenceHeaders(), Accept: "application/json" },
    body: JSON.stringify({ image: base64Img, labels: CLOTHING_VOCAB })
  });
  if (!res.ok) return null;
  
  const j = await res.json();
  const entries = Object.entries(j?.probs ?? {}) as Array<[string, number]>;
  if (!entries.length) return null;
  const [label, score] = entries.sort((a,b)=>b[1]-a[1])[0];
  return { label, score };
}

async function captionAndMatch(base64Img: string) {
  const CAPTION_URL = normalizeSecret(Deno.env.get("CAPTION_URL"));
  if (!CAPTION_URL) return null;
  
  const body = isHFHosted(CAPTION_URL) ? { inputs: base64Img } : { image: base64Img, format: "base64" };
  const res = await fetch(CAPTION_URL, { 
    method: "POST", 
    headers: { ...buildInferenceHeaders(), Accept: "application/json" }, 
    body: JSON.stringify(body) 
  });
  if (!res.ok) return null;
  
  const j = await res.json();
  const caption = Array.isArray(j) ? (j[0]?.generated_text ?? j[0]?.summary_text) : (j.generated_text ?? j.caption ?? "");
  if (!caption) return null;
  
  const lc = caption.toLowerCase();
  for (const l of CLOTHING_VOCAB) {
    if (lc.includes(l)) return { label: l, score: 0.60 };
  }
  return null;
}

// Text embedding fallback using sentence-transformers
async function embedTextFallback(text: string, headers: Record<string, string>) {
  const GTE_URL = "https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2";
  console.log(`[TEXT-EMBED] Using text fallback: "${text.slice(0, 100)}..."`);
  
  const res = await fetch(GTE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ inputs: text })
  });
  
  if (!res.ok) {
    console.warn(`[TEXT-EMBED] Failed: ${res.status}`);
    return null;
  }
  
  const embedding = await res.json();
  return Array.isArray(embedding) && Array.isArray(embedding[0]) ? embedding[0] : embedding;
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
    
    if (!EMBED_URL) {
      throw new Error("Missing EMBED_URL");
    }
    const infHeaders = buildInferenceHeaders();

    // Download image
    const { data: img, error: dlErr } = await supabase.storage.from("sila").download(imagePath);
    if (dlErr) throw new Error(`Failed to download image: ${dlErr.message}`);
    const buf = new Uint8Array(await img.arrayBuffer());
    const base64Image = uint8ToBase64(buf);

    // STEP 1: DETECT (optional based on env flag)
    const USE_DETECT = (Deno.env.get("ITEMS_USE_DETECT") ?? "0") !== "0";
    let cropBase64ForEmbed = base64Image; // default: whole image
    let hadBoxes = false;
    let bbox = null;

    if (USE_DETECT && DETECT_URL) {
      console.log(`[DETECT] Starting detection...`);
      
      const detectBody = isHFHosted(DETECT_URL)
        ? { inputs: base64Image }            // HF Hosted/Router
        : { image: base64Image, format: "base64" }; // custom endpoint

      const detectRes = await fetch(DETECT_URL, {
        method: "POST",
        headers: { ...infHeaders, Accept: "application/json" },
        body: JSON.stringify(detectBody),
      });
      
      const detectTxt = await detectRes.text();
      let detectJson: any = {};
      try { detectJson = JSON.parse(detectTxt); } catch {}
      console.log("[DETECT] status", detectRes.status, "len", detectTxt.length, "preview:", detectTxt.slice(0, 160));
      
      if (!detectRes.ok) {
        console.warn(`[DETECT] Failed: ${detectRes.status} - falling back to whole image`);
      } else {
        const boxes = Array.isArray(detectJson?.boxes) ? detectJson.boxes : [];
        hadBoxes = boxes.length > 0;
        
        if (hadBoxes) {
          // pick the best box (highest score or largest area)
          const best = boxes
            .slice()
            .sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0))[0];
          bbox = best;
          console.log(`[DETECT] Found ${boxes.length} boxes, using best with score ${best.score ?? 'N/A'}`);
        } else {
          console.warn("[DETECT] 0 boxes — falling back to whole-image crop");
        }
      }
    } else {
      console.log("[DETECT] Skipped for items (ITEMS_USE_DETECT=0)");
    }

    // STEP 2: SEGMENT (optional, only if we had a detection)
    let maskBase64 = null;
    
    if (SEGMENT_URL && hadBoxes && bbox) {
      console.log(`[SEGMENT] Starting segmentation...`);
      try {
        const segmentData = await callInferenceWithRetry(
          SEGMENT_URL, 
          { inputs: { image: base64Image, bbox } }, 
          "SEGMENT", 
          infHeaders
        );
        
        maskBase64 = segmentData?.mask || null;
        cropBase64ForEmbed = segmentData?.crop || base64Image;
        
        if (!segmentData?.crop) {
          console.log(`[SEGMENT] Warning: No crop returned, using original image`);
        }
      } catch (error) {
        console.warn(`[SEGMENT] Failed:`, error.message);
      }
    } else if (SEGMENT_URL && !hadBoxes) {
      console.log(`[SEGMENT] Skipped - no detection bbox available`);
    } else if (!SEGMENT_URL) {
      console.log(`[SEGMENT] Skipped - SEGMENT_URL not configured`);
    }

    // Store generated files (crop and optional mask)
    const imageParts = imagePath.split("/");
    if (imageParts.length < 3) {
      throw new Error(`Invalid imagePath format: ${imagePath}. Expected userId/items/uuid.ext`);
    }
    
    const userId = imageParts[0];
    const itemUuid = imageParts[2]?.split(".")[0];
    const maskPath = maskBase64 ? `${userId}/items/${itemUuid}-mask.png` : null;
    const cropPath = `${userId}/items/${itemUuid}-crop.png`;

    // Store files to storage
    const toBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    
    // Always save crop (either segmented crop or original image)
    await supabase.storage.from("sila").upload(cropPath, toBytes(cropBase64ForEmbed), { 
      contentType: "image/png", 
      upsert: true 
    });
    
    // Only save mask if we have one from segmentation
    if (maskBase64) {
      await supabase.storage.from("sila").upload(maskPath, toBytes(maskBase64), { 
        contentType: "image/png", 
        upsert: true 
      });
    }

    // STEP 3: EMBED with comprehensive error handling
    console.log(`[EMBED] Starting embedding...`);
    let embedding = null;
    
    try {
      const embedBody = isHFHosted(EMBED_URL)
        ? { inputs: cropBase64ForEmbed }
        : { image: cropBase64ForEmbed, format: "base64" };

      const embedRes = await fetch(EMBED_URL, {
        method: "POST",
        headers: { ...infHeaders, Accept: "application/json" },
        body: JSON.stringify(embedBody),
      });
      
      if (embedRes.status === 404) {
        console.warn("[EMBED] 404 at", EMBED_URL, "— using text fallback");
        // Try caption-based text embedding fallback
        const captionResult = await captionAndMatch(cropBase64ForEmbed);
        if (captionResult?.label) {
          const textEmbed = await embedTextFallback(`clothing item: ${captionResult.label}`, infHeaders);
          if (textEmbed) {
            embedding = textEmbed;
            console.log("[EMBED] Text fallback successful");
          }
        }
      } else if (!embedRes.ok) {
        console.warn(`[EMBED] Failed: ${embedRes.status} - continuing without embedding`);
      } else {
        const embedData = await embedRes.json();
        embedding = embedData?.embedding;
      }
    } catch (error) {
      console.warn("[EMBED] Exception:", error.message, "- continuing without embedding");
    }
    
    // Continue processing even without embedding
    if (!embedding || !Array.isArray(embedding)) {
      console.warn("[EMBED] No valid embedding - item will be stored without vector search capability");
    }

    // Extract dominant color from crop
    console.log(`[COLOR] Extracting dominant color from crop...`);
    const { colorName, colorHex } = await extractDominantColor(cropBase64ForEmbed);
    console.log(`[COLOR] Detected: ${colorName} (${colorHex})`);
    
    // Get current item to check for existing category/subcategory
    const { data: currentItem, error: itemErr } = await supabase
      .from("items")
      .select("category, subcategory")
      .eq("id", itemId)
      .single();
    if (itemErr) throw new Error(`Failed to get current item: ${itemErr.message}`);
    
    // Auto-classify clothing type regardless of detection (using crop or whole image)
    let inferred: {label: string, score: number} | null = await zeroShotClassify(cropBase64ForEmbed);
    if (!inferred) inferred = await captionAndMatch(cropBase64ForEmbed);

    let category = null;
    let subcategory = null;

    if (inferred) {
      const mapped = CATEGORY_MAP[inferred.label];
      if (mapped) {
        category = mapped;
        subcategory = inferred.label;
        console.log(`[CLASSIFY] Auto-detected: ${inferred.label} -> ${mapped}/${inferred.label} (score: ${inferred.score})`);
      }
    }
    
    // Atomic database updates
    // Use extracted colors instead of placeholders
    
    // Upsert embedding (only if we have one)
    if (embedding && Array.isArray(embedding)) {
      const { error: upsertErr } = await supabase
        .from("item_embeddings")
        .upsert({ item_id: itemId, embedding });
      if (upsertErr) {
        console.warn(`Failed to upsert embedding: ${upsertErr.message}`);
        // Don't throw - continue with other updates
      }
    } else {
      console.log("[EMBED] Skipping embedding insert - no valid vector available");
    }

    // Update items with conditional category/subcategory patching
    const patch: any = { 
      color_hex: colorHex, 
      color_name: colorName,
      mask_path: maskBase64 ? maskPath : null,
      crop_path: cropPath,
    };

    // Only set category/subcategory if current DB values are NULL and we have auto-labels
    if (!currentItem?.category && category) patch.category = category;
    if (!currentItem?.subcategory && subcategory) patch.subcategory = subcategory;

    const { error: updErr } = await supabase
      .from("items")
      .update(patch)
      .eq("id", itemId);
    if (updErr) throw new Error(`Failed to update item: ${updErr.message}`);

    const embeddingDims = embedding && Array.isArray(embedding) ? embedding.length : 0;
    console.log(`[SUCCESS] Pipeline completed - embedding dims: ${embeddingDims}`);
    return new Response(JSON.stringify({ ok: true, embedding_dims: embeddingDims }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("items-process error:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});