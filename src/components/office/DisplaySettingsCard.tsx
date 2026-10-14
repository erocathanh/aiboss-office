'use client';

import { useState, useEffect } from 'react';
import { TextAa, Check } from '@phosphor-icons/react';
import {
  TextSize,
  readTextSize,
  saveTextSize,
  applyTextSize,
  DEFAULT_TEXT_SIZE,
} from './text-size';

export function DisplaySettingsCard() {
  const [size, setSize] = useState<TextSize>(DEFAULT_TEXT_SIZE);

  useEffect(() => {
    const initial = readTextSize();
    setSize(initial);
    applyTextSize(initial);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'aiboss-office.text-size') {
        const next = readTextSize();
        setSize(next);
        applyTextSize(next);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleChange = (newSize: TextSize) => {
    setSize(newSize);
    saveTextSize(newSize);
    applyTextSize(newSize);
  };

  return (
    <section className="settings-card settings-card-wide display-settings-card">
      <div className="settings-card-header">
        <TextAa size={20} weight="bold" className="settings-card-icon" />
        <div>
          <h2>Display</h2>
          <p className="settings-card-subtitle">
            Configure reading typography and scale for conversations and session logs.
          </p>
        </div>
      </div>
      <div className="settings-card-body">
        <div className="settings-row text-size-row">
          <div>
            <span className="settings-label" style={{ fontWeight: 600, color: 'var(--kem)' }}>
              Text size
            </span>
            <div className="settings-dim" style={{ marginTop: 4 }}>
              Saved on this device
            </div>
          </div>
          <div className="text-size-options" role="radiogroup" aria-label="Text size">
            <button
              type="button"
              className={`text-size-btn ${size === 'large' ? 'active' : ''}`}
              onClick={() => handleChange('large')}
              aria-checked={size === 'large'}
              role="radio"
            >
              {size === 'large' && <Check size={14} weight="bold" className="text-size-check" />}
              <span>Large (Default)</span>
            </button>
            <button
              type="button"
              className={`text-size-btn ${size === 'medium' ? 'active' : ''}`}
              onClick={() => handleChange('medium')}
              aria-checked={size === 'medium'}
              role="radio"
            >
              {size === 'medium' && <Check size={14} weight="bold" className="text-size-check" />}
              <span>Medium (Compact)</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
