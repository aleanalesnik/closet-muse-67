import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const { imagePath } = await req.json();
    if (!imagePath || typeof imagePath !== "string") {
      return new Response(JSON.stringify({ ok: false, error: "imagePath required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    // owner = first segment of path "<owner>/inspo/xxx.jpg"
    const owner = imagePath.split("/")[0];
    if (!owner || owner.length < 10) {
      return new Response(JSON.stringify({ ok: false, error: "Could not derive owner from imagePath" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE")!,
    );

    const { data, error } = await supabase
      .from("inspiration_queries")
      .insert({ owner, image_path: imagePath, status: "queued" })
      .select("id")
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, queryId: data.id }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" }
    });
  }
});