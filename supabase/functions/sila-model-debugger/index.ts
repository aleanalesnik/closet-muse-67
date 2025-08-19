// supabase/functions/sila-model-debugger/index.ts
// YOLOS (bbox) + CLIP (coarse family tie-breaker) + optional Grounding-DINO fallback
// Returns normalized boxes in [x, y, w, h] (0..1)

const BUILD = "sila-debugger-2025-08-18f"; // update when redeploying

// --- CORS ---
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// --- JSON helper ---
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

// --- Types ---
type HFBox = { xmin: number; ymin: number; xmax: number; ymax: number };
type HFPred = { score: number; label: string; box: HFBox };
type HFPayload = { inputs: string; parameters?: { threshold?: number } };

type ReqBody = {
  imageUrl?: string;    // public URL of the image
  base64Image?: string; // data URL
  threshold?: number;   // default 0.12
};

// --- Env (required) ---
const HF_ENDPOINT_URL = Deno.env.get("HF_ENDPOINT_URL") ?? "";
const HF_TOKEN        = Deno.env.get("HF_TOKEN") ?? "";
const HF_CLIP_MODEL   = Deno.env.get("HF_CLIP_MODEL") ?? "openai/clip-vit-base-patch32";
const HF_GDINO_MODEL  = Deno.env.get("HF_GDINO_MODEL") ?? "IDEA-Research/grounding-dino-tiny";

// --- Env (tunable knobs learned from your tests; safe defaults) ---
const VOTE_MIN_SCORE     = Number(Deno.env.get("VOTE_MIN_SCORE") ?? 0.20);
const SMALL_FAMILY_BOOST = Number(Deno.env.get("SMALL_FAMILY_BOOST") ?? 1.35);
const BAG_FORCE_MIN      = Number(Deno.env.get("BAG_FORCE_MIN") ?? 0.18);
const SHOE_FORCE_MIN     = Number(Deno.env.get("SHOE_FORCE_MIN") ?? 0.18);

// --- Helpers ---
function isBox(b?: any): b is HFBox {
  return b && Number.isFinite(b.xmin) && Number.isFinite(b.ymin) && Number.isFinite(b.xmax) && Number.isFinite(b.ymax);
}

// Fashionpedia "part" labels we ignore for primary garment
const PART_LABELS = new Set([
  "hood","collar","lapel","epaulette","sleeve","pocket","neckline","buckle","zipper",
  "applique","bead","bow","flower","fringe","ribbon","rivet","ruffle","sequin","tassel"
]);

// Map raw YOLOS label to coarse family (tokenized alias table)
function mapLabelToCategory(label: string): string | null {
  const L = label.toLowerCase().trim();
  if (PART_LABELS.has(L)) return null;

  // split composite labels like "shirt, blouse"
  const tokens = L.split(/[,\-/]/).map(s => s.trim());

  const CATEGORY_ALIASES: Record<string, string[]> = {
    Dress: ["dress","jumpsuit","romper"],
    Bottoms: ["skirt","pants","jeans","trousers","shorts","leggings","culottes"],
    Tops: ["shirt","blouse","top","t-shirt","tee","sweatshirt","sweater","cardigan","polo","vest","hoodie","bodysuit","tank"],
    Outerwear: ["jacket","coat","trench","puffer","parka","blazer","cape"],
    Shoes: ["shoe","sneaker","boot","heel","flat","sandal","loafer","mule","clog","ballet"],
    Bags: ["bag","handbag","tote","shoulder","crossbody","clutch","wallet","satchel","hobo","backpack","mini bag"],
    Accessories: ["belt","glove","scarf","umbrella","glasses","sunglasses","hat","beanie","tie","watch","headband","tights","stockings","sock","leg warmer","jewelry"],
  };

  for (const [cat, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (tokens.some(tok => aliases.some(a => tok.includes(a)))) return cat;
  }
  if (tokens.some(t => t.includes("cape"))) return "Outerwear";
  if (tokens.some(t => t.includes("bag") || t.includes("wallet"))) return "Bags";
  return "Clothing";
}

// Normalize any bbox (xyxy in pixels or normalized) to normalized [x, y, w, h]
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

  // guard degenerate/placeholder
  if (x1 === 1 && y1 === 1 && x2 === 1 && y2 === 1) return null;

  const clamp = (v:number) => Math.min(1, Math.max(0, v));
  const nx1 = clamp(Math.min(x1, x2));
  const ny1 = clamp(Math.min(y1, y2));
  const nx2 = clamp(Math.max(x1, x2));
  const ny2 = clamp(Math.max(y1, y2));

  const w = nx2 - nx1, h = ny2 - ny1;
  if (w <= 0.01 || h <= 0.01) return null; // ignore micro boxes
  return [nx1, ny1, w, h];
}

