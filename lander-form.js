// Global variables - declare these at the top
let jsonData = [];
let isScriptInitialized = false;
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
    // `type="number"` can drop leading zeroes (e.g. 02134 -> 2134)
    if (raw.length === 4) {
        const padded = raw.padStart(5, '0');
        return qualifyingZipSet.has(padded);
    }
    return false;
}

/** Match UI + submit: only true after CDN zip data has loaded. */
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

/**
 * Parses "Expected Total ABA Hours per Week" (SF field id, optional window override, then label match).
 * Returns NaN if missing so callers default to the pre-qualified thank-you path.
 */
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


function tryRenderRecaptcha() {
  const recaptchaContainer = document.getElementById('recaptcha-container');
  const captchaErrorMessage = document.getElementById('missing_captcha_error_message');

  if (!recaptchaContainer) return false;
  if (typeof grecaptcha === "undefined") return false;
  if (recaptchaContainer.getAttribute('data-recaptcha-rendered') === 'true') return true;

  try {
    grecaptcha.render(recaptchaContainer, {
      sitekey: '6Ldp-yorAAAAAH7nTspqJRX-wZQ1HKfvJEpV3g8B',
      callback: function () {
        if (captchaErrorMessage) captchaErrorMessage.style.display = 'none';
      },
      'expired-callback': function () {
        if (captchaErrorMessage) {
          captchaErrorMessage.style.display = 'block';
          captchaErrorMessage.textContent = 'Captcha expired. Please try again.';
        }
      },
      'error-callback': function () {
        if (captchaErrorMessage) {
          captchaErrorMessage.style.display = 'block';
          captchaErrorMessage.textContent = 'Captcha failed to load. Please refresh.';
        }
      }
    });

    recaptchaContainer.setAttribute('data-recaptcha-rendered', 'true');
    return true;
  } catch (e) {
    return false;
  }
}


// -----------------------
// Script for GCLID Capture
// -----------------------
window.addEventListener('DOMContentLoaded', function () {

    tryRenderRecaptcha(); // in case it’s already there
    const wrapper = document.getElementById('form_wrapper');
    if (wrapper) {
        recaptchaObserver.observe(wrapper, { childList: true, subtree: true });
    }

    var gclid = getURLParameter('gclid');
    //console.log('GCLID from URL:', gclid); // Log the GCLID value
    if (gclid) {
        var gclidField = document.getElementById("00N8b00000GjstL");
        if (gclidField) {
            gclidField.value = gclid;
            // console.log('GCLID field updated with value:', gclidField.value); // Confirm the field is updated
        } else {
            // console.log('GCLID field not found'); // Log if the hidden field is not found
        }
    } else {
        // console.log('No GCLID found in URL'); // Log if GCLID is not present in URL
    }
});

// When the reCAPTCHA script finishes loading
function onRecaptchaLoad() {
  loadJsonAndInitialize();
  tryRenderRecaptcha();
}

// -------------------------
// Script for State Dropdown
// -------------------------
const select = document.getElementById("select");
const state2 = document.getElementById("input-field-1");
select.addEventListener("change", function () {
    state2.value = select.value;
});

