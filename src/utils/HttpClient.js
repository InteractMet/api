export class HttpClient {
  constructor(baseURL, getApiKey) {
    this.baseURL = baseURL;
    this.getApiKey = getApiKey;
  }

  async request(method, endpoint, data = null, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const apiKey = this.getApiKey();
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }

    const config = {
      method,
      headers,
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      config.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, config);

      if (response.status === 204) {
        return null;
      }

      const responseData = await response.json();

      if (!response.ok) {
        const error = new Error(responseData.error || 'Request failed');
        error.status = response.status;
        error.data = responseData;
        throw error;
      }

      return responseData;
    } catch (error) {
      if (error.message === 'Failed to fetch') {
        const networkError = new Error('Network error: Unable to connect to server');
        networkError.status = 0;
        throw networkError;
      }
      throw error;
    }
  }

  get(endpoint, options) {
    return this.request('GET', endpoint, null, options);
  }

  post(endpoint, data, options) {
    return this.request('POST', endpoint, data, options);
  }

  put(endpoint, data, options) {
    return this.request('PUT', endpoint, data, options);
  }

  patch(endpoint, data, options) {
    return this.request('PATCH', endpoint, data, options);
  }

  delete(endpoint, options) {
    return this.request('DELETE', endpoint, null, options);
  }
}
