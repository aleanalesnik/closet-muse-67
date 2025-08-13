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
      Deno.env.get("SUPABASE_SERVICE_ROLE")!
    );

    const { queryId } = await req.json();

    console.log(`Processing inspiration query ${queryId}`);

    // Get the query
    const { data: query, error: queryError } = await supabase
      .from('inspiration_queries')
      .select()
      .eq('id', queryId)
      .single();

    if (queryError) {
      throw new Error(`Query not found: ${queryError.message}`);
    }

    // Mark as processing
    await supabase
      .from('inspiration_queries')
      .update({ status: 'processing' })
      .eq('id', queryId);

    // 1. Download inspiration image
    const { data: imageData, error: downloadError } = await supabase.storage
      .from('sila')
      .download(query.image_path);

    if (downloadError) {
      throw new Error(`Failed to download image: ${downloadError.message}`);
    }

    const imageBuffer = await imageData.arrayBuffer();
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));

    // 2. Open-vocab detect
    const inferenceBaseUrl = Deno.env.get('INFERENCE_BASE_URL')!;
    const apiToken = Deno.env.get('INFERENCE_API_TOKEN')!;

    const detectResponse = await fetch(`${inferenceBaseUrl}${Deno.env.get('OPEN_VOCAB_DETECT_ENDPOINT')}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: base64Image,
        format: 'base64',
        categories: ['shirt', 'pants', 'dress', 'shoes', 'jacket', 'bag', 'accessories']
      }),
    });

    if (!detectResponse.ok) {
      throw new Error(`Open-vocab detection failed: ${detectResponse.status}`);
    }

    const detectData = await detectResponse.json();
    const detections = detectData.detections || [];

    console.log(`Found ${detections.length} items in inspiration image`);

    // Process each detection
    for (let i = 0; i < detections.length; i++) {
      const detection = detections[i];
      const bbox = detection.bbox;
      const category = detection.category;

      // 3. Segment detected item
      const segmentResponse = await fetch(`${inferenceBaseUrl}${Deno.env.get('SEGMENT_ENDPOINT')}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: base64Image,
          bbox: bbox,
          format: 'base64'
        }),
      });

      if (!segmentResponse.ok) {
        console.error(`Segmentation failed for detection ${i}`);
        continue;
      }

      const segmentData = await segmentResponse.json();
      const cropBase64 = segmentData.crop;
      const maskBase64 = segmentData.mask;

      // 4. Embed cropped item
      const embedResponse = await fetch(`${inferenceBaseUrl}${Deno.env.get('EMBED_ENDPOINT')}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: cropBase64,
          format: 'base64'
        }),
      });

      if (!embedResponse.ok) {
        console.error(`Embedding failed for detection ${i}`);
        continue;
      }

      const embedData = await embedResponse.json();
      const embedding = embedData.embedding;

      // 5. Find similar items in user's closet using cosine similarity
      const { data: similarItems, error: searchError } = await supabase.rpc('match_items', {
        query_embedding: embedding,
        match_threshold: 0.7,
        match_count: 5,
        owner_id: query.owner
      });

      if (searchError) {
        console.error(`Search failed for detection ${i}:`, searchError);
        continue;
      }

      // Save crop and mask
      const userId = query.owner;
      const detectionUuid = crypto.randomUUID();
      
      const cropPath = `${userId}/inspo/${detectionUuid}-crop.png`;
      const maskPath = `${userId}/inspo/${detectionUuid}-mask.png`;

      // Upload crop
      const cropBuffer = Uint8Array.from(atob(cropBase64), c => c.charCodeAt(0));
      await supabase.storage.from('sila').upload(cropPath, cropBuffer, {
        contentType: 'image/png'
      });

      // Upload mask
      const maskBuffer = Uint8Array.from(atob(maskBase64), c => c.charCodeAt(0));
      await supabase.storage.from('sila').upload(maskPath, maskBuffer, {
        contentType: 'image/png'
      });

      // 6. Insert detection result
      const { error: insertError } = await supabase
        .from('inspiration_detections')
        .insert({
          query_id: queryId,
          bbox: bbox,
          category: category,
          embedding: embedding,
          crop_path: cropPath,
          mask_path: maskPath
        });

      if (insertError) {
        console.error(`Failed to save detection ${i}:`, insertError);
      }

      console.log(`Processed detection ${i + 1}/${detections.length} with ${similarItems?.length || 0} matches`);
    }

    // Mark query as completed
    await supabase
      .from('inspiration_queries')
      .update({ status: 'completed' })
      .eq('id', queryId);

    console.log(`Completed inspiration query ${queryId}`);

    return new Response(
      JSON.stringify({ 
        ok: true,
        detectionsCount: detections.length 
      }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Error in inspiration-run:', error);
    
    // Mark query as failed
    const { queryId } = await req.json().catch(() => ({}));
    if (queryId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE")!
      );
      await supabase
        .from('inspiration_queries')
        .update({ 
          status: 'failed',
          error: error.message 
        })
        .eq('id', queryId);
    }

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