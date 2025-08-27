# Technical Handoff Document - Sila 2 Virtual Closet App

## Overview

Sila 2 is a React-based virtual closet management application that leverages AI for clothing recognition and style inspiration. The app allows users to upload clothing items, organize their virtual closet, and find similar items using AI-powered image analysis.

## 1. Supabase Integration Overview

### 1.1 Connection Setup

**Primary Supabase Client**: `/src/integrations/supabase/client.ts`
- Auto-generated client with TypeScript types
- Configured with localStorage persistence and auto token refresh

**Legacy Client**: `/src/lib/supabase.ts`
- Fallback client with hardened initialization
- Supports both Vite (`import.meta.env`) and Node.js (`process.env`) environments

### 1.2 Environment Variables & Secrets

**Frontend Environment Variables:**
```
VITE_SUPABASE_URL = "https://tqbjbugwwffdfhihpkcg.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Edge Function Secrets:**
- `HF_TOKEN` - Hugging Face API token for AI models
- `HF_ENDPOINT_URL` - Hugging Face inference endpoint
- `SUPABASE_URL` - Internal Supabase URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for admin operations
- `SUPABASE_DB_URL` - Database connection string
- Tuning parameters: `SMALL_FAMILY_BOOST`, `BAG_FORCE_MIN`, `SHOE_FORCE_MIN`, `VOTE_MIN_SCORE`

### 1.3 Authentication Implementation

**Files:**
- `/src/components/Auth.tsx` - Main authentication component
- `/src/pages/auth/MagicLinkSignIn.tsx` - Magic link authentication
- `/src/pages/auth/AuthCallback.tsx` - OAuth callback handler

**Authentication Flow:**
1. Email/password authentication with sign-up and sign-in
2. Magic link authentication option
3. Session persistence with auto-refresh
4. Auth state management in `/src/pages/Index.tsx`

**Implementation Pattern:**
```typescript
// Session check and listener setup
useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    setUser(session?.user ?? null);
  });

  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      setUser(session?.user ?? null);
    }
  );

  return () => subscription.unsubscribe();
}, []);
```

### 1.4 CRUD Operations

**Items Management** (`/src/lib/items.ts`):
- `uploadAndProcessItem()` - Upload clothing item with AI processing
- `findMatchingItems()` - Query items by category and details
- Dependency injection support for testing

**Database Queries** (across components):
- User-scoped queries with RLS policies
- Real-time subscriptions for data updates
- Error handling with toast notifications

## 2. Database Structure

### 2.1 Tables Overview

#### `items` Table
**Purpose**: Store user's clothing items
**Columns:**
- `id` (uuid, PK) - Unique identifier
- `owner` (uuid) - References auth.users.id
- `title` (text) - Item name/description
- `category` (text) - Clothing category (Tops, Bottoms, Dress, etc.)
- `subcategory` (text) - More specific classification
- `color_name` (text) - Detected color name
- `color_hex` (text) - Hex color code
- `image_path` (text) - Storage path for item image
- `brand` (text) - Brand name
- `attributes` (jsonb) - Additional metadata
- `bbox` (array) - Bounding box coordinates [x,y,w,h]
- `yolos_result` (jsonb) - AI detection results
- `yolos_latency_ms` (integer) - Processing time
- `yolos_model` (text) - AI model used
- `yolos_top_labels` (array) - Top detection labels
- `details` (array) - Item detail labels
- `created_at`, `updated_at` (timestamptz)

**RLS Policies:**
- Users can only access their own items (`owner = auth.uid()`)
- Service role has full access for admin operations

#### `profiles` Table
**Purpose**: Extended user profile information
**Columns:**
- `user_id` (uuid, PK) - References auth.users.id
- `display_name` (text) - User's display name
- `created_at` (timestamptz)

**RLS Policies:**
- Users can only access their own profile

#### `inspiration_queries` Table
**Purpose**: Track inspiration photo uploads and processing
**Columns:**
- `id` (uuid, PK)
- `owner` (uuid) - User who uploaded
- `image_path` (text) - Storage path
- `status` (text) - Processing status ('queued', 'completed', 'failed')
- `error` (text) - Error message if failed
- `created_at` (timestamptz)

#### `inspiration_detections` Table
**Purpose**: Store AI detection results from inspiration queries
**Columns:**
- `id` (uuid, PK)
- `query_id` (uuid) - References inspiration_queries.id
- `category` (text) - Detected clothing category
- `subcategory` (text) - Specific item type
- `confidence` (real) - Detection confidence score
- `bbox` (array) - Bounding box coordinates
- `color_name`, `color_hex` (text) - Color information
- `embedding` (vector) - Vector embedding for similarity search
- `mask_path`, `crop_path` (text) - Segmentation results

### 2.2 Database Functions

**Vector Operations:**
- Comprehensive pgvector functions for similarity search
- L2 distance, cosine distance, inner product calculations
- Binary quantization and normalization functions

**Custom Functions:**
- `match_user_items()` - Find similar items using vector embeddings
- `set_updated_at()` - Trigger function for timestamp updates

## 3. Storage & Asset Management

### 3.1 Storage Buckets

**Primary Bucket**: `sila`
- **Public**: Yes (allows direct URL access)
- **Structure**:
  - `{user_id}/items/{uuid}.{ext}` - User clothing items
  - `{user_id}/inspo/{uuid}.{ext}` - Inspiration photos

### 3.2 File Upload Flow

**Clothing Items** (`/src/lib/items.ts`):
1. Generate unique file path with user ID
2. Upload to Supabase Storage with content type
3. Create database record with image path
4. Get public URL for immediate display
5. Process with AI via edge function
6. Update database with AI results

**File Upload Implementation:**
```typescript
const ext = file.name.split(".").pop()?.toLowerCase() || "png";
const objectId = crypto.randomUUID();
const imagePath = `${user.id}/items/${objectId}.${ext}`;

