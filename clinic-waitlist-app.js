/* =========================================================================
   FORTA — HOUSTON CLINIC WAITLIST APP  (clinic-waitlist-app.js, v1)
   -------------------------------------------------------------------------
   Runs on:  fortahealth.com/clinic/houston-waitlist (Webflow page
             "Houston Waitlist", page id 6a5457844fabb6487a581a55).
             "Clinic coming soon" waitlist lander for Forta's first
             in-person clinic — Sugar Land (SW Houston). 40 founding
             spots. Clinic hours 8:30–5:30, Monday–Friday.
   Based on: in-home-app.js v3 (same SF field IDs, same hf-* form UI,
             same page interactions). Differences:
             - NO ZIP qualification / coverage CDN. Every family can join
               the waitlist. State fixed to TX; payor list filtered to TX.
             - NO MQL/DQ routing tree. MQL Status sent BLANK (sales filters
               on Requested Service instead — confirm w/ Will if a proper
               waitlist status value gets added to the picklist).
             - Requested Service (00NRc00000qudCY) = "In Clinic"  ← the
               whole point: sales can see + filter clinic waitlist leads.
             - NEW step 3 question: preferred session time (Mornings /
               Mid-day / Afternoons / Flexible) — clinic is open 8:30–5:30
               M–F. No dedicated SF field exists yet, so it's sent in the
               standard Lead `description` field (searchable in SF).
             - retURL returns to THIS page with ?submitted=1 → inline
               thank-you (works on staging + production without a
               dedicated thank-you page).
   Hosted:   inline (HTML Embed inside the ".clw-page-code" div at the
             bottom of the page body). API strips scripts — paste manually.
   Testing:  window.__clwDryRun = true → submit → window.__clwLastPayload.
   v2 (Will, 7/14): contact-first step order (contact → ZIP+insurance →
   child → schedule → lead source); insurance state auto-picked from ZIP
   (range table) and user-overridable — drives payor filtering + SF state;
   hours capped at 40; "Billboard" lead source (→ "Another option" in SF,
   raw value kept in description); consent links to the Electronic
   Communications Policy.
   v3 (Will, 7/14): In-Home cross-sell. (a) A page module ("clw-inhome"
   section, injected before the FAQ) markets In-Home ABA as the "start now"
   option — where it's available + why apply + priority-for-clinic hook,
   linking to /in-home/houston. (b) On the last form step, when the entered
   ZIP QUALIFIES for In-Home (checked against the same zip_code_coverage.json
   the in-home app uses), an interest question appears ("get a jump-start;
   families already in therapy get priority for founding clinic spots").
   Answer rides in the Lead description (no dedicated SF field yet); the
   "available in your area" claim only shows for genuinely covered ZIPs.
   ========================================================================= */
