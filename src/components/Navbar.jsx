import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

var NAV_ITEMS = [
  { id: 'datastore', label: 'Capacity Assessment', short: 'Capacity', icon: 'DS' },
  { id: 'snapshot', label: 'Snapshot Sizing', short: 'Snapshot', icon: 'SS' },
];

function ThemeToggle(props) {
  var theme = props.theme;
  var toggle = props.toggle;
  var isDark = theme === 'dark';

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.92 }}
      onClick={toggle}
      aria-label="Toggle theme"
      style={{
        position: 'relative',
        width: '60px',
        height: '32px',
        borderRadius: '16px',
        border: '2px solid ' + (isDark ? 'var(--border-3)' : 'var(--border-2)'),
        background: isDark
          ? 'linear-gradient(135deg, #1a1e3a 0%, #0a0e1e 100%)'
          : 'linear-gradient(135deg, #87CEEB 0%, #FDB813 100%)',
        cursor: 'pointer',
        overflow: 'hidden',
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        transition: 'all 0.4s ease',
        boxShadow: isDark
          ? 'inset 0 1px 4px rgba(0,0,0,0.4), 0 0 12px rgba(109,25,50,0.15)'
          : 'inset 0 1px 4px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.1)',
      }}
    >
      {isDark && (
        <React.Fragment>
          <div style={{ position: 'absolute', top: '6px', left: '8px', width: '2px', height: '2px', borderRadius: '50%', background: 'white', opacity: 0.7 }} />
          <div style={{ position: 'absolute', top: '14px', left: '14px', width: '1.5px', height: '1.5px', borderRadius: '50%', background: 'white', opacity: 0.5 }} />
          <div style={{ position: 'absolute', top: '8px', left: '22px', width: '2px', height: '2px', borderRadius: '50%', background: 'white', opacity: 0.6 }} />
        </React.Fragment>
      )}
      {!isDark && (
        <React.Fragment>
          <div style={{ position: 'absolute', top: '8px', right: '10px', width: '10px', height: '5px', borderRadius: '5px', background: 'rgba(255,255,255,0.7)' }} />
          <div style={{ position: 'absolute', top: '16px', right: '18px', width: '8px', height: '4px', borderRadius: '4px', background: 'rgba(255,255,255,0.5)' }} />
        </React.Fragment>
      )}
      <motion.div
        animate={{ x: isDark ? 3 : 28 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        style={{
          width: '24px', height: '24px', borderRadius: '50%',
          background: isDark
            ? 'linear-gradient(135deg, #C8C8C8 0%, #F5F5DC 100%)'
            : 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
          boxShadow: isDark
            ? '0 0 8px rgba(200,200,200,0.3), inset -3px -2px 0 rgba(160,160,180,0.4)'
            : '0 0 12px rgba(255,200,0,0.5), 0 2px 4px rgba(0,0,0,0.15)',
          position: 'relative', zIndex: 2,
        }}
      >
        {isDark && (
          <React.Fragment>
            <div style={{ position: 'absolute', top: '5px', left: '5px', width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(140,140,160,0.4)' }} />
            <div style={{ position: 'absolute', top: '13px', left: '11px', width: '3px', height: '3px', borderRadius: '50%', background: 'rgba(140,140,160,0.3)' }} />
          </React.Fragment>
        )}
        {!isDark && (
          <div style={{ position: 'absolute', inset: '-3px', borderRadius: '50%', border: '2px solid rgba(255,200,0,0.3)', animation: 'pulse-dot 2s ease infinite' }} />
        )}
      </motion.div>
    </motion.button>
  );
}

function Navbar(props) {
  var tab = props.tab;
  var setTab = props.setTab;
  var logo = props.logo;
  var theme = props.theme;
  var toggleTheme = props.toggleTheme;

  var scrollState = useState(false);
  var scrolled = scrollState[0];

  var mobileState = useState(false);
  var mobileOpen = mobileState[0];
  var setMobileOpen = mobileState[1];

  // Track screen width for burger visibility
  var widthState = useState(window.innerWidth);
  var screenWidth = widthState[0];

  useEffect(function () {
    function onScroll() { scrollState[1](window.scrollY > 10); }
    function onResize() { widthState[1](window.innerWidth); }
    window.addEventListener('scroll', onScroll);
    window.addEventListener('resize', onResize);
    return function () {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // Only show burger on truly small screens (< 768px)
  var isMobile = screenWidth < 768;

  return (
    <React.Fragment>
      <motion.header
        initial={{ y: -80 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'sticky', top: 0, zIndex: 100, transition: 'all 0.35s',
          background: 'var(--bg-header)',
          backdropFilter: 'blur(24px) saturate(1.5)',
          borderBottom: '1px solid ' + (scrolled ? 'var(--border-2)' : 'var(--border-1)'),
          boxShadow: scrolled ? 'var(--shadow-card)' : 'none',
        }}
      >
        <div style={{ maxWidth: '1500px', margin: '0 auto', padding: '0 20px' }}>
          <div className="flex items-center justify-between" style={{ height: '80px' }}>

            {/* Brand */}
            <div className="flex items-center" style={{ gap: '18px' }}>
              <motion.div whileHover={{ scale: 1.03 }}
                style={{
                  width: '64px', height: '64px', borderRadius: '16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', flexShrink: 0,
                  background: logo ? 'transparent' : 'linear-gradient(145deg, var(--qnb-primary), var(--qnb-primary-dark))',
                  boxShadow: logo ? 'none' : '0 4px 20px rgba(109,25,50,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                }}
              >
                {logo ? (
                  <img src={logo} alt="Logo" style={{ width: '64px', height: '64px', objectFit: 'contain', borderRadius: '16px' }} />
                ) : (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--qnb-gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                )}
              </motion.div>
              <div style={{ minWidth: 0 }}>
                <h1 className="gradient-text-brand" style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                  VCapacity
                </h1>
                <p style={{ fontSize: '12px', color: 'var(--text-4)', letterSpacing: '0.6px', textTransform: 'uppercase', marginTop: '4px', fontWeight: 600 }}>
                  Cloud & Platform Services
                </p>
              </div>
            </div>

            {/* Desktop Nav — always visible on non-mobile */}
            {!isMobile && (
              <nav className="flex items-center" style={{ gap: '6px' }}>
                {NAV_ITEMS.map(function (item) {
                  var active = tab === item.id;
                  return (
                    <motion.button key={item.id} whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}
                      onClick={function () { setTab(item.id); }}
                      style={{
                        position: 'relative', padding: '10px 22px', border: 'none', borderRadius: '12px',
                        fontSize: '15px', fontWeight: active ? 700 : 500, cursor: 'pointer', transition: 'all 0.25s',
                        color: active ? 'var(--qnb-gold)' : 'var(--text-3)',
                        background: active ? 'rgba(109,25,50,0.12)' : 'transparent',
                      }}
                    >
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: '28px', height: '20px', borderRadius: '5px',
                        fontSize: '10px', fontWeight: 800, marginRight: '8px',
                        background: active ? 'var(--qnb-primary)' : 'var(--bg-4)',
                        color: active ? 'var(--qnb-gold)' : 'var(--text-4)', transition: 'all 0.25s',
                      }}>{item.icon}</span>
                      {item.label}
                      {active && (
                        <motion.div layoutId="nav-pill"
                          style={{ position: 'absolute', bottom: '-1px', left: '15%', right: '15%', height: '2.5px', borderRadius: '2px', background: 'linear-gradient(90deg, var(--qnb-primary), var(--qnb-gold))' }}
                          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                        />
                      )}
                    </motion.button>
                  );
                })}
              </nav>
            )}

            {/* Right */}
            <div className="flex items-center" style={{ gap: '14px' }}>
              <ThemeToggle theme={theme} toggle={toggleTheme} />
              {!isMobile && (
                <div className="flex items-center" style={{ gap: '6px' }}>
                  <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 2, repeat: Infinity }}
                    style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--green)' }} />
                  <span style={{ fontSize: '11px', color: 'var(--text-4)', fontWeight: 700, letterSpacing: '0.5px' }}>ONLINE</span>
                </div>
              )}
              <span style={{
                padding: '6px 14px', borderRadius: '10px', fontSize: '11px', fontWeight: 800, letterSpacing: '1px',
                background: 'linear-gradient(135deg, rgba(109,25,50,0.15), rgba(201,168,76,0.08))',
                border: '1px solid rgba(201,168,76,0.2)', color: 'var(--qnb-gold)',
              }}>v1.0</span>

              {/* Mobile burger — ONLY on mobile */}
              {isMobile && (
                <button
                  onClick={function () { setMobileOpen(!mobileOpen); }}
                  style={{
                    width: '42px', height: '42px', borderRadius: '10px',
                    border: '1px solid var(--border-2)', background: 'var(--bg-3)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)',
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {mobileOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <React.Fragment><path d="M3 12h18" /><path d="M3 6h18" /><path d="M3 18h18" /></React.Fragment>}
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.header>

      {/* Mobile dropdown — ONLY on mobile */}
      <AnimatePresence>
        {isMobile && mobileOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            style={{ position: 'sticky', top: '80px', zIndex: 99, background: 'var(--bg-1)', borderBottom: '1px solid var(--border-2)', overflow: 'hidden' }}
          >
            <div style={{ padding: '10px 16px' }}>
              {NAV_ITEMS.map(function (item) {
                var active = tab === item.id;
                return (
                  <button key={item.id} onClick={function () { setTab(item.id); setMobileOpen(false); }}
                    style={{
                      display: 'block', width: '100%', padding: '14px 18px', borderRadius: '12px', border: 'none',
                      textAlign: 'left', fontSize: '16px', fontWeight: active ? 700 : 500, cursor: 'pointer', marginBottom: '4px',
                      color: active ? 'var(--qnb-gold)' : 'var(--text-2)',
                      background: active ? 'rgba(109,25,50,0.12)' : 'transparent',
                    }}
                  >{item.label}</button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </React.Fragment>
  );
}

export default Navbar;