const { error: upErr } = await client.storage.from("sila").upload(imagePath, file, {
  contentType: file.type || `image/${ext}`,
  upsert: true
});
```

### 3.3 Image Retrieval

**Public URLs**: Direct access via Supabase CDN
**Signed URLs**: For private content (via `/src/lib/storage.ts`)
- `getSignedImageUrl()` - Single file signed URL
- `batchCreateSignedUrls()` - Batch processing for performance

## 4. Edge Functions

### 4.1 sila-model-debugger Function

**Purpose**: AI-powered clothing detection and analysis
**Location**: `/supabase/functions/sila-model-debugger/`

**Input Formats:**
- Binary image data (direct upload)
- JSON payload with `base64Image` or `imageUrl`
- Threshold parameter for detection sensitivity

**AI Pipeline:**
1. **YOLOS Model**: Primary object detection (Fashionpedia dataset)
2. **Category Mapping**: Map detected labels to clothing categories
3. **Primary Garment Selection**: Choose best detection by score and area
4. **Bounding Box Normalization**: Convert to [x,y,w,h] format (0-1)
5. **Response Formatting**: Structured JSON with detection results

**Response Structure:**
```typescript
{
  status: "success",
  category: string,           // Main clothing category
  bbox: [number,number,number,number] | null, // Normalized bounding box
  proposedTitle: string,      // Suggested item name
  colorName: string | null,   // Detected color
  colorHex: string | null,    // Hex color code
  yolosTopLabels: string[],   // Top detection labels
  details: string[],          // Detail/part labels
  result: EdgeDet[],          // Full detection results
  latencyMs: number,          // Processing time
  build: string              // Function version
}
```

**Error Handling:**
- Comprehensive logging with performance metrics
- Graceful fallbacks for failed detections
- Structured error responses with build information

## 5. External Integrations

### 5.1 Hugging Face AI Models

**Primary Model**: `valentinafeve/yolos-fashionpedia`
- **Type**: Object detection specialized for fashion items
- **Purpose**: Detect and classify clothing items in images
- **Endpoint**: Configured via `HF_ENDPOINT_URL` secret
- **Authentication**: `HF_TOKEN` secret

**Model Features:**
- Fashion-specific training on Fashionpedia dataset
- Supports 270+ fashion categories and attributes
- Returns bounding boxes and confidence scores
- Optimized for clothing detection accuracy

**Usage Pattern:**
```typescript
const response = await fetch(HF_ENDPOINT_URL, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${HF_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    inputs: base64Image,
    parameters: { threshold: 0.12 }
  })
});
```

## 6. UI Flows & User Journeys

### 6.1 Authentication Flow
1. **Landing**: User sees login/signup form (`/src/components/Auth.tsx`)
2. **Registration**: New users create account with email/password
3. **Login**: Returning users sign in (password or magic link)
4. **Session Management**: Auto-refresh and persistence
5. **Navigation**: Authenticated users access main app features

### 6.2 Closet Management Flow
1. **Upload**: User selects image file via file picker
2. **Processing**: Image uploaded to storage, AI analysis triggered
3. **AI Detection**: Edge function processes image with YOLOS model
4. **Database Storage**: Item saved with AI-extracted metadata
5. **Display**: Item appears in user's closet grid with details

### 6.3 Inspiration Flow
1. **Photo Upload**: User uploads inspiration image
2. **Storage**: Image saved to inspiration bucket
3. **AI Processing**: Detect clothing items in inspiration photo
4. **Similarity Search**: Find matching items in user's closet
5. **Results**: Display inspiration photo with matched closet items

### 6.4 Outfit Building Flow
1. **Item Selection**: Browse closet items by category
2. **Outfit Creation**: Select multiple items for outfit
3. **Random Generation**: AI-suggested outfit combinations
4. **Saving**: Store outfit combinations for future reference

## 7. Component Architecture

### 7.1 Main Application Structure
- **App.tsx**: Router configuration with React Query
- **Index.tsx**: Main authenticated app with tab navigation
- **Auth.tsx**: Authentication forms and logic

### 7.2 Feature Components
- **Closet.tsx**: Item management and upload interface
- **Inspiration.tsx**: Style inspiration and matching
- **OutfitBuilder.tsx**: Outfit creation and management
- **ItemCard.tsx**: Reusable item display component

### 7.3 State Management
- **React Query**: Server state and caching
- **Local State**: Component-level state with useState
- **Auth State**: Global authentication state via Supabase auth

### 7.4 UI Components
- **Shadcn/ui**: Comprehensive component library
- **Tailwind CSS**: Utility-first styling with design tokens
- **Lucide Icons**: Consistent iconography
- **Toast Notifications**: User feedback and error handling

## 8. Testing & Quality Assurance

### 8.1 Test Coverage
- **Unit Tests**: `src/lib/items.test.ts` - Core business logic
- **Edge Function Tests**: `supabase/functions/sila-model-debugger/index.test.ts`
- **Mock Dependencies**: Comprehensive mocking for Supabase and external APIs

### 8.2 Development Workflow
- **Build Configurations**: Separate dev and production builds
- **Type Safety**: Full TypeScript coverage with auto-generated Supabase types
- **Linting**: ESLint configuration for code quality

## 9. Security Considerations

### 9.1 Row Level Security (RLS)
- All database tables have RLS enabled
- User-scoped policies prevent cross-user data access
- Service role bypasses RLS for admin operations

### 9.2 Authentication Security
- Secure session management with auto-refresh
- Email confirmation for new accounts
- Magic link authentication option

### 9.3 File Upload Security
- Content type validation
- User-scoped storage paths
- File size and type restrictions

## 10. Performance Optimizations

### 10.1 Image Processing
- Efficient bounding box calculations
- Smart threshold adjustments for different item types
- Batch processing for multiple items

### 10.2 Database Performance
- Vector indexes for similarity search
- Efficient RLS policies
- Proper column indexing for queries

### 10.3 Frontend Performance
- React Query for intelligent caching
- Lazy loading for large image sets
- Optimized re-renders with proper dependencies

## 11. Deployment & Monitoring

### 11.1 Edge Function Deployment
- Automatic deployment with code changes
- Version tracking with build identifiers
- Comprehensive logging for debugging

### 11.2 Database Migrations
- Structured migration system
- RLS policy management
- Type generation workflow

### 11.3 Monitoring
- Edge function analytics via Supabase dashboard
- Authentication logs and metrics
- Storage usage tracking

---

*This document provides a comprehensive technical overview of the Sila 2 virtual closet application's Supabase integration and architecture. For specific implementation details, refer to the individual source files referenced throughout this document.*