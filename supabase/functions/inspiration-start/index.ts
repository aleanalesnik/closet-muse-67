import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const auth = req.headers.get("Authorization") ?? "";
    const jwt = auth.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ ok:false, error:"Unauthorized" }), { status:401, headers:{...cors,"Content-Type":"application/json"}});
    }
    const owner = userData.user.id;

    const { imagePath } = await req.json();
    if (!imagePath) {
      return new Response(JSON.stringify({ ok:false, error:"imagePath required" }), { status:400, headers:{...cors,"Content-Type":"application/json"}});
    }

    const { data, error } = await supabase
      .from("inspiration_queries")
      .insert({ owner, image_path: imagePath, status: "queued" })
      .select("id")
      .single();
    if (error) throw error;

    return new Response(JSON.stringify({ ok:true, queryId: data.id }), { headers:{...cors,"Content-Type":"application/json"}});
  } catch (e:any) {
    return new Response(JSON.stringify({ ok:false, error:String(e?.message ?? e) }), { status:500, headers:{...cors,"Content-Type":"application/json"}});
  }
});