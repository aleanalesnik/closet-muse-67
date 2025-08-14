import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

function buildInferenceHeaders() {
  const apiToken = Deno.env.get("INFERENCE_API_TOKEN");
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json"
  };
  
  if (apiToken) {
    headers["Authorization"] = `Bearer ${apiToken}`;
  }
  
  return headers;
}

function buildFashionHeaders() {
  const authHeader = Deno.env.get("FASHION_AUTH_HEADER") || "Authorization";
  const authPrefix = Deno.env.get("FASHION_AUTH_PREFIX") || "Bearer";
  const apiToken = Deno.env.get("FASHION_API_TOKEN");
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json"
  };
  
  if (apiToken) {
    headers[authHeader] = authPrefix ? `${authPrefix} ${apiToken}` : apiToken;
  }
  
  return headers;
}

function uint8ToBase64(u8: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < u8.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return btoa(binary);
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

// YOLOS detection types
type YolosBox = { xmin: number; ymin: number; xmax: number; ymax: number };
type YolosPred = { score: number; label: string; box: YolosBox };

// YOLOS label mapping to our taxonomy
function mapFashionLabel(label: string): { category: string; subcategory: string } {
  const s = label.toLowerCase();
  
  if (["handbag", "bag", "tote bag", "shoulder bag"].some(x => s.includes(x))) 
    return { category: "bag", subcategory: "handbag" };
  if (["backpack"].some(x => s.includes(x))) 
    return { category: "bag", subcategory: "backpack" };
  if (["belt", "buckle", "waistband"].some(x => s.includes(x))) 
    return { category: "accessory", subcategory: "belt" };
  if (["sunglasses", "glasses"].some(x => s.includes(x))) 
    return { category: "accessory", subcategory: "sunglasses" };
  if (["hat", "cap", "beanie"].some(x => s.includes(x))) 
    return { category: "accessory", subcategory: "hat" };
  if (["boots"].some(x => s.includes(x))) 
    return { category: "shoes", subcategory: "boots" };
  if (["sneaker", "shoe", "trainer"].some(x => s.includes(x))) 
    return { category: "shoes", subcategory: "sneakers" };
  if (["dress"].some(x => s.includes(x))) 
    return { category: "dress", subcategory: "dress" };
  if (["skirt"].some(x => s.includes(x))) 
    return { category: "bottom", subcategory: "skirt" };
  if (["jeans", "pants", "trousers"].some(x => s.includes(x))) 
    return { category: "bottom", subcategory: "trousers" };
  if (["shorts"].some(x => s.includes(x))) 
    return { category: "bottom", subcategory: "shorts" };
  if (["shirt", "t-shirt", "tee", "blouse", "polo"].some(x => s.includes(x))) 
    return { category: "top", subcategory: "t-shirt" };
  if (["sweater", "knit", "jumper"].some(x => s.includes(x))) 
    return { category: "top", subcategory: "sweater" };
  if (["jacket", "coat", "outerwear", "blazer"].some(x => s.includes(x))) 
    return { category: "outerwear", subcategory: "jacket" };
    
  return { category: "clothing", subcategory: "item" };
}

// YOLOS helper functions
async function callYolos(base64: string, threshold: number) {
  const url = Deno.env.get("FASHION_SEG_URL")!;
  const token = Deno.env.get("FASHION_API_TOKEN")!;

  const body1 = { inputs: base64, parameters: { threshold } };           // raw base64
  const r1 = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body1),
  });
  if (r1.ok) return { res: await r1.json(), mode: "raw" };

  // some endpoints prefer data URLs; try once more if 4xx/415
  if (r1.status >= 400) {
    const body2 = { inputs: `data:image/png;base64,${base64}`, parameters: { threshold } };
    const r2 = await fetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body2),
    });
    return { res: r2.ok ? await r2.json() : null, mode: "dataurl", status: r2.status };
  }
  return { res: null, mode: "raw", status: r1.status };
}

