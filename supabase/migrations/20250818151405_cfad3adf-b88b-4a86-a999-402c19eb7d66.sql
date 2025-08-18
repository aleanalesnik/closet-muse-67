-- Fix existing bounding boxes that were incorrectly stored as [x, y, width-x, height-y]
-- Convert them back to proper [x, y, width, height] format
UPDATE items 
SET bbox = CASE 
  WHEN bbox IS NOT NULL AND array_length(bbox, 1) = 4 THEN 
    ARRAY[
      bbox[1],  -- x (unchanged)
      bbox[2],  -- y (unchanged) 
      bbox[1] + bbox[3],  -- width = x + (width-x) = width
      bbox[2] + bbox[4]   -- height = y + (height-y) = height
    ]
  ELSE bbox
END
WHERE bbox IS NOT NULL 
  AND array_length(bbox, 1) = 4
  -- Only update if it looks like the box was incorrectly converted
  -- (width or height is suspiciously small, indicating width-x or height-y)
  AND (bbox[3] < 0.5 OR bbox[4] < 0.5);