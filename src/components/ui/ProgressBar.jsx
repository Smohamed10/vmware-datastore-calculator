import React from 'react';
import { motion } from 'framer-motion';

export default function ProgressBar({
  usedPercent,
  freePercent,
  usedLabel,
  freeLabel,
  severity = 'success',
}) {
  const colors = {
    success: 'linear-gradient(90deg, #059669, #10B981)',
    warning: 'linear-gradient(90deg, #D97706, #F59E0B)',
    danger: 'linear-gradient(90deg, #DC2626, #EF4444)',
  };

  return (
    <div className="my-4">
      <div className="flex justify-between mb-2">
        <span className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
          {usedLabel}
        </span>
        <span className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
          {freeLabel}
        </span>
      </div>
      <div
        className="h-3 rounded-full overflow-hidden"
        style={{ background: 'var(--bg-input)' }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: colors[severity] || colors.success }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(usedPercent, 100)}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="text-[11px] font-bold" style={{ color: 'var(--text-secondary)' }}>
          {usedPercent.toFixed(1)}% used
        </span>
        <span className="text-[11px] font-bold" style={{ color: 'var(--text-secondary)' }}>
          {freePercent.toFixed(1)}% free
        </span>
      </div>
    </div>
  );
}