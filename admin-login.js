(() => {
  'use strict';

  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const BACKEND = isLocal ? `http://${location.hostname}:3000` : 'https://phs-grades-backend.onrender.com';
  const status = document.getElementById('login-status');
  const googleButton = document.getElementById('google-login-btn');
  const errors = {
    denied: 'This Google account is not authorized.',
    verification: 'Google sign-in could not be verified. Try again.',
    unavailable: 'Admin sign-in is temporarily unavailable.',
    missing: 'Google did not return a sign-in credential. Try again.',
    session: 'Google sign-in succeeded, but this browser did not save the admin session. Try again with cross-site tracking prevention disabled for this site.'
  };

  function setStatus(message, error = false) {
    status.textContent = message || '';
    status.classList.toggle('error', error);
  }

  function handoffCredential(response) {
    if (!response?.credential) {
      setStatus(errors.missing, true);
      return;
    }
    setStatus('Opening admin session...');
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = BACKEND + '/admin/google-login';
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'credential';
    input.value = response.credential;
    form.appendChild(input);
    document.body.appendChild(form);
    form.requestSubmit();
  }

  async function initialize() {
    const errorCode = new URLSearchParams(location.search).get('error');
    if (errors[errorCode]) setStatus(errors[errorCode], true);
    let config;
    try {
      const response = await fetch(BACKEND + '/admin/auth-config', { credentials: 'omit' });
      if (!response.ok) throw new Error('Auth config unavailable');
      config = await response.json();
    } catch {
      if (!errors[errorCode]) setStatus('Admin backend is waking up. Refresh in a few seconds.', true);
      return;
    }
    if (!config.googleClientId) {
      setStatus(errors.unavailable, true);
      return;
    }

    const render = () => {
      if (!window.google?.accounts?.id) return false;
      const buttonWidth = Math.min(320, Math.max(200, window.innerWidth - 106));
      window.google.accounts.id.initialize({ client_id: config.googleClientId, callback: handoffCredential });
      window.google.accounts.id.renderButton(googleButton, {
        theme: 'outline',
        size: 'large',
        type: 'standard',
        text: 'signin_with',
        shape: 'rectangular',
        width: buttonWidth
      });
      if (!errors[errorCode]) setStatus('');
      return true;
    };

    if (render()) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (render() || attempts >= 60) {
        clearInterval(timer);
        if (attempts >= 60) setStatus('Google sign-in did not load. Refresh and try again.', true);
      }
    }, 100);
  }

  initialize();
})();