// -----------------------
// Script for ASD Dropdown
// -----------------------
const asd = document.getElementById("asd");
const asdInput = document.getElementById("00N8b00000EQM2f");
asd.addEventListener("change", function () {
    asdInput.value = asd.value;
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
// Script for Zip Code
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
// Script for Email Validation
// ---------------------------
const emailInput = document.getElementById('email');
emailInput.addEventListener('invalid', function () {
    this.setCustomValidity('Please enter a valid email');
});

emailInput.addEventListener('input', function () {
    this.setCustomValidity('');
});

// -----------------------------------
// Script for Phone Number Formatting
// -----------------------------------
const phoneInput = document.getElementById('phone');
phoneInput.addEventListener('keyup', function () {
    phoneInput.value = phoneFormat(phoneInput.value);
});

// Format the phone number on page load
phoneInput.value = phoneFormat(phoneInput.value);

// Function to format text to look like a phone number
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
// Load JSON Data and Initialize Script
// ------------------------------------
function loadJsonAndInitialize() {
    if (isScriptInitialized) {
        return; // Already initialized, don't run again
    }

    const tofuPromise = fetch('https://cdn.prod.fortahealth.com/assets/tofu_payor_status.json')
        .then(response => response.json());
    const zipPromise = loadQualifyingZipData();

    Promise.all([tofuPromise, zipPromise])
        .then(([tofuData]) => {
            jsonData = tofuData;
            if (!isScriptInitialized) {
                initializeScript();
                isScriptInitialized = true;
            }
        })
        .catch(error => console.error('Error fetching required data:', error));
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', loadJsonAndInitialize);


// Watch for Webflow inserting/showing the form later
const recaptchaObserver = new MutationObserver(() => {
  if (tryRenderRecaptcha()) recaptchaObserver.disconnect();
});


function initializeScript() {
    // Prevent multiple initializations
    if (isScriptInitialized) {
        console.log('Script already initialized, skipping...');
        return;
    }
    
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
    const leadSource = document.getElementById('lead_source');
    const referralDiv = document.querySelector('.is-referral');
    const requestedServiceFieldContainer = requestedServiceSelect ? requestedServiceSelect.closest('.sf-field') : null;

    ensureExpectedAbaHoursRequired(formSales);

    function getStepIdForHoursField() {
        var hoursField = findExpectedAbaHoursField(formSales);
        if (!hoursField) return 'step02';
        var stepEl = hoursField.closest('[id^="step"]');
        return stepEl && stepEl.id ? stepEl.id : 'step02';
    }

    function validateExpectedAbaHoursInStep(stepElement) {
        var hoursField = findExpectedAbaHoursField(formSales);
        if (!hoursField || !stepElement.contains(hoursField)) return true;
        return isExpectedAbaHoursValid(formSales);
    }

    // --------------------------------
    // Form Next/Prev Buttons and Validation
    // --------------------------------
    
    // Mobile detection function
    function isMobileDevice() {
        return window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    // Error message function
    function showErrorMessage(stepId) {
        const errorMessage = document.querySelector(`#${stepId} .step_message-error`);
        if (errorMessage) {
            errorMessage.style.display = 'block';
            setTimeout(function() {
                errorMessage.style.display = 'none';
            }, 2000);
        }
    }

    // Email validation helper function
    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Validation function for different field types
    function validateStep(stepId) {
        let isValid = true;
        const stepElement = document.getElementById(stepId);
        if (!stepElement) return false;

        // Check select fields
        const selects = stepElement.querySelectorAll('select');
        selects.forEach(function(select) {
            if (select.hasAttribute('required') && (select.value === '' || select.value === null)) {
                isValid = false;
            }
        });

        // Check text inputs
        const textInputs = stepElement.querySelectorAll('input[type="text"]');
        textInputs.forEach(function(input) {
            if (input.hasAttribute('required') && input.value.trim() === '') {
                isValid = false;
            }
        });

        // Check email inputs
        const emailInputs = stepElement.querySelectorAll('input[type="email"]');
        emailInputs.forEach(function(input) {
            if (input.hasAttribute('required')) {
                const email = input.value.trim();
                if (email === '' || !isValidEmail(email)) {
                    isValid = false;
                }
            }
        });

        // Check phone inputs
        const phoneInputs = stepElement.querySelectorAll('input[type="tel"], input[name*="phone"]');
        phoneInputs.forEach(function(input) {
            if (input.hasAttribute('required') && input.value.trim() === '') {
                isValid = false;
            }
        });

        // Check number inputs
        const numberInputs = stepElement.querySelectorAll('input[type="number"]');
        numberInputs.forEach(function(input) {
            if (input.hasAttribute('required') && input.value.trim() === '') {
                isValid = false;
            }
        });

        if (!validateExpectedAbaHoursInStep(stepElement)) {
            isValid = false;
        }

        return isValid;
    }

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

    // Function to scroll to top on mobile
    function scrollToTopOnMobile() {
        if (isMobileDevice() && formSales) {
            setTimeout(function() {
                formSales.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'start' 
                });
            }, 100);
        }
    }

    // Next Button 01 (Step 1 to Step 2)
    const nextBtn01 = document.getElementById('nextBtn01');
    if (nextBtn01) {
        nextBtn01.addEventListener('click', function(e) {
            e.preventDefault();
            if (!validateStep('step01')) {
                showErrorMessage('step01');
            } else {
                updateInHomeFieldVisibilityFromZip();
                const sliderDots = document.querySelectorAll('.w-slider-dot');
                if (sliderDots[1]) {
                    sliderDots[1].click(); // Go to slide 2
                    scrollToTopOnMobile();
                }
            }
        });
    }

    // Next Button 02 (Step 2 to Step 3)
    const nextBtn02 = document.getElementById('nextBtn02');
    if (nextBtn02) {
        nextBtn02.addEventListener('click', function(e) {
            e.preventDefault();
            updateInHomeFieldVisibilityFromZip();
            if (!validateStep('step02')) {
                showErrorMessage('step02');
            } else {
                const sliderDots = document.querySelectorAll('.w-slider-dot');
                if (sliderDots[2]) {
                    sliderDots[2].click(); // Go to slide 3
                    scrollToTopOnMobile();
                }
            }
        });
    }

    // Next Button 03 (Contact anyway - goes to Step 3)
    const nextBtn03 = document.getElementById('nextBtn03');
    if (nextBtn03) {
        nextBtn03.addEventListener('click', function(e) {
            e.preventDefault();
            updateInHomeFieldVisibilityFromZip();
            if (!validateStep('step02')) {
                showErrorMessage('step02');
            } else {
                const sliderDots = document.querySelectorAll('.w-slider-dot');
                if (sliderDots[2]) {
                    sliderDots[2].click(); // Go to slide 3
                    scrollToTopOnMobile();
                }
            }
        });
    }

    // Prev Button 01 (From Step 2 back to Step 1)
    const prevBtn01 = document.getElementById('prevBtn01');
    if (prevBtn01) {
        prevBtn01.addEventListener('click', function(e) {
            e.preventDefault();
            const sliderDots = document.querySelectorAll('.w-slider-dot');
            if (sliderDots[0]) {
                sliderDots[0].click(); // Go to slide 1
            }
        });
    }

    if (formZipInput) {
        updateInHomeFieldVisibilityFromZip();
        formZipInput.addEventListener('input', updateInHomeFieldVisibilityFromZip);
        formZipInput.addEventListener('change', updateInHomeFieldVisibilityFromZip);
        formZipInput.addEventListener('keyup', updateInHomeFieldVisibilityFromZip);
    }

    // Re-check as soon as async zip data is available.
    window.addEventListener('qualifyingZipDataLoaded', updateInHomeFieldVisibilityFromZip);

    // Prev Button 02 (From Step 3 back to Step 2)
    const prevBtn02 = document.getElementById('prevBtn02');
    if (prevBtn02) {
        prevBtn02.addEventListener('click', function(e) {
            e.preventDefault();
            const sliderDots = document.querySelectorAll('.w-slider-dot');
            if (sliderDots[1]) {
                sliderDots[1].click(); // Go to slide 2
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

        // Add is-fill class only to insurance dropdowns (type dropdowns are active since state is pre-selected)
        insurance.classList.add("is-fill");
        insurance2.classList.add("is-fill");
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

            // Auto-fill statePrimary and stateSecondary with main state
            statePrimary.value = select.value;
            stateSecondary.value = select.value;
        } else if (selection === 'Yes, primary & secondary') {
            insuranceName.classList.remove("is-hidden");
            insuranceName2.classList.remove("is-hidden");
            insurance.setAttribute("required", "required");
            type.setAttribute("required", "required");
            insurance2.setAttribute("required", "required");
            type2.setAttribute("required", "required");

            // Auto-fill statePrimary and stateSecondary with main state
            statePrimary.value = select.value;
            stateSecondary.value = select.value;
        }
    });

    // ---------------------------------------
    // Event Listener for Main State Selection
    // ---------------------------------------
    select.addEventListener('change', function () {
        const selectedState = this.value;

        // Auto-fill statePrimary and stateSecondary with main state
        if (statePrimary) statePrimary.value = selectedState;
        if (stateSecondary) stateSecondary.value = selectedState;

        // Type dropdowns are always active since state is pre-selected

        // Optionally, update the insurance dropdowns based on the new state and existing type selections
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
            document.getElementById('00NRc00000OHqQz').value = insuranceData.final_forta_bay; // Primary Insurance Bay
            document.getElementById('00NRc00000OHo1Z').value = insuranceData.inn_oon_designation; // Primary Insurance Status
            primaryInsuranceInput.value = insuranceData.payor_name; // Set to payor_name
        } else {
            // Clear hidden fields if no matching data is found
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
            document.getElementById('00NRc00000OHWu6').value = insuranceData.final_forta_bay; // Secondary Insurance Bay
            document.getElementById('00NRc00000OHuZR').value = insuranceData.inn_oon_designation; // Secondary Insurance Status
            secondaryInsuranceInput.value = insuranceData.payor_name; // Set to payor_name
        } else {
            // Clear hidden fields if no matching data is found
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

        // Type dropdown is always active since state is pre-selected

        // Reset insurance dropdown to 'Select provider'
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

        // Type2 dropdown is always active since state is pre-selected

        // Reset insurance2 dropdown to 'Select provider'
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

        // Remove is-fill class from insurance dropdown when type is selected
        insurance.classList.remove("is-fill");

        // Reset insurance dropdown to 'Select provider'
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

        // Remove is-fill class from insurance2 dropdown when type is selected
        insurance2.classList.remove("is-fill");

        // Reset insurance2 dropdown to 'Select provider'
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
                // Clear the field when hidden
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

        //console.log(`Populating ${insuranceId} with payors:`, payorNames); // Debugging line

        // Clear current options
        insuranceDropdown.innerHTML = '';

        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.text = 'Select provider';
        insuranceDropdown.appendChild(defaultOption);

        // Filter out entries with null or empty 'tofu_payor_name' and sort alphabetically
        const filteredPayors = payorNames.filter(payor => payor.tofu_payor_name && payor.tofu_payor_name.trim() !== '');
        filteredPayors.sort((a, b) => {
            const nameA = a.tofu_payor_name.toUpperCase();
            const nameB = b.tofu_payor_name.toUpperCase();
            return nameA.localeCompare(nameB);
        });

        // Add new options
        filteredPayors.forEach(payor => {
            const option = document.createElement('option');
            option.value = payor.tofu_payor_name;
            option.text = payor.tofu_payor_name;
            insuranceDropdown.appendChild(option);
        });

        //console.log(`${insuranceId} options:`, insuranceDropdown.innerHTML); // Debugging line

        // Ensure default option is selected
        insuranceDropdown.selectedIndex = 0;

        // Clear corresponding hidden fields
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
    // Main Form Submission Logic
    // --------------------------
    formSales.addEventListener('submit', function (event) {
        if (!isExpectedAbaHoursValid(formSales)) {
            event.preventDefault();
            showErrorMessage(getStepIdForHoursField());
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
        const state = select.value; // User's residential state
        const zip = formZipInput ? formZipInput.value : '';
        const isQualifyingZip = isZipQualifyingForLead(zip);
        const insuranceProvider = insurance.value;
        const mqlStatusField = document.getElementById('00NRc00000Nxa1C'); // Hidden MQL Status field

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

        if (typeof grecaptcha !== "undefined" && !grecaptcha.getResponse()) {
            let captchaErrorMessage = document.getElementById('missing_captcha_error_message');
            if (captchaErrorMessage) {
                captchaErrorMessage.textContent = 'Please complete the CAPTCHA.';
                captchaErrorMessage.style.display = 'block';
            }
            event.preventDefault();
            return;
        }

// --------------------------------------
// Redirect Logic Based on Business Rules
// --------------------------------------
let returnURL = '';
let mqlStatus = '';

// DISQUALIFY if "Does your child have health insurance?" is "No"
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
// SC / TX: DQ when zip is not qualified and payor type is Medicaid/MCO
else if (
    (state === 'SC' || state === 'TX') &&
    !isQualifyingZip &&
    (payorType === 'Medicaid' || payorType === 'MCO')
) {
    returnURL = "https://www.fortahealth.com/thank-you-2";
    mqlStatus = "DQ - Not in Zip Code";
}
// Dx - Check Eval (before in-home / MQL so diagnosis routing wins)
else if (
    asdDiagnosis.toLowerCase() === "no, evaluation scheduled" ||
    // insurance type is unfortunately a variable called type which is Yes for mediciad/mco and No for commercial
    (asdDiagnosis.toLowerCase() === "no, iep only" && state.toLowerCase() === "ca" && type.value.toLowerCase() === "yes")
) {
    returnURL = "https://www.fortahealth.com/thank-you-diagnosis";
    mqlStatus = "Dx - Check Eval";
}
// DQ - No Diagnosis (before in-home / MQL)
else if (
    ["no", "no, on a waitlist", "no, have non-asd diagnosis", "no, iep only"].includes(asdDiagnosis.toLowerCase())
) {
    returnURL = "https://www.fortahealth.com/thank-you-2";
    mqlStatus = "DQ - No Diagnosis";
}
// In-Home pass route (qualified zip + insurance passing + positive Dx; hours split for schedule vs intake)
else if (isInHomePassing) {
    returnURL = thankYouUrlForMqlIntake(formSales, isSpanishLanguage, isInHomePassing);
    mqlStatus = "MQL - In-Home";
}
// MQL - Diagnosis "Yes" only when insurance TOFU Status is "Passing"
else if (asdDiagnosis.toLowerCase() === "yes" && tofuStatus === "Passing") {
    returnURL = thankYouUrlForMqlIntake(formSales, isSpanishLanguage, isInHomePassing);
    mqlStatus = "MQL";
}
// DISQUALIFY if primary insurance's TOFU Status is "Disqualify"
else if (tofuStatus === "Disqualify") {
    returnURL = "https://www.fortahealth.com/thank-you-2";
    mqlStatus = "DQ - Insurance not supported";
}
// MQL - Standard Pass if primary insurance's TOFU Status is "Passing"
else if (tofuStatus === "Passing") {
    returnURL = thankYouUrlForMqlIntake(formSales, isSpanishLanguage, isInHomePassing);
    mqlStatus = "MQL";
}
// DISQUALIFY based on adjusted ASD diagnosis logic (FAIL case)
else if (
    asdDiagnosis.toLowerCase() !== "yes" &&
    diagnosisDisqualifyStates.includes(state) &&
    asdDiagnosis.toLowerCase().includes('no')
) {
    returnURL = "https://www.fortahealth.com/thank-you-2";
    mqlStatus = "DQ - No Diagnosis";
}
// DISQUALIFY if Age is >99 (FAIL case)
else if (childAge > 99) {
    returnURL = "https://www.fortahealth.com/thank-you-2";
    mqlStatus = "DQ - Age";
} else {
    // Default fallback (FAIL case)
    returnURL = "https://www.fortahealth.com/thank-you-2";
    mqlStatus = "DQ - Other";
}

// Set the MQL Status hidden field
mqlStatusField.value = mqlStatus;

// Set the return URL
document.getElementsByName("retURL")[0].value = returnURL;
});
}
