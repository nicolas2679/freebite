# FreeBite Beta Invite SQL

Run this in the Supabase SQL editor for the FreeBite project when you are ready
to make the website beta gate use database-backed invite codes.

```sql
create extension if not exists pgcrypto;

create table if not exists public.beta_invite_codes (
  id uuid primary key default extensions.gen_random_uuid(),
  code_hash text not null unique,
  label text,
  active boolean not null default true,
  max_uses integer not null default 1 check (max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.beta_invite_codes enable row level security;

revoke all on public.beta_invite_codes from anon, authenticated;

create or replace function public.redeem_beta_invite(invite_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text;
  matching_id uuid;
begin
  normalized_code := upper(trim(invite_code));

  if normalized_code = '' then
    return false;
  end if;

  select id
  into matching_id
  from public.beta_invite_codes
  where code_hash = encode(extensions.digest(convert_to(normalized_code, 'UTF8'), 'sha256'), 'hex')
    and active = true
    and use_count < max_uses
    and (expires_at is null or expires_at > now())
  for update;

  if matching_id is null then
    return false;
  end if;

  update public.beta_invite_codes
  set
    use_count = use_count + 1,
    last_used_at = now()
  where id = matching_id;

  return true;
end;
$$;

revoke all on function public.redeem_beta_invite(text) from public;
grant execute on function public.redeem_beta_invite(text) to anon, authenticated;
```

Create a one-use invite code:

```sql
insert into public.beta_invite_codes (code_hash, label)
values (
  encode(extensions.digest(convert_to(upper(trim('FREEBITE-TEST-001')), 'UTF8'), 'sha256'), 'hex'),
  'Test restaurant invite'
);
```

Create a multi-use invite code:

```sql
insert into public.beta_invite_codes (code_hash, label, max_uses)
values (
  encode(extensions.digest(convert_to(upper(trim('FREEBITE-PARTNERS-2026')), 'UTF8'), 'sha256'), 'hex'),
  'Partner beta batch',
  25
);
```

Expire or disable a code:

```sql
update public.beta_invite_codes
set active = false
where label = 'Test restaurant invite';
```