function parseYolos(out: any) {
  if (!Array.isArray(out)) return [];
  return out.map((o: any) => ({
    label: o.label ?? o.class ?? o.category ?? null,
    score: Number(o.score ?? o.confidence ?? o.prob ?? 0),
    // the model returns {xmin,ymin,xmax,ymax}
    box: o.box ?? o.bbox ?? o.bounding_box ?? null,
  })).filter((p: any) => p.box && p.label !== null);
}

function chooseAndMap(preds: any[], imgW: number, imgH: number, title: string, imagePath: string) {
  if (!preds.length) return null;

  // pick the highest-score candidate
  let best = preds.sort((a,b)=>b.score-a.score)[0];
  const w = best.box.xmax - best.box.xmin;
  const h = best.box.ymax - best.box.ymin;
  const ar = w / Math.max(1, h);
  const relH = h / Math.max(1, imgH);
  const relW = w / Math.max(1, imgW);

  const looksLikeBelt = (ar >= 4.0 && h <= 0.25 * w) || (ar >= 6.0);
  const label = (best.label || "").toLowerCase();
  const hint = (title + " " + imagePath).toLowerCase();

  if (looksLikeBelt || /\bbelt\b/.test(hint) || ["belt","buckle","waistband"].includes(label)) {
    return { category: "accessory", subcategory: "belt", source: "heuristic", base: { label: best.label, score: best.score, box: best.box } };
  }

  // else: normal mapping from YOLOS → our taxonomy (existing function)
  const mapped = mapFashionLabel(best.label);
  return { ...mapped, source: "yolos", base: { label: best.label, score: best.score, box: best.box } };
}

// Pick main detection (highest score, then largest area)
function pickMainDetection(preds: YolosPred[]): YolosPred | null {
  return preds
    .filter(p => p.score >= 0.12) // Lowered from 0.35 to catch small items like belts
    .sort((a, b) => {
      const scoreComp = b.score - a.score;
      if (scoreComp !== 0) return scoreComp;
      
      const areaA = (a.box.xmax - a.box.xmin) * (a.box.ymax - a.box.ymin);
      const areaB = (b.box.xmax - b.box.xmin) * (b.box.ymax - b.box.ymin);
      return areaB - areaA;
    })[0] ?? null;
}

// Caption fallback chain with multiple models
async function tryCaption(base64Image: string): Promise<{ caption: string; url: string; trace: any[] }> {
  const captionUrls = (Deno.env.get("CAPTION_URLS") || 
    "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-base," +
    "https://api-inference.huggingface.co/models/microsoft/git-base," +
    "https://api-inference.huggingface.co/models/microsoft/git-large-coco"
  ).split(",").map(url => url.trim());

  const trace: any[] = [];

  // Check if INFERENCE_API_TOKEN is available
  const apiToken = Deno.env.get("INFERENCE_API_TOKEN");
  if (!apiToken) {
    trace.push({ step: "CAPTION", status: "no_token", error: "INFERENCE_API_TOKEN not configured" });
    return { caption: "clothing item", url: "no-token", trace };
  }

  const headers = buildInferenceHeaders();

  for (const url of captionUrls) {
    const startTime = Date.now();
    let status = 0;
    let mode = "";

    try {
      // Try JSON format first
      mode = "json";
      const jsonBody = { inputs: `data:image/png;base64,${base64Image}` };
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(jsonBody)
      });

      status = response.status;

      if (response.ok) {
        const result = await response.json();
        const caption = Array.isArray(result) && result[0]?.generated_text 
          ? result[0].generated_text 
          : result.generated_text || "clothing item";
        
        trace.push({ step: "CAPTION", url, status, ms: Date.now() - startTime, mode });
        return { caption, url, trace };
      }

      // Skip 404 endpoints - they're not hosted
      if (response.status === 404) {
        trace.push({ step: "CAPTION", url, status: 404, ms: Date.now() - startTime, mode, skipped: "not_hosted" });
        continue;
      }

      // If 415, try raw bytes
      if (response.status === 415) {
        mode = "bytes";
        const bytesResponse = await fetch(url, {
          method: "POST",
          headers: { ...headers, "Content-Type": "image/png" },
          body: Uint8Array.from(atob(base64Image), c => c.charCodeAt(0))
        });

        status = bytesResponse.status;

        if (bytesResponse.ok) {
          const result = await bytesResponse.json();
          const caption = Array.isArray(result) && result[0]?.generated_text 
            ? result[0].generated_text 
            : result.generated_text || "clothing item";
          
          trace.push({ step: "CAPTION", url, status, ms: Date.now() - startTime, mode });
          return { caption, url, trace };
        }
      }

      trace.push({ step: "CAPTION", url, status, ms: Date.now() - startTime, mode });
    } catch (error) {
      trace.push({ step: "CAPTION", url, status: 0, ms: Date.now() - startTime, mode, error: error.message });
    }
  }

  // All failed or skipped - return fallback
  trace.push({ step: "CAPTION", status: "all_failed", error: "No caption endpoints available" });
  return { caption: "clothing item", url: "fallback", trace };
}

