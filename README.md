# Boston 500-Year Flood · Google Photorealistic 3D App (React + TypeScript)

Interactive 3D coastal and stormwater flood visualization built with **React 19**, **TypeScript**, **Vite**, and **Deck.gl 9.4**. Drapes the Boston 500-year flood 2D computational mesh (`hazensawyer.5qefdlco`) directly onto **Google Maps Photorealistic 3D Tiles** (`Tile3DLayer` + `_TerrainExtension` in `drape` mode).

## Features

- **Google Photorealistic 3D Terrain & Buildings** (`https://tile.googleapis.com/v1/3dtiles/root.json`) with `operation: 'terrain+draw'` and dynamic provider copyright attribution.
- **Draped Boston 500-Year Flood Cells** (`hazensawyer.5qefdlco` Mapbox Vector Tiles, 171,688 2D hydraulic cells) rendered onto ground & street surfaces via `MVTLayer` + `TerrainExtension` (`terrainDrawMode: 'drape'`).
- **Interactive Storm-Surge Staff Gauge**: Hover any flooded cell for live `MAXDEPTH` sounding in feet and meters, or click to pin a cell benchmark while orbiting in 3D.
- **Hydrologic Controls**: Adjust water surface opacity, filter out shallow ponding with a minimum depth threshold (`0–10 ft`), toggle 2D computational mesh edges, and switch between the 500-Year Surge color scale (`0–10+ ft`) and the legacy 2024 scale (`0–2.5+ ft`).
- **Boston Neighborhood Bookmarks**: Smooth 3D `FlyToInterpolator` transitions across North End & Waterfront, Seaport & Fort Point, East Boston, Charlestown Navy Yard, South End, and Back Bay.
- **AWS Cognito SPA Authentication (`aws-amplify/auth`)**: Email/Password sign-in, self-service account registration, 6-digit email verification, password reset, forced password updates, session persistence, and Local Preview mode when unconfigured.
- **Synchronized Right-Half Google Street View (`StreetViewPane`)**: Toggleable 50/50 split-screen (resizable `26%–74%`, closed by default) with real-time 2-way `Sync Move` camera tracking, nearest outdoor roadway snapping, eye-level `Water Line` flood crest overlay, `Pop Out ↗`, `STREET VIEW` map beacon, and live street-level flood depth telemetry.
- **Runtime Source Switcher**: Swap API keys or switch between `hazensawyer.5qefdlco` (500-Yr Surge) and companion 2-Yr / 10-Yr Boston storm tilesets from the **Tileset & Keys** dialog.

## Quick Start

1. Copy `.env.example` to `.env.local` (already configured locally) and set:
   - `VITE_GOOGLE_MAPS_API_KEY`
   - `VITE_MAPBOX_ACCESS_TOKEN`
   - `VITE_MAPBOX_TILESET_ID=hazensawyer.5qefdlco`
   - `VITE_COGNITO_REGION=us-east-1`
   - `VITE_COGNITO_USER_POOL_ID=<your_cognito_user_pool_id>`
   - `VITE_COGNITO_CLIENT_ID=<your_public_spa_app_client_id>` (create a **Single-Page Application (SPA)** client in AWS Cognito **without** a client secret, with SRP / password authentication enabled)
2. Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

3. Build for production:

```bash
npm run build
```
