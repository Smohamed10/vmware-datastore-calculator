import React from 'react';
import { motion } from 'framer-motion';

export function Card(props) {
  var children = props.children;
  var title = props.title;
  var sub = props.sub;
  var accent = props.accent || 'var(--qnb-primary)';
  var className = props.className || '';
  var delay = props.delay || 0;
  var glow = props.glow;
  var id = props.id;

  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay: delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
      style={{
        background: 'linear-gradient(165deg, var(--bg-card) 0%, var(--bg-card-end) 100%)',
        border: '1px solid var(--border-1)',
        borderRadius: '18px',
        padding: '26px',
        transition: 'all 0.35s cubic-bezier(0.4,0,0.2,1)',
        backdropFilter: 'blur(12px)',
        boxShadow: glow ? '0 0 40px ' + glow + ', var(--shadow-card)' : 'var(--shadow-card)',
      }}
      whileHover={{ borderColor: 'var(--border-3)', y: -2 }}
    >
      {(title || sub) && (
        <div style={{ marginBottom: '22px', paddingBottom: '18px', borderBottom: '1px solid var(--border-1)' }}>
          <div className="flex items-center" style={{ gap: '12px' }}>
            <div style={{ width: '4px', height: title ? '22px' : '16px', borderRadius: '2px', background: 'linear-gradient(180deg, ' + accent + ', ' + accent + '60)' }} />
            <div>
              {title && <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-0)' }}>{title}</h3>}
              {sub && <p style={{ fontSize: '13.5px', color: 'var(--text-body)', marginTop: '5px', lineHeight: 1.6 }}>{sub}</p>}
            </div>
          </div>
        </div>
      )}
      {children}
    </motion.div>
  );
}

export function Field(props) {
  var label = props.label;
  var hint = props.hint;
  var value = props.value;
  var onChange = props.onChange;
  var unit = props.unit;
  var onUnit = props.onUnit;
  var showUnit = props.showUnit !== false;
  var suffix = props.suffix;
  var error = props.error;
  var num = props.num;
  var children = props.children;
  var step = props.step || 'any';

  var borderColor = error ? 'var(--red)' : 'var(--border-2)';

  return (
    <div style={{ marginBottom: '22px' }}>
      {label && (
        <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-3)' }}>
            {num && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '24px', height: '24px', borderRadius: '7px', marginRight: '8px',
                fontSize: '11px', fontWeight: 800,
                background: 'rgba(109,25,50,0.2)', color: 'var(--qnb-gold)',
              }}>{num}</span>
            )}
            {label}
          </label>
          {error && (
            <motion.span initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
              style={{ fontSize: '13px', color: 'var(--red)', fontWeight: 700 }}
            >{error}</motion.span>
          )}
        </div>
      )}
      {hint && <p style={{ fontSize: '13px', color: 'var(--text-body)', marginBottom: '10px', lineHeight: 1.65, paddingLeft: num ? '32px' : 0 }}>{hint}</p>}
      <div className="flex items-center" style={{ gap: '8px' }}>
        <input
          type="number" value={value}
          onChange={function (e) { onChange(e.target.value); }}
          step={step} min="0"
          style={{
            flex: 1, minWidth: 0, padding: '14px 16px',
            borderRadius: '12px', fontSize: '16px', fontWeight: 600,
            fontFamily: "'JetBrains Mono', monospace",
            outline: 'none', transition: 'all 0.25s',
            background: 'var(--bg-input)', border: '1.5px solid ' + borderColor,
            color: 'var(--text-0)',
            boxShadow: error ? '0 0 0 3px var(--red-bg)' : 'none',
          }}
          onFocus={function (e) {
            if (!error) { e.target.style.borderColor = 'var(--qnb-primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(109,25,50,0.12)'; }
          }}
          onBlur={function (e) {
            e.target.style.borderColor = error ? 'var(--red)' : 'var(--border-2)';
            e.target.style.boxShadow = error ? '0 0 0 3px var(--red-bg)' : 'none';
          }}
        />
        {showUnit && (
          <select value={unit} onChange={function (e) { onUnit(e.target.value); }}
            style={{
              width: '84px', padding: '14px 10px', borderRadius: '12px',
              fontSize: '15px', fontWeight: 700, outline: 'none', cursor: 'pointer',
              background: 'var(--bg-input)', border: '1.5px solid var(--border-2)',
              color: 'var(--qnb-gold)', appearance: 'none', WebkitAppearance: 'none',
              textAlign: 'center', fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {['KB', 'MB', 'GB', 'TB', 'PB'].map(function (u) { return <option key={u} value={u}>{u}</option>; })}
          </select>
        )}
        {suffix && <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-body)', flexShrink: 0 }}>{suffix}</span>}
        {children}
      </div>
    </div>
  );
}

