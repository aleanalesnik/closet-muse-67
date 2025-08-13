-- Full Database schema with storage bucket and policies

-- Create private storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('sila', 'sila', false, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp']);

-- Storage policies for sila bucket
CREATE POLICY "read own files" ON storage.objects 
FOR SELECT TO authenticated
USING (bucket_id = 'sila' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "upload to own folder" ON storage.objects 
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'sila' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "update own files" ON storage.objects 
FOR UPDATE TO authenticated
USING (bucket_id = 'sila' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "delete own files" ON storage.objects 
FOR DELETE TO authenticated
USING (bucket_id = 'sila' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Create IVFFLAT index for vector similarity search
CREATE INDEX CONCURRENTLY IF NOT EXISTS item_embeddings_embedding_idx 
ON item_embeddings USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Create index on inspiration_detections for faster queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS inspiration_detections_query_id_idx 
ON inspiration_detections (query_id);

-- Create index on items for faster lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS items_owner_idx ON items (owner);
CREATE INDEX CONCURRENTLY IF NOT EXISTS items_category_idx ON items (category);

-- Create index on inspiration_queries for status filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS inspiration_queries_owner_status_idx 
ON inspiration_queries (owner, status);