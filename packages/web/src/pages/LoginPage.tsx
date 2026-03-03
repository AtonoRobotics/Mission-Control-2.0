/**
 * Mission Control — Login Page
 * Email/password form + OAuth buttons. Uses warm amber theme.
 */

import { useState, type FormEvent } from 'react';
import { useAuthStore } from '@/stores/authStore';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

export default function LoginPage() {
  const { login, isLoading, error, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await login(email, password);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        background: 'var(--bg-base)',
      }}
    >
      <div
        style={{
          width: 380,
          padding: 32,
          background: 'var(--bg-surface-1)',
          borderRadius: 12,
          border: '1px solid var(--border-subtle, #222)',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: 'var(--accent)',
              margin: 0,
              letterSpacing: 1,
            }}
          >
            MISSION CONTROL
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 6 }}>
            Sign in to continue
          </p>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              padding: '8px 12px',
              marginBottom: 16,
              borderRadius: 6,
              background: 'rgba(255, 80, 80, 0.1)',
              border: '1px solid rgba(255, 80, 80, 0.3)',
              color: '#ff5050',
              fontSize: 13,
              cursor: 'pointer',
            }}
            onClick={clearError}
          >
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <label
            style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}
          >
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="mc-input"
            style={{ width: '100%', marginBottom: 14 }}
          />

          <label
            style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}
          >
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mc-input"
            style={{ width: '100%', marginBottom: 20 }}
          />

          <button
            type="submit"
            disabled={isLoading}
            className="mc-btn-primary"
            style={{ width: '100%', padding: '10px 0', fontSize: 14, fontWeight: 600 }}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            margin: '20px 0',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, height: 1, background: 'var(--border-subtle, #333)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-tertiary, #555)' }}>OR</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border-subtle, #333)' }} />
        </div>

        {/* OAuth */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <a
            href={`${API_BASE}/api/auth/oauth/google`}
            className="mc-btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '9px 0',
              textDecoration: 'none',
              fontSize: 13,
            }}
          >
            <GoogleIcon />
            Continue with Google
          </a>
          <a
            href={`${API_BASE}/api/auth/oauth/github`}
            className="mc-btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '9px 0',
              textDecoration: 'none',
              fontSize: 13,
            }}
          >
            <GitHubIcon />
            Continue with GitHub
          </a>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}
