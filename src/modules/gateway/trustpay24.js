const https = require('https');

const endpoint = new URL('https://control.trustpay24.online/api/merchant/v1/payins');
const maximumResponseBytes = 1024 * 1024;
const timeoutMilliseconds = 15000;

function providerError(message) {
  const error = new Error(message);
  error.status = 502;
  return error;
}

function credentialsFromEnvironment() {
  const apiKey = (process.env.TRUSTPAY24_API_KEY || '').trim();
  const apiSecret = (process.env.TRUSTPAY24_API_SECRET || '').trim();
  if (!apiKey || !apiSecret) {
    const error = new Error('TrustPay24 credentials are not configured');
    error.status = 503;
    throw error;
  }
  return { apiKey, apiSecret };
}

module.exports = async (payload) => {
  const credentials = credentialsFromEnvironment();
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = https.request(endpoint, {
      method: 'POST',
      headers: {
        'X-Api-Key': credentials.apiKey,
        'X-Api-Secret': credentials.apiSecret,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (response) => {
      const chunks = [];
      let responseBytes = 0;

      response.on('data', (chunk) => {
        responseBytes += chunk.length;
        if (responseBytes > maximumResponseBytes) {
          request.destroy();
          reject(providerError('TrustPay24 returned an oversized response'));
          return;
        }
        chunks.push(chunk);
      });

      response.on('end', () => {
        let result;
        try {
          result = responseBytes
            ? JSON.parse(Buffer.concat(chunks).toString('utf8'))
            : {};
        } catch (error) {
          reject(providerError('TrustPay24 returned an invalid response'));
          return;
        }

        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(providerError('TrustPay24 rejected the payin request'));
          return;
        }
        if (!result || typeof result !== 'object' || Array.isArray(result)) {
          reject(providerError('TrustPay24 returned an invalid response'));
          return;
        }
        resolve(result);
      });
    });

    request.setTimeout(timeoutMilliseconds, () => {
      request.destroy(providerError('TrustPay24 request timed out'));
    });
    request.on('error', (error) => {
      reject(error.status ? error : providerError('Unable to reach TrustPay24'));
    });
    request.end(body);
  });
};
