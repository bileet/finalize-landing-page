/**
 * Finalize - Cloudflare Worker Backend
 *
 * Handles estimate form submissions and integrates with Airtable
 */

import Airtable from 'airtable';

// CORS headers for API responses
const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

// Pricing configuration
const PRICING = {
	features: {
		'Authentication': 100,
		'Payments': 100,
		'SaaS Subscriptions': 100,
		'File Uploads': 100,
		'Notifications': 100,
	},
	services: {
		'Security Audit & Fixes': 150,
		'UI/UX Review': 150,
		'Deploy to Production': 100,
	},
	customRequestBase: 250,
	featureDiscountThreshold: 3,
	featureDiscountRate: 0.10,
};

/**
 * Calculate total price and discount
 */
function calculatePricing(selectedFeatures, selectedServices, hasCustomRequest) {
	let total = 0;
	let discount = 0;
	let featuresTotal = 0;

	// Calculate features total
	if (Array.isArray(selectedFeatures)) {
		selectedFeatures.forEach(featureName => {
			const price = PRICING.features[featureName];
			if (price) {
				featuresTotal += price;
				total += price;
			}
		});
	}

	// Apply discount if 3+ features
	if (selectedFeatures && selectedFeatures.length >= PRICING.featureDiscountThreshold) {
		discount = Math.round(featuresTotal * PRICING.featureDiscountRate);
		total -= discount;
	}

	// Calculate services total
	if (Array.isArray(selectedServices)) {
		selectedServices.forEach(serviceName => {
			const price = PRICING.services[serviceName];
			if (price) {
				total += price;
			}
		});
	}

	// Add custom request base price
	if (hasCustomRequest) {
		total += PRICING.customRequestBase;
	}

	return { total, discount };
}

/**
 * Validate email format
 */
function isValidEmail(email) {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

/**
 * Validate URL format
 */
function isValidUrl(url) {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}

/**
 * Validate estimate form data
 */
function validateEstimateForm(data) {
	const errors = [];

	// Required: App URL
	if (!data.appUrl || typeof data.appUrl !== 'string' || !data.appUrl.trim()) {
		errors.push('App URL is required');
	} else if (!isValidUrl(data.appUrl)) {
		errors.push('App URL must be a valid URL');
	}

	// Required: Email
	if (!data.email || typeof data.email !== 'string' || !data.email.trim()) {
		errors.push('Email is required');
	} else if (!isValidEmail(data.email)) {
		errors.push('Email must be a valid email address');
	}

	// At least one selection required
	const hasFeatures = Array.isArray(data.selectedFeatures) && data.selectedFeatures.length > 0;
	const hasServices = Array.isArray(data.selectedServices) && data.selectedServices.length > 0;
	const hasCustom = data.hasCustomRequest === true;

	if (!hasFeatures && !hasServices && !hasCustom) {
		errors.push('At least one service must be selected');
	}

	// Validate arrays
	if (data.selectedFeatures && !Array.isArray(data.selectedFeatures)) {
		errors.push('Selected features must be an array');
	}

	if (data.selectedServices && !Array.isArray(data.selectedServices)) {
		errors.push('Selected services must be an array');
	}

	// Validate custom request text if custom request is selected
	if (data.hasCustomRequest && (!data.customRequestText || !data.customRequestText.trim())) {
		errors.push('Custom request description is required when custom request is selected');
	}

	return {
		isValid: errors.length === 0,
		errors,
	};
}

/**
 * Handle estimate form submission
 */
async function handleSubmitRequest(request, env) {
	// Only allow POST requests
	if (request.method !== 'POST') {
		return new Response(
			JSON.stringify({ success: false, error: 'Method not allowed' }),
			{
				status: 405,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			}
		);
	}

	try {
		// Parse request body
		const data = await request.json();

		// Validate form data
		const validation = validateEstimateForm(data);
		if (!validation.isValid) {
			return new Response(
				JSON.stringify({
					success: false,
					error: 'Validation failed',
					errors: validation.errors
				}),
				{
					status: 400,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' }
				}
			);
		}

		// Check for required environment variables
		if (!env.AIRTABLE_API_KEY) {
			console.error('AIRTABLE_API_KEY is not set');
			return new Response(
				JSON.stringify({
					success: false,
					error: 'Server configuration error'
				}),
				{
					status: 500,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' }
				}
			);
		}

		if (!env.AIRTABLE_BASE_ID) {
			console.error('AIRTABLE_BASE_ID is not set');
			return new Response(
				JSON.stringify({
					success: false,
					error: 'Server configuration error'
				}),
				{
					status: 500,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' }
				}
			);
		}

		const tableName = env.AIRTABLE_TABLE_NAME || 'Estimate Requests';

		// Initialize Airtable
		const airtable = new Airtable({ apiKey: env.AIRTABLE_API_KEY });
		const base = airtable.base(env.AIRTABLE_BASE_ID);

		// Calculate pricing on the backend (never trust frontend calculations)
		const { total, discount } = calculatePricing(
			data.selectedFeatures,
			data.selectedServices,
			data.hasCustomRequest
		);

		// Prepare record for Airtable
		const record = {
			'App URL': data.appUrl,
			'Email': data.email,
			'Platform': data.platform || 'Not specified',
			'Selected Features': data.selectedFeatures || null,
			'Selected Services': data.selectedServices || null,
			'Custom Request': !!data.hasCustomRequest || false,
			'Custom Request Description': data.customRequestText || null,
			'Notes': data.additionalContext || null,
			'Estimated Price': total,
			'Feature Discount': discount,
			'Timestamp': data.timestamp || new Date().toISOString(),
			'Status': 'New',
		};

		// Create record in Airtable
		await base(tableName).create([{ fields: record }]);

		// Return success response
		return new Response(
			JSON.stringify({
				success: true,
				message: 'Estimate request submitted successfully'
			}),
			{
				status: 200,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			}
		);

	} catch (error) {
		console.error('Error processing estimate request:', error);

		// Check if it's a JSON parse error
		if (error instanceof SyntaxError) {
			return new Response(
				JSON.stringify({
					success: false,
					error: 'Invalid JSON in request body'
				}),
				{
					status: 400,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' }
				}
			);
		}

		// Check if it's an Airtable error
		if (error.statusCode) {
			return new Response(
				JSON.stringify({
					success: false,
					error: 'Failed to save to database',
					details: error.message
				}),
				{
					status: 500,
					headers: { ...corsHeaders, 'Content-Type': 'application/json' }
				}
			);
		}

		// Generic error response
		return new Response(
			JSON.stringify({
				success: false,
				error: 'Internal server error'
			}),
			{
				status: 500,
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			}
		);
	}
}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		// Handle CORS preflight requests
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: corsHeaders
			});
		}

		// Route handling
		switch (url.pathname) {
			case '/api/submit-request':
				return handleSubmitRequest(request, env);
			default:
				const url = new URL(request.url);
				const statusCode = 301;
    			return Response.redirect(`${url.origin}/404`, statusCode);
		}
	},
};
