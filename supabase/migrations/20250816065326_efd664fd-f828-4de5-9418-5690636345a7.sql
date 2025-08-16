-- Clean up items with Silver/Gold color_name and snap them to nearest palette colors
-- Silver (#C0C0C0) is closest to Grey (#D9D9D9)  
-- Gold (#FFD700/#D4AF37) is closest to Yellow (#FCD759)

UPDATE items 
SET color_name = 'Grey', color_hex = '#D9D9D9'
WHERE color_name = 'Silver';

UPDATE items 
SET color_name = 'Yellow', color_hex = '#FCD759' 
WHERE color_name = 'Gold';