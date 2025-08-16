// supabase/functions/sila-model-debugger/index.ts
// Edge: YOLOS + color + normalized boxes + clean title

// --- CORS ---
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// --- Env ---
const HF_ENDPOINT_URL = Deno.env.get("HF_ENDPOINT_URL") ?? "";
const HF_TOKEN        = Deno.env.get("HF_TOKEN") ?? "";

import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

type RawBox = { xmin:number; ymin:number; xmax:number; ymax:number };
type RawDet = { score:number; label:string; box?:RawBox | number[] };

type EdgeOk = {
  status: "success";
  model: string;
  latencyMs: number;
  // normalized main bbox [x0,y0,x1,y1] or null
  bbox: [number,number,number,number] | null;
  category: string;              // e.g. "Bottoms"
  colorHex: string;              // e.g. "#3289E2"
  colorName: string;             // e.g. "Blue"
  proposedTitle: string;         // e.g. "Blue bottoms"
  // per-detection overlay: normalized boxes with label & score
  detections: { label:string; score:number; box:[number,number,number,number] }[];
  // optional debug
  yolosTopLabels?: string[];
  result?: any;
};

type EdgeErr = { status:"fail"; stop:"hf_error"|"exception"; latencyMs:number; error:string };

// ---------- LABEL SETS ----------
const PART_LABELS = new Set([
  "hood","collar","lapel","epaulette","sleeve","pocket","neckline","buckle","zipper",
  "applique","bead","bow","flower","fringe","ribbon","rivet","ruffle","sequin","tassel"
]);

const GARMENT_GROUPS: Record<string,string[]> = {
  Dress:    ["dress","jumpsuit"],
  Bottoms:  ["pants","shorts","skirt"],
  Tops:     ["shirt, blouse","top, t-shirt, sweatshirt","sweater","cardigan","vest"],
  Outerwear:["jacket","coat","cape"],
  Shoes:    ["shoe"],
  Bags:     ["bag, wallet"],
  Accessory:["belt","glove","scarf","umbrella","glasses","hat","tie","leg warmer","tights, stockings","sock"],
};

// ---------- COLOR PALETTE ----------
type Swatch = { name:string; hex:string };

const PALETTE: Swatch[] = [
  { name: "Black",  hex: "#000000" },
  { name: "Grey",   hex: "#D9D9D9" },
  { name: "White",  hex: "#FFFFFF" },
  { name: "Beige",  hex: "#EEE3D1" },
  { name: "Brown",  hex: "#583B30" },
  // gradients replaced with flats to be snap-able:
  { name: "Silver", hex: "#C0C0C0" },
  { name: "Gold",   hex: "#FFD04D" },
  { name: "Purple", hex: "#8023AD" },
  { name: "Blue",   hex: "#3289E2" },
  { name: "Navy",   hex: "#144679" },
  { name: "Green",  hex: "#39C161" },
  { name: "Yellow", hex: "#FCD759" },
  { name: "Orange", hex: "#FB7C00" },
  { name: "Pink",   hex: "#F167A7" },
  { name: "Red",    hex: "#CD0002" },
  { name: "Maroon", hex: "#720907" },
];

// ---------- UTIL: fetch -> data URL + bytes ----------
async function fetchToBytes(url: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch image failed: ${r.status} ${r.statusText}`);
  const mime = r.headers.get("content-type")?.split(";")[0] ?? "image/png";
  const buf = new Uint8Array(await r.arrayBuffer());
  return { bytes: buf, mime };
}
function bytesToDataUrl(bytes: Uint8Array, mime: string) {
  let binary = "";
  for (let i=0;i<bytes.length;i++) binary += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(binary)}`;
}

// ---------- COLOR: average → palette snap ----------
function hex(c:number){ return Math.round(c).toString(16).padStart(2,"0"); }
function rgbToHex(r:number,g:number,b:number){ return `#${hex(r)}${hex(g)}${hex(b)}` }

// very small + robust average
async function averageColor(bytes: Uint8Array): Promise<{hex:string; name:string}> {
  const img = await Image.decode(bytes).catch(()=>null);
  if (!img) return { hex:"#000000", name:"Black" };
  img.resize(48,48); // cheap downsample
  let r=0,g=0,b=0,c=0;
  for (let y=0;y<img.height;y++){
    for (let x=0;x<img.width;x++){
      const p = img.getPixelAt(x,y);
      r += (p >> 24) & 0xff;
      g += (p >> 16) & 0xff;
      b += (p >>  8) & 0xff;
      c++;
    }
  }
  r/=c; g/=c; b/=c;
  const avg = rgbToHex(r,g,b);

  // snap to nearest palette (Euclidean in RGB is OK for 16 discrete chips)
  const snap = PALETTE.reduce<{sw:Swatch; d:number}>((acc, sw) => {
    const rr = parseInt(sw.hex.slice(1,3),16);
    const gg = parseInt(sw.hex.slice(3,5),16);
    const bb = parseInt(sw.hex.slice(5,7),16);
    const d = (r-rr)*(r-rr) + (g-gg)*(g-gg) + (b-bb)*(b-bb);
    return (d<acc.d)?{sw,d}:{...acc};
  }, { sw: PALETTE[0], d: 1e12 });

  return { hex: snap.sw.hex, name: snap.sw.name };
}

