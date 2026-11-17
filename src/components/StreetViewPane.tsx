import React, { useCallback, useEffect, useRef, useState } from 'react';
import { classifyDepth } from '../config/floodConfig';
import type { ColorRampMode, StreetViewTarget } from '../types/flood';

// Minimal Google Maps Street View ambient types to avoid external @types bloat
interface GoogleLatLng {
  lat(): number;
  lng(): number;
}

interface GoogleStreetViewPov {
  heading: number;
  pitch: number;
}

interface GoogleMapsEventHandle {
  remove(): void;
}

interface GoogleStreetViewPanorama {
  getPosition(): GoogleLatLng | null;
  getPov(): GoogleStreetViewPov;
  setPosition(pos: { lat: number; lng: number } | GoogleLatLng): void;
  setPano(pano: string): void;
  setPov(pov: GoogleStreetViewPov): void;
  addListener(eventName: string, handler: () => void): GoogleMapsEventHandle;
}

interface GoogleStreetViewPanoramaData {
  location?: {
    pano?: string;
    latLng?: GoogleLatLng;
    description?: string;
  };
}

interface GoogleStreetViewService {
  getPanorama(request: {
    location: { lat: number; lng: number };
    radius: number;
    preference?: string;
    source?: string;
  }): Promise<{ data: GoogleStreetViewPanoramaData }>;
}

interface GoogleMapsNamespace {
  StreetViewPanorama: new (
    container: HTMLElement,
    opts?: Record<string, unknown>
  ) => GoogleStreetViewPanorama;
  StreetViewService: new () => GoogleStreetViewService;
  StreetViewPreference: { NEAREST: string; BEST: string };
  StreetViewSource: { OUTDOOR: string; DEFAULT: string };
  event: {
    trigger(instance: unknown, eventName: string): void;
  };
}

declare global {
  interface Window {
    google?: {
      maps?: GoogleMapsNamespace;
    };
    gm_authFailure?: () => void;
  }
}

const FEET_TO_METERS = 0.3048006096;

const BENCHMARKS = [
  { label: 'Curb (0.5 ft)', thresh: 0.5 },
  { label: 'Tire Hub (1.2 ft)', thresh: 1.15 },
  { label: 'Door Sill (1.5 ft)', thresh: 1.5 },
  { label: 'Car Hood (3.0 ft)', thresh: 3.0 },
  { label: '1st Floor (6.0 ft)', thresh: 6.0 },
  { label: 'Extreme (10.0 ft)', thresh: 10.0 },
];

function headingToCardinal(deg: number): string {
  const dirs = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
  ];
  const norm = ((deg % 360) + 360) % 360;
  return dirs[Math.round(norm / 22.5) % 16];
}

function approxDistMeters(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number
): number {
  const dLat = (lat2 - lat1) * 111132.92;
  const dLon =
    (lon2 - lon1) * 111412.84 * Math.cos(((lat1 + lat2) * 0.5 * Math.PI) / 180);
  return Math.hypot(dLon, dLat);
}

function isBostonTunnelPano(
  description: string | undefined,
  lat: number,
  lon: number
): boolean {
  if (!description) return false;
  const d = description.toLowerCase();
  if (d.includes('tunnel')) return true;
  // Sumner/Callahan Harbor Tunnel is labeled McClellan Hwy south of East Boston portal
  if (d.includes('mcclellan hwy') && lat < 42.3715) return true;
  // Big Dig I-93 Central Artery tunnel beneath Surface Rd / Atlantic Ave
  if (
    (d.includes('i-93') || d.includes('interstate 93')) &&
    lat > 42.348 &&
    lat < 42.3675
  ) {
    return true;
  }
  // I-90 Seaport / Ted Williams Tunnel beneath Fort Point & Boston Harbor
  if (
    (d.includes('i-90') || d.includes('turnpike')) &&
    lon > -71.058 &&
    lat < 42.368
  ) {
    return true;
  }
  return false;
}

let loadedSdkKey = '';
let sdkPromise: Promise<GoogleMapsNamespace> | null = null;

