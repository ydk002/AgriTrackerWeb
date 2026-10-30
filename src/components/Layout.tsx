import { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import styles from './Layout.module.css';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/assets', label: 'Assets', icon: '🌿' },
  { to: '/ledger', label: 'Ledger', icon: '💰' },
];

export default function Layout() {
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('agri_theme') === 'dark';
  });

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
              {darkMode ? 'Dark Mode' : 'Light Mode'}
            </span>
            <div className={`${styles.switchTrack} ${darkMode ? styles.switchTrackActive : ''}`}>
              <div className={`${styles.switchThumb} ${darkMode ? styles.switchThumbActive : ''}`} />
            </div>
          </div>

          <p className={styles.userEmail}>{user?.email}</p>
          <button className={styles.signOutBtn} onClick={signOut}>
            Sign Out
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