// Caption fallback chain with multiple models (kept as safety net)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { itemId, imagePath, debug } = await req.json();
    console.log("items-process called with:", { itemId, imagePath, debug });

    if (!itemId || !imagePath) {
      console.log("Missing required parameters:", { itemId, imagePath });
      return new Response(JSON.stringify({ 
        ok: true, 
        error: "Missing itemId or imagePath",
        trace: [{ step: "VALIDATION", status: 0, error: "Missing required parameters" }]
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    const supabase = getServiceClient();
    const trace: any[] = [];
    
    // Download image from storage
    console.log("Downloading image from storage:", imagePath);
    const { data: downloadData, error: downloadError } = await supabase.storage
      .from('sila')
      .download(imagePath);

    if (downloadError) {
      console.error("Download error:", downloadError);
      return new Response(JSON.stringify({
        ok: true,
        error: `Failed to download image: ${downloadError.message}`,
        trace: [{ step: "DOWNLOAD", status: 0, error: downloadError.message }]
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    const imageBuffer = new Uint8Array(await downloadData.arrayBuffer());
    const base64Image = uint8ToBase64(imageBuffer);
    console.log("Image downloaded and converted to base64, size:", base64Image.length);

    // Initialize processing variables
    let category = null;
    let subcategory = null;
    let colorHex = null;
    let colorName = null;
    let attributes = null;
    let bbox: number[] | null = null;
    
    // Step 1: YOLOS Detection (primary detection source)
    const fUrl = Deno.env.get("FASHION_SEG_URL");
    const fTok = Deno.env.get("FASHION_API_TOKEN");
    const fHdr = Deno.env.get("FASHION_AUTH_HEADER") || "Authorization";
    const fPfx = Deno.env.get("FASHION_AUTH_PREFIX") || "Bearer";
    const fHeaders = fTok ? { 
      [fHdr]: fPfx ? `${fPfx} ${fTok}` : fTok, 
      "Accept": "application/json", 
      "Content-Type": "application/json" 
    } : {};

    let preds: any[] = [];
    if (fUrl) {
      console.log("Step 1: YOLOS detection...");
      const t1Start = Date.now();
      
      try {
        // FIRST PASS: high threshold (matches playground)
        const pass1 = await callYolos(base64Image, 0.12);
        preds = parseYolos(pass1.res);
        const t1 = Date.now() - t1Start;
        trace.push({ step: "FASHION_SEG", status: pass1.status ?? 200, ms: t1, count: preds.length, mode: pass1.mode, threshold: 0.12 });
        
        console.log("YOLOS pass 1 (threshold 0.12) successful, predictions:", preds.length);
        
        // SECOND PASS: only if pass1 returned no boxes
        if (preds.length === 0) {
          console.log("No detections at threshold 0.12, trying 0.06...");
          const t2Start = Date.now();
          const pass2 = await callYolos(base64Image, 0.06);
          const p2 = parseYolos(pass2.res);
          const t2 = Date.now() - t2Start;
          trace.push({ step: "FASHION_SEG", status: pass2.status ?? 200, ms: t2, count: p2.length, mode: pass2.mode, threshold: 0.06 });
          if (p2.length > 0) preds = p2;
        }
        
        // Log raw predictions for debugging (dev only) with box dimensions
        if (debug && preds.length > 0) {
          const top5 = preds
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map(p => ({ 
              label: p.label, 
              score: Math.round(p.score * 1000) / 1000,
              w: Math.round((p.box.xmax - p.box.xmin) * 1000) / 1000,
              h: Math.round((p.box.ymax - p.box.ymin) * 1000) / 1000
            }));
          trace.push({ step: "FASHION_SEG_RAW", top: top5 });
        }
        
        // If still no detections, show payload debug info
        if (debug && preds.length === 0) {
          trace.push({
            step: "FASHION_SEG_PAYLOAD",
            shape: { hasInputs: true, hasImage: false, threshold: 0.12 }
          });
        }
        
      } catch (error) {
        const ms = Date.now() - t1Start;
        console.error("YOLOS detection error:", error);
        trace.push({ step: "FASHION_SEG", status: 0, ms, error: error.message });
      }
    } else {
      console.log("FASHION_SEG_URL not configured");
      trace.push({ step: "FASHION_SEG", status: "not_configured" });
    }

    // Step 2: Map YOLOS detections with geometry heuristics
    let mapped = null;
    if (preds.length > 0) {
      console.log("Step 2: Processing YOLOS detections...");
      
      // Get item title for heuristics
      const { data: itemData } = await supabase
        .from('items')
        .select('title')
        .eq('id', itemId)
        .single();
      
      const title = itemData?.title || '';
      
      // Use image dimensions for geometry calculations (assume square for now)
      const imgW = 512; // Default assumption
      const imgH = 512;
      
      mapped = chooseAndMap(preds, imgW, imgH, title, imagePath);
      
      if (mapped) {
        category = mapped.category;
        subcategory = mapped.subcategory;
        bbox = mapped.base.box ? [mapped.base.box.xmin, mapped.base.box.ymin, mapped.base.box.xmax, mapped.base.box.ymax] : null;
        
        trace.push({ step: "LABEL", source: mapped.source ?? "yolos", base: mapped.base, final: `${mapped.category}/${mapped.subcategory}` });
        
        // Step 3: Compute color from full image
        console.log("Step 3: Computing color...");
        try {
          const colorData = await extractDominantColor(base64Image);
          colorHex = colorData.hex;
          colorName = colorData.name;
          console.log("Color extracted:", colorName, colorHex);
        } catch (colorError) {
          console.warn("Color extraction failed:", colorError.message);
          trace.push({ step: "COLOR", status: 0, error: colorError.message });
        }
      } else {
        console.log("No confident mapping found from YOLOS predictions");
        trace.push({ step: "LABEL", status: 204, error: "no-confident-mapping" });
      }
    } else {
      console.log("No YOLOS detections found");
      trace.push({ step: "LABEL", status: 204, error: "no-detections" });
    }

    // Step 4: Always extract color even if no category detected
    if (!colorHex) {
      console.log("Step 4: Computing color (fallback)...");
      try {
        const colorData = await extractDominantColor(base64Image);
        colorHex = colorData.hex;
        colorName = colorData.name;
        console.log("Color extracted (fallback):", colorName, colorHex);
      } catch (colorError) {
        console.warn("Color extraction failed:", colorError.message);
        colorName = 'brown';
        colorHex = '#8B5A2B';
      }
    }

    // Step 5: Update database (never throw errors) - only if we have confident mapping
    console.log("Step 5: Updating item in database...");
    const updateData: any = {};
    
    // Only update category/subcategory if we have a confident mapping
    if (category && subcategory) {
      updateData.category = category;
      updateData.subcategory = subcategory;
    }
    if (colorHex) updateData.color_hex = colorHex;
    if (colorName) updateData.color_name = colorName;
    if (attributes) updateData.attributes = attributes;
    if (bbox) updateData.bbox = bbox;
    // Leave mask_path and crop_path null (YOLOS doesn't provide masks)

    try {
      const { error: updateError } = await supabase
        .from('items')
        .update(updateData)
        .eq('id', itemId);

      if (updateError) {
        console.error("Database update failed:", updateError.message);
        trace.push({ step: "DB_UPDATE", status: 0, error: updateError.message });
      } else {
        console.log("Database update successful");
        trace.push({ step: "DB_UPDATE", status: 200 });
      }
    } catch (dbError) {
      console.error("Database update exception:", dbError);
      trace.push({ step: "DB_UPDATE", status: 0, error: dbError.message });
    }

    // Step 6: Optional embeddings (never block on failure)
    const EMBED_URL = Deno.env.get("EMBED_URL");
    const INFERENCE_API_TOKEN = Deno.env.get("INFERENCE_API_TOKEN");
    let embedded = false;

    if (EMBED_URL && INFERENCE_API_TOKEN) {
      console.log("Step 6: Computing embeddings...");
      try {
        const embedHeaders = buildInferenceHeaders();
        const embedStartTime = Date.now();
        
        const embedResponse = await fetch(EMBED_URL, {
          method: "POST",
          headers: embedHeaders,
          body: JSON.stringify({ inputs: base64Image })
        });

        const embedStatus = embedResponse.status;
        const embedMs = Date.now() - embedStartTime;

        if (embedResponse.ok) {
          const embedResult = await embedResponse.json();
          let embedding = embedResult;
          
          if (Array.isArray(embedding) && embedding.length > 0) {
            embedding = embedding[0];
          }
          
          if (Array.isArray(embedding)) {
            try {
              const { error: embedError } = await supabase
                .from('item_embeddings')
                .upsert({ item_id: itemId, embedding }, { onConflict: 'item_id' });
              
              if (!embedError) {
                embedded = true;
                console.log("Embedding stored successfully");
              } else {
                console.warn("Embedding storage failed:", embedError.message);
              }
            } catch (embedDbError) {
              console.warn("Embedding DB error:", embedDbError.message);
            }
          }
        } else {
          console.warn("Embedding request failed:", embedStatus);
        }

        trace.push({ step: "EMBED", status: embedStatus, ms: embedMs });
      } catch (embedError) {
        const ms = Date.now() - embedStartTime;
        console.log("Embedding failed:", embedError.message);
        trace.push({ step: "EMBED", status: 0, ms, error: embedError.message });
      }
    } else {
      const reason = !EMBED_URL ? "EMBED_URL not configured" : "INFERENCE_API_TOKEN not configured";
      console.log("Step 6: Skipping embeddings -", reason);
      trace.push({ step: "EMBED", status: "not_configured", reason });
    }

    console.log("Item processing completed successfully");
    
    // Always return success with trace (never throw)
    const response = {
      ok: true,
      itemId,
      category,
      subcategory,
      colorHex,
      colorName,
      attributes,
      embedded,
      bbox,
      ...(debug && { trace })
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error("Unexpected error in items-process:", error);
    
    // Always return success even on unexpected errors
    return new Response(JSON.stringify({
      ok: true,
      itemId: itemId || "unknown",
      error: error.message,
      trace: [{
        step: "UNEXPECTED_ERROR",
        status: 0,
        error: error.message
      }]
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });
  }
});