// supabase/functions/sila-model-debugger/index.ts

// Always return 200 from the edge so the client never sees a non-2xx.
// The body carries {status:'success'|'fail', ...}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type HFBox = { xmin:number; ymin:number; xmax:number; ymax:number };
type HFDet = { score:number; label:string; box?:HFBox };

type RequestBody = {
  imageUrl?: string;       // required
  threshold?: number;      // optional
};

const HF_ENDPOINT_URL = Deno.env.get("HF_ENDPOINT_URL") ?? "";
const HF_TOKEN        = Deno.env.get("HF_TOKEN") ?? "";

// --- helpers ---------------------------------------------------------------

function ok<T>(data: T, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    ...init,
  });
}

async function fetchAsDataURL(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch image failed: ${res.status} ${res.statusText}`);
  const mime = res.headers.get("content-type")?.split(";")[0] ?? "image/png";
  const buf  = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.byteLength; i++) bin += String.fromCharCode(buf[i]);
  return `data:${mime};base64,${btoa(bin)}`;
}

const PART_LABELS = new Set([
  "hood","collar","lapel","epaulette","sleeve","pocket","neckline","buckle","zipper",
  "applique","bead","bow","flower","fringe","ribbon","rivet","ruffle","sequin","tassel"
]);

function toLower(s?: string) { return (s ?? "").toLowerCase(); }

function mapLabelToCategory(label?: string): string | null {
  const L = toLower(label);
  if (!L || PART_LABELS.has(L)) return null;
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

function area(b?: HFBox) {
  if (!b) return 0;
  return Math.max(0, b.xmax - b.xmin) * Math.max(0, b.ymax - b.ymin);
}

function choosePrimaryDet(dets: HFDet[], threshold: number): HFDet | null {
  const garmentOnly = dets.filter(d => (d.score ?? 0) >= threshold && !PART_LABELS.has(toLower(d.label) ?? ""));
  if (garmentOnly.length === 0) return null;
  garmentOnly.sort((a, b) => {
    const s = (b.score - a.score);
    if (s !== 0) return s;
    return area(b.box) - area(a.box);
  });
  return garmentOnly[0] ?? null;
}

// --- handler ---------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return ok("ok");

  try {
    if (req.method !== "POST") {
      return ok({ status: "fail", error: "Method not allowed" });
    }

    const body = (await req.json()) as RequestBody;
    if (!HF_ENDPOINT_URL || !HF_TOKEN) {
      return ok({
        status: "fail",
        stop: "config",
        error: "Missing HF_ENDPOINT_URL or HF_TOKEN",
      });
    }
    if (!body?.imageUrl) {
      return ok({ status: "fail", stop: "input", error: "imageUrl is required" });
    }

    const t0 = performance.now();

    // Convert the public URL to a data URL for HF
    let dataUrl: string;
    try {
      dataUrl = await fetchAsDataURL(body.imageUrl);
    } catch (e) {
      return ok({ status: "fail", stop: "fetch_image", error: String(e) });
    }

    const threshold = typeof body.threshold === "number" ? body.threshold : 0.12;

    // Call Hugging Face
    const hfRes = await fetch(HF_ENDPOINT_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: dataUrl,
        parameters: { threshold },
      }),
    });

    const latencyMs = Math.round(performance.now() - t0);

    let result: HFDet[] = [];
    if (!hfRes.ok) {
      const errText = await hfRes.text().catch(() => "<no body>");
      return ok({
        status: "fail",
        stop: "hf_error",
        latencyMs,
        error: errText,
      });
    }

    try {
      result = (await hfRes.json()) as HFDet[];
    } catch (e) {
      return ok({ status: "fail", stop: "parse", latencyMs, error: String(e) });
    }

    // Pick top few labels for debugging
    const yolosTopLabels = [...result]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(d => d.label);

    // Choose a primary detection & category (garment labels only)
    const primary = choosePrimaryDet(result, threshold);
    const category = mapLabelToCategory(primary?.label) ?? "Clothing";
    const bbox = primary?.box ?? null;

    return ok({
      status: "success",
      model: "valentinafeve/yolos-fashionpedia",
      latencyMs,
      result,                // raw detections
      yolosTopLabels,        // top-3 labels for UI debugging
      category,              // coarse category
      bbox,                  // absolute pixels as given by the model
      colorName: null,       // color is now computed on the client
      colorHex:  null,
      // Let the client build {Color} {Category} or use its own title logic
      proposedTitle: null,
    });

  } catch (err) {
    // Never leak a 500 — return a 200 with status:'fail'
    return ok({ status: "fail", stop: "exception", error: String(err) });
  }
});