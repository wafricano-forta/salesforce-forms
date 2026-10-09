// Zip qualification (CDN JSON — same source as lander-form.js)
let qualifyingZipSet = new Set();
let isZipDataLoaded = false;

/** Canonical ASD diagnosis dropdown values. Anything outside this list is a data fault, not a lead. */
const RECOGNIZED_DIAGNOSIS_VALUES = [
    'yes',
    'no',
    'no, on a waitlist',
    'no, have non-asd diagnosis',
    'no, iep only',
    'no, evaluation scheduled'
];

const ZIP_CDN_URL = 'https://cdn.prod.fortahealth.com/assets/zip_code_coverage.json';
/** Salesforce: Expected Total ABA Hours per Week */
const EXPECTED_ABA_HOURS_PER_WEEK_FIELD_ID = '00NRc00000NxTLk';
/** Salesforce: External Lead Value (Meta fbclid / _fbc) */
const EXTERNAL_LEAD_VALUE_FIELD_ID = '00NRc00000m9vt3';
/** Salesforce: UTM Ad Set Name */
const UTM_ADSET_NAME_FIELD_ID = '00NRc00000rofku';

function setSalesforceHiddenField(fieldId, value) {
    var el = document.getElementById(fieldId);
    if (!el) {
        el = document.querySelector('[name="' + fieldId + '"]');
    }
    if (el) {
        el.value = value != null ? value : '';
    }
}

function setExternalLeadValue(value) {
    setSalesforceHiddenField(EXTERNAL_LEAD_VALUE_FIELD_ID, value);
    var legacy = document.getElementById('fbc_field');
    if (legacy && legacy.id !== EXTERNAL_LEAD_VALUE_FIELD_ID && legacy.getAttribute('name') !== EXTERNAL_LEAD_VALUE_FIELD_ID) {
        legacy.value = value != null ? value : '';
    }
}

function normalizeZip(zipValue) {
    return String(zipValue || '').trim().replace(/\D/g, '').slice(0, 5);
}

function isZipQualified(zipValue) {
    const raw = normalizeZip(zipValue);
    if (raw.length === 5 && qualifyingZipSet.has(raw)) {
        return true;
    }
    if (raw.length === 4) {
        const padded = raw.padStart(5, '0');
        return qualifyingZipSet.has(padded);
    }
    return false;
}

function isZipQualifyingForLead(zipValue) {
    return isZipDataLoaded && isZipQualified(zipValue);
}

function findExpectedAbaHoursField(formSalesEl) {
    var fieldId = (typeof window.EXPECTED_ABA_HOURS_PER_WEEK_FIELD_ID === 'string' && window.EXPECTED_ABA_HOURS_PER_WEEK_FIELD_ID)
        ? window.EXPECTED_ABA_HOURS_PER_WEEK_FIELD_ID
        : EXPECTED_ABA_HOURS_PER_WEEK_FIELD_ID;
    var el = document.getElementById(fieldId);
    if (!el) {
        el = document.querySelector('[name="' + fieldId + '"]');
    }
    function findByLabel(root) {
        if (!root) return null;
        var labels = root.querySelectorAll('label');
        for (var i = 0; i < labels.length; i++) {
            var text = (labels[i].textContent || '').replace(/\s+/g, ' ').trim();
            if (/expected\s+total\s+aba\s+hours/i.test(text)) {
                var forId = labels[i].getAttribute('for');
                if (forId) {
                    var match = document.getElementById(forId);
                    if (match) return match;
                }
            }
        }
        return null;
    }
    if (!el) {
        el = findByLabel(formSalesEl);
    }
    if (!el) {
        el = findByLabel(document);
    }
    return el || null;
}

function getExpectedAbaHoursPerWeekValue(formSalesEl) {
    var el = findExpectedAbaHoursField(formSalesEl);
    if (!el) return NaN;
    var raw = String(el.value != null ? el.value : '').replace(/,/g, '').trim();
    if (raw === '' && el.options && el.selectedIndex >= 0) {
        raw = String(el.options[el.selectedIndex].text || '').replace(/,/g, '').trim();
    }
    if (raw === '') return NaN;
    return parseFloat(raw);
}

function isExpectedAbaHoursValid(formSalesEl) {
    var hours = getExpectedAbaHoursPerWeekValue(formSalesEl);
    return !isNaN(hours) && hours >= 0;
}

function ensureExpectedAbaHoursRequired(formSalesEl) {
    var el = findExpectedAbaHoursField(formSalesEl);
    if (el) {
        el.setAttribute('required', 'required');
    }
}

