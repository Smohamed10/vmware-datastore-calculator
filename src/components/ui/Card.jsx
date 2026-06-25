import React from 'react';
import { motion } from 'framer-motion';

function Card(props) {
  var title = props.title;
  var subtitle = props.subtitle;
  var icon = props.icon;
  var iconColor = props.iconColor || 'var(--qnb-maroon)';
  var children = props.children;
  var className = props.className || '';
  var animate = props.animate !== undefined ? props.animate : true;
  var glowColor = props.glowColor;

  var content = (
    <React.Fragment>
      {(title || subtitle) && (
        <div
          className="flex items-start gap-3 mb-5 pb-4"
          style={{ borderBottom: '1px solid var(--border-default)' }}
        >
          {icon && (
            <div
              className="flex-shrink-0 mt-0.5"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: iconColor + '20',
                color: iconColor,
              }}
            >
              {icon}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            {title && (
              <h3
                className="text-sm font-bold"
                style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}
              >
                {title}
              </h3>
            )}
            {subtitle && (
              <p
                className="mt-0.5"
                style={{ fontSize: '11px', color: 'var(--text-muted)' }}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>
      )}
      {children}
    </React.Fragment>
  );

  var cardStyle = {
    background: 'rgba(17, 21, 40, 0.75)',
    backdropFilter: 'blur(20px)',
    border: '1px solid var(--border-default)',
    borderRadius: '16px',
    padding: '20px',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  };

  if (glowColor) {
    cardStyle.boxShadow = '0 0 40px ' + glowColor;
  }

  if (animate) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className={className}
        style={cardStyle}
      >
        {content}
      </motion.div>
    );
  }

  return (
    <div className={className} style={cardStyle}>
      {content}
    </div>
  );
}

export default Card;