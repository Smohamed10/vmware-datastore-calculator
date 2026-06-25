import React from 'react';

export default function ResultRow({ label, value, highlight, icon }) {
  return (
    <div
      className="flex items-center justify-between py-2.5 border-b last:border-b-0"
      style={{ borderColor: 'rgba(37,45,74,0.5)' }}
    >
      <span className="text-xs font-medium flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
        {icon && <span className="opacity-60">{icon}</span>}
        {label}
      </span>
      <span
        className="text-sm font-bold tabular-nums"
        style={{ color: highlight ? 'var(--qnb-gold)' : 'var(--text-primary)' }}
      >
        {value}
      </span>
    </div>
  );
}