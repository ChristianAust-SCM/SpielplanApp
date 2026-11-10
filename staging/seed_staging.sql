-- ============================================================================
-- NUR LOKALE STAGING-UMGEBUNG – synthetische Testkonten mit Passwort
-- ============================================================================
-- Ergänzt die synthetischen Nutzer aus supabase/tests/_seed.sql um die Felder,
-- die GoTrue für eine echte Passwort-Anmeldung braucht. Passwort für alle
-- Testkonten: "staging-lokal-1" (nur lokal gültig, keine echten Konten).
update auth.users set
  instance_id        = '00000000-0000-0000-0000-000000000000',
  aud                = 'authenticated',
  role               = 'authenticated',
  encrypted_password = extensions.crypt('staging-lokal-1', extensions.gen_salt('bf')),
  email_confirmed_at = now(),
  raw_app_meta_data  = '{"provider":"email","providers":["email"]}',
  raw_user_meta_data = '{}',
  created_at         = now(),
  updated_at         = now(),
  confirmation_token = '',
  recovery_token     = '',
  email_change       = '',
  email_change_token_new = ''
 where email like '%@test.invalid';

insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
  from auth.users u
 where u.email like '%@test.invalid'
   and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');
