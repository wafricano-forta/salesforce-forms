/* =========================================================================
   FORTA — CLINIC WAITLIST APP · OUTCOME ROUTING PATCH  (rev 2)
   -------------------------------------------------------------------------
   Adds pass/fail routing to clinic-waitlist-app.js (currently every family
   just returns to the same page with ?submitted=1 and MQL Status is blank).

   WHAT THIS DOES
   - Computes the outcome client-side from the answers the form already
     collects (insurance/coverage, payor tofu_status, diagnosis, ZIP), then
     sets retURL + MQL Status accordingly. Web-to-Lead still fires for EVERY
     submission, so no leads are lost ("capture everyone").
   - Layers the clinic on top of the existing In-Home/Virtual routing:
       Houston metro           -> new /clinic/thank-you-* pages
       outside metro, In-Home  -> /in-home/thank-you-intake-schedule-your-call
       outside metro, Virtual  -> /thank-you-intake-pre-qualified
   - Precedence: insurance -> diagnosis -> clinic -> in-home -> virtual -> DQ.

   REV 2 CHANGE (Will): In-Home/Virtual passes now go straight to the two
   intake pages below — no >=15hr "schedule-your-call" split. Only the
   inHomeVirtualUrl() function changed vs rev 1.

   HOW TO APPLY (two edits inside the existing IIFE)
   1) Paste the block in SECTION A anywhere after the CONFIG (e.g. right
      before the "SALESFORCE SUBMIT" section). Uses only helpers that already
      exist: LANG, state, houstonMetro(), inHomeQualifies(), findPayorRow(),
      insStateFor(), famState().
   2) In submit(), replace the two lines noted in SECTION B.

   ASSUMPTIONS TO VERIFY
   - payor rows from tofu_payor_status.json include `tofu_status`
     ('Passing' | 'Disqualify'). (lander-form.js already relies on this.)
   - "MQL - Clinic" is added to the Salesforce MQL Status picklist. All other
     status values reuse existing picklist entries.
   - Clinic (metro) is lenient: any insurance that isn't "none" or an explicit
     Disqualify still becomes an MQL - Clinic waitlist lead (sales verifies
     later). In-Home/Virtual still require a confirmed Passing payor.
   - Requested Service stays "In Clinic" for all (origin); MQL Status carries
     the routed service.
   ========================================================================= */


/* ============================== SECTION A ============================== */
/* ---- paste after CONFIG (uses only existing app helpers) ---- */

var TY = {
  scheduleEN:  location.origin + '/clinic/thank-you-schedule',
  scheduleES:  location.origin + '/es/clinic/thank-you-schedule',
  insuranceEN: location.origin + '/clinic/thank-you-insurance',
  insuranceES: location.origin + '/es/clinic/thank-you-insurance',
  dxEN:        location.origin + '/clinic/thank-you-dx',
  dxES:        location.origin + '/es/clinic/thank-you-dx'
};

/* Existing In-Home / Virtual intake destinations (locale-aware). */
function inHomeVirtualUrl(isEs, inHome) {
  if (inHome) return isEs
    ? 'https://www.fortahealth.com/in-home/thank-you-intake-schedule-your-call-spanish'
    : 'https://www.fortahealth.com/in-home/thank-you-intake-schedule-your-call';
  return isEs
    ? 'https://www.fortahealth.com/es/thank-you-intake'
    : 'https://www.fortahealth.com/thank-you-intake-pre-qualified';
}

/* First match wins. Returns { url, mql }. Requested Service stays "In Clinic". */
function computeClinicRoute() {
  var isEs   = LANG === 'es';
  var metro  = houstonMetro(state.zip);                 // Houston 770–775 → clinic-serviceable
  var inHome = inHomeQualifies();                        // in-home coverage ZIP
  var pRow   = findPayorRow(state.primaryType, state.primaryPayor, insStateFor('primaryState'));
  var tofu   = pRow ? pRow.tofu_status : null;           // 'Passing' | 'Disqualify' | null
  var st     = famState();

  // 1 · No insurance
  if (state.coverage === 'none')
    return { url: isEs ? TY.insuranceES : TY.insuranceEN, mql: 'DQ - No Insurance' };

  // 2 · Payor explicitly not accepted
  if (tofu === 'Disqualify')
    return { url: isEs ? TY.insuranceES : TY.insuranceEN, mql: 'DQ - Insurance not supported' };

  // 3 · No diagnosis (Not yet / Not sure)  — 'yes' and 'in-process' pass
  if (state.diagnosis === 'no' || state.diagnosis === 'unsure')
    return { url: isEs ? TY.dxES : TY.dxEN, mql: 'DQ - No Diagnosis' };

  // 4 · Houston metro → clinic waitlist (lenient: any non-disqualified insurance)
  if (metro)
    return { url: isEs ? TY.scheduleES : TY.scheduleEN, mql: 'MQL - Clinic' };

  // 5 · Outside metro, In-Home ZIP + accepted payor → In-Home
  if (inHome && tofu === 'Passing')
    return { url: inHomeVirtualUrl(isEs, true), mql: 'MQL - In-Home' };

  // 6 · Outside metro/In-Home, accepted payor → Virtual
  if (tofu === 'Passing')
    return { url: inHomeVirtualUrl(isEs, false), mql: 'MQL' };

  // 7 · TX/SC Medicaid, not in any service area
  if ((st === 'TX' || st === 'SC') && state.primaryType === 'medicaid')
    return { url: isEs ? TY.insuranceES : TY.insuranceEN, mql: 'DQ - Not in Zip Code' };

  // 8 · Fallback
  return { url: isEs ? TY.insuranceES : TY.insuranceEN, mql: 'DQ - Other' };
}


/* ============================== SECTION B ============================== */
/* ---- inside submit(), REPLACE these existing lines ---- */

/* BEFORE:  fields.retURL = location.origin + location.pathname + '?submitted=1';
   AFTER:   */
     var __route = computeClinicRoute();
     fields.retURL = __route.url;

/* BEFORE:  fields[SF.F_MQL_STATUS] = ''; // intentionally blank — see header note
   AFTER:   */
     fields[SF.F_MQL_STATUS] = __route.mql;

/* Leave as-is:  fields[SF.F_REQUESTED_SERVICE] = SF.REQUESTED_SERVICE_VALUE; // "In Clinic"
   The old ?submitted=1 inline thank-you is now unused (harmless). Test with
   window.__clwDryRun = true → inspect window.__clwLastPayload.fields.retURL. */
