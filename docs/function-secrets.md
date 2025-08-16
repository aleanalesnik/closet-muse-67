# Function Secrets Configuration

To configure the Edge Functions, add these secrets in Supabase Dashboard:

**Edge Functions → Settings/Secrets**

For each function (items-process, sila-model-debugger), add these secrets and then **Redeploy**:

```
SUPABASE_URL = YOUR_SUPABASE_URL
SUPABASE_ANON_KEY = YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE = YOUR_SERVICE_ROLE (functions only; never in client)
HF_ENDPOINT_URL = YOUR_HUGGING_FACE_YOLOS_ENDPOINT
HF_TOKEN = YOUR_HUGGING_FACE_API_TOKEN
```

**Note:** The SERVICE_ROLE key should only be used in Edge Functions, never in client-side code.