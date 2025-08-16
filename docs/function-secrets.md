# Function Secrets Configuration

To configure the Edge Functions, add these secrets in Supabase Dashboard:

**Edge Functions → Settings/Secrets**

For the sila-model-debugger function, add these secrets and then **Redeploy**:

```
HF_ENDPOINT_URL = YOUR_HUGGING_FACE_YOLOS_ENDPOINT
HF_TOKEN = YOUR_HUGGING_FACE_API_TOKEN
```

**Note:** The SERVICE_ROLE key should only be used in Edge Functions, never in client-side code.