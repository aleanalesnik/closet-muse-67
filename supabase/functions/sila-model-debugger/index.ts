// supabase/functions/sila-model-debugger/index.ts
// YOLOS (bbox) + CLIP (category) + optional Grounding-DINO fallback

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

function toNormBox(b: any): [number,number,number,number] | null {
  // Accept array or object; return normalized [x1,y1,x2,y2] or null.
  if (!b) return null;
  const arr = Array.isArray(b) ? b : [b.xmin, b.ymin, b.xmax, b.ymax];
  if (!arr || arr.length !== 4) return null;
  let [x1, y1, x2, y2] = arr.map(Number);
  if (![x1,y1,x2,y2].every(Number.isFinite)) return null;

  // Guard against degenerate boxes
  if (x1 === 1 && y1 === 1 && x2 === 1 && y2 === 1) return null;

  const clamp = (v:number) => Math.min(1, Math.max(0, v));
  x1 = clamp(Math.min(x1, x2));
  y1 = clamp(Math.min(y1, y2));
  x2 = clamp(Math.max(x1, x2));
  y2 = clamp(Math.max(y1, y2));

  const w = x2 - x1, h = y2 - y1;
  if (w <= 0.01 || h <= 0.01) return null; // ignore tiny boxes
  return [x1, y1, x2, y2];
}

function pickPrimaryGarment(preds: HFPred[], minScore: number): HFPred | null {
  const garmentPreds = preds.filter(p => p && p.score >= minScore && isBox(p.box) && mapLabelToCategory(p.label) !== null);
  if (!garmentPreds.length) return null;
  
  // Sort by confidence first, then by area for tie-breaking
  garmentPreds.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) return scoreDiff;
    
    const areaA = (a.box.xmax - a.box.xmin) * (a.box.ymax - a.box.ymin);
    const areaB = (b.box.xmax - b.box.xmin) * (b.box.ymax - b.box.ymin);
    return areaB - areaA;
  });
  
  return garmentPreds[0];
}

async function callCLIP(dataUrl: string): Promise<string> {
  const labels = ["Tops","Bottoms","Outerwear","Dress","Bags","Shoes","Accessories"];
  
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
  });

  if (!response.ok) {
    throw new Error(`CLIP error ${response.status}: ${await response.text().catch(() => "<no body>")}`);
  }

  const result = await response.json();
  
  // CLIP returns {labels: [...], scores: [...]} where first item is highest confidence
  if (result.labels && result.labels.length > 0) {
    return result.labels[0];
  }
  
  return "Clothing"; // fallback
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
    
    // Find highest scoring box
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

async function urlToDataUrl(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch image failed: ${r.status} ${r.statusText}`);
  const mime = r.headers.get("content-type")?.split(";")[0] ?? "image/png";
  const buf  = new Uint8Array(await r.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buf.byteLength; i++) binary += String.fromCharCode(buf[i]);
  return `data:${mime};base64,${btoa(binary)}`;
}

async function callHF(dataUrl: string, threshold: number): Promise<HFPred[]> {
  const body: HFPayload = { inputs: dataUrl, parameters: { threshold } };
  const hfRes = await fetch(HF_ENDPOINT_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!hfRes.ok) {
    throw new Error(`HF error ${hfRes.status}: ${await hfRes.text().catch(() => "<no body>")}`);
  }
  // Expected: array of { score, label, box: {xmin,ymin,xmax,ymax} }
  return await hfRes.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const t0 = performance.now();
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ status: "fail", error: "Method not allowed" }), {
        status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const body = (await req.json()) as ReqBody;
    let dataUrl: string;
    if (body.imageUrl) {
      dataUrl = await urlToDataUrl(body.imageUrl);
    } else if (body.base64Image?.startsWith("data:")) {
      dataUrl = body.base64Image;
    } else {
      return new Response(JSON.stringify({ status: "fail", error: "No imageUrl or base64Image provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const t = typeof body.threshold === "number" ? body.threshold : 0.12;

    // 1. YOLOS for bbox detection
    let preds = await callHF(dataUrl, t);
    
    // Lower threshold for small items that are often missed
    const smallItemLabels = new Set(["shoe","bag, wallet","belt","glasses","hat"]);
    const hasSmallItems = preds.some(p => smallItemLabels.has(p.label));
    let primary = pickPrimaryGarment(preds, t);
    
    if (!primary && hasSmallItems) {
      const t2 = Math.max(0.06, t * 0.5);
      const preds2 = await callHF(dataUrl, t2);
      if (preds2?.length) preds = preds2;
      primary = pickPrimaryGarment(preds, t2);
    }

    // 2. CLIP for category classification
    let category: string;
    try {
      category = await callCLIP(dataUrl);
      console.log(`[CLIP] Category: ${category}`);
    } catch (err) {
      console.log(`[CLIP] Failed: ${err}, using fallback`);
      category = primary ? (mapLabelToCategory(primary.label) ?? "Clothing") : "Clothing";
    }

    // 3. Get bbox from YOLOS
    let bbox = primary && isBox(primary.box) ? toNormBox(primary.box) : null;
    
    // 4. Grounding-DINO fallback for specific categories when no bbox
    if (!bbox && ["Bags", "Shoes", "Accessories"].includes(category)) {
      console.log(`[GDINO] Trying fallback for ${category}`);
      const fallbackBox = await callGroundingDINO(dataUrl, category);
      if (fallbackBox) {
        bbox = toNormBox(fallbackBox);
        console.log(`[GDINO] Found bbox: ${JSON.stringify(bbox)}`);
      }
    }

    // Trim detections for debug overlay (avoid huge payloads)
    console.log('[DEBUG] Raw preds before sanitization:', preds.length, 'detections');
    const sanitized = [...preds]
      .sort((a,b) => b.score - a.score)
      .slice(0, 8)
      .map((p, i) => {
        const box = toNormBox(p.box);
        console.log(`[DEBUG] Detection ${i}: label="${p.label}", score=${p.score}, box=${JSON.stringify(p.box)} -> ${box ? JSON.stringify(box) : 'FILTERED OUT'}`);
        return {
          score: Math.round(p.score * 1000) / 1000,
          label: p.label,
          box
        };
      });
    
    const trimmed = sanitized.filter(p => p.box !== null);
    console.log('[DEBUG] After sanitization:', sanitized.length, 'processed,', trimmed.length, 'kept');

    const latencyMs = Math.round(performance.now() - t0);
    return new Response(JSON.stringify({
      status: "success",
      category,
      bbox,
      proposedTitle: category,
      colorName: null,
      colorHex: null,
      yolosTopLabels: trimmed.slice(0,3).map(d => d.label),
      result: trimmed,
      latencyMs,
      model: "valentinafeve/yolos-fashionpedia"
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const latencyMs = Math.round(performance.now() - t0);
    return new Response(JSON.stringify({ status: "fail", stop: "exception", latencyMs, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});