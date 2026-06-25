import React from 'react';
import { motion } from 'framer-motion';

const SEVERITY_STYLES = {
  success: {
    bg: 'rgba(16,185,129,0.1)',
    border: 'rgba(16,185,129,0.3)',
    color: '#10B981',
    glow: 'rgba(16,185,129,0.15)',
    icon: '✓',
    pulse: true,
  },
  warning: {
    bg: 'rgba(245,158,11,0.1)',
    border: 'rgba(245,158,11,0.3)',
    color: '#F59E0B',
    glow: 'rgba(245,158,11,0.15)',
    icon: '⚠',
    pulse: true,
  },
  danger: {
    bg: 'rgba(239,68,68,0.1)',
    border: 'rgba(239,68,68,0.3)',
    color: '#EF4444',
    glow: 'rgba(239,68,68,0.15)',
    icon: '✕',
    pulse: true,
  },
  neutral: {
    bg: 'rgba(100,110,140,0.08)',
    border: 'var(--border-default)',
    color: 'var(--text-muted)',
    glow: 'transparent',
    icon: '○',
    pulse: false,
  },
};

export default function StatusBadge({ severity = 'neutral', title, detail, children, className = '' }) {
  const style = SEVERITY_STYLES[severity] || SEVERITY_STYLES.neutral;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35 }}
      className={`rounded-xl overflow-hidden ${className}`}
      style={{ boxShadow: `0 0 30px ${style.glow}` }}
    >
      {/* Header Band */}
      <div
        className="px-4 py-3 flex items-center gap-3"
        style={{
          background: style.bg,
          borderBottom: `1px solid ${style.border}`,
        }}
      >
        <div
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
          style={{
            background: `${style.color}20`,
            color: style.color,
            animation: style.pulse ? 'pulse-ring 2s infinite' : 'none',
          }}
        >
          {style.icon}
        </div>
        <span className="text-sm font-bold tracking-wide" style={{ color: style.color }}>
          {title}
        </span>
      </div>

      {/* Detail Body */}
      {(detail || children) && (
        <div
          className="px-4 py-3"
          style={{
            background: `${style.bg}`,
            borderTop: 'none',
          }}
        >
          {detail && (
            <p className="text-xs leading-relaxed" style={{ color: `${style.color}CC` }}>
              {detail}
            </p>
          )}
          {children}
        </div>
      )}
    </motion.div>
  );
}