(function () {
  'use strict';

  if (window.__clwAppLoaded) return;
  window.__clwAppLoaded = true;

  /* ============================ CONFIG ================================== */

  var SF = {
    ENDPOINT: 'https://webto.salesforce.com/servlet/servlet.WebToLead?encoding=UTF-8',
    OID: '00D8b000002cl8t',
    COMPANY: 'July2026',

    F_MQL_STATUS: '00NRc00000Nxa1C',
    F_GCLID: '00N8b00000GjstL',
    F_UTM_SOURCE: '00NRc0000083yKn',
    F_UTM_MEDIUM: '00NRc0000083yW5',
    F_UTM_CAMPAIGN: '00NRc0000083yhN',
    F_UTM_CONTENT: '00NRc0000083pBL',
    F_UTM_DOMAIN: '00NRc00000D4OSr',
    F_UTM_ADSET: '00NRc00000rofku',
    F_EXT_LEAD_VALUE: '00NRc00000m9vt3',
    F_DIAGNOSIS: '00N8b00000EQM2f',
    F_CHILD_AGE: '00N8b00000EQM2a',
    F_HAS_INSURANCE: '00N8b00000Bz6et',
    F_EXPECTED_HOURS: '00NRc00000NxTLk',
    F_LANGUAGE: '00NRc00000kKz0K',
    F_REQUESTED_SERVICE: '00NRc00000qudCY', // ← "In Clinic" (sales filter)
    F_INHOME_ZIP_STATUS: '00NRc00000r0X4m',
    F_TYPE_PRIMARY: '00N8b00000Bz6ey',
    F_TYPE_SECONDARY: '00NRc00000KXQa0',
    F_PAYOR_PRIMARY: '00N8b00000EQM3J',
    F_PAYOR_SECONDARY: '00NRc00000KXXrJ',
    F_BAY_PRIMARY: '00NRc00000OHqQz',
    F_STATUS_PRIMARY: '00NRc00000OHo1Z',
    F_BAY_SECONDARY: '00NRc00000OHWu6',
    F_STATUS_SECONDARY: '00NRc00000OHuZR',
    F_PHYSICIAN_PROVIDER: '00NRc00000kLEgb',
    F_LEGACY_FLAG: '00N8b00000EQM3O',

    REQUESTED_SERVICE_VALUE: 'In Clinic',

    RECAPTCHA_SITE_KEY: '6Ldp-yorAAAAAH7nTspqJRX-wZQ1HKfvJEpV3g8B',
    RECAPTCHA_FAIL_OPEN: true
  };

  var DATA = {
    ZIP_URL: 'https://cdn.prod.fortahealth.com/assets/zip_code_coverage.json',
    PAYOR_URL: 'https://cdn.prod.fortahealth.com/assets/tofu_payor_status.json'
  };

  // In-Home Houston lander — cross-sell target ("start now" option).
  var INHOME_URL = 'https://www.fortahealth.com/in-home/houston';
  // Virtual ABA get-started — fallback for families outside clinic + In-Home reach.
  var VIRTUAL_URL = 'https://www.fortahealth.com/virtual/get-started';
  // Houston metro = clinic-serviceable area (ZIP first-3 digits). 770–775 covers
  // Houston + Sugar Land + Katy + the greater Houston–Sugar Land MSA.
  var HOU_METRO_PREFIX = { '770': 1, '771': 1, '772': 1, '773': 1, '774': 1, '775': 1 };
  function houstonMetro(zip) { return /^\d{5}$/.test(zip) && !!HOU_METRO_PREFIX[zip.slice(0, 3)]; }

  /* ============================ I18N ==================================== */
  /* One embed serves both pages. Spanish (tú) renders on any /es/ path (or
     ?lang=es). Salesforce values stay English — only on-screen labels change. */
  var LANG = (/(^|\/)es(\/|$)/i.test(location.pathname) || (function(){ try { return new URLSearchParams(location.search).get('lang') === 'es'; } catch (e) { return false; } })()) ? 'es' : 'en';
  var ES = {
    'Founding waitlist': 'Lista de fundadores', '40 spots': '40 lugares', 'Step {n} of {N}': 'Paso {n} de {N}',
    'Continue →': 'Continuar →', '← Back': '← Atrás', 'Save my spot': 'Reserva mi lugar', 'Saving…': 'Enviando…',
    '🛡 Free, no deposit, no obligation. Your information stays private.': '🛡 Gratis, sin depósito y sin compromiso. Tu información se mantiene privada.',
    "You're on the list.": 'Ya estás en la lista.',
    'A care team member will reach out within one business day to confirm your spot — and you’ll be among the first to hear the clinic’s address and opening date.': 'Un miembro de nuestro equipo te contactará en un día hábil para confirmar tu lugar, y serás de los primeros en conocer la dirección y la fecha de apertura de la clínica.',
    'Save your spot': 'Reserva tu lugar',
    'Only 40 founding spots — tell us where to reach you and you’re in line. The rest takes about a minute.': 'Solo 40 lugares de fundador. Dinos cómo comunicarnos contigo y quedarás en la lista. Lo demás toma cerca de un minuto.',
    'Your name': 'Tu nombre', 'First and last name': 'Nombre y apellido', 'Email': 'Correo electrónico', 'Phone': 'Teléfono',
    'Preferred language': 'Idioma preferido', 'Select a language': 'Selecciona un idioma',
    'So our care team reaches out in the language you’re most comfortable with.': 'Para que nuestro equipo se comunique contigo en el idioma que prefieras.',
    'English': 'Inglés', 'Spanish': 'Español',
    'Location & coverage': 'Ubicación y cobertura',
    'Your ZIP and insurance help us verify coverage before opening day.': 'Tu código postal y seguro nos ayudan a verificar tu cobertura antes de la apertura.',
    'Your ZIP code': 'Tu código postal',
    'What insurance coverage do you have?': '¿Qué cobertura de seguro tienes?',
    'Primary insurance only': 'Solo seguro primario', 'Primary & secondary insurance': 'Seguro primario y secundario', 'No insurance / not sure': 'Sin seguro / no estoy seguro',
    'Insurance coverage': 'Cobertura de seguro', 'Change insurance coverage answer': 'Cambiar respuesta de cobertura',
    'We do require insurance to begin ABA therapy — and many families qualify for Medicaid. Join the waitlist now and our team will help you understand your options before opening day.': 'Sí requerimos seguro para comenzar la terapia ABA, y muchas familias califican para Medicaid. Únete a la lista ahora y nuestro equipo te ayudará a entender tus opciones antes de la apertura.',
    'Primary': 'Primario', 'Secondary': 'Secundario', 'Commercial / private': 'Comercial / privado',
    'Select your payor': 'Selecciona tu aseguradora', 'Loading payors…': 'Cargando aseguradoras…', 'My payor isn’t listed / not sure': 'Mi aseguradora no aparece / no estoy seguro',
    'Based in another state?': '¿Está en otro estado?',
    'You’re in our Houston service area — this clinic is being built for families like yours.': 'Estás en nuestra área de servicio de Houston: esta clínica se está construyendo para familias como la tuya.',
    'Tell us about your child': 'Cuéntanos sobre tu hijo/a', 'A few quick questions. There are no wrong answers.': 'Unas preguntas rápidas. No hay respuestas incorrectas.',
    "Your child's age": 'Edad de tu hijo/a', 'Select an age range': 'Selecciona un rango de edad',
    'Under 2': 'Menos de 2', '2–5 years': '2–5 años', '6–9 years': '6–9 años', '10–13 years': '10–13 años', '14+ years': '14+ años',
    'Does your child have an autism (ASD) diagnosis?': '¿Tu hijo/a tiene un diagnóstico de autismo (TEA)?',
    'Yes': 'Sí', 'Not yet': 'Todavía no', 'In process': 'En proceso', "I'm not sure": 'No estoy seguro',
    'Clinic ABA requires an autism diagnosis to start — but you can join the waitlist now, and our team will point you to next steps for an evaluation.': 'La terapia ABA en clínica requiere un diagnóstico de autismo para comenzar, pero puedes unirte a la lista ahora y nuestro equipo te orientará sobre los siguientes pasos para una evaluación.',
    'Great that it’s underway. Opening day may line up well with your timeline — our team will walk you through it.': 'Qué bien que ya está en camino. La fecha de apertura podría coincidir con tus tiempos; nuestro equipo te guiará.',
    'No problem. A diagnosis is typically needed for ABA, and our team can help you understand what’s required.': 'No hay problema. Por lo general se necesita un diagnóstico para ABA, y nuestro equipo puede ayudarte a entender qué se requiere.',
    'Your preferred schedule': 'Tu horario preferido',
    'The clinic will be open 8:30–5:30, Monday–Friday. Founding families pick their session times first.': 'La clínica abrirá de 8:30 a 5:30, de lunes a viernes. Las familias fundadoras eligen sus horarios primero.',
    'Which session times fit your family best?': '¿Qué horarios le convienen más a tu familia?',
    'Mornings · 8:30–11:30': 'Mañanas · 8:30–11:30', 'Mid-day · 11:30–2:30': 'Mediodía · 11:30–2:30', 'Afternoons · 2:30–5:30': 'Tardes · 2:30–5:30', 'Flexible / not sure yet': 'Flexible / aún no estoy seguro',
    'Not a commitment — it helps us plan staffing and hold the right times for you.': 'No es un compromiso; nos ayuda a planificar el personal y reservar los horarios adecuados para ti.',
    'Roughly how many hours per week are you hoping for?': '¿Aproximadamente cuántas horas por semana esperas?', 'e.g. 15 (max 40)': 'ej. 15 (máx. 40)',
    'Most treatment plans call for around 15+ hours a week for progress to stick. Tell us what works — our team will help you find a plan that fits.': 'La mayoría de los planes recomiendan alrededor de 15+ horas por semana para que el progreso se mantenga. Dinos qué te funciona y nuestro equipo te ayudará a encontrar un plan adecuado.',
    'Great — that’s the range where clinic-based ABA tends to work best. We’ll plan for it.': 'Excelente: ese es el rango donde la terapia ABA en clínica suele funcionar mejor. Lo tendremos en cuenta.',
    'One last thing': 'Una última cosa',
    'How you found us helps us reach more Houston families. Then you’re on the list.': 'Saber cómo nos encontraste nos ayuda a llegar a más familias de Houston. Después quedarás en la lista.',
    'How did you hear about us?': '¿Cómo te enteraste de nosotros?', 'Select an option': 'Selecciona una opción',
    'Referring provider or practice': 'Proveedor o consultorio que refiere', 'Provider / practice name': 'Nombre del proveedor o consultorio',
    'Please complete the CAPTCHA to continue.': 'Por favor completa el CAPTCHA para continuar.',
    'Want a jump-start while you wait?': '¿Quieres empezar mientras esperas?',
    'Want our team to reach out about starting In-Home now?': '¿Quieres que nuestro equipo te contacte para empezar la terapia en el hogar ahora?',
    'Yes, tell me more': 'Sí, cuéntenme más', 'Not right now': 'Ahora no',
    'ABA Provider': 'Proveedor de ABA', 'AI Search': 'Búsqueda con IA', 'Billboard': 'Valla publicitaria', 'Facebook Group': 'Grupo de Facebook', 'Family Member': 'Familiar', 'Forta Parent Referral': 'Recomendación de un padre de Forta', 'Insurance Referral': 'Referencia del seguro', 'Physician Referral': 'Referencia médica', 'Social Worker': 'Trabajador social', 'Web Search': 'Búsqueda web', 'Youtube': 'YouTube', 'Other': 'Otro'
  };
  function T(s) { if (LANG !== 'es' || s == null) return s; var m = ES[s]; return m == null ? s : m; }
  function stepLabel() { return T('Step {n} of {N}').replace('{n}', state.step).replace('{N}', TOTAL_STEPS); }

  var CLINIC_STATE = 'TX'; // clinic is a fixed physical location — Sugar Land, SW Houston

  var DIAGNOSIS_TO_SF = { yes: 'Yes', 'in-process': 'No, evaluation scheduled', no: 'No', unsure: 'No' };
  var AGE_TO_SF = { 'under-2': '1', '2-5': '3', '6-9': '7', '10-13': '11', '14-plus': '16' };
  var TYPE_TO_SF = { medicaid: 'Yes', commercial: 'No' };
  var HASINS_TO_SF = { primary: 'Yes, primary only', both: 'Yes, primary & secondary', none: 'No' };
  var LEAD_SOURCES = ['ABA Provider', 'AI Search', 'Billboard', 'Facebook', 'Facebook Group', 'Family Member', 'Forta Parent Referral', 'Instagram', 'Insurance Referral', 'Physician Referral', 'Reddit', 'Social Worker', 'TikTok', 'Web Search', 'Youtube', 'Other'];
  // Billboard isn't in the SF picklist (yet) — collapse to "Another option"
  // like TikTok/Youtube; the raw answer is preserved in the description field.
  var LEAD_SOURCE_TO_SF = { 'TikTok': 'Another option', 'Youtube': 'Another option', 'Billboard': 'Another option' };

  // Preferred language — sent to the SF Language field (F_LANGUAGE). ⚠️ Confirm
  // the exact SF picklist values (case-sensitive); the choice is ALSO written to
  // the Lead description as a safety net so it's never lost if a value/typed
  // "Other" isn't in the picklist.
  var LANGUAGES = ['English', 'Spanish'];

  var ECP_URL = 'https://www.fortahealth.com/electronic-communications-policy';

  /* ZIP → state (classic ZIP-range table). Drives the auto-picked insurance
     state; the family can override it in the form. */
  var STATES = ['AL','AK','AZ','AR','CA','CO','CT','DC','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','PR','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
  var ZIP_RANGES = [
    [500, 599, 'NY'], [600, 799, 'PR'], [900, 999, 'PR'],
    [1000, 2799, 'MA'], [2800, 2999, 'RI'], [3000, 3899, 'NH'], [3900, 4999, 'ME'],
    [5000, 5999, 'VT'], [5501, 5544, 'MA'], [6000, 6999, 'CT'], [6390, 6390, 'NY'],
    [7000, 8999, 'NJ'], [10000, 14999, 'NY'], [15000, 19699, 'PA'], [19700, 19999, 'DE'],
    [20000, 20599, 'DC'], [20600, 21999, 'MD'], [22000, 24699, 'VA'], [24700, 26899, 'WV'],
    [27000, 28999, 'NC'], [29000, 29999, 'SC'], [30000, 31999, 'GA'], [32000, 34999, 'FL'],
    [35000, 36999, 'AL'], [37000, 38599, 'TN'], [38600, 39799, 'MS'], [39800, 39999, 'GA'],
    [40000, 42799, 'KY'], [43000, 45999, 'OH'], [46000, 47999, 'IN'], [48000, 49999, 'MI'],
    [50000, 52999, 'IA'], [53000, 54999, 'WI'], [55000, 56799, 'MN'], [57000, 57799, 'SD'],
    [58000, 58899, 'ND'], [59000, 59999, 'MT'], [60000, 62999, 'IL'], [63000, 65999, 'MO'],
    [66000, 67999, 'KS'], [68000, 69399, 'NE'], [70000, 71599, 'LA'], [71600, 72999, 'AR'],
    [73000, 74999, 'OK'], [73301, 73301, 'TX'], [75000, 79999, 'TX'], [80000, 81999, 'CO'],
    [82000, 83199, 'WY'], [83200, 83999, 'ID'], [84000, 84799, 'UT'], [85000, 86999, 'AZ'],
    [87000, 88499, 'NM'], [88500, 88599, 'TX'], [88900, 89999, 'NV'], [90000, 96699, 'CA'],
    [96700, 96999, 'HI'], [97000, 97999, 'OR'], [98000, 99499, 'WA'], [99500, 99999, 'AK']
  ];
  function zipToState(zip) {
    var n = parseInt(zip, 10);
    if (isNaN(n)) return '';
    var hit = '';
    for (var i = 0; i < ZIP_RANGES.length; i++) {
      var r = ZIP_RANGES[i];
      if (n >= r[0] && n <= r[1]) hit = r[2]; // later (more specific) ranges win
    }
    return hit;
  }

  var TIMING_LABELS = {
    mornings: 'Mornings · 8:30–11:30',
    midday: 'Mid-day · 11:30–2:30',
    afternoons: 'Afternoons · 2:30–5:30',
    flexible: 'Flexible / not sure yet'
  };
  var TIMING_TO_SF = {
    mornings: 'Mornings (8:30-11:30)',
    midday: 'Mid-day (11:30-2:30)',
    afternoons: 'Afternoons (2:30-5:30)',
    flexible: 'Flexible'
  };

  var HOURS_THRESHOLD = 15;
  var TYPE_TO_PAYOR_TYPES = { medicaid: ['Medicaid', 'MCO'], commercial: ['Commercial', 'Government Plan'] };
  var TYPE_LABELS = { medicaid: 'Medicaid', commercial: 'Commercial / private' };
  var COVERAGE_LABELS = { primary: 'Primary insurance only', both: 'Primary & secondary insurance', none: 'No insurance / not sure' };

  var CDN = 'https://cdn.prod.website-files.com/62605ac6c670d21352ebb32c/';
  var IMG = {
    logo: CDN + '63ea27a1af9c9870fe661883_logomark.svg',
    faces: [
      CDN + '6a5402fe347fb3edadc9205e_hou-clinician-1.png',
      CDN + '6a540304c1d76f4028b8fc4b_hou-clinician-2.png',
      CDN + '6a540309f361bf9f865f1b91_hou-clinician-3.png'
    ],
    payors: [
      { src: CDN + '6a54030d2522de0aaf65f338_hou-payor-bcbs.avif', alt: 'Blue Cross Blue Shield', h: 32 },
      { src: CDN + '6a54030f75614ee836a3b46d_hou-payor-anthem.avif', alt: 'Anthem', h: 32 },
      { src: CDN + '6a540311e2850658bd2fb78a_hou-payor-cigna.avif', alt: 'Cigna', h: 32 },
      { src: CDN + '6a5403129b911817ae1a1bf5_hou-payor-wellcare.svg', alt: 'WellCare', h: 24 },
      { src: CDN + '6a54031470a960b63f8286b9_hou-payor-texas-childrens.svg', alt: "Texas Children's Health Plan", h: 38 },
      { src: CDN + '6a540315f9f185eedaf39b28_hou-payor-magellan.avif', alt: 'Magellan Health', h: 24 },
      { src: CDN + '6a54031660993ca19d9bd748_hou-payor-beacon.avif', alt: 'Beacon Health Options', h: 32 },
      { src: CDN + '6a54031870dbe02d7e896d03_hou-payor-medicaid.avif', alt: 'Medicaid', h: 32 }
    ],
    icons: {
      'hou-badge-gold': CDN + '6a5404630e7b1cfef7fdce31_hou-icon-calendar-check.svg',
      'hou-badge-purple': CDN + '6a5404658dc319026559f898_hou-icon-house.svg',
      'hou-badge-green': CDN + '6a5404665d37dd05aa421fbc_hou-icon-hand-heart.svg'
    }
  };

  /* ============================ UTILITIES =============================== */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function urlParam(k) { try { return new URLSearchParams(location.search).get(k) || ''; } catch (e) { return ''; } }
  function cookie(k) { var m = document.cookie.match(new RegExp('(?:^|; )' + k + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; }
  function facebookClickId() {
    var fbc = cookie('_fbc');
    if (fbc) return fbc;
    var fbclid = urlParam('fbclid');
    return fbclid ? 'fb.1.' + Math.floor(Date.now() / 1000) + '.' + fbclid : '';
  }
  function formatPhone(v) {
    var d = v.replace(/\D/g, '').slice(0, 10);
    if (!d) return '';
    if (d.length < 4) return '(' + d;
    if (d.length < 7) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
    return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  }

  /* ====================== STYLE + FONT INJECTION ======================== */

  function injectFonts() {
    if (document.querySelector('link[href*="family=DM+Sans"]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
  }

  var CSS = [
    '@keyframes hou-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}',
    '.hou-marquee-track.hou-animate{justify-content:flex-start;animation:hou-marquee 32s linear infinite;will-change:transform}',
    '.hou-marquee:hover .hou-marquee-track.hou-animate{animation-play-state:paused}',
    '.hou-marquee::before,.hou-marquee::after{content:"";position:absolute;top:0;bottom:0;width:60px;z-index:2;pointer-events:none}',
    '.hou-marquee::before{left:0;background:linear-gradient(to right,#fff,transparent)}',
    '.hou-marquee::after{right:0;background:linear-gradient(to left,#fff,transparent)}',
    '.hou-reveal{opacity:0;transform:translateY(24px);transition:opacity .7s cubic-bezier(.16,1,.3,1),transform .7s cubic-bezier(.16,1,.3,1)}',
    '.hou-reveal.hou-in{opacity:1;transform:none}',
    '.hou-faq-a.hou-collapsed{display:none}',
    '.hou-faq-plus{transition:transform .2s ease}',
    '.hou-faq-item.hou-open .hou-faq-plus{transform:rotate(45deg)}',
    '@property --hou-angle{syntax:"<angle>";initial-value:0deg;inherits:false}',
    '@keyframes hou-spin{to{--hou-angle:360deg}}',
    '.hou-glow{position:relative;border-radius:19px;padding:3px}',
    '.hou-glow::before{content:"";position:absolute;inset:0;border-radius:inherit;background:conic-gradient(from var(--hou-angle),#571f4e,#e0a13a,#7a3b6f,#29361b,#571f4e);opacity:0;transform:scale(.99);transition:opacity .6s ease,transform .6s ease;pointer-events:none;z-index:0}',
    '.hou-glow.hou-in-view::before{opacity:1;transform:scale(1);animation:hou-spin 4s linear infinite}',
    '.hou-glow>.hou-form-mount{position:relative;z-index:1}',
    /* spots pill (waitlist-specific) */
    '.hf-spots{display:inline-flex;align-items:center;gap:6px;background:#fdf3df;border:1px solid #e6c47a;color:#7a5306;font-family:"DM Sans",sans-serif;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;border-radius:999px;padding:4px 10px}',
    /* (In-Home page module is now a NATIVE Webflow section — its clw-ih-* styles live in Webflow, not here.) */
    /* in-form In-Home interest block (last step, only when ZIP qualifies) */
    '.hf-ih{border:1px solid #c9b3d6;background:linear-gradient(180deg,#f5edfa,#efe6f4);border-radius:12px;padding:16px;margin-bottom:6px}',
    '.hf-ih-badge{display:inline-flex;align-items:center;gap:7px;font-family:"DM Sans",sans-serif;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#5a2a72}',
    '.hf-ih-dot{width:8px;height:8px;border-radius:999px;background:#3fae52;display:inline-block}',
    '.hf-ih-t{font-family:"DM Sans",sans-serif;font-size:16px;font-weight:600;color:#3d1a4e;margin:8px 0 0}',
    '.hf-ih-p{font-family:Manrope,sans-serif;font-size:13px;line-height:1.6;color:#5a3a68;margin:6px 0 0}',
    '.hf-ih-q{font-family:Manrope,sans-serif;font-size:14px;font-weight:700;color:#3d1a4e;margin:12px 0 8px}',
    /* form ui (hf-*) — identical to in-home-app */
    '.hf-top{display:flex;align-items:center;justify-content:space-between}',
    '.hf-kicker{font-family:"DM Sans",sans-serif;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#571f4e}',
    '.hf-stepnum{font-family:Manrope,sans-serif;font-size:12px;font-weight:500;color:#4b4b4b}',
    '.hf-bars{display:flex;gap:6px;margin-top:12px}',
    '.hf-bar{height:6px;flex:1;border-radius:999px;background:#efe4ec;transition:background .3s}',
    '.hf-bar.hf-done{background:#571f4e}',
    '.hf-h3{font-family:"DM Sans",sans-serif;font-size:20px;font-weight:600;color:#000;margin:22px 0 0}',
    '.hf-hint{font-family:Manrope,sans-serif;font-size:14px;line-height:1.6;color:#4b4b4b;margin:4px 0 0}',
    '.hf-inline-link{border:none;background:none;color:#571f4e;font:inherit;font-weight:600;text-decoration:underline;cursor:pointer;padding:0}',
    /* (Language toggle is a NATIVE hero button on each page, not injected here.) */
    '.hf-field{margin-top:18px}',
    '.hf-label{display:block;font-family:Manrope,sans-serif;font-size:14px;font-weight:700;color:#000;margin-bottom:8px}',
    '.hf-input,.hf-select{width:100%;box-sizing:border-box;border:1px solid rgba(0,0,0,.15);border-radius:8px;background:#fff;padding:12px 16px;font-family:Manrope,sans-serif;font-size:16px;color:#000;outline:none;transition:border-color .15s,box-shadow .15s}',
    '.hf-input:focus,.hf-select:focus{border-color:#571f4e;box-shadow:0 0 0 2px rgba(87,31,78,.2)}',
    '.hf-choices{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
    '.hf-choices.hf-cols1{grid-template-columns:1fr}',
    '.hf-choice{border:1px solid rgba(0,0,0,.15);border-radius:10px;background:#fff;padding:12px 16px;text-align:left;font-family:Manrope,sans-serif;font-size:14px;font-weight:500;color:#000;cursor:pointer;transition:border-color .15s,background .15s}',
    '.hf-choice:hover{border-color:rgba(87,31,78,.5)}',
    '.hf-choice.hf-active{border-color:#571f4e;background:#efe4ec;color:#46193f}',
    '.hf-choice.hf-active.hf-positive{border-color:#29361b;background:#eef1e8;color:#29361b}',
    '.hf-choice.hf-active.hf-info{border-color:#5a2a72;background:#efe6f4;color:#47205a}',
    '.hf-choice.hf-active.hf-caution{border-color:#e0a13a;background:#fdf3df;color:#7a5306}',
    '.hf-note{display:flex;gap:10px;border:1px solid rgba(0,0,0,.12);border-radius:10px;padding:14px;margin-top:12px;font-family:Manrope,sans-serif;font-size:14px;line-height:1.6}',
    '.hf-note.hf-positive{border-color:#c3cdb0;background:#eef1e8;color:#29361b}',
    '.hf-note.hf-info{border-color:#c9b3d6;background:#efe6f4;color:#47205a}',
    '.hf-note.hf-caution{border-color:#e6c47a;background:#fdf3df;color:#7a5306}',
    '.hf-note.hf-neutral{border-color:rgba(0,0,0,.12);background:#fffcf2;color:#000}',
    '.hf-chip{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid rgba(87,31,78,.4);background:#efe4ec;border-radius:10px;padding:10px 14px}',
    '.hf-chip-kicker{font-family:"DM Sans",sans-serif;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#571f4e}',
    '.hf-chip-label{font-family:Manrope,sans-serif;font-size:14px;font-weight:500;color:#46193f}',
    '.hf-chip-x{border:none;background:none;color:#571f4e;font-size:16px;cursor:pointer;line-height:1;padding:6px;border-radius:999px}',
    '.hf-chip-x:hover{background:rgba(87,31,78,.1)}',
    '.hf-inswrap{border:1px solid rgba(0,0,0,.12);border-radius:10px;background:#fffcf2;padding:14px;margin-top:12px}',
    '.hf-nav{display:flex;align-items:center;gap:10px;margin-top:24px}',
    '.hf-back{display:inline-flex;align-items:center;gap:6px;border:2px solid #571f4e;background:none;color:#571f4e;font-family:"DM Sans",sans-serif;font-size:14px;font-weight:600;border-radius:999px;padding:11px 20px;cursor:pointer}',
    '.hf-back:hover{background:#efe4ec}',
    '.hf-next{display:inline-flex;flex:1;align-items:center;justify-content:center;gap:6px;border:none;background:#eea020;color:#000;font-family:"DM Sans",sans-serif;font-size:14px;font-weight:600;border-radius:999px;padding:13px 24px;cursor:pointer;transition:transform .15s,box-shadow .15s,opacity .15s}',
    '.hf-next:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(238,160,32,.25)}',
    '.hf-next:disabled{opacity:.5;cursor:not-allowed;transform:none;box-shadow:none}',
    '.hf-privacy{display:flex;align-items:center;justify-content:center;gap:6px;font-family:Manrope,sans-serif;font-size:12px;color:#4b4b4b;margin-top:14px;text-align:center}',
    '.hf-consent{display:flex;gap:10px;border:1px solid rgba(0,0,0,.12);border-radius:10px;background:#fffcf2;padding:14px;margin-top:16px;font-family:Manrope,sans-serif;font-size:12px;line-height:1.6;color:#4b4b4b}',
    '.hf-captcha{margin-top:16px;min-height:78px}',
    '.hf-captcha-err{display:none;font-family:Manrope,sans-serif;font-size:13px;color:#b00020;margin-top:6px}',
    '.hf-thanks{text-align:center;padding:16px 4px}',
    '.hf-thanks-badge{width:56px;height:56px;border-radius:999px;background:#efe4ec;color:#571f4e;font-size:24px;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 18px}',
    '.hf-thanks-h{font-family:"DM Sans",sans-serif;font-size:24px;font-weight:600;color:#000;margin:0}',
    '.hf-thanks-p{font-family:Manrope,sans-serif;font-size:16px;line-height:1.6;color:#4b4b4b;max-width:340px;margin:12px auto 0}',
    '.hf-fade{animation:hf-fade .45s cubic-bezier(.16,1,.3,1)}',
    '@keyframes hf-fade{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}',
    '@media (prefers-reduced-motion:reduce){.hou-marquee-track.hou-animate{animation:none}.hou-reveal{opacity:1;transform:none;transition:none}.hou-glow.hou-in-view::before{animation:none}}'
  ].join('\n');

  function injectCSS() {
    var s = document.createElement('style');
    s.id = 'clw-app-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ================= SELF-HEALING IMAGE FILL ============================ */

  function fillImg(img, src, alt) {
    if (!img) return;
    if (!img.getAttribute('src')) { img.src = src; if (alt) img.alt = alt; img.removeAttribute('loading'); }
  }

  function injectImages() {
    fillImg($('.hou-logo-link img'), IMG.logo, 'Forta Health');
    fillImg($('.hou-footer-brand img'), IMG.logo, 'Forta Health');
    var faces = $('.hou-faces');
    if (faces) {
      var faceImgs = $all('img', faces);
      if (faceImgs.length === 0) {
        IMG.faces.forEach(function (src) {
          var img = el('img', 'hou-face'); img.src = src; img.alt = 'Forta ABA clinician';
          img.style.cssText = 'width:44px;height:44px;border-radius:999px;border:2px solid rgba(255,255,255,.9);object-fit:cover;margin-left:-12px';
          faces.appendChild(img);
        });
      } else faceImgs.forEach(function (img, i) { fillImg(img, IMG.faces[i % IMG.faces.length], 'Forta ABA clinician'); });
    }
    var track = $('.hou-marquee-track');
    if (track) {
      var logoImgs = $all('img', track);
      if (logoImgs.length === 0) {
        IMG.payors.forEach(function (p) {
          var item = el('div', 'hou-payor-item');
          var img = el('img'); img.src = p.src; img.alt = p.alt;
          img.style.cssText = 'height:' + p.h + 'px;width:auto;opacity:.55;filter:brightness(0)';
          item.appendChild(img); track.appendChild(item);
        });
      } else logoImgs.forEach(function (img, i) { var p = IMG.payors[i % IMG.payors.length]; fillImg(img, p.src, p.alt); });
    }
    Object.keys(IMG.icons).forEach(function (cls) {
      var badge = $('.' + cls);
      if (!badge) return;
      var img = $('img', badge);
      if (img) fillImg(img, IMG.icons[cls], '');
      else {
        img = el('img'); img.src = IMG.icons[cls]; img.alt = '';
        img.style.cssText = 'width:32px;height:32px;filter:brightness(0) invert(1)';
        badge.appendChild(img);
      }
    });
  }

  /* ======================== PAGE INTERACTIONS ========================== */

  function initMarquee() {
    var track = $('.hou-marquee-track');
    if (!track || track.children.length === 0) return;
    track.innerHTML += track.innerHTML;
    track.classList.add('hou-animate');
  }

  function initFaq() {
    $all('.hou-faq-item').forEach(function (item) {
      var q = $('.hou-faq-q', item), a = $('.hou-faq-a', item);
      if (!q || !a) return;
      a.classList.add('hou-collapsed');
      q.addEventListener('click', function () {
        var open = item.classList.toggle('hou-open');
        a.classList.toggle('hou-collapsed', !open);
      });
    });
  }

  function initReveals() {
    if (!('IntersectionObserver' in window)) return;
    var targets = $all('.hou-ask, .hou-how-inner, .clw-ih-inner, .hou-faq, .hou-cta-inner');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('hou-in'); io.unobserve(e.target); } });
    }, { threshold: 0.15 });
    targets.forEach(function (t) { t.classList.add('hou-reveal'); io.observe(t); });
  }

  function initGlow(mount) {
    var wrap = el('div', 'hou-glow');
    mount.parentNode.insertBefore(wrap, mount);
    wrap.appendChild(mount);
    if (!('IntersectionObserver' in window)) { wrap.classList.add('hou-in-view'); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { wrap.classList.add('hou-in-view'); io.disconnect(); } });
    }, { threshold: 0.35 });
    io.observe(wrap);
  }

  /* ============================ DATA LAYER ============================== */
  /* No ZIP coverage lookup — the clinic serves whoever can get to it.
     Payor list still comes from the live payor CDN, filtered to TX. */

  var payorData = null;
  var zipData = null; // In-Home coverage file — only used to gate the cross-sell question
  function fetchJSON(url) { return fetch(url).then(function (r) { return r.json(); }); }
  function loadData() {
    fetchJSON(DATA.PAYOR_URL).then(function (d) { payorData = d; refreshPayorSelects(); }).catch(function () { payorData = []; });
    // In-Home coverage — loads in the background; by the last step it decides
    // whether the "available in your area" cross-sell question shows.
    fetchJSON(DATA.ZIP_URL).then(function (d) { zipData = d; if (state.step === 2 || state.step === TOTAL_STEPS) render(); }).catch(function () { zipData = []; });
  }
  function zipRecord(zip) {
    if (!zipData) return undefined; // still loading
    for (var i = 0; i < zipData.length; i++) if (String(zipData[i]['Zip Code']) === zip) return zipData[i];
    return null; // loaded, not found
  }
  /* True only when the entered ZIP is a genuinely covered In-Home ZIP —
     keeps the "available in your area" claim honest. */
  function inHomeQualifies() {
    if (!/^\d{5}$/.test(state.zip)) return false;
    var rec = zipRecord(state.zip);
    return !!(rec && String(rec.Status || '').trim().toLowerCase() === 'qualified');
  }
  /* ZIP tier for the step-2 feedback note (Will, 7/15):
     metro  = inside Houston metro → clinic-serviceable (positive)
     inhome = outside metro but In-Home CDN qualifies → steer to In-Home
     virtual= outside metro & no In-Home → steer to Virtual
     loading= In-Home coverage file not back yet */
  function zipTier() {
    if (!/^\d{5}$/.test(state.zip)) return '';
    if (houstonMetro(state.zip)) return 'metro';
    if (zipData === null) return 'loading';
    return inHomeQualifies() ? 'inhome' : 'virtual';
  }
  /* Insurance state is per-insurance now (Will, 7/14): a family can have a
     primary plan in one state and a secondary in another. Each defaults to the
     state derived from their ZIP; the "state" step is skipped by default and
     only surfaced per-plan via a "different state?" link. */
  function famState() { return state.zipState || CLINIC_STATE; }
  function insStateFor(stateKey) { return state[stateKey] || famState(); }
  function payorNamesFor(type, st) {
    var allowed = TYPE_TO_PAYOR_TYPES[type] || [];
    if (!payorData) return null;
    var names = {};
    payorData.forEach(function (p) {
      if (p.state === st && allowed.indexOf(p.payor_type) !== -1 && p.tofu_payor_name && String(p.tofu_payor_name).trim() !== '') names[p.tofu_payor_name] = true;
    });
    return Object.keys(names).sort(function (a, b) { return a.localeCompare(b); });
  }
  function findPayorRow(type, name, st) {
    if (!payorData || !name || name === 'not-listed') return null;
    var allowed = TYPE_TO_PAYOR_TYPES[type] || [];
    for (var i = 0; i < payorData.length; i++) {
      var p = payorData[i];
      if (p.state === st && p.tofu_payor_name === name && allowed.indexOf(p.payor_type) !== -1) return p;
    }
    return null;
  }

  /* ============================ FORM STATE ============================== */

  /* Step order (Will, 7/14): contact → ZIP+insurance → child → schedule →
     how-did-you-hear. Contact first converts best. */
  var state = {
    step: 1,
    zip: '', zipComplete: false, zipState: '', coverage: '',
    primaryType: '', primaryPayor: '', primaryState: '', stEdit_primaryState: false,
    secondaryType: '', secondaryPayor: '', secondaryState: '', stEdit_secondaryState: false,
    childAge: '', diagnosis: '',
    timing: '', hours: '', hoursTouched: false,
    parentName: '', email: '', phone: '',
    leadSource: '', physicianProvider: '',
    preferredLanguage: '', preferredLanguageOther: '',
    inHomeInterest: '', // '' | 'yes' | 'no' — only asked when the ZIP qualifies for In-Home
    submitting: false
  };
  var TOTAL_STEPS = 5;
  var mountEl = null;
  var lastRenderedStep = 0;

  function stepValid() {
    switch (state.step) {
      case 1:
        if (state.parentName.trim() === '') return false;
        if (!/^\S+@\S+\.\S+$/.test(state.email)) return false;
        if (state.phone.replace(/\D/g, '').length !== 10) return false;
        if (state.preferredLanguage === '') return false;
        if (state.preferredLanguage === 'Other' && state.preferredLanguageOther.trim() === '') return false;
        return true;
      case 2: {
        if (!/^\d{5}$/.test(state.zip)) return false;
        if (!state.coverage) return false;
        if (state.coverage === 'none') return true;
        var p = state.primaryType && state.primaryPayor;
        if (state.coverage === 'primary') return !!p;
        return !!(p && state.secondaryType && state.secondaryPayor);
      }
      case 3: return !!(state.childAge && state.diagnosis);
      case 4: {
        var h = state.hours === '' ? NaN : Number(state.hours);
        return !!state.timing && !isNaN(h) && h >= 0 && h <= 40;
      }
      case 5:
        if (state.leadSource === '') return false;
        // When In-Home is available at their ZIP, the interest question is a
        // required one-tap (clean yes/no signal); hidden otherwise.
        if (inHomeQualifies() && state.inHomeInterest === '') return false;
        return true;
      default: return false;
    }
  }

  /* ============================ RENDERING =============================== */

  function choiceButtons(name, options, cols) {
    var wrap = el('div', 'hf-choices' + (cols === 1 ? ' hf-cols1' : ''));
    options.forEach(function (o) {
      var b = el('button', 'hf-choice' + (state[name] === o.value ? ' hf-active' + (o.tone ? ' hf-' + o.tone : '') : ''), esc(o.label));
      b.type = 'button';
      b.addEventListener('click', function () { state[name] = o.value; if (o.onPick) o.onPick(); render(); });
      wrap.appendChild(b);
    });
    var sel = null;
    options.forEach(function (o) { if (o.value === state[name]) sel = o; });
    var frag = document.createDocumentFragment();
    frag.appendChild(wrap);
    if (sel && sel.warning) frag.appendChild(el('div', 'hf-note hf-' + (sel.tone || 'neutral'), '<span>&#9432;</span><span>' + esc(sel.warning) + '</span>'));
    return frag;
  }

  function chipRow(kicker, label, ariaLabel, onClear) {
    var chip = el('div', 'hf-chip hf-fade',
      '<div><div class="hf-chip-kicker">' + esc(kicker) + '</div><div class="hf-chip-label">' + esc(label) + '</div></div>');
    var x = el('button', 'hf-chip-x', '✕');
    x.type = 'button'; x.setAttribute('aria-label', ariaLabel);
    x.addEventListener('click', function () { onClear(); render(); });
    chip.appendChild(x);
    return chip;
  }

  function insuranceBlock(title, typeKey, payorKey, stateKey) {
    var frag = document.createDocumentFragment();
    var type = state[typeKey], payor = state[payorKey];
    if (type && payor) {
      var curSt = insStateFor(stateKey);
      var label = payor === 'not-listed' ? (LANG === 'es' ? 'Aseguradora no indicada' : 'Payor not listed') : payor;
      var stTag = state[stateKey] ? ' (' + curSt + ')' : '';
      frag.appendChild(chipRow(T(title), T(TYPE_LABELS[type]) + ' · ' + label + stTag, (LANG === 'es' ? 'Quitar seguro ' + T(title).toLowerCase() : 'Remove ' + title + ' insurance'), function () {
        state[typeKey] = ''; state[payorKey] = ''; state[stateKey] = ''; state['stEdit_' + stateKey] = false;
      }));
      return frag;
    }
    var box = el('div', 'hf-inswrap hf-fade');
    if (!type) {
      box.appendChild(el('label', 'hf-label', (LANG === 'es' ? 'Tipo de cobertura (' + T(title).toLowerCase() + ')' : title + ' coverage type')));
      var choices = el('div', 'hf-choices');
      [['medicaid', 'Medicaid'], ['commercial', 'Commercial / private']].forEach(function (t) {
        var b = el('button', 'hf-choice', esc(T(t[1])));
        b.type = 'button';
        b.addEventListener('click', function () { state[typeKey] = t[0]; state[payorKey] = ''; render(); });
        choices.appendChild(b);
      });
      box.appendChild(choices);
    } else {
      var curSt2 = insStateFor(stateKey);
      var crumb = el('div', 'hf-top');
      crumb.appendChild(el('div', 'hf-chip-kicker', esc(T(title)) + ' · ' + esc(T(TYPE_LABELS[type]))));
      var over = el('button', 'hf-chip-x', '✕');
      over.type = 'button'; over.setAttribute('aria-label', (LANG === 'es' ? 'Empezar de nuevo el seguro ' + T(title).toLowerCase() : 'Start ' + title + ' insurance over'));
      over.addEventListener('click', function () { state[typeKey] = ''; state[payorKey] = ''; state[stateKey] = ''; state['stEdit_' + stateKey] = false; render(); });
      crumb.appendChild(over);
      box.appendChild(crumb);
      var f = el('div', 'hf-field');
      f.appendChild(el('label', 'hf-label', (LANG === 'es' ? 'Selecciona tu aseguradora' : 'Select the ' + title.toLowerCase() + ' payor')));
      var sel = el('select', 'hf-select hf-payor-select');
      var names = payorNamesFor(type, curSt2);
      var opts = '<option value="" disabled selected>' + esc(names ? T('Select your payor') : T('Loading payors…')) + '</option>';
      (names || []).forEach(function (n) { opts += '<option value="' + esc(n) + '">' + esc(n) + '</option>'; });
      opts += '<option value="not-listed">' + esc(T('My payor isn’t listed / not sure')) + '</option>';
      sel.innerHTML = opts;
      sel.addEventListener('change', function () { state[payorKey] = sel.value; render(); });
      f.appendChild(sel);
      box.appendChild(f);
      // Per-insurance state: skipped by default (defaults to the ZIP state);
      // surfaced only if this plan is based in another state.
      var stWrap = el('div', 'hf-field');
      if (state['stEdit_' + stateKey]) {
        stWrap.appendChild(el('label', 'hf-label', (LANG === 'es' ? '¿En qué estado está este plan ' + T(title).toLowerCase() + '?' : 'Which state is this ' + title.toLowerCase() + ' plan based in?')));
        var ssel = el('select', 'hf-select');
        ssel.innerHTML = STATES.map(function (s) { return '<option value="' + s + '"' + (curSt2 === s ? ' selected' : '') + '>' + s + '</option>'; }).join('');
        ssel.addEventListener('change', function () { state[stateKey] = ssel.value; state[payorKey] = ''; render(); });
        stWrap.appendChild(ssel);
      } else {
        var line = el('p', 'hf-hint');
        line.appendChild(document.createTextNode(LANG === 'es' ? 'Mostrando planes de ' + curSt2 + '. ' : 'Showing ' + curSt2 + ' plans. '));
        var chg = el('button', 'hf-inline-link', T('Based in another state?'));
        chg.type = 'button';
        chg.addEventListener('click', function () { state['stEdit_' + stateKey] = true; render(); });
        line.appendChild(chg);
        stWrap.appendChild(line);
      }
      box.appendChild(stWrap);
    }
    frag.appendChild(box);
    return frag;
  }

  function textField(labelTxt, key, attrs) {
    var f = el('div', 'hf-field');
    var id = 'hf-' + key;
    f.appendChild(el('label', 'hf-label', esc(labelTxt))).setAttribute('for', id);
    var input = el('input', 'hf-input');
    input.id = id;
    Object.keys(attrs || {}).forEach(function (k) { input.setAttribute(k, attrs[k]); });
    input.value = state[key];
    input.addEventListener('input', function () {
      var v = input.value;
      if (key === 'zip') { v = v.replace(/\D/g, '').slice(0, 5); input.value = v; }
      if (key === 'phone') { v = formatPhone(v); input.value = v; }
      if (key === 'hours') {
        v = v.replace(/\D/g, '').slice(0, 2);
        if (v !== '' && Number(v) > 40) v = '40'; // cap at 40 hrs/week
        input.value = v;
      }
      state[key] = v;
      if (key === 'zip') {
        var complete = v.length === 5;
        var newSt = complete ? (zipToState(v) || CLINIC_STATE) : state.zipState;
        var needRender = false;
        if (complete !== state.zipComplete) { state.zipComplete = complete; needRender = true; }
        if (complete && newSt !== state.zipState) {
          // Derived state changed — any payor picked under the old default
          // state is stale (unless the family overrode that plan's state).
          if (!state.primaryState) state.primaryPayor = '';
          if (!state.secondaryState) state.secondaryPayor = '';
          state.zipState = newSt; needRender = true;
        }
        if (needRender) { render(); refocus(id); } else updateNavOnly();
      }
      else updateNavOnly();
    });
    if (key === 'hours') {
      input.addEventListener('blur', function () { state.hoursTouched = true; render(); });
    }
    f.appendChild(input);
    return f;
  }

  function refocus(id) {
    var n = document.getElementById(id);
    if (n) { var v = n.value; n.focus(); try { n.setSelectionRange(v.length, v.length); } catch (e) {} }
  }

  function updateNavOnly() {
    var btn = $('.hf-next', mountEl);
    if (btn) btn.disabled = !stepValid() || state.submitting;
  }

  function refreshPayorSelects() { if ($('.hf-payor-select', mountEl)) render(); }

  function stepHeader(title, hint) {
    var frag = document.createDocumentFragment();
    frag.appendChild(el('h3', 'hf-h3', esc(title)));
    if (hint) frag.appendChild(el('p', 'hf-hint', esc(hint)));
    return frag;
  }

  /* Preferred language — asked on step 1 (contact). Important in Houston (~40%
     Hispanic): captured early so the intake team calls back in the right
     language. Sent to SF F_LANGUAGE + mirrored into the Lead description. */
  function languageField() {
    var frag = document.createDocumentFragment();
    var lf = el('div', 'hf-field');
    lf.appendChild(el('label', 'hf-label', T('Preferred language')));
    var lsel = el('select', 'hf-select');
    lsel.innerHTML = '<option value="" disabled' + (state.preferredLanguage ? '' : ' selected') + '>' + esc(T('Select a language')) + '</option>' +
      LANGUAGES.map(function (o) { return '<option value="' + esc(o) + '"' + (state.preferredLanguage === o ? ' selected' : '') + '>' + esc(T(o)) + '</option>'; }).join('');
    lsel.addEventListener('change', function () { state.preferredLanguage = lsel.value; if (lsel.value !== 'Other') state.preferredLanguageOther = ''; render(); });
    lf.appendChild(lsel);
    lf.appendChild(el('p', 'hf-hint', T('So our care team reaches out in the language you’re most comfortable with.')));
    frag.appendChild(lf);
    if (state.preferredLanguage === 'Other') {
      frag.appendChild(textField('Which language?', 'preferredLanguageOther', { type: 'text', autocomplete: 'language', placeholder: 'Your preferred language' }));
    }
    return frag;
  }

  function renderStep(body) {
    if (state.step === 1) {
      body.appendChild(stepHeader(T('Save your spot'), T('Only 40 founding spots — tell us where to reach you and you’re in line. The rest takes about a minute.')));
      body.appendChild(textField(T('Your name'), 'parentName', { type: 'text', autocomplete: 'name', placeholder: T('First and last name') }));
      body.appendChild(textField(T('Email'), 'email', { type: 'email', autocomplete: 'email', placeholder: 'you@example.com' }));
      body.appendChild(textField(T('Phone'), 'phone', { type: 'tel', inputmode: 'tel', autocomplete: 'tel', placeholder: '(555) 555-5555' }));
      body.appendChild(languageField());
    }

    if (state.step === 2) {
      body.appendChild(stepHeader(T('Location & coverage'), T('Your ZIP and insurance help us verify coverage before opening day.')));
      body.appendChild(textField(T('Your ZIP code'), 'zip', { type: 'text', inputmode: 'numeric', autocomplete: 'postal-code', maxlength: '5', placeholder: 'e.g. 77449' }));
      if (state.zipComplete) {
        var tier = zipTier(); var isEs = LANG === 'es';
        if (tier === 'metro') {
          body.appendChild(el('div', 'hf-note hf-positive', '<span>✓</span><span>' + esc(T('You’re in our Houston service area — this clinic is being built for families like yours.')) + '</span>'));
        } else if (tier === 'inhome') {
          body.appendChild(el('div', 'hf-note hf-info', '<span>&#9432;</span><span>' + (isEs
            ? 'Todavía no tendremos una clínica en tu ciudad, pero la terapia ABA en el hogar de Forta está disponible para ti hoy. Puedes unirte a la lista de todos modos y nuestro equipo te ayudará a empezar en casa mientras tanto. <a href="' + INHOME_URL + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">Conoce la terapia en el hogar →</a>'
            : 'We won’t have a clinic in your city yet — but Forta’s <strong>In-Home ABA</strong> is available to you today. You can still join the waitlist, and our team will get you started at home in the meantime. <a href="' + INHOME_URL + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">Explore In-Home ABA →</a>') + '</span>'));
        } else if (tier === 'virtual') {
          body.appendChild(el('div', 'hf-note hf-caution', '<span>&#9432;</span><span>' + (isEs
            ? 'Todavía no tenemos una clínica cerca de ti, así que un lugar presencial no aplicará, pero la terapia ABA virtual de Forta puede empezar ahora, vivas donde vivas. <a href="' + VIRTUAL_URL + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">Comienza la terapia virtual →</a>'
            : 'We don’t have a clinic near you yet, so an in-person spot won’t apply — but Forta’s <strong>Virtual ABA</strong> can start now, wherever you live. <a href="' + VIRTUAL_URL + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">Start Virtual ABA →</a>') + '</span>'));
        }
        if (!state.coverage) {
          var f = el('div', 'hf-field hf-fade');
          f.appendChild(el('label', 'hf-label', T('What insurance coverage do you have?')));
          f.appendChild(choiceButtons('coverage', [
            { label: T('Primary insurance only'), value: 'primary', onPick: resetIns },
            { label: T('Primary & secondary insurance'), value: 'both', onPick: resetIns },
            { label: T('No insurance / not sure'), value: 'none', onPick: resetIns }
          ], 1));
          body.appendChild(f);
        } else {
          var cf = el('div', 'hf-field');
          cf.appendChild(chipRow(T('Insurance coverage'), T(COVERAGE_LABELS[state.coverage]), T('Change insurance coverage answer'), function () {
            state.coverage = ''; resetIns();
          }));
          if (state.coverage === 'none') {
            cf.appendChild(el('div', 'hf-note hf-info', '<span>&#9432;</span><span>' + esc(T('We do require insurance to begin ABA therapy — and many families qualify for Medicaid. Join the waitlist now and our team will help you understand your options before opening day.')) + '</span>'));
          }
          if (state.coverage === 'primary' || state.coverage === 'both') {
            var wrap = el('div', 'hf-field');
            wrap.appendChild(insuranceBlock('Primary', 'primaryType', 'primaryPayor', 'primaryState'));
            if (state.coverage === 'both' && state.primaryType && state.primaryPayor) {
              var sec = el('div', 'hf-field');
              sec.appendChild(insuranceBlock('Secondary', 'secondaryType', 'secondaryPayor', 'secondaryState'));
              wrap.appendChild(sec);
            }
            cf.appendChild(wrap);
          }
          body.appendChild(cf);
        }
      }
    }

    if (state.step === 3) {
      body.appendChild(stepHeader(T('Tell us about your child'), T('A few quick questions. There are no wrong answers.')));
      var f = el('div', 'hf-field');
      f.appendChild(el('label', 'hf-label', T("Your child's age")));
      var sel = el('select', 'hf-select');
      sel.innerHTML = '<option value="" disabled' + (state.childAge ? '' : ' selected') + '>' + esc(T('Select an age range')) + '</option>' +
        [['under-2', 'Under 2'], ['2-5', '2–5 years'], ['6-9', '6–9 years'], ['10-13', '10–13 years'], ['14-plus', '14+ years']]
          .map(function (o) { return '<option value="' + o[0] + '"' + (state.childAge === o[0] ? ' selected' : '') + '>' + esc(T(o[1])) + '</option>'; }).join('');
      sel.addEventListener('change', function () { state.childAge = sel.value; render(); });
      f.appendChild(sel);
      body.appendChild(f);
      var d = el('div', 'hf-field');
      d.appendChild(el('label', 'hf-label', T('Does your child have an autism (ASD) diagnosis?')));
      d.appendChild(choiceButtons('diagnosis', [
        { label: T('Yes'), value: 'yes', tone: 'positive' },
        { label: T('Not yet'), value: 'no', tone: 'caution', warning: T('Clinic ABA requires an autism diagnosis to start — but you can join the waitlist now, and our team will point you to next steps for an evaluation.') },
        { label: T('In process'), value: 'in-process', tone: 'info', warning: T('Great that it’s underway. Opening day may line up well with your timeline — our team will walk you through it.') },
        { label: T("I'm not sure"), value: 'unsure', tone: 'caution', warning: T('No problem. A diagnosis is typically needed for ABA, and our team can help you understand what’s required.') }
      ]));
      body.appendChild(d);
    }

    if (state.step === 4) {
      body.appendChild(stepHeader(T('Your preferred schedule'), T('The clinic will be open 8:30–5:30, Monday–Friday. Founding families pick their session times first.')));
      var f = el('div', 'hf-field');
      f.appendChild(el('label', 'hf-label', T('Which session times fit your family best?')));
      f.appendChild(choiceButtons('timing', [
        { label: T(TIMING_LABELS.mornings), value: 'mornings' },
        { label: T(TIMING_LABELS.midday), value: 'midday' },
        { label: T(TIMING_LABELS.afternoons), value: 'afternoons' },
        { label: T(TIMING_LABELS.flexible), value: 'flexible' }
      ]));
      f.appendChild(el('p', 'hf-hint', T('Not a commitment — it helps us plan staffing and hold the right times for you.')));
      body.appendChild(f);
      body.appendChild(textField(T('Roughly how many hours per week are you hoping for?'), 'hours', { type: 'text', inputmode: 'numeric', maxlength: '2', placeholder: T('e.g. 15 (max 40)') }));
      var h = Number(state.hours);
      if (state.hoursTouched && state.hours !== '' && !isNaN(h)) {
        if (h < HOURS_THRESHOLD) body.appendChild(el('div', 'hf-note hf-neutral', '<span>&#9432;</span><span>' + esc(T('Most treatment plans call for around 15+ hours a week for progress to stick. Tell us what works — our team will help you find a plan that fits.')) + '</span>'));
        if (h >= HOURS_THRESHOLD) body.appendChild(el('div', 'hf-note hf-positive', '<span>✓</span><span>' + esc(T('Great — that’s the range where clinic-based ABA tends to work best. We’ll plan for it.')) + '</span>'));
      }
    }

    if (state.step === 5) {
      body.appendChild(stepHeader(T('One last thing'), T('How you found us helps us reach more Houston families. Then you’re on the list.')));

      // In-Home cross-sell — only when the entered ZIP is genuinely covered.
      if (inHomeQualifies()) {
        var ih = el('div', 'hf-ih hf-fade'); var ihEs = LANG === 'es';
        ih.innerHTML =
          '<span class="hf-ih-badge"><span class="hf-ih-dot"></span> ' + (ihEs ? 'La terapia en el hogar está disponible en tu código postal' : 'In-Home is available at your ZIP') + '</span>' +
          '<p class="hf-ih-t">' + esc(T('Want a jump-start while you wait?')) + '</p>' +
          '<p class="hf-ih-p">' + (ihEs ? 'No tienes que esperar a que abra la clínica. La terapia ABA en el hogar está disponible en tu área ahora mismo: tu hijo/a puede empezar antes, y las familias que ya están en terapia con Forta tienen <strong>prioridad para los lugares de fundador de la clínica</strong>.' : 'You don’t have to wait for the clinic to open. In-Home ABA is available in your area right now — it gets your child started sooner, and families already in therapy with Forta get <strong>priority for the founding clinic spots</strong>.') + '</p>' +
          '<p class="hf-ih-q">' + esc(T('Want our team to reach out about starting In-Home now?')) + '</p>';
        ih.appendChild(choiceButtons('inHomeInterest', [
          { label: T('Yes, tell me more'), value: 'yes', tone: 'info' },
          { label: T('Not right now'), value: 'no' }
        ]));
        body.appendChild(ih);
      }

      var f = el('div', 'hf-field');
      f.appendChild(el('label', 'hf-label', T('How did you hear about us?')));
      var sel = el('select', 'hf-select');
      sel.innerHTML = '<option value="" disabled' + (state.leadSource ? '' : ' selected') + '>' + esc(T('Select an option')) + '</option>' +
        LEAD_SOURCES.map(function (o) { return '<option value="' + esc(o) + '"' + (state.leadSource === o ? ' selected' : '') + '>' + esc(T(o)) + '</option>'; }).join('');
      sel.addEventListener('change', function () { state.leadSource = sel.value; render(); });
      f.appendChild(sel);
      body.appendChild(f);
      if (state.leadSource === 'Physician Referral') {
        body.appendChild(textField(T('Referring provider or practice'), 'physicianProvider', { type: 'text', placeholder: T('Provider / practice name') }));
      }
      body.appendChild(el('div', 'hf-consent', '<span>🔒</span><span>' + (LANG === 'es'
        ? 'Al enviar, autorizas a Forta a crear y mantener registros médicos electrónicos de tu hijo/a y a recibir llamadas, mensajes de texto y correos electrónicos sobre la atención al número proporcionado (incluidos mensajes con marcación automática), como se describe en nuestra <a href="' + ECP_URL + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">Política de Comunicaciones Electrónicas</a>. El consentimiento no es condición para recibir el servicio; pueden aplicarse tarifas de mensajes y datos, y puedes darte de baja en cualquier momento. Tu información está protegida por HIPAA.'
        : 'By submitting, you consent to Forta creating and maintaining electronic health records for your child, and to receive calls, texts, and emails about care at the number provided (including autodialed messages), as described in our <a href="' + ECP_URL + '" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">Electronic Communications Policy</a>. Consent isn’t a condition of service; message &amp; data rates may apply, and you can opt out anytime. Your information is protected under HIPAA.') + '</span>'));
      var cap = el('div', 'hf-captcha'); cap.id = 'hf-captcha';
      body.appendChild(cap);
      var capErr = el('p', 'hf-captcha-err', T('Please complete the CAPTCHA to continue.'));
      capErr.id = 'hf-captcha-err';
      body.appendChild(capErr);
      ensureRecaptcha();
    }
  }

  function resetIns() {
    state.primaryType = ''; state.primaryPayor = ''; state.primaryState = ''; state.stEdit_primaryState = false;
    state.secondaryType = ''; state.secondaryPayor = ''; state.secondaryState = ''; state.stEdit_secondaryState = false;
  }

  function render() {
    if (!mountEl) return;
    mountEl.innerHTML = '';
    var top = el('div', 'hf-top');
    top.appendChild(el('div', 'hf-kicker', T('Founding waitlist')));
    top.appendChild(el('div', 'hf-spots', T('40 spots')));
    mountEl.appendChild(top);
    var top2 = el('div', 'hf-top');
    top2.style.marginTop = '10px';
    top2.appendChild(el('div', 'hf-stepnum', stepLabel()));
    mountEl.appendChild(top2);
    var bars = el('div', 'hf-bars');
    for (var i = 0; i < TOTAL_STEPS; i++) bars.appendChild(el('span', 'hf-bar' + (i < state.step ? ' hf-done' : '')));
    mountEl.appendChild(bars);

    var body = el('div', 'hf-body' + (state.step !== lastRenderedStep ? ' hf-fade' : ''));
    lastRenderedStep = state.step;
    renderStep(body);
    mountEl.appendChild(body);

    var nav = el('div', 'hf-nav');
    if (state.step > 1) {
      var back = el('button', 'hf-back', T('← Back'));
      back.type = 'button';
      back.addEventListener('click', function () { state.step = Math.max(1, state.step - 1); render(); scrollFormIntoView(); });
      nav.appendChild(back);
    }
    var next = el('button', 'hf-next', state.step < TOTAL_STEPS ? T('Continue →') : (state.submitting ? T('Saving…') : T('Save my spot')));
    next.type = 'button';
    next.disabled = !stepValid() || state.submitting;
    next.addEventListener('click', function () {
      if (!stepValid() || state.submitting) return;
      if (state.step < TOTAL_STEPS) { state.step++; render(); scrollFormIntoView(); }
      else submit();
    });
    nav.appendChild(next);
    mountEl.appendChild(nav);
    mountEl.appendChild(el('p', 'hf-privacy', T('🛡 Free, no deposit, no obligation. Your information stays private.')));

    if (state.step === 5) renderRecaptcha();
  }

  function scrollFormIntoView() {
    if (window.innerWidth < 1024 && mountEl) mountEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderThankYou() {
    if (!mountEl) return;
    mountEl.innerHTML = '';
    var t = el('div', 'hf-thanks hf-fade');
    t.appendChild(el('div', 'hf-thanks-badge', '✓'));
    t.appendChild(el('h3', 'hf-thanks-h', T("You're on the list.")));
    t.appendChild(el('p', 'hf-thanks-p', T('A care team member will reach out within one business day to confirm your spot — and you’ll be among the first to hear the clinic’s address and opening date.')));
    mountEl.appendChild(t);
  }

  /* ============================ RECAPTCHA =============================== */

  var recaptchaWidget = null, recaptchaRequested = false;
  function ensureRecaptcha() {
    if (recaptchaRequested || window.grecaptcha) return;
    recaptchaRequested = true;
    var s = document.createElement('script');
    s.src = 'https://www.google.com/recaptcha/api.js?render=explicit' + (LANG === 'es' ? '&hl=es' : '');
    s.async = true; s.defer = true;
    s.onload = renderRecaptcha;
    document.head.appendChild(s);
  }
  function renderRecaptcha() {
    var host = document.getElementById('hf-captcha');
    if (!host || !window.grecaptcha || !window.grecaptcha.render) return;
    host.innerHTML = '';
    try {
      recaptchaWidget = window.grecaptcha.render(host, {
        sitekey: SF.RECAPTCHA_SITE_KEY,
        callback: function () { var er = document.getElementById('hf-captcha-err'); if (er) er.style.display = 'none'; }
      });
    } catch (e) { /* fail open */ }
  }
  function recaptchaBlocks() {
    if (typeof window.grecaptcha === 'undefined' || recaptchaWidget === null) return false;
    try { return !window.grecaptcha.getResponse(recaptchaWidget); } catch (e) { return false; }
  }
  function recaptchaToken() {
    try { if (recaptchaWidget != null && window.grecaptcha) return window.grecaptcha.getResponse(recaptchaWidget); } catch (e) {}
    return '';
  }

  /* ======================= SALESFORCE SUBMIT ============================ */
  /* No MQL/DQ routing — every submission is a clinic waitlist lead.
     Sales filters on Requested Service = "In Clinic". retURL comes back to
     this page with ?submitted=1 for the inline thank-you. */

  function submit() {
    if (recaptchaBlocks()) {
      var er = document.getElementById('hf-captcha-err');
      if (er) er.style.display = 'block';
      return;
    }
    state.submitting = true;
    render();

    var nameParts = state.parentName.trim().split(/\s+/);
    var firstName = nameParts.shift() || '';
    var lastName = nameParts.join(' ') || firstName || '(not provided)';

    var pRow = findPayorRow(state.primaryType, state.primaryPayor, insStateFor('primaryState'));
    var sRow = findPayorRow(state.secondaryType, state.secondaryPayor, insStateFor('secondaryState'));

    var fields = {};
    fields.oid = SF.OID;
    fields.retURL = location.origin + location.pathname + '?submitted=1';
    fields.company = SF.COMPANY;
    fields.first_name = firstName;
    fields.last_name = lastName;
    fields.email = state.email;
    fields.phone = state.phone;
    fields.zip = state.zip;
    fields.state = famState(); // family's state, derived from ZIP
    fields.city = '';
    fields.lead_source = LEAD_SOURCE_TO_SF[state.leadSource] || state.leadSource;

    // Waitlist context — no dedicated SF fields exist yet for clinic
    // timing, so it rides in the standard Lead description (searchable).
    // Billboard collapses to "Another option" in the picklist, so the raw
    // answer is preserved here too.
    fields.description = 'Clinic waitlist — Sugar Land / SW Houston. ' +
      'Preferred session time: ' + (TIMING_TO_SF[state.timing] || '') + '. ' +
      'Clinic hours 8:30-5:30 M-F. 40 founding spots.' +
      (LEAD_SOURCE_TO_SF[state.leadSource] ? ' Heard about us: ' + state.leadSource + '.' : '');

    // In-Home cross-sell signal — only meaningful when the ZIP qualified and
    // the question was shown. Rides in description (no dedicated SF field yet).
    if (inHomeQualifies()) {
      fields.description += ' In-Home available in area; interest: ' +
        (state.inHomeInterest === 'yes' ? 'YES — wants outreach' : 'No') + '.';
    }

    // Preferred language — write to the SF field AND the description (safety net
    // in case a value / typed "Other" isn't in the SF Language picklist).
    var prefLang = state.preferredLanguage === 'Other'
      ? (state.preferredLanguageOther.trim() || 'Other')
      : state.preferredLanguage;
    fields.description += ' Preferred language: ' + prefLang + '.';

    fields[SF.F_REQUESTED_SERVICE] = SF.REQUESTED_SERVICE_VALUE; // "In Clinic"
    fields[SF.F_DIAGNOSIS] = DIAGNOSIS_TO_SF[state.diagnosis] || '';
    fields[SF.F_CHILD_AGE] = AGE_TO_SF[state.childAge] || '';
    fields[SF.F_HAS_INSURANCE] = HASINS_TO_SF[state.coverage] || '';
    fields[SF.F_EXPECTED_HOURS] = state.hours;
    fields[SF.F_LANGUAGE] = prefLang;
    fields[SF.F_MQL_STATUS] = ''; // intentionally blank — see header note
    fields[SF.F_INHOME_ZIP_STATUS] = '';
    fields[SF.F_TYPE_PRIMARY] = TYPE_TO_SF[state.primaryType] || '';
    fields[SF.F_PAYOR_PRIMARY] = pRow ? pRow.payor_name : '';
    fields[SF.F_BAY_PRIMARY] = pRow ? pRow.final_forta_bay : '';
    fields[SF.F_STATUS_PRIMARY] = pRow ? pRow.inn_oon_designation : '';
    fields[SF.F_TYPE_SECONDARY] = TYPE_TO_SF[state.secondaryType] || '';
    fields[SF.F_PAYOR_SECONDARY] = sRow ? sRow.payor_name : '';
    fields[SF.F_BAY_SECONDARY] = sRow ? sRow.final_forta_bay : '';
    fields[SF.F_STATUS_SECONDARY] = sRow ? sRow.inn_oon_designation : '';
    fields[SF.F_PHYSICIAN_PROVIDER] = state.leadSource === 'Physician Referral' ? state.physicianProvider : '';

    fields[SF.F_GCLID] = urlParam('gclid');
    fields[SF.F_UTM_SOURCE] = urlParam('utm_source');
    fields[SF.F_UTM_MEDIUM] = urlParam('utm_medium');
    fields[SF.F_UTM_CAMPAIGN] = urlParam('utm_campaign');
    fields[SF.F_UTM_CONTENT] = urlParam('utm_content');
    fields[SF.F_UTM_DOMAIN] = urlParam('utm_domain');
    fields[SF.F_UTM_ADSET] = urlParam('utm_adsetname');
    fields[SF.F_EXT_LEAD_VALUE] = facebookClickId();

    fields[SF.F_LEGACY_FLAG] = 'No';
    fields.website = '';
    fields.confirm_email = '';
    fields.middlename = '';

    var token = recaptchaToken();
    if (token) fields['g-recaptcha-response'] = token;

    window.__clwLastPayload = { fields: fields };
    if (window.__clwDryRun) {
      console.log('[clw-app] DRY RUN — not submitting', fields);
      state.submitting = false; render(); return;
    }

    var form = document.createElement('form');
    form.method = 'POST';
    form.action = SF.ENDPOINT;
    form.style.display = 'none';
    Object.keys(fields).forEach(function (k) {
      var v = fields[k];
      var input = document.createElement('input');
      input.type = 'hidden'; input.name = k; input.value = v != null ? String(v) : '';
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  }

  /* ============================== BOOT ================================== */

  function init() {
    injectFonts();
    injectCSS();
    injectImages();
    initMarquee();
    initFaq();
    initReveals();

    mountEl = document.getElementById('lead-form');
    if (mountEl) {
      initGlow(mountEl);
      if (urlParam('submitted') === '1') renderThankYou();
      else { loadData(); render(); }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
