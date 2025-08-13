import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const body = (await req.json().catch(() => ({}))) as { queryId?: string; owner?: string };
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE")!,
    );

    // If queryId not provided, pick the oldest queued for this owner (if owner given)
    let queryId = body.queryId as string | undefined;
    if (!queryId) {
      const { data: q } = await supabase
        .from("inspiration_queries")
        .select("id")
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!q) return new Response(null, { status: 204, headers: cors }); // nothing to do
      queryId = q.id;
    }

    // mark processing
    await supabase.from("inspiration_queries").update({ status: "processing" }).eq("id", queryId);

    // STUB path: generate 2 fake detections + embeddings
    if (Deno.env.get("STUB_MODE") === "1") {
      const dim = Number(Deno.env.get("EMBEDDING_DIM") ?? 512);
      const mkVec = () => Array.from({ length: dim }, () => Math.random());
      const fake = [
        { bbox: [rand(0.1, 0.3), rand(0.1, 0.3), rand(0.4, 0.6), rand(0.5, 0.8)], category: "top" },
        { bbox: [rand(0.4, 0.5), rand(0.2, 0.35), rand(0.8, 0.95), rand(0.9, 0.98)], category: "bottom" },
      ];

      for (const f of fake) {
        await supabase.from("inspiration_detections").insert({
          query_id: queryId,
          bbox: f.bbox,
          category: f.category,
          mask_path: null,
          crop_path: null,
          embedding: mkVec(),
        });
      }

      await supabase.from("inspiration_queries").update({ status: "done" }).eq("id", queryId);

      return new Response(JSON.stringify({ ok: true, queryId, detections: 2, mode: "stub" }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // --- Real path (placeholder scaffolding) ---
    // TODO:
    // 1) Download query image from storage using image_path
    // 2) Call OPEN_VOCAB_DETECT to get boxes/labels
    // 3) For each box: SEGMENT -> mask/crop (save to storage)
    // 4) EMBED crop -> store vector in inspiration_detections
    // 5) Mark query done or error
    await supabase.from("inspiration_queries").update({ status: "done" }).eq("id", queryId);

    return new Response(JSON.stringify({ ok: true, queryId, mode: "real" }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    // on error mark query error if we have an id
    try {
      const msg = String(e?.message ?? e);
      const parsed = await (req.clone()?.json?.().catch(() => ({})));
      if (parsed?.queryId) {
        const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE")!);
        await supabase.from("inspiration_queries").update({ status: "error", error: msg }).eq("id", parsed.queryId);
      }
    } catch {}
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" }
    });
  }
});