export function Row(props) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center justify-between"
      style={{ padding: '13px 0', borderBottom: '1px solid var(--border-1)' }}
    >
      <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-body)' }}>{props.label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: '15px', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: props.gold ? 'var(--qnb-gold)' : 'var(--text-1)' }}>{props.value}</span>
        {props.sub && <div style={{ fontSize: '12px', color: 'var(--text-4)', marginTop: '2px' }}>{props.sub}</div>}
      </div>
    </motion.div>
  );
}

export function Status(props) {
  var sev = props.sev || 'neutral';
  var title = props.title;
  var detail = props.detail;
  var children = props.children;

  var theme = {
    success: { bg: 'var(--green-bg)', border: 'var(--green-border)', color: 'var(--green)', icon: '\u2713' },
    warning: { bg: 'var(--amber-bg)', border: 'var(--amber-border)', color: 'var(--amber)', icon: '\u26A0' },
    danger: { bg: 'var(--red-bg)', border: 'var(--red-border)', color: 'var(--red)', icon: '\u2717' },
    neutral: { bg: 'rgba(80,88,112,0.06)', border: 'var(--border-2)', color: 'var(--text-3)', icon: '\u25CB' },
  };
  var t = theme[sev] || theme.neutral;

  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}
      style={{ borderRadius: '14px', overflow: 'hidden', boxShadow: '0 0 20px ' + t.bg }}
    >
      <div className="flex items-center" style={{ gap: '12px', padding: '14px 18px', background: t.bg, borderBottom: '1px solid ' + t.border }}>
        <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2, repeat: Infinity }}
          style={{ width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 800, background: t.color + '18', color: t.color }}
        >{t.icon}</motion.div>
        <span style={{ fontSize: '15px', fontWeight: 800, color: t.color }}>{title}</span>
      </div>
      {(detail || children) && (
        <div style={{ padding: '14px 18px', background: t.bg }}>
          {detail && <p style={{ fontSize: '14px', lineHeight: 1.7, color: t.color + 'CC' }}>{detail}</p>}
          {children}
        </div>
      )}
    </motion.div>
  );
}

export function Progress(props) {
  var pct = props.pct || 0;
  var sev = props.sev || 'success';
  var colors = { success: 'linear-gradient(90deg, #059669, #22C55E)', warning: 'linear-gradient(90deg, #D97706, #F59E0B)', danger: 'linear-gradient(90deg, #DC2626, #EF4444)' };

  return (
    <div style={{ margin: '16px 0' }}>
      <div className="flex justify-between" style={{ marginBottom: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-body)' }}>{props.left}</span>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-body)' }}>{props.right}</span>
      </div>
      <div style={{ height: '10px', borderRadius: '5px', background: 'var(--bg-4)', overflow: 'hidden' }}>
        <motion.div initial={{ width: 0 }} animate={{ width: Math.min(pct, 100) + '%' }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          style={{ height: '100%', borderRadius: '5px', background: colors[sev] || colors.success }} />
      </div>
    </div>
  );
}

