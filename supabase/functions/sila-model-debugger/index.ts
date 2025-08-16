// deno-lint-ignore-file no-explicit-any
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';
import { decode } from 'https://deno.land/x/imagescript@1.2.15/mod.ts';

const HF_ENDPOINT_URL = Deno.env.get('HF_ENDPOINT_URL')!;
const HF_TOKEN = Deno.env.get('HF_TOKEN')!

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
    
    // Garment filtering and mapping helpers
    const GARMENT_LABELS = new Set([
      'dress', 'jumpsuit', 'shirt', 'blouse', 't-shirt', 'top', 'sweater', 'cardigan',
      'jacket', 'coat', 'blazer', 'vest', 'pants', 'jeans', 'trousers', 
      'shorts', 'skirt', 'shoes', 'boots', 'sneakers', 'heels', 'sandals',
      'bag', 'handbag', 'purse', 'backpack', 'tote', 'clutch', 'wallet',
      'belt', 'glove', 'scarf', 'umbrella', 'sunglasses', 'glasses', 'hat', 'cap',
      'tie', 'leg warmer', 'tights', 'stockings', 'sock'
    ]);

    // Part labels to ignore entirely
    const PART_LABELS = new Set([
      'hood', 'collar', 'lapel', 'epaulette', 'sleeve', 'pocket', 'neckline',
      'buckle', 'zipper', 'applique', 'bead', 'bow', 'flower', 'fringe',
      'ribbon', 'rivet', 'ruffle', 'sequin', 'tassel'
    ]);

    function pickMainGarment(detections: any[]): any | null {
      if (!Array.isArray(detections) || !detections.length) return null;
      
      // Filter to garment labels only, exclude parts
      const garments = detections.filter(d => {
        const label = (d?.label || '').toLowerCase();
        
        // Skip if it's a part label
        if (PART_LABELS.has(label) || Array.from(PART_LABELS).some(p => label.includes(p))) {
          return false;
        }
        
        // Include if it's a garment label
        return GARMENT_LABELS.has(label) || 
               Array.from(GARMENT_LABELS).some(g => label.includes(g));
      });
      
      if (!garments.length) return null;
      
      // Sort by score then area (larger area wins ties)
      return garments.sort((a, b) => {
        const scoreDiff = (b.score || 0) - (a.score || 0);
        if (Math.abs(scoreDiff) > 0.01) return scoreDiff;
        
        const areaA = a.box ? (a.box.xmax - a.box.xmin) * (a.box.ymax - a.box.ymin) : 0;
        const areaB = b.box ? (b.box.xmax - b.box.xmin) * (b.box.ymax - b.box.ymin) : 0;
        return areaB - areaA;
      })[0];
    }

    function mapToCategory(label: string): string | null {
      const s = label.toLowerCase();
      
      // Bags
      if (["bag", "handbag", "purse", "tote", "clutch", "backpack", "wallet"].some(term => s.includes(term))) {
        return "Bags";
      }
      
      // Shoes  
      if (["shoe", "boot", "sneaker", "heel", "sandal", "flat"].some(term => s.includes(term))) {
        return "Shoes";
      }
      
      // Dress & Jumpsuit
      if (["dress", "jumpsuit"].some(term => s.includes(term))) {
        return "Dress";
      }
      
      // Bottoms
      if (["skirt", "pants", "jean", "trouser", "short"].some(term => s.includes(term))) {
        return "Bottoms";
      }
      
      // Tops
      if (["shirt", "blouse", "t-shirt", "top", "sweater", "sweatshirt", "cardigan", "vest"].some(term => s.includes(term))) {
        return "Tops";
      }
      
      // Outerwear
      if (["jacket", "coat", "cape"].some(term => s.includes(term))) {
        return "Outerwear";
      }
      
      // Accessories
      if (["belt", "glove", "scarf", "umbrella", "glasses", "sunglasses", "hat", "cap", "tie", "leg warmer", "tight", "stocking", "sock"].some(term => s.includes(term))) {
        return "Accessory";
      }
      
      return "Clothing"; // Final fallback
    }

    function normalizeBboxToXYWH(box: any, imgWidth: number, imgHeight: number): number[] | null {
      if (!box || !imgWidth || !imgHeight) return null;
      
      // Convert from pixel coordinates to normalized [x, y, w, h]
      const xmin = Math.max(0, Math.min(box.xmin / imgWidth, 1));
      const ymin = Math.max(0, Math.min(box.ymin / imgHeight, 1));  
      const xmax = Math.max(0, Math.min(box.xmax / imgWidth, 1));
      const ymax = Math.max(0, Math.min(box.ymax / imgHeight, 1));
      
      const x = xmin;
      const y = ymin;
      const w = xmax - xmin;
      const h = ymax - ymin;
      
      return [x, y, w, h];
    }

    const PALETTE = [
      { name: "Black", hex: "#000000" },
      { name: "Grey", hex: "#D9D9D9" },
      { name: "White", hex: "#FFFFFF" },
      { name: "Beige", hex: "#EEE3D1" },
      { name: "Brown", hex: "#583B30" },
      { name: "Silver", hex: "#C0C0C0" },
      { name: "Gold", hex: "#D4AF37" },
      { name: "Purple", hex: "#8023AD" },
      { name: "Blue", hex: "#3289E2" },
      { name: "Navy", hex: "#144679" },
      { name: "Green", hex: "#39C161" },
      { name: "Yellow", hex: "#FCD759" },
      { name: "Orange", hex: "#FB7C00" },
      { name: "Pink", hex: "#F167A7" },
      { name: "Red", hex: "#CD0002" },
      { name: "Maroon", hex: "#720907" },
    ];

    function hexToRgb(hex: string): [number, number, number] {
      const n = parseInt(hex.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    function snapToPalette(hex: string): { name: string; hex: string } {
      const [r, g, b] = hexToRgb(hex);
      let best = 0;
      let bestDistance = Infinity;
      
      for (let i = 0; i < PALETTE.length; i++) {
        const [pr, pg, pb] = hexToRgb(PALETTE[i].hex);
        const distance = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
        if (distance < bestDistance) {
          best = i;
          bestDistance = distance;
        }
      }
      
      return PALETTE[best];
    }

    async function dominantColor(imageUrl: string): Promise<{ name: string; hex: string }> {
      try {
        const imgRes = await fetch(imageUrl);
        if (!imgRes.ok) throw new Error('Failed to fetch image');
        
        const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
        const image = decode(imgBytes);
        
        if (!image) throw new Error('Failed to decode image');
        
        // Sample pixels and compute dominant color
        const colorCounts = new Map<string, number>();
        const width = image.width;
        const height = image.height;
        
        // Sample every 10th pixel for performance
        for (let y = 0; y < height; y += 10) {
          for (let x = 0; x < width; x += 10) {
            const pixel = image.getPixelAt(x, y);
            const r = (pixel >> 24) & 255;
            const g = (pixel >> 16) & 255; 
            const b = (pixel >> 8) & 255;
            const a = pixel & 255;
            
            // Skip transparent and near-white low-saturation pixels
            if (a < 128) continue;
            
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const saturation = max === 0 ? 0 : (max - min) / max;
            const lightness = (max + min) / 2;
            
            if (lightness > 240 && saturation < 0.1) continue;
            
            const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
            colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
          }
        }
        
        if (colorCounts.size === 0) {
          return PALETTE[0]; // Default to black
        }
        
        // Find most frequent color
        const dominantHex = Array.from(colorCounts.entries())
          .sort((a, b) => b[1] - a[1])[0][0];
          
        return snapToPalette(dominantHex);
      } catch (error) {
        console.error('Color extraction failed:', error);
        return PALETTE[0]; // Default to black
      }
    }

    // Process detections
    const detections = Array.isArray(result) ? result : [];
    const mainGarment = pickMainGarment(detections);
    
    // Get category from main garment
    const category = mainGarment ? mapToCategory(mainGarment.label || '') : null;
    
    // Get normalized bbox as [x, y, w, h]
    let bbox: number[] | null = null;
    if (mainGarment?.box && body.imageUrl) {
      // For proper normalization, we need actual image dimensions
      // Try to extract from the decoded image if we have it
      let imgWidth = 1024;  // Default assumption
      let imgHeight = 1024; // Default assumption
      
      try {
        const imgRes = await fetch(body.imageUrl);
        const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
        const image = decode(imgBytes);
        if (image) {
          imgWidth = image.width;
          imgHeight = image.height;
        }
      } catch (e) {
        console.warn('Could not get image dimensions:', e);
      }
      
      bbox = normalizeBboxToXYWH(mainGarment.box, imgWidth, imgHeight);
    }
    
    // Extract color from image URL
    let colorResult = { name: "Black", hex: "#000000" };
    if (body.imageUrl) {
      colorResult = await dominantColor(body.imageUrl);
    }
    
    // Get top labels for telemetry
    const yolosTopLabels = detections
      .sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
      .slice(0, 3)
      .map((d: any) => d.label || '')
      .filter(Boolean);
    
    const proposedTitle = colorResult.name && category 
      ? `${colorResult.name} ${category.toLowerCase().replace(/s$/, '')}`  // Remove plural
      : category || "Item";
    
    return new Response(JSON.stringify({
      status: 'success',
      model: 'valentinafeve/yolos-fashionpedia',
      latencyMs,
      result: detections,
      yolosTopLabels,
      bbox,
      category,
      colorHex: colorResult.hex,
      colorName: colorResult.name,
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
