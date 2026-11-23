const https = require('https');

const endpoint = new URL('https://control.trustpay24.online/api/merchant/v1/payins');
const maximumResponseBytes = 1024 * 1024;
const timeoutMilliseconds = 15000;

function providerError(message, status = 502) {
  const error = new Error(message);
  error.status = status;
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
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (response) => {
      const chunks = [];
      let responseBytes = 0;

      response.on('data', (chunk) => {
        responseBytes += chunk.length;
        if (responseBytes > maximumResponseBytes) {
          console.error('[TrustPay24] response exceeded the size limit');
          request.destroy();
          reject(providerError('TrustPay24 returned an oversized response'));
          return;
        }
        chunks.push(chunk);
      });

      response.on('end', () => {
        const providerStatus = response.statusCode || 502;
        if (providerStatus < 200 || providerStatus >= 300) {
          console.error(`[TrustPay24] payin request returned HTTP ${providerStatus}`);
          const clientStatus = providerStatus === 400 || providerStatus === 422
            ? providerStatus
            : 502;
          reject(providerError(
            `TrustPay24 rejected the payin request (HTTP ${providerStatus})`,
            clientStatus
          ));
          return;
        }

        let result;
        try {
          result = responseBytes
            ? JSON.parse(Buffer.concat(chunks).toString('utf8'))
            : {};
        } catch (error) {
          console.error(`[TrustPay24] invalid JSON response (HTTP ${providerStatus})`);
          reject(providerError('TrustPay24 returned an invalid response'));
          return;
        }

        if (!result || typeof result !== 'object' || Array.isArray(result)) {
          console.error(`[TrustPay24] unexpected response format (HTTP ${providerStatus})`);
          reject(providerError('TrustPay24 returned an invalid response'));
          return;
        }
        resolve(result);
      });
    });

    request.setTimeout(timeoutMilliseconds, () => {
      console.error('[TrustPay24] request timed out');
      request.destroy(providerError('TrustPay24 request timed out'));
    });
    request.on('error', (error) => {
      if (error.status) {
        reject(error);
        return;
      }
      console.error('[TrustPay24] connection failed:', error.code || 'unknown error');
      reject(providerError(`Unable to reach TrustPay24 (${error.code || 'network error'})`));
    });
    request.end(body);
  });
};
