// ---------------------------------------------------------------------------
// Forta Health — Webinar registration form
// v2.0.0
//
// Drop-in replacement for the v1 script previously served from
// dev.marina.al/forta/forta-webinar.js.
//
// WHAT CHANGED FROM v1 (see README "Webinar form" section for detail)
//   1. FIX — reCAPTCHA double-render race. v1 called renderRecaptcha() twice
//      (once from initWebinarForm, once from Google's onRecaptchaLoad
//      callback). grecaptcha.render() throws SYNCHRONOUSLY the second time
//      ("reCAPTCHA has already been rendered in this element"). When Google's
//      async api.js happened to resolve before DOMContentLoaded, the throw
//      landed inside initWebinarForm() — 78 lines before the submit listener
//      was attached — and formInitialized was already true, so nothing
//      retried. The form was then left to Webflow's built-in handler, which
//      renders the stock "Thank you! Your submission has been received!"
//      instead of #webinarSuccess with the calendar buttons.
//   2. The submit listener is now attached FIRST, before any optional setup,
//      and every optional step is individually guarded. No single failure can
//      cost us the submit handler again.
//   3. formInitialized is only set once the submit listener is actually bound.
//   4. Rejected submissions (spam / missing captcha) now also stop Webflow's
//      handler, so a submission we refuse isn't silently recorded anyway.
//      Toggle with CONFIG.rejectBlocksWebflowCapture.
//   5. No more blind POST to the page URL. v1 did fetch(form.action) — and the
//      Webflow form carries no action attribute, so form.action resolves to
//      the page itself and the payload went nowhere. We now post only to a
//      real external endpoint, and say so loudly in the console otherwise.
//   6. window.FortaWebinarForm exposes version + live state for debugging,
//      and ?fortaDebug=1 turns on console tracing.
//
// Behaviour that is deliberately unchanged: spam heuristics, email rules,
// phone mask, payor dropdown, the Parent-only insurance question, and the
// success/​calendar reveal.
// ---------------------------------------------------------------------------
(function () {
    'use strict';

    // -----------------------------------------------------------------------
    // CONFIG — every URL, key and Salesforce field id in one place
    // -----------------------------------------------------------------------
    var CONFIG = {
        version: '2.0.0',

        recaptchaSiteKey: '6Ldp-yorAAAAAH7nTspqJRX-wZQ1HKfvJEpV3g8B',
        payorDataUrl: 'https://cdn.prod.fortahealth.com/assets/tofu_payor_status.json',

        // Salesforce Web-to-Lead endpoint, matching src/forta-form-v11.html.
        // Only used when postToSalesforce is true AND the <form> itself has no
        // external action attribute. Left false because webinar registrations
        // are currently captured by Webflow's own form handler — flipping this
        // on without checking would double-create leads.
        salesforceAction: 'https://webto.salesforce.com/servlet/servlet.WebToLead?encoding=UTF-8',
        postToSalesforce: false,

        // When our own checks reject a submission, also prevent Webflow's
        // built-in handler from recording it. Set false to let Webflow keep
        // capturing submissions we flag (safer against false-positive spam
        // detection, at the cost of storing junk).
        rejectBlocksWebflowCapture: true,

        fields: {
            // form + layout
            form: 'wf-form-WebinarForm',
            legacyForm: 'form_wrapper',
            formWrapper: 'webinarForm',
            successWrapper: 'webinarSuccess',
            recaptchaContainer: 'recaptcha-container',
            captchaError: 'missing_captcha_error_message',

            // visible inputs
            email: 'email',
            phone: 'phone',
            state: 'state',
            aboutYourself: '00NRc00000nmRhd',
            insuranceSelect: '00N8b00000EQM3J',
            insuranceGroup: 'insuranceName',

            // honeypots
            honeypots: ['website', 'confirm_email'],

            // hidden UTM fields
            utmSource: '00NRc0000083yKn',
            utmMedium: '00NRc0000083yW5',
            utmCampaign: '00NRc0000083yhN',
            utmContent: '00NRc0000083pBL'
        }
    };

    // -----------------------------------------------------------------------
    // Debug tracing — append ?fortaDebug=1 to any webinar URL
    // -----------------------------------------------------------------------
    var DEBUG = /[?&]fortaDebug=1\b/.test(location.search);

    function debug() {
        if (!DEBUG) {
            return;
        }
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[forta-webinar]');
        console.log.apply(console, args);
    }

    function warn() {
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[forta-webinar]');
        console.warn.apply(console, args);
    }

    // Run an optional setup step so a throw inside it can never take down the
    // rest of initialisation. This is the structural lesson from the v1 bug.
    function safely(label, fn) {
        try {
            fn();
            return true;
        } catch (err) {
            warn(label + ' failed:', (err && err.message) || err);
            return false;
        }
    }

    // ------------------------------------
    // SPAM PROTECTION VARIABLES
    // ------------------------------------
    var formLoadTime = Date.now();
    var recaptchaLoaded = false;   // a widget exists and getResponse() is meaningful
    var recaptchaRendered = false; // guards against a second grecaptcha.render()
    var formInitialized = false;   // set only once the submit listener is bound
    var payorFetchStarted = false;
    var jsonData = [];

    var fieldInteractions = {
        email: false,
        phone: false,
        state: false,
        mouseMovements: 0,
        keystrokes: 0
    };

    // Track human-like behavior
    document.addEventListener('mousemove', function () {
        fieldInteractions.mouseMovements++;
    });

    document.addEventListener('keydown', function () {
        fieldInteractions.keystrokes++;
    });

    function byId(id) {
        return document.getElementById(id);
    }

    // ------------------------------
    // Function to Get URL Parameters
    // ------------------------------
    function getURLParameter(name) {
        return decodeURIComponent((new RegExp('[?|&]' + name + '=' +
            '([^&;]+?)(&|#|;|$)').exec(location.search) || [null, ''])[1].replace(
                /\+/g, '%20')) || null;
    }

    // ----------------------
    // Capture UTM Parameters
    // ----------------------
    function populateHiddenFields() {
        var map = [
            [CONFIG.fields.utmSource, 'utm_source'],
            [CONFIG.fields.utmMedium, 'utm_medium'],
            [CONFIG.fields.utmCampaign, 'utm_campaign'],
            [CONFIG.fields.utmContent, 'utm_content']
        ];

        map.forEach(function (pair) {
            var input = byId(pair[0]);
            if (input) {
                input.value = getURLParameter(pair[1]) || '';
            }
        });
    }

    // ---------------------------
    // Enhanced Email Validation
    // ---------------------------
    function isValidEmail(email) {
        var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        var disposableDomainsRegex = /\.(10minutemail|guerrillamail|mailinator|tempmail|yopmail|throwaway|temp-mail|guerrillamailblock|sharklasers|grr\.la|guerrilamailblock|pokemail|spam4\.me|bccto\.me|chacuo\.net|dispostable|spambox|spamgourmet)\./i;
        var suspiciousPatterns = /^(test|admin|noreply|no-reply|info|support|contact)@/i;

        return emailRegex.test(email) &&
            !disposableDomainsRegex.test(email) &&
            !suspiciousPatterns.test(email) &&
            email.length >= 5 &&
            email.length <= 254;
    }

    // -----------------------------------
    // Script for Phone Number Formatting
    // -----------------------------------
    function phoneFormat(input) {
        input = input.replace(/\D/g, '');
        input = input.substring(0, 10);
        var size = input.length;
        if (size === 0) {
            return input;
        }
        if (size < 4) {
            return '(' + input;
        }
        if (size < 7) {
            return '(' + input.substring(0, 3) + ') ' + input.substring(3);
        }
        return '(' + input.substring(0, 3) + ') ' + input.substring(3, 6) + ' - ' + input.substring(6, 10);
    }

    // ------------------------------------
    // SPAM DETECTION
    // ------------------------------------
    function detectSpam(formElement) {
        var reasons = [];

        // Honeypot fields — these must always be empty
        for (var i = 0; i < CONFIG.fields.honeypots.length; i++) {
            var field = byId(CONFIG.fields.honeypots[i]);
            if (field && field.value.trim() !== '') {
                reasons.push('honeypot_filled');
                break;
            }
        }

        // Submission speed (only catches obvious bots)
        if (Date.now() - formLoadTime < 500) {
            reasons.push('too_fast');
        }

        // Field interactions (require 1 of 3 key fields)
        var interactionCount = [
            fieldInteractions.email,
            fieldInteractions.phone,
            fieldInteractions.state
        ].filter(Boolean).length;
        if (interactionCount === 0) {
            reasons.push('no_interaction');
        }

        // Human-like behavior (relaxed)
        if (fieldInteractions.mouseMovements === 0 && fieldInteractions.keystrokes === 0) {
            reasons.push('no_human_behavior');
        }

        // Email validity
        var email = byId(CONFIG.fields.email);
        if (email && email.value && !isValidEmail(email.value)) {
            reasons.push('invalid_email');
        }

        // Suspicious content (requires multiple hits)
        if (formElement) {
            var formData = new FormData(formElement);
            var suspiciousCount = 0;

            formData.forEach(function (value) {
                if (typeof value === 'string') {
                    if (value.match(/https?:\/\//i) ||
                        value.match(/\b(viagra|casino|bitcoin|crypto|loan|debt)\b/i) ||
                        value.length > 2000 ||
                        value.match(/(.)\1{20,}/)) {
                        suspiciousCount++;
                    }
                }
            });

            if (suspiciousCount >= 3) {
                reasons.push('suspicious_content');
            }
        }

        return reasons;
    }

    // ------------------------------------
    // Payor dropdown
    // ------------------------------------
    function updateInsuranceDropdown(state, insuranceSelect) {
        if (!insuranceSelect) {
            return;
        }

        insuranceSelect.innerHTML = '';

        var defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.text = 'Select';
        insuranceSelect.appendChild(defaultOption);

        var noInsuranceOption = document.createElement('option');
        noInsuranceOption.value = 'No Insurance';
        noInsuranceOption.text = 'No Insurance';
        insuranceSelect.appendChild(noInsuranceOption);

        if (!state || jsonData.length === 0) {
            insuranceSelect.selectedIndex = 0;
            return;
        }

        var filteredPayors = jsonData
            .filter(function (item) {
                return item.state === state &&
                    item.tofu_payor_name &&
                    item.tofu_payor_name.trim() !== '';
            })
            .map(function (item) {
                return item.tofu_payor_name;
            });

        var uniquePayors = Array.from(new Set(filteredPayors));
        uniquePayors.sort(function (a, b) {
            return a.toUpperCase().localeCompare(b.toUpperCase());
        });

        uniquePayors.forEach(function (payorName) {
            var option = document.createElement('option');
            option.value = payorName;
            option.text = payorName;
            insuranceSelect.appendChild(option);
        });

        insuranceSelect.selectedIndex = 0;
    }

    function populateInsuranceFromState() {
        var stateSelect = byId(CONFIG.fields.state);
        var insuranceSelect = byId(CONFIG.fields.insuranceSelect);
        if (!stateSelect || !insuranceSelect) {
            return;
        }
        updateInsuranceDropdown(stateSelect.value, insuranceSelect);
    }

    // ------------------------------------
    // reCAPTCHA
    //
    // Renders AT MOST ONCE. Both entry points (initWebinarForm and Google's
    // onRecaptchaLoad callback) funnel through here, in whichever order the
    // network happens to deliver them, and neither can throw. This is the v1
    // bug — do not remove the guard or the try/catch.
    // ------------------------------------
    function renderRecaptcha() {
        if (recaptchaRendered) {
            debug('renderRecaptcha: already rendered, skipping');
            return;
        }

        var recaptchaContainer = byId(CONFIG.fields.recaptchaContainer);
        var captchaErrorMessage = byId(CONFIG.fields.captchaError);

        if (!recaptchaContainer || typeof grecaptcha === 'undefined' ||
            typeof grecaptcha.render !== 'function') {
            debug('renderRecaptcha: container or grecaptcha not ready yet');
            return;
        }

        // Claim the slot before rendering: if render throws for any reason we
        // must not loop back into it.
        recaptchaRendered = true;

        try {
            grecaptcha.render(recaptchaContainer, {
                sitekey: CONFIG.recaptchaSiteKey,
                callback: function () {
                    if (captchaErrorMessage) {
                        captchaErrorMessage.style.display = 'none';
                    }
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
            recaptchaLoaded = true;
            debug('renderRecaptcha: widget rendered');
        } catch (err) {
            // The widget is already on the page (a second api.js tag, a Webflow
            // re-render, an editor preview). Treat it as usable rather than
            // blocking every submission behind an alert.
            recaptchaLoaded = true;
            warn('reCAPTCHA render skipped:', (err && err.message) || err);
        }
    }

    window.onRecaptchaLoad = function () {
        debug('onRecaptchaLoad fired');
        renderRecaptcha();
    };

    // ------------------------------------
    // Form lookup
    // ------------------------------------
    function getWebinarForm() {
        return byId(CONFIG.fields.legacyForm) ||
            byId(CONFIG.fields.form) ||
            document.querySelector('form[name="wf-form-WebinarForm"]') ||
            document.querySelector('form.sf-form');
    }

    // ------------------------------------
    // Submit endpoint
    //
    // Webflow forms carry no action attribute, so form.action resolves to the
    // current page — POSTing there silently drops the payload. Only post to a
    // genuinely external endpoint.
    // ------------------------------------
    function resolveSubmitEndpoint(form) {
        var action = (form.getAttribute('action') || '').trim();

        if (action) {
            var resolved;
            try {
                resolved = new URL(action, location.href);
            } catch (err) {
                resolved = null;
            }
            var here = location.origin + location.pathname;
            if (!resolved || (resolved.origin + resolved.pathname) !== here) {
                return action;
            }
        }

        if (CONFIG.postToSalesforce) {
            return CONFIG.salesforceAction;
        }

        return null;
    }

    // ------------------------------------
    // Success state (the calendar buttons live here)
    // ------------------------------------
    function getSuccessWrapper() {
        return byId(CONFIG.fields.successWrapper) ||
            document.querySelector('.webinar_form-success');
    }

    function getFormWrapper(form) {
        return byId(CONFIG.fields.formWrapper) ||
            (form.closest && (form.closest('.sf-form_wrapper') || form.closest('.w-form'))) ||
            null;
    }

    function showSuccess(form) {
        var successWrapper = getSuccessWrapper();

        // If the success block is missing from the page, do NOT hide the form —
        // leaving Webflow's own done message visible beats a blank column.
        if (!successWrapper) {
            warn('#' + CONFIG.fields.successWrapper + ' not found; leaving Webflow success message in place');
            return false;
        }

        var formWrapper = getFormWrapper(form);
        if (formWrapper) {
            formWrapper.style.display = 'none';
        }

        successWrapper.style.display = 'block';

        // Announce it to screen readers and keyboard users.
        safely('success focus', function () {
            if (!successWrapper.hasAttribute('tabindex')) {
                successWrapper.setAttribute('tabindex', '-1');
            }
            successWrapper.focus({ preventScroll: true });
        });

        debug('success block shown');
        return true;
    }

    // ------------------------------------
    // Insurance question — Parent answers only
    // ------------------------------------
    function toggleInsuranceVisibility() {
        var aboutYourselfSelect = byId(CONFIG.fields.aboutYourself);
        var insuranceGroup = byId(CONFIG.fields.insuranceGroup);
        var insuranceSelect = byId(CONFIG.fields.insuranceSelect);

        if (!aboutYourselfSelect || !insuranceGroup || !insuranceSelect) {
            return;
        }

        var value = (aboutYourselfSelect.value || '').trim();
        var isParent = value.indexOf('Parent') === 0;

        if (isParent) {
            insuranceGroup.style.display = '';
            insuranceSelect.removeAttribute('data-optional');
            insuranceSelect.required = true;
        } else {
            insuranceGroup.style.display = 'none';
            insuranceSelect.required = false;
            insuranceSelect.setAttribute('data-optional', 'true');
            insuranceSelect.value = '';
        }
    }

    // ------------------------------------
    // Submission
    // ------------------------------------
    function rejectSubmission(event, reason) {
        event.preventDefault();
        // Our listener sits on the form (target phase); Webflow's sits on
        // document (bubble phase), so stopping propagation here reliably keeps
        // Webflow from recording a submission we just refused.
        if (CONFIG.rejectBlocksWebflowCapture && typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
        }
        debug('submission rejected:', reason);
    }

    function handleSubmit(form, event) {
        var spamReasons = detectSpam(form);
        if (spamReasons.length > 0) {
            rejectSubmission(event, spamReasons.join(','));
            console.log('Spam detected:', spamReasons);
            alert('There was an error processing your submission. Please ensure all fields are completed correctly and try again.');
            return;
        }

        if (!recaptchaLoaded || typeof grecaptcha === 'undefined') {
            rejectSubmission(event, 'recaptcha_not_loaded');
            alert('Please wait for the security verification to load completely.');
            return;
        }

        var recaptchaResponse = '';
        try {
            recaptchaResponse = grecaptcha.getResponse() || '';
        } catch (err) {
            warn('grecaptcha.getResponse failed:', (err && err.message) || err);
        }

        if (!recaptchaResponse || recaptchaResponse.length === 0) {
            rejectSubmission(event, 'recaptcha_unanswered');
            var captchaErrorMessage = byId(CONFIG.fields.captchaError);
            if (captchaErrorMessage) {
                captchaErrorMessage.textContent = 'Please complete the security verification.';
                captchaErrorMessage.style.display = 'block';
            }
            return;
        }

        // Accepted. Take over the native submit, but deliberately let the event
        // keep bubbling so Webflow's handler still records the registration.
        event.preventDefault();

        var submitButton = form.querySelector('[type="submit"]');
        if (submitButton) {
            submitButton.disabled = true;
        }

        var endpoint = resolveSubmitEndpoint(form);
        if (endpoint) {
            debug('posting to', endpoint);
            safely('submit fetch', function () {
                fetch(endpoint, {
                    method: form.method || 'POST',
                    body: new FormData(form),
                    mode: 'no-cors'
                }).catch(function (error) {
                    console.error('Submission error:', error);
                });
            });
        } else {
            debug('no external endpoint; relying on Webflow form capture');
        }

        showSuccess(form);
    }

    // ------------------------------------
    // Initialisation
    //
    // ORDER MATTERS. The submit listener is bound before anything optional so
    // that no later failure can leave the form without it.
    // ------------------------------------
    function initWebinarForm() {
        if (formInitialized) {
            return;
        }

        var form = getWebinarForm();
        if (!form) {
            return;
        }

        // 1. The one thing that must never be skipped.
        form.addEventListener('submit', function (event) {
            handleSubmit(form, event);
        });
        formInitialized = true;
        debug('submit listener bound to', form.id || form.name);

        // 2. Everything below is optional and individually guarded.
        safely('populateHiddenFields', populateHiddenFields);
        safely('renderRecaptcha', renderRecaptcha);

        safely('email handlers', function () {
            var emailInput = byId(CONFIG.fields.email);
            if (!emailInput) {
                return;
            }

            emailInput.addEventListener('invalid', function () {
                this.setCustomValidity('Please enter a valid email address');
            });

            emailInput.addEventListener('input', function () {
                this.setCustomValidity('');
                fieldInteractions.email = true;
            });

            emailInput.addEventListener('blur', function () {
                if (this.value && !isValidEmail(this.value)) {
                    this.setCustomValidity('Please enter a valid email address from a recognized provider');
                    this.reportValidity();
                }
            });

            emailInput.addEventListener('focus', function () {
                fieldInteractions.email = true;
            });
        });

        safely('phone handlers', function () {
            var phoneInput = byId(CONFIG.fields.phone);
            if (!phoneInput) {
                return;
            }

            phoneInput.addEventListener('keyup', function () {
                phoneInput.value = phoneFormat(phoneInput.value);
            });

            phoneInput.addEventListener('focus', function () {
                fieldInteractions.phone = true;
            });

            phoneInput.value = phoneFormat(phoneInput.value);
        });

        safely('insurance visibility', function () {
            var aboutYourselfSelect = byId(CONFIG.fields.aboutYourself);
            var insuranceGroup = byId(CONFIG.fields.insuranceGroup);
            if (!aboutYourselfSelect || !insuranceGroup) {
                return;
            }
            toggleInsuranceVisibility();
            aboutYourselfSelect.addEventListener('change', toggleInsuranceVisibility);
        });

        safely('payor dropdown', populateInsuranceFromState);
    }

    function observeForForm() {
        if (getWebinarForm()) {
            initWebinarForm();
            return null;
        }

        if (document.body && 'MutationObserver' in window) {
            var observer = new MutationObserver(function () {
                if (getWebinarForm()) {
                    initWebinarForm();
                    observer.disconnect();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            return observer;
        }
        return null;
    }

    function observeForStateSelect() {
        var form = getWebinarForm();
        if (!form) {
            return null;
        }

        if (byId(CONFIG.fields.state) && byId(CONFIG.fields.insuranceSelect)) {
            populateInsuranceFromState();
            return null;
        }

        if ('MutationObserver' in window) {
            var observer = new MutationObserver(function () {
                if (byId(CONFIG.fields.state) && byId(CONFIG.fields.insuranceSelect)) {
                    populateInsuranceFromState();
                    observer.disconnect();
                }
            });
            observer.observe(form, { childList: true, subtree: true });
            return observer;
        }
        return null;
    }

    function fetchPayorData() {
        if (payorFetchStarted) {
            return;
        }
        payorFetchStarted = true;

        fetch(CONFIG.payorDataUrl)
            .then(function (response) {
                return response.json();
            })
            .then(function (data) {
                jsonData = data;
                debug('payor data loaded:', data.length, 'rows');
                populateInsuranceFromState();
            })
            .catch(function (error) {
                console.error('Error fetching JSON:', error);
            });
    }

    // initializePage is called from both DOMContentLoaded and Webflow.push;
    // every step below is idempotent.
    function initializePage() {
        safely('payor fetch', fetchPayorData);
        safely('initWebinarForm', initWebinarForm);
        safely('observeForForm', observeForForm);
        safely('observeForStateSelect', observeForStateSelect);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializePage);
    } else {
        initializePage();
    }

    document.addEventListener('change', function (event) {
        if (event.target && event.target.id === CONFIG.fields.state) {
            fieldInteractions.state = true;
            populateInsuranceFromState();
        }
    });

    if (window.Webflow && typeof window.Webflow.push === 'function') {
        window.Webflow.push(initializePage);
    }

    // ------------------------------------
    // Debug handle — inspect live state from the console:
    //   FortaWebinarForm.state()
    // ------------------------------------
    window.FortaWebinarForm = {
        version: CONFIG.version,
        config: CONFIG,
        state: function () {
            var form = getWebinarForm();
            return {
                version: CONFIG.version,
                formFound: !!form,
                submitListenerBound: formInitialized,
                recaptchaRendered: recaptchaRendered,
                recaptchaLoaded: recaptchaLoaded,
                payorRows: jsonData.length,
                successWrapperFound: !!getSuccessWrapper(),
                submitEndpoint: form ? resolveSubmitEndpoint(form) : null,
                fieldInteractions: fieldInteractions
            };
        }
    };

    debug('v' + CONFIG.version + ' loaded');
})();
