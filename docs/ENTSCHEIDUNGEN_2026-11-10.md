# Entscheidungen vom 10.11.2026

1. **Turnier-Helfer ausgeblendet.** Der Reiter „Turnier-Helfer“ im Leitstand ist standardmäßig aus
   (`js/config.js`: `TURNIER_HELFER_ANZEIGEN: false`). Funktion, `helfer.html`, Serverfunktion
   `helfer_eintragen` und alle Daten in `turnier_helfer` bleiben erhalten.
   **Reaktivieren:** Wert auf `true` setzen, Tests laufen lassen, veröffentlichen (Freigabe).
2. **Adresse Rückrunde 2026/27:** bleibt `https://spielplanapp.christianaust.eu/`.
3. **Saison 2027/28: geplanter Wechsel auf `fcstrass.tischtennis.pro`** – nur dokumentiert.
   Noch keine DNS-, Hosting- oder Auth-Änderungen. Später betroffen: `BASIS_URL` in `js/config.js`,
   Supabase-Auth (Site-URL/Redirects), GitHub-Pages-Domain, bereits verschickte Links (Weiterleitung nötig).
4. **SR-Anwendung unter `tischtennis.pro`** darf durch den Wechsel nicht beeinträchtigt werden
   (eigene Subdomain, keine Änderung bestehender DNS-Einträge der SR-Anwendung).
5. **Premium-Design:** als mögliche spätere optische Verbesserung vorgemerkt; Umsetzung nur mit gesondertem Auftrag.
