import type { Color } from '@deck.gl/core';
import type {
  CameraBookmark,
  ColorRampMode,
  DepthBand,
  MapCredentials,
  ScenarioOption,
} from '../types/flood';

export const GOOGLE_3D_TILES_ROOT_URL =
  'https://tile.googleapis.com/v1/3dtiles/root.json';

export const DEFAULT_CREDENTIALS: MapCredentials = {
  googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '',
  mapboxAccessToken: import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? '',
  tilesetId: import.meta.env.VITE_MAPBOX_TILESET_ID ?? 'hazensawyer.5qefdlco',
};

export const SCENARIO_OPTIONS: ScenarioOption[] = [
  {
    id: '500yr-2070',
    label: '2070 SLR · 500-Year Tropical & Surge',
    shortLabel: '500-Year Flood (2070 SLR)',
    tilesetId: 'hazensawyer.5qefdlco',
    horizon: '2070 SLR',
    returnPeriod: '500-Yr Surge',
  },
  {
    id: '10yr-2070',
    label: '2070 SLR · 10-Year Design Storm',
    shortLabel: '10-Year Storm (2070)',
    tilesetId: 'hazensawyer.cylokvpf',
    horizon: '2070 SLR',
    returnPeriod: '10-Yr Storm',
  },
  {
    id: '10yr-2030',
    label: '2030 Horizon · 10-Year Design Storm',
    shortLabel: '10-Year Storm (2030)',
    tilesetId: 'hazensawyer.6qyypdf9',
    horizon: '2030',
    returnPeriod: '10-Yr Storm',
  },
  {
    id: '2yr-2070',
    label: '2070 SLR · 2-Year Storm',
    shortLabel: '2-Year Storm (2070)',
    tilesetId: 'hazensawyer.3fenqv5f',
    horizon: '2070 SLR',
    returnPeriod: '2-Yr Storm',
  },
  {
    id: '2yr-2030',
    label: '2030 Horizon · 2-Year Storm',
    shortLabel: '2-Year Storm (2030)',
    tilesetId: 'hazensawyer.b0z1ndn7',
    horizon: '2030',
    returnPeriod: '2-Yr Storm',
  },
];

export const CAMERA_BOOKMARKS: CameraBookmark[] = [
  {
    id: 'waterfront',
    name: 'Waterfront',
    subtitle: 'North End, Atlantic Ave & Harborwalk overtopping',
    latitude: 42.36559,
    longitude: -71.04873,
    zoom: 16.0,
    pitch: 60,
    bearing: -65,
  },
  {
    id: 'seaport',
    name: 'Seaport',
    subtitle: 'Fort Point Channel coastal surge corridor',
    latitude: 42.3512,
    longitude: -71.0478,
    zoom: 15.85,
    pitch: 62,
    bearing: -35,
  },
  {
    id: 'east-boston',
    name: 'East Boston',
    subtitle: 'Maverick Square & inner harbor piers',
    latitude: 42.3692,
    longitude: -71.0395,
    zoom: 15.9,
    pitch: 58,
    bearing: 45,
  },
  {
    id: 'charlestown',
    name: 'Charlestown',
    subtitle: 'Navy Yard & Mystic River confluence',
    latitude: 42.3735,
    longitude: -71.0525,
    zoom: 15.9,
    pitch: 60,
    bearing: -115,
  },
  {
    id: 'south-end',
    name: 'South End',
    subtitle: 'Albany St tidal flats & I-93 basin pooling',
    latitude: 42.3365,
    longitude: -71.0685,
    zoom: 15.65,
    pitch: 56,
    bearing: -20,
  },
  {
    id: 'back-bay',
    name: 'Back Bay',
    subtitle: 'Charles River Esplanade & street grid',
    latitude: 42.3505,
    longitude: -71.0765,
    zoom: 15.75,
    pitch: 58,
    bearing: 28,
  },
];

/**
 * Hydrologic 5-band scale calibrated to the 171,688-cell Boston 500-Year Surcharge model
 * (min 0.01 ft, p25 2.94 ft, median 5.29 ft, p90 8.87 ft, p99 14.59 ft).
 */
export const SURGE_500YR_BANDS: DepthBand[] = [
  {
    id: 'shallow',
    label: 'Sheetflow',
    rangeText: '< 1.0 ft',
    minFt: 0,
    maxFt: 1.0,
    color: [125, 211, 252],
    hex: '#7DD3FC',
    impact: 'Curb overtopping & nuisance street ponding',
  },
  {
    id: 'moderate',
    label: 'Street Ponding',
    rangeText: '1.0 – 3.0 ft',
    minFt: 1.0,
    maxFt: 3.0,
    color: [56, 152, 236],
    hex: '#3898EC',
    impact: 'Impassable roadways & ground-level entry risk',
  },
  {
    id: 'deep',
    label: 'Deep Inundation',
    rangeText: '3.0 – 6.0 ft',
    minFt: 3.0,
    maxFt: 6.0,
    color: [21, 94, 239],
    hex: '#155EEF',
    impact: 'Basement flooding & utility vault submergence',
  },
  {
    id: 'severe',
    label: 'Severe Surge',
    rangeText: '6.0 – 10.0 ft',
    minFt: 6.0,
    maxFt: 10.0,
    color: [30, 58, 138],
    hex: '#1E3A8A',
    impact: 'First-story submergence & structural wave load',
  },
  {
    id: 'extreme',
    label: 'Extreme Basin',
    rangeText: '> 10.0 ft',
    minFt: 10.0,
    maxFt: null,
    color: [91, 33, 182],
    hex: '#5B21B6',
    impact: 'Deep waterfront overtopping & depressed arterial inundation',
  },
];

/**
 * Legacy 4-band scale preserved from the original Feb 2024 Boston Flooding React prototype.
 */
export const LEGACY_2024_BANDS: DepthBand[] = [
  {
    id: 'legacy-1',
    label: 'Minor',
    rangeText: '< 0.5 ft',
    minFt: 0,
    maxFt: 0.5,
    color: [135, 206, 235],
    hex: '#87CEEB',
    impact: 'Shallow gutter & sidewalk sheetflow',
  },
  {
    id: 'legacy-2',
    label: 'Moderate',
    rangeText: '0.5 – 1.0 ft',
    minFt: 0.5,
    maxFt: 1.01,
    color: [65, 105, 225],
    hex: '#4169E1',
    impact: 'Curb-to-curb roadway ponding',
  },
  {
    id: 'legacy-3',
    label: 'High',
    rangeText: '1.0 – 2.5 ft',
    minFt: 1.01,
    maxFt: 2.51,
    color: [15, 82, 186],
    hex: '#0F52BA',
    impact: 'Vehicle stall depth & subterranean ingress',
  },
  {
    id: 'legacy-4',
    label: 'Severe',
    rangeText: '> 2.5 ft',
    minFt: 2.51,
    maxFt: null,
    color: [70, 130, 180],
    hex: '#4682B4',
    impact: 'Sustained structural & corridor inundation',
  },
];

export function getActiveBands(mode: ColorRampMode): DepthBand[] {
  return mode === 'surge-500yr' ? SURGE_500YR_BANDS : LEGACY_2024_BANDS;
}

export function classifyDepth(depthFt: number, mode: ColorRampMode): DepthBand {
  const bands = getActiveBands(mode);
  for (const band of bands) {
    if (band.maxFt === null || depthFt < band.maxFt) {
      return band;
    }
  }
  return bands[bands.length - 1];
}

export function getFloodFillColor(
  depthFt: number | undefined,
  mode: ColorRampMode,
  opacity: number,
  minDepthFt: number
): Color {
  const d = typeof depthFt === 'number' && Number.isFinite(depthFt) ? depthFt : 0;
  if (d < minDepthFt) {
    return [0, 0, 0, 0];
  }
  const band = classifyDepth(d, mode);
  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255);
  return [band.color[0], band.color[1], band.color[2], alpha];
}

export function buildMapboxTileJsonUrl(
  tilesetId: string,
  accessToken: string
): string {
  const cleanId = tilesetId.trim();
  const cleanToken = accessToken.trim();
  return `https://api.mapbox.com/v4/${cleanId}.json?access_token=${encodeURIComponent(cleanToken)}`;
}
