/**
 * Estimate Calculator
 * Handles form interactions, calculations, validation, and persistence
 */

(function () {
  'use strict';

  // State management
  const state = {
    selectedFeatures: [], // Array of { id: string, name: string }
    selectedServices: [], // Array of { id: string, name: string }
    hasCustomRequest: false,
    customRequestText: '',
    appUrl: '',
    platform: '',
    otherPlatform: '',
    email: '',
    additionalContext: '',
    totalPrice: 0,
    featureDiscount: 0
  };

  // Pricing configuration
  const pricing = {
    features: 100,
    security: 150,
    uiux: 150,
    deployment: 100,
    customBase: 250,
    featureDiscountThreshold: 3,
    featureDiscountRate: 0.10
  };

  // Human-readable name mappings
  const nameMapping = {
    // Features
    'authentication': 'Authentication',
    'payments': 'Payments',
    'saas': 'SaaS Subscriptions',
    'uploads': 'File Uploads',
    'notifications': 'Notifications',
    // Services
    'security': 'Security Audit & Fixes',
    'uiux': 'UI/UX Review',
    'deployment': 'Deploy to Production',
    // Platforms
    'lovable': 'Lovable',
    'cursor': 'Cursor',
    'claude': 'Claude Code',
    'bolt': 'Bolt.new',
    'replit': 'Replit',
    'windsurf': 'Windsurf',
    'other': 'Other'
  };

  // DOM elements
  const elements = {
    form: document.getElementById('estimateForm'),
    platform: document.getElementById('platform'),
    otherPlatformContainer: document.getElementById('otherPlatformContainer'),
    otherPlatform: document.getElementById('otherPlatform'),
    featureCheckboxes: document.querySelectorAll('.feature-card input[type="checkbox"]'),
    serviceCheckboxes: document.querySelectorAll('.security-card input[type="checkbox"], .custom-card input[type="checkbox"], .deployment-card input[type="checkbox"]'),
    hasCustomRequest: document.getElementById('hasCustomRequest'),
    customRequestContainer: document.getElementById('customRequestContainer'),
    customRequest: document.getElementById('customRequest'),
    charCount: document.getElementById('charCount'),
    email: document.getElementById('email'),
    sendRequestBtn: document.getElementById('sendRequestBtn'),
    featureDiscount: document.getElementById('featureDiscount'),
    errorMessage: document.getElementById('errorMessage'),
    successMessage: document.getElementById('successMessage'),
    estimateSummary: document.getElementById('estimateSummary'),
    totalEstimate: document.getElementById('totalEstimate'),
    customRequestNote: document.getElementById('customRequestNote')
  };

  // Initialize
  function init() {
    attachEventListeners();
    updateLiveCalculation();
  }

  // Attach all event listeners
  function attachEventListeners() {
    // Platform selection
    elements.platform.addEventListener('change', handlePlatformChange);

    // Feature checkboxes
    elements.featureCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', handleFeatureChange);
    });

    // Service checkboxes
    elements.serviceCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', handleServiceChange);
    });

    // Custom request
    elements.hasCustomRequest.addEventListener('change', handleCustomRequestToggle);
    elements.customRequest.addEventListener('input', handleCustomRequestInput);

    // App URL validation
    const appUrlInput = document.getElementById('appUrl');
    appUrlInput.addEventListener('input', () => {
      appUrlInput.classList.remove('is-invalid');
      elements.errorMessage.classList.add('d-none');
    });

    // Email validation
    elements.email.addEventListener('blur', validateEmail);
    elements.email.addEventListener('input', () => {
      elements.email.classList.remove('is-invalid');
      elements.errorMessage.classList.add('d-none');
    });

    // Send request button
    elements.sendRequestBtn.addEventListener('click', handleSendRequest);
  }

  // Handle platform change
  function handlePlatformChange(e) {
    const value = e.target.value;
    state.platform = value;

    if (value === 'other') {
      elements.otherPlatformContainer.classList.remove('d-none');
      elements.otherPlatform.required = true;
    } else {
      elements.otherPlatformContainer.classList.add('d-none');
      elements.otherPlatform.required = false;
      state.otherPlatform = '';
      elements.otherPlatform.value = '';
    }
  }

  // Handle feature checkbox change
  function handleFeatureChange(e) {
    const checkbox = e.target;
    const card = checkbox.closest('.selection-card');
    const featureId = card.dataset.id;
    const featureName = nameMapping[featureId] || featureId;

    if (checkbox.checked) {
      if (!state.selectedFeatures.some(f => f.id === featureId)) {
        state.selectedFeatures.push({ id: featureId, name: featureName });
      }
    } else {
      state.selectedFeatures = state.selectedFeatures.filter(f => f.id !== featureId);
    }

    updateLiveCalculation();

    // Track analytics
    trackEvent('feature_selected', { feature: featureId, checked: checkbox.checked });
  }

  // Handle service checkbox change
  function handleServiceChange(e) {
    const checkbox = e.target;
    const card = checkbox.closest('.selection-card');
    const serviceId = card.dataset.id;
    const serviceName = nameMapping[serviceId] || serviceId;

    if (checkbox.checked) {
      if (!state.selectedServices.some(s => s.id === serviceId)) {
        state.selectedServices.push({ id: serviceId, name: serviceName });
      }
    } else {
      state.selectedServices = state.selectedServices.filter(s => s.id !== serviceId);
    }

    updateLiveCalculation();
  }

  // Handle custom request toggle
  function handleCustomRequestToggle(e) {
    state.hasCustomRequest = e.target.checked;

    if (e.target.checked) {
      elements.customRequestContainer.classList.remove('d-none');
      trackEvent('custom_request_selected', { opened: true });
    } else {
      elements.customRequestContainer.classList.add('d-none');
      state.customRequestText = '';
      elements.customRequest.value = '';
    }

    updateLiveCalculation();
  }

  // Handle custom request input
  function handleCustomRequestInput(e) {
    const value = e.target.value;
    state.customRequestText = value;
    elements.charCount.textContent = value.length;
  }

  // Update live calculation
  function updateLiveCalculation() {
    const featureCount = state.selectedFeatures.length;
    const hasServices = state.selectedServices.length > 0;
    const hasCustom = state.hasCustomRequest;
    const hasSelections = featureCount > 0 || hasServices || hasCustom;

    // Show/hide discount notice for features
    if (featureCount >= pricing.featureDiscountThreshold) {
      elements.featureDiscount.classList.remove('d-none');
    } else {
      elements.featureDiscount.classList.add('d-none');
    }

    // Update estimate summary
    if (hasSelections) {
      updateEstimateSummary();
      elements.estimateSummary.classList.remove('d-none');
    } else {
      elements.estimateSummary.classList.add('d-none');
    }
  }

  // Update estimate summary
  function updateEstimateSummary() {
    const { total, discount, breakdown } = calculateEstimate();

    // Update total display
    const totalText = breakdown.hasCustom ? `$${total}+` : `$${total}`;
    elements.totalEstimate.textContent = totalText;

    // Show/hide custom request note
    if (breakdown.hasCustom) {
      elements.customRequestNote.classList.remove('d-none');
    } else {
      elements.customRequestNote.classList.add('d-none');
    }
  }

  // Validate email
  function validateEmail() {
    const email = elements.email.value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email) {
      elements.email.classList.add('is-invalid');
      return false;
    }

    if (!emailRegex.test(email)) {
      elements.email.classList.add('is-invalid');
      return false;
    }

    elements.email.classList.remove('is-invalid');
    elements.email.classList.add('is-valid');
    return true;
  }

  // Validate form before calculation
  function validateForm() {
    let isValid = true;
    const errors = [];

    // Validate app URL
    const appUrlInput = document.getElementById('appUrl');
    const appUrl = appUrlInput.value.trim();

    if (!appUrl) {
      appUrlInput.classList.add('is-invalid');
      errors.push('Please enter your app URL');
      isValid = false;
    } else {
      // Basic URL validation
      try {
        new URL(appUrl);
        appUrlInput.classList.remove('is-invalid');
        appUrlInput.classList.add('is-valid');
      } catch (e) {
        appUrlInput.classList.add('is-invalid');
        errors.push('Please enter a valid URL (e.g., https://example.com)');
        isValid = false;
      }
    }

    // Check if at least one option is selected
    const hasSelections = state.selectedFeatures.length > 0 ||
                          state.selectedServices.length > 0 ||
                          state.hasCustomRequest;

    if (!hasSelections) {
      errors.push('Please select at least one service');
      isValid = false;
    }

    // Validate email
    if (!validateEmail()) {
      errors.push('Please enter a valid email address');
      isValid = false;
    }

    // Show errors if any
    if (!isValid) {
      elements.errorMessage.textContent = errors.join('. ');
      elements.errorMessage.classList.remove('d-none');
      elements.errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      elements.errorMessage.classList.add('d-none');
    }

    return isValid;
  }

  // Calculate estimate
  function calculateEstimate() {
    let total = 0;
    let discount = 0;
    const breakdown = {
      features: [],
      services: [],
      hasCustom: state.hasCustomRequest
    };

    // Calculate features
    state.selectedFeatures.forEach(feature => {
      const card = document.querySelector(`.feature-card[data-id="${feature.id}"]`);
      const price = parseInt(card.dataset.price);
      const label = feature.name;

      breakdown.features.push({ label, price });
      total += price;
    });

    // Apply discount if 3+ features
    if (breakdown.features.length >= pricing.featureDiscountThreshold) {
      const featuresTotal = breakdown.features.reduce((sum, item) => sum + item.price, 0);
      discount = Math.round(featuresTotal * pricing.featureDiscountRate);
      total -= discount;
    }

    // Calculate services
    state.selectedServices.forEach(service => {
      const card = document.querySelector(`[data-id="${service.id}"]`);
      const price = parseInt(card.dataset.price);
      const label = service.name;

      breakdown.services.push({ label, price });
      total += price;
    });

    state.totalPrice = total;
    state.featureDiscount = discount;

    return { total, discount, breakdown };
  }

  // Handle send request button click
  async function handleSendRequest(e) {
    e.preventDefault();

    // Validate form first
    if (!validateForm()) {
      // Scroll to the error message
      elements.errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Update state from form
    state.appUrl = document.getElementById('appUrl').value.trim();
    state.email = elements.email.value.trim();
    state.additionalContext = document.getElementById('additionalContext').value.trim();

    if (state.platform === 'other') {
      state.otherPlatform = elements.otherPlatform.value.trim();
    }

    // Show loading state
    elements.sendRequestBtn.disabled = true;
    elements.sendRequestBtn.classList.add('btn-loading');
    const originalText = elements.sendRequestBtn.querySelector('.btn-text')?.textContent || 'Send Request';
    const btnText = elements.sendRequestBtn.querySelector('.btn-text');
    if (btnText) {
      btnText.textContent = 'Sending...';
    }

    // Prepare data
    const platformValue = state.platform === 'other' ? state.otherPlatform : (nameMapping[state.platform] || state.platform);
    const requestData = {
      appUrl: state.appUrl,
      platform: platformValue,
      selectedFeatures: state.selectedFeatures.map(f => f.name),
      selectedServices: state.selectedServices.map(s => s.name),
      hasCustomRequest: state.hasCustomRequest,
      customRequestText: state.customRequestText,
      email: state.email,
      additionalContext: state.additionalContext,
      timestamp: new Date().toISOString()
    };

    try {
      // Send request to API
      const response = await fetch('/api/submit-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to submit request');
      }

      // Track submission
      trackEvent('request_submitted', { total_value: state.totalPrice });

      // Show success message
      showSuccessMessage();

      // Clear form
      clearForm();

    } catch (error) {
      console.error('Error submitting request:', error);

      // Show error message
      elements.errorMessage.textContent = 'Failed to submit request. Please try again or contact us directly.';
      elements.errorMessage.classList.remove('d-none');
      elements.errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Track error
      trackEvent('request_submission_failed', { error: error.message });

    } finally {
      // Reset button state
      elements.sendRequestBtn.disabled = false;
      elements.sendRequestBtn.classList.remove('btn-loading');
      if (btnText) {
        btnText.textContent = originalText;
      }
    }
  }

  // Show success message
  function showSuccessMessage() {
    // Hide form sections
    elements.form.classList.add('d-none');

    // Show success message
    elements.successMessage.classList.remove('d-none');
    document.getElementById('confirmEmail').textContent = state.email;

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Clear form and reset state
  function clearForm() {
    // Reset form
    elements.form.reset();

    // Reset state
    state.selectedFeatures = [];
    state.selectedServices = [];
    state.hasCustomRequest = false;
    state.customRequestText = '';
    state.appUrl = '';
    state.platform = '';
    state.otherPlatform = '';
    state.email = '';
    state.additionalContext = '';
    state.totalPrice = 0;
    state.featureDiscount = 0;

    // Reset UI
    elements.featureDiscount.classList.add('d-none');
    elements.customRequestContainer.classList.add('d-none');
    elements.otherPlatformContainer.classList.add('d-none');
    elements.estimateSummary.classList.add('d-none');
    elements.customRequestNote.classList.add('d-none');
  }

  // Track analytics events
  function trackEvent(eventName, data) {
    // Log to console for now
    console.log('Analytics Event:', eventName, data);

    // In production, this would send to analytics service
    // Example: gtag('event', eventName, data);
  }

  // Keyboard navigation for cards
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const activeElement = document.activeElement;
      if (activeElement.classList.contains('selection-label')) {
        e.preventDefault();
        const checkbox = activeElement.previousElementSibling;
        if (checkbox && checkbox.type === 'checkbox') {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change'));
        }
      }
    }
  });

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Track page view
  trackEvent('estimate_form_viewed', {});

})();
