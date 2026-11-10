// ============================================================
// Zentrale Konfiguration (öffentlich auslieferbar)
// ------------------------------------------------------------
// Der Publishable Key ist für den Browser bestimmt; die Sicherheit
// beruht ausschließlich auf RLS und den Serverfunktionen.
// Niemals einen service_role-/Secret-Key hier eintragen.
// Für Titan_Ghost später nur diese Datei anpassen.
// ============================================================
(function (root) {
  var APP_CONFIG = Object.freeze({
    SUPABASE_URL: 'https://nwutgxjnverlvmkrpiep.supabase.co',
    SUPABASE_ANON: 'sb_publishable_09tn0DY3wswcIVQ-mN1S8A_znKWQXaF',
    BASIS_URL: 'https://spielplanapp.christianaust.eu/',
    VEREIN_KUERZEL: 'fcstrass',
    // Reiter „Turnier-Helfer“ im Leitstand (nur Admin). Standardmäßig aus;
    // Funktion, helfer.html und Daten (turnier_helfer) bleiben erhalten.
    // Reaktivieren: auf true setzen.
    TURNIER_HELFER_ANZEIGEN: false
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = APP_CONFIG;
  else root.APP_CONFIG = APP_CONFIG;
})(this);