function loadGoogleMapsSdk(
  apiKey: string,
  onAuthFailure: () => void
): Promise<GoogleMapsNamespace> {
  if (
    window.google?.maps?.StreetViewPanorama &&
    loadedSdkKey === apiKey
  ) {
    return Promise.resolve(window.google.maps);
  }
  if (sdkPromise && loadedSdkKey === apiKey) {
    return sdkPromise;
  }

  loadedSdkKey = apiKey;
  sdkPromise = new Promise<GoogleMapsNamespace>((resolve, reject) => {
    window.gm_authFailure = () => {
      onAuthFailure();
    };

    const existing = document.getElementById('google-maps-sv-sdk');
    if (existing) {
      existing.remove();
    }

    const script = document.createElement('script');
    script.id = 'google-maps-sv-sdk';
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&v=weekly`;
    script.onload = () => {
      if (window.google?.maps?.StreetViewPanorama) {
        resolve(window.google.maps);
      } else {
        reject(new Error('Google Maps Street View SDK did not initialize.'));
      }
    };
    script.onerror = () => {
      reject(new Error('Failed to load Google Maps JavaScript SDK.'));
    };
    document.head.appendChild(script);
  });

  return sdkPromise;
}

interface StreetViewPaneProps {
  widthPercent: number;
  googleMapsApiKey: string;
  onUpdateGoogleKey: (nextKey: string) => void;
  target: StreetViewTarget;
  isMapMoving: boolean;
  followMapCamera: boolean;
  onToggleFollowMap: () => void;
  onPanoMove: (longitude: number, latitude: number) => void;
  onPanoPovChange: (heading: number, pitch: number) => void;
  onRoadSnap: (longitude: number, latitude: number) => void;
  streetDepthFt: number | null;
  minDepthFt: number;
  colorMode: ColorRampMode;
  scenarioTag: string;
  resizeToken: number;
  onClose: () => void;
}

export const StreetViewPane: React.FC<StreetViewPaneProps> = ({
  widthPercent,
  googleMapsApiKey,
  onUpdateGoogleKey,
  target,
  isMapMoving,
  followMapCamera,
  onToggleFollowMap,
  onPanoMove,
  onPanoPovChange,
  onRoadSnap,
  streetDepthFt,
  minDepthFt,
  colorMode,
  scenarioTag,
  resizeToken,
  onClose,
}) => {
  const [waterLineEnabled, setWaterLineEnabled] = useState(true);
  const [embedFallback, setEmbedFallback] = useState(false);
  const [embedSrc, setEmbedSrc] = useState('');
  const [streetAddress, setStreetAddress] = useState<string | null>(null);
  const [noCoverageNotice, setNoCoverageNotice] = useState<string | null>(null);
  const [inlineKeyInput, setInlineKeyInput] = useState('');

  const panoContainerRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<GoogleStreetViewPanorama | null>(null);
  const serviceRef = useRef<GoogleStreetViewService | null>(null);

  const syncingFromMapRef = useRef(false);
  const isMapMovingRef = useRef(isMapMoving);
  isMapMovingRef.current = isMapMoving;

  const targetRef = useRef(target);
  targetRef.current = target;

  const onPanoMoveRef = useRef(onPanoMove);
  onPanoMoveRef.current = onPanoMove;

  const onPanoPovChangeRef = useRef(onPanoPovChange);
  onPanoPovChangeRef.current = onPanoPovChange;

  const onRoadSnapRef = useRef(onRoadSnap);
  onRoadSnapRef.current = onRoadSnap;

  const lastQueriedRef = useRef<{ lon: number; lat: number }>({
    lon: -999,
    lat: -999,
  });
  const lastFetchMsRef = useRef(0);
  const reqSeqRef = useRef(0);
  const settleTimerRef = useRef<number | null>(null);
  const embedTimerRef = useRef<number | null>(null);

  const cleanKey = googleMapsApiKey.trim();
  const hasKey = Boolean(cleanKey);

  // Reset fallback if key changes
  useEffect(() => {
    setEmbedFallback(false);
    panoramaRef.current = null;
    serviceRef.current = null;
    lastQueriedRef.current = { lon: -999, lat: -999 };
  }, [cleanKey]);

  const snapToNearestRoadPano = useCallback(
    async (
      lon: number,
      lat: number,
      heading: number,
      pitch: number,
      snapMarkerToRoad: boolean
    ) => {
      const gmaps = window.google?.maps;
      const pano = panoramaRef.current;
      const svc = serviceRef.current;
      if (!gmaps || !pano || !svc) return;

      lastQueriedRef.current = { lon, lat };
      const seq = ++reqSeqRef.current;

      try {
        let res = await svc.getPanorama({
          location: { lat, lng: lon },
          radius: 260,
          preference: gmaps.StreetViewPreference.NEAREST,
          source: gmaps.StreetViewSource.OUTDOOR,
        });
        if (seq !== reqSeqRef.current) return;

        let loc = res?.data?.location;

        // Avoid snapping to underground Big Dig / Boston Harbor tunnels when surface streets are nearby
        if (
          loc?.latLng &&
          isBostonTunnelPano(
            loc.description,
            loc.latLng.lat(),
            loc.latLng.lng()
          )
        ) {
          const surfaceOffsets: Array<[number, number, number]> = [
            [-0.0011, -0.0004, 150],
            [0.0011, 0.0004, 150],
            [-0.0026, -0.0012, 220],
            [-0.0016, 0.0012, 180],
          ];
          for (const [dLon, dLat, rad] of surfaceOffsets) {
            try {
              const alt = await svc.getPanorama({
                location: { lat: lat + dLat, lng: lon + dLon },
                radius: rad,
                preference: gmaps.StreetViewPreference.NEAREST,
                source: gmaps.StreetViewSource.OUTDOOR,
              });
              if (seq !== reqSeqRef.current) return;
              const altLoc = alt?.data?.location;
              if (
                altLoc?.latLng &&
                !isBostonTunnelPano(
                  altLoc.description,
                  altLoc.latLng.lat(),
                  altLoc.latLng.lng()
                )
              ) {
                res = alt;
                loc = altLoc;
                break;
              }
            } catch {
              // Continue trying next surface offset
            }
          }
        }

        if (loc?.latLng) {
          setNoCoverageNotice(null);
          setStreetAddress(loc.description ?? null);

          syncingFromMapRef.current = true;
          if (loc.pano) {
            pano.setPano(loc.pano);
          } else {
            pano.setPosition(loc.latLng);
          }
          pano.setPov({ heading, pitch });
          syncingFromMapRef.current = false;

          if (snapMarkerToRoad && !isMapMovingRef.current) {
            onRoadSnapRef.current(loc.latLng.lng(), loc.latLng.lat());
          }
        }
      } catch {
        if (seq !== reqSeqRef.current) return;
        setNoCoverageNotice(
          'No outdoor Street View roadway coverage within 260 m of marker'
        );
      }
    },
    []
  );

  // Initialize Google StreetViewPanorama when API key is present
  useEffect(() => {
    let cancelled = false;
    if (!hasKey || embedFallback || !panoContainerRef.current) return;

    loadGoogleMapsSdk(cleanKey, () => {
      if (!cancelled) {
        setEmbedFallback(true);
      }
    })
      .then((gmaps) => {
        if (cancelled || !panoContainerRef.current) return;

        if (!serviceRef.current) {
          serviceRef.current = new gmaps.StreetViewService();
        }

        if (!panoramaRef.current) {
          const initial = targetRef.current;
          const pano = new gmaps.StreetViewPanorama(panoContainerRef.current, {
            position: { lat: initial.latitude, lng: initial.longitude },
            pov: { heading: initial.heading, pitch: initial.pitch },
            zoom: 0,
            addressControl: true,
            linksControl: true,
            panControl: true,
            enableCloseButton: false,
            fullscreenControl: false,
            motionTracking: false,
            showRoadLabels: true,
          });

          pano.addListener('position_changed', () => {
            if (syncingFromMapRef.current || isMapMovingRef.current) return;
            const pos = pano.getPosition();
            if (!pos) return;
            onPanoMoveRef.current(pos.lng(), pos.lat());
          });

          pano.addListener('pov_changed', () => {
            if (syncingFromMapRef.current || isMapMovingRef.current) return;
            const pov = pano.getPov();
            if (!pov) return;
            onPanoPovChangeRef.current(pov.heading || 0, pov.pitch || 0);
          });

          panoramaRef.current = pano;

          void snapToNearestRoadPano(
            initial.longitude,
            initial.latitude,
            initial.heading,
            initial.pitch,
            true
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEmbedFallback(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cleanKey, embedFallback, hasKey, snapToNearestRoadPano]);

  // Sync target position & POV from left 3D map
  useEffect(() => {
    if (!hasKey) return;

    const normHeading = Math.round(((target.heading % 360) + 360) % 360);

    if (embedFallback) {
      if (embedTimerRef.current) {
        window.clearTimeout(embedTimerRef.current);
      }
      embedTimerRef.current = window.setTimeout(
        () => {
          const nextUrl =
            `https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(
              cleanKey
            )}` +
            `&location=${target.latitude.toFixed(6)},${target.longitude.toFixed(6)}` +
            `&heading=${normHeading}&pitch=${Math.round(target.pitch)}&fov=80`;
          setEmbedSrc((prev) => (prev === nextUrl ? prev : nextUrl));
        },
        isMapMoving ? 280 : 65
      );
      return;
    }

    const pano = panoramaRef.current;
    if (!pano) return;

    // 1. Instant 60-fps client-side POV rotation sync
    syncingFromMapRef.current = true;
    pano.setPov({ heading: target.heading, pitch: target.pitch });
    syncingFromMapRef.current = false;

    // 2. Throttled roadway panorama snap during pan + exact snap when camera settles
    const movedMeters = approxDistMeters(
      lastQueriedRef.current.lon,
      lastQueriedRef.current.lat,
      target.longitude,
      target.latitude
    );
    const now = performance.now();

    if (!isMapMoving) {
      if (settleTimerRef.current) {
        window.clearTimeout(settleTimerRef.current);
      }
      if (movedMeters >= 3.0) {
        lastFetchMsRef.current = now;
        void snapToNearestRoadPano(
          target.longitude,
          target.latitude,
          target.heading,
          target.pitch,
          true
        );
      }
    } else if (movedMeters >= 7.5 && now - lastFetchMsRef.current >= 240) {
      lastFetchMsRef.current = now;
      void snapToNearestRoadPano(
        target.longitude,
        target.latitude,
        target.heading,
        target.pitch,
        false
      );
    } else {
      if (settleTimerRef.current) {
        window.clearTimeout(settleTimerRef.current);
      }
      settleTimerRef.current = window.setTimeout(() => {
        const latest = targetRef.current;
        if (
          approxDistMeters(
            lastQueriedRef.current.lon,
            lastQueriedRef.current.lat,
            latest.longitude,
            latest.latitude
          ) >= 3.5
        ) {
          lastFetchMsRef.current = performance.now();
          void snapToNearestRoadPano(
            latest.longitude,
            latest.latitude,
            latest.heading,
            latest.pitch,
            !isMapMovingRef.current
          );
        }
      }, 240);
    }
  }, [
    cleanKey,
    embedFallback,
    hasKey,
    isMapMoving,
    snapToNearestRoadPano,
    target.heading,
    target.latitude,
    target.longitude,
    target.pitch,
  ]);

  // Trigger panorama resize when split divider drags or pane opens
  useEffect(() => {
    const pano = panoramaRef.current;
    if (pano && window.google?.maps?.event) {
      window.google.maps.event.trigger(pano, 'resize');
    }
  }, [resizeToken, widthPercent]);

  const normHead = Math.round(((target.heading % 360) + 360) % 360);
  const cardinal = headingToCardinal(normHead);
  const coordLabel = `${target.latitude.toFixed(4)}°N, ${Math.abs(
    target.longitude
  ).toFixed(4)}°W`;

  const externalSvUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${target.latitude.toFixed(
    6
  )},${target.longitude.toFixed(6)}&heading=${normHead}&pitch=${Math.round(
    target.pitch
  )}&fov=80`;

  const rawDepthFt =
    typeof streetDepthFt === 'number' && Number.isFinite(streetDepthFt)
      ? streetDepthFt
      : 0;
  const isWet = rawDepthFt > 0 && rawDepthFt >= minDepthFt;
  const activeBand = isWet ? classifyDepth(rawDepthFt, colorMode) : null;
  const inches = (rawDepthFt * 12).toFixed(1);
  const meters = (rawDepthFt * FEET_TO_METERS).toFixed(2);

  // Calibrated perspective water-line height for ~8.2 ft Street View roof camera
  const depthRatio = Math.min(1.0, Math.sqrt(Math.max(0, rawDepthFt) / 8.2));
  const basePct = 9 + depthRatio * 52;
  const pitchShift = -target.pitch * 0.65;
  const waterHeightPct = Math.max(4, Math.min(88, basePct + pitchShift));

  const showLiveViewport = hasKey;
  const showWaterOverlay = waterLineEnabled && showLiveViewport && isWet;

  return (
    <section
      className="sv-pane"
      style={{ flex: `0 0 ${widthPercent.toFixed(1)}%` }}
      aria-label="Google Street View side-by-side"
    >
      <header className="sv-topbar">
        <div className="sv-title-group">
          <span className="sv-badge">STREET VIEW</span>
          <span className="sv-heading-readout">
            {streetAddress
              ? `${normHead}° ${cardinal} · ${streetAddress}`
              : `${coordLabel} · ${normHead}° ${cardinal}`}
          </span>
        </div>

        <div className="sv-toolbar">
          <button
            type="button"
            className={`sv-tool-btn ${followMapCamera ? 'is-active' : ''}`}
            aria-pressed={followMapCamera}
            title="Automatically sync Street View position and heading as you pan or rotate the left 3D map"
            onClick={onToggleFollowMap}
          >
            Sync Move
          </button>

          <button
            type="button"
            className={`sv-tool-btn ${waterLineEnabled ? 'is-active' : ''}`}
            aria-pressed={waterLineEnabled}
            title="Toggle simulated flood water level overlay inside Street View"
            onClick={() => setWaterLineEnabled((prev) => !prev)}
          >
            Water Line
          </button>

          <a
            className="sv-tool-btn"
            href={externalSvUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open this exact Street View angle in a new Google Maps tab"
          >
            Pop Out ↗
          </a>

          <button
            type="button"
            className="sv-close-btn"
            title="Close Street View pane"
            aria-label="Close Street View pane"
            onClick={onClose}
          >
            ×
          </button>
        </div>
      </header>

      <div className="sv-viewport">
        <div
          ref={panoContainerRef}
          className="sv-pano-canvas"
          hidden={!hasKey || embedFallback}
        />

        {hasKey && embedFallback && embedSrc && (
          <iframe
            className="sv-embed-frame"
            title="Google Street View Embed"
            src={embedSrc}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        )}

        {showWaterOverlay && (
          <div
            className="sv-water-overlay"
            style={{ height: `${waterHeightPct.toFixed(1)}%` }}
          >
            <div className="sv-water-crest-line">
              <span className="sv-water-crest-tag">
                {`${scenarioTag.toUpperCase()} CREST · ${rawDepthFt.toFixed(
                  2
                )} ft (${inches} in)`}
              </span>
            </div>
          </div>
        )}

        {!hasKey && (
          <div className="sv-standby">
            <div className="sv-standby-inner">
              <div className="sv-standby-eyebrow">
                SYNCHRONIZED STREET-LEVEL GAGE
              </div>
              <h3 className="sv-standby-title">
                {`${target.latitude.toFixed(5)}°N, ${Math.abs(
                  target.longitude
                ).toFixed(5)}°W · Heading ${normHead}° ${cardinal}`}
              </h3>
              <p className="sv-standby-copy">
                Pan, zoom, or rotate the left 3D map and this pane tracks the
                STREET VIEW marker in real time. Paste a Google Maps API key
                below to render live 360° Street View.
              </p>

              <div className="sv-scale-card">
                <div className="sv-scale-header">
                  <span>Roadway flood depth</span>
                  <strong>
                    {isWet
                      ? `${rawDepthFt.toFixed(2)} ft (${inches} in)`
                      : '0.00 ft (Dry)'}
                  </strong>
                </div>
                <div className="sv-scale-benchmarks">
                  {BENCHMARKS.map((b) => (
                    <div
                      key={b.label}
                      className={`sv-bench ${
                        rawDepthFt >= b.thresh ? 'is-submerged' : ''
                      }`}
                    >
                      <span className="sv-bench-bar" />
                      <span>{b.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="sv-inline-key">
                <input
                  type="password"
                  placeholder="Paste Google Maps API Key (AIzaSy...)"
                  value={inlineKeyInput}
                  onChange={(e) => setInlineKeyInput(e.target.value)}
                />
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => {
                    if (inlineKeyInput.trim()) {
                      onUpdateGoogleKey(inlineKeyInput.trim());
                      setInlineKeyInput('');
                    }
                  }}
                >
                  Activate 3D + Street View
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="sv-footer">
        <div
          className="sv-swatch"
          style={{
            backgroundColor: activeBand ? activeBand.hex : 'var(--chart-slate)',
          }}
        />
        <div className="sv-footer-meta">
          <div className="sv-footer-depth">
            {isWet
              ? `${scenarioTag} Street Depth: ${rawDepthFt.toFixed(
                  2
                )} ft (${inches} in · ${meters} m)`
              : rawDepthFt > 0
                ? `Below cutoff (${rawDepthFt.toFixed(2)} ft raw mesh)`
                : 'Dry pavement (0.00 ft outside flood mesh)'}
          </div>
          <div className="sv-footer-stage">
            {noCoverageNotice
              ? noCoverageNotice
              : activeBand
                ? `${activeBand.label} — ${activeBand.impact} · Synchronized with 3D mesh`
                : 'Click any flooded street on the left 3D map to inspect'}
          </div>
        </div>
      </footer>
    </section>
  );
};