function thankYouUrlForMqlIntake(formSalesEl, isSpanishLanguage, isInHomeQualifying) {
    var spanish = !!isSpanishLanguage;
    var inHome = !!isInHomeQualifying;

    if (inHome) {
        return spanish
            ? 'https://www.fortahealth.com/in-home/thank-you-intake-schedule-your-call-spanish'
            : 'https://www.fortahealth.com/in-home/thank-you-intake-schedule-your-call';
    }
    return spanish
        ? 'https://www.fortahealth.com/es/thank-you-schedule'
        : 'https://www.fortahealth.com/thank-you-schedule-your-call';
}

function loadQualifyingZipData() {
    const setZipDataFromCoverageJson = function (rows) {
        const nextSet = new Set();
        (rows || []).forEach(function (row) {
            const zip = normalizeZip(row && row['Zip Code']);
            const status = String((row && row.Status) || '').trim().toLowerCase();
            if (zip.length === 5 && status === 'qualified') {
                nextSet.add(zip);
            }
        });
        qualifyingZipSet = nextSet;
        isZipDataLoaded = true;
        window.dispatchEvent(new Event('qualifyingZipDataLoaded'));
    };

    return fetch(ZIP_CDN_URL)
        .then(function (response) {
            if (!response.ok) {
                throw new Error('CDN zip data fetch failed with status ' + response.status);
            }
            return response.json();
        })
        .then(setZipDataFromCoverageJson)
        .catch(error => {
            console.error('Error fetching zip qualification data from CDN:', error);
            qualifyingZipSet = new Set();
            isZipDataLoaded = true;
            window.dispatchEvent(new Event('qualifyingZipDataLoaded'));
        });
}

// -----------------------
// Script for GCLID Capture
// -----------------------
window.addEventListener('DOMContentLoaded', function () {
    var gclid = getURLParameter('gclid');
    if (gclid) {
        var gclidField = document.getElementById("00N8b00000GjstL");
        if (gclidField) {
            gclidField.value = gclid;
        }
    }
});

// ---------------------------------
// Script for Communication Checkbox
// ---------------------------------
const communicationYes = document.getElementById("communicationYes");
communicationYes.addEventListener("change", () => {
    const communicationField = document.getElementById("00N8b00000EQM3O");
    communicationField.value = communicationYes.checked ? "Yes" : "No";
});

// -------------------------
// Script for State Dropdown
// -------------------------
const select = document.getElementById("select");
const state2 = document.getElementById("input-field-1");
select.addEventListener("change", function () {
    state2.value = select.value;
    fieldInteractions.select = true; // Track interaction
});

// -----------------------
// Script for ASD Dropdown
// -----------------------
const asd = document.getElementById("asd");
const asdInput = document.getElementById("00N8b00000EQM2f");
asd.addEventListener("change", function () {
    asdInput.value = asd.value;
    fieldInteractions.asd = true; // Track interaction
});

// -------------------------
// Script for Type Dropdowns
// -------------------------
const type = document.getElementById("type");
const typeInput = document.getElementById("00N8b00000Bz6ey");
type.addEventListener("change", function () {
    typeInput.value = type.value;
});

const type2 = document.getElementById("type2");
const type2Input = document.getElementById("00NRc00000KXQa0");
type2.addEventListener("change", function () {
    type2Input.value = type2.value;
});

// -------------------
// Script for Zip Code (scoped to Salesforce form only)
// -------------------
const formWrapperEl = document.getElementById('form_wrapper');
const zipInput = formWrapperEl ? formWrapperEl.querySelector('input#zip[name="zip"]') : null;
if (zipInput) {
    zipInput.addEventListener('input', function () {
        if (this.value.length > this.maxLength) {
            this.value = this.value.slice(0, this.maxLength);
        }
    });
}

// --------------
// Script for Age
// --------------
const ageInput = document.getElementById('00N8b00000EQM2a');
ageInput.addEventListener('input', function () {
    if (this.value.length > this.maxLength) {
        this.value = this.value.slice(0, this.maxLength);
    }
});

// ---------------------------
// Enhanced Email Validation
// ---------------------------
const emailInput = document.getElementById('email');

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const disposableDomainsRegex = /\.(10minutemail|guerrillamail|mailinator|tempmail|yopmail|throwaway|temp-mail|guerrillamailblock|sharklasers|grr\.la|guerrilamailblock|pokemail|spam4\.me|bccto\.me|chacuo\.net|dispostable|spambox|spamgourmet)\./i;
    const suspiciousPatterns = /^(test|admin|noreply|no-reply|info|support|contact)@/i;
    
    return emailRegex.test(email) && 
           !disposableDomainsRegex.test(email) && 
           !suspiciousPatterns.test(email) &&
           email.length >= 5 && 
           email.length <= 254;
}

