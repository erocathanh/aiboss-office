'use client';

import { useState, useEffect } from 'react';
import { Desktop } from '@phosphor-icons/react';

interface DesktopState {
  detected: boolean;
  startAtLogin: boolean;
  version?: string;
  port?: number;
}

export function DesktopSettingsCard() {
  const [state, setState] = useState<DesktopState>({
    detected: false,
    startAtLogin: false,
  });

  useEffect(() => {
    let isMounted = true;

    async function checkDesktop() {
      // 1. Direct Electron bridge check
      const electronBridge = (window as unknown as {
        aibossDesktop?: {
          isElectron?: boolean;
          version?: string;
          getStatus?: () => Promise<{ isElectron: boolean; startAtLogin: boolean; port: number }>;
          getLoginItemSettings?: () => Promise<{ openAtLogin: boolean }>;
        };
      }).aibossDesktop;

      if (electronBridge?.isElectron) {
        let startAtLogin = false;
        let port = 4330;
        try {
          if (electronBridge.getStatus) {
            const status = await electronBridge.getStatus();
            startAtLogin = !!status.startAtLogin;
            port = status.port || 4330;
          } else if (electronBridge.getLoginItemSettings) {
            const item = await electronBridge.getLoginItemSettings();
            startAtLogin = !!item.openAtLogin;
          }
        } catch {
          // ignore
        }

        if (isMounted) {
          setState({
            detected: true,
            startAtLogin,
            version: electronBridge.version || '0.1.0',
            port,
          });
        }
        return;
      }

      // 2. Fallback to API route if backend provides /api/desktop/status
      try {
        const res = await fetch('/api/desktop/status');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setState({
              detected: !!data.running,
              startAtLogin: !!data.startAtLogin,
              version: data.version,
              port: data.port,
            });
          }
          return;
        }
      } catch {
        // Not running or endpoint not present
      }

      if (isMounted) {
        setState({
          detected: false,
          startAtLogin: false,
        });
      }
    }

    checkDesktop();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <section className="settings-card">
      <div className="settings-card-header">
        <Desktop size={20} weight="bold" className="settings-card-icon" />
        <div>
          <h2>Desktop</h2>
          <p className="settings-card-subtitle">
            Native desktop shell, system tray, and OS sleep prevention status.
          </p>
        </div>
      </div>
      <div className="settings-card-body">
        <div className="settings-row">
          <span className="settings-label">Desktop shell</span>
          <span className="settings-value">
            {state.detected ? (
              <span
                className="settings-tag"
                style={{
                  background: 'rgba(34, 197, 94, 0.15)',
                  color: '#4ade80',
                  borderColor: 'rgba(34, 197, 94, 0.3)',
                }}
              >
                running
              </span>
            ) : (
              <span
                className="settings-tag"
                style={{
                  background: 'rgba(148, 163, 184, 0.15)',
                  color: '#94a3b8',
                  borderColor: 'rgba(148, 163, 184, 0.3)',
                }}
              >
                not detected
              </span>
            )}
          </span>
        </div>

        <div className="settings-row">
          <span className="settings-label">Start at login</span>
          <span className="settings-value">
            {state.detected ? (
              <code>{state.startAtLogin ? 'on' : 'off'}</code>
            ) : (
              <span className="settings-dim">not detected</span>
            )}
          </span>
        </div>

        <div className="settings-row">
          <span className="settings-label">Mode</span>
          <span className="settings-value settings-dim">
            {state.detected ? 'Single instance · Tray active' : 'Browser session'}
          </span>
        </div>
      </div>
    </section>
  );
}
