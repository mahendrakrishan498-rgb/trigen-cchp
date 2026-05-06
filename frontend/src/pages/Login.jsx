import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export default function Login() {
  const { login, loginWithGoogle, register } = useAuth();
  const navigate = useNavigate();
  const googleButtonRef = useRef(null);
  const [mode, setMode] = useState('user-login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');

  const isRegister = mode === 'register';
  const isAdminLogin = mode === 'admin-login';

  useEffect(() => {
    if (isAdminLogin || isRegister || !googleClientId || !googleButtonRef.current) return;

    function renderGoogleButton() {
      if (!window.google?.accounts?.id || !googleButtonRef.current) return;
      googleButtonRef.current.innerHTML = '';
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
          try {
            setError('');
            await loginWithGoogle(response.credential);
            navigate('/dashboard');
          } catch (err) {
            setError(err.message);
          }
        }
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        width: 320,
        text: 'continue_with'
      });
    }

    if (window.google?.accounts?.id) {
      renderGoogleButton();
      return;
    }

    const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existingScript) {
      existingScript.addEventListener('load', renderGoogleButton, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = renderGoogleButton;
    document.body.appendChild(script);
  }, [isAdminLogin, isRegister, loginWithGoogle, navigate]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      if (isRegister) await register(form.name, form.email, form.password);
      else await login(form.email, form.password, isAdminLogin ? 'admin' : 'user');
      navigate('/dashboard');
    } catch (err) { setError(err.message); }
  }

  function setLoginMode(nextMode) {
    setMode(nextMode);
    setError('');
    setForm({ name: '', email: '', password: '' });
  }

  return (
    <div className="auth-page">
      <button
        type="button"
        className="admin-login-toggle"
        onClick={() => setLoginMode(isAdminLogin ? 'user-login' : 'admin-login')}
      >
        {isAdminLogin ? 'User Login' : 'Admin Login'}
      </button>

      <div className="auth-shell">
        <section className="auth-photo-panel">
          <div className="auth-photo-copy">
            <h2>BIOMASS BASED TRIGENERATION</h2>
            <p>Cleaner hotel energy design for electricity, cooling and heating.</p>
          </div>
        </section>

        <section className="auth-form-panel">
          <form className="auth-card" onSubmit={submit}>
            <h1>{isAdminLogin ? 'Admin Login' : isRegister ? 'Create Account' : 'User Login'}</h1>
            <p>{isAdminLogin ? 'System configuration access' : 'Hotel sector CCHP feasibility platform'}</p>

            {isRegister && (
              <label>
                Name
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
            )}

            <label>
              Email
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>

            <label>
              Password
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </label>

            {error && <div className="error">{error}</div>}

            <button className="auth-submit">{isRegister ? 'CREATE ACCOUNT' : 'ENTER'}</button>

            {!isAdminLogin && !isRegister && googleClientId && (
              <>
                <div className="auth-divider">or</div>
                <div className="google-login-button" ref={googleButtonRef} />
              </>
            )}

            {!isAdminLogin && (
              <button type="button" className="link-button" onClick={() => setLoginMode(isRegister ? 'user-login' : 'register')}>
                {isRegister ? 'Already have account? User Login' : 'Need account? Register'}
              </button>
            )}
          </form>
        </section>
      </div>
    </div>
  );
}
