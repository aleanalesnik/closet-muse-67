-- Insert policy (likely already exists)
CREATE POLICY "items_insert_own"
ON public.items FOR INSERT
TO authenticated
WITH CHECK ( owner = auth.uid() );

-- Update policy: allow owners to update all fields  
CREATE POLICY "items_update_own"
ON public.items FOR UPDATE
TO authenticated
USING ( owner = auth.uid() )
WITH CHECK ( owner = auth.uid() );