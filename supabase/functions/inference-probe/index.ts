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

async function probeEndpoint(url: string, name: string, headers: Record<string, string>) {
  const urlWithoutToken = url.replace(/[\?&].*$/, ''); // Remove query params that might contain tokens
  
  try {
    // Try HEAD first (lightweight)
    let response = await fetch(url, {
      method: "HEAD",
      headers
    });
    
    // If HEAD not supported (405), try lightweight GET
    if (response.status === 405) {
      console.log(`[PROBE] ${name}: HEAD not supported, trying GET`);
      response = await fetch(url, {
        method: "GET",
        headers,
        body: JSON.stringify({ probe: true }) // Minimal body to test endpoint
      });
    }
    
    console.log(`[PROBE] ${name}: ${response.status} ${urlWithoutToken}`);
    
    return {
      name,
      url: urlWithoutToken,
      ok: response.ok,
      status: response.status,
      error: response.ok ? null : `HTTP ${response.status}`
    };
  } catch (error) {
    console.log(`[PROBE] ${name}: ERROR ${urlWithoutToken} - ${error.message}`);
    
    return {
      name,
      url: urlWithoutToken,
      ok: false,
      status: 0,
      error: error.message
    };
  }
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, HEAD, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const DETECT_URL = Deno.env.get("DETECT_URL");
    const SEGMENT_URL = Deno.env.get("SEGMENT_URL");
    const EMBED_URL = Deno.env.get("EMBED_URL");
    const CAPTION_URL = Deno.env.get("CAPTION_URL");
    const CLASSIFY_URL = Deno.env.get("CLASSIFY_URL");
    
    console.log(`[PROBE] URLs configured:`, {
      DETECT_URL: !!DETECT_URL,
      SEGMENT_URL: !!SEGMENT_URL, 
      EMBED_URL: !!EMBED_URL,
      CAPTION_URL: !!CAPTION_URL,
      CLASSIFY_URL: !!CLASSIFY_URL
    });

    const infHeaders = buildInferenceHeaders();
    console.log(`[PROBE] Starting endpoint health checks...`);

    // Probe all configured endpoints in parallel
    const probes: Promise<any>[] = [];
    
    if (DETECT_URL) probes.push(probeEndpoint(DETECT_URL, "DETECT", infHeaders));
    if (EMBED_URL) probes.push(probeEndpoint(EMBED_URL, "EMBED", infHeaders));
    if (SEGMENT_URL) probes.push(probeEndpoint(SEGMENT_URL, "SEGMENT", infHeaders));
    if (CAPTION_URL) probes.push(probeEndpoint(CAPTION_URL, "CAPTION", infHeaders));
    if (CLASSIFY_URL) probes.push(probeEndpoint(CLASSIFY_URL, "CLASSIFY", infHeaders));

    if (probes.length === 0) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: "No inference endpoints configured",
        timestamp: new Date().toISOString()
      }), {
        status: 400, 
        headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const results = await Promise.all(probes);
    
    // Calculate overall status
    const allOk = results.every(r => r.ok);
    const hasErrors = results.some(r => !r.ok);
    
    console.log(`[PROBE] Complete - ${results.length} endpoints checked, ${results.filter(r => r.ok).length} healthy`);
    
    return new Response(JSON.stringify({
      ok: allOk,
      timestamp: new Date().toISOString(),
      summary: {
        total: results.length,
        healthy: results.filter(r => r.ok).length,
        failed: results.filter(r => !r.ok).length
      },
      endpoints: results
    }), {
      headers: { ...cors, "Content-Type": "application/json" },
      status: hasErrors ? 207 : 200 // 207 Multi-Status for mixed results
    });
    
  } catch (error) {
    console.error("inference-probe error:", error);
    return new Response(JSON.stringify({ 
      ok: false, 
      error: String(error?.message ?? error),
      timestamp: new Date().toISOString()
    }), {
      status: 500, 
      headers: { ...cors, "Content-Type": "application/json" }
    });
  }
});