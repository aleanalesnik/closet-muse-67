# Function Secrets Configuration

To configure the Edge Functions, add these secrets in Supabase Dashboard:

**Edge Functions → Settings/Secrets**

For each function (items-process, inspiration-start, inspiration-run), add these secrets and then **Redeploy**:

```
SUPABASE_URL = YOUR_SUPABASE_URL
SUPABASE_ANON_KEY = YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE = YOUR_SERVICE_ROLE (functions only; never in client)
INFERENCE_BASE_URL (placeholder OK)
INFERENCE_API_TOKEN (placeholder OK)
DETECT_ENDPOINT
SEGMENT_ENDPOINT
EMBED_ENDPOINT
OPEN_VOCAB_DETECT_ENDPOINT
```

**Note:** The SERVICE_ROLE key should only be used in Edge Functions, never in client-side code.