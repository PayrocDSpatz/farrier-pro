// Vercel serverless function for Authorize.Net payment processing
// api/authorize-net-payment.js

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, paymentData, invoiceData } = req.body;

    if (action === 'charge') {
      return await processPayment(req, res, paymentData, invoiceData);
    } else if (action === 'refund') {
      return await processRefund(req, res, paymentData);
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Payment processing error:', error);
    return res.status(500).json({ 
      error: 'Payment processing failed',
      message: error.message 
    });
  }
}

async function processPayment(req, res, paymentData, invoiceData) {
  const {
    cardNumber,
    expirationDate, // Format: MMYY
    cardCode,
    amount,
    customerEmail,
    customerName,
    invoiceNumber,
    description
  } = paymentData;

  // Authorize.Net API credentials from environment variables
  const API_LOGIN_ID = process.env.AUTHORIZENET_API_LOGIN_ID;
  const TRANSACTION_KEY = process.env.AUTHORIZENET_TRANSACTION_KEY;
  const IS_SANDBOX = process.env.AUTHORIZENET_SANDBOX === 'true';

  // API endpoint (sandbox vs production)
  const apiUrl = IS_SANDBOX
    ? 'https://apitest.authorize.net/xml/v1/request.api'
    : 'https://api.authorize.net/xml/v1/request.api';

  // Build request payload
  const payload = {
    createTransactionRequest: {
      merchantAuthentication: {
        name: API_LOGIN_ID,
        transactionKey: TRANSACTION_KEY
      },
      transactionRequest: {
        transactionType: 'authCaptureTransaction',
        amount: amount.toFixed(2),
        payment: {
          creditCard: {
            cardNumber: cardNumber,
            expirationDate: expirationDate,
            cardCode: cardCode
          }
        },
        billTo: {
          firstName: customerName.split(' ')[0] || customerName,
          lastName: customerName.split(' ').slice(1).join(' ') || 'Customer',
          email: customerEmail
        },
        order: {
          invoiceNumber: invoiceNumber,
          description: description || `Farrier Pro Invoice #${invoiceNumber}`
        },
        customerEmail: customerEmail,
        transactionSettings: {
          setting: [
            {
              settingName: 'emailCustomer',
              settingValue: 'true'
            }
          ]
        }
      }
    }
  };

  // Make request to Authorize.Net
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json();

  // Check response
  if (result.messages?.resultCode === 'Ok') {
    const transaction = result.transactionResponse;
    
    if (transaction?.responseCode === '1') {
      // Payment approved
      return res.status(200).json({
        success: true,
        transactionId: transaction.transId,
        authCode: transaction.authCode,
        accountNumber: transaction.accountNumber,
        accountType: transaction.accountType,
        message: 'Payment processed successfully'
      });
    } else {
      // Payment declined
      const errorText = transaction?.errors?.[0]?.errorText || 'Payment declined';
      return res.status(400).json({
        success: false,
        error: errorText,
        responseCode: transaction?.responseCode
      });
    }
  } else {
    // API error
    const errorMessage = result.messages?.message?.[0]?.text || 'Payment processing failed';
    return res.status(400).json({
      success: false,
      error: errorMessage
    });
  }
}

async function processRefund(req, res, refundData) {
  const {
    transactionId,
    amount,
    cardNumber // Last 4 digits
  } = refundData;

  const API_LOGIN_ID = process.env.AUTHORIZENET_API_LOGIN_ID;
  const TRANSACTION_KEY = process.env.AUTHORIZENET_TRANSACTION_KEY;
  const IS_SANDBOX = process.env.AUTHORIZENET_SANDBOX === 'true';

  const apiUrl = IS_SANDBOX
    ? 'https://apitest.authorize.net/xml/v1/request.api'
    : 'https://api.authorize.net/xml/v1/request.api';

  const payload = {
    createTransactionRequest: {
      merchantAuthentication: {
        name: API_LOGIN_ID,
        transactionKey: TRANSACTION_KEY
      },
      transactionRequest: {
        transactionType: 'refundTransaction',
        amount: amount.toFixed(2),
        payment: {
          creditCard: {
            cardNumber: cardNumber,
            expirationDate: 'XXXX'
          }
        },
        refTransId: transactionId
      }
    }
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json();

  if (result.messages?.resultCode === 'Ok') {
    const transaction = result.transactionResponse;
    
    if (transaction?.responseCode === '1') {
      return res.status(200).json({
        success: true,
        transactionId: transaction.transId,
        message: 'Refund processed successfully'
      });
    } else {
      return res.status(400).json({
        success: false,
        error: transaction?.errors?.[0]?.errorText || 'Refund failed'
      });
    }
  } else {
    return res.status(400).json({
      success: false,
      error: result.messages?.message?.[0]?.text || 'Refund processing failed'
    });
  }
}
