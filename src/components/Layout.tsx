import { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import type { Locale } from '../context/languageContextInstance';
import styles from './Layout.module.css';

export default function Layout() {
  const { user, signOut } = useAuth();
  const { locale, setLocale, t } = useLanguage();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('agri_theme') === 'dark';
  });

  const navItems = [
    { to: '/dashboard', label: t('dashboardNav'), icon: '📊' },
    { to: '/assets', label: t('assetsNav'), icon: '🌿' },
    { to: '/ledger', label: t('ledgerNav'), icon: '💰' },
  ];

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.setAttribute('data-theme', 'dark');
      localStorage.setItem('agri_theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
      localStorage.setItem('agri_theme', 'light');
    }
  }, [darkMode]);

  return (
    <div className={styles.container}>
      {/* Mobile hamburger */}
      <button
        className={styles.hamburger}
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        ☰
      </button>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.logo}>
          <h1><span>🌾</span> AgriTracker</h1>
        </div>

        <nav className={styles.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
              }
              onClick={() => setSidebarOpen(false)}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.userSection}>
          {/* Language Switcher */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              marginBottom: 10,
              background: 'var(--color-background)',
              padding: 4,
              borderRadius: 'var(--radius)',
              border: '1px solid var(--color-border)',
            }}
          >
            {(['en', 'hu', 'ro'] as Locale[]).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setLocale(lang)}
                style={{
                  flex: 1,
                  padding: '5px 0',
                  borderRadius: 6,
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  backgroundColor: locale === lang ? 'var(--color-primary)' : 'transparent',
                  color: locale === lang ? '#ffffff' : 'var(--color-text-secondary)',
                  transition: 'all var(--transition)',
                }}
              >
                {lang === 'en' ? '🇬🇧 EN' : lang === 'hu' ? '🇭🇺 HU' : '🇷🇴 RO'}
              </button>
            ))}
          </div>

          {/* Dark Mode Toggle Switch */}
          <div
            role="switch"
            aria-checked={darkMode}
            tabIndex={0}
            className={styles.themeToggleRow}
            onClick={() => setDarkMode(!darkMode)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setDarkMode(!darkMode);
              }
            }}
          >
            <span className={styles.themeLabel}>
              <span>{darkMode ? '🌙' : '☀️'}</span>
              {darkMode ? t('darkMode') : t('lightMode')}
            </span>
            <div className={`${styles.switchTrack} ${darkMode ? styles.switchTrackActive : ''}`}>
              <div className={`${styles.switchThumb} ${darkMode ? styles.switchThumbActive : ''}`} />
            </div>
          </div>

          <p className={styles.userEmail}>{user?.email}</p>
          <button className={styles.signOutBtn} onClick={signOut}>
            {t('signOut')}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