emailInput.addEventListener('invalid', function () {
    this.setCustomValidity('Please enter a valid email address');
});

emailInput.addEventListener('input', function () {
    this.setCustomValidity('');
    fieldInteractions.email = true; // Track interaction
});

emailInput.addEventListener('blur', function() {
    if (this.value && !isValidEmail(this.value)) {
        this.setCustomValidity('Please enter a valid email address from a recognized provider');
        this.reportValidity();
    }
});

emailInput.addEventListener('focus', function() {
    fieldInteractions.email = true; // Track interaction
});

// -----------------------------------
// Script for Phone Number Formatting
// -----------------------------------
const phoneInput = document.getElementById('phone');
phoneInput.addEventListener('keyup', function () {
    phoneInput.value = phoneFormat(phoneInput.value);
});

phoneInput.addEventListener('focus', function() {
    fieldInteractions.phone = true; // Track interaction
});

phoneInput.value = phoneFormat(phoneInput.value);

function phoneFormat(input) {
    input = input.replace(/\D/g, '');
    input = input.substring(0, 10);
    var size = input.length;
    if (size === 0) {
        input = input;
    } else if (size < 4) {
        input = '(' + input;
    } else if (size < 7) {
        input = '(' + input.substring(0, 3) + ') ' + input.substring(3);
    } else {
        input = '(' + input.substring(0, 3) + ') ' + input.substring(3, 6) + ' - ' + input.substring(6, 10);
    }
    return input;
}

// ------------------------------
// Function to Get URL Parameters
// ------------------------------
function getURLParameter(name) {
    return decodeURIComponent((new RegExp('[?|&]' + name + '=' +
        '([^&;]+?)(&|#|;|$)').exec(location.search) || [null, ''])[1].replace(
            /\+/g, '%20')) || null;
}

function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2].trim()) : '';
}

// Meta Facebook Click ID: _fbc cookie, or fb.1.{timestamp}.{fbclid} from fbclid URL param
function getFacebookClickId() {
    var fbc = getCookie('_fbc');
    if (fbc) return fbc;
    var fbclid = getURLParameter('fbclid');
    if (fbclid) {
        return 'fb.1.' + Math.floor(Date.now() / 1000) + '.' + fbclid;
    }
    return '';
}

// ----------------------
// Capture UTM Parameters
// ----------------------
function populateHiddenFields() {
    var utm_source = getURLParameter('utm_source');
    var utm_medium = getURLParameter('utm_medium');
    var utm_campaign = getURLParameter('utm_campaign');
    var utm_content = getURLParameter('utm_content');
    var utm_domain = getURLParameter('utm_domain');
    var utm_adsetname = getURLParameter('utm_adsetname');

    if (document.getElementById('00NRc0000083yKn')) {
        document.getElementById('00NRc0000083yKn').value = utm_source || '';
    }
    if (document.getElementById('00NRc0000083yW5')) {
        document.getElementById('00NRc0000083yW5').value = utm_medium || '';
    }
    if (document.getElementById('00NRc0000083yhN')) {
        document.getElementById('00NRc0000083yhN').value = utm_campaign || '';
    }
    if (document.getElementById('00NRc0000083pBL')) {
        document.getElementById('00NRc0000083pBL').value = utm_content || '';
    }
    if (document.getElementById('00NRc00000D4OSr')) {
        document.getElementById('00NRc00000D4OSr').value = utm_domain || '';
    }
    setSalesforceHiddenField(UTM_ADSET_NAME_FIELD_ID, utm_adsetname || '');
    setExternalLeadValue(getFacebookClickId());
}

document.addEventListener('DOMContentLoaded', populateHiddenFields);

// ------------------------------------
// SPAM PROTECTION VARIABLES
// ------------------------------------
let formLoadTime = Date.now();
let recaptchaLoaded = false;
let fieldInteractions = {
    email: false,
    phone: false,
    select: false,
    asd: false,
    mouseMovements: 0,
    keystrokes: 0
};

// Track human-like behavior
document.addEventListener('mousemove', function() {
    fieldInteractions.mouseMovements++;
});

document.addEventListener('keydown', function() {
    fieldInteractions.keystrokes++;
});

