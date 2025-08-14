import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

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

// Color detection constants and helpers
const COLOR_WORDS: Record<string,string> = {
  "black":"#000000","white":"#ffffff","gray":"#808080","grey":"#808080",
  "beige":"#d9c7a0","brown":"#8b5a2b","red":"#d13c3c","orange":"#f28c28",
  "yellow":"#ffd84d","green":"#2e8b57","teal":"#2aa39a","cyan":"#22b8cf",
  "blue":"#1e90ff","navy":"#001f54","purple":"#8a2be2","violet":"#7f00ff",
  "pink":"#ff6fae","gold":"#d4af37","silver":"#c0c0c0"
};

function toHex(r:number,g:number,b:number){ 
  const h=(n:number)=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,"0"); 
  return `#${h(r)}${h(g)}${h(b)}`;
}

function nameFromHSV(h:number,s:number,v:number){
  if (v < 0.18) return { name:"black", hex:"#000000" };
  if (s < 0.10) return { name: v>0.85 ? "white" : "gray", hex: v>0.85 ? "#ffffff" : "#808080" };
  const d = (x:number,y:number)=>Math.min(Math.abs(x-y), 360-Math.abs(x-y));
  const buckets = [
    ["red",0],["orange",25],["yellow",55],["green",110],["teal",165],
    ["blue",210],["navy",225],["purple",275],["pink",330]
  ] as const;
  let best = buckets[0]; let bestD = 999;
  for (const b of buckets){ const dist = d(h,b[1]); if (dist < bestD){ best=b; bestD=dist; } }
  return { name: best[0], hex: COLOR_WORDS[best[0]] };
}

async function extractDominantColor(b64: string) {
  try {
    // convert base64 → bytes
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const img = await Image.decode(bytes).catch(() => null);
    if (!img) return { name: null, hex: null };

    img.resize(48, 48); // downsample
    let r=0,g=0,b=0,count=0;
    for (let y=0; y<img.height; y++){
      for (let x=0; x<img.width; x++){
        const p = img.getPixelAt(x,y);
        r += (p >> 24) & 0xff; g += (p >> 16) & 0xff; b += (p >> 8) & 0xff;
        count++;
      }
    }
    r/=count; g/=count; b/=count;
    // rgb → hsv
    const rr=r/255, gg=g/255, bb=b/255;
    const cmax = Math.max(rr,gg,bb), cmin = Math.min(rr,gg,bb), delta = cmax - cmin;
    let h = 0;
    if (delta !== 0) {
      if (cmax === rr) h = 60 * (((gg - bb) / delta) % 6);
      else if (cmax === gg) h = 60 * (((bb - rr) / delta) + 2);
      else h = 60 * (((rr - gg) / delta) + 4);
    }
    if (h < 0) h += 360;
    const s = cmax === 0 ? 0 : delta / cmax;
    const v = cmax;
    const coarse = nameFromHSV(h,s,v);
    return { name: coarse.name, hex: toHex(r,g,b) };
  } catch (error) {
    console.warn("Color extraction failed:", error.message);
    return { name: "brown", hex: "#8B5A2B" };
  }
}

// Garment identification vocabulary and mappings
const VOCAB = [
  "t-shirt","shirt","blouse","sweater","hoodie","cardigan",
  "jacket","blazer","coat","dress","skirt","jeans","trousers","pants","shorts",
  "boots","sneakers","trainers","heels","loafers","sandals",
  "handbag","tote bag","shoulder bag","crossbody bag","backpack",
  "belt","hat","cap","beanie","scarf","sunglasses","wallet"
];

const CANON: Record<string,string> = {
  "tee":"t-shirt","tshirt":"t-shirt","t shirt":"t-shirt",
  "trainer":"sneakers","trainers":"sneakers","sneaker":"sneakers",
  "pants":"trousers","denim":"jeans","jean":"jeans",
  "bag":"handbag","purse":"handbag","cap":"hat","baseball cap":"hat"
};

const CAT: Record<string,"top"|"bottom"|"shoes"|"bag"|"accessory"> = {
  "t-shirt":"top","shirt":"top","blouse":"top","sweater":"top","hoodie":"top","cardigan":"top",
  "jacket":"top","blazer":"top","coat":"top","dress":"top",
  "skirt":"bottom","jeans":"bottom","trousers":"bottom","pants":"bottom","shorts":"bottom",
  "boots":"shoes","sneakers":"shoes","heels":"shoes","loafers":"shoes","sandals":"shoes",
  "handbag":"bag","tote bag":"bag","shoulder bag":"bag","crossbody bag":"bag","backpack":"bag","wallet":"bag",
  "belt":"accessory","hat":"accessory","cap":"accessory","beanie":"accessory",
  "scarf":"accessory","sunglasses":"accessory"
};

