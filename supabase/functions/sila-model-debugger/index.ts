// supabase/functions/sila-model-debugger/index.ts
// YOLOS (bbox) + CLIP (category) + optional Grounding-DINO fallback

// --- Hard-coded Build Tag ---
const BUILD = "sila-debugger-2025-08-17c";  // <-- update & redeploy when needed

// --- Simple CORS helper ---
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// --- JSON helper with headers ---
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "x-build": BUILD,
      ...corsHeaders,
    },
  });
}

type HFBox = { xmin: number; ymin: number; xmax: number; ymax: number };
type HFPred = { score: number; label: string; box: HFBox };
type HFPayload = { inputs: string; parameters?: { threshold?: number } };

type ReqBody = {
  imageUrl?: string;  // public URL of the image
  base64Image?: string;
  threshold?: number; // optional first-pass threshold (default 0.12)
};

const HF_ENDPOINT_URL = Deno.env.get("HF_ENDPOINT_URL") ?? "";
const HF_TOKEN = Deno.env.get("HF_TOKEN") ?? "";
const HF_CLIP_MODEL = Deno.env.get("HF_CLIP_MODEL") ?? "openai/clip-vit-large-patch14";
const HF_GDINO_MODEL = Deno.env.get("HF_GDINO_MODEL") ?? "IDEA-Research/grounding-dino-tiny";

function isBox(b?: any): b is HFBox {
  return b && Number.isFinite(b.xmin) && Number.isFinite(b.ymin) && Number.isFinite(b.xmax) && Number.isFinite(b.ymax);
}

// Labels coming from Fashionpedia
const PART_LABELS = new Set([
  "hood","collar","lapel","epaulette","sleeve","pocket","neckline","buckle","zipper",
  "applique","bead","bow","flower","fringe","ribbon","rivet","ruffle","sequin","tassel"
]);

function mapLabelToCategory(label: string): string | null {
  const L = label.toLowerCase();

  if (PART_LABELS.has(L)) return null;

  if (L.includes("dress") || L.includes("jumpsuit")) return "Dress";
  if (L.includes("skirt") || L.includes("pants") || L.includes("shorts")) return "Bottoms";

  if (
    L.includes("shirt, blouse") || L.includes("top, t-shirt, sweatshirt") ||
    L.includes("sweater") || L.includes("cardigan") || L.includes("vest")
  ) return "Tops";

  if (L.includes("jacket") || L.includes("coat") || L.includes("cape")) return "Outerwear";
  if (L.includes("shoe")) return "Shoes";
  if (L.includes("bag, wallet")) return "Bags";

  if (
    L.includes("belt") || L.includes("glove") || L.includes("scarf") || L.includes("umbrella") ||
    L.includes("glasses") || L.includes("hat") || L.includes("tie") ||
    L.includes("leg warmer") || L.includes("tights, stockings") || L.includes("sock")
  ) return "Accessory";

  return "Clothing";
}

function toNormBox(b: any, imgW?: number, imgH?: number): [number,number,number,number] | null {
  if (!b) return null;
  const arr = Array.isArray(b) ? b : [b.xmin, b.ymin, b.xmax, b.ymax];
  if (!arr || arr.length !== 4) return null;
  let [x1, y1, x2, y2] = arr.map(Number);
  if (![x1,y1,x2,y2].every(Number.isFinite)) return null;

  const pixelVals = Math.max(x1, x2, y1, y2) > 1;
  if (pixelVals) {
    if (!imgW || !imgH) return null;
    x1 /= imgW; x2 /= imgW; y1 /= imgH; y2 /= imgH;
  }

  if (x1 === 1 && y1 === 1 && x2 === 1 && y2 === 1) return null;

  const clamp = (v:number) => Math.min(1, Math.max(0, v));
  const nx1 = clamp(Math.min(x1, x2));
  const ny1 = clamp(Math.min(y1, y2));
  const nx2 = clamp(Math.max(x1, x2));
  const ny2 = clamp(Math.max(y1, y2));

  const w = nx2 - nx1, h = ny2 - ny1;
  if (w <= 0.01 || h <= 0.01) return null;
  // Return [x, y, width, height] format expected by SmartCropImg
  return [nx1, ny1, w, h];
}

function pickPrimaryGarment(preds: HFPred[], minScore: number): HFPred | null {
  const garmentPreds = preds.filter(p => p && p.score >= minScore && isBox(p.box) && mapLabelToCategory(p.label) !== null);
  if (!garmentPreds.length) return null;

  garmentPreds.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) return scoreDiff;

    const areaA = (a.box.xmax - a.box.xmin) * (a.box.ymax - a.box.ymin);
    const areaB = (b.box.xmax - b.box.xmin) * (b.box.ymax - b.box.ymin);
    return areaB - areaA;
  });

  return garmentPreds[0];
}

