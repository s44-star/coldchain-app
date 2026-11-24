-- =============================================================================
-- ColdChain OS · 0013_storage
-- Private bucket for incident photos/PDFs. Path: <company_id>/<incident_id>/<file>
-- Files are served only through short-lived signed URLs.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'incident-attachments',
  'incident-attachments',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public             = false,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy cco_incident_attachments_select on storage.objects for select to authenticated
  using (
    bucket_id = 'incident-attachments'
    and (storage.foldername(name))[1] in (
      select c::text from private.member_company_ids() as c
    )
  );

create policy cco_incident_attachments_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'incident-attachments'
    and exists (
      select 1 from public.incidents i
      where i.company_id::text = (storage.foldername(name))[1]
        and i.id::text = (storage.foldername(name))[2]
        and i.company_id in (select private.member_company_ids(
          array['owner', 'admin', 'warehouse_manager', 'operator']::public.member_role[]
        ))
    )
  );

create policy cco_incident_attachments_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'incident-attachments'
    and (
      (storage.foldername(name))[1] in (
        select c::text from private.member_company_ids(array['owner', 'admin']::public.member_role[]) as c
      )
      or (
        owner_id = (select auth.uid())::text
        and (storage.foldername(name))[1] in (
          select c::text from private.member_company_ids(
            array['owner', 'admin', 'warehouse_manager', 'operator']::public.member_role[]
          ) as c
        )
      )
    )
  );