// Caption fallback chain with multiple models
async function labelFromCaption(b64: string, trace: Array<any>) {
  const CAPTION_URLS_RAW = Deno.env.get("CAPTION_URLS");
  const urls = CAPTION_URLS_RAW 
    ? CAPTION_URLS_RAW.split(",").map(u => u.trim())
    : [
        "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-base",
        "https://api-inference.huggingface.co/models/microsoft/git-base", 
        "https://api-inference.huggingface.co/models/microsoft/git-large-coco",
        "https://api-inference.huggingface.co/models/nlpconnect/vit-gpt2-image-captioning"
      ];
  
  console.log("[CAPTION] Trying", urls.length, "caption models");
  const infHeaders = buildInferenceHeaders();
  
  for (const url of urls) {
    const startTime = Date.now();
    console.log("[CAPTION] Trying:", url);
    
    // Try JSON base64 format first
    try {
      const jsonBody = { inputs: `data:image/png;base64,${b64}` };
      const r = await fetch(url, {
        method: "POST",
        headers: { ...infHeaders, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(jsonBody)
      });
      
      const ms = Date.now() - startTime;
      console.log("[CAPTION] JSON response:", r.status, "in", ms + "ms");
      
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        const raw = Array.isArray(j) ? (j[0]?.generated_text ?? j[0]?.summary_text) : (j.generated_text ?? j.caption ?? "");
        
        trace.push({ step: "CAPTION", url, status: r.status, ms, mode: "json" });
        
        if (raw) {
          console.log("[CAPTION] SUCCESS with JSON:", raw);
          return parseCaption(raw);
        }
      } else if (r.status === 415) {
        // Try raw bytes format
        console.log("[CAPTION] JSON 415, trying raw bytes...");
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        
        const r2 = await fetch(url, {
          method: "POST", 
          headers: { ...infHeaders, "Content-Type": "image/png", Accept: "application/json" },
          body: bytes
        });
        
        const ms2 = Date.now() - startTime;
        console.log("[CAPTION] Bytes response:", r2.status, "in", ms2 + "ms");
        
        if (r2.ok) {
          const j2 = await r2.json().catch(() => ({}));
          const raw2 = Array.isArray(j2) ? (j2[0]?.generated_text ?? j2[0]?.summary_text) : (j2.generated_text ?? j2.caption ?? "");
          
          trace.push({ step: "CAPTION", url, status: r2.status, ms: ms2, mode: "bytes" });
          
          if (raw2) {
            console.log("[CAPTION] SUCCESS with bytes:", raw2);
            return parseCaption(raw2);
          }
        } else {
          trace.push({ step: "CAPTION", url, status: r2.status, ms: ms2, mode: "bytes", error: `HTTP ${r2.status}` });
        }
      } else {
        trace.push({ step: "CAPTION", url, status: r.status, ms, mode: "json", error: `HTTP ${r.status}` });
      }
    } catch (error) {
      const ms = Date.now() - startTime;
      console.warn("[CAPTION] Error with", url + ":", error.message);
      trace.push({ step: "CAPTION", url, status: 0, ms, mode: "json", error: error.message });
    }
  }
  
  console.log("[CAPTION] All models failed");
  return {};
}

