import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { itemId, imagePath } = await req.json();

    console.log(`Processing item ${itemId} with image ${imagePath}`);

    // 1. Download image from storage
    const { data: imageData, error: downloadError } = await supabase.storage
      .from('sila')
      .download(imagePath);

    if (downloadError) {
      console.error('Failed to download image:', downloadError);
      throw new Error(`Failed to download image: ${downloadError.message}`);
    }

    const imageBuffer = await imageData.arrayBuffer();
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));

    // 2. Call ML inference endpoints
    const inferenceBaseUrl = Deno.env.get('INFERENCE_BASE_URL')!;
    const apiToken = Deno.env.get('INFERENCE_API_TOKEN')!;
    const authHeader = Deno.env.get('INFERENCE_AUTH_HEADER') || 'Authorization';
    const authPrefix = Deno.env.get('INFERENCE_AUTH_PREFIX') || 'Bearer';
    const authValue = authPrefix ? `${authPrefix} ${apiToken}` : apiToken;

    // DETECT - get bounding boxes
    const detectResponse = await fetch(`${inferenceBaseUrl}${Deno.env.get('DETECT_ENDPOINT')}`, {
      method: 'POST',
      headers: {
        [authHeader]: authValue,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: base64Image,
        format: 'base64'
      }),
    });

    if (!detectResponse.ok) {
      const errorText = await detectResponse.text().catch(() => 'Unknown error');
      console.error(`Inference error: ${detectResponse.status} - ${errorText.slice(0, 200)}`);
      throw new Error(`Detection failed: ${detectResponse.status}`);
    }

    const detectData = await detectResponse.json();
    const boxes = detectData.boxes || [];

    if (boxes.length === 0) {
      throw new Error('No objects detected in image');
    }

    // Use the first detected box
    const bbox = boxes[0];

    // SEGMENT - get mask
    const segmentResponse = await fetch(`${inferenceBaseUrl}${Deno.env.get('SEGMENT_ENDPOINT')}`, {
      method: 'POST',
      headers: {
        [authHeader]: authValue,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: base64Image,
        bbox: bbox,
        format: 'base64'
      }),
    });

    if (!segmentResponse.ok) {
      throw new Error(`Segmentation failed: ${segmentResponse.status}`);
    }

    const segmentData = await segmentResponse.json();
    const maskBase64 = segmentData.mask;
    const cropBase64 = segmentData.crop;

    // Compute dominant color (simplified - using center pixel of crop)
    const colorHex = '#8B5A2B'; // Placeholder - would extract from crop
    const colorName = 'brown';

    // Upload mask and crop to storage
    const userId = imagePath.split('/')[0];
    const itemUuid = imagePath.split('/')[2].split('.')[0];
    
    const maskPath = `${userId}/items/${itemUuid}-mask.png`;
    const cropPath = `${userId}/items/${itemUuid}-crop.png`;

    // Upload mask
    const maskBuffer = Uint8Array.from(atob(maskBase64), c => c.charCodeAt(0));
    await supabase.storage.from('sila').upload(maskPath, maskBuffer, {
      contentType: 'image/png',
      upsert: true
    });

    // Upload crop
    const cropBuffer = Uint8Array.from(atob(cropBase64), c => c.charCodeAt(0));
    await supabase.storage.from('sila').upload(cropPath, cropBuffer, {
      contentType: 'image/png',
      upsert: true
    });

    // 3. EMBED - get embedding vector
    const embedResponse = await fetch(`${inferenceBaseUrl}${Deno.env.get('EMBED_ENDPOINT')}`, {
      method: 'POST',
      headers: {
        [authHeader]: authValue,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: cropBase64,
        format: 'base64'
      }),
    });

    if (!embedResponse.ok) {
      throw new Error(`Embedding failed: ${embedResponse.status}`);
    }

    const embedData = await embedResponse.json();
    const embedding = embedData.embedding;

    // 4. Upsert item_embeddings
    const { error: embeddingError } = await supabase
      .from('item_embeddings')
      .upsert({
        item_id: itemId,
        embedding: embedding
      });

    if (embeddingError) {
      console.error('Failed to upsert embedding:', embeddingError);
      throw new Error(`Failed to save embedding: ${embeddingError.message}`);
    }

    // 5. Update items table
    const category = detectData.category || 'clothing';
    const subcategory = detectData.subcategory || 'item';

    const { error: updateError } = await supabase
      .from('items')
      .update({
        category,
        subcategory,
        color_hex: colorHex,
        color_name: colorName,
        mask_path: maskPath,
      })
      .eq('id', itemId);

    if (updateError) {
      console.error('Failed to update item:', updateError);
      throw new Error(`Failed to update item: ${updateError.message}`);
    }

    console.log(`Successfully processed item ${itemId}`);

    return new Response(
      JSON.stringify({ ok: true, embedding: embedding.length }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Error in items-process:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        ok: false 
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});