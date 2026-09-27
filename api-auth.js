// Attaches the signed-in user's Firebase ID token to every same-origin /api/ request
// (Authorization: Bearer <token>). The server functions use it to know which farrier
// or customer is calling — e.g. stripe-payment looks up that farrier's Stripe key on
// the server, so secret keys never have to live in (or pass through) the browser.
//
// Loaded by index.html, mobile.html and customer-portal.html right after the Firebase
// SDK. Existing fetch('/api/...') calls need no changes.
(function () {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const isApi = url.startsWith('/api/') || url.startsWith(location.origin + '/api/');
    const user = isApi && window.firebase && firebase.apps.length ? firebase.auth().currentUser : null;
    if (user) {
      try {
        const token = await user.getIdToken();
        init = Object.assign({}, init);
        const headers = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {});
        if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token);
        init.headers = headers;
      } catch (e) { /* offline token refresh failed — send without; server will say sign in again */ }
    }
    return originalFetch(input, init);
  };
})();