// ---------- YOLOS call ----------
async function callHF(publicUrl: string, threshold: number) {
  const body = { inputs: publicUrl, parameters: { threshold } };
  const res = await fetch(HF_ENDPOINT_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(()=>"<no-body>");
    throw new Error(`HF ${res.status}: ${t}`);
  }
  // models return array of {score,label,box:{xmin,ymin,xmax,ymax}}
  return await res.json() as RawDet[];
}

// normalize boxes to [0,1] no matter if model gave pixels or fractions
function normalizeBox(box: RawBox | number[]): [number,number,number,number] | null {
  // unify to object
  let xmin:number, ymin:number, xmax:number, ymax:number;
  if (Array.isArray(box)) {
    [xmin,ymin,xmax,ymax] = box as number[];
  } else {
    ({ xmin, ymin, xmax, ymax } = box);
  }
  if (![xmin,ymin,xmax,ymax].every(n => Number.isFinite(n))) return null;

  // already normalized?
  const maxv = Math.max(xmax, ymax);
  if (maxv <= 1.000001) {
    const x0 = Math.max(0, Math.min(1, xmin));
    const y0 = Math.max(0, Math.min(1, ymin));
    const x1 = Math.max(0, Math.min(1, xmax));
    const y1 = Math.max(0, Math.min(1, ymax));
    if (x1<=x0 || y1<=y0) return null;
    return [x0,y0,x1,y1];
  }
  // pixel-ish → scale by the largest coordinate (stable without knowing W/H)
  const scale = maxv || 1;
  const x0 = Math.max(0, xmin/scale);
  const y0 = Math.max(0, ymin/scale);
  const x1 = Math.max(0, xmax/scale);
  const y1 = Math.max(0, ymax/scale);
  if (x1<=x0 || y1<=y0) return null;
  return [x0,y0,x1,y1];
}

function isPart(label:string){ return PART_LABELS.has(label.toLowerCase()); }

function mapGarmentToCategory(label:string): string {
  const L = label.toLowerCase();
  for (const [cat, keys] of Object.entries(GARMENT_GROUPS)) {
    for (const k of keys) {
      if (L.includes(k)) return cat;
    }
  }
  return "Clothing"; // last resort
}

function pickPrimaryGarment(dets: {label:string; score:number; box:[number,number,number,number] | null}[]){
  const garment = dets.filter(d => !isPart(d.label));
  if (!garment.length) return null;
  // highest score, then largest area
  garment.sort((a,b)=>{
    const s = (b.score - a.score);
    if (s !== 0) return s;
    const area = (d:any)=> {
      const [x0,y0,x1,y1] = d.box ?? [0,0,0,0]; 
      return (x1-x0)*(y1-y0);
    };
    return area(b)-area(a);
  });
  return garment[0]!;
}

function titleFrom(colorName:string|null, category:string|null){
  const c = (colorName ?? "").trim();
  const k = (category ?? "").trim();
  if (c && k) return `${c} ${k.toLowerCase()}`;
  if (k) return k;
  if (c) return `${c} item`;
  return "Clothing item";
}

// ---------- HTTP ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const t0 = performance.now();
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ status:"fail", error:"Method not allowed"}), { status:405, headers:{...cors,"Content-Type":"application/json"} });
    }
    const body = await req.json().catch(()=> ({}));
    const imageUrl: string | undefined = body?.imageUrl;
    const threshold: number = typeof body?.threshold === "number" ? body.threshold : 0.12;
    if (!imageUrl) {
      return new Response(JSON.stringify({ status:"fail", error:"Missing imageUrl" }), { status:400, headers:{...cors,"Content-Type":"application/json"} });
    }
    if (!HF_ENDPOINT_URL || !HF_TOKEN) {
      return new Response(JSON.stringify({ status:"fail", error:"HF not configured"}), { status:500, headers:{...cors,"Content-Type":"application/json"} });
    }

    // 1) YOLOS
    const raw = await callHF(imageUrl, threshold);
    const latencyMs = Math.round(performance.now() - t0);

    // normalize detections for overlay
    const dets = raw.map(r => {
      const nbox = r.box ? normalizeBox(r.box) : null;
      return { label: r.label ?? "", score: Number(r.score ?? 0), box: nbox };
    });

    // 2) choose primary garment only (never parts)
    const primary = pickPrimaryGarment(dets);

    const category = primary ? mapGarmentToCategory(primary.label) : "Clothing";
    const bbox = primary?.box ?? null;

    // 3) color from actual pixels, then snap to palette
    const { bytes } = await fetchToBytes(imageUrl);
    const { hex: colorHex, name: colorName } = await averageColor(bytes);

    const proposedTitle = titleFrom(colorName, category);

    const resp: EdgeOk = {
      status: "success",
      model: "valentinafeve/yolos-fashionpedia",
      latencyMs,
      bbox,
      category,
      colorHex,
      colorName,
      proposedTitle,
      detections: dets
        .filter(d => d.box !== null)
        .map(d => ({ label: d.label, score: d.score, box: d.box! })),
      yolosTopLabels: dets
        .sort((a,b)=>b.score-a.score)
        .slice(0,3)
        .map(d=>d.label),
      result: raw, // raw passthrough for debugging
    };

    return new Response(JSON.stringify(resp), { headers:{...cors,"Content-Type":"application/json"} });

  } catch (err:any) {
    const latencyMs = Math.round(performance.now() - t0);
    const fail: EdgeErr = { status:"fail", stop:"exception", latencyMs, error:String(err?.message ?? err) };
    return new Response(JSON.stringify(fail), { status:500, headers:{...cors,"Content-Type":"application/json"} });
  }
});