export function BigResult(props) {
  var bg = props.danger
    ? 'linear-gradient(135deg, var(--red-bg), rgba(239,68,68,0.03))'
    : 'linear-gradient(135deg, rgba(109,25,50,0.12), rgba(201,168,76,0.05))';
  var brd = props.danger ? '2px dashed rgba(239,68,68,0.35)' : '1px solid rgba(201,168,76,0.2)';

  return (
    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      style={{ margin: '22px 0', padding: '28px 18px', borderRadius: '18px', textAlign: 'center', background: bg, border: brd }}
    >
      <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '2.5px', textTransform: 'uppercase', color: props.danger ? 'var(--red)' : 'var(--text-4)', marginBottom: '8px' }}>{props.label}</div>
      <div className={props.danger ? '' : 'shimmer-gold'} style={{ fontSize: '2.5rem', fontWeight: 900, lineHeight: 1.1, color: props.danger ? 'var(--red)' : undefined }}>{props.value}</div>
      {props.sub && <div style={{ fontSize: '14px', fontWeight: 600, color: props.danger ? 'rgba(239,68,68,0.6)' : 'var(--text-body)', marginTop: '10px' }}>{props.sub}</div>}
    </motion.div>
  );
}

export function CalcButton(props) {
  return (
    <motion.button
      whileHover={props.disabled ? {} : { scale: 1.015, y: -1 }}
      whileTap={props.disabled ? {} : { scale: 0.985 }}
      onClick={props.disabled ? undefined : props.onClick}
      style={{
        width: '100%', padding: '16px', borderRadius: '14px',
        border: '1px solid rgba(201,168,76,0.2)',
        fontSize: '15px', fontWeight: 800, letterSpacing: '1.5px',
        cursor: props.disabled ? 'not-allowed' : 'pointer', marginTop: '12px',
        background: props.disabled ? 'var(--bg-4)' : 'linear-gradient(135deg, var(--qnb-primary-dark), var(--qnb-primary), var(--qnb-primary-light))',
        color: props.disabled ? 'var(--text-4)' : 'var(--qnb-gold)',
        boxShadow: props.disabled ? 'none' : '0 6px 30px rgba(109,25,50,0.4)',
        opacity: props.disabled ? 0.5 : 1, transition: 'all 0.3s',
      }}
    >{props.label || 'CALCULATE'}</motion.button>
  );
}

export function Toggle(props) {
  return (
    <label className="flex items-center" style={{
      gap: '14px', padding: '14px 16px', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.25s',
      background: props.checked ? 'rgba(109,25,50,0.1)' : 'var(--bg-input)',
      border: '1.5px solid ' + (props.checked ? 'rgba(109,25,50,0.35)' : 'var(--border-1)'),
    }}>
      <div style={{ position: 'relative', width: '48px', height: '26px', flexShrink: 0 }}>
        <input type="checkbox" checked={props.checked} onChange={function () { props.onChange(!props.checked); }} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
        <div style={{ width: '100%', height: '100%', borderRadius: '13px', transition: 'all 0.3s', background: props.checked ? 'var(--qnb-primary)' : 'var(--border-2)' }} />
        <motion.div
          style={{ position: 'absolute', top: '3px', width: '20px', height: '20px', borderRadius: '50%', background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }}
          animate={{ left: props.checked ? '24px' : '3px' }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </div>
      <div>
        <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-1)', display: 'block' }}>{props.label}</span>
        {props.sub && <span style={{ fontSize: '12.5px', color: 'var(--text-body)', display: 'block', marginTop: '3px', lineHeight: 1.5 }}>{props.sub}</span>}
      </div>
    </label>
  );
}

export function UnitsGrid(props) {
  if (!props.units) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px', marginTop: '14px' }}>
      {Object.entries(props.units).map(function (entry, i) {
        var u = entry[0]; var v = entry[1];
        var d = u === 'PB' ? 8 : u === 'TB' ? 4 : u === 'KB' ? 0 : 2;
        var display = v === 0 ? '0' : Math.abs(v) >= 1e6 ? v.toExponential(2) : (+v.toFixed(d)).toLocaleString('en-US');
        return (
          <motion.div key={u} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }}
            style={{ padding: '10px 8px', borderRadius: '10px', textAlign: 'center', background: 'var(--bg-input)', border: '1px solid var(--border-1)' }}
          >
            <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1px', color: 'var(--text-4)' }}>{u}</div>
            <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '4px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-2)' }}>{display}</div>
          </motion.div>
        );
      })}
    </div>
  );
}