// Parse caption text and extract labels
function parseCaption(raw: string) {
  console.log("[CAPTION] Raw caption:", raw);
  const lc = ` ${raw.toLowerCase()} `;
  console.log("[CAPTION] Lowercased with spaces:", lc);

  // exact vocab hit
  for (const v of VOCAB) {
    if (lc.includes(` ${v} `)) {
      console.log("[CAPTION] Found exact vocab match:", v);
      return { sub: v, cat: CAT[v], caption: raw, conf: 0.7 };
    }
  }

  // synonyms → canonical
  const tokens = lc.replace(/[^a-z\s-]/g," ").split(/\s+/).filter(Boolean);
  console.log("[CAPTION] Tokens for synonym matching:", tokens.slice(0, 10));
  for (let i=0;i<tokens.length;i++){
    const w1 = tokens[i];
    const w2 = i+1 < tokens.length ? `${w1} ${tokens[i+1]}` : w1;
    const cand = CANON[w2] || CANON[w1];
    if (cand) {
      console.log("[CAPTION] Found synonym match:", w2 || w1, "->", cand);
      return { sub: cand, cat: CAT[cand], caption: raw, conf: 0.6 };
    }
  }
  console.log("[CAPTION] No matches found, returning caption only");
  return { caption: raw };
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
    console.log("[DEBUG] Function started - checking secrets...");
    console.log("[DEBUG] CAPTION_URL raw:", Deno.env.get("CAPTION_URL"));
    console.log("[DEBUG] INFERENCE_API_TOKEN raw:", Deno.env.get("INFERENCE_API_TOKEN"));
    
    const body = await req.json();
    const { itemId, imagePath, debug } = body;
    console.log("[DEBUG] Received:", { itemId, imagePath, debug });
    
    // Initialize trace for debugging
    const trace: Array<{step: string, status?: number, ms?: number, error?: string}> = [];
    
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
    console.log("[DEBUG] Image downloaded and converted to base64");

    // STEP 1: CAPTION FIRST (every time for closet items)
    console.log(`[CAPTION] Starting caption analysis (first step)...`);
    const captionStart = Date.now();
    const { sub, cat, caption } = await labelFromCaption(base64Image, trace);
    const captionMs = Date.now() - captionStart;
    
    if (caption) {
      console.log(`[CAPTION] SUCCESS: "${caption}" -> subcategory: ${sub || 'none'}, category: ${cat || 'none'} (${captionMs}ms)`);
    } else {
      console.log(`[CAPTION] FAILED: No caption returned (${captionMs}ms)`);
    }
    
    // Color detection: first try caption text, then dominant color analysis
    let colorName: string | null = null;
    let colorHex: string | null = null;
    
    if (caption) {
      const lc = caption.toLowerCase();
      for (const k of Object.keys(COLOR_WORDS)) {
        if (lc.includes(k)) { 
          colorName = (k === "grey" ? "gray" : k); 
          colorHex = COLOR_WORDS[k]; 
          console.log(`[COLOR] Found color word in caption: ${colorName}`);
          break; 
        }
      }
    }
    
    if (!colorName) {
      console.log(`[COLOR] No color word found, analyzing dominant color...`);
      const dom = await extractDominantColor(base64Image);
      colorName = dom.name; 
      colorHex = dom.hex;
      console.log(`[COLOR] Dominant color: ${colorName} (${colorHex})`);
    }

    // STEP 2: DETECT (optional - skipped for closet items)
    const USE_DETECT = (Deno.env.get("ITEMS_USE_DETECT") ?? "0") !== "0";
    let cropBase64ForEmbed = base64Image; // default whole image
    let hadBoxes = false;
    let bbox = null;

    if (USE_DETECT && DETECT_URL) {
      console.log(`[DETECT] Starting detection...`);
      const detectStart = Date.now();
      
      try {
        const detectBody = isHFHosted(DETECT_URL)
          ? { inputs: base64Image }
          : { image: base64Image, format: "base64" };

        const detectRes = await fetch(DETECT_URL, {
          method: "POST",
          headers: { ...infHeaders, Accept: "application/json" },
          body: JSON.stringify(detectBody),
        });
        
        const detectMs = Date.now() - detectStart;
        trace.push({ step: "DETECT", status: detectRes.status, ms: detectMs });
        
        if (detectRes.ok) {
          const detectJson = await detectRes.json().catch(() => ({}));
          const boxes = Array.isArray(detectJson?.boxes) ? detectJson.boxes : [];
          if (boxes.length > 0) {
            hadBoxes = true;
            const best = boxes.sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0))[0];
            bbox = best;
            console.log(`[DETECT] Found ${boxes.length} boxes, using best with score ${best.score ?? 'N/A'}`);
          } else {
            console.warn("[DETECT] 0 boxes — using whole image as crop");
          }
        } else {
          console.warn(`[DETECT] Failed: ${detectRes.status}`);
        }
      } catch (error) {
        const detectMs = Date.now() - detectStart;
        trace.push({ step: "DETECT", status: 0, ms: detectMs, error: error.message });
        console.warn("[DETECT] Exception:", error.message);
      }
    } else {
      console.log("[DETECT] Skipped for items (ITEMS_USE_DETECT=0)");
      trace.push({ step: "DETECT", status: 0, ms: 0, error: "Skipped (ITEMS_USE_DETECT=0)" });
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
      const embedStart = Date.now();
      try {
        const body = isHFHosted(EMBED_URL)
          ? { inputs: cropBase64ForEmbed }
          : { image: cropBase64ForEmbed, format: "base64" };

        const res = await fetch(EMBED_URL, {
          method: "POST",
          headers: { ...infHeaders, Accept: "application/json" },
          body: JSON.stringify(body),
        });

        const embedMs = Date.now() - embedStart;
        trace.push({ step: "EMBED", status: res.status, ms: embedMs });

        if (res.status === 404) {
          console.warn("[EMBED] 404 at", EMBED_URL, "— skipping embedding");
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
        const embedMs = Date.now() - embedStart;
        trace.push({ step: "EMBED", status: 0, ms: embedMs, error: String(e?.message ?? e) });
        console.warn("[EMBED] exception", String(e?.message ?? e));
      }
    } else {
      console.log("[EMBED] Skipped - EMBED_URL not configured");
      trace.push({ step: "EMBED", status: 0, ms: 0, error: "EMBED_URL not configured" });
    }

    // Only update NULL values (respect manual edits)
    const { data: current } = await supabase
      .from("items").select("category, subcategory").eq("id", itemId).single();

    const patch: any = { 
      mask_path: maskPath ?? null, 
      crop_path: cropPath ?? null 
    };
    
    if (!current?.subcategory && sub) patch.subcategory = sub;
    if (!current?.category && cat) patch.category = cat;
    patch.color_name = colorName ?? current?.color_name ?? null;
    patch.color_hex = colorHex ?? current?.color_hex ?? null;

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

    console.log(`[SUCCESS] Pipeline completed - caption: ${!!caption}, embedded: ${!!embedding}`);
    
    // Always return 200 with clear payload (include trace if debug mode)
    const response: any = {
      ok: true,
      embedded: !!embedding,
      label: sub ?? null,
      category: cat ?? null,
      color: colorName ?? null
    };
    
    if (debug) {
      response.trace = trace;
    }
    
    return new Response(JSON.stringify(response), { 
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