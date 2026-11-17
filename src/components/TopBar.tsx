import React, { useEffect, useRef, useState } from 'react';
import type { AuthUserSession } from '../auth/cognitoAuth';
import type { CameraBookmark, ScenarioOption } from '../types/flood';

interface TopBarProps {
  bookmarks: CameraBookmark[];
  activeBookmarkId: string | null;
  onSelectBookmark: (bookmark: CameraBookmark) => void;
  activeScenario: ScenarioOption | undefined;
  tiles3dReady: boolean;
  mvtReady: boolean;
  currentZoom: number;
  isTopDown: boolean;
  onToggleTopDown: () => void;
  streetViewOpen: boolean;
  onToggleStreetView: () => void;
  onOpenSettings: () => void;
  authSession: AuthUserSession;
  onSignOut: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  bookmarks,
  activeBookmarkId,
  onSelectBookmark,
  activeScenario,
  tiles3dReady,
  mvtReady,
  currentZoom,
  isTopDown,
  onToggleTopDown,
  streetViewOpen,
  onToggleStreetView,
  onOpenSettings,
  authSession,
  onSignOut,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement>(null);

  const belowMinZoom = currentZoom < 13.9;
  const activeBookmark = bookmarks.find((b) => b.id === activeBookmarkId);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        menuWrapRef.current &&
        !menuWrapRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="hud-topbar">
      <div className="masthead-card">
        <div className="masthead-eyebrow">
          <span
            className={`status-dot ${tiles3dReady && mvtReady ? 'is-live' : 'is-loading'}`}
            aria-hidden="true"
          />
          <span>BOSTON COASTAL &amp; STORMWATER TWIN</span>
        </div>
        <div className="masthead-title-row">
          <h1 className="masthead-title">
            {activeScenario ? activeScenario.shortLabel : '500-Year Flood Inundation'}
          </h1>
          {belowMinZoom && (
            <span className="zoom-notice" role="status">
              Zoom 14+
            </span>
          )}
        </div>
      </div>

      <div className="nav-menu-anchor" ref={menuWrapRef}>
        <button
          type="button"
          className={`nav-trigger-btn ${menuOpen ? 'is-open' : ''}`}
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          {streetViewOpen && (
            <span
              className="nav-sv-indicator"
              title="Street View split-screen active"
              aria-hidden="true"
            />
          )}
          <span className="nav-trigger-label">
            {activeBookmark ? activeBookmark.name : 'Navigate'}
          </span>
          <span className="nav-trigger-caret" aria-hidden="true">
            ▾
          </span>
        </button>

        {menuOpen && (
          <div className="nav-popover" role="menu" aria-label="Navigation and view options">
            <div className="nav-popover-section-title">BOSTON VIEWPOINTS</div>
            <div className="nav-popover-list">
              {bookmarks.map((bm) => {
                const isActive = activeBookmarkId === bm.id;
                return (
                  <button
                    key={bm.id}
                    type="button"
                    role="menuitem"
                    className={`nav-popover-item ${isActive ? 'is-active' : ''}`}
                    onClick={() => {
                      onSelectBookmark(bm);
                      setMenuOpen(false);
                    }}
                  >
                    <div className="nav-item-main">
                      <span className="nav-item-title">{bm.name}</span>
                      <span className="nav-item-sub">{bm.subtitle}</span>
                    </div>
                    {isActive && (
                      <span className="nav-item-dot" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="nav-popover-divider" />

            <div className="nav-popover-section-title">VIEW &amp; DATA</div>
            <button
              type="button"
              role="menuitem"
              className={`nav-popover-action ${streetViewOpen ? 'is-active' : ''}`}
              onClick={() => {
                onToggleStreetView();
                setMenuOpen(false);
              }}
            >
              <span>Google Street View</span>
              <span className="nav-action-tag">
                {streetViewOpen ? 'Split ON' : 'Right Half'}
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              className="nav-popover-action"
              onClick={() => {
                onToggleTopDown();
                setMenuOpen(false);
              }}
            >
              <span>{isTopDown ? 'Switch to 3D Orbit View' : 'Switch to 2D Plan View'}</span>
              <span className="nav-action-tag">{isTopDown ? '60°' : '0°'}</span>
            </button>

            <button
              type="button"
              role="menuitem"
              className="nav-popover-action"
              onClick={() => {
                onOpenSettings();
                setMenuOpen(false);
              }}
            >
              <span>Scenario &amp; API Keys</span>
              <span className="nav-action-tag">Configure</span>
            </button>

            <div className="nav-popover-divider" />

            <div className="nav-popover-section-title">ACCOUNT</div>
            <div className="nav-account-row">
              <span className="nav-account-email" title={authSession.email}>
                {authSession.email}
              </span>
              <span className="nav-action-tag">
                {authSession.mode === 'cognito' ? 'Active' : 'Preview'}
              </span>
            </div>
            <button
              type="button"
              role="menuitem"
              className="nav-popover-action"
              onClick={() => {
                setMenuOpen(false);
                onSignOut();
              }}
            >
              <span>
                {authSession.mode === 'cognito' ? 'Sign out' : 'Sign in'}
              </span>
              <span className="nav-action-tag">Exit</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
