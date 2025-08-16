# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/ec3d4bbb-b19a-4c49-bece-c7355221f266

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/ec3d4bbb-b19a-4c49-bece-c7355221f266) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/ec3d4bbb-b19a-4c49-bece-c7355221f266) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)

## Edge Functions

**Active Functions:**
- `sila-model-debugger` - YOLOS object detection using public image URLs
- `items-process` - Complete item processing pipeline for closet uploads

**Removed Functions (Jan 2025):**
- `inference-probe`, `inspiration-start`, `inspiration-run` - Consolidated into sila-model-debugger with public URL workflow

## Testing Checklist

### Test 1: YOLOS Detection Test
- [ ] Call the `sila-model-debugger` edge function with public image URL
- [ ] Verify response contains detected items with bounding boxes
- [ ] **SQL Verification**: No DB changes expected for detection test

### Test 2: Items-process Test  
- [ ] Upload an item through the API (not UI)
- [ ] Call `items-process` edge function with itemId and imagePath
- [ ] Verify processing completes successfully
- [ ] **SQL Verification**:
```sql
-- Check item was processed
SELECT id, title, category, subcategory, color_hex, color_name, attributes, bbox 
FROM items 
WHERE id = 'YOUR_ITEM_ID';

-- Check embedding was created
SELECT item_id, embedding IS NOT NULL as has_embedding 
FROM item_embeddings 
WHERE item_id = 'YOUR_ITEM_ID';
```

### Test 3: UI Upload Test
- [ ] Upload image through Closet UI
- [ ] Verify toast shows "Processing started"
- [ ] Wait for processing to complete
- [ ] Verify item appears in closet with detected attributes
- [ ] **SQL Verification**:
```sql
-- Check latest uploaded items
SELECT id, title, category, subcategory, color_hex, color_name, created_at, attributes, bbox
FROM items 
ORDER BY created_at DESC 
LIMIT 5;

-- Verify embeddings exist
SELECT i.title, ie.embedding IS NOT NULL as has_embedding
FROM items i
LEFT JOIN item_embeddings ie ON i.id = ie.item_id
ORDER BY i.created_at DESC 
LIMIT 5;
```

### Test 4: Inspiration Test
- [ ] Upload inspiration photo through Inspiration UI  
- [ ] Verify query is created and processing starts
- [ ] Wait for detections to appear
- [ ] Verify matched items from closet are shown
- [ ] **SQL Verification**:
```sql
-- Check inspiration queries
SELECT id, status, error, created_at, image_path
FROM inspiration_queries 
ORDER BY created_at DESC 
LIMIT 3;

-- Check detections for latest query
SELECT id, category, subcategory, confidence, color_hex, color_name, bbox
FROM inspiration_detections 
WHERE query_id = 'YOUR_QUERY_ID'
ORDER BY confidence DESC;

-- Verify detection embeddings
SELECT id, embedding IS NOT NULL as has_embedding, confidence
FROM inspiration_detections 
WHERE query_id = 'YOUR_QUERY_ID'
ORDER BY confidence DESC;
```

### Test 5: Failure Modes Test
- [ ] Upload invalid image format
- [ ] Upload extremely large image  
- [ ] Test with network interruption
- [ ] Verify error handling and user feedback
- [ ] **SQL Verification**:
```sql
-- Check for failed queries
SELECT id, status, error, created_at
FROM inspiration_queries 
WHERE status = 'error' OR error IS NOT NULL
ORDER BY created_at DESC;

-- Check for incomplete items
SELECT id, title, category, subcategory, attributes, created_at
FROM items 
WHERE category IS NULL OR attributes IS NULL
ORDER BY created_at DESC 
LIMIT 10;
```

### Quick Status Check Queries
```sql
-- Overall system health
SELECT 
  (SELECT COUNT(*) FROM items) as total_items,
  (SELECT COUNT(*) FROM item_embeddings) as total_embeddings,
  (SELECT COUNT(*) FROM inspiration_queries) as total_queries,
  (SELECT COUNT(*) FROM inspiration_detections) as total_detections,
  (SELECT COUNT(*) FROM inspiration_queries WHERE status = 'error') as failed_queries;

-- Recent activity
SELECT 'items' as table_name, COUNT(*) as recent_count 
FROM items WHERE created_at > NOW() - INTERVAL '1 hour'
UNION ALL
SELECT 'inspiration_queries', COUNT(*) 
FROM inspiration_queries WHERE created_at > NOW() - INTERVAL '1 hour'
UNION ALL  
SELECT 'inspiration_detections', COUNT(*)
FROM inspiration_detections WHERE query_id IN (
  SELECT id FROM inspiration_queries WHERE created_at > NOW() - INTERVAL '1 hour'
);
```