// ------------------------------------
// Load JSON Data and Initialize Script
// ------------------------------------
let jsonData = [];
let isScriptInitialized = false;

function onRecaptchaLoad() {
    recaptchaLoaded = true;
    const tofuPromise = fetch('https://cdn.prod.fortahealth.com/assets/tofu_payor_status.json')
        .then(response => response.json());
    const zipPromise = loadQualifyingZipData();

    Promise.all([tofuPromise, zipPromise])
        .then(([data]) => {
            jsonData = data;
            if (!isScriptInitialized) {
                initializeScript();
                isScriptInitialized = true;
            }
        })
        .catch(error => console.error('Error fetching required data:', error));
}

// ------------------------------------
// SPAM DETECTION FUNCTIONS
// ------------------------------------
function detectSpam() {
    const reasons = [];
    
    // Check honeypot fields (only check fields that should always be empty)
    // Note: 'company' is a legitimate field pre-filled with "Forta10", so it's excluded
    const honeypotFields = ['website', 'confirm_email'];
    for (let fieldName of honeypotFields) {
        const field = document.getElementById(fieldName);
        // Only flag if field exists AND has a non-empty value (legitimate honeypots should be empty)
        if (field && field.value.trim() !== '') {
            reasons.push('honeypot_filled');
            break;
        }
    }
    
    // Check form submission speed (reduced from 3 seconds to 0.5 seconds - only catch obvious bots)
    const submissionTime = Date.now();
    const timeSpent = submissionTime - formLoadTime;
    if (timeSpent < 500) { // Less than 0.5 seconds
        reasons.push('too_fast');
    }
    
    // Check field interactions (relaxed - only require 1 out of 3 key fields)
    const interactionCount = [fieldInteractions.email, fieldInteractions.phone, fieldInteractions.select].filter(Boolean).length;
    if (interactionCount === 0) {
        reasons.push('no_interaction');
    }
    
    // Check for human-like behavior (relaxed - removed strict requirements)
    // Only flag if there's absolutely no activity
    if (fieldInteractions.mouseMovements === 0 && fieldInteractions.keystrokes === 0) {
        reasons.push('no_human_behavior');
    }
    
    // Check email validity (keep basic validation but be more lenient)
    const email = document.getElementById('email').value;
    if (email && !isValidEmail(email)) {
        reasons.push('invalid_email');
    }
    
    // Check for suspicious patterns in form data (require multiple suspicious patterns)
    const formData = new FormData(document.getElementById('form_wrapper'));
    let suspiciousCount = 0;
    
    for (let [key, value] of formData.entries()) {
        if (typeof value === 'string') {
            // Check for common spam patterns
            if (value.match(/https?:\/\//i) || // URLs
                value.match(/\b(viagra|casino|bitcoin|crypto|loan|debt)\b/i) || // Spam keywords
                value.length > 2000 || // Unusually long text (increased from 1000)
                value.match(/(.)\1{20,}/)) { // Repeated characters (increased from 10)
                suspiciousCount++;
            }
        }
    }
    
    // Require at least 3 suspicious patterns to flag (was 1)
    if (suspiciousCount >= 3) {
        reasons.push('suspicious_content');
    }
    
    return reasons;
}

function initializeScript() {
    // ---------------------
    // Variable Declarations
    // ---------------------
    const insuranceSelect = document.getElementById("InsuranceSelect");
    const insuranceName = document.getElementById("insuranceName");
    const insuranceName2 = document.getElementById("insuranceName2");
    const insurance = document.getElementById("insurance");
    const insurance2 = document.getElementById("insurance2");
    const primaryInsuranceInput = document.getElementById("00N8b00000EQM3J");
    const secondaryInsuranceInput = document.getElementById("00NRc00000KXXrJ");
    const type = document.getElementById("type");
    const type2 = document.getElementById("type2");
    const formSales = document.getElementById("form_wrapper");
    const select = document.getElementById("select");
    const statePrimary = document.getElementById('statePrimary');
    const stateSecondary = document.getElementById('stateSecondary');
    const asd = document.getElementById('asd');
    const ageInput = document.getElementById('00N8b00000EQM2a');
    const formZipInput = formSales ? formSales.querySelector('input#zip[name="zip"]') : null;
    const requestedServiceSelect = document.getElementById('00NRc00000qudCY');
    const inHomeZipStatusInput = document.getElementById('00NRc00000r0X4m');
    const languageSelect = document.getElementById('00NRc00000kKz0K');
    const requestedServiceFieldContainer = requestedServiceSelect ? requestedServiceSelect.closest('.sf-field') : null;
    const leadSource = document.getElementById('lead_source');
    const referralDiv = document.querySelector('.is-referral');

    ensureExpectedAbaHoursRequired(formSales);

    function updateInHomeFieldVisibilityFromZip() {
        if (!formZipInput) return;
        const isQualified = isZipQualifyingForLead(formZipInput.value);

        if (requestedServiceFieldContainer) {
            if (isQualified) {
                requestedServiceFieldContainer.classList.remove('is-hidden');
                requestedServiceFieldContainer.style.display = '';
            } else {
                requestedServiceFieldContainer.classList.add('is-hidden');
                requestedServiceFieldContainer.style.display = 'none';
                if (requestedServiceSelect) {
                    requestedServiceSelect.value = '';
                }
            }
        }

        if (requestedServiceSelect) {
            requestedServiceSelect.removeAttribute('required');
        }

        if (inHomeZipStatusInput) {
            inHomeZipStatusInput.value = isQualified ? 'Yes' : 'No';
        }
    }

    if (formZipInput) {
        updateInHomeFieldVisibilityFromZip();
        formZipInput.addEventListener('input', updateInHomeFieldVisibilityFromZip);
        formZipInput.addEventListener('change', updateInHomeFieldVisibilityFromZip);
        formZipInput.addEventListener('keyup', updateInHomeFieldVisibilityFromZip);
    }
    window.addEventListener('qualifyingZipDataLoaded', updateInHomeFieldVisibilityFromZip);

    let recaptchaContainer = document.getElementById('recaptcha-container');
    let captchaErrorMessage = document.getElementById('missing_captcha_error_message');
    
    if (recaptchaContainer && typeof grecaptcha !== "undefined") {
        grecaptcha.render(recaptchaContainer, { 
            sitekey: '6Ldp-yorAAAAAH7nTspqJRX-wZQ1HKfvJEpV3g8B',
            callback: function(token) {
                if (captchaErrorMessage) captchaErrorMessage.style.display = 'none';
            },
            'expired-callback': function() {
                if (captchaErrorMessage) {
                    captchaErrorMessage.style.display = 'block';
                    captchaErrorMessage.textContent = 'Captcha expired. Please try again.';
                }
            },
            'error-callback': function() {
                if (captchaErrorMessage) {
                    captchaErrorMessage.style.display = 'block';
                    captchaErrorMessage.textContent = 'Captcha failed to load. Please refresh.';
                }
            }
        });
    }

    // ------------------------
    // Reset Form Functionality
    // ------------------------
    function resetForm() {
        insuranceName.classList.add("is-hidden");
        insuranceName2.classList.add("is-hidden");
        insurance.value = "";
        insurance2.value = "";
        type.value = "";
        type2.value = "";
        primaryInsuranceInput.value = "";
        secondaryInsuranceInput.value = "";

        insurance.removeAttribute("required");
        type.removeAttribute("required");
        insurance2.removeAttribute("required");
        type2.removeAttribute("required");
    }

    // --------------------------------------
    // Event Listener for Insurance Selection
    // --------------------------------------
    insuranceSelect.addEventListener("change", function () {
        resetForm();
        const selection = insuranceSelect.value.trim();

        if (selection === 'Yes, primary only') {
            insuranceName.classList.remove("is-hidden");
            insurance.setAttribute("required", "required");
            type.setAttribute("required", "required");

            statePrimary.value = select.value;
            stateSecondary.value = select.value;
        } else if (selection === 'Yes, primary & secondary') {
            insuranceName.classList.remove("is-hidden");
            insuranceName2.classList.remove("is-hidden");
            insurance.setAttribute("required", "required");
            type.setAttribute("required", "required");
            insurance2.setAttribute("required", "required");
            type2.setAttribute("required", "required");

            statePrimary.value = select.value;
            stateSecondary.value = select.value;
        }
    });

    // ---------------------------------------
    // Event Listener for Main State Selection
    // ---------------------------------------
    select.addEventListener('change', function () {
        const selectedState = this.value;

        if (statePrimary) statePrimary.value = selectedState;
        if (stateSecondary) stateSecondary.value = selectedState;

        const type1 = type.value;
        const type2Value = type2.value;
        updateInsuranceDropdowns(statePrimary.value, type1, 'insurance');
        updateInsuranceDropdowns(stateSecondary.value, type2Value, 'insurance2');
    });

    // ------------------------------------------
    // Functions to Find Insurance Data from JSON
    // ------------------------------------------
    function findInsuranceData(state, insuranceName) {
        return jsonData.find(item =>
            item.state === state &&
            item.tofu_payor_name === insuranceName
        );
    }

    // ------------------------------------------
    // Update Hidden Fields for Primary Insurance
    // --------------------------------------------------
    function updatePrimaryInsuranceFields(state, insuranceName) {
        const insuranceData = findInsuranceData(state, insuranceName);
        if (insuranceData) {
            document.getElementById('00NRc00000OHqQz').value = insuranceData.final_forta_bay;
            document.getElementById('00NRc00000OHo1Z').value = insuranceData.inn_oon_designation;
            primaryInsuranceInput.value = insuranceData.payor_name;
        } else {
            document.getElementById('00NRc00000OHqQz').value = '';
            document.getElementById('00NRc00000OHo1Z').value = '';
            primaryInsuranceInput.value = '';
        }
    }

    // --------------------------------------------
    // Update Hidden Fields for Secondary Insurance
    // --------------------------------------------
    function updateSecondaryInsuranceFields(state, insuranceName) {
        const insuranceData = findInsuranceData(state, insuranceName);
        if (insuranceData) {
            document.getElementById('00NRc00000OHWu6').value = insuranceData.final_forta_bay;
            document.getElementById('00NRc00000OHuZR').value = insuranceData.inn_oon_designation;
            secondaryInsuranceInput.value = insuranceData.payor_name;
        } else {
            document.getElementById('00NRc00000OHWu6').value = '';
            document.getElementById('00NRc00000OHuZR').value = '';
            secondaryInsuranceInput.value = '';
        }
    }

    // -----------------------------------------
    // Event Listeners for Insurance Name Fields
    // -----------------------------------------
    insurance.addEventListener("change", function () {
        const selectedState = statePrimary.value;
        updatePrimaryInsuranceFields(selectedState, this.value);
    });

    insurance2.addEventListener("change", function () {
        const selectedState = stateSecondary.value;
        updateSecondaryInsuranceFields(selectedState, this.value);
    });

    // -----------------------------------------------------
    // Event Listener for Changes in Primary Insurance State
    // -----------------------------------------------------
    statePrimary.addEventListener('change', function () {
        const selectedState = this.value;
        const selectedType = type.value;
        updateInsuranceDropdowns(selectedState, selectedType, 'insurance');

        insurance.selectedIndex = 0;
        primaryInsuranceInput.value = '';
    });

    // -------------------------------------------------------
    // Event Listener for Changes in Secondary Insurance State
    // -------------------------------------------------------
    stateSecondary.addEventListener('change', function () {
        const selectedState = this.value;
        const selectedType = type2.value;
        updateInsuranceDropdowns(selectedState, selectedType, 'insurance2');

        insurance2.selectedIndex = 0;
        secondaryInsuranceInput.value = '';
    });

    // ----------------------------------------------------
    // Event Listener for Changes in Primary Insurance Type
    // ----------------------------------------------------
    type.addEventListener("change", function () {
        const selectedState = statePrimary.value;
        const selectedType = this.value;
        updateInsuranceDropdowns(selectedState, selectedType, 'insurance');

        insurance.selectedIndex = 0;
        primaryInsuranceInput.value = '';
    });

    // ------------------------------------------------------
    // Event Listener for Changes in Secondary Insurance Type
    // ------------------------------------------------------
    type2.addEventListener("change", function () {
        const selectedState = stateSecondary.value;
        const selectedType = this.value;
        updateInsuranceDropdowns(selectedState, selectedType, 'insurance2');

        insurance2.selectedIndex = 0;
        secondaryInsuranceInput.value = '';
    });

    // ------------------------------------------
    // Event Listener for Lead Source Selection
    // ------------------------------------------
    if (leadSource && referralDiv) {
        leadSource.addEventListener("change", function () {
            if (this.value === "Physician Referral") {
                referralDiv.classList.remove("is-hidden");
            } else {
                referralDiv.classList.add("is-hidden");
                const providerField = document.getElementById('00NRc00000kLEgb');
                if (providerField) {
                    providerField.value = '';
                }
            }
        });
    }

    // --------------------------------------------------
    // Update Insurance Dropdowns Based on State and Type
    // --------------------------------------------------
    function updateInsuranceDropdowns(state, type, insuranceId) {
        const payorNames = filterPayors(state, type);
        const insuranceDropdown = document.getElementById(insuranceId);

        insuranceDropdown.innerHTML = '';

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.text = 'Select provider';
        insuranceDropdown.appendChild(defaultOption);

        const filteredPayors = payorNames.filter(payor => payor.tofu_payor_name && payor.tofu_payor_name.trim() !== '');
        filteredPayors.sort((a, b) => {
            const nameA = a.tofu_payor_name.toUpperCase();
            const nameB = b.tofu_payor_name.toUpperCase();
            return nameA.localeCompare(nameB);
        });

        filteredPayors.forEach(payor => {
            const option = document.createElement('option');
            option.value = payor.tofu_payor_name;
            option.text = payor.tofu_payor_name;
            insuranceDropdown.appendChild(option);
        });

        insuranceDropdown.selectedIndex = 0;

        if (insuranceId === 'insurance') {
            primaryInsuranceInput.value = '';
            document.getElementById('00NRc00000OHqQz').value = '';
            document.getElementById('00NRc00000OHo1Z').value = '';
        } else {
            secondaryInsuranceInput.value = '';
            document.getElementById('00NRc00000OHWu6').value = '';
            document.getElementById('00NRc00000OHuZR').value = '';
        }
    }

    // -------------------------------------------------
    // Function to Filter Payors Based on State and Type
    // -------------------------------------------------
    function filterPayors(state, type) {
        if (type === 'Yes') {
            return jsonData.filter(item =>
                item.state === state &&
                (item.payor_type === 'Medicaid' || item.payor_type === 'MCO') &&
                item.tofu_payor_name != null &&
                item.tofu_payor_name.trim() !== ''
            );
        } else if (type === 'No') {
            return jsonData.filter(item =>
                item.state === state &&
                (item.payor_type === 'Commercial' || item.payor_type === 'Government Plan') &&
                item.tofu_payor_name != null &&
                item.tofu_payor_name.trim() !== ''
            );
        }
        return [];
    }

    // --------------------------
    // ENHANCED FORM SUBMISSION WITH SPAM PROTECTION
    // --------------------------
    formSales.addEventListener('submit', function (event) {
        
        // SPAM DETECTION CHECKS
        const spamReasons = detectSpam();
        if (spamReasons.length > 0) {
            event.preventDefault();
            console.log('Spam detected:', spamReasons);
            // Optionally show a generic error message
            alert('There was an error processing your submission. Please ensure all fields are completed correctly and try again.');
            return;
        }

        // RECAPTCHA VALIDATION
        if (!recaptchaLoaded || typeof grecaptcha === "undefined") {
            event.preventDefault();
            alert('Please wait for the security verification to load completely.');
            return;
        }

        const recaptchaResponse = grecaptcha.getResponse();
        if (!recaptchaResponse || recaptchaResponse.length === 0) {
            event.preventDefault();
            let captchaErrorMessage = document.getElementById('missing_captcha_error_message');
            if (captchaErrorMessage) {
                captchaErrorMessage.textContent = 'Please complete the security verification.';
                captchaErrorMessage.style.display = 'block';
            }
            return;
        }

        if (!isExpectedAbaHoursValid(formSales)) {
            event.preventDefault();
            var hoursField = findExpectedAbaHoursField(formSales);
            if (hoursField) {
                hoursField.focus();
                hoursField.reportValidity && hoursField.reportValidity();
            }
            alert('Please enter the expected total ABA hours per week before submitting.');
            return;
        }

        // Update hidden fields before submission
        setExternalLeadValue(getFacebookClickId());

        const statePrimaryValue = statePrimary.value;
        const insurancePrimary = insurance.value;
        if (insurancePrimary) {
            updatePrimaryInsuranceFields(statePrimaryValue, insurancePrimary);
        }

        const stateSecondaryValue = stateSecondary.value;
        const insuranceSecondary = insurance2.value;
        if (insuranceSecondary) {
            updateSecondaryInsuranceFields(stateSecondaryValue, insuranceSecondary);
        }

        // Gather values from form fields
        const asdDiagnosis = asd.value.trim();
        const hasInsurance = insuranceSelect.value;
        const childAge = parseInt(ageInput.value, 10);
        const state = select.value;
        const zip = formZipInput ? formZipInput.value : '';
        const isQualifyingZip = isZipQualifyingForLead(zip);
        const insuranceProvider = insurance.value;
        const mqlStatusField = document.getElementById('00NRc00000Nxa1C');

        // Diagnosis Disqualify States
        const diagnosisDisqualifyStates = ["AK", "CA", "IA", "HI", "LA", "MA", "MT", "NM", "NY", "OR"];

        // Get primary insurance's TOFU Status using the correct state
        const insuranceData = findInsuranceData(statePrimaryValue, insuranceProvider);
        const tofuStatus = insuranceData ? insuranceData.tofu_status : null;
        const payorType = insuranceData ? insuranceData.payor_type : null;
        const selectedLanguage = languageSelect ? languageSelect.value : '';
        const isSpanishLanguage = selectedLanguage.toLowerCase().includes('spanish');
        const hasPositiveDiagnosis = asdDiagnosis.toLowerCase() === 'yes';
        const isInHomePassing = isQualifyingZip && tofuStatus === 'Passing' && hasPositiveDiagnosis;

        if (inHomeZipStatusInput) {
            inHomeZipStatusInput.value = isQualifyingZip ? 'Yes' : 'No';
        }

        // --------------------------------------
        // Redirect Logic Based on Business Rules (aligned with lander-form.js)
        // --------------------------------------
        let returnURL = '';
        let mqlStatus = '';

        // Data-integrity guard: the diagnosis dropdown is mandatory on every form, so a blank
        // value means the page's JS/markup was bypassed. Never let it score as an MQL.
        if (asdDiagnosis === '') {
            returnURL = "https://www.fortahealth.com/thank-you-2";
            mqlStatus = "Bot";
        }
        // Present but unrecognized => a dropdown option was renamed out of sync with this file.
        else if (!RECOGNIZED_DIAGNOSIS_VALUES.includes(asdDiagnosis.toLowerCase())) {
            returnURL = "https://www.fortahealth.com/thank-you-2";
            mqlStatus = "DQ - Other";
        }
        else if (hasInsurance === 'No') {
            returnURL = "https://www.fortahealth.com/thank-you-2";
            mqlStatus = "DQ - No Insurance";
        }
        else if (
            (state === 'SC' || state === 'TX') &&
            !isQualifyingZip &&
            (payorType === 'Medicaid' || payorType === 'MCO')
        ) {
            returnURL = "https://www.fortahealth.com/thank-you-2";
            mqlStatus = "DQ - Not in Zip Code";
        }
        else if (
            asdDiagnosis.toLowerCase() === "no, evaluation scheduled" ||
            (asdDiagnosis.toLowerCase() === "no, iep only" && state.toLowerCase() === "ca" && type.value.toLowerCase() === "yes")
        ) {
            returnURL = "https://www.fortahealth.com/thank-you-diagnosis";
            mqlStatus = "Dx - Check Eval";
        }
        else if (
            ["no", "no, on a waitlist", "no, have non-asd diagnosis", "no, iep only"].includes(asdDiagnosis.toLowerCase())
        ) {
            returnURL = "https://www.fortahealth.com/thank-you-2";
            mqlStatus = "DQ - No Diagnosis";
        }
        else if (isInHomePassing) {
            returnURL = thankYouUrlForMqlIntake(formSales, isSpanishLanguage, isInHomePassing);
            mqlStatus = "MQL - In-Home";
        }
        else if (asdDiagnosis.toLowerCase() === "yes" && tofuStatus === "Passing") {
            returnURL = thankYouUrlForMqlIntake(formSales, isSpanishLanguage, isInHomePassing);
            mqlStatus = "MQL";
        }
        else if (tofuStatus === "Disqualify") {
            returnURL = "https://www.fortahealth.com/thank-you-2";
            mqlStatus = "DQ - Insurance not supported";
        }
        else if (tofuStatus === "Passing") {
            returnURL = thankYouUrlForMqlIntake(formSales, isSpanishLanguage, isInHomePassing);
            mqlStatus = "MQL";
        }
        else if (
            asdDiagnosis.toLowerCase() !== "yes" &&
            diagnosisDisqualifyStates.includes(state) &&
            asdDiagnosis.toLowerCase().includes('no')
        ) {
            returnURL = "https://www.fortahealth.com/thank-you-2";
            mqlStatus = "DQ - No Diagnosis";
        }
        else if (childAge > 99) {
            returnURL = "https://www.fortahealth.com/thank-you-2";
            mqlStatus = "DQ - Age";
        } else {
            returnURL = "https://www.fortahealth.com/thank-you-2";
            mqlStatus = "DQ - Other";
        }

        // Set the MQL Status hidden field
        mqlStatusField.value = mqlStatus;

        // Set the return URL
        document.getElementsByName("retURL")[0].value = returnURL;

        // consolidate the two different submit handlers into one
        communicationYes.remove();
        document.getElementById('consent').remove();
    }); // Close formSales.addEventListener
}
