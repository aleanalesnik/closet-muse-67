import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

// Note: inspiration-start doesn't need authentication headers since it only creates DB records
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const { imagePath, debug } = await req.json();
    console.log("inspiration-start called with:", { imagePath, debug });

    if (!imagePath) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: "Missing imagePath" 
      }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const supabase = getServiceClient();

    // Get current user from JWT (passed via Authorization header from client)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: "Missing authorization header" 
      }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    // Extract JWT token and get user info
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(JSON.stringify({ 
        ok: false, 
        error: "Invalid authentication" 
      }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    console.log("Creating inspiration query for user:", user.id);

    // Create inspiration query record
    const { data: queryData, error: insertError } = await supabase
      .from("inspiration_queries")
      .insert({
        owner: user.id,
        image_path: imagePath,
        status: "queued"
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to create inspiration query:", insertError);
      return new Response(JSON.stringify({ 
        ok: false, 
        error: insertError.message 
      }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const queryId = queryData.id;
    console.log("Created inspiration query:", queryId);

    return new Response(JSON.stringify({ 
      ok: true, 
      queryId,
      status: "queued"
    }), {
      headers: { ...cors, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("inspiration-start error:", error);
    return new Response(JSON.stringify({ 
      ok: false, 
      error: String(error?.message ?? error) 
    }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" }
    });
  }
});