// Pick primary garment from YOLOS predictions
function pickPrimaryGarment(preds: HFPred[], minScore: number): HFPred | null {
  const garmentPreds = preds.filter(p => p && p.score >= minScore && isBox(p.box) && mapLabelToCategory(p.label) !== null);
  if (!garmentPreds.length) return null;

  garmentPreds.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) return scoreDiff;
    const areaA = (a.box.xmax - a.box.xmin) * (a.box.ymax - a.box.ymin);
    const areaB = (b.box.xmax - b.box.xmin) * (b.box.ymax - b.ymin);
    return areaB - areaA;
  });

  return garmentPreds[0];
}

// IoU + lightweight NMS for same-label overlaps
function iou(a: HFBox, b: HFBox) {
  const x1 = Math.max(a.xmin, b.xmin), y1 = Math.max(a.ymin, b.ymin);
  const x2 = Math.min(a.xmax, b.xmax), y2 = Math.min(a.ymax, b.ymax);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = Math.max(0, a.xmax - a.xmin) * Math.max(0, a.ymax - a.ymin);
  const areaB = Math.max(0, b.xmax - b.xmin) * Math.max(0, b.ymax - b.ymin);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}
function nmsSameLabel(preds: HFPred[], thr = 0.5): HFPred[] {
  const sorted = [...preds].sort((a,b)=>b.score-a.score);
  const out: HFPred[] = [];
  while (sorted.length) {
    const cur = sorted.shift()!;
    out.push(cur);
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (cur.label === sorted[i].label && iou(cur.box, sorted[i].box) > thr) {
        sorted.splice(i,1);
      }
    }
  }
  return out;
}

// Label matching to pick a YOLOS box for a chosen family
function labelLooksLike(predLabel: string, family: string) {
  const L = predLabel.toLowerCase();
  if (family === "Bags") return L.includes("bag") || L.includes("wallet");
  if (family === "Shoes") return L.includes("shoe") || L.includes("sneaker") || L.includes("boot") || L.includes("heel");
  if (family === "Accessories") return (
    L.includes("belt") || L.includes("glasses") || L.includes("sunglasses") || L.includes("hat") || L.includes("watch") || L.includes("tie")
  );
  if (family === "Tops") return L.includes("top") || L.includes("shirt") || L.includes("blouse") || L.includes("sweater") || L.includes("cardigan");
  if (family === "Bottoms") return L.includes("skirt") || L.includes("pants") || L.includes("shorts") || L.includes("jeans");
  if (family === "Dress") return L.includes("dress") || L.includes("jumpsuit") || L.includes("romper");
  if (family === "Outerwear") return L.includes("jacket") || L.includes("coat") || L.includes("trench") || L.includes("blazer") || L.includes("puffer");
  return false;
}
function pickBoxForFamily(preds: HFPred[], family: string): HFBox | null {
  const matches = preds.filter(p => p.box && labelLooksLike(p.label, family)).sort((a,b)=>b.score-a.score);
  return matches.length ? matches[0].box : null;
}

// Weighted category vote with small-item boost
function voteCategory(preds: HFPred[], minScore = VOTE_MIN_SCORE): string {
  const weights: Record<string, number> = {};
  for (const p of preds) {
    if (!isBox(p.box) || p.score < minScore) continue;
    const fam = mapLabelToCategory(p.label);
    if (!fam) continue;
    weights[fam] = (weights[fam] ?? 0) + p.score;
  }
  const SMALL = new Set(["Bags","Shoes","Accessories"]);
  for (const fam of Object.keys(weights)) {
    if (SMALL.has(fam)) weights[fam] *= SMALL_FAMILY_BOOST;
  }
  const top = Object.entries(weights).sort((a,b)=>b[1]-a[1])[0];
  return top ? top[0] : "Clothing";
}

