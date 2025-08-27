# Function Secrets Configuration

To configure the Edge Functions, add these secrets in Supabase Dashboard:

**Edge Functions → Settings/Secrets**

For the sila-model-debugger function, add these secrets and then **Redeploy**:

## Required Secrets

### Core Supabase Configuration

#### 1. SUPABASE_URL
**Represents:** The base REST/Realtime endpoint for your Supabase project.

**Purpose:** Allows browser and API clients to know where to send authenticated requests.

**Where used:**
- Supabase client initialization (createClient) in the frontend
- Extracted to build the edge-function URL when uploading inspiration photos

**Behavior impact:** If this URL is wrong or mismatched to the project, all client calls to Supabase (auth, storage, functions) fail.

**Risks/notes:** Not secret by itself, but must match the project being targeted; store in .env (VITE_SUPABASE_URL) and avoid hard‑coding to enable multi‑environment deploys.

#### 2. SUPABASE_ANON_KEY
**Represents:** The public "anon" API key used for client-side access to Supabase.

**Purpose:** Authenticates browser requests for storage, auth, and edge-function invocations.

**Where used:**
- Passed to createClient in the frontend
- Sent as Authorization and apikey headers when calling the sila-model-debugger function

**Behavior impact:** Must be valid for users to sign in, upload images, and trigger detection; revoking or rotating the key invalidates existing clients.

**Risks/notes:** Though publishable, exposing it outside trusted frontends can enable quota abuse; keep it in environment variables and rotate if compromised.

#### 3. SUPABASE_SERVICE_ROLE_KEY
**Represents:** A high‑privilege Supabase key that bypasses Row Level Security.

**Purpose:** Intended for server-side or edge-function code needing full database access (e.g., inserting model detections).

**Where used:** Not directly referenced in the repository; mentioned in docs as an edge-function secret.

**Behavior impact:** Enables privileged DB mutations; misuse could leak or alter user data.

**Risks/notes:** Never expose to the client; store only in Supabase Function secrets or backend environment.

#### 4. SUPABASE_DB_URL
**Represents:** PostgreSQL connection string for the Supabase database.

**Purpose:** Used by Supabase CLI or backend scripts for migrations and direct queries.

**Where used:** Documented but not referenced in code.

**Behavior impact:** Required for admin/maintenance tasks; incorrect values break migrations.

**Risks/notes:** Full DB credentials—treat as highly sensitive and limit access to CI/back-end tooling.

### Hugging Face AI Model Configuration

#### 5. HF_TOKEN
**Represents:** Hugging Face API token authorizing calls to hosted models.

**Purpose:** Authenticates inference requests to the YOLOS and optional Grounding-DINO models.

**Where used:**
- Injected via headers when calling the Hugging Face endpoint

**Behavior impact:** Needed for every model call; expired or missing tokens cause 401 errors and failed detections.

**Risks/notes:** Rate limits and billing tie to this token—keep it secret and rotate if leaked.

#### 6. HF_ENDPOINT_URL
**Represents:** URL of the deployed Hugging Face YOLOS inference endpoint.

**Purpose:** Tells the edge function which model service to hit for bounding-box predictions.

**Where used:** Fetch target in callHF when scoring an image

**Behavior impact:** Changing this points the function to a different model or region; misconfiguration breaks classification.

**Risks/notes:** Typically constant across environments; secure to prevent unintended model switching.

### Model Tuning Parameters

#### 7. SMALL_FAMILY_BOOST
**Represents:** Multiplier applied to vote weights for smaller item families (Bags, Shoes, Accessories).

**Purpose:** Counteracts model bias so small items aren't overshadowed by larger garments.

**Where used:** Weight adjustment during category voting

**Behavior impact:** Higher values make small-item categories win more often; too high causes over‑classification of small items.

**Risks/notes:** Tune empirically; redeploy the function after changes.

#### 8. BAG_FORCE_MIN
**Represents:** Minimum confidence for a "bag/wallet" prediction to force classification to "Bags."

**Purpose:** Ensures bags are surfaced even if they don't top the weighted vote.

**Where used:** Presence check before final category selection

**Behavior impact:** Lowering it increases bag detections but may yield false positives.

**Risks/notes:** Adjust with validation data; mis-tuning can skew categories.

#### 9. SHOE_FORCE_MIN
**Represents:** Minimum confidence for a shoe prediction to force classification to "Shoes."

**Purpose:** Similar to BAG_FORCE_MIN, but for shoe recognition.

**Where used:** Shoe presence check in classification logic

**Behavior impact:** Influences how aggressively shoe detections override other categories.

**Risks/notes:** Too low → frequent mislabels; too high → shoes missed.

#### 10. VOTE_MIN_SCORE
**Represents:** Confidence threshold for including YOLOS predictions in the weighted vote.

**Purpose:** Filters out weak detections before tallying category scores.

**Where used:** Parameter to voteCategory which tallies class weights

**Behavior impact:** Raising it yields stricter but possibly sparser predictions; lowering increases recall at the cost of noise.

**Risks/notes:** Key knob for model precision/recall trade-off; adjust carefully and monitor outcomes.

## General Notes

- All secrets should be stored in environment variables or Supabase's Secrets UI; never commit real values.
- Changing edge-function secrets requires redeploying the function in Supabase.
- Rotate tokens/keys periodically and monitor usage to prevent abuse or quota exhaustion.

## Quick Setup

```
HF_ENDPOINT_URL = YOUR_HUGGING_FACE_YOLOS_ENDPOINT
HF_TOKEN = YOUR_HUGGING_FACE_API_TOKEN
SMALL_FAMILY_BOOST = 2.0
BAG_FORCE_MIN = 0.3
SHOE_FORCE_MIN = 0.3
VOTE_MIN_SCORE = 0.1
```

**Note:** The SERVICE_ROLE key should only be used in Edge Functions, never in client-side code.