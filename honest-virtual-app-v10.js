(function () {
  'use strict';

  function init() {
    /* ---------- Footer year ---------- */
    var fy = document.getElementById('footer-year');
    if (fy) fy.textContent = new Date().getFullYear();

    /* ---------- Reviews carousel ---------- */
    (function () {
      var quoteEl = document.getElementById('review-quote');
      var attrEl = document.getElementById('review-attribution');
      var dotsEl = document.getElementById('review-dots');
      if (!quoteEl || !attrEl || !dotsEl) return;

      var REVIEWS = [
        { quote: 'We came from nothing to 3-word sentences and I could cry. I fought so hard to get her in ABA and it&rsquo;s paying off.', attribution: 'Parent of a daughter with autism' },
        { quote: 'Forta has helped me help my son, working on the skills he needs to master, with patience.', attribution: 'Verified Trustpilot review' },
        { quote: 'I call our sessions &ldquo;computer school.&rdquo; He knows it&rsquo;s playing and learning, not therapy.', attribution: 'Parent of a son with autism' },
        { quote: 'Having a wonderful RBT and BCBA has made things better at home for both of us.', attribution: 'Verified Trustpilot review' },
        { quote: 'Doing it virtually has been wonderful. My son does not like when people come into our home.', attribution: 'Parent of a son with autism' },
        { quote: 'My son enjoys working with the clinicians and engages with the computer. They are wonderful.', attribution: 'Verified Trustpilot review' },
        { quote: 'Since starting with Forta, my son has gained the skills he needs to interact with his peers.', attribution: 'Parent of a son with autism' }
      ];
      var index = 0;

      // Build dots
      REVIEWS.forEach(function (_, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-label', 'Show review ' + (i + 1));
        b.addEventListener('click', function () { setIndex(i); });
        dotsEl.appendChild(b);
      });

      function render() {
        var r = REVIEWS[index];
        quoteEl.classList.remove('rise-in');
        void quoteEl.offsetWidth; // reflow to restart animation
        quoteEl.classList.add('rise-in');
        quoteEl.innerHTML = '&ldquo;' + r.quote + '&rdquo;';
        attrEl.innerHTML = r.attribution;
        Array.prototype.forEach.call(dotsEl.children, function (dot, i) {
          dot.setAttribute('aria-selected', i === index ? 'true' : 'false');
          dot.className = i === index
            ? 'h-2 w-6 rounded-full bg-accent transition-all'
            : 'h-2 w-2 rounded-full bg-tertiary-foreground/30 transition-all hover:bg-tertiary-foreground/50';
        });
      }
      function setIndex(i) { index = i; render(); }
      render();
      setInterval(function () { index = (index + 1) % REVIEWS.length; render(); }, 5000);
    })();

    /* ---------- Session videos ---------- */
    document.querySelectorAll('.video-play').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var holder = btn.closest('[data-video]');
        if (!holder) return;
        var id = holder.getAttribute('data-video');
        var title = holder.getAttribute('data-title') || '';
        holder.innerHTML =
          '<iframe class="absolute inset-0 h-full w-full" src="https://www.youtube-nocookie.com/embed/' +
          id + '?autoplay=1&rel=0" title="' + title.replace(/"/g, '&quot;') +
          '" allow="accelerator; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
      });
    });

    /* ---------- Outcomes count-up ---------- */
    (function () {
      var el = document.getElementById('outcomes-inner');
      if (!el) return;
      var io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          el.querySelectorAll('.metric-pop').forEach(function (m) {
            m.className = 'pop-metric inline-block';
            m.style.animationDelay = (m.getAttribute('data-delay') || '0') + 'ms';
          });
          io.disconnect();
        }
      }, { threshold: 0.3 });
      io.observe(el);
    })();

    /* ---------- Lead form ---------- */
    (function () {
      var root = document.getElementById('lead-form');
      if (!root) return;

      var TOTAL = 4, THRESH = 10;
      var PAYOR_URL = 'https://cdn.prod.fortahealth.com/assets/tofu_payor_status.json';
      var ZIP_URL = 'https://cdn.prod.fortahealth.com/assets/zip_code_coverage.json';

      /* ---- Salesforce Web-to-Lead config (ported from marina/lander-form.js) ---- */
      var SF_ENDPOINT = 'https://webto.salesforce.com/servlet/servlet.WebToLead?encoding=UTF-8';
      var SF_OID = '00D8b000002cl8t';
      var SF_COMPANY = 'July2026';
      var RECAPTCHA_SITE_KEY = '6Ldp-yorAAAAAH7nTspqJRX-wZQ1HKfvJEpV3g8B';
      // Salesforce field IDs
      var SF = {
        gclid: '00N8b00000GjstL', mqlStatus: '00NRc00000Nxa1C',
        utmSource: '00NRc0000083yKn', utmMedium: '00NRc0000083yW5', utmCampaign: '00NRc0000083yhN',
        utmContent: '00NRc0000083pBL', utmDomain: '00NRc00000D4OSr', utmAdset: '00NRc00000rofku',
        externalLeadValue: '00NRc00000m9vt3',
        diagnosis: '00N8b00000EQM2f', age: '00N8b00000EQM2a', hasInsurance: '00N8b00000Bz6et',
        expectedHours: '00NRc00000NxTLk', language: '00NRc00000kKz0K',
        requestedService: '00NRc00000qudCY', inHomeZipStatus: '00NRc00000r0X4m',
        typePrimary: '00N8b00000Bz6ey', typeSecondary: '00NRc00000KXQa0',
        payorPrimary: '00N8b00000EQM3J', payorSecondary: '00NRc00000KXXrJ',
        bayPrimary: '00NRc00000OHqQz', statusPrimary: '00NRc00000OHo1Z',
        baySecondary: '00NRc00000OHWu6', statusSecondary: '00NRc00000OHuZR',
        referralProvider: '00NRc00000kLEgb'
      };
      // Our field values -> exact strings Salesforce expects
      var DIAGNOSIS_TO_SF = { yes: 'Yes', 'in-process': 'No, evaluation scheduled', no: 'No', unsure: 'No' };
      var AGE_TO_SF = { 'under-2': '1', '2-5': '3', '6-9': '7', '10-13': '11', '14-plus': '16' };
      var TYPE_TO_SF = { medicaid: 'Yes', commercial: 'No' };
      var HASINS_TO_SF = { primary: 'Yes, primary only', both: 'Yes, primary & secondary', none: 'No' };
      var LEAD_SOURCES = ['ABA Provider', 'AI Search', 'Facebook', 'Facebook Group', 'Family Member', 'Forta Parent Referral', 'Instagram', 'Insurance Referral', 'Physician Referral', 'Reddit', 'Social Worker', 'TikTok', 'Web Search', 'Youtube', 'Other'];
      // SF picklist collapses TikTok + Youtube to one value (flagged as a likely SF-side bug).
      var LEAD_SOURCE_TO_SF = { 'TikTok': 'Another option', 'Youtube': 'Another option' };

      var VIRTUAL_STATES = [
        { name: 'Alabama', abbr: 'AL' }, { name: 'Alaska', abbr: 'AK' }, { name: 'Arizona', abbr: 'AZ' }, { name: 'Arkansas', abbr: 'AR' },
        { name: 'California', abbr: 'CA' }, { name: 'Colorado', abbr: 'CO' }, { name: 'Connecticut', abbr: 'CT' }, { name: 'Delaware', abbr: 'DE' },
        { name: 'Florida', abbr: 'FL' }, { name: 'Georgia', abbr: 'GA' }, { name: 'Hawaii', abbr: 'HI' }, { name: 'Idaho', abbr: 'ID' },
        { name: 'Illinois', abbr: 'IL' }, { name: 'Indiana', abbr: 'IN' }, { name: 'Iowa', abbr: 'IA' }, { name: 'Kansas', abbr: 'KS' },
        { name: 'Kentucky', abbr: 'KY' }, { name: 'Louisiana', abbr: 'LA' }, { name: 'Maine', abbr: 'ME' }, { name: 'Maryland', abbr: 'MD' },
        { name: 'Massachusetts', abbr: 'MA' }, { name: 'Michigan', abbr: 'MI' }, { name: 'Minnesota', abbr: 'MN' }, { name: 'Mississippi', abbr: 'MS' },
        { name: 'Missouri', abbr: 'MO' }, { name: 'Montana', abbr: 'MT' }, { name: 'Nebraska', abbr: 'NE' }, { name: 'Nevada', abbr: 'NV' },
        { name: 'New Hampshire', abbr: 'NH' }, { name: 'New Jersey', abbr: 'NJ' }, { name: 'New Mexico', abbr: 'NM' }, { name: 'New York', abbr: 'NY' },
        { name: 'North Carolina', abbr: 'NC' }, { name: 'North Dakota', abbr: 'ND' }, { name: 'Ohio', abbr: 'OH' }, { name: 'Oklahoma', abbr: 'OK' },
        { name: 'Oregon', abbr: 'OR' }, { name: 'Pennsylvania', abbr: 'PA' }, { name: 'Rhode Island', abbr: 'RI' }, { name: 'South Carolina', abbr: 'SC' },
        { name: 'South Dakota', abbr: 'SD' }, { name: 'Tennessee', abbr: 'TN' }, { name: 'Utah', abbr: 'UT' }, { name: 'Vermont', abbr: 'VT' },
        { name: 'Virginia', abbr: 'VA' }, { name: 'Washington', abbr: 'WA' }, { name: 'West Virginia', abbr: 'WV' }, { name: 'Wisconsin', abbr: 'WI' },
        { name: 'Wyoming', abbr: 'WY' }
      ];
      // Insurance TYPE -> which payor_type rows to show.
      // MCO = managed Medicaid (Molina, Anthem Medi-Cal, etc.) -> Medicaid.
      // Government Plan = Tricare/military -> grouped with Commercial. Every payor lands in exactly one bucket.
      var TYPE_TO_PAYORTYPES = { medicaid: ['Medicaid', 'MCO'], commercial: ['Commercial', 'Government Plan'] };

      var HAS_INSURANCE = [
        { label: 'Yes — primary only', value: 'primary' },
        { label: 'Yes — primary &amp; secondary', value: 'both' },
        { label: 'No insurance / not sure', value: 'none', tone: 'caution', warning: 'We do require insurance to begin ABA therapy. Please come back and finish this step once you have your insurance information available.' }
      ];

      var AVAILABILITY = [
        { label: 'Any day, any time', value: 'any' },
        { label: 'Weekdays only', value: 'weekdays' },
        { label: 'Nights &amp; weekends', value: 'nights-weekends' },
        { label: 'Weekends only', value: 'weekends', tone: 'caution', warning: '<strong>Heads up:</strong> fitting ~10 hours into 2 days means about 5 hours each weekend day, which is a lot for a child. It can work, but adding even one or two weekday sessions makes it much more doable — we’ll help you plan it.' }
      ];
      var DIAGNOSIS = [
        { label: 'Yes', value: 'yes', tone: 'positive' },
        { label: 'Not yet', value: 'no', tone: 'caution', warning: 'ABA usually requires an autism diagnosis to start. That’s okay — tell us where you are and our team can point you to next steps.' },
        { label: 'In process', value: 'in-process', tone: 'info', warning: 'Great that it’s underway. We can often begin preparing once your diagnosis is finalized — our team will walk you through timing.' },
        { label: "I'm not sure", value: 'unsure', tone: 'caution', warning: 'No problem. A diagnosis is typically needed for ABA, and our team can help you understand what’s required.' }
      ];
      var TONE = {
        positive: { button: 'border-[#29361B] bg-[#eef1e8] text-[#29361B]', box: 'border-[#c3cdb0] bg-[#eef1e8]', icon: 'text-[#29361B]', text: 'text-[#29361B]' },
        info: { button: 'border-[#124E78] bg-[#e5eef5] text-[#124E78]', box: 'border-[#a9c4d8] bg-[#e5eef5]', icon: 'text-[#124E78]', text: 'text-[#124E78]' },
        caution: { button: 'border-[#e0a13a] bg-[#fdf3df] text-[#7a5306]', box: 'border-[#e6c47a] bg-[#fdf3df]', icon: 'text-[#b07d16]', text: 'text-[#7a5306]' }
      };
      var INPUT = 'w-full rounded-sm border border-input bg-card px-4 py-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20';

      var LABEL = 'mb-2 block text-sm font-bold text-foreground';

      // Icons
      var IC = {
        arrowRight: '<svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
        arrowLeft: '<svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>',
        shield: '<svg class="h-3.5 w-3.5 shrink-0" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>',
        loader: '<svg class="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
        info: function (cls) { return '<svg class="' + cls + '" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'; },
        heart: '<svg class="mt-0.5 h-5 w-5 shrink-0 text-primary" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/></svg>',
        fileLock: '<svg class="mt-0.5 h-5 w-5 shrink-0 text-primary" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.8V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M9 17v-2a2 2 0 0 0-4 0v2"/><rect width="8" height="5" x="3" y="17" rx="1"/></svg>',
        check: '<svg class="h-7 w-7 text-primary" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
        checkSm: '<svg class="h-4 w-4 shrink-0 text-primary" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
        checkBadge: '<svg class="h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
        x: '<svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
      };

      var data = {
        childAge: '', diagnosis: '', availability: '', hours: '',
        hasInsurance: '',
        pState: '', pType: '', pPayor: '',
        sState: '', sType: '', sPayor: '',
        parentName: '', email: '', phone: '', zip: '',
        leadSource: '', referralProvider: ''
      };
      var step = 1, hoursTouched = false, submitting = false, submitted = false;
      var payors = null, payorsLoading = false, payorsFetched = false, glowSeen = false;
      var qualifyingZips = null, zipsFetched = false; // Set of qualified 5-digit ZIPs (null until loaded)
      var recaptchaWidgetId = null, recaptchaScriptAdded = false;

      function hoursNum() { return data.hours === '' ? null : Number(data.hours); }
      function validHours() { var n = hoursNum(); return n !== null && !isNaN(n); }

      function abbrOf(name) {
        for (var i = 0; i < VIRTUAL_STATES.length; i++) { if (VIRTUAL_STATES[i].name === name) return VIRTUAL_STATES[i].abbr; }
        return '';
      }

      // Payors for a state + type, as [{name, ptype}] deduped by name, sorted.
      function payorRows(stateName, type) {
        if (!payors || !stateName || !type) return [];
        var abbr = abbrOf(stateName), allowed = TYPE_TO_PAYORTYPES[type] || [], seen = {}, rows = [];
        payors.forEach(function (p) {
          if (p.state === abbr && allowed.indexOf(p.payor_type) >= 0 && !seen[p.tofu_payor_name]) {
            seen[p.tofu_payor_name] = 1; rows.push({ name: p.tofu_payor_name, ptype: p.payor_type });
          }
        });
        rows.sort(function (a, b) { return a.name.localeCompare(b.name); });
        return rows;
      }

      function typeLabel(t) { return t === 'medicaid' ? 'Medicaid' : (t === 'commercial' ? 'Commercial' : ''); }
      function payorTag(ptype) { return ptype === 'MCO' ? '(MCO) ' : ''; }

      // "TX - Aetna" for commercial, "TX - (MCO) Aetna Better Health" for an MCO payor.
      function blockSummary(prefix) {
        var st = data[prefix + 'State'], ty = data[prefix + 'Type'], pay = data[prefix + 'Payor'];
        var abbr = abbrOf(st);
        if (pay === 'not-listed') return abbr + ' - ' + typeLabel(ty) + ' (payor not listed)';
        if (!pay) return abbr + ' - ' + typeLabel(ty);
        var rows = payorRows(st, ty), tag = '';
        for (var i = 0; i < rows.length; i++) { if (rows[i].name === pay) { tag = payorTag(rows[i].ptype); break; } }
        return abbr + ' - ' + tag + pay;
      }

      // A block is complete once state + type (+ a payor when the combo lists any) are chosen.
      function blockComplete(prefix) {
        var st = data[prefix + 'State'], ty = data[prefix + 'Type'], pay = data[prefix + 'Payor'];
        if (!st || !ty) return false;
        if (!payors) return false;                 // still loading — payor step not done yet
        if (payorRows(st, ty).length > 0) return pay !== '';
        return true;                               // loaded, no payors for this combo
      }

      // Full JSON row for a selected payor (needs payor_name, final_forta_bay, inn_oon_designation, tofu_status).
      function findPayorRow(stateName, tofuName) {
        if (!payors || !stateName || !tofuName || tofuName === 'not-listed') return null;
        var abbr = abbrOf(stateName);
        for (var i = 0; i < payors.length; i++) {
          if (payors[i].state === abbr && payors[i].tofu_payor_name === tofuName) return payors[i];
        }
        return null;
      }

      /* ---- ZIP qualification (in-home coverage) ---- */
      function normalizeZip(z) { return String(z || '').trim().replace(/\D/g, '').slice(0, 5); }
      function isZipQualified(z) {
        if (!qualifyingZips) return false;
        var raw = normalizeZip(z);
        if (raw.length === 5 && qualifyingZips.has(raw)) return true;
        if (raw.length === 4 && qualifyingZips.has(raw.padStart(5, '0'))) return true;
        return false;
      }
      function fetchZips() {
        if (zipsFetched) return;
        zipsFetched = true;
        fetch(ZIP_URL).then(function (r) { return r.json(); }).then(function (rows) {
          var set = new Set();
          (rows || []).forEach(function (row) {
            var zip = normalizeZip(row && row['Zip Code']);
            var status = String((row && row.Status) || '').trim().toLowerCase();
            if (zip.length === 5 && status === 'qualified') set.add(zip);
          });
          qualifyingZips = set;
        }).catch(function () { qualifyingZips = new Set(); });
      }

      /* ---- URL param / cookie capture (UTM, GCLID, Meta fbc) ---- */
      function urlParam(name) {
        var m = new RegExp('[?&]' + name + '=([^&#;]+)').exec(location.search);
        return m ? decodeURIComponent(m[1].replace(/\+/g, '%20')) : '';
      }
      function cookie(name) {
        var m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return m ? decodeURIComponent(m[2].trim()) : '';
      }
      function facebookClickId() {
        var fbc = cookie('_fbc');
        if (fbc) return fbc;
        var fbclid = urlParam('fbclid');
        return fbclid ? 'fb.1.' + Math.floor(Date.now() / 1000) + '.' + fbclid : '';
      }

      /* ---- Thank-you URL (mirrors marina thankYouUrlForMqlIntake) ---- */
      function thankYouIntakeUrl(isSpanish, inHome) {
        var hrs = hoursNum();
        var highVolume = hrs !== null && !isNaN(hrs) && hrs >= 15;
        if (highVolume) {
          if (inHome) return isSpanish ? 'https://www.fortahealth.com/in-home/thank-you-intake-schedule-your-call-spanish' : 'https://www.fortahealth.com/in-home/thank-you-intake-schedule-your-call';
          return isSpanish ? 'https://www.fortahealth.com/es/thank-you-schedule' : 'https://www.fortahealth.com/thank-you-schedule-your-call';
        }
        return isSpanish ? 'https://www.fortahealth.com/es/thank-you-intake' : 'https://www.fortahealth.com/thank-you-intake-pre-qualified';
      }

      /* ---- MQL/DQ routing tree (ported verbatim from marina lander-form.js) ---- */
      function computeRouting() {
        var asdDiagnosis = DIAGNOSIS_TO_SF[data.diagnosis] || '';
        var hasInsurance = HASINS_TO_SF[data.hasInsurance] || '';
        var childAge = parseInt(AGE_TO_SF[data.childAge] || '0', 10);
        var state = abbrOf(data.pState); // residential = primary-insurance state
        var isQualifyingZip = (qualifyingZips !== null) && isZipQualified(data.zip);
        var primaryRow = findPayorRow(data.pState, data.pPayor);
        var tofuStatus = primaryRow ? primaryRow.tofu_status : null;
        var payorType = primaryRow ? primaryRow.payor_type : null;
        var isSpanish = false; // English-only lander
        var lc = asdDiagnosis.toLowerCase();
        var hasPositiveDiagnosis = lc === 'yes';
        var isInHomePassing = isQualifyingZip && tofuStatus === 'Passing' && hasPositiveDiagnosis;
        var diagnosisDisqualifyStates = ['AK', 'CA', 'IA', 'HI', 'LA', 'MA', 'MT', 'NM', 'NY', 'OR'];
        var typePrimaryYesNo = TYPE_TO_SF[data.pType] || '';
        var returnURL = '', mqlStatus = '';

        if (hasInsurance === 'No') {
          returnURL = 'https://www.fortahealth.com/thank-you-2'; mqlStatus = 'DQ - No Insurance';
        } else if ((state === 'SC' || state === 'TX') && !isQualifyingZip && (payorType === 'Medicaid' || payorType === 'MCO')) {
          returnURL = 'https://www.fortahealth.com/thank-you-2'; mqlStatus = 'DQ - Not in Zip Code';
        } else if (lc === 'no, evaluation scheduled' || (lc === 'no, iep only' && state.toLowerCase() === 'ca' && typePrimaryYesNo.toLowerCase() === 'yes')) {
          returnURL = 'https://www.fortahealth.com/thank-you-diagnosis'; mqlStatus = 'Dx - Check Eval';
        } else if (['no', 'no, on a waitlist', 'no, have non-asd diagnosis', 'no, iep only'].indexOf(lc) >= 0) {
          returnURL = 'https://www.fortahealth.com/thank-you-2'; mqlStatus = 'DQ - No Diagnosis';
        } else if (isInHomePassing) {
          returnURL = thankYouIntakeUrl(isSpanish, isQualifyingZip); mqlStatus = 'MQL - In-Home';
        } else if (lc === 'yes' && tofuStatus === 'Passing') {
          returnURL = thankYouIntakeUrl(isSpanish, isQualifyingZip); mqlStatus = 'MQL';
        } else if (tofuStatus === 'Disqualify') {
          returnURL = 'https://www.fortahealth.com/thank-you-2'; mqlStatus = 'DQ - Insurance not supported';
        } else if (tofuStatus === 'Passing') {
          returnURL = thankYouIntakeUrl(isSpanish, isQualifyingZip); mqlStatus = 'MQL';
        } else if (lc !== 'yes' && diagnosisDisqualifyStates.indexOf(state) >= 0 && lc.indexOf('no') >= 0) {
          returnURL = 'https://www.fortahealth.com/thank-you-2'; mqlStatus = 'DQ - No Diagnosis';
        } else if (childAge > 99) {
          returnURL = 'https://www.fortahealth.com/thank-you-2'; mqlStatus = 'DQ - Age';
        } else {
          returnURL = 'https://www.fortahealth.com/thank-you-2'; mqlStatus = 'DQ - Other';
        }
        return { returnURL: returnURL, mqlStatus: mqlStatus, isQualifyingZip: isQualifyingZip };
      }

      /* ---- Build + submit the hidden Salesforce Web-to-Lead form ---- */
      function submitToSalesforce() {
        var route = computeRouting();
        var nameParts = String(data.parentName).trim().split(/\s+/);
        var firstName = nameParts.shift() || '';
        var lastName = nameParts.join(' ') || firstName || '(not provided)';
        var pRow = findPayorRow(data.pState, data.pPayor);
        var sRow = findPayorRow(data.sState, data.sPayor);
        var f = {};
        f.oid = SF_OID;
        f.retURL = route.returnURL;
        f.company = SF_COMPANY;
        f.first_name = firstName;
        f.last_name = lastName;
        f.email = data.email;
        f.phone = data.phone;
        f.zip = normalizeZip(data.zip);
        f.state = abbrOf(data.pState);
        f.lead_source = LEAD_SOURCE_TO_SF[data.leadSource] || data.leadSource;
        f[SF.diagnosis] = DIAGNOSIS_TO_SF[data.diagnosis] || '';
        f[SF.age] = AGE_TO_SF[data.childAge] || '';
        f[SF.hasInsurance] = HASINS_TO_SF[data.hasInsurance] || '';
        f[SF.expectedHours] = data.hours;
        f[SF.language] = 'English';
        f[SF.mqlStatus] = route.mqlStatus;
        f[SF.inHomeZipStatus] = route.isQualifyingZip ? 'Yes' : 'No';
        f[SF.typePrimary] = TYPE_TO_SF[data.pType] || '';
        f[SF.payorPrimary] = pRow ? pRow.payor_name : '';
        f[SF.bayPrimary] = pRow ? pRow.final_forta_bay : '';
        f[SF.statusPrimary] = pRow ? pRow.inn_oon_designation : '';
        f[SF.typeSecondary] = TYPE_TO_SF[data.sType] || '';
        f[SF.payorSecondary] = sRow ? sRow.payor_name : '';
        f[SF.baySecondary] = sRow ? sRow.final_forta_bay : '';
        f[SF.statusSecondary] = sRow ? sRow.inn_oon_designation : '';
        f[SF.referralProvider] = data.leadSource === 'Physician Referral' ? data.referralProvider : '';
        f[SF.gclid] = urlParam('gclid');
        f[SF.utmSource] = urlParam('utm_source');
        f[SF.utmMedium] = urlParam('utm_medium');
        f[SF.utmCampaign] = urlParam('utm_campaign');
        f[SF.utmContent] = urlParam('utm_content');
        f[SF.utmDomain] = urlParam('utm_domain');
        f[SF.utmAdset] = urlParam('utm_adsetname');
        f[SF.externalLeadValue] = facebookClickId();
        // Parity with the working production form (avoids silent Web-to-Lead validation drops)
        f['00N8b00000EQM3O'] = 'No';   // hidden constant the prod form always sends
        f.website = '';                // empty honeypot (present + empty like prod)
        f.confirm_email = '';          // empty honeypot
        f.middlename = '';             // empty honeypot

        var form = document.createElement('form');
        form.method = 'POST';
        form.action = SF_ENDPOINT;
        form.style.display = 'none';
        Object.keys(f).forEach(function (k) {
          var input = document.createElement('input');
          input.type = 'hidden';
          input.name = k;
          input.value = f[k] != null ? f[k] : '';
          form.appendChild(input);
        });
        document.body.appendChild(form);
        form.submit();
      }

      /* ---- reCAPTCHA (v2 checkbox, rendered on step 4) ---- */
      function renderRecaptcha() {
        if (typeof grecaptcha === 'undefined' || !grecaptcha.render) return;
        var c = root.querySelector('#lf-recaptcha');
        if (!c || c.getAttribute('data-rendered') === '1') return;
        try {
          recaptchaWidgetId = grecaptcha.render(c, {
            sitekey: RECAPTCHA_SITE_KEY,
            callback: function () { var er = root.querySelector('#lf-recaptcha-err'); if (er) er.classList.add('hidden'); }
          });
          c.setAttribute('data-rendered', '1');
        } catch (e) {}
      }
      function ensureRecaptcha() {
        if (typeof grecaptcha !== 'undefined' && grecaptcha.render) { renderRecaptcha(); return; }
        if (recaptchaScriptAdded) return;
        recaptchaScriptAdded = true;
        window.__fortaGrecaptchaOnload = function () { renderRecaptcha(); };
        var s = document.createElement('script');
        s.src = 'https://www.google.com/recaptcha/api.js?render=explicit&onload=__fortaGrecaptchaOnload';
        s.async = true; s.defer = true;
        document.head.appendChild(s);
      }
      // Block submit only when reCAPTCHA is present and unsolved (fail-open, mirrors marina).
      function recaptchaBlocks() {
        if (typeof grecaptcha === 'undefined' || recaptchaWidgetId === null) return false;
        try { return !grecaptcha.getResponse(recaptchaWidgetId); } catch (e) { return false; }
      }

      function stepValid() {
        switch (step) {
          case 1: return data.childAge !== '' && data.diagnosis !== '';
          case 2: { var n = hoursNum(); return data.availability !== '' && validHours() && n >= 0; }
          case 3:
            if (data.hasInsurance === '') return false;
            if (data.hasInsurance === 'none') return true;
            if (data.hasInsurance === 'primary') return blockComplete('p');
            if (data.hasInsurance === 'both') return blockComplete('p') && blockComplete('s');
            return false;
          case 4: return data.parentName.trim() !== '' && /^\S+@\S+\.\S+$/.test(data.email) && data.phone.trim().length >= 7 && /^\d{5}$/.test(data.zip.trim()) && data.leadSource !== '';
          default: return false;
        }
      }

      function fetchPayors() {
        if (payorsFetched) return;
        payorsFetched = true; payorsLoading = true;
        fetch(PAYOR_URL).then(function (r) { return r.json(); }).then(function (json) {
          payors = json; payorsLoading = false; render();
        }).catch(function () { payors = []; payorsLoading = false; render(); });
      }

      function choiceGroup(name, value, options) {
        var selected = null;
        options.forEach(function (o) { if (o.value === value) selected = o; });
        var buttons = options.map(function (opt) {
          var active = value === opt.value;
          var cls = 'rounded-md border px-4 py-3 text-left text-sm font-medium transition-colors ';
          if (active && opt.tone) cls += TONE[opt.tone].button;
          else if (active) cls += 'border-primary bg-primary-container text-on-primary-container';
          else cls += 'border-input bg-card text-foreground hover:border-primary/50';
          return '<button type="button" role="radio" aria-checked="' + active + '" data-choice="' + name + '" data-value="' + opt.value + '" class="' + cls + '">' + opt.label + '</button>';
        }).join('');
        var html = '<div role="radiogroup" aria-label="' + name + '" class="grid grid-cols-2 gap-3">' + buttons + '</div>';
        if (selected && selected.warning && selected.tone) {
          var t = TONE[selected.tone];
          html += '<div role="status" class="mt-3 flex gap-3 rounded-md border p-4 ' + t.box + '">' +
            IC.info('mt-0.5 h-5 w-5 shrink-0 ' + t.icon) +
            '<p class="text-sm leading-relaxed ' + t.text + '">' + selected.warning + '</p></div>';
        }
        return html;
      }

      function opt(v, label, sel, disabled) {
        return '<option value="' + v + '"' + (sel ? ' selected' : '') + (disabled ? ' disabled' : '') + '>' + label + '</option>';
      }

      // Progressive STATE -> TYPE -> PAYOR block. One field shows at a time; on completion it
      // collapses to a blue summary chip ("TX - Aetna") with a reset button. prefix is 'p' or 's'.
      function insuranceBlock(prefix, title) {
        var sKey = prefix + 'State', tKey = prefix + 'Type', pKey = prefix + 'Payor';
        var sVal = data[sKey], tVal = data[tKey];

        // Completed -> blue chip with the resolved payor name and a start-over (X) button.
        if (blockComplete(prefix)) {
          return '<div class="rise-in flex items-center justify-between gap-3 rounded-lg border-2 border-primary bg-primary-container p-4">' +
            '<div><p class="text-[11px] font-bold uppercase tracking-[0.08em] text-primary">' + title + '</p>' +
            '<p class="mt-0.5 text-sm font-bold text-on-primary-container">' + blockSummary(prefix) + '</p></div>' +
            '<button type="button" data-reset="' + prefix + '" aria-label="Start over" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10">' + IC.x + '</button>' +
          '</div>';
        }

        var h = '<div class="rise-in rounded-lg border border-border bg-surface-alt/60 p-4">';
        h += '<div class="mb-3 flex items-center justify-between gap-3"><p class="text-sm font-bold text-foreground">' + title + '</p>' +
          ((sVal || tVal) ? '<button type="button" data-reset="' + prefix + '" class="text-xs font-semibold text-muted-foreground underline-offset-2 transition-colors hover:text-primary hover:underline">Start over</button>' : '') +
          '</div>';

        if (!sVal) {
          var stateOpts = opt('', 'Select your state', true, true);
          VIRTUAL_STATES.forEach(function (s) { stateOpts += opt(s.name, s.name, false); });
          h += '<label for="' + sKey + '" class="' + LABEL + '">State</label>' +
            '<select id="' + sKey + '" data-field="' + sKey + '" class="' + INPUT + '">' + stateOpts + '</select>';
        } else if (!tVal) {
          h += '<p class="mb-2 text-xs font-semibold text-primary">' + abbrOf(sVal) + ' · ' + sVal + '</p>' +
            '<label for="' + tKey + '" class="' + LABEL + '">Insurance type</label>' +
            '<select id="' + tKey + '" data-field="' + tKey + '" class="' + INPUT + '">' +
              opt('', 'Select type', true, true) +
              opt('medicaid', 'Medicaid', false) +
              opt('commercial', 'Commercial', false) +
            '</select>';
        } else {
          h += '<p class="mb-2 text-xs font-semibold text-primary">' + abbrOf(sVal) + ' · ' + typeLabel(tVal) + '</p>' +
            '<label for="' + pKey + '" class="' + LABEL + '">Payor</label>';
          if (payorsLoading || !payors) {
            h += '<select class="' + INPUT + '" disabled><option>Loading payors…</option></select>';
          } else {
            var rows = payorRows(sVal, tVal);
            var payorSel = '<option value="" selected disabled>Select your payor</option>';
            rows.forEach(function (r) { payorSel += '<option value="' + r.name.replace(/"/g, '&quot;') + '">' + payorTag(r.ptype) + r.name + '</option>'; });
            payorSel += '<option value="not-listed">My payor isn’t listed / not sure</option>';
            h += '<select id="' + pKey + '" data-field="' + pKey + '" class="' + INPUT + '">' + payorSel + '</select>' +
              '<p class="mt-1.5 text-xs leading-relaxed text-muted-foreground">Don’t see yours? Choose “not listed” — our team will still check your eligibility.</p>';
          }
        }

        h += '</div>';
        return h;
      }

      function renderStep() {
        var h = '';
        if (step === 1) {
          h += '<div class="space-y-5">';
          h += '<div><h3 class="font-heading text-xl font-semibold text-foreground">Let&apos;s start with your child</h3><p class="mt-1 text-sm leading-relaxed text-muted-foreground">A few quick questions. There are no wrong answers.</p></div>';
          h += '<div><label for="childAge" class="' + LABEL + '">Your child&apos;s age</label><select id="childAge" class="' + INPUT + '">' +
            opt('', 'Select an age range', data.childAge === '', true) +
            opt('under-2', 'Under 2', data.childAge === 'under-2') +
            opt('2-5', '2–5 years', data.childAge === '2-5') +
            opt('6-9', '6–9 years', data.childAge === '6-9') +
            opt('10-13', '10–13 years', data.childAge === '10-13') +
            opt('14-plus', '14+ years', data.childAge === '14-plus') +
            '</select></div>';
          h += '<div><label class="' + LABEL + '">Does your child have an autism (ASD) diagnosis?</label>' + choiceGroup('diagnosis', data.diagnosis, DIAGNOSIS) + '</div>';
          h += '</div>';
        } else if (step === 2) {
          h += '<div class="space-y-5">';
          h += '<div><h3 class="font-heading text-xl font-semibold text-foreground">The honest part: your time</h3><p class="mt-1 text-sm leading-relaxed text-muted-foreground">Great Virtual ABA takes about 10 hours a week, with you as an active partner alongside your clinical team. Let&apos;s see how it can fit your family&apos;s week.</p></div>';
          h += '<div><label class="' + LABEL + '">When can you make time for sessions?</label>' + choiceGroup('availability', data.availability, AVAILABILITY) +
            '<p class="mt-2 text-xs leading-relaxed text-muted-foreground">We build the schedule around you — nights and weekends included.</p></div>';
          h += '<div><label for="hours" class="' + LABEL + '">Total hours per week you can make room for</label>' +
            '<input id="hours" type="number" inputmode="numeric" min="0" max="40" placeholder="e.g. 10" class="' + INPUT + '" value="' + data.hours + '" />' +
            '<div id="hours-warn">' + hoursWarnHTML() + '</div></div>';
          h += '</div>';
        } else if (step === 3) {
          h += '<div class="space-y-5">';
          h += '<div><h3 class="font-heading text-xl font-semibold text-foreground">Insurance &amp; coverage</h3><p class="mt-1 text-sm leading-relaxed text-muted-foreground">We accept 300+ policies and are Medicaid approved in many states. This helps us check your eligibility fast.</p></div>';
          h += '<div><label class="' + LABEL + '">Does your child have health insurance?</label>' + choiceGroup('hasInsurance', data.hasInsurance, HAS_INSURANCE) + '</div>';
          if (data.hasInsurance === 'primary') {
            h += insuranceBlock('p', 'Insurance details');
          } else if (data.hasInsurance === 'both') {
            h += insuranceBlock('p', 'Primary insurance');
            if (blockComplete('p')) h += insuranceBlock('s', 'Secondary insurance');
          }
          h += '</div>';
        } else if (step === 4) {
          h += '<div class="space-y-5">';
          h += '<div><h3 class="font-heading text-xl font-semibold text-foreground">Where can we reach you?</h3><p class="mt-1 text-sm leading-relaxed text-muted-foreground">A care team member will follow up. We never share your information.</p></div>';
          h += '<div><label for="parentName" class="' + LABEL + '">Your name</label><input id="parentName" type="text" autocomplete="name" placeholder="First and last name" class="' + INPUT + '" value="' + attr(data.parentName) + '" /></div>';
          h += '<div><label for="email" class="' + LABEL + '">Email</label><input id="email" type="email" autocomplete="email" placeholder="you@example.com" class="' + INPUT + '" value="' + attr(data.email) + '" /></div>';
          h += '<div class="grid grid-cols-2 gap-3">' +
            '<div><label for="phone" class="' + LABEL + '">Phone</label><input id="phone" type="tel" autocomplete="tel" placeholder="(555) 555-5555" class="' + INPUT + '" value="' + attr(data.phone) + '" /></div>' +
            '<div><label for="zip" class="' + LABEL + '">ZIP code</label><input id="zip" type="text" inputmode="numeric" autocomplete="postal-code" maxlength="5" placeholder="e.g. 60601" class="' + INPUT + '" value="' + attr(data.zip) + '" /></div>' +
            '</div>';
          var lsOpts = opt('', 'Select an option', data.leadSource === '', true);
          LEAD_SOURCES.forEach(function (s) { lsOpts += opt(s, s, data.leadSource === s); });
          h += '<div><label for="leadSource" class="' + LABEL + '">How did you hear about us?</label><select id="leadSource" data-field="leadSource" class="' + INPUT + '">' + lsOpts + '</select></div>';
          if (data.leadSource === 'Physician Referral') {
            h += '<div class="rise-in"><label for="referralProvider" class="' + LABEL + '">Referring provider <span class="font-normal text-muted-foreground">(optional)</span></label><input id="referralProvider" type="text" placeholder="Provider or practice name" class="' + INPUT + '" value="' + attr(data.referralProvider) + '" /></div>';
          }
          h += '<div><div id="lf-recaptcha"></div><p id="lf-recaptcha-err" class="mt-1.5 hidden text-sm text-[#b00020]">Please complete the CAPTCHA to continue.</p></div>';
          h += '<div class="flex gap-3 rounded-md border border-border bg-surface-alt p-4">' + IC.fileLock +
            '<p class="text-xs leading-relaxed text-muted-foreground">By submitting, you consent to Forta creating and maintaining electronic health records for your child, and to receive calls, texts, and emails about care at the number provided (including autodialed messages). Consent isn&apos;t a condition of service; message &amp; data rates may apply, and you can opt out anytime. Your information is protected under HIPAA.</p></div>';
          h += '</div>';
        }
        return h;
      }

      function hoursWarnHTML() {
        if (!hoursTouched || !validHours()) return '';
        var n = hoursNum();
        if (n < THRESH) {
          return '<div role="status" class="mt-3 flex gap-3 rounded-md border border-border bg-surface-alt p-4">' + IC.heart +
            '<p class="text-sm leading-relaxed text-foreground"><strong>A quick note:</strong> effective ABA needs about 10 hours a week, and most providers — us included — generally can&apos;t start below that. You&apos;re welcome to submit anyway, and we&apos;ll reach out to talk through your options.</p></div>';
        }
        if (n === THRESH) {
          return '<div role="status" class="mt-3 flex gap-3 rounded-md border border-border bg-primary-container p-4">' + IC.info('mt-0.5 h-5 w-5 shrink-0 text-primary') +
            '<p class="text-sm leading-relaxed text-on-primary-container">10 hours works. Just know it leaves little wiggle room for cancellations or schedule changes — a small buffer helps. Think 2 hours a day across 7 days rather than 5.</p></div>';
        }
        return '';
      }

      function progress() {
        var s = '';
        for (var i = 0; i < TOTAL; i++) {
          s += '<span class="h-1.5 flex-1 rounded-full transition-colors ' + (i < step ? 'bg-primary' : 'bg-primary-container') + '"></span>';
        }
        return s;
      }

      function nav() {
        var valid = stepValid();
        var btnCls = 'inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground transition-all hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(238,160,32,0.25)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none';
        var h = '<div class="mt-7 flex items-center gap-3">';
        if (step > 1) h += '<button type="button" id="lf-back" class="inline-flex items-center gap-1.5 rounded-full border-2 border-primary px-5 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary-container">' + IC.arrowLeft + 'Back</button>';
        if (step < TOTAL) {
          h += '<button type="button" id="lf-next"' + (valid ? '' : ' disabled') + ' class="' + btnCls + '">Continue' + IC.arrowRight + '</button>';
        } else {
          h += '<button type="submit" id="lf-submit"' + (valid && !submitting ? '' : ' disabled') + ' class="' + btnCls + '">' + (submitting ? IC.loader + 'Sending' : 'Check my eligibility') + '</button>';
        }
        h += '</div>';
        return h;
      }

      function attr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }

      function thankYou() {
        return '<div class="rounded-lg border border-border bg-card p-8 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">' +
          '<div class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary-container">' + IC.check + '</div>' +
          '<h3 class="text-center font-heading text-2xl font-semibold text-foreground">Thank you. We&apos;re glad you&apos;re here.</h3>' +
          '<p class="mx-auto mt-3 max-w-sm text-pretty text-center text-base leading-relaxed text-muted-foreground">A member of our care team will reach out within one business day to check your eligibility and answer every question. No pressure, and no obligation.</p>' +
          '</div>';
      }

      function afterRender() {
        if (step === 4 && !submitted) ensureRecaptcha();
        var glow = root.querySelector('.form-glow');
        if (!glow) return;
        if (glowSeen) { glow.classList.add('in-view'); return; }
        var io = new IntersectionObserver(function (e) {
          if (e[0].isIntersecting) { glowSeen = true; glow.classList.add('in-view'); io.disconnect(); }
        }, { threshold: 0.35 });
        io.observe(glow);
      }

      function render() {
        if (submitted) { root.innerHTML = thankYou(); return; }
        root.innerHTML =
          '<div class="form-glow scroll-mt-6' + (glowSeen ? ' in-view' : '') + '">' +
            '<div class="rounded-2xl border border-border bg-card p-6 shadow-[0_4px_12px_rgba(0,0,0,0.04)] sm:p-8">' +
              '<div class="mb-6"><div class="flex items-center justify-between">' +
                '<p class="text-xs font-semibold uppercase tracking-[0.08em] text-primary">Free eligibility check</p>' +
                '<p class="text-xs font-medium text-muted-foreground">Step ' + step + ' of ' + TOTAL + '</p>' +
              '</div><div class="mt-3 flex gap-1.5" aria-hidden="true">' + progress() + '</div></div>' +
              '<form id="lf-form" novalidate>' + renderStep() + nav() +
                '<p class="mt-4 flex items-center justify-center gap-1.5 text-center text-xs leading-relaxed text-muted-foreground">' + IC.shield + ' Free, no obligation. Your information stays private.</p>' +
              '</form>' +
            '</div>' +
          '</div>';
        afterRender();
      }

      function updateNav() {
        var next = root.querySelector('#lf-next');
        var sub = root.querySelector('#lf-submit');
        var valid = stepValid();
        if (next) next.disabled = !valid;
        if (sub) sub.disabled = !(valid && !submitting);
      }

      function goStep(n) {
        step = n;
        if (step >= 3) { fetchPayors(); fetchZips(); }
        render();
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
          var g = root.querySelector('.form-glow');
          if (g) g.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }

      /* Delegated events */
      root.addEventListener('click', function (e) {
        var reset = e.target.closest('[data-reset]');
        if (reset) {
          var pf = reset.getAttribute('data-reset');
          data[pf + 'State'] = ''; data[pf + 'Type'] = ''; data[pf + 'Payor'] = '';
          if (pf === 'p') { data.sState = data.sType = data.sPayor = ''; } // resetting primary clears secondary too
          render(); return;
        }
        var choice = e.target.closest('[data-choice]');
        if (choice) {
          var cname = choice.getAttribute('data-choice');
          data[cname] = choice.getAttribute('data-value');
          if (cname === 'hasInsurance') { data.pState = data.pType = data.pPayor = ''; data.sState = data.sType = data.sPayor = ''; }
          render(); return;
        }
        if (e.target.closest('#lf-next')) { if (stepValid() && step < TOTAL) goStep(step + 1); return; }
        if (e.target.closest('#lf-back')) { goStep(Math.max(1, step - 1)); return; }
      });

      root.addEventListener('change', function (e) {
        var field = e.target.getAttribute('data-field');
        if (field) {
          data[field] = e.target.value;
          if (field === 'pState') { data.pType = ''; data.pPayor = ''; }
          else if (field === 'pType') { data.pPayor = ''; }
          else if (field === 'sState') { data.sType = ''; data.sPayor = ''; }
          else if (field === 'sType') { data.sPayor = ''; }
          render();
          return;
        }
        if (e.target.id === 'childAge') { data.childAge = e.target.value; updateNav(); }
      });

      root.addEventListener('input', function (e) {
        var id = e.target.id;
        if (id === 'hours') { data.hours = e.target.value; var w = root.querySelector('#hours-warn'); if (w) w.innerHTML = hoursWarnHTML(); updateNav(); }
        else if (id === 'zip') { data.zip = e.target.value.replace(/\D/g, '').slice(0, 5); if (e.target.value !== data.zip) e.target.value = data.zip; updateNav(); }
        else if (id === 'parentName') { data.parentName = e.target.value; updateNav(); }
        else if (id === 'email') { data.email = e.target.value; updateNav(); }
        else if (id === 'phone') { data.phone = e.target.value; updateNav(); }
        else if (id === 'referralProvider') { data.referralProvider = e.target.value; }
      });

      root.addEventListener('focusout', function (e) {
        if (e.target.id === 'hours') { hoursTouched = true; var w = root.querySelector('#hours-warn'); if (w) w.innerHTML = hoursWarnHTML(); }
      });

      root.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!stepValid() || submitting) return;
        if (recaptchaBlocks()) {
          var er = root.querySelector('#lf-recaptcha-err');
          if (er) er.classList.remove('hidden');
          return;
        }
        submitting = true;
        updateNav();
        // Full-page POST to Salesforce Web-to-Lead; SF redirects to the computed thank-you retURL.
        submitToSalesforce();
      });

      render();
    })();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
