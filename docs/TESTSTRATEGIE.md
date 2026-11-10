# Teststrategie

Grundsatz: Getestet wird ausschließlich lokal, isoliert und mit **synthetischen
Daten**. Kein Test verbindet sich mit der Produktivdatenbank. Keine Datei unter
`tests/` oder `supabase/tests/` enthält echte Namen, Tokens oder Schlüssel.

## Ebenen

| Ebene | Werkzeug | Befehl | Inhalt |
|---|---|---|---|
| Unit | `node:test` | `npm test` | Escaping, Tokenformat, Fehlertexte, Datum, Halbrunde/Saison, CSV-Parser und -Validierung, Dubletten, WhatsApp-Texte |
| DOM | `node:test` + jsdom, Supabase-Mock | `npm test` | Spielerseite, Helfer, Login, Leitstand: XSS-Payloads bleiben Text, nur RPCs auf öffentlichen Seiten, kein Browser-Speicher, Spaltenlisten, Halbrundenfilter, WhatsApp, Aufstellung/Verschiebung über RPC, Fehleranzeigen |
| Statisch | `node:test` | `npm test` | Referrer-Meta, Versionen + SRI, kein `select('*')`, keine Secrets/JWTs, kein `Math.random`, zentrale Konfiguration, Escaping-Heuristik, RPC-Signaturen passen zu den Migrationen, Migrationen transaktional, SECURITY DEFINER mit `search_path`, keine `sr_*`-Tabellen |
| Datenbank | pgTAP im flüchtigen Docker-Container `supabase/postgres:17.6.1.136` | `npm run test:db` | siehe unten |

## Datenbanktests (`scripts/db-test.sh`)

1. Container nur an `127.0.0.1:55432`, Daten im RAM (tmpfs). Er wird nach dem
   Lauf entfernt (`KEEP_DB=1` behält ihn).
2. Baseline (nachgebildeter Produktiv-Ist-Zustand) + `_seed.sql` (synthetisch)
3. `10_ist_zustand_unsicher`: weist die Audit-Befunde nach
4. Migrationen 01–04, danach 01/02/04 erneut (**Idempotenz**)
5. `20_rollen` (Selbstvergabe von Adminrechten, letzter Admin),
   `30_mannschaftsgrenzen` (fremde Mannschaft lesen/schreiben, Trigger,
   Tokens), `40_spielerlinks` (gültige/ungültige/abgelaufene/widerrufene
   Tokens, persönliche Links, Dubletten, Nachmeldung, Rechte),
   `50_transaktionen` (Verschiebung, Aufstellung), `60_terminimport`
   (Vorschau, Validierung, Dubletten, alles oder nichts),
   `70_altpfad_kompatibel` (altes Frontend funktioniert, sieht weniger)
6. Migration 09 → `80_anon_entzogen` + `40_spielerlinks` erneut
7. Rückfall R09 → `70` erneut → 09 erneut → `80` erneut

Rollenwechsel wie bei PostgREST: `SET LOCAL ROLE anon|authenticated` und
`request.jwt.claim.sub`. Jeder Test läuft in `BEGIN … ROLLBACK`.

## Vor jedem Merge nach `main`

`npm run test:alle` muss grün sein. Das Ergebnis gehört in die PR-Beschreibung.

## Staging (echter Stack + Browser)

`scripts/staging.sh lauf01` und `scripts/staging.sh laufrollout`: siehe `docs/STAGING.md`.
Damit sind die früheren Lücken T1 (echter PostgREST/GoTrue-Stack) und T2 (Chromium und
WebKit iPhone) geschlossen, ebenso T3 (Exporte: PDF und Excel werden erzeugt und als
Download geprüft).

## Verbleibende Lücken

* Echte Endgeräte (iOS/Android) und das Öffnen der WhatsApp-App: nur manuell
  bei der Funktionsprobe nach dem Frontend-Rollout.
* Die Staging-DB ist die Baseline mit synthetischen Daten. Die Produktionsstruktur
  ist per Vorabprüfung abgeglichen, die Produktionsdaten werden nie kopiert.
