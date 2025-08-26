-- Add details column to items table for storing YOLOS part/detail labels
ALTER TABLE public.items ADD COLUMN details text[] DEFAULT NULL;

-- Add index for better performance when querying by details
CREATE INDEX idx_items_details ON public.items USING GIN(details);