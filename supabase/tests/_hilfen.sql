-- Gemeinsame Einstellungen für alle Testdateien (wird vor jeder Datei geladen)
\set ON_ERROR_STOP 1
set search_path = public, extensions;

-- Synthetische IDs aus _seed.sql
\set admin    '''00000000-0000-4000-a000-0000000000a1'''
\set mf1      '''00000000-0000-4000-a000-0000000000b1'''
\set mf2      '''00000000-0000-4000-a000-0000000000b2'''
\set ohne     '''00000000-0000-4000-a000-0000000000c1'''
\set m1       '''00000000-0000-4000-c000-000000000001'''
\set m2       '''00000000-0000-4000-c000-000000000002'''
\set m3       '''00000000-0000-4000-c000-000000000003'''
\set s11      '''00000000-0000-4000-d000-000000000011'''
\set s12      '''00000000-0000-4000-d000-000000000012'''
\set s13      '''00000000-0000-4000-d000-000000000013'''
\set s14      '''00000000-0000-4000-d000-000000000014'''
\set s15      '''00000000-0000-4000-d000-000000000015'''
\set s16      '''00000000-0000-4000-d000-000000000016'''
\set s17      '''00000000-0000-4000-d000-000000000017'''
\set s21      '''00000000-0000-4000-d000-000000000021'''
\set s31      '''00000000-0000-4000-d000-000000000031'''
\set t1       '''00000000-0000-4000-e000-000000000001'''
\set t2       '''00000000-0000-4000-e000-000000000002'''
\set t3       '''00000000-0000-4000-e000-000000000003'''
\set a1       '''00000000-0000-4000-f000-000000000001'''
\set tok_t1   '''altlink-termin1-aaaaaaaaaaaaaaaa'''
\set tok_t2   '''altlink-termin2-bbbbbbbbbbbbbbbb'''
\set tok_a1   '''altlink-alternativ1-dddddddddddd'''

-- Rollenwechsel wie PostgREST: SET ROLE + JWT-Claim
\set als_anon 'reset role; select set_config(''request.jwt.claim.sub'', '''', true), set_config(''request.jwt.claims'', ''{"role":"anon"}'', true); set local role anon;'
\set als_admin 'reset role; select set_config(''request.jwt.claim.sub'', ''00000000-0000-4000-a000-0000000000a1'', true), set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}'', true); set local role authenticated;'
\set als_mf1 'reset role; select set_config(''request.jwt.claim.sub'', ''00000000-0000-4000-a000-0000000000b1'', true), set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-4000-a000-0000000000b1","role":"authenticated"}'', true); set local role authenticated;'
\set als_mf2 'reset role; select set_config(''request.jwt.claim.sub'', ''00000000-0000-4000-a000-0000000000b2'', true), set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-4000-a000-0000000000b2","role":"authenticated"}'', true); set local role authenticated;'
\set als_ohne 'reset role; select set_config(''request.jwt.claim.sub'', ''00000000-0000-4000-a000-0000000000c1'', true), set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-4000-a000-0000000000c1","role":"authenticated"}'', true); set local role authenticated;'
\set als_postgres 'reset role; select set_config(''request.jwt.claim.sub'', '''', true);'
