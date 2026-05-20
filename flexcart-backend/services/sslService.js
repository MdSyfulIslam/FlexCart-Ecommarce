/**
 * SSLCommerz payment gateway service
 * Wraps sslcommerz-lts for initiation and validation
 */
const SSLCommerzPayment = require('sslcommerz-lts');

const STORE_ID     = process.env.SSL_STORE_ID       || '';
const STORE_PASSWD = process.env.SSL_STORE_PASSWORD  || '';
const IS_LIVE      = process.env.SSL_IS_LIVE === 'true';

const BACKEND_URL  = (process.env.BACKEND_URL  || '').replace(/\/$/, '');
const FRONTEND_URL = (process.env.FRONTEND_URL || '').replace(/\/$/, '');

/**
 * Validate SSLCommerz configuration. Throws in production if URLs are missing
 * or still pointing at localhost (which SSLCommerz cannot reach).
 * Call once at server startup.
 */
function validateSSLConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  const problems = [];

  if (!BACKEND_URL) {
    problems.push('BACKEND_URL is not set — SSLCommerz cannot POST callbacks to an empty URL');
  } else if (BACKEND_URL.includes('localhost') || BACKEND_URL.includes('127.0.0.1')) {
    problems.push(`BACKEND_URL is "${BACKEND_URL}" — SSLCommerz cannot reach localhost; set it to your Render/deployed backend URL`);
  }

  if (!FRONTEND_URL) {
    problems.push('FRONTEND_URL is not set — payment redirects will fail');
  } else if (FRONTEND_URL.includes('localhost') || FRONTEND_URL.includes('127.0.0.1')) {
    problems.push(`FRONTEND_URL is "${FRONTEND_URL}" — payment success/fail pages will redirect to localhost; set it to your Vercel/deployed frontend URL`);
  }

  if (!STORE_ID || !STORE_PASSWD) {
    problems.push('SSL_STORE_ID and/or SSL_STORE_PASSWORD are not set');
  }

  if (problems.length === 0) return;

  const msg = `[SSLCommerz] Configuration problem(s):\n  • ${problems.join('\n  • ')}`;
  if (isProduction) {
    throw new Error(msg);
  } else {
    console.warn(`\n⚠️  ${msg}\n`);
  }
}

/**
 * Initiate an SSLCommerz payment session.
 * @param {object} opts
 * @param {string} opts.tranId       - Unique transaction ID stored on the order
 * @param {number} opts.totalAmount  - Total payable in BDT
 * @param {string} opts.customerName
 * @param {string} opts.customerEmail
 * @param {string} opts.customerPhone
 * @param {string} opts.shippingAddress
 * @param {string} opts.shippingCity
 * @param {string} opts.productName     - Short description shown on SSL gateway
 * @param {string} [opts.preferredMethod] - 'bkash'|'nagad'|'rocket'|'bank_card'|'bank_transfer'|'sslcommerz'
 * @returns {Promise<string>} GatewayPageURL (or method-specific URL) to redirect the customer to
 */
// Map app payment methods → SSLCommerz gateway focus codes.
// These tell the hosted checkout page which tab/method to pre-select.
const METHOD_FOCUS = {
  bkash:         'bkash',
  nagad:         'nagad',
  rocket:        'rocket',
  bank_card:     'visacard',
  bank_transfer: 'ibbl',
};

async function initiatePayment({
  tranId,
  totalAmount,
  customerName,
  customerEmail,
  customerPhone,
  shippingAddress,
  shippingCity,
  productName,
  preferredMethod,
}) {
  if (!BACKEND_URL || BACKEND_URL.includes('localhost') || BACKEND_URL.includes('127.0.0.1')) {
    throw new Error(
      `BACKEND_URL must be set to the deployed backend URL for payment processing (current: "${BACKEND_URL || '(empty)'}")`
    );
  }
  if (!FRONTEND_URL || FRONTEND_URL.includes('localhost') || FRONTEND_URL.includes('127.0.0.1')) {
    throw new Error(
      `FRONTEND_URL must be set to the deployed frontend URL for payment processing (current: "${FRONTEND_URL || '(empty)'}")`
    );
  }

  const sslcz = new SSLCommerzPayment(STORE_ID, STORE_PASSWD, IS_LIVE);

  const focusCode = METHOD_FOCUS[preferredMethod] || null;

  const data = {
    total_amount:      parseFloat(totalAmount).toFixed(2),
    currency:          'BDT',
    tran_id:           tranId,
    success_url:       `${BACKEND_URL}/api/payment/success`,
    fail_url:          `${BACKEND_URL}/api/payment/fail`,
    cancel_url:        `${BACKEND_URL}/api/payment/cancel`,
    ipn_url:           `${BACKEND_URL}/api/payment/ipn`,
    shipping_method:   'Courier',
    product_name:      productName || 'FlexCart Order',
    product_category:  'General',
    product_profile:   'general',
    cus_name:          customerName  || 'Customer',
    cus_email:         customerEmail || 'customer@flexcart.com',
    cus_add1:          shippingAddress || 'Dhaka',
    cus_city:          shippingCity    || 'Dhaka',
    cus_country:       'Bangladesh',
    cus_phone:         customerPhone  || '01700000000',
    ship_name:         customerName   || 'Customer',
    ship_add1:         shippingAddress || 'Dhaka',
    ship_city:         shippingCity    || 'Dhaka',
    ship_postcode:     '1000',
    ship_country:      'Bangladesh',
    ship_phone:        customerPhone  || '01700000000',
    // Pre-select the payment method tab on the hosted checkout page
    ...(focusCode ? { focus: focusCode } : {}),
  };

  const apiResponse = await sslcz.init(data);

  if (!apiResponse || apiResponse.status !== 'SUCCESS') {
    const reason = apiResponse?.failedreason || 'Unknown error from SSLCommerz';
    throw new Error(`SSLCommerz initiation failed: ${reason}`);
  }

  // GatewayPageURL is the hosted checkout; direct payment URLs are not available
  // in sandbox (is_direct_pay_enable=0). The preferredMethod is stored in the
  // order/session record for display purposes but routing uses the same URL.
  return apiResponse.GatewayPageURL;
}

/**
 * Validate a payment using SSLCommerz val_id.
 * @param {string} valId
 * @returns {Promise<object>} Validation response from SSLCommerz
 */
async function validatePayment(valId) {
  const sslcz = new SSLCommerzPayment(STORE_ID, STORE_PASSWD, IS_LIVE);
  return sslcz.validate({ val_id: valId });
}

module.exports = { initiatePayment, validatePayment, validateSSLConfig, FRONTEND_URL };
