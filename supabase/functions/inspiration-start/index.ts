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
  const token = Deno.env.get("INFERENCE_API_TOKEN");
  const name = Deno.env.get("INFERENCE_AUTH_HEADER") || "Authorization";
  const prefix = Deno.env.get("INFERENCE_AUTH_PREFIX") || "Bearer";
  if (!token) throw new Error("Missing INFERENCE_API_TOKEN");
  return { [name]: prefix ? `${prefix} ${token}` : token, "Content-Type": "application/json" };
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { imagePath } = await req.json();
    if (!imagePath) {
      return new Response(JSON.stringify({ ok: false, error: "imagePath required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const owner = String(imagePath).split("/")[0] || null;
    if (!owner) throw new Error("Could not derive owner from imagePath");

    const supabase = getServiceClient();
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
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});