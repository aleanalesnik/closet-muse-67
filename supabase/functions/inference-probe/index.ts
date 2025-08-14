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
  const authHeader = Deno.env.get("FASHION_AUTH_HEADER") || "Authorization";
  const authPrefix = Deno.env.get("FASHION_AUTH_PREFIX") || "Bearer";
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
    // Get the configured endpoints from environment variables (cleaned up for YOLOS)
    const endpoints = {
      FASHION_SEG: Deno.env.get("FASHION_SEG_URL"),
      CAPTION: Deno.env.get("CAPTION_URLS")?.split(",")[0] || Deno.env.get("CAPTION_URL"), // First in chain
      EMBED: Deno.env.get("EMBED_URL")
    };

    const headers = buildInferenceHeaders();
    const fashionHeaders = buildFashionHeaders();
    
    console.log(`[PROBE] URLs configured:`, Object.fromEntries(
      Object.entries(endpoints).map(([key, value]) => [key, !!value])
    ));

    console.log(`[PROBE] Starting endpoint health checks...`);

    // Probe FASHION_SEG separately with YOLOS test payload
    const probePromises = [];
    
    if (endpoints.FASHION_SEG) {
      const fHeaders = buildFashionHeaders();
      probePromises.push(
        (async () => {
          const name = 'FASHION_SEG';
          const url = endpoints.FASHION_SEG!;
          try {
            // Test with minimal base64 payload for YOLOS
            const response = await fetch(url, {
              method: "POST",
              headers: { ...fHeaders, "Content-Type": "application/json", "Accept": "application/json" },
              body: JSON.stringify({ inputs: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" }) // 1px transparent PNG
            });
            
            const urlWithoutToken = url.replace(/[\?&].*$/, '');
            console.log(`[PROBE] ${name}: ${response.status} ${urlWithoutToken}`);
            
            return [name, {
              name,
              url: urlWithoutToken,
              ok: response.ok || response.status === 400, // 400 is fine for probe, means endpoint is alive
              status: response.status,
              error: response.ok || response.status === 400 ? null : `HTTP ${response.status}`
            }];
          } catch (error) {
            const urlWithoutToken = url.replace(/[\?&].*$/, '');
            console.log(`[PROBE] ${name}: ERROR ${urlWithoutToken} - ${error.message}`);
            return [name, {
              name,
              url: urlWithoutToken,
              ok: false,
              status: 0,
              error: error.message
            }];
          }
        })()
      );
    }

    // Probe other configured endpoints (CAPTION and EMBED only)
    Object.entries(endpoints)
      .filter(([name, url]) => name !== 'FASHION_SEG' && url) // Skip FASHION_SEG, handle separately
      .forEach(([name, url]) => {
        const endpointHeaders = buildInferenceHeaders(); // Use inference headers for caption/embed
        probePromises.push(
          probeEndpoint(url!, name, endpointHeaders).then(result => [name, result])
        );
      });

    console.log(`[PROBE] Probing ${probePromises.length} total endpoints...`);

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