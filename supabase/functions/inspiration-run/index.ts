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

function rand(min: number, max: number) { return Math.random() * (max - min) + min; }

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

    // Find a queued query if none provided
    let queryId: string | null = body?.queryId ?? null;
    if (!queryId) {
      const { data: q } = await supabase
        .from("inspiration_queries")
        .select("id")
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!q) return new Response(null, { status: 204, headers: cors });
      queryId = q.id;
    }

    await supabase.from("inspiration_queries").update({ status: "processing" }).eq("id", queryId);

    // STUB: write 2 fake detections (useful until real inference is wired)
    const dim = Number(Deno.env.get("EMBEDDING_DIM") ?? 512);
    const mkVec = () => Array.from({ length: dim }, () => Math.random());
    const fake = [
      { bbox: [rand(0.1, 0.3), rand(0.1, 0.3), rand(0.4, 0.6), rand(0.5, 0.8)], category: "top" },
      { bbox: [rand(0.4, 0.5), rand(0.2, 0.35), rand(0.8, 0.95), rand(0.9, 0.98)], category: "bottom" },
    ];
    for (const f of fake) {
      await supabase.from("inspiration_detections").insert({
        query_id: queryId, bbox: f.bbox, category: f.category, mask_path: null, crop_path: null, embedding: mkVec(),
      });
    }
    await supabase.from("inspiration_queries").update({ status: "done" }).eq("id", queryId);

    return new Response(JSON.stringify({ ok: true, queryId, detections: 2, mode: "stub" }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    // Try to mark errored queries
    try {
      const cloned = await req.clone().json().catch(() => ({}));
      if (cloned?.queryId) {
        const supabase = getServiceClient();
        await supabase.from("inspiration_queries").update({ status: "error", error: String(e?.message ?? e) })
          .eq("id", cloned.queryId);
      }
    } catch {}
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});