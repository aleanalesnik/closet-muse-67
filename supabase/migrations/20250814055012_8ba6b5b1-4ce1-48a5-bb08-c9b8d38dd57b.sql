-- Add attributes column to items table for storing pattern/texture data
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS attributes jsonb;