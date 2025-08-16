// supabase/functions/sila-model-debugger/index.ts
// Minimal, reliable: classify & (when possible) return a normalized bbox + trimmed detections.
// No color/proposedTitle here — those are computed client-side to avoid bad defaults.

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
const HF_TOKEN        = Deno.env.get("HF_TOKEN") ?? "";

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

  // guard: some models produce [1,1,1,1] when they mean "no box"
  if (x1 === 1 && y1 === 1 && x2 === 1 && y2 === 1) return null;

  const clamp = (v:number) => Math.min(1, Math.max(0, v));
  x1 = clamp(Math.min(x1, x2));
  y1 = clamp(Math.min(y1, y2));
  x2 = clamp(Math.max(x1, x2));
  y2 = clamp(Math.max(y1, y2));

  const w = x2 - x1, h = y2 - y1;
  if (w <= 0.01 || h <= 0.01) return null; // ignore tiny/degenerate boxes
  return [x1, y1, x2, y2];
}

function pickPrimaryGarment(preds: HFPred[], minScore: number): HFPred | null {
  const garmentPreds = preds.filter(p => p && p.score >= minScore && isBox(p.box) && mapLabelToCategory(p.label) !== null);
  if (!garmentPreds.length) return null;
  garmentPreds.sort((a, b) => b.score - a.score);
  return garmentPreds[0];
}

function deriveCategoryByVote(preds: HFPred[]): string {
  const votes = new Map<string, number>();
  for (const p of preds) {
    const c = mapLabelToCategory(p.label);
    if (!c) continue;
    votes.set(c, (votes.get(c) ?? 0) + p.score);
  }
  if (!votes.size) return "Clothing";
  return [...votes.entries()].sort((a,b) => b[1] - a[1])[0][0];
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

    // First pass @t; if no garment, second pass @0.06
    let preds = await callHF(dataUrl, t);
    let primary = pickPrimaryGarment(preds, t);
    if (!primary) {
      const t2 = Math.min(0.06, t);
      const preds2 = await callHF(dataUrl, t2);
      // If the model returns the same objects, merge and pick again.
      if (preds2?.length) preds = preds2;
      primary = pickPrimaryGarment(preds, t2);
    }

    const category = primary ? (mapLabelToCategory(primary.label) ?? "Clothing") : deriveCategoryByVote(preds);

    const bbox = primary && isBox(primary.box) ? toNormBox(primary.box) : null;

    // Trim detections for debug overlay (avoid huge payloads)
    const trimmed = [...preds]
      .sort((a,b) => b.score - a.score)
      .slice(0, 8)
      .map(p => ({
        score: Math.round(p.score * 1000) / 1000,
        label: p.label,
        box: toNormBox(p.box)
      }))
      .filter(p => p.box !== null); // Remove entries with malformed boxes

    const latencyMs = Math.round(performance.now() - t0);
    return new Response(JSON.stringify({
      status: "success",
      model: "valentinafeve/yolos-fashionpedia",
      latencyMs,
      category,
      bbox,
      result: trimmed,
      yolosTopLabels: trimmed.slice(0,3).map(d => d.label)
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const latencyMs = Math.round(performance.now() - t0);
    return new Response(JSON.stringify({ status: "fail", stop: "exception", latencyMs, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});