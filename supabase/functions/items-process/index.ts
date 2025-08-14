import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

function buildInferenceHeaders() {
  const authHeader = Deno.env.get("INFERENCE_AUTH_HEADER") || "Authorization";
  const authPrefix = Deno.env.get("INFERENCE_AUTH_PREFIX") || "Bearer";
  const apiToken = Deno.env.get("INFERENCE_API_TOKEN");
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json"
  };
  
  if (apiToken) {
    headers[authHeader] = authPrefix ? `${authPrefix} ${apiToken}` : apiToken;
  }
  
  return headers;
}

function buildFashionHeaders() {
  const authHeader = Deno.env.get("FASHION_AUTH_HEADER") || "x-api-key";
  const authPrefix = Deno.env.get("FASHION_AUTH_PREFIX") || "";
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

// Taxonomy mapping functions
function mapFashionCategory(detectedCategory: string): { category: string; subcategory: string } {
  const categoryMap: Record<string, { category: string; subcategory: string }> = {
    // Fashionpedia/ModaNet mappings
    'top': { category: 'top', subcategory: 't-shirt' },
    'shirt': { category: 'top', subcategory: 'shirt' },
    'blouse': { category: 'top', subcategory: 'blouse' },
    'sweater': { category: 'top', subcategory: 'sweater' },
    'dress': { category: 'dress', subcategory: 'dress' },
    'skirt': { category: 'bottom', subcategory: 'skirt' },
    'pants': { category: 'bottom', subcategory: 'trousers' },
    'trousers': { category: 'bottom', subcategory: 'trousers' },
    'shorts': { category: 'bottom', subcategory: 'shorts' },
    'jeans': { category: 'bottom', subcategory: 'jeans' },
    'boots': { category: 'shoes', subcategory: 'boots' },
    'sneakers': { category: 'shoes', subcategory: 'sneakers' },
    'footwear': { category: 'shoes', subcategory: 'shoes' },
    'bag': { category: 'bag', subcategory: 'handbag' },
    'handbag': { category: 'bag', subcategory: 'handbag' },
    'backpack': { category: 'bag', subcategory: 'backpack' },
    'belt': { category: 'accessory', subcategory: 'belt' },
    'sunglasses': { category: 'accessory', subcategory: 'sunglasses' },
    'hat': { category: 'accessory', subcategory: 'hat' },
    'headwear': { category: 'accessory', subcategory: 'hat' },
    'scarf': { category: 'accessory', subcategory: 'scarf' },
    'coat': { category: 'outerwear', subcategory: 'coat' },
    'jacket': { category: 'outerwear', subcategory: 'jacket' }
  };

  const detected = detectedCategory.toLowerCase();
  return categoryMap[detected] || { category: 'top', subcategory: 't-shirt' };
}

// Caption fallback chain with multiple models
async function tryCaption(base64Image: string): Promise<{ caption: string; url: string; trace: any[] }> {
  const captionUrls = (Deno.env.get("CAPTION_URLS") || 
    "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-base," +
    "https://api-inference.huggingface.co/models/microsoft/git-base," +
    "https://api-inference.huggingface.co/models/microsoft/git-large-coco"
  ).split(",").map(url => url.trim());

  const headers = buildInferenceHeaders();
  const trace: any[] = [];

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

  // All failed
  return { caption: "clothing item", url: "fallback", trace };
}

// Fashion segmentation function
async function tryFashionSegmentation(base64Image: string): Promise<{
  success: boolean;
  detection?: any;
  trace: any[];
  crop?: string;
  mask?: string;
}> {
  const FSEG_URL = Deno.env.get("FASHION_SEG_URL");
  if (!FSEG_URL) {
    return { success: false, trace: [{ step: "FASHION_SEG", status: "not_configured" }] };
  }

  const headers = buildFashionHeaders();
  const trace: any[] = [];
  const startTime = Date.now();

  try {
    const body = { inputs: base64Image, format: "base64" };
    const response = await fetch(FSEG_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });

    const status = response.status;
    const ms = Date.now() - startTime;

    if (response.ok) {
      const result = await response.json();
      
      // Handle different response formats
      let detections = Array.isArray(result) ? result : [result];
      if (result.predictions) detections = result.predictions;
      if (result.detections) detections = result.detections;

      // Pick the largest/most confident detection
      const bestDetection = detections.length > 0 ? detections[0] : null;

      trace.push({ step: "FASHION_SEG", url: FSEG_URL, status, ms, mode: "json", detections: detections.length });

      if (bestDetection) {
        return {
          success: true,
          detection: bestDetection,
          trace,
          crop: bestDetection.crop_b64,
          mask: bestDetection.mask_b64
        };
      }
    }

    trace.push({ step: "FASHION_SEG", url: FSEG_URL, status, ms, mode: "json" });
    return { success: false, trace };
  } catch (error) {
    trace.push({ step: "FASHION_SEG", url: FSEG_URL, status: 0, ms: Date.now() - startTime, error: error.message });
    return { success: false, trace };
  }
}

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
      return new Response(JSON.stringify({ 
        ok: false, 
        error: "Missing itemId or imagePath" 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
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
        ok: false,
        error: `Failed to download image: ${downloadError.message}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

    const imageBuffer = new Uint8Array(await downloadData.arrayBuffer());
    const base64Image = uint8ToBase64(imageBuffer);
    console.log("Image downloaded and converted to base64, size:", base64Image.length);

    // Initialize variables
    let category = null;
    let subcategory = null;
    let colorHex = null;
    let colorName = null;
    let attributes = null;
    let cropPath = null;
    let maskPath = null;

    // Check if we should use fashion segmentation
    const SEGMENT_FOR_ITEMS = (Deno.env.get("SEGMENT_FOR_ITEMS") ?? "0") !== "0";
    
    if (SEGMENT_FOR_ITEMS) {
      console.log("Attempting fashion segmentation...");
      const segResult = await tryFashionSegmentation(base64Image);
      trace.push(...segResult.trace);

      if (segResult.success && segResult.detection) {
        console.log("Fashion segmentation successful");
        const detection = segResult.detection;
        
        // Map category
        const categoryMap = mapFashionCategory(detection.category || detection.label || "top");
        category = categoryMap.category;
        subcategory = categoryMap.subcategory;
        
        // Store attributes if available
        if (detection.attributes) {
          attributes = detection.attributes;
        }

        // Extract color from crop if available
        const cropImageB64 = segResult.crop || base64Image;
        const colorData = await extractDominantColor(cropImageB64);
        colorHex = colorData.hex;
        colorName = colorData.name;

        // Save crop and mask if available
        if (segResult.crop) {
          const cropBuffer = Uint8Array.from(atob(segResult.crop), c => c.charCodeAt(0));
          const userId = imagePath.split('/')[0]; // Extract user ID from path
          cropPath = `${userId}/crops/${itemId}.png`;
          
          await supabase.storage
            .from('sila')
            .upload(cropPath, cropBuffer, { contentType: 'image/png', upsert: true });
        }

        if (segResult.mask) {
          const maskBuffer = Uint8Array.from(atob(segResult.mask), c => c.charCodeAt(0));
          const userId = imagePath.split('/')[0];
          maskPath = `${userId}/masks/${itemId}.png`;
          
          await supabase.storage
            .from('sila')
            .upload(maskPath, maskBuffer, { contentType: 'image/png', upsert: true });
        }
      }
    }

    // Fallback to caption if no fashion segmentation or if it failed
    if (!category) {
      console.log("Using caption fallback...");
      const captionResult = await tryCaption(base64Image);
      trace.push(...captionResult.trace);

      // Extract color from full image
      const colorData = await extractDominantColor(base64Image);
      colorHex = colorData.hex;
      colorName = colorData.name;

      // Basic category assignment from caption
      const caption = captionResult.caption.toLowerCase();
      if (caption.includes('dress')) {
        category = 'dress';
        subcategory = 'dress';
      } else if (caption.includes('shirt') || caption.includes('top')) {
        category = 'top';
        subcategory = 'shirt';
      } else if (caption.includes('pants') || caption.includes('trousers')) {
        category = 'bottom';
        subcategory = 'trousers';
      } else if (caption.includes('bag')) {
        category = 'bag';
        subcategory = 'handbag';
      } else {
        category = 'top';
        subcategory = 't-shirt';
      }
    }

    // Update item in database - only update null fields unless we have high confidence data
    console.log("Updating item in database...");
    const updateData: any = {};
    
    if (category) updateData.category = category;
    if (subcategory) updateData.subcategory = subcategory;
    if (colorHex) updateData.color_hex = colorHex;
    if (colorName) updateData.color_name = colorName;
    if (attributes) updateData.attributes = attributes;
    if (cropPath) updateData.crop_path = cropPath;
    if (maskPath) updateData.mask_path = maskPath;

    const { error: updateError } = await supabase
      .from('items')
      .update(updateData)
      .eq('id', itemId);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(JSON.stringify({
        ok: false,
        error: `Failed to update item: ${updateError.message}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

    // Try embeddings (optional)
    const EMBED_URL = Deno.env.get("EMBED_URL");
    let embedded = false;

    if (EMBED_URL) {
      try {
        const embedHeaders = buildInferenceHeaders();
        const embedStartTime = Date.now();
        
        const embedImageB64 = cropPath ? (segResult?.crop || base64Image) : base64Image;
        const embedResponse = await fetch(EMBED_URL, {
          method: "POST",
          headers: embedHeaders,
          body: JSON.stringify({ inputs: embedImageB64 })
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
            // Insert embedding
            const { error: embedError } = await supabase
              .from('item_embeddings')
              .upsert({ item_id: itemId, embedding }, { onConflict: 'item_id' });
            
            if (!embedError) {
              embedded = true;
            }
          }
        }

        trace.push({ step: "EMBED", url: EMBED_URL, status: embedStatus, ms: embedMs });
      } catch (embedError) {
        trace.push({ step: "EMBED", url: EMBED_URL, status: 0, error: embedError.message });
      }
    }

    console.log("Item processing completed successfully");
    
    const response = {
      ok: true,
      itemId,
      category,
      subcategory,
      colorHex,
      colorName,
      attributes,
      embedded,
      ...(debug && { trace })
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error("Unexpected error in items-process:", error);
    return new Response(JSON.stringify({
      ok: false,
      error: error.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});