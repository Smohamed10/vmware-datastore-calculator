import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar.jsx';
import DatastoreTab from './components/DatastoreTab.jsx';
import SnapshotTab from './components/SnapshotTab.jsx';

function App() {
  var tabState = useState('datastore');
  var tab = tabState[0];
  var setTab = tabState[1];

  var themeState = useState(function () {
    var saved = localStorage.getItem('theme');
    return saved || 'dark';
  });
  var theme = themeState[0];
  var setTheme = themeState[1];

  useEffect(function () {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  function toggleTheme() {
    setTheme(function (prev) { return prev === 'dark' ? 'light' : 'dark'; });
  }

  // LOGO: place file in /public/ and set path
  var logo = '../public/QNBLogo.png';

  var tabs = {
    datastore: DatastoreTab,
    snapshot: SnapshotTab,
  };

  var Active = tabs[tab] || DatastoreTab;

  return (
    <div style={{ minHeight: '100vh' }}>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: {
            background: 'var(--bg-3)',
            color: 'var(--text-1)',
            border: '1px solid var(--border-2)',
            borderRadius: '14px',
            fontSize: '14px',
            fontWeight: 500,
            padding: '16px 20px',
            boxShadow: 'var(--shadow-card)',
          },
          success: { iconTheme: { primary: '#22C55E', secondary: 'var(--bg-0)' } },
          error: { iconTheme: { primary: '#EF4444', secondary: 'var(--bg-0)' } },
        }}
      />

      <Navbar tab={tab} setTab={setTab} logo={logo} theme={theme} toggleTheme={toggleTheme} />

      <main style={{ padding: '32px 20px', maxWidth: '1500px', margin: '0 auto' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -12, filter: 'blur(6px)' }}
            transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <Active />
          </motion.div>
        </AnimatePresence>
      </main>

      <footer style={{
        borderTop: '1px solid var(--border-1)',
        padding: '22px 20px',
        textAlign: 'center',
        background: 'var(--bg-header)',
        transition: 'all 0.4s ease',
      }}>
        <p style={{ fontSize: '12px', color: 'var(--text-4)', letterSpacing: '0.3px' }}>
          Technology Operations &middot; Cloud & Platform Services
        </p>
      </footer>
    </div>
  );
}

export default App;