-- A) Add missing columns for YOLOS pipeline

-- Add optional bbox column to items table for single-item detection results
ALTER TABLE public.items 
ADD COLUMN IF NOT EXISTS bbox numeric[];

-- Add missing columns to inspiration_detections for YOLOS multi-item results
ALTER TABLE public.inspiration_detections 
ADD COLUMN IF NOT EXISTS subcategory text,
ADD COLUMN IF NOT EXISTS confidence real,
ADD COLUMN IF NOT EXISTS color_name text,
ADD COLUMN IF NOT EXISTS color_hex text;

-- Add helpful comment
COMMENT ON COLUMN public.items.bbox IS 'YOLOS detection bounding box: [xmin, ymin, xmax, ymax]';
COMMENT ON COLUMN public.inspiration_detections.subcategory IS 'Detailed subcategory from fashion detection';
COMMENT ON COLUMN public.inspiration_detections.confidence IS 'YOLOS detection confidence score';
COMMENT ON COLUMN public.inspiration_detections.color_name IS 'Detected color name';
COMMENT ON COLUMN public.inspiration_detections.color_hex IS 'Detected color hex code';