import React from 'react';

var UNITS = ['KB', 'MB', 'GB', 'TB', 'PB'];

function InputField(props) {
  var label = props.label;
  var hint = props.hint;
  var value = props.value;
  var onChange = props.onChange;
  var unit = props.unit;
  var onUnitChange = props.onUnitChange;
  var showUnit = props.showUnit !== undefined ? props.showUnit : true;
  var suffix = props.suffix;
  var step = props.step || '0.01';
  var min = props.min || '0';
  var badge = props.badge;
  var children = props.children;

  return (
    <div style={{ marginBottom: '20px' }}>
      {label && (
        <div className="flex items-center gap-2" style={{ marginBottom: '6px' }}>
          {badge && (
            <span
              style={{
                width: '20px',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                fontSize: '10px',
                fontWeight: 700,
                background: 'rgba(109,25,50,0.2)',
                color: 'var(--qnb-gold)',
              }}
            >
              {badge}
            </span>
          )}
          <label
            style={{
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
            }}
          >
            {label}
          </label>
        </div>
      )}
      {hint && (
        <p
          style={{
            fontSize: '11px',
            marginBottom: '8px',
            lineHeight: 1.5,
            color: 'var(--text-muted)',
          }}
        >
          {hint}
        </p>
      )}
      <div className="flex items-center" style={{ gap: '8px' }}>
        <input
          type="number"
          value={value}
          onChange={function(e) { onChange(e.target.value); }}
          step={step}
          min={min}
          style={{
            flex: 1,
            minWidth: 0,
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 500,
            outline: 'none',
            transition: 'all 0.2s',
            background: 'var(--bg-input)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
          }}
          onFocus={function(e) { e.target.style.borderColor = 'var(--qnb-maroon)'; }}
          onBlur={function(e) { e.target.style.borderColor = 'var(--border-default)'; }}
        />
        {showUnit && (
          <select
            value={unit}
            onChange={function(e) { onUnitChange(e.target.value); }}
            style={{
              width: '80px',
              padding: '10px 8px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              outline: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
              appearance: 'none',
              WebkitAppearance: 'none',
            }}
          >
            {UNITS.map(function(u) {
              return <option key={u} value={u}>{u}</option>;
            })}
          </select>
        )}
        {suffix && (
          <span
            style={{
              fontSize: '12px',
              fontWeight: 500,
              flexShrink: 0,
              color: 'var(--text-muted)',
            }}
          >
            {suffix}
          </span>
        )}
        {children}
      </div>
    </div>
  );
}

export default InputField;