async function callCLIP(dataUrl: string, retryCount = 0): Promise<string> {
  const labels = ["Tops","Bottoms","Outerwear","Dress","Bags","Shoes","Accessories"];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
    
    const response = await fetch(`https://api-inference.huggingface.co/models/${HF_CLIP_MODEL}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: dataUrl,
        parameters: {
          candidate_labels: labels,
          multi_label: false
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "<no body>");
      
      // Retry on temporary failures
      if ((response.status === 503 || response.status === 502 || response.status === 504) && retryCount < 2) {
        console.log(`[CLIP] Retrying after ${response.status} error (attempt ${retryCount + 1}/3)`);
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        return callCLIP(dataUrl, retryCount + 1);
      }
      
      throw new Error(`CLIP error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    if (result.labels && result.labels.length > 0) {
      return result.labels[0];
    }
    return "Clothing";
  } catch (err) {
    if (retryCount < 2 && (err.name === 'AbortError' || err.message.includes('fetch failed'))) {
      const reason = err.name === 'AbortError' ? 'timeout' : 'network error';
      console.log(`[CLIP] ${reason}, retrying (attempt ${retryCount + 1}/3)`);
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      return callCLIP(dataUrl, retryCount + 1);
    }
    throw err;
  }
}

async function callGroundingDINO(dataUrl: string, category: string): Promise<[number,number,number,number] | null> {
  const prompts = {
    "Bags": ["handbag","tote bag","shoulder bag","crossbody bag","bag","wallet"],
    "Shoes": ["shoe","sneaker","boot","heel","flat","sandal"],
    "Accessories": ["belt","sunglasses","glasses","hat","watch","tie","scarf"]
  };

  const labels = prompts[category as keyof typeof prompts];
  if (!labels) return null;

  const text = labels.join(" . ");
  try {
    const response = await fetch(`https://api-inference.huggingface.co/models/${HF_GDINO_MODEL}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image: dataUrl,
        text: text,
        box_threshold: 0.25,
        text_threshold: 0.25
      }),
    });

    if (!response.ok) {
      console.log(`[GDINO] Failed: ${response.status}`);
      return null;
    }

    const result = await response.json();
    if (result && Array.isArray(result) && result.length > 0) {
      const boxes = result.filter(r => r.box && r.score);
      if (boxes.length > 0) {
        boxes.sort((a, b) => b.score - a.score);
        const box = boxes[0].box;
        return [box.xmin, box.ymin, box.xmax, box.ymax];
      }
    }
  } catch (err) {
    console.log(`[GDINO] Exception: ${err}`);
  }

  return null;
}

function getImageDims(buf: Uint8Array): { width: number; height: number } | null {
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) break;
      const marker = buf[offset + 1];
      const size = (buf[offset + 2] << 8) + buf[offset + 3];
      if (marker === 0xc0 || marker === 0xc2) {
        const height = (buf[offset + 5] << 8) + buf[offset + 6];
        const width = (buf[offset + 7] << 8) + buf[offset + 8];
        return { width, height };
      }
      offset += 2 + size;
    }
  }
  return null;
}

function dataUrlInfo(dataUrl: string): { dataUrl: string; width: number; height: number } {
  const [, b64] = dataUrl.split(",", 2);
  const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const dims = getImageDims(buf) ?? { width: 1, height: 1 };
  return { dataUrl, width: dims.width, height: dims.height };
}

async function urlToDataUrl(url: string): Promise<{ dataUrl: string; width: number; height: number }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch image failed: ${r.status} ${r.statusText}`);
  const mime = r.headers.get("content-type")?.split(";")[0] ?? "image/png";
  const buf  = new Uint8Array(await r.arrayBuffer());
  const dims = getImageDims(buf) ?? { width: 1, height: 1 };
  let binary = "";
  for (let i = 0; i < buf.byteLength; i++) binary += String.fromCharCode(buf[i]);
  return { dataUrl: `data:${mime};base64,${btoa(binary)}`, width: dims.width, height: dims.height };
}

async function callHF(dataUrl: string, threshold: number, retryCount = 0): Promise<HFPred[]> {
  const body: HFPayload = { inputs: dataUrl, parameters: { threshold } };
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout for YOLOS
    
    const hfRes = await fetch(HF_ENDPOINT_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!hfRes.ok) {
      const errorText = await hfRes.text().catch(() => "<no body>");
      
      // Retry on temporary failures (503, 502, 504) up to 2 times
      if ((hfRes.status === 503 || hfRes.status === 502 || hfRes.status === 504) && retryCount < 2) {
        console.log(`[HF] Retrying after ${hfRes.status} error (attempt ${retryCount + 1}/3)`);
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000)); // 1s, 2s backoff
        return callHF(dataUrl, threshold, retryCount + 1);
      }
      
      throw new Error(`HF error ${hfRes.status}: ${errorText}`);
    }
    
    return await hfRes.json();
  } catch (err) {
    if (retryCount < 2 && (err.name === 'AbortError' || err.message.includes('fetch failed'))) {
      const reason = err.name === 'AbortError' ? 'timeout' : 'network error';
      console.log(`[HF] ${reason}, retrying (attempt ${retryCount + 1}/3)`);
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      return callHF(dataUrl, threshold, retryCount + 1);
    }
    throw err;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ status: "ok" });

  const t0 = performance.now();
  try {
    if (req.method !== "POST") {
      return json({ status: "fail", error: "Method not allowed", build: BUILD }, 405);
    }

    const body = (await req.json()) as ReqBody;
    let img: { dataUrl: string; width: number; height: number };
    if (body.imageUrl) {
      img = await urlToDataUrl(body.imageUrl);
    } else if (body.base64Image?.startsWith("data:")) {
      img = dataUrlInfo(body.base64Image);
    } else {
      return json({ status: "fail", error: "No imageUrl or base64Image provided", build: BUILD }, 400);
    }
    const { dataUrl, width: imgW, height: imgH } = img;

    const t = typeof body.threshold === "number" ? body.threshold : 0.12;

    // Run YOLOS and CLIP in parallel since they're independent
    const [predsResult, categoryResult] = await Promise.allSettled([
      callHF(dataUrl, t),
      callCLIP(dataUrl)
    ]);

    // Handle YOLOS results
    let preds: HFPred[] = [];
    if (predsResult.status === "fulfilled") {
      preds = predsResult.value;
    } else {
      console.log(`[YOLOS] Failed: ${predsResult.reason}`);
      throw new Error(`YOLOS detection failed: ${predsResult.reason}`);
    }

    // Check for small items and retry with lower threshold if needed
    const smallItemLabels = new Set(["shoe","bag, wallet","belt","glasses","hat"]);
    const hasSmallItems = preds.some(p => smallItemLabels.has(p.label));
    let primary = pickPrimaryGarment(preds, t);

    if (!primary && hasSmallItems) {
      console.log(`[YOLOS] Retrying with lower threshold for small items`);
      const t2 = Math.max(0.06, t * 0.5);
      const preds2 = await callHF(dataUrl, t2);
      if (preds2?.length) preds = preds2;
      primary = pickPrimaryGarment(preds, t2);
    }

    // Handle CLIP results
    let category: string;
    if (categoryResult.status === "fulfilled") {
      category = categoryResult.value;
    } else {
      console.log(`[CLIP] Failed, using fallback: ${categoryResult.reason}`);
      category = primary ? (mapLabelToCategory(primary.label) ?? "Clothing") : "Clothing";
    }

    let bbox = primary && isBox(primary.box) ? toNormBox(primary.box, imgW, imgH) : null;

    if (!bbox && ["Bags", "Shoes", "Accessories"].includes(category)) {
      const fallbackBox = await callGroundingDINO(dataUrl, category);
      if (fallbackBox) bbox = toNormBox(fallbackBox, imgW, imgH);
    }

    const sanitized = [...preds]
      .sort((a,b) => b.score - a.score)
      .slice(0, 8)
      .map((p) => ({
        score: Math.round(p.score * 1000) / 1000,
        label: p.label,
        box: toNormBox(p.box, imgW, imgH)
      }));

    const trimmed = sanitized.filter(p => p.box !== null);

    const latencyMs = Math.round(performance.now() - t0);
    return json({
      status: "success",
      build: BUILD,
      category,
      bbox,
      proposedTitle: category,
      colorName: null,
      colorHex: null,
      yolosTopLabels: sanitized.slice(0,3).map(d => d.label),
      result: trimmed,
      latencyMs,
      model: "valentinafeve/yolos-fashionpedia"
    });

  } catch (err) {
    const latencyMs = Math.round(performance.now() - t0);
    const errorMessage = String(err);
    
    // Provide user-friendly error messages for common issues
    if (errorMessage.includes('503 Service Unavailable')) {
      return json({ 
        status: "fail", 
        stop: "service_unavailable", 
        latencyMs, 
        error: "AI service is temporarily unavailable. Please try again in a moment.",
        technicalError: errorMessage,
        build: BUILD 
      }, 503);
    }
    
    if (errorMessage.includes('HF error 50')) {
      return json({ 
        status: "fail", 
        stop: "service_error", 
        latencyMs, 
        error: "AI service is experiencing issues. Please try again later.",
        technicalError: errorMessage,
        build: BUILD 
      }, 503);
    }
    
    return json({ 
      status: "fail", 
      stop: "exception", 
      latencyMs, 
      error: "An unexpected error occurred while processing your image. Please try again.",
      technicalError: errorMessage,
      build: BUILD 
    }, 500);
  }
});
