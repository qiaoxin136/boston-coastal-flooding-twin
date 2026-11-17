import React, { useState } from 'react';
import { SCENARIO_OPTIONS } from '../config/floodConfig';
import type { MapCredentials } from '../types/flood';

interface CredentialsModalProps {
  credentials: MapCredentials;
  onSave: (next: MapCredentials) => void;
  onClose: () => void;
}

export const CredentialsModal: React.FC<CredentialsModalProps> = ({
  credentials,
  onSave,
  onClose,
}) => {
  const isPresetInitial = SCENARIO_OPTIONS.some(
    (s) => s.tilesetId === credentials.tilesetId
  );
  const [useCustomTileset, setUseCustomTileset] = useState(!isPresetInitial);
  const [tilesetId, setTilesetId] = useState(credentials.tilesetId);
  const [googleKey, setGoogleKey] = useState(credentials.googleMapsApiKey);
  const [mapboxToken, setMapboxToken] = useState(credentials.mapboxAccessToken);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      tilesetId: tilesetId.trim(),
      googleMapsApiKey: googleKey.trim(),
      mapboxAccessToken: mapboxToken.trim(),
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title">
      <form className="modal-card" onSubmit={handleSubmit}>
        <div className="modal-header">
          <div>
            <div className="dock-kicker">SCENARIO &amp; CREDENTIALS</div>
            <h2 id="settings-modal-title" className="modal-title">
              Storm Scenario &amp; API Keys
            </h2>
          </div>
          <button type="button" className="collapse-btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="modal-body">
          <div className="field-group">
            <label htmlFor="preset-scenario">Boston Storm Scenario</label>
            <select
              id="preset-scenario"
              value={useCustomTileset ? 'custom' : tilesetId}
              onChange={(e) => {
                if (e.target.value === 'custom') {
                  setUseCustomTileset(true);
                  setTilesetId('');
                } else {
                  setUseCustomTileset(false);
                  setTilesetId(e.target.value);
                }
              }}
            >
              {SCENARIO_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.tilesetId}>
                  {opt.label}
                </option>
              ))}
              <option value="custom">Custom Mapbox Tileset</option>
            </select>
          </div>

          {useCustomTileset && (
            <div className="field-group">
              <label htmlFor="tileset-id-input">Custom Tileset ID</label>
              <input
                id="tileset-id-input"
                type="text"
                value={tilesetId}
                onChange={(e) => setTilesetId(e.target.value)}
                placeholder="username.tileset_id"
                required
              />
            </div>
          )}

          <div className="field-group">
            <label htmlFor="google-key-input">
              Google Maps API Key (Photorealistic 3D Tiles)
            </label>
            <input
              id="google-key-input"
              type="password"
              value={googleKey}
              onChange={(e) => setGoogleKey(e.target.value)}
              placeholder="AIza..."
              required
            />
          </div>

          <div className="field-group">
            <label htmlFor="mapbox-token-input">Mapbox Access Token</label>
            <input
              id="mapbox-token-input"
              type="password"
              value={mapboxToken}
              onChange={(e) => setMapboxToken(e.target.value)}
              placeholder="pk.eyJ1..."
              required
            />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="utility-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn">
            Apply sources
          </button>
        </div>
      </form>
    </div>
  );
};
