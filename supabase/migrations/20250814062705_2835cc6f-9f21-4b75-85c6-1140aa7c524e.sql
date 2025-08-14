-- Create service role policies for edge functions to insert/update data

-- Allow service role to insert/update items (for items-process edge function)
CREATE POLICY "Service role can manage items" ON public.items
FOR ALL USING (
  auth.role() = 'service_role'
) WITH CHECK (
  auth.role() = 'service_role'
);

-- Allow service role to insert inspiration_detections (for inspiration-run edge function) 
CREATE POLICY "Service role can manage inspiration_detections" ON public.inspiration_detections
FOR ALL USING (
  auth.role() = 'service_role'  
) WITH CHECK (
  auth.role() = 'service_role'
);

-- Also ensure service role can read inspiration_queries (needed for inspiration_detections policies)
CREATE POLICY "Service role can read inspiration_queries" ON public.inspiration_queries
FOR SELECT USING (
  auth.role() = 'service_role'
);