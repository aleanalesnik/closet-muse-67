// deno-lint-ignore-file no-explicit-any
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';

const HF_ENDPOINT_URL = Deno.env.get('HF_ENDPOINT_URL')!;
const HF_TOKEN = Deno.env.get('HF_TOKEN')!;

type DetectReq = {
  imageUrl?: string;
  base64Image?: string;
  threshold?: number;
};

// ---- CORS (robust) ----
const corsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
});

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const baseHeaders = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: baseHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method Not Allowed' }), { 
      status: 200,
      headers: { ...baseHeaders, 'Content-Type': 'application/json' }
    });
  }

  const start = performance.now();
  try {
    const body = (await req.json()) as DetectReq;
    const threshold = body.threshold ?? 0.5;

    let dataUrl: string | undefined = body.base64Image;

    // Prefer URL path to keep client payload tiny
    if (!dataUrl && body.imageUrl) {
      const imgRes = await fetch(body.imageUrl);
      if (!imgRes.ok) throw new Error(`Fetch image failed: ${imgRes.status}`);
      const mime = imgRes.headers.get('content-type') ?? 'image/png';
      const bytes = new Uint8Array(await imgRes.arrayBuffer());
      const b64 = encodeBase64(bytes);
      dataUrl = `data:${mime};base64,${b64}`;
    }

    if (!dataUrl) throw new Error('No image provided');

    const hfReq = {
      inputs: dataUrl, // HF expects a data URL string
      parameters: { threshold },
    };

    const hf = await fetch(HF_ENDPOINT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(hfReq),
    });

    const latencyMs = Math.round(performance.now() - start);
    if (!hf.ok) {
      const errTxt = await hf.text().catch(() => '');
      return new Response(JSON.stringify(
        { status: 'fail', latencyMs, error: errTxt || hf.statusText, stop: 'hf_error' }
      ), {
        status: 200,
        headers: { ...baseHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await hf.json();
    
    // YOLOS mapping and title building
    function mapYolosToTaxonomy(label: string): { category: string; subcategory: string } | null {
      const s = label.toLowerCase();
      
      // Bags
      if (["handbag", "bag", "tote", "shoulder bag", "satchel", "purse", "crossbody", "hobo", "clutch", "duffle"].some(term => s.includes(term))) {
        if (s.includes("tote")) return { category: "Bags", subcategory: "Tote" };
        if (s.includes("shoulder") || s.includes("crossbody")) return { category: "Bags", subcategory: "Shoulder" };
        if (s.includes("backpack")) return { category: "Bags", subcategory: "Backpack" };
        return { category: "Bags", subcategory: "Bag" };
      }
      
      // Accessories
      if (["belt", "buckle", "sunglasses", "glasses", "hat", "cap", "beanie", "scarf"].some(term => s.includes(term))) {
        if (s.includes("belt") || s.includes("buckle")) return { category: "Accessories", subcategory: "Belt" };
        if (s.includes("sunglasses") || s.includes("glasses")) return { category: "Accessories", subcategory: "Sunglasses" };
        if (s.includes("hat") || s.includes("cap") || s.includes("beanie")) return { category: "Accessories", subcategory: "Hat" };
        if (s.includes("scarf")) return { category: "Accessories", subcategory: "Scarf" };
        return { category: "Accessories", subcategory: "Accessory" };
      }
      
      // Shoes
      if (["boot", "boots", "sneaker", "shoe", "loafer", "heel", "sandals", "flat", "flats"].some(term => s.includes(term))) {
        if (s.includes("boots")) return { category: "Shoes", subcategory: "Boots" };
        if (s.includes("sneaker") || s.includes("trainer")) return { category: "Shoes", subcategory: "Sneakers" };
        if (s.includes("heel")) return { category: "Shoes", subcategory: "Heels" };
        if (s.includes("flat") || s.includes("loafer")) return { category: "Shoes", subcategory: "Flats" };
        return { category: "Shoes", subcategory: "Shoes" };
      }
      
      // Dress
      if (s.includes("dress")) return { category: "Dress", subcategory: "Dress" };
      
      // Top
      if (["shirt", "t-shirt", "tee", "blouse", "polo", "sweater", "knit", "jumper", "tank", "top", "sweatshirt", "hoodie"].some(term => s.includes(term))) {
        if (s.includes("sweater") || s.includes("knit") || s.includes("jumper")) return { category: "Top", subcategory: "Sweater" };
        if (s.includes("sweatshirt") || s.includes("hoodie")) return { category: "Top", subcategory: "Sweatshirt" };
        if (s.includes("tank")) return { category: "Top", subcategory: "Tank" };
        return { category: "Top", subcategory: "T-Shirt" };
      }
      
      // Outerwear
      if (["jacket", "coat", "blazer", "trench", "outerwear"].some(term => s.includes(term))) {
        if (s.includes("coat") || s.includes("trench")) return { category: "Outerwear", subcategory: "Coat" };
        if (s.includes("blazer")) return { category: "Outerwear", subcategory: "Blazer" };
        return { category: "Outerwear", subcategory: "Jacket" };
      }
      
      // Bottoms
      if (["jeans", "pants", "trousers", "skirt", "shorts"].some(term => s.includes(term))) {
        if (s.includes("jeans")) return { category: "Bottoms", subcategory: "Jeans" };
        if (s.includes("pants") || s.includes("trousers")) return { category: "Bottoms", subcategory: "Pants" };
        if (s.includes("skirt")) return { category: "Bottoms", subcategory: "Skirt" };
        if (s.includes("shorts")) return { category: "Bottoms", subcategory: "Shorts" };
        return { category: "Bottoms", subcategory: "Pants" };
      }
      
      // Fallback
      return { category: "Clothing", subcategory: "Item" };
    }

    function titleCase(s: string): string {
      return s.split(/\s+/).map(w => 
        w[0] ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w
      ).join(' ');
    }

    function buildProposedTitle(colorName: string | null, category: string | null, subcategory: string | null): string {
      const color = colorName?.toLowerCase?.() || "";
      
      if (category && subcategory) {
        if (category === "Bags" && subcategory === "Tote") {
          return color ? `${titleCase(color)} tote bag` : "Tote bag";
        }
        return color ? `${titleCase(color)} ${subcategory.toLowerCase()}` : titleCase(subcategory);
      }
      
      if (category) {
        return color ? `${titleCase(color)} ${category.toLowerCase()}` : titleCase(category);
      }
      
      return color ? `${titleCase(color)} clothing` : "Clothing";
    }

    // Color extraction (placeholder - assuming this gets filled with actual image processing)
    const colorHex = "#000000";  // Will be processed client-side
    const colorName = "Black";   // Will be processed client-side

    // Get top 3 labels by score
    const detections = Array.isArray(result) ? result : [];
    const yolosTopLabels = detections
      .sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
      .slice(0, 3)
      .map((d: any) => d.label || '');

    // Get best detection for mapping
    const top = detections.length ? detections[0] : null;
    const bbox = top?.box ? {
      xmin: top.box.xmin,
      ymin: top.box.ymin,
      xmax: top.box.xmax,
      ymax: top.box.ymax
    } : null;

    // Map to taxonomy
    const mapped = top ? mapYolosToTaxonomy(top.label || '') : null;
    const category = mapped?.category || null;
    const subcategory = mapped?.subcategory || null;
    
    const proposedTitle = buildProposedTitle(colorName, category, subcategory);
    
    return new Response(JSON.stringify({
      status: 'success',
      model: 'valentinafeve/yolos-fashionpedia',
      latencyMs,
      result,
      yolosTopLabels,
      bbox,
      category,
      subcategory,
      colorHex,
      colorName,
      proposedTitle
    }), {
      status: 200,
      headers: { ...baseHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const latencyMs = Math.round(performance.now() - start);
    return new Response(JSON.stringify(
      { status: 'fail', latencyMs, error: String(e?.message ?? e), stop: 'exception' }
    ), {
      status: 200,
      headers: { ...baseHeaders, 'Content-Type': 'application/json' },
    });
  }
});