// --- Image helpers (for data URLs to CLIP/GDINO) ---
function getImageDims(buf: Uint8Array): { width: number; height: number } | null {
  // PNG
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  // JPEG
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

// --- HF calls (JSON dataURL for YOLOS, JSON for CLIP/GDINO) ---
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
  return await hfRes.json();
}

// CLIP as coarse-family helper
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
      parameters: { candidate_labels: labels, multi_label: false }
    }),
  });
  if (!response.ok) {
    throw new Error(`CLIP error ${response.status}: ${await response.text().catch(() => "<no body>")}`);
  }
  const result = await response.json();
  if (result.labels && result.labels.length > 0) return result.labels[0];
  return "Clothing";
}

async function callGroundingDINO(dataUrl: string, category: string): Promise<[number,number,number,number] | null> {
  const prompts = {
    "Bags": ["handbag","tote bag","shoulder bag","crossbody bag","bag","wallet"],
    "Shoes": ["shoe","sneaker","boot","heel","flat","sandal"],
    "Accessories": ["belt","sunglasses","glasses","hat","watch","tie","scarf"]
  } as const;
  // @ts-ignore
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
        text,
        box_threshold: 0.25,
        text_threshold: 0.25
      }),
    });

    if (!response.ok) {
      console.log(`[GDINO] Failed: ${response.status}`);
      return null;
    }

    const result = await response.json();
    if (Array.isArray(result) && result.length > 0) {
      const boxes = result.filter((r: any) => r.box && r.score);
      if (boxes.length > 0) {
        boxes.sort((a: any, b: any) => b.score - a.score);
        const box = boxes[0].box;
        return [box.xmin, box.ymin, box.xmax, box.ymax];
      }
    }
  } catch (err) {
    console.log(`[GDINO] Exception: ${err}`);
  }
  return null;
}

// --- Serve ---
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ status: "ok" });

  const t0 = performance.now();
  try {
    if (req.method !== "POST") return json({ status: "fail", error: "Method not allowed", build: BUILD }, 405);

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

    const baseT = typeof body.threshold === "number" ? body.threshold : 0.12;

    // --- Parallel API calls to reduce latency ---
    console.log(`[PERF] Starting parallel API calls at ${performance.now() - t0}ms`);
    
    // Start YOLOS and CLIP in parallel
    const [yolosResult, clipResult] = await Promise.allSettled([
      callHF(dataUrl, baseT),
      callCLIP(dataUrl)
    ]);

    let preds: HFPred[] = [];
    let clipFamily = "Clothing";

    // Handle YOLOS result
    if (yolosResult.status === 'fulfilled') {
      preds = yolosResult.value;
      console.log(`[PERF] YOLOS completed at ${performance.now() - t0}ms`);
    } else {
      console.log(`[ERROR] YOLOS failed: ${yolosResult.reason}`);
      throw new Error(`YOLOS failed: ${yolosResult.reason}`);
    }

    // Handle CLIP result 
    if (clipResult.status === 'fulfilled') {
      clipFamily = clipResult.value;
      console.log(`[PERF] CLIP completed at ${performance.now() - t0}ms`);
    } else {
      console.log(`[WARN] CLIP failed, using YOLO vote: ${clipResult.reason}`);
    }

    const SMALL_LABELS = new Set([
      "shoe","bag, wallet","belt","glasses","sunglasses","hat","watch","tie","sock","tights, stockings","leg warmer"
    ]);

    const hasSmallItems = preds.some(p => SMALL_LABELS.has(p.label.toLowerCase()));
    let primary = pickPrimaryGarment(preds, baseT);

    // Only do second YOLOS pass if really needed
    if (!primary && hasSmallItems) {
      console.log(`[PERF] Second YOLOS pass needed at ${performance.now() - t0}ms`);
      const t2 = Math.max(0.06, baseT * 0.5);
      const preds2 = await callHF(dataUrl, t2);
      if (preds2?.length) preds = preds2;
      primary = pickPrimaryGarment(preds, t2);
      console.log(`[PERF] Second YOLOS completed at ${performance.now() - t0}ms`);
    }

    // NMS per label for cleaner list
    preds = nmsSameLabel(preds, 0.5);

    // Weighted YOLO vote (with boost)
    let yoloFamily = voteCategory(preds);

    // Presence checks to make Bags/Shoes visible (CSV learning)
    const bagish  = preds.some(p => /bag|wallet/i.test(p.label) && p.score >= BAG_FORCE_MIN);
    const shoeish = preds.some(p => /shoe|sneaker|boot|heel/i.test(p.label) && p.score >= SHOE_FORCE_MIN);
    const accish  = preds.some(p => /belt|glasses|sunglasses|hat|watch|tie/i.test(p.label));

    // Final category decision (layered)
    const FAMILIES_SMALL    = new Set(["Bags","Shoes","Accessories"]);
    const FAMILIES_GARMENTS = new Set(["Tops","Bottoms","Dress","Outerwear"]);

    let category = yoloFamily;

    // 1) Soft-force small items when present
    if (bagish) category = "Bags";
    else if (shoeish && category !== "Bags") category = "Shoes";

    // 2) If YOLO says garment but CLIP says small item, let CLIP flip
    const yoloIsGarment = FAMILIES_GARMENTS.has(yoloFamily);
    const clipIsSmall   = FAMILIES_SMALL.has(clipFamily);
    if (clipIsSmall && yoloIsGarment) category = clipFamily;

    // 3) If YOLO had no usable primary, trust CLIP
    if (!primary) category = clipFamily;

    console.log(`[PERF] Category decision completed at ${performance.now() - t0}ms`);

    // --- Pick bbox consistent with the FINAL category ---
    let bbox: [number,number,number,number] | null = null;

    // Prefer a YOLOS box matching the chosen family
    const famBox = pickBoxForFamily(preds, category);
    if (famBox) {
      bbox = toNormBox(famBox, imgW, imgH);
      console.log(`[PERF] Found YOLOS box for ${category} at ${performance.now() - t0}ms`);
    }

    // If none and small item, use GDINO fallback (but only if really necessary)
    if (!bbox && FAMILIES_SMALL.has(category) && !primary) {
      console.log(`[PERF] Using GDINO fallback for ${category} at ${performance.now() - t0}ms`);
      try {
        const fb = await callGroundingDINO(dataUrl, category);
        if (fb) {
          bbox = toNormBox(fb, imgW, imgH);
          console.log(`[PERF] GDINO completed at ${performance.now() - t0}ms`);
        }
      } catch (err) {
        console.log(`[WARN] GDINO failed: ${err}`);
      }
    }

    // As last resort: primary box only if it matches family
    if (!bbox && primary && mapLabelToCategory(primary.label) === category) {
      bbox = toNormBox(primary.box, imgW, imgH);
      console.log(`[PERF] Using primary box fallback at ${performance.now() - t0}ms`);
    }

    // --- Sanitize result list (normalized boxes; drop nulls) ---
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
      category,                     // final coarse family
      bbox,                         // normalized [x,y,w,h] or null
      proposedTitle: category,
      colorName: null,              // Phase 1 can re-enable color extraction
      colorHex: null,
      yolosTopLabels: sanitized.slice(0,3).map(d => d.label),
      result: trimmed,              // [{score,label,box:[x,y,w,h]}...]
      latencyMs,
      model: "valentinafeve/yolos-fashionpedia",
      debug: {
        yoloFamily, clipFamily, bagish, shoeish, accish,
        VOTE_MIN_SCORE, SMALL_FAMILY_BOOST, BAG_FORCE_MIN, SHOE_FORCE_MIN,
        topYoloLabels: sanitized.slice(0,5).map(d => ({label:d.label, score:d.score}))
      }
    });

  } catch (err) {
    const latencyMs = Math.round(performance.now() - t0);
    return json({ status: "fail", stop: "exception", latencyMs, error: String(err), build: BUILD }, 500);
  }
});
