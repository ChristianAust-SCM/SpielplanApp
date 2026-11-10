# Spielplan-App 2.0 – Bestandsanalyse und Entwicklungsplan

> **Statusupdate 09./10.11.2026 (Nachtarbeit)**: Inzwischen liegt ein
> Strukturaudit der Produktiv-DB vor (`docs/SICHERHEITSMODELL.md`, Abschnitt 1).
> Damit sind mehrere Aussagen unten präzisiert:
> * D1 (Dubletten) ist **kein** Problem – produktiv gilt bereits
>   `UNIQUE NULLS NOT DISTINCT (spieltermin_id, alternativtermin_id, spieler_id)`.
> * S2/S4 sind bestätigt und um die Selbstvergabe von Adminrechten (A1) ergänzt.
>
> | Phase | Stand |
> |---|---|
> | 0 Fundament | ✅ Baseline rekonstruiert, Tests (JS + pgTAP), zentrale Konfiguration. Offen: Abgleich echter Spaltenliste (Vorabprüfung), Supabase-Stack-Test (T1) |
> | 1 Sicherheit | ✅ Migrationen 01–03, 09 + Frontend (XSS, RPCs, SRI, Referrer). **Nicht angewendet.** Offen: Entscheidung persönliche Links, CSP |
> | 2 Rückrunde | ✅ Umschalter, Saison, `min_spieler`, CSV-Import mit Vorschau (Migration 04). Offen: echte Termine (nicht importiert), Mannschaftsstärken setzen |
> | 3 Leitstand | ◐ Fehlerbehandlung, Anmerkungen, Erinnerung, Modale vereinheitlicht. Offen: Modularisierung, Inline-Handler → CSP, Kaderverwaltung |
> | 4 Mobile | ◐ Tabellen scrollbar, Touch-Ziele, kein iOS-Zoom. Rest nach Designabstimmung |
> | 5 Aufstellung/Kommunikation | ◐ Erinnerungstext. Rest offen |

Stand: 09.11.2026 · Branch `develop/spielplan-app-2.0` · Basis: `main` @ `65ceb9f`

Grundlage ist ausschließlich der Quellcode im Repository. Die Produktivdatenbank
wurde **nicht** abgefragt; Aussagen zum tatsächlichen DB-Schema und zu den
RLS-Policies sind daher aus dem Code abgeleitet und müssen verifiziert werden.

---

## 1. Vorhandene Funktionen

**Leitstand (`index.html` + `app.js`, Login erforderlich)**
- Mannschafts-Tabs gemäß Rollen des Nutzers (`nutzer_rollen`)
- Kennzahlen: Spieltage gesamt, Abfragen offen, zu wenig Zusagen, spielbereit
- Spielplantabelle je Mannschaft: Datum, Heim/Auswärts, Gegner, Ja/Vielleicht/Nein,
  Rücklauf „x / Kader“, Statusbadges (Verschoben, Verschiebung nötig, Aufstellung gesetzt)
- Abfrage-Link öffnen; WhatsApp-Text erzeugen, kopieren und `wa.me` öffnen
- Modal „Fehlende Rückmeldungen“ (wer hat/hat nicht geantwortet)
- Verschiebungs-Workflow:
  - MF: Alternativtermine anlegen/löschen, eigener Abfragelink je Alternativtermin,
    Verschiebungsbedarf melden/zurückziehen (Status `Verschiebung nötig`)
  - Admin: Abstimmungsergebnis je Alternativtermin, Termin bestätigen (Stimmen werden
    übernommen) oder eigenen Termin setzen (neuer Token, Neuabstimmung)
- Aufstellung: Auswahl aus Ja/Vielleicht-Spielern, genau `min_spieler` Plätze,
  Platzhalter „Ersatz · 3. Mannschaft“ (nur für die 2. Mannschaft)
- Export (`export.js`): Verfügbarkeiten als Excel/PDF, Aufstellungen als Excel/PDF
- Turnier-Helfer-Übersicht (nur Admin) mit Einladungstext

**Spielerseite (`spieler.html`, ohne Login)** – siehe Abschnitt 2

**Helferseite (`helfer.html`, ohne Login)** – Name, Einsatzbereich, Anmerkung →
Insert in `turnier_helfer`

**Nicht (mehr) referenziert:** `zeigeDetail()` in `app.js` (toter Code).

## 2. Aufbau der Spielerabfrage ohne Login

1. MF verschickt Link `spieler.html?token=<abfrage_token>` (bzw. `?alt=<token>` für
   Alternativtermine) per WhatsApp.
2. Seite lädt mit dem Publishable Key als Rolle `anon` den Termin per
   `.eq('abfrage_token', token)` und danach **alle aktiven Spieler** der Mannschaft.
3. Spieler wählt seinen Namen aus der Liste (keine Identitätsprüfung), Antwort
   Ja/Vielleicht/Nein, optional Anmerkung.
4. Speichern per `upsert` in `verfuegbarkeiten`
   (`onConflict: spieltermin_id, alternativtermin_id, spieler_id`) – erneutes
   Absenden überschreibt die Antwort.
5. „Ich stehe nicht in der Liste“: legt als `anon` einen **neuen aktiven Spieler**
   in `spieler` an und speichert dann die Antwort.

Der Token wirkt nur als „Adresse“ für die Seite. Die Datenbankzugriffe selbst sind
nicht an den Token gebunden (siehe Schwachstellen S1/S2).

## 3. Mannschaftsführer- und Adminfunktionen

- Anmeldung über Supabase Auth (E-Mail/Passwort), Session im Browser (localStorage).
- Rollen aus Tabelle `nutzer_rollen` (`user_id`, `mannschaft_id`, `rolle`); Admin =
  mindestens eine Rolle `admin`.
- Die Unterscheidung MF/Admin erfolgt **nur im Frontend** (`istAdmin`). Ob die
  Datenbank Schreibrechte nach Mannschaft/Rolle einschränkt, ist im Repo nicht
  dokumentiert und muss geprüft werden.
- MF-Schreibzugriffe: `alternativtermine` (insert/delete), `spieltermine.status`,
  `aufstellungen` (delete + insert), `verfuegbarkeiten` (delete).
- Admin zusätzlich: `spieltermine` Datum/Uhrzeit/Status/Token, Stimmenübernahme,
  `turnier_helfer` lesen.

## 4. Supabase-Anbindung

- Projekt-URL und **Publishable Key** stehen fest im Code von 5 Dateien
  (`app.js`, `login.html`, `spieler.html`, `helfer.html`; `export.js` nutzt `sb` aus `app.js`).
  Ein Publishable Key darf öffentlich sein – die Sicherheit hängt vollständig an RLS.
- ~44 direkte Aufrufe von `sb.from(...)`/`sb.auth` verteilt über alle Dateien,
  keine Datenzugriffsschicht, keine RPC-Funktionen.
- **Tatsächlich genutzte Tabellen/Spalten** (aus dem Code), die in `schema.sql`
  fehlen oder abweichen:

| Objekt | Abweichung zu `schema.sql` |
|---|---|
| `nutzer_rollen` | fehlt komplett |
| `alternativtermine` (inkl. `abfrage_token`) | fehlt komplett |
| `aufstellungen` (`spieler_id` nullable, `ersatz_mannschaft_id`) | fehlt komplett |
| `turnier_helfer` | fehlt komplett |
| `verfuegbarkeiten.alternativtermin_id` | fehlt; Unique-Key anders |
| `verfuegbarkeiten.antwort = 'Vielleicht'` | Schema erlaubt nur `Ja/Nein/Bedingt` |
| `spieltermine.status = 'Verschiebung nötig'` | im Check-Constraint nicht enthalten |
| `spieler.position`, `mannschaften.min_spieler` | fehlen |
| RLS: anon-Insert in `spieler`, `turnier_helfer`; Policies für MF-Schreibrechte | nicht dokumentiert |

→ Das Repository enthält **keine verlässliche Beschreibung der Produktiv-DB**.
Vor jeder Migration muss ein Schema-Dump (nur Struktur, ohne Daten) mit
Freigabe erstellt und versioniert werden.

## 5. Technische Abhängigkeiten

| Abhängigkeit | Einbindung | Bemerkung |
|---|---|---|
| `@supabase/supabase-js@2` | jsDelivr, **unversioniert (Major-Tag)**, ohne SRI | jede neue 2.x-Version wird ungeprüft geladen |
| ExcelJS 4.4.0 | unpkg, dynamisch | ohne SRI |
| jsPDF 2.5.1 + autotable 3.8.2 | cdnjs, dynamisch | ohne SRI |
| Supabase (Postgres, PostgREST, Auth) | gehostet | Auth-Bindung erschwert Migration |
| Hosting | statisch, `spielplanapp.christianaust.eu` | Basis-URL hart codiert (5×) |
| Build/Tests/Lint | – | nicht vorhanden; kein `package.json` |
| Git-Historie | nur „Add files via upload“ | Änderungen nicht nachvollziehbar |

## 6. Erkannte Schwachstellen

### Sicherheit (priorisiert)

| # | Schwere | Befund |
|---|---|---|
| S1 | **Kritisch** | **Stored XSS → Übernahme von MF/Admin-Sitzungen.** Anonym anlegbare Spielernamen („nicht in der Liste“) und Anmerkungen werden in `app.js` und `spieler.html` ungefiltert per `innerHTML` gerendert. Ein präparierter Name führt Script im eingeloggten Leitstand aus; die Supabase-Session liegt im localStorage. Escaping existiert nur in der Helferansicht. |
| S2 | **Kritisch** (laut `schema.sql`) | **Offene RLS:** `select using (true)` auf allen Tabellen → jeder mit dem öffentlichen Key liest alle Spieler, TTR, MF-E-Mails, Verfügbarkeiten und **alle Abfrage-Tokens**. `insert/update with check (true)` auf `verfuegbarkeiten` → beliebige Antworten aller Spieler fälschbar. Produktivstand unbekannt, wahrscheinlich ähnlich. |
| S3 | Hoch | `anon` darf Zeilen in `spieler` anlegen → Spam/Kaderverschmutzung, Einfallstor für S1. |
| S4 | Hoch (zu prüfen) | Rollen nur im Frontend. Falls Policies „authenticated darf alles“ lauten, kann jeder MF fremde Mannschaften ändern und Admin-Aktionen ausführen. |
| S5 | Mittel | `turnier_helfer`: anonymer Insert ohne Limit/Validierung; Leserechte prüfen (Namen). |
| S6 | Mittel | Neue Abfrage-Tokens per `Math.random()` im Browser (nicht kryptografisch). |
| S7 | Mittel | CDN-Skripte unversioniert/ohne SRI, keine Content-Security-Policy. |
| S8 | Niedrig | Fehlermeldungen der DB werden roh angezeigt; Login ohne Rate-Limit-Hinweis/Passwort-Reset. |

### Datenintegrität / Fehler

| # | Befund |
|---|---|
| D1 | Unique-Key `(spieltermin_id, alternativtermin_id, spieler_id)` mit `alternativtermin_id = NULL`: In Postgres sind NULL-Werte standardmäßig verschieden → **Upsert erzeugt bei normalen Terminen Duplikate** statt zu überschreiben (sofern nicht `NULLS NOT DISTINCT`). Zählungen wären dann doppelt. In Produktion prüfen. |
| D2 | Verschiebung (`_verschiebungFertigstellen`) und Aufstellung (delete → insert) sind mehrstufig ohne Transaktion → bei Abbruch Datenverlust (z. B. Stimmen gelöscht, Übernahme fehlgeschlagen). |
| D3 | `min_spieler` wird nicht mit abgefragt (`select` enthält die Spalte nicht) → Mindestzahl ist faktisch immer 6. |
| D4 | `loescheAlternativtermin` schließt per `querySelector('[style*="fixed"]')` das erste Modal; Löschvorgänge ohne Fehlerprüfung. |
| D5 | Hart codiert: Saison/„Vorrunde 2026/27“, Turnierdatum, Teamname „3. Mannschaft“, Basis-URL, Ersatzregel nur für 2. Mannschaft. Keine Filterung nach `halbrunde`. |
| D6 | WhatsApp-Text wird in `onclick`-Attribute eingebettet, nur `'` escaped → Sonderzeichen in Gegnernamen brechen Buttons. |
| D7 | Datumsparsing `new Date('YYYY-MM-DD')` (UTC) – in DE unkritisch, aber fehleranfällig. |

### Wartbarkeit
- `app.js` ~1.200 Zeilen mit sehr viel Inline-CSS in String-HTML; Rendering, Logik
  und Datenzugriff vermischt; Code für Alternativtermin-Listen dreifach dupliziert.
- Keine Tests, keine Typen, kein Linting.

---

## 7. Entwicklungsplan

Grundsätze: alles auf `develop/spielplan-app-2.0` bzw. Feature-Branches davon;
lokale Supabase-Instanz für Entwicklung und Tests; keine Produktivzugriffe ohne
Freigabe; kein Redesign.

### Phase 0 – Fundament (Voraussetzung für alles Weitere)
1. **Schema-Abgleich (Freigabe nötig):** Struktur-Dump der Produktiv-DB
   (`supabase db dump --schema-only`, ohne Daten) inkl. Policies, Constraints,
   Funktionen. Als Baseline-Migration versionieren; `schema.sql` ersetzen.
2. Lokale Umgebung: `supabase/` mit `config.toml`, Baseline-Migration, Seed mit
   anonymisierten Testdaten (keine Echtdaten).
3. Konfiguration zentralisieren (`config.js`: Supabase-URL, Key, Basis-URL, Saison).
4. Testinfrastruktur: `package.json`, Vitest für Logik, **pgTAP** für RLS/Funktionen,
   Playwright für E2E-Smoke (Spielerabfrage, Login, Leitstand). CI-Workflow nur
   für Tests (kein Deployment).
5. Datenzugriffsschicht `data/` einführen (bündelt alle DB-Aufrufe) – erleichtert
   später den Wechsel auf Titan_Ghost.

### Phase 1 – Sicherheitskorrekturen (höchste Priorität)
1. **XSS beheben:** zentrale `escapeHtml`, alle Datenfelder escapen; Event-Handler
   per `addEventListener`/`data-*` statt String-`onclick` (behebt auch D6).
2. **Spielerabfrage auf Token-RPC umstellen** (`SECURITY DEFINER`-Funktionen):
   - `abfrage_laden(token)` → Termin + Spielernamen (nur was die Seite braucht)
   - `abfrage_antworten(token, spieler_id, antwort, anmerkung)` → prüft Token,
     Spielerzugehörigkeit, Wertebereich, Länge der Anmerkung
   - `abfrage_nachmeldung(token, name)` → legt Spieler als **„unbestätigt/inaktiv“**
     an; MF bestätigt im Leitstand.
   Links und URL-Format bleiben unverändert.
3. **RLS härten:** `anon` keinerlei direkten Tabellenzugriff mehr (außer ggf.
   Helfer-Insert über RPC); `authenticated` nur Mannschaften laut `nutzer_rollen`,
   Admin-Aktionen per Rollenprüfung in der DB (Hilfsfunktionen `ist_admin()`,
   `ist_mf_von(mannschaft_id)`).
4. Token-Erzeugung nur serverseitig (`gen_random_bytes`).
5. D1 beheben: Unique-Index mit `NULLS NOT DISTINCT` (bzw. zwei Teilindizes),
   vorher Duplikate identifizieren (nur lesend, mit Freigabe) und bereinigen.
6. D2 beheben: `termin_verschieben(...)` und `aufstellung_speichern(...)` als
   transaktionale DB-Funktionen.
7. Bibliotheken pinnen + SRI, Content-Security-Policy.
8. pgTAP-Tests für jede Policy (anon / MF fremde Mannschaft / MF eigene / Admin).
   Rollout in Produktion erst nach Freigabe, mit Backup und Rückfallplan.

### Phase 2 – Rückrunde 2026/27
1. Saison- und Halbrundenbezug: `halbrunde` im Leitstand filtern
   (Umschalter Vorrunde/Rückrunde, Standard = aktuelle Halbrunde); Überschrift dynamisch.
2. Optional Tabelle `saisons` statt Freitext, damit Folgesaisons ohne Codeänderung gehen.
3. Import der Rückrundentermine (CSV-Import im Admin-Bereich bzw. Migration mit
   Freigabe); Validierung gegen Doppelungen.
4. Vorrundendaten bleiben unverändert (nur additive Änderungen); Exporte je Halbrunde.
5. Kaderwechsel zur Rückrunde (Spieler aktiv/inaktiv, Wechsel zwischen Mannschaften,
   `position`, `min_spieler` je Mannschaft korrekt laden – D3).
6. Zeitplan: Rückrunde beginnt i. d. R. ab Januar → Phase 1 + 2 sollten bis
   **Mitte Dezember 2026** fertig getestet sein.

### Phase 3 – Modernisierung Mannschaftsführer-Leitstand
1. `app.js` modularisieren (ES-Module: `data/`, `ui/`, `features/verschiebung`,
   `features/aufstellung`, `features/export`); Inline-Styles in CSS-Klassen
   überführen **ohne optische Änderung**.
2. Eigene Modal-Komponente (sauberes Schließen, kein `[style*=fixed]`-Selektor).
3. Admin-Funktionen in eigenen Bereich: Spieler/Kader verwalten, Nachmeldungen
   bestätigen, Termine anlegen/bearbeiten, Rollen vergeben.
4. Erinnerungsfunktion: Liste „noch nicht geantwortet“ mit vorbereitetem
   WhatsApp-Text für genau diese Spieler.
5. Hart codierte Werte (Teamnamen, Ersatzregel, Turnier) in Konfiguration/DB.

### Phase 4 – Mobile Spieleransicht
1. `spieler.html` für Smartphones optimieren (große Touch-Ziele, schnelle Ladezeit),
   gestalterisch nach separater Designabstimmung.
2. Wiedererkennung ohne Login: zuletzt gewählter Name im localStorage vorbelegen.
3. Optional Mannschafts-Übersichtslink (`?team=<token>`): alle offenen Termine der
   Halbrunde auf einer Seite beantworten; eigener Token je Mannschaft, rein lesend/
   antwortend über RPC.
4. Anzeige der eigenen bisherigen Antwort beim erneuten Öffnen.

### Phase 5 – Aufstellungen und Kommunikation
1. Aufstellung mit Reihenfolge/Position und Doppeln, Ersatzspieler aus anderen
   Mannschaften mit Namen (statt Platzhalter) gemäß Ersatzspielerregeln.
2. Status „Aufstellung veröffentlicht“ + Link/WhatsApp-Text an die Mannschaft
   (Treffpunkt, Uhrzeit, Fahrer, Halle).
3. Spieler-Bestätigung der Nominierung über denselben Link (ohne Login).
4. Kommunikationsvorlagen (Abfrage, Erinnerung, Aufstellung, Verschiebung) zentral
   pflegbar.
5. Später optional: E-Mail/Push-Benachrichtigung (erst nach Datenschutzprüfung).

### Migration Titan_Ghost (begleitend)
- Fachlogik als Standard-PostgreSQL-Funktionen → portabel.
- Supabase-Abhängigkeiten: Auth (`auth.users`, `auth.uid()` in Policies), PostgREST,
  JS-Client. Für den Umzug: PostgREST selbst betreiben oder schmale API-Schicht;
  Auth-Ersatz (z. B. eigener Auth-Dienst) kapseln.
- Policies nach Möglichkeit auf Hilfsfunktionen stützen (`aktueller_nutzer()`),
  damit nur eine Stelle angepasst werden muss.

## 8. Empfohlene Reihenfolge

1. Phase 0.1 Schema-Abgleich (**Freigabe für lesenden Struktur-Dump erforderlich**)
2. Phase 0.2–0.4 lokale Umgebung + Tests
3. Phase 1 Sicherheitskorrekturen (XSS zuerst – rein Frontend, sofort umsetzbar)
4. Phase 2 Rückrunde 2026/27 (zeitkritisch)
5. Phase 3 Leitstand-Modernisierung
6. Phase 4 Mobile Spieleransicht (nach Designabstimmung)
7. Phase 5 Aufstellungen und Kommunikation

## 9. Offene Fragen an Christian

- Freigabe für einen lesenden Schema-Dump (nur Struktur, keine Daten) der Produktiv-DB?
- Wo wird gehostet und wie wird aktuell deployed?
- Ab wann soll die Rückrunde in der App verfügbar sein (erster Spieltag)?
- Ist `min_spieler` je Mannschaft unterschiedlich (z. B. 4er-Mannschaften)?
- Ist die Helferseite (Turnier 05.09.2026) noch nötig oder kann sie archiviert werden?
