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
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { imagePath } = await req.json();

    console.log(`Starting inspiration query for image ${imagePath}`);

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Authentication required');
    }

    // Insert inspiration query
    const { data: query, error: insertError } = await supabase
      .from('inspiration_queries')
      .insert({
        owner: user.id,
        image_path: imagePath,
        status: 'queued'
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to create inspiration query:', insertError);
      throw new Error(`Failed to create query: ${insertError.message}`);
    }

    console.log(`Created inspiration query ${query.id}`);

    return new Response(
      JSON.stringify({ 
        queryId: query.id,
        status: 'queued' 
      }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Error in inspiration-start:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message 
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