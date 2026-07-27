-- Allow company asset images in the private document-files bucket.
-- Bucket remains private; access via signed URLs + ownership folder policies.

update storage.buckets
set allowed_mime_types = array[
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
  'application/octet-stream',
  'image/png',
  'image/jpeg',
  'image/webp'
]
where id = 'document-files';

-- Optional metadata when signature is independently saved/replaced.
alter table public.studio_details
  add column if not exists signature_updated_at timestamptz;

comment on column public.studio_details.signature_updated_at is
  'When the company signature asset was last saved or replaced.';
