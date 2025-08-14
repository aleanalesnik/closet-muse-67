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
  const authHeader = Deno.env.get("INFERENCE_AUTH_HEADER") || "Authorization";
  const authPrefix = Deno.env.get("INFERENCE_AUTH_PREFIX") || "Bearer";
  const apiToken = Deno.env.get("INFERENCE_API_TOKEN");
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  
  if (apiToken) {
    headers[authHeader] = authPrefix ? `${authPrefix} ${apiToken}` : apiToken;
  }
  
  return headers;
}

function buildFashionHeaders() {
  const authHeader = Deno.env.get("FASHION_AUTH_HEADER") || "x-api-key";
  const authPrefix = Deno.env.get("FASHION_AUTH_PREFIX") || "";
  const apiToken = Deno.env.get("FASHION_API_TOKEN");
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json"
  };
  
  if (apiToken) {
    headers[authHeader] = authPrefix ? `${authPrefix} ${apiToken}` : apiToken;
  }
  
  return headers;
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
    // Get the configured endpoints from environment variables
    const endpoints = {
      DETECT: Deno.env.get("DETECT_URL"),
      SEGMENT: Deno.env.get("SEGMENT_URL"), 
      EMBED: Deno.env.get("EMBED_URL"),
      CAPTION: Deno.env.get("CAPTION_URL"),
      CLASSIFY: Deno.env.get("CLASSIFY_URL"),
      FASHION_SEG: Deno.env.get("FASHION_SEG_URL")
    };

    const headers = buildInferenceHeaders();
    const fashionHeaders = buildFashionHeaders();
    
    console.log(`[PROBE] URLs configured:`, Object.fromEntries(
      Object.entries(endpoints).map(([key, value]) => [key, !!value])
    ));

    console.log(`[PROBE] Starting endpoint health checks...`);

    // Probe all configured endpoints concurrently
    const probePromises = Object.entries(endpoints)
      .filter(([_, url]) => url) // Only probe configured endpoints
      .map(async ([name, url]) => {
        const endpointHeaders = name === 'FASHION_SEG' ? fashionHeaders : headers;
        const result = await probeEndpoint(url!, name, endpointHeaders);
        return [name, result];
      });

    const probeResults = await Promise.all(probePromises);
    const results = Object.fromEntries(probeResults);

    if (probePromises.length === 0) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: "No inference endpoints configured",
        timestamp: new Date().toISOString()
      }), {
        status: 400, 
        headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    // Check if all probed endpoints are healthy
    const probedEndpoints = Object.values(results);
    const allHealthy = probedEndpoints.length > 0 && probedEndpoints.every((r: any) => r.ok);
    const responseStatus = probedEndpoints.length === 0 ? 404 : (allHealthy ? 200 : 207);

    console.log(`[PROBE] Complete - ${probedEndpoints.length} endpoints checked, ${probedEndpoints.filter((r: any) => r.ok).length} healthy`);
    
    return new Response(JSON.stringify({
      status: allHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      endpoints: results
    }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
      status: responseStatus
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