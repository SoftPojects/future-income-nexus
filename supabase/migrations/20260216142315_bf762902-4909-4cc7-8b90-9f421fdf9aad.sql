
-- Create storage bucket for media assets (images, audio)
INSERT INTO storage.buckets (id, name, public) VALUES ('media-assets', 'media-assets', true);

-- Allow public read access to media assets
CREATE POLICY "Public read access for media assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'media-assets');

-- Allow service role to insert media assets (edge functions use service role)
CREATE POLICY "Service role can upload media assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'media-assets');

-- Allow service role to delete media assets
CREATE POLICY "Service role can delete media assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'media-assets');
