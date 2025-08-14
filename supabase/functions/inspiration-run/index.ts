import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE");
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

function uint8ToBase64(u8: Uint8Array) {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < u8.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return btoa(binary);
}

async function extractDominantColor(base64Image: string): Promise<{ colorName: string; colorHex: string }> {
  try {
    const base64Data = base64Image.replace(/^data:image\/[^;]+;base64,/, '');
    const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    
    const isPNG = imageBytes[0] === 0x89 && imageBytes[1] === 0x50;
    const isJPEG = imageBytes[0] === 0xFF && imageBytes[1] === 0xD8;
    
    if (!isPNG && !isJPEG) {
      throw new Error("Unsupported image format for color extraction");
    }
    
    let r = 0, g = 0, b = 0, samples = 0;
    
    for (let i = 100; i < imageBytes.length - 2; i += 100) {
      r += imageBytes[i];
      g += imageBytes[i + 1];  
      b += imageBytes[i + 2];
      samples++;
    }
    
    if (samples === 0) {
      throw new Error("No color samples extracted");
    }
    
    r = Math.round(r / samples);
    g = Math.round(g / samples);
    b = Math.round(b / samples);
    
    const colorHex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    const colorName = mapRgbToColorName(r, g, b);
    
    return { colorName, colorHex };
  } catch (error) {
    console.warn("Color extraction failed:", error.message);
    return { colorName: "brown", colorHex: "#8B5A2B" };
  }
}

function mapRgbToColorName(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = (r + g + b) / 3;
  const saturation = max === 0 ? 0 : (max - min) / max;
  
  if (saturation < 0.3) {
    if (brightness < 60) return "black";
    if (brightness < 120) return "gray";
    if (brightness < 200) return "light gray";
    return "white";
  }
  
  if (r > g && r > b) {
    if (g > b * 1.5) return "yellow";
    if (b > g * 1.2) return "purple";
    return "red";
  }
  
  if (g > r && g > b) {
    if (r > b * 1.2) return "yellow";
    if (b > r * 1.2) return "teal";
    return "green";
  }
  
  if (b > r && b > g) {
    if (r > g * 1.2) return "purple";
    if (g > r * 1.2) return "teal";
    return "blue";
  }
  
  if (r > 150 && g > 100 && b < 100) return "orange";
  if (r > 100 && g < 100 && b > 100) return "purple";
  if (r < 100 && g > 100 && b > 100) return "cyan";
  
  return "brown";
}

// YOLOS label mapping to our taxonomy
function mapFashionLabel(label: string): { category: string; subcategory: string } {
  const s = label.toLowerCase();
  
  if (["handbag", "bag", "tote bag", "shoulder bag"].some(x => s.includes(x))) 
    return { category: "bag", subcategory: "handbag" };
  if (["backpack"].some(x => s.includes(x))) 
    return { category: "bag", subcategory: "backpack" };
  if (["belt"].some(x => s.includes(x))) 
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

// YOLOS object detection for multi-item images
async function createRealDetections(queryId: string, imagePath: string, supabase: any) {
  console.log("Creating YOLOS fashion detections for query:", queryId, "image:", imagePath);
  
  const FSEG_URL = Deno.env.get("FASHION_SEG_URL");
  if (!FSEG_URL) {
    console.log("No FASHION_SEG_URL configured, creating stub detections");
    return createStubDetections(queryId, supabase);
  }

  try {
    // Download image from storage
    const { data: downloadData, error: downloadError } = await supabase.storage
      .from('sila')
      .download(imagePath);

    if (downloadError) {
      throw new Error(`Failed to download image: ${downloadError.message}`);
    }

    const imageBuffer = new Uint8Array(await downloadData.arrayBuffer());
    const base64Image = uint8ToBase64(imageBuffer);

    // Call YOLOS detection
    const headers = buildFashionHeaders();
    
    // Try raw base64 first
    let response = await fetch(FSEG_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ inputs: base64Image })
    });

    // Fallback to data URL format if 415/400
    if (response.status === 415 || response.status === 400) {
      console.log("Retrying YOLOS with data URL format...");
      response = await fetch(FSEG_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ inputs: `data:image/png;base64,${base64Image}` })
      });
    }

    if (!response.ok) {
      console.log("YOLOS detection failed, using stub detections");
      return createStubDetections(queryId, supabase);
    }

    const result = await response.json();
    
    if (!Array.isArray(result) || result.length === 0) {
      console.log("No YOLOS detections found, using stub detections");
      return createStubDetections(queryId, supabase);
    }

    // Filter and limit detections (top 6, score >= 0.35)
    const maxDetections = 6;
    const filteredDetections = result
      .filter(pred => pred.score >= 0.35)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxDetections);

    console.log(`Found ${filteredDetections.length} YOLOS detections (from ${result.length} total)`);

    const insertData = [];
    const userId = imagePath.split('/')[0]; // Extract user ID from path

    for (let i = 0; i < filteredDetections.length; i++) {
      const pred = filteredDetections[i];
      
      // Map YOLOS label to our taxonomy
      const { category, subcategory } = mapFashionLabel(pred.label);
      
      // Extract bbox coordinates
      const bbox = [pred.box.xmin, pred.box.ymin, pred.box.xmax, pred.box.ymax];

      // Extract color from full image (will upgrade to bbox crop later)
      const colorData = await extractDominantColor(base64Image);

      // Try to get embedding if EMBED_URL is configured (use full image for now)
      let embedding = null;
      const EMBED_URL = Deno.env.get("EMBED_URL");
      
      if (EMBED_URL) {
        try {
          const embedHeaders = buildInferenceHeaders();
          const embedResponse = await fetch(EMBED_URL, {
            method: "POST",
            headers: embedHeaders,
            body: JSON.stringify({ inputs: base64Image })
          });

          if (embedResponse.ok) {
            const embedResult = await embedResponse.json();
            embedding = Array.isArray(embedResult) ? embedResult[0] : embedResult;
            if (!Array.isArray(embedding)) embedding = null;
          }
        } catch (embedError) {
          console.log("Embedding failed for detection", i, ":", embedError.message);
        }
      }

      insertData.push({
        query_id: queryId,
        bbox,
        category,
        subcategory,
        confidence: pred.score,
        color_name: colorData.colorName,
        color_hex: colorData.colorHex,
        crop_path: null, // YOLOS doesn't provide crops yet
        mask_path: null, // YOLOS doesn't provide masks
        embedding
      });
    }

    // Insert all detections
    const { data, error } = await supabase
      .from('inspiration_detections')
      .insert(insertData)
      .select();

    if (error) {
      throw new Error(`Failed to insert detections: ${error.message}`);
    }

    console.log(`Created ${data.length} YOLOS fashion detections`);
    return data;

  } catch (error) {
    console.error("Error in createRealDetections:", error);
    console.log("Falling back to stub detections");
    return createStubDetections(queryId, supabase);
  }
}

// Stub detection generation for fallback
async function createStubDetections(queryId: string, supabase: any) {
  console.log("Creating stub detections for query:", queryId);
  
  const stubDetections = [
    {
      query_id: queryId,
      bbox: [100, 150, 300, 450],
      category: "top",
      crop_path: null,
      mask_path: null,
      embedding: null
    },
    {
      query_id: queryId,
      bbox: [120, 460, 280, 600],
      category: "bottom", 
      crop_path: null,
      mask_path: null,
      embedding: null
    }
  ];

  const { data, error } = await supabase
    .from('inspiration_detections')
    .insert(stubDetections)
    .select();

  if (error) {
    throw new Error(`Failed to create stub detections: ${error.message}`);
  }

  console.log("Created stub detections:", data);
  return data;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  
  try {
    const body = await req.json().catch(() => ({}));
    const supabase = getServiceClient();
    
    console.log("Fashion segmentation mode: Using real detections");

    // Find a queued query if none provided
    let queryId: string | null = body?.queryId ?? null;
    let imagePath: string | null = null;
    
    if (!queryId) {
      const { data: q } = await supabase
        .from("inspiration_queries")
        .select("id, image_path")
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!q) return new Response(null, { status: 204, headers: cors });
      queryId = q.id;
      imagePath = q.image_path;
    } else {
      // Get image path for provided query
      const { data: q } = await supabase
        .from("inspiration_queries")
        .select("image_path")
        .eq("id", queryId)
        .single();
      if (!q) throw new Error("Query not found");
      imagePath = q.image_path;
    }

    await supabase.from("inspiration_queries").update({ status: "processing" }).eq("id", queryId);

    // Use real fashion segmentation (with fallback to stubs if needed)
    console.log("Using fashion segmentation");
    let detections = await createRealDetections(queryId, imagePath, supabase);

    await supabase.from("inspiration_queries").update({ status: "done" }).eq("id", queryId);

    return new Response(JSON.stringify({ 
      ok: true, 
      queryId, 
      detections: Array.isArray(detections) ? detections.length : detections,
      mode: "fashion"
    }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
    
  } catch (e) {
    // Try to mark errored queries
    try {
      const cloned = await req.clone().json().catch(() => ({}));
      if (cloned?.queryId) {
        const supabase = getServiceClient();
        await supabase.from("inspiration_queries").update({ 
          status: "error", 
          error: String(e?.message ?? e) 
        }).eq("id", cloned.queryId);
      }
    } catch {}
    
    console.error("inspiration-run error:", e);
    return new Response(JSON.stringify({ 
      ok: false, 
      error: String(e?.message ?? e) 
    }), {
      status: 500, 
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});