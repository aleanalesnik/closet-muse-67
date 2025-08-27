# Sila 2 - Technical Handoff Document

## Overview

**Sila 2** is a virtual closet and fashion management application that allows users to upload, organize, and discover clothing items using AI-powered image analysis. Built with React, TypeScript, Tailwind CSS, and Supabase backend.

### Core Features
- **Virtual Closet**: Upload and organize clothing items with automatic AI categorization
- **Style Inspiration**: Upload photos to find similar items from your closet using vector embeddings
- **Outfit Builder**: Create and manage outfit combinations
- **Authentication**: Secure user management with email/password and magic link support

---

## Supabase Integration Overview

### Authentication
- **Implementation**: Uses Supabase Auth with email/password and magic link flows
- **Files**: 
  - `src/components/Auth.tsx` - Main authentication component
  - `src/pages/auth/MagicLinkSignIn.tsx` - Magic link handler
  - `src/pages/auth/AuthCallback.tsx` - OAuth callback handler
- **Configuration**: Auto-refresh tokens, localStorage persistence

### Database Operations (CRUD)

#### Items Management
```typescript
// Create item
const { data, error } = await supabase
  .from('items')
  .insert({
    owner: user.id,
    title: "Item Name",
    image_path: imagePath,
    category: "Tops"
  })

// Read items
const { data, error } = await supabase
  .from('items')
  .select('*')
  .order('created_at', { ascending: false })

// Update item
const { error } = await supabase
  .from('items')
  .update({ category: "Bottoms" })
  .eq('id', itemId)

// Delete items
const { error } = await supabase
  .from('items')
  .delete()
  .in('id', itemIds)
```

#### Inspiration Queries
```typescript
// Vector similarity search
const { data, error } = await supabase.rpc('match_user_items', {
  p_owner: user.id,
  p_query: embedding,
  p_limit: 6
})
```

### Environment Variables & Secrets

#### Client-side (.env)
```
VITE_SUPABASE_URL="https://tqbjbugwwffdfhihpkcg.supabase.co"
VITE_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

#### Edge Function Secrets
- `HF_TOKEN` - Hugging Face API token for YOLOS model access
- `HF_ENDPOINT_URL` - Hugging Face inference endpoint
- `SUPABASE_SERVICE_ROLE_KEY` - For backend operations
- `SUPABASE_DB_URL` - Database connection string

### Client Implementation
- **Primary Client**: `src/lib/supabase.ts` - Main client with fallback credentials
- **Integration Client**: `src/integrations/supabase/client.ts` - Auto-generated client with TypeScript types
- **Session Management**: Implemented in `src/pages/Index.tsx` with `onAuthStateChange`

---

## Data Structure & Database Schema

### Tables Overview

#### 1. `items` - Main clothing items table
```sql
CREATE TABLE items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner uuid NOT NULL,
  title text,
  category text,
  subcategory text,
  color_name text,
  color_hex text,
  image_path text NOT NULL,
  brand text,
  attributes jsonb,
  bbox real[], -- Bounding box coordinates
  yolos_result jsonb,
  yolos_latency_ms integer,
  yolos_model text DEFAULT 'valentinafeve/yolos-fashionpedia',
  yolos_top_labels text[],
  details text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

#### 2. `profiles` - User profile information
```sql
CREATE TABLE profiles (
  user_id uuid NOT NULL,
  display_name text,
  created_at timestamptz DEFAULT now()
);
```

#### 3. `inspiration_queries` - Style inspiration searches
```sql
CREATE TABLE inspiration_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner uuid NOT NULL,
  image_path text NOT NULL,
  status text DEFAULT 'queued',
  error text,
  created_at timestamptz DEFAULT now()
);
```

#### 4. `inspiration_detections` - AI detected items from inspiration photos
```sql
CREATE TABLE inspiration_detections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id uuid,
  bbox real[],
  category text,
  subcategory text,
  color_name text,
  color_hex text,
  confidence real,
  embedding vector, -- For similarity search
  crop_path text,
  mask_path text
);
```

### Row Level Security (RLS) Policies

#### Items Table
```sql
-- Users can only access their own items
CREATE POLICY "Items select own" ON items FOR SELECT USING (owner = auth.uid());
CREATE POLICY "Items insert own" ON items FOR INSERT WITH CHECK (owner = auth.uid());
CREATE POLICY "Items update own" ON items FOR UPDATE USING (owner = auth.uid());
CREATE POLICY "Items delete own" ON items FOR DELETE USING (owner = auth.uid());
```

#### Profiles Table
```sql
-- Users can only access their own profile
CREATE POLICY "profiles owner read" ON profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "profiles owner write" ON profiles FOR ALL USING (auth.uid() = user_id);
```

### Database Functions

#### `match_user_items` - Vector similarity search
```sql
CREATE OR REPLACE FUNCTION match_user_items(
  p_owner uuid, 
  p_query vector, 
  p_limit integer DEFAULT 5
)
RETURNS TABLE(
  item_id uuid,
  score real,
  title text,
  category text,
  subcategory text,
  color_hex text,
  color_name text,
  image_path text
)
```

### Relationships
- `items.owner` → `auth.users.id` (implicit)
- `profiles.user_id` → `auth.users.id` (implicit)
- `inspiration_queries.owner` → `auth.users.id` (implicit)
- `inspiration_detections.query_id` → `inspiration_queries.id`

---

## Storage & Asset Management

### Storage Configuration
- **Bucket Name**: `sila`
- **Public Access**: Yes
- **Path Structure**: 
  - Items: `{user_id}/items/{uuid}.{ext}`
  - Inspiration: `{user_id}/inspo/{uuid}.{ext}`

### Upload Process (`src/components/Closet.tsx`)
1. **File Upload**: Direct upload to Supabase Storage
2. **Database Entry**: Create item record with `image_path`
3. **AI Analysis**: Call edge function for object detection
4. **Update Record**: Store AI results (category, bbox, etc.)

### Signed URLs (`src/lib/storage.ts`)
```typescript
export async function getSignedImageUrl(path: string, expires = 3600) {
  const { data, error } = await supabase
    .storage
    .from("sila")
    .createSignedUrl(path, expires);
  return data?.signedUrl ?? null;
}

export async function batchCreateSignedUrls(paths: string[], expires = 3600) {
  // Parallel processing for multiple URLs
}
```

### Image Processing Pipeline
1. **Upload** → Supabase Storage
2. **Generate Public URL** → For AI processing
3. **Wait for Availability** → `waitUntilPublic()` function
4. **AI Analysis** → Edge function call
5. **Store Results** → Update database record

---

## Edge Functions

### `sila-model-debugger`
**Location**: `supabase/functions/sila-model-debugger/index.ts`

#### Purpose
AI-powered clothing detection and classification using YOLOS (You Only Look Once for Panoptic Segmentation) model.

#### Input Format
```typescript
interface RequestBody {
  imageUrl?: string;     // Public URL of image
  base64Image?: string;  // Data URL format
  threshold?: number;    // Detection threshold (default: 0.12)
}
```

#### Output Format
```typescript
interface Response {
  status: "success" | "fail";
  category: string;           // Primary category (Tops, Bottoms, etc.)
  bbox: [number, number, number, number] | null;  // Normalized bounding box
  proposedTitle: string;
  colorName: string | null;
  colorHex: string | null;
  yolosTopLabels: string[];
  result: DetectionResult[];  // All detections
  latencyMs: number;
}
```

#### AI Models Used
1. **Primary**: YOLOS (valentinafeve/yolos-fashionpedia)
2. **Fallback**: Grounding DINO for small items (bags, shoes, accessories)

#### Category Detection Logic
```typescript
const CATEGORY_ALIASES = {
  Dress: ["dress","jumpsuit","romper"],
  Bottoms: ["skirt","pants","jeans","trousers","shorts","leggings"],
  Tops: ["shirt","blouse","top","t-shirt","sweater","cardigan"],
  Outerwear: ["jacket","coat","trench","puffer","blazer"],
  Shoes: ["shoe","sneaker","boot","heel","sandal"],
  Bags: ["bag","handbag","tote","wallet","crossbody"],
  Accessories: ["belt","glasses","hat","watch","tie"]
};
```

---

## External Services & API Integrations

### Hugging Face Integration
- **Service**: Hugging Face Inference API
- **Models**: 
  - YOLOS (Object Detection): `valentinafeve/yolos-fashionpedia`
  - Grounding DINO (Fallback): `IDEA-Research/grounding-dino-tiny`
- **Authentication**: Bearer token via `HF_TOKEN` secret
- **Endpoint**: Custom deployment endpoint via `HF_ENDPOINT_URL`

### API Calls Implementation
```typescript
// Edge function call from client
const response = await fetch(`https://tqbjbugwwffdfhihpkcg.supabase.co/functions/v1/sila-model-debugger`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${jwt_token}`
  },
  body: JSON.stringify({ imageUrl, threshold: 0.5 })
});
```

### Image Processing Pipeline
1. **Upload** → Supabase Storage
2. **Public URL** → Generate accessible URL
3. **AI Detection** → Edge function processes image
4. **Bounding Box** → Normalized coordinates returned
5. **Category** → Weighted voting algorithm determines final category

### Performance Optimizations
- **Adaptive Thresholds**: Lower thresholds for small items (bags, shoes)
- **Two-Pass Detection**: Second pass with lower threshold if no primary garment found
- **NMS (Non-Maximum Suppression)**: Removes duplicate detections
- **Family Boosting**: Small items get score multiplier for better detection

---

## UI Flows & User Journeys

### 1. User Onboarding Flow

#### Authentication (`/`)
```
Landing → Auth Component → Sign Up/Sign In → Main App
```

**Implementation**: `src/pages/Index.tsx`
- Checks for existing session on load
- Redirects to auth if not logged in
- Sets up auth state listener for session changes

### 2. Closet Management Flow

#### Upload Item (`src/components/Closet.tsx`)
```
Upload Button → File Selection → Preview → AI Analysis → Item Added
```

**Process**:
1. **File Selection**: Native file input with image filter
2. **Immediate Preview**: Creates object URL for instant feedback
3. **Upload Status**: Shows "Uploading..." then "Analyzing with YOLOS..."
4. **Storage Upload**: Direct to Supabase Storage
5. **Database Creation**: Creates item record with temporary title
6. **AI Processing**: Calls edge function for detection
7. **Result Update**: Updates item with category, bbox, colors
8. **UI Update**: Removes loading state, shows final item

#### Selection & Deletion
```
Select Mode → Multi-select Items → Delete Confirmation → Batch Delete
```

**Features**:
- Toggle selection mode
- Select all/clear all options
- Batch delete with confirmation
- Responsive mobile/desktop layouts

### 3. Style Inspiration Flow

#### Photo Analysis (`src/components/Inspiration.tsx`)
```
Upload Photo → AI Detection → Vector Matching → Similar Items Display
```

**Process**:
1. **Photo Upload**: Direct to `{user_id}/inspo/` path
2. **AI Analysis**: Same edge function as closet items
3. **Detection Results**: Multiple items detected in single photo
4. **Vector Search**: Uses `match_user_items` RPC function
5. **Similar Items**: Shows matching items from user's closet

#### Query History
- **Recent Searches**: Shows previous inspiration queries
- **Status Tracking**: queued → processing → completed/failed
- **Interactive Selection**: Click to view results

### 4. State Management

#### Authentication State (`src/pages/Index.tsx`)
```typescript
const [user, setUser] = useState<any>(null);
const [loading, setLoading] = useState(true);

useEffect(() => {
  // Get initial session
  supabase.auth.getSession().then(({ data: { session } }) => {
    setUser(session?.user ?? null);
    setLoading(false);
  });

  // Listen for auth changes
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      setUser(session?.user ?? null);
    }
  );

  return () => subscription.unsubscribe();
}, []);
```

#### Items State (`src/components/Closet.tsx`)
```typescript
const [items, setItems] = useState<Item[]>([]);
const [uploadingItems, setUploadingItems] = useState<UploadingItem[]>([]);
const [signedUrls, setSignedUrls] = useState<{ [path: string]: string }>({});
```

### 5. Component Architecture

#### Main Layout (`src/pages/Index.tsx`)
- **Header**: User info + sign out
- **Navigation**: Tab-based navigation (Closet, Inspiration, Outfits)
- **Content**: Routed tab content

#### Shared Components
- **ItemCard** (`src/components/ItemCard.tsx`): Reusable item display
- **SmartCropImg** (`src/components/SmartCropImg.tsx`): Handles bounding box overlays
- **Auth** (`src/components/Auth.tsx`): Authentication forms

#### UI Patterns
- **Loading States**: Skeleton screens and spinners during AI processing
- **Error Handling**: Toast notifications for user feedback
- **Responsive Design**: Mobile-first with progressive enhancement
- **Selection Mode**: Toggle between view and select modes

### 6. Error Handling & User Feedback

#### Upload Errors (`src/components/Closet.tsx`)
```typescript
// User-friendly error messages based on error type
if (errorMessage.includes('503 Service Unavailable')) {
  title = 'Service temporarily unavailable';
  description = 'The AI analysis service is temporarily down. Please try uploading your item again in a few minutes.';
} else if (errorMessage.includes('service_error')) {
  title = 'Analysis service issues';
  description = 'The image analysis service is experiencing issues. Please try again later.';
}
```

#### Toast Notifications
- **Success**: Item upload complete, analysis results
- **Error**: Upload failures, authentication issues
- **Information**: Processing status updates

---

## Development & Deployment

### Key Dependencies
```json
{
  "@supabase/supabase-js": "^2.55.0",
  "react": "^18.3.1",
  "react-router-dom": "^6.30.1",
  "@radix-ui/*": "UI components",
  "tailwindcss": "Styling framework"
}
```

### Build Process
- **Development**: `npm run dev` - Vite dev server
- **Production**: `npm run build` - Static build for deployment
- **Edge Functions**: Auto-deployed with Supabase CLI

### Environment Setup
1. **Supabase Project**: Create and configure project
2. **Database**: Run migrations for tables and RLS policies
3. **Storage**: Create `sila` bucket with public access
4. **Edge Functions**: Deploy `sila-model-debugger` function
5. **Secrets**: Configure HF_TOKEN and HF_ENDPOINT_URL
6. **Client**: Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

### Performance Considerations
- **Image Optimization**: Signed URLs with expiration
- **Batch Operations**: Parallel URL generation
- **AI Processing**: Adaptive thresholds for better accuracy
- **Client-side Caching**: Object URLs for immediate preview
- **Error Recovery**: Retry logic for failed uploads

---

## Security Considerations

### Authentication
- **Session Management**: Auto-refresh tokens with localStorage persistence
- **Row Level Security**: All data access filtered by user ownership
- **JWT Validation**: Edge functions validate tokens for API access

### Data Protection
- **Private Storage**: User-specific paths prevent cross-user access
- **API Security**: Bearer token authentication for external services
- **Input Validation**: File type restrictions and size limits

### Best Practices
- **Environment Variables**: Sensitive keys in server-side secrets
- **RLS Policies**: Database-level access control
- **CORS Headers**: Proper cross-origin resource sharing setup
- **Error Handling**: Graceful degradation without exposing system details