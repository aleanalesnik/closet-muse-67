import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE");
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
  return btoa(binary);
}

function isHFHosted(url: string) {
  return /huggingface\.co\/|router\.huggingface\.co\//.test(url);
}

function normalizeSecret(v?: string | null) {
  const s = (v ?? "").trim().toLowerCase();
  if (!s || s === "none" || s === "false" || s === "0") return null;
  return v!.trim();
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
  
  if (r < 100 && g > 100 && b > 100) return "cyan";
  
  return "brown";
}

const CLOTHING_VOCAB = [
  "t-shirt","shirt","blouse","sweater","hoodie","cardigan",
  "jacket","blazer","coat","dress","skirt","jeans","trousers","shorts",
  "boots","sneakers","heels","loafers","handbag","tote bag","crossbody bag","backpack",
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

async function zeroShotClassify(b64: string) {
  const CLASSIFY_URL = normalizeSecret(Deno.env.get("CLASSIFY_URL"));
  if (!CLASSIFY_URL) return null;
  
  try {
    const r = await fetch(CLASSIFY_URL, {
      method: "POST",
      headers: { ...buildInferenceHeaders(), Accept: "application/json" },
      body: JSON.stringify({ image: b64, labels: CLOTHING_VOCAB })
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => ({}));
    const entries = Object.entries(j?.probs ?? {}) as Array<[string,number]>;
    if (!entries.length) return null;
    const [label, score] = entries.sort((a,b)=>b[1]-a[1])[0];
    return { label, score };
  } catch (error) {
    console.warn("[CLASSIFY] Error:", error.message);
    return null;
  }
}

async function captionAndMatch(b64: string) {
  const CAPTION_URL = normalizeSecret(Deno.env.get("CAPTION_URL"));
  if (!CAPTION_URL) return null;
  
  try {
    const body = isHFHosted(CAPTION_URL) ? { inputs: b64 } : { image: b64, format: "base64" };
    const r = await fetch(CAPTION_URL, { 
      method: "POST", 
      headers: { ...buildInferenceHeaders(), Accept: "application/json" }, 
      body: JSON.stringify(body) 
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => ({}));
    const caption = Array.isArray(j) ? (j[0]?.generated_text ?? j[0]?.summary_text) : (j.generated_text ?? j.caption ?? "");
    if (!caption) return null;
    const lc = caption.toLowerCase();
    for (const l of CLOTHING_VOCAB) if (lc.includes(l)) return { label: l, score: 0.60 };
    return null;
  } catch (error) {
    console.warn("[CAPTION] Error:", error.message);
    return null;
  }
}

// Text embedding fallback
async function embedTextFallback(text: string, headers: Record<string, string>) {
  const GTE_URL = "https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2";
  console.log(`[TEXT-EMBED] Using text fallback: "${text.slice(0, 100)}..."`);
  
  try {
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
  } catch (error) {
    console.warn("[TEXT-EMBED] Error:", error.message);
    return null;
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
    
    const infHeaders = buildInferenceHeaders();

    // Download image
    const { data: img, error: dlErr } = await supabase.storage.from("sila").download(imagePath);
    if (dlErr) throw new Error(`Failed to download image: ${dlErr.message}`);
    const buf = new Uint8Array(await img.arrayBuffer());
    const base64Image = uint8ToBase64(buf);

    // STEP 1: DETECT (optional)
    const USE_DETECT = (Deno.env.get("ITEMS_USE_DETECT") ?? "0") !== "0";
    let cropBase64ForEmbed = base64Image; // default whole image
    let hadBoxes = false;
    let bbox = null;

    if (USE_DETECT && DETECT_URL) {
      console.log(`[DETECT] Starting detection...`);
      
      try {
        const detectBody = isHFHosted(DETECT_URL)
          ? { inputs: base64Image }
          : { image: base64Image, format: "base64" };

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
          if (boxes.length > 0) {
            hadBoxes = true;
            // pick the best box (highest score or largest area)
            const best = boxes
              .slice()
              .sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0))[0];
            bbox = best;
            console.log(`[DETECT] Found ${boxes.length} boxes, using best with score ${best.score ?? 'N/A'}`);
          } else {
            console.warn("[DETECT] 0 boxes — using whole image as crop");
          }
        }
      } catch (error) {
        console.warn("[DETECT] Exception:", error.message, "- falling back to whole image");
      }
    } else {
      console.log("[DETECT] Skipped for items (ITEMS_USE_DETECT=0)");
    }

    // STEP 2: SEGMENT (optional, only if we had a detection)
    let maskBase64 = null;
    
    if (SEGMENT_URL && hadBoxes && bbox) {
      console.log(`[SEGMENT] Starting segmentation...`);
      try {
        const segmentBody = isHFHosted(SEGMENT_URL) 
          ? { inputs: { image: base64Image, bbox } }
          : { image: base64Image, bbox, format: "base64" };
          
        const segmentRes = await fetch(SEGMENT_URL, {
          method: "POST",
          headers: { ...infHeaders, Accept: "application/json" },
          body: JSON.stringify(segmentBody),
        });
        
        if (segmentRes.ok) {
          const segmentData = await segmentRes.json();
          maskBase64 = segmentData?.mask || null;
          cropBase64ForEmbed = segmentData?.crop || base64Image;
          
          if (!segmentData?.crop) {
            console.log(`[SEGMENT] Warning: No crop returned, using original image`);
          }
        } else {
          console.warn(`[SEGMENT] Failed: ${segmentRes.status}`);
        }
      } catch (error) {
        console.warn(`[SEGMENT] Exception:`, error.message);
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
    
    try {
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
    } catch (error) {
      console.warn("[STORAGE] File upload error:", error.message);
    }

    // STEP 3: EMBED - never crash
    console.log(`[EMBED] Starting embedding...`);
    let embedding: number[] | null = null;
    
    if (EMBED_URL) {
      try {
        const body = isHFHosted(EMBED_URL)
          ? { inputs: cropBase64ForEmbed }
          : { image: cropBase64ForEmbed, format: "base64" };

        const res = await fetch(EMBED_URL, {
          method: "POST",
          headers: { ...infHeaders, Accept: "application/json" },
          body: JSON.stringify(body),
        });

        if (res.status === 404) {
          console.warn("[EMBED] 404 at", EMBED_URL, "— trying text fallback");
          // Try caption-based text embedding fallback
          const captionResult = await captionAndMatch(cropBase64ForEmbed);
          if (captionResult?.label) {
            const textEmbed = await embedTextFallback(`clothing item: ${captionResult.label}`, infHeaders);
            if (textEmbed) {
              embedding = textEmbed;
              console.log("[EMBED] Text fallback successful");
            }
          }
        } else if (!res.ok) {
          const txt = await res.text().catch(() => "");
          console.warn("[EMBED] non-2xx", res.status, txt.slice(0, 160));
        } else {
          const j = await res.json().catch(() => ({}));
          embedding = Array.isArray(j?.embedding) ? j.embedding : null;
          if (embedding) {
            console.log(`[EMBED] Success - ${embedding.length} dimensions`);
          }
        }
      } catch (e) {
        console.warn("[EMBED] exception", String((e as Error)?.message ?? e));
      }
    } else {
      console.log("[EMBED] Skipped - EMBED_URL not configured");
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
    if (itemErr) {
      console.warn(`[DB] Failed to get current item: ${itemErr.message}`);
    }
    
    // Auto-classify clothing type regardless of detection (using crop or whole image)
    let inferred = await zeroShotClassify(cropBase64ForEmbed);
    if (!inferred) inferred = await captionAndMatch(cropBase64ForEmbed);

    // Prepare database updates
    const patch: any = { 
      color_hex: colorHex, 
      color_name: colorName,
      mask_path: maskPath,
      crop_path: cropPath
    };

    // Only set category/subcategory if current DB values are NULL and we have auto-labels
    if (!currentItem?.category && inferred?.label && CATEGORY_MAP[inferred.label]) {
      patch.category = CATEGORY_MAP[inferred.label];
    }
    if (!currentItem?.subcategory && inferred?.label) {
      patch.subcategory = inferred.label;
    }

    if (inferred) {
      console.log(`[CLASSIFY] Auto-detected: ${inferred.label} -> ${CATEGORY_MAP[inferred.label] || 'unknown'}/${inferred.label} (score: ${inferred.score})`);
    }

    // Write vector only if we have one
    if (embedding) {
      const { error: upsertErr } = await supabase
        .from("item_embeddings")
        .upsert({ item_id: itemId, embedding });
      if (upsertErr) {
        console.warn("[DB] item_embeddings upsert error", upsertErr.message);
      }
    }

    // Update items table
    const { error: updErr } = await supabase
      .from("items")
      .update(patch)
      .eq("id", itemId);
    if (updErr) {
      console.warn("[DB] items update error", updErr.message);
    }

    const embeddingDims = embedding && Array.isArray(embedding) ? embedding.length : 0;
    console.log(`[SUCCESS] Pipeline completed - embedding dims: ${embeddingDims}`);
    
    // Always return 200 with clear payload
    return new Response(JSON.stringify({
      ok: true,
      used_detect: USE_DETECT && hadBoxes,
      embedded: !!embedding,
      embedding_dims: embeddingDims
    }), { 
      headers: { ...cors, "Content-Type": "application/json" }
    });
    
  } catch (e) {
    console.error("items-process error:", e);
    return new Response(JSON.stringify({ 
      ok: false, 
      error: String(e?.message ?? e) 
    }), {
      status: 500, 
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});