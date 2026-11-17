export interface FloodCellProperties {
  MAXDEPTH?: number;
  [key: string]: unknown;
}

export type ColorRampMode = 'surge-500yr' | 'legacy-2024';

export interface DepthBand {
  id: string;
  label: string;
  rangeText: string;
  minFt: number;
  maxFt: number | null;
  color: [number, number, number];
  hex: string;
  impact: string;
}

export interface CameraBookmark {
  id: string;
  name: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export interface InspectedCell {
  depthFt: number;
  depthM: number;
  longitude: number;
  latitude: number;
  band: DepthBand;
  pinned: boolean;
}

export interface ScenarioOption {
  id: string;
  label: string;
  shortLabel: string;
  tilesetId: string;
  horizon: string;
  returnPeriod: string;
}

export interface MapCredentials {
  googleMapsApiKey: string;
  mapboxAccessToken: string;
  tilesetId: string;
}

export interface StreetViewTarget {
  longitude: number;
  latitude: number;
  heading: number;
  pitch: number;
}

