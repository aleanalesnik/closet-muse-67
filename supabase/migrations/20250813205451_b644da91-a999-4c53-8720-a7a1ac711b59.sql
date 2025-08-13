-- Storage policies for existing sila bucket
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