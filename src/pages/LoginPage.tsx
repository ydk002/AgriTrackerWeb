import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import type { Locale } from '../context/languageContextInstance';
import styles from './Auth.module.css';

export default function LoginPage() {
  const { signIn } = useAuth();
  const { locale, setLocale, t } = useLanguage();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await signIn(email, password);
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginBottom: 8 }}>
          {(['en', 'hu', 'ro'] as Locale[]).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => setLocale(lang)}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: '0.75rem',
                fontWeight: 700,
                backgroundColor: locale === lang ? 'var(--color-primary)' : 'var(--color-background)',
                color: locale === lang ? '#fff' : 'var(--color-text-secondary)',
              }}
            >
              {lang.toUpperCase()}
            </button>
          ))}
        </div>

        <div className={styles.header}>
          <div className={styles.logo}>🌾</div>
          <h1>AgriTracker</h1>
          <p>{t('signInSubtitle')}</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.fieldGroup}>
            <label htmlFor="email">{t('email')}</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="password">{t('password')}</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? t('signingIn') : t('signIn')}
          </button>
        </form>

        <p className={styles.switchText}>
          {t('noAccount')} <Link to="/register">{t('signUp')}</Link>
        </p>
      </div>
    </div>
  );
}
