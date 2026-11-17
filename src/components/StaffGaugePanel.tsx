import React, { useState } from 'react';
import { getActiveBands } from '../config/floodConfig';
import type { ColorRampMode, InspectedCell } from '../types/flood';

interface StaffGaugePanelProps {
  showFloodLayer: boolean;
  onToggleFloodLayer: (next: boolean) => void;
  opacity: number;
  onChangeOpacity: (next: number) => void;
  minDepthFt: number;
  onChangeMinDepthFt: (next: number) => void;
  showWireframe: boolean;
  onToggleWireframe: (next: boolean) => void;
  colorMode: ColorRampMode;
  onChangeColorMode: (next: ColorRampMode) => void;
  inspectedCell: InspectedCell | null;
  onClearPin: () => void;
}

const MAX_GAUGE_FT = 14;
const GAUGE_TICKS = [0, 1, 3, 6, 10, 14];

function depthToGaugePercent(depthFt: number): number {
  const clamped = Math.max(0, Math.min(MAX_GAUGE_FT, depthFt));
  return (clamped / MAX_GAUGE_FT) * 100;
}

export const StaffGaugePanel: React.FC<StaffGaugePanelProps> = ({
  showFloodLayer,
  onToggleFloodLayer,
  opacity,
  onChangeOpacity,
  minDepthFt,
  onChangeMinDepthFt,
  showWireframe,
  onToggleWireframe,
  colorMode,
  onChangeColorMode,
  inspectedCell,
  onClearPin,
}) => {
  const [collapsed, setCollapsed] = useState(true);
  const bands = getActiveBands(colorMode);
  const displayBands = [...bands].reverse();

  const pointerPct = inspectedCell
    ? depthToGaugePercent(inspectedCell.depthFt)
    : null;
  const cutoffPct = depthToGaugePercent(minDepthFt);

  return (
    <aside className={`hud-dock ${collapsed ? 'is-collapsed' : ''}`} aria-label="Hydrologic controls and flood depth staff gauge">
      <div className="dock-header">
        <div>
          <div className="dock-kicker">SURGE STAFF GAUGE</div>
          <div className="dock-subtitle">
            {collapsed && inspectedCell
              ? `${inspectedCell.depthFt.toFixed(2)} ft (${inspectedCell.depthM.toFixed(2)} m) · ${inspectedCell.band.label}`
              : 'Draped 2D Hydraulic Mesh (US ft)'}
          </div>
        </div>
        <button
          type="button"
          className="collapse-btn"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-expanded={!collapsed}
        >
          {collapsed ? 'Expand' : 'Hide'}
        </button>
      </div>

      {!collapsed && (
        <div className="dock-body">
          {/* Live Cell Readout / Datum Callout */}
          <div className={`datum-readout ${inspectedCell ? 'has-reading' : ''}`}>
            {inspectedCell ? (
              <>
                <div className="datum-top-row">
                  <span className="datum-tag">
                    {inspectedCell.pinned ? 'PINNED CELL BENCHMARK' : 'CELL MAXDEPTH'}
                  </span>
                  {inspectedCell.pinned && (
                    <button
                      type="button"
                      className="clear-pin-btn"
                      onClick={onClearPin}
                    >
                      Unpin
                    </button>
                  )}
                </div>
                <div className="datum-value-row">
                  <span className="datum-primary">
                    {inspectedCell.depthFt.toFixed(2)} <small>ft</small>
                  </span>
                  <span className="datum-secondary">
                    {inspectedCell.depthM.toFixed(2)} m
                  </span>
                  <span
                    className="datum-band-pill"
                    style={{ backgroundColor: inspectedCell.band.hex }}
                  >
                    {inspectedCell.band.label}
                  </span>
                </div>
                <p className="datum-impact">{inspectedCell.band.impact}</p>
                <div className="datum-coords">
                  {inspectedCell.latitude.toFixed(5)}°N,{' '}
                  {Math.abs(inspectedCell.longitude).toFixed(5)}°W
                </div>
              </>
            ) : (
              <div className="datum-empty">
                <span className="datum-tag">INTERACTIVE SOUNDING</span>
                <p>
                  Hover any flooded street cell to measure inundation depth, or click
                  a cell to pin its benchmark while orbiting in 3D.
                </p>
              </div>
            )}
          </div>

          {/* Physical Vertical Staff Gauge + Depth Bands */}
          <div className="staff-gauge-section">
            <div className="staff-ruler" aria-hidden="true">
              <div className="staff-ruler-track">
                {GAUGE_TICKS.map((ft) => (
                  <div
                    key={ft}
                    className="staff-tick"
                    style={{ bottom: `${depthToGaugePercent(ft)}%` }}
                  >
                    <span className="staff-tick-label">
                      {ft === 14 ? '14+' : `${ft}'`}
                    </span>
                    <span className="staff-tick-mark" />
                  </div>
                ))}

                {minDepthFt > 0 && (
                  <div
                    className="staff-cutoff-mask"
                    style={{ height: `${cutoffPct}%` }}
                    title={`Filtered below ${minDepthFt.toFixed(2)} ft`}
                  />
                )}

                {pointerPct !== null && (
                  <div
                    className="staff-needle"
                    style={{ bottom: `${pointerPct}%` }}
                  >
                    <span className="staff-needle-head" />
                  </div>
                )}
              </div>
            </div>

            <ul className="band-list">
              {displayBands.map((band) => {
                const isMatched = inspectedCell?.band.id === band.id;
                const isFilteredOut =
                  band.maxFt !== null && band.maxFt <= minDepthFt;
                return (
                  <li
                    key={band.id}
                    className={`band-item ${isMatched ? 'is-matched' : ''} ${
                      isFilteredOut ? 'is-muted' : ''
                    }`}
                  >
                    <span
                      className="band-swatch"
                      style={{ backgroundColor: band.hex }}
                    />
                    <div className="band-meta">
                      <span className="band-name">{band.label}</span>
                      <span className="band-range">{band.rangeText}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Layer Drape & Hydrologic Controls */}
          <div className="controls-group">
            <label className="toggle-row">
              <span className="control-label">Drape flood cells on ground</span>
              <input
                type="checkbox"
                checked={showFloodLayer}
                onChange={(e) => onToggleFloodLayer(e.target.checked)}
              />
            </label>

            <label className="toggle-row">
              <span className="control-label">2D computational mesh edges</span>
              <input
                type="checkbox"
                checked={showWireframe}
                disabled={!showFloodLayer}
                onChange={(e) => onToggleWireframe(e.target.checked)}
              />
            </label>

            <div className="slider-block">
              <div className="slider-header">
                <label htmlFor="opacity-slider" className="control-label">
                  Water surface opacity
                </label>
                <span className="slider-readout">{Math.round(opacity * 100)}%</span>
              </div>
              <input
                id="opacity-slider"
                type="range"
                min={0.15}
                max={1}
                step={0.05}
                disabled={!showFloodLayer}
                value={opacity}
                onChange={(e) => onChangeOpacity( parseFloat(e.target.value) )}
              />
            </div>

            <div className="slider-block">
              <div className="slider-header">
                <label htmlFor="cutoff-slider" className="control-label">
                  Minimum depth threshold
                </label>
                <span className="slider-readout">
                  {minDepthFt === 0 ? 'All depths' : `≥ ${minDepthFt.toFixed(2)} ft`}
                </span>
              </div>
              <input
                id="cutoff-slider"
                type="range"
                min={0}
                max={10}
                step={0.25}
                disabled={!showFloodLayer}
                value={minDepthFt}
                onChange={(e) => onChangeMinDepthFt(parseFloat(e.target.value))}
              />
            </div>

            <div className="segmented-block">
              <span className="control-label">Depth classification</span>
              <div className="segmented-control" role="group" aria-label="Depth color ramp">
                <button
                  type="button"
                  className={colorMode === 'surge-500yr' ? 'is-selected' : ''}
                  onClick={() => onChangeColorMode('surge-500yr')}
                >
                  500-Yr Surge (0–10+ ft)
                </button>
                <button
                  type="button"
                  className={colorMode === 'legacy-2024' ? 'is-selected' : ''}
                  onClick={() => onChangeColorMode('legacy-2024')}
                >
                  Legacy (0–2.5+ ft)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
