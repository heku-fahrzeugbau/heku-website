/* ============================================================
   HEKU Consent Manager
   Muss VOR dem gtag.js-Script im <head> geladen werden.

   Funktion:
   1. Setzt Google Consent Mode v2 auf "denied" als Standard.
      GA4 laedt zwar, setzt aber keine Cookies und uebertraegt
      keine identifizierenden Daten, bis eingewilligt wurde.
   2. Zeigt einen Banner mit gleichwertigen Buttons
      (Ablehnen ist genauso prominent wie Akzeptieren).
   3. Gibt bei Einwilligung Analytics frei und laedt eingebettete
      Karten nach (data-consent-src).
   4. Speichert die Entscheidung 6 Monate in localStorage.
   ============================================================ */
(function () {
  "use strict";

  var KEY = "heku_consent_v1";
  var MAX_AGE_DAYS = 180;

  /* --- 1. Consent Mode v2: Standard ist Ablehnung --------------- */
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
    functionality_storage: "granted",
    security_storage: "granted",
    wait_for_update: 500
  });

  /* --- 2. Gespeicherte Entscheidung lesen ----------------------- */
  function readStored() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      var ageDays = (Date.now() - o.ts) / 86400000;
      if (ageDays > MAX_AGE_DAYS) { localStorage.removeItem(KEY); return null; }
      return o.analytics === true ? "granted" : "denied";
    } catch (e) { return null; }
  }

  function store(granted) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ analytics: granted, ts: Date.now() }));
    } catch (e) { /* Privatmodus, dann eben nur fuer diese Sitzung */ }
  }

  function applyAnalytics(granted) {
    gtag("consent", "update", {
      analytics_storage: granted ? "granted" : "denied"
    });
    if (granted) loadDeferredEmbeds();
  }

  /* --- 3. Eingebettete Inhalte erst nach Einwilligung ------------ */
  function loadDeferredEmbeds() {
    var nodes = document.querySelectorAll("[data-consent-src]");
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var src = n.getAttribute("data-consent-src");
      if (!src) continue;
      n.setAttribute("src", src);
      n.removeAttribute("data-consent-src");
      var ph = document.querySelector('[data-consent-placeholder="' + n.id + '"]');
      if (ph) ph.style.display = "none";
      n.style.display = "block";
    }
  }
  window.hekuLoadEmbeds = loadDeferredEmbeds;

  /* --- 4. Banner ------------------------------------------------- */
  var CSS = ''
    + '.heku-cc{position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#0A0A0A;'
    + 'color:#fff;padding:20px 24px;box-shadow:0 -8px 32px rgba(0,0,0,.35);'
    + 'font-family:"DM Sans",system-ui,sans-serif;display:none;}'
    + '.heku-cc.show{display:block;}'
    + '.heku-cc-in{max-width:1040px;margin:0 auto;display:flex;gap:24px;align-items:center;'
    + 'flex-wrap:wrap;justify-content:space-between;}'
    + '.heku-cc-txt{font-size:13.5px;line-height:1.6;color:rgba(255,255,255,.72);flex:1 1 420px;}'
    + '.heku-cc-txt strong{color:#fff;font-weight:600;display:block;margin-bottom:5px;font-size:14.5px;}'
    + '.heku-cc-txt a{color:#E8000E;text-decoration:underline;}'
    + '.heku-cc-btns{display:flex;gap:10px;flex:0 0 auto;}'
    + '.heku-cc-btn{font:inherit;font-size:13px;font-weight:600;padding:11px 22px;border-radius:6px;'
    + 'cursor:pointer;border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;'
    + 'transition:background .18s,border-color .18s;white-space:nowrap;}'
    + '.heku-cc-btn:hover{background:rgba(255,255,255,.09);}'
    + '.heku-cc-btn.acc{background:#E8000E;border-color:#E8000E;}'
    + '.heku-cc-btn.acc:hover{background:#c40009;border-color:#c40009;}'
    + '@media(max-width:640px){.heku-cc{padding:16px 18px 20px;}'
    + '.heku-cc-in{gap:14px;}.heku-cc-btns{width:100%;}.heku-cc-btn{flex:1;padding:12px 10px;}}';

  /* Umlaute als Unicode-Escapes: funktioniert unabhaengig von der
     Zeichenkodierung, mit der der Server diese Datei ausliefert. */
  var HTML = ''
    + '<div class="heku-cc-in">'
    + '  <div class="heku-cc-txt">'
    + '    <strong>Ihre Entscheidung \u00fcber Cookies</strong>'
    + '    Wir nutzen Google Analytics, um zu verstehen, wie unsere Website genutzt wird, '
    + '    und Google Maps zur Anzeige unseres Standorts. Beides setzt Cookies und \u00fcbertr\u00e4gt '
    + '    Daten an Google. Das geschieht nur mit Ihrer Einwilligung. '
    + '    Ohne Einwilligung funktioniert die Website vollst\u00e4ndig. '
    + '    Mehr dazu in der <a href="/datenschutz.html">Datenschutzerkl\u00e4rung</a>.'
    + '  </div>'
    + '  <div class="heku-cc-btns">'
    + '    <button type="button" class="heku-cc-btn" data-cc="deny">Ablehnen</button>'
    + '    <button type="button" class="heku-cc-btn acc" data-cc="allow">Einverstanden</button>'
    + '  </div>'
    + '</div>';

  function renderBanner() {
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    var el = document.createElement("div");
    el.className = "heku-cc";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Cookie-Einstellungen");
    el.innerHTML = HTML;
    document.body.appendChild(el);

    el.addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-cc]");
      if (!b) return;
      var granted = b.getAttribute("data-cc") === "allow";
      store(granted);
      applyAnalytics(granted);
      el.classList.remove("show");
    });

    requestAnimationFrame(function () { el.classList.add("show"); });
  }

  /* Erlaubt einen Link "Cookie-Einstellungen aendern" im Footer:
     <a href="#" onclick="hekuResetConsent();return false;">Cookie-Einstellungen</a> */
  window.hekuResetConsent = function () {
    try { localStorage.removeItem(KEY); } catch (e) {}
    location.reload();
  };

  /* --- 5. Start -------------------------------------------------- */
  function init() {
    var stored = readStored();
    if (stored === "granted") { applyAnalytics(true); return; }
    if (stored === "denied")  { applyAnalytics(false); return; }
    renderBanner();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
