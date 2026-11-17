import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import type { DeckGLRef } from '@deck.gl/react';
import { FlyToInterpolator, MapView, TerrainController } from '@deck.gl/core';
import type { MapViewState, PickingInfo } from '@deck.gl/core';
import { MVTLayer, Tile3DLayer } from '@deck.gl/geo-layers';
import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { _TerrainExtension as TerrainExtension } from '@deck.gl/extensions';
import type { TerrainExtensionProps } from '@deck.gl/extensions';
import type { Tile3D } from '@loaders.gl/tiles';
import type { Feature, Geometry } from 'geojson';

import {
  isCognitoConfigured,
  loadCognitoConfig,
  restoreCognitoSession,
  signOutCognito,
} from './auth/cognitoAuth';
import type { AuthUserSession, CognitoSpaConfig } from './auth/cognitoAuth';
import {
  CAMERA_BOOKMARKS,
  DEFAULT_CREDENTIALS,
  GOOGLE_3D_TILES_ROOT_URL,
  SCENARIO_OPTIONS,
  buildMapboxTileJsonUrl,
  classifyDepth,
  getFloodFillColor,
} from './config/floodConfig';
import { CognitoAuthGate } from './components/CognitoAuthGate';
import { TopBar } from './components/TopBar';
import { StaffGaugePanel } from './components/StaffGaugePanel';
import { CredentialsModal } from './components/CredentialsModal';
import { StreetViewPane } from './components/StreetViewPane';
import type {
  CameraBookmark,
  ColorRampMode,
  FloodCellProperties,
  InspectedCell,
  MapCredentials,
  StreetViewTarget,
} from './types/flood';

const INITIAL_BOOKMARK = CAMERA_BOOKMARKS[0];
const FEET_TO_METERS = 0.3048006096;

interface SvBeaconDatum {
  position: [number, number];
  label: string;
}

interface BinaryPolygonData {
  positions?: { value: ArrayLike<number>; size?: number };
  polygonIndices?: { value: ArrayLike<number> };
  primitivePolygonIndices?: { value: ArrayLike<number> };
  featureIds?: { value: ArrayLike<number> };
  numericProps?: Record<string, { value: ArrayLike<number> }>;
  properties?: Array<Record<string, unknown>>;
}

interface LoadedMvtTile {
  id: string;
  index: { x: number; y: number; z: number };
  bbox?: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
  content?: {
    polygons?: BinaryPolygonData;
  } | null;
}

function ringContainsBinary(
  px: number,
  py: number,
  pos: ArrayLike<number>,
  stride: number,
  vStart: number,
  vEnd: number
): boolean {
  if (vEnd - vStart < 3) return false;
  let inside = false;
  for (let i = vStart, j = vEnd - 1; i < vEnd; j = i++) {
    const xi = pos[i * stride];
    const yi = pos[i * stride + 1];
    const xj = pos[j * stride];
    const yj = pos[j * stride + 1];
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function lookupBinaryTileDepth(
  tile: LoadedMvtTile,
  lon: number,
  lat: number
): number | null {
  if (!tile.index) return null;
  const { x: tileX, y: tileY, z } = tile.index;
  const n = Math.pow(2, z);
  const localX = ((lon + 180) / 360) * n - tileX;
  const latRad = (lat * Math.PI) / 180;
  const localY =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      n -
    tileY;

  if (localX < 0 || localX > 1 || localY < 0 || localY > 1) {
    return null;
  }

  if (!tile.content) return null;
  const polys = tile.content.polygons;
  const pos = polys?.positions?.value;
  const polyIdx = polys?.polygonIndices?.value;
  const ringIdx = polys?.primitivePolygonIndices?.value;
  if (!polys || !pos || !polyIdx || !ringIdx || polyIdx.length < 2) {
    return 0;
  }

  const stride = polys.positions?.size ?? 2;
  const maxDepthNumeric = polys.numericProps?.MAXDEPTH?.value;
  const featIds = polys.featureIds?.value;
  const propsArr = polys.properties;

  let ringPtr = 0;
  const numRings = ringIdx.length - 1;

  for (let p = 0; p < polyIdx.length - 1; p++) {
    const pStart = polyIdx[p];
    const pEnd = polyIdx[p + 1];
    if (pEnd <= pStart) continue;

    while (ringPtr < numRings && ringIdx[ringPtr] < pStart) {
      ringPtr++;
    }
    if (ringPtr >= numRings || ringIdx[ringPtr] >= pEnd) continue;

    if (
      !ringContainsBinary(
        localX,
        localY,
        pos,
        stride,
        ringIdx[ringPtr],
        ringIdx[ringPtr + 1]
      )
    ) {
      continue;
    }

    let inHole = false;
    let hPtr = ringPtr + 1;
    while (hPtr < numRings && ringIdx[hPtr] < pEnd) {
      if (
        ringContainsBinary(
          localX,
          localY,
          pos,
          stride,
          ringIdx[hPtr],
          ringIdx[hPtr + 1]
        )
      ) {
        inHole = true;
        break;
      }
      hPtr++;
    }
    if (inHole) continue;

    if (maxDepthNumeric && pStart < maxDepthNumeric.length) {
      const val = maxDepthNumeric[pStart];
      if (typeof val === 'number' && Number.isFinite(val)) return val;
    }
    if (featIds && propsArr && pStart < featIds.length) {
      const fIdx = featIds[pStart];
      const val = propsArr[fIdx]?.MAXDEPTH;
      if (typeof val === 'number' && Number.isFinite(val)) return val;
    }
    return 0;
  }

  return 0;
}

function normHeading(bearing: number): number {
  return ((bearing % 360) + 360) % 360;
}

function deckPitchToStreetPitch(deckPitch: number): number {
  if (deckPitch <= 60) return -2;
  return Math.max(-12, Math.min(12, -2 + (deckPitch - 60) * 0.36));
}

export const App: React.FC = () => {
  const [cognitoConfig] = useState<CognitoSpaConfig>(() =>
    loadCognitoConfig()
  );
  const [authSession, setAuthSession] = useState<AuthUserSession | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(() =>
    isCognitoConfigured(loadCognitoConfig())
  );

  const [credentials, setCredentials] =
    useState<MapCredentials>(DEFAULT_CREDENTIALS);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [viewState, setViewState] = useState<MapViewState>({
    latitude: INITIAL_BOOKMARK.latitude,
    longitude: INITIAL_BOOKMARK.longitude,
    zoom: INITIAL_BOOKMARK.zoom,
    pitch: INITIAL_BOOKMARK.pitch,
    bearing: INITIAL_BOOKMARK.bearing,
    maxPitch: 88,
    minZoom: 11,
    maxZoom: 24,
  });

  const [activeBookmarkId, setActiveBookmarkId] = useState<string | null>(
    INITIAL_BOOKMARK.id
  );
  const [showFloodLayer, setShowFloodLayer] = useState(true);
  const [showWireframe, setShowWireframe] = useState(true);
  const [opacity, setOpacity] = useState(0.78);
  const [minDepthFt, setMinDepthFt] = useState(0);
  const [colorMode, setColorMode] = useState<ColorRampMode>('surge-500yr');

  const [hoveredCell, setHoveredCell] = useState<InspectedCell | null>(null);
  const [pinnedCell, setPinnedCell] = useState<InspectedCell | null>(null);
  const [cursorCoords, setCursorCoords] = useState<[number, number] | null>(
    null
  );

  const [tiles3dReady, setTiles3dReady] = useState(false);
  const [mvtReady, setMvtReady] = useState(false);
  const [tileError, setTileError] = useState<string | null>(null);

  // Side-by-side Google Street View state (closed by default, right 50% when open)
  const deckRef = useRef<DeckGLRef>(null);
  const splitStageRef = useRef<HTMLDivElement>(null);
  const loadedMvtTilesRef = useRef<Map<string, LoadedMvtTile>>(new Map());
  const [mvtTileTick, setMvtTileTick] = useState(0);
  const [streetViewOpen, setStreetViewOpen] = useState(false);
  const [svWidthPct, setSvWidthPct] = useState(50);
  const [isResizingSplit, setIsResizingSplit] = useState(false);
  const [svResizeToken, setSvResizeToken] = useState(0);
  const [followMapCamera, setFollowMapCamera] = useState(true);
  const [isMapMoving, setIsMapMoving] = useState(false);
  const [svTarget, setSvTarget] = useState<StreetViewTarget>(() => ({
    longitude: INITIAL_BOOKMARK.longitude,
    latitude: INITIAL_BOOKMARK.latitude,
    heading: normHeading(INITIAL_BOOKMARK.bearing),
    pitch: deckPitchToStreetPitch(INITIAL_BOOKMARK.pitch),
  }));
  const [svDepthFt, setSvDepthFt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isCognitoConfigured(cognitoConfig)) {
      setAuthChecking(false);
      return;
    }
    setAuthChecking(true);
    restoreCognitoSession(cognitoConfig)
      .then((restored) => {
        if (!cancelled && restored) {
          setAuthSession(restored);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAuthChecking(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cognitoConfig]);

  const handleSignOut = useCallback(async () => {
    const mode = authSession?.mode ?? 'local-preview';
    try {
      await signOutCognito(mode);
    } finally {
      setAuthSession(null);
    }
  }, [authSession]);

  const activeScenario = useMemo(
    () =>
      SCENARIO_OPTIONS.find((s) => s.tilesetId === credentials.tilesetId),
    [credentials.tilesetId]
  );

  const handleSelectBookmark = useCallback((bm: CameraBookmark) => {
    setActiveBookmarkId(bm.id);
    setViewState((prev) => ({
      ...prev,
      latitude: bm.latitude,
      longitude: bm.longitude,
      zoom: bm.zoom,
      pitch: bm.pitch,
      bearing: bm.bearing,
      transitionDuration: 1600,
      transitionInterpolator: new FlyToInterpolator({ speed: 1.4 }),
    }));
  }, []);

  const isTopDown = (viewState.pitch ?? 0) < 8;

  const handleToggleTopDown = useCallback(() => {
    setViewState((prev) => ({
      ...prev,
      pitch: (prev.pitch ?? 0) < 8 ? 60 : 0,
      transitionDuration: 700,
      transitionInterpolator: new FlyToInterpolator(),
    }));
  }, []);

  const handleToggleStreetView = useCallback(() => {
    setStreetViewOpen((prev) => {
      const next = !prev;
      if (next) {
        setSvTarget({
          longitude: viewState.longitude,
          latitude: viewState.latitude,
          heading: normHeading(viewState.bearing ?? 0),
          pitch: deckPitchToStreetPitch(viewState.pitch ?? 60),
        });
        window.setTimeout(() => {
          setSvResizeToken((t) => t + 1);
        }, 120);
      }
      return next;
    });
  }, [viewState.bearing, viewState.latitude, viewState.longitude, viewState.pitch]);

  // Draggable split-screen divider between 3D Map and Street View (26% - 74%)
  useEffect(() => {
    if (!isResizingSplit) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!splitStageRef.current) return;
      const rect = splitStageRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const leftPct = ((e.clientX - rect.left) / rect.width) * 100;
      const clampedLeft = Math.max(26, Math.min(74, leftPct));
      setSvWidthPct(100 - clampedLeft);
    };

    const stopResize = () => {
      setIsResizingSplit(false);
      setSvResizeToken((t) => t + 1);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
    };
  }, [isResizingSplit]);

  // Sample exact flood mesh MAXDEPTH from binary MVT buffers under the Street View camera coordinate
  const sampleStreetDepth = useCallback((lon: number, lat: number) => {
    const matchingTiles = Array.from(loadedMvtTilesRef.current.values())
      .filter((t) => {
        const b = t.bbox;
        return (
          b &&
          lon >= b.west &&
          lon <= b.east &&
          lat >= b.south &&
          lat <= b.north
        );
      })
      .sort((a, b) => (b.index?.z ?? 0) - (a.index?.z ?? 0));

    for (const tile of matchingTiles) {
      const depth = lookupBinaryTileDepth(tile, lon, lat);
      if (depth !== null) {
        setSvDepthFt(depth);
        return;
      }
    }
  }, []);

  useEffect(() => {
    loadedMvtTilesRef.current.clear();
  }, [credentials.tilesetId, credentials.mapboxAccessToken]);

  useEffect(() => {
    if (!streetViewOpen) return;
    const t1 = window.setTimeout(
      () => sampleStreetDepth(svTarget.longitude, svTarget.latitude),
      isMapMoving ? 120 : 40
    );
    return () => {
      window.clearTimeout(t1);
    };
  }, [
    isMapMoving,
    mvtReady,
    mvtTileTick,
    sampleStreetDepth,
    streetViewOpen,
    svTarget.latitude,
    svTarget.longitude,
  ]);

  const extractCellFromPick = useCallback(
    (info: PickingInfo, pinned: boolean): InspectedCell | null => {
      const feature = info.object as
        | Feature<Geometry, FloodCellProperties>
        | undefined;
      const rawDepth = feature?.properties?.MAXDEPTH;
      if (typeof rawDepth !== 'number' || !Number.isFinite(rawDepth)) {
        return null;
      }
      if (rawDepth < minDepthFt) {
        return null;
      }
      const coord = info.coordinate;
      const lon = coord ? coord[0] : viewState.longitude;
      const lat = coord ? coord[1] : viewState.latitude;
      return {
        depthFt: rawDepth,
        depthM: rawDepth * FEET_TO_METERS,
        longitude: lon,
        latitude: lat,
        band: classifyDepth(rawDepth, colorMode),
        pinned,
      };
    },
    [colorMode, minDepthFt, viewState.latitude, viewState.longitude]
  );

  const handleHover = useCallback(
    (info: PickingInfo) => {
      if (info.coordinate && info.coordinate.length >= 2) {
        setCursorCoords([info.coordinate[0], info.coordinate[1]]);
      }
      if (info.layer?.id === 'boston-500yr-flood' && info.picked) {
        const cell = extractCellFromPick(info, false);
        setHoveredCell(cell);
      } else {
        setHoveredCell(null);
      }
    },
    [extractCellFromPick]
  );

  const handleClick = useCallback(
    (info: PickingInfo) => {
      const clickedCoord =
        info.coordinate && info.coordinate.length >= 2
          ? ([info.coordinate[0], info.coordinate[1]] as [number, number])
          : null;

      if (streetViewOpen && clickedCoord) {
        setSvTarget((prev) => ({
          ...prev,
          longitude: clickedCoord[0],
          latitude: clickedCoord[1],
        }));
      }

      if (info.layer?.id === 'boston-500yr-flood' && info.picked) {
        const feature = info.object as
          | Feature<Geometry, FloodCellProperties>
          | undefined;
        const rawDepth = feature?.properties?.MAXDEPTH;
        if (
          streetViewOpen &&
          typeof rawDepth === 'number' &&
          Number.isFinite(rawDepth)
        ) {
          setSvDepthFt(rawDepth);
        }
        const cell = extractCellFromPick(info, true);
        if (cell) {
          setPinnedCell(cell);
          return;
        }
      } else if (streetViewOpen && clickedCoord) {
        setSvDepthFt(0);
      }
      setPinnedCell(null);
    },
    [extractCellFromPick, streetViewOpen]
  );

  const handlePanoMove = useCallback((longitude: number, latitude: number) => {
    setSvTarget((prev) => ({
      ...prev,
      longitude,
      latitude,
    }));
  }, []);

  const handlePanoPovChange = useCallback((heading: number, pitch: number) => {
    setSvTarget((prev) => ({
      ...prev,
      heading,
      pitch,
    }));
  }, []);

  const handleRoadSnap = useCallback((longitude: number, latitude: number) => {
    setSvTarget((prev) => ({
      ...prev,
      longitude,
      latitude,
    }));
  }, []);

  const mvtDataUrl = useMemo(
    () =>
      buildMapboxTileJsonUrl(
        credentials.tilesetId,
        credentials.mapboxAccessToken
      ),
    [credentials.tilesetId, credentials.mapboxAccessToken]
  );

  const baseLayers = useMemo(() => {
    const google3dLayer = new Tile3DLayer({
      id: 'google-3d-tiles',
      data: GOOGLE_3D_TILES_ROOT_URL,
      loadOptions: {
        fetch: {
          headers: {
            'X-GOOG-API-KEY': credentials.googleMapsApiKey,
          },
        },
      },
      operation: 'terrain+draw',
      pickable: true,
      onTilesetLoad: () => {
        setTiles3dReady(true);
        setTileError(null);
      },
      onTileError: (_tile: Tile3D, _url: string, message: string) => {
        if (!tiles3dReady) {
          setTileError(
            `Google 3D Tiles error: ${message}. Check your API key in Scenario & Keys.`
          );
        }
      },
    });

    const floodMvtLayer = new MVTLayer<
      FloodCellProperties,
      TerrainExtensionProps
    >({
      id: 'boston-500yr-flood',
      data: mvtDataUrl,
      minZoom: 14,
      maxZoom: 16,
      visible: showFloodLayer,
      pickable: true,
      autoHighlight: true,
      highlightColor: [217, 164, 65, 220],
      filled: true,
      stroked: showWireframe,
      lineWidthMinPixels: showWireframe ? 0.65 : 0,
      lineWidthMaxPixels: 1.5,
      getLineWidth: 0.25,
      getFillColor: (d) => {
        const feature = d as Feature<Geometry, FloodCellProperties>;
        return getFloodFillColor(
          feature?.properties?.MAXDEPTH,
          colorMode,
          opacity,
          minDepthFt
        );
      },
      getLineColor: (d) => {
        if (!showWireframe) return [0, 0, 0, 0];
        const feature = d as Feature<Geometry, FloodCellProperties>;
        const depth = feature?.properties?.MAXDEPTH ?? 0;
        if (depth < minDepthFt) return [0, 0, 0, 0];
        return [8, 34, 74, Math.round(opacity * 155)];
      },
      updateTriggers: {
        getFillColor: [colorMode, opacity, minDepthFt],
        getLineColor: [showWireframe, opacity, minDepthFt],
      },
      onDataLoad: (tilejson: unknown) => {
        if (tilejson) {
          setMvtReady(true);
        }
      },
      onTileLoad: (tile) => {
        const t = tile as unknown as LoadedMvtTile;
        if (t?.id) {
          loadedMvtTilesRef.current.set(t.id, t);
          setMvtTileTick((n) => n + 1);
        }
      },
      onTileUnload: (tile) => {
        const t = tile as unknown as LoadedMvtTile;
        if (t?.id) {
          loadedMvtTilesRef.current.delete(t.id);
        }
      },
      onTileError: (err) => {
        console.warn('MVT tile load warning:', err);
      },
      extensions: [new TerrainExtension()],
      terrainDrawMode: 'drape',
    });

    return [google3dLayer, floodMvtLayer];
  }, [
    credentials.googleMapsApiKey,
    mvtDataUrl,
    showFloodLayer,
    showWireframe,
    colorMode,
    opacity,
    minDepthFt,
    tiles3dReady,
  ]);

  // Street View point + STREET VIEW label on left 3D map (no FOV polygon, hidden when Street View closed)
  const svBeaconLayers = useMemo(() => {
    if (!streetViewOpen) return [];
    const data: SvBeaconDatum[] = [
      {
        position: [svTarget.longitude, svTarget.latitude],
        label: 'STREET VIEW',
      },
    ];

    const pointLayer = new ScatterplotLayer<
      SvBeaconDatum,
      TerrainExtensionProps
    >({
      id: 'street-view-beacon-point',
      data,
      pickable: false,
      billboard: true,
      radiusUnits: 'pixels',
      getRadius: 5.5,
      filled: true,
      getFillColor: [56, 189, 248, 255],
      stroked: true,
      lineWidthUnits: 'pixels',
      getLineWidth: 2.5,
      getLineColor: [11, 22, 34, 255],
      getPosition: (d) => d.position,
      parameters: { depthCompare: 'always' },
      extensions: [new TerrainExtension()],
      terrainDrawMode: 'offset',
    });

    const labelLayer = new TextLayer<SvBeaconDatum, TerrainExtensionProps>({
      id: 'street-view-beacon-label',
      data,
      pickable: false,
      billboard: true,
      getPosition: (d) => d.position,
      getText: (d) => d.label,
      getSize: 10.5,
      sizeUnits: 'pixels',
      fontFamily: "'Space Grotesk', system-ui, sans-serif",
      fontWeight: 700,
      getColor: [236, 243, 248, 255],
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'top',
      getPixelOffset: [0, 11],
      background: true,
      getBackgroundColor: [11, 22, 34, 228],
      getBorderColor: [56, 189, 248, 120],
      getBorderWidth: 1,
      backgroundPadding: [6, 3],
      parameters: { depthCompare: 'always' },
      extensions: [new TerrainExtension()],
      terrainDrawMode: 'offset',
    });

    return [pointLayer, labelLayer];
  }, [streetViewOpen, svTarget.latitude, svTarget.longitude]);

  const mainMapView = useMemo(
    () =>
      new MapView({
        id: 'main',
        nearZMultiplier: 0.02,
        farZMultiplier: 10,
      }),
    []
  );

  const layers = useMemo(
    () => [...baseLayers, ...svBeaconLayers],
    [baseLayers, svBeaconLayers]
  );

  const activeInspectedCell = useMemo(() => {
    const target = pinnedCell ?? hoveredCell;
    if (!target) return null;
    return {
      ...target,
      band: classifyDepth(target.depthFt, colorMode),
    };
  }, [pinnedCell, hoveredCell, colorMode]);

  if (authChecking) {
    return (
      <main className="auth-stage" aria-busy="true">
        <div className="auth-graticule" aria-hidden="true" />
        <div className="auth-loading-chip">Signing in…</div>
      </main>
    );
  }

  if (!authSession) {
    return (
      <CognitoAuthGate
        config={cognitoConfig}
        onAuthenticated={setAuthSession}
      />
    );
  }

  return (
    <div
      ref={splitStageRef}
      className={`split-stage ${isResizingSplit ? 'is-resizing' : ''}`}
    >
      <div className="map-pane">
        <DeckGL
          ref={deckRef}
          views={mainMapView}
          viewState={viewState}
          onViewStateChange={({ viewState: nextVs, interactionState }) => {
            const vs = nextVs as MapViewState;
            setViewState(vs);
            if (interactionState?.isDragging) {
              setActiveBookmarkId(null);
            }
            const moving = Boolean(
              interactionState?.isDragging ||
                interactionState?.isPanning ||
                interactionState?.isZooming ||
                interactionState?.isRotating ||
                interactionState?.inTransition
            );
            setIsMapMoving(moving);

            if (streetViewOpen && followMapCamera) {
              setSvTarget({
                longitude: vs.longitude,
                latitude: vs.latitude,
                heading: normHeading(vs.bearing ?? 0),
                pitch: deckPitchToStreetPitch(vs.pitch ?? 60),
              });
            }
          }}
          controller={{
            type: TerrainController,
            touchRotate: true,
            inertia: 250,
          }}
          layers={layers}
          onHover={handleHover}
          onClick={handleClick}
          getCursor={({ isDragging }) =>
            isDragging ? 'grabbing' : hoveredCell ? 'crosshair' : 'grab'
          }
        />

        {streetViewOpen && followMapCamera && (
          <div className="map-sync-reticle" aria-hidden="true">
            <span className="reticle-ring" />
            <span className="reticle-dot" />
          </div>
        )}

        <TopBar
          bookmarks={CAMERA_BOOKMARKS}
          activeBookmarkId={activeBookmarkId}
          onSelectBookmark={handleSelectBookmark}
          activeScenario={activeScenario}
          tiles3dReady={tiles3dReady}
          mvtReady={mvtReady}
          currentZoom={viewState.zoom}
          isTopDown={isTopDown}
          onToggleTopDown={handleToggleTopDown}
          streetViewOpen={streetViewOpen}
          onToggleStreetView={handleToggleStreetView}
          onOpenSettings={() => setSettingsOpen(true)}
          authSession={authSession}
          onSignOut={handleSignOut}
        />

        <StaffGaugePanel
          showFloodLayer={showFloodLayer}
          onToggleFloodLayer={setShowFloodLayer}
          opacity={opacity}
          onChangeOpacity={setOpacity}
          minDepthFt={minDepthFt}
          onChangeMinDepthFt={setMinDepthFt}
          showWireframe={showWireframe}
          onToggleWireframe={setShowWireframe}
          colorMode={colorMode}
          onChangeColorMode={setColorMode}
          inspectedCell={activeInspectedCell}
          onClearPin={() => setPinnedCell(null)}
        />

        {tileError && (
          <div className="error-banner" role="alert">
            <span>{tileError}</span>
            <button
              type="button"
              className="utility-btn"
              onClick={() => setSettingsOpen(true)}
            >
              Update Key
            </button>
          </div>
        )}

        <footer className="hud-statusbar">
          <div className="telemetry-strip">
            <span>
              {cursorCoords
                ? `${cursorCoords[1].toFixed(5)}°N, ${Math.abs(cursorCoords[0]).toFixed(5)}°W`
                : `${viewState.latitude.toFixed(5)}°N, ${Math.abs(viewState.longitude).toFixed(5)}°W`}
            </span>
            <span className="telemetry-sep">·</span>
            <span>Z {viewState.zoom.toFixed(1)}</span>
            <span className="telemetry-sep">·</span>
            <span>Pitch {Math.round(viewState.pitch ?? 0)}°</span>
            <span className="telemetry-sep">·</span>
            <span>Bearing {Math.round(viewState.bearing ?? 0)}°</span>
          </div>

          <span className="google-mini-badge" aria-label="Google 3D Tiles">
            Google
          </span>
        </footer>
      </div>

      {streetViewOpen && (
        <>
          <div
            className="split-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize 3D Map and Street View split"
            title="Drag to resize Map / Street View split"
            onPointerDown={(e) => {
              e.preventDefault();
              setIsResizingSplit(true);
            }}
          >
            <span className="split-resizer-grip" />
          </div>

          <StreetViewPane
            widthPercent={svWidthPct}
            googleMapsApiKey={credentials.googleMapsApiKey}
            onUpdateGoogleKey={(nextKey) => {
              setTiles3dReady(false);
              setTileError(null);
              setCredentials((prev) => ({
                ...prev,
                googleMapsApiKey: nextKey,
              }));
            }}
            target={svTarget}
            isMapMoving={isMapMoving}
            followMapCamera={followMapCamera}
            onToggleFollowMap={() => setFollowMapCamera((prev) => !prev)}
            onPanoMove={handlePanoMove}
            onPanoPovChange={handlePanoPovChange}
            onRoadSnap={handleRoadSnap}
            streetDepthFt={svDepthFt}
            minDepthFt={minDepthFt}
            colorMode={colorMode}
            scenarioTag={activeScenario ? activeScenario.shortLabel : '500-Yr Flood'}
            resizeToken={svResizeToken}
            onClose={() => setStreetViewOpen(false)}
          />
        </>
      )}

      {settingsOpen && (
        <CredentialsModal
          credentials={credentials}
          onSave={(next) => {
            setTiles3dReady(false);
            setMvtReady(false);
            setTileError(null);
            setCredentials(next);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
};

export default App;
