import { useEffect, useState } from 'react';
import logo from '../../frontend/assets/frontline-logo.png';
import { loginUser } from './auth.js';

// Where to go after a successful login. Set VITE_DASHBOARD_URL when running the dev server,
// because dashboard.html is served by the static site, not by Vite.
const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL || '/frontend/dashboard.html';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Already logged in: skip the login page
  useEffect(() => {
    const user = JSON.parse(sessionStorage.getItem('user') || 'null');
    if (user) window.location.href = DASHBOARD_URL;
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    const result = await loginUser(email.trim(), password);

    if (result.success) {
      window.location.href = DASHBOARD_URL;
      return;
    }

    setError(result.error);
    setLoading(false);
  }

  return (
    <>
      <div className="auth-left"></div>

      <div className="auth-panel">
        <div className="auth-inner">
          <img src={logo} alt="The Frontline" className="auth-logo" />

          <h1 className="auth-title">Log into The Frontline</h1>
          <p className="auth-subtitle">Welcome! Please log in with your account.</p>

          <div className={error ? 'reset-alert error' : 'reset-alert error hidden'} id="login-error" role="alert">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            <span id="login-error-msg">{error}</span>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label className="auth-label" htmlFor="login-email">Email</label>
              <div className="auth-input-wrap">
                <span className="input-icon">
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </span>
                <input
                  type="email"
                  id="login-email"
                  className="auth-input"
                  placeholder="email@gordoncollege.edu.ph"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="login-password">Password</label>
              <div className="auth-input-wrap">
                <span className="input-icon">
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="login-password"
                  className="auth-input"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="eye-toggle"
                  onClick={() => setShowPassword(value => !value)}
                  tabIndex={-1}
                  aria-label="Toggle password visibility"
                >
                  <svg className={showPassword ? 'eye-on hidden' : 'eye-on'} width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <svg className={showPassword ? 'eye-off' : 'eye-off hidden'} width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="remember-row">
              <div className="remember-left">
                <input
                  type="checkbox"
                  id="remember"
                  checked={remember}
                  onChange={e => setRemember(e.target.checked)}
                />
                <label htmlFor="remember">Remember me</label>
              </div>
              <a href="forgot-password.html" className="forgot-link">Forgot password?</a>
            </div>

            <button className="auth-btn" id="login-btn" type="submit" disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </button>

            <p className="auth-bottom">
              Don't have an account yet? <a href="register.html">Sign up</a>
            </p>
          </form>

          <div className="auth-footer">Copyright &copy; 2026 &middot; Team TriDev</div>
        </div>
      </div>
    </>
  );
}
