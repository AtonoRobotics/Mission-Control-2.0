/**
 * Map Panel — Lightweight GPS visualization using OpenStreetMap tiles.
 * No external map libraries. Renders tiles via <img> with a canvas overlay
 * for GPS trail and position marker.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTopics, useSubscription } from '@/data-source/hooks';

interface NavSatFixMessage {
  header?: { stamp?: { sec: number; nanosec: number }; frame_id?: string };
  status?: { status: number; service: number };
  latitude: number;
  longitude: number;
  altitude: number;
  position_covariance?: number[];
  position_covariance_type?: number;
}

interface GpsPoint {
  lat: number;
  lon: number;
  alt: number;
  timestamp: number;
}

const MAX_TRAIL_POINTS = 100;
const DEFAULT_ZOOM = 16;
const TILE_SIZE = 256;
const TILES_X = 3;
const TILES_Y = 3;

/** Convert lat/lon to fractional tile coordinates */
function latLonToTile(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

/** Convert fractional tile coords back to lat/lon */
function tileToLatLon(x: number, y: number, zoom: number): { lat: number; lon: number } {
  const n = Math.pow(2, zoom);
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lon };
}

/** Convert lat/lon to pixel position relative to tile grid origin */
function latLonToPixel(
  lat: number,
  lon: number,
  zoom: number,
  originTileX: number,
  originTileY: number,
): { px: number; py: number } {
  const { x, y } = latLonToTile(lat, lon, zoom);
  return {
    px: (x - originTileX) * TILE_SIZE,
    py: (y - originTileY) * TILE_SIZE,
  };
}

export default function MapPanel(props: any) {
  const { config = {}, onConfigChange = () => {} } = props;
  const topics = useTopics();
  const selectedTopic = (config.topic as string) || '';
  const [zoomLevel, setZoomLevel] = useState<number>((config.zoom as number) || DEFAULT_ZOOM);
  const [trail, setTrail] = useState<GpsPoint[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter to NavSatFix topics
  const gpsTopics = topics.filter(
    (t) =>
      t.schemaName.includes('NavSatFix') ||
      t.schemaName.includes('navsatfix') ||
      t.schemaName.includes('nav_sat_fix') ||
      t.schemaName.includes('GpsStatus') ||
      t.schemaName.includes('NavSat'),
  );

  const latestEvent = useSubscription(selectedTopic);

  // Update trail on new message
  useEffect(() => {
    if (!latestEvent) return;
    const msg = latestEvent.message as NavSatFixMessage;
    if (msg.latitude == null || msg.longitude == null) return;
    // Filter out zero/invalid coordinates
    if (msg.latitude === 0 && msg.longitude === 0) return;

    const pt: GpsPoint = {
      lat: msg.latitude,
      lon: msg.longitude,
      alt: msg.altitude ?? 0,
      timestamp: latestEvent.timestamp,
    };

    setTrail((prev) => {
      const next = [...prev, pt];
      if (next.length > MAX_TRAIL_POINTS) {
        return next.slice(next.length - MAX_TRAIL_POINTS);
      }
      return next;
    });
  }, [latestEvent]);

  const currentPos = trail.length > 0 ? trail[trail.length - 1] : null;

  // Compute tile grid centered on current position
  const centerLat = currentPos?.lat ?? (config.defaultLat as number) ?? 0;
  const centerLon = currentPos?.lon ?? (config.defaultLon as number) ?? 0;
  const { x: centerTileX, y: centerTileY } = latLonToTile(centerLat, centerLon, zoomLevel);
  const originTileX = Math.floor(centerTileX) - Math.floor(TILES_X / 2);
  const originTileY = Math.floor(centerTileY) - Math.floor(TILES_Y / 2);

  // Build tile URLs
  const tiles: Array<{ url: string; gridX: number; gridY: number }> = [];
  for (let dy = 0; dy < TILES_Y; dy++) {
    for (let dx = 0; dx < TILES_X; dx++) {
      const tileX = originTileX + dx;
      const tileY = originTileY + dy;
      const n = Math.pow(2, zoomLevel);
      // Wrap tile X coordinate
      const wrappedX = ((tileX % n) + n) % n;
      if (tileY >= 0 && tileY < n) {
        tiles.push({
          url: `https://tile.openstreetmap.org/${zoomLevel}/${wrappedX}/${tileY}.png`,
          gridX: dx,
          gridY: dy,
        });
      }
    }
  }

  const mapWidth = TILES_X * TILE_SIZE;
  const mapHeight = TILES_Y * TILE_SIZE;

  // Draw trail and position on canvas overlay
  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = mapWidth;
    canvas.height = mapHeight;
    ctx.clearRect(0, 0, mapWidth, mapHeight);

    if (trail.length === 0) return;

    // Draw trail polyline
    if (trail.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 170, 0, 0.8)';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';

      for (let i = 0; i < trail.length; i++) {
        const { px, py } = latLonToPixel(trail[i].lat, trail[i].lon, zoomLevel, originTileX, originTileY);
        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    }

    // Draw current position
    if (currentPos) {
      const { px, py } = latLonToPixel(currentPos.lat, currentPos.lon, zoomLevel, originTileX, originTileY);

      // Outer glow
      ctx.beginPath();
      ctx.arc(px, py, 10, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 60, 60, 0.25)';
      ctx.fill();

      // Inner dot
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff3c3c';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Bearing indicator (if we have at least 2 points)
      if (trail.length >= 2) {
        const prev = trail[trail.length - 2];
        const bearing = Math.atan2(
          currentPos.lon - prev.lon,
          currentPos.lat - prev.lat,
        );
        const arrowLen = 16;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(
          px + Math.sin(bearing) * arrowLen,
          py - Math.cos(bearing) * arrowLen,
        );
        ctx.strokeStyle = '#ff3c3c';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, [trail, currentPos, zoomLevel, originTileX, originTileY, mapWidth, mapHeight]);

  // Redraw overlay when trail or zoom changes
  useEffect(() => {
    drawOverlay();
  }, [drawOverlay]);

  const handleZoomIn = useCallback(() => {
    setZoomLevel((z) => {
      const next = Math.min(z + 1, 19);
      onConfigChange({ zoom: next });
      return next;
    });
  }, [onConfigChange]);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((z) => {
      const next = Math.max(z - 1, 2);
      onConfigChange({ zoom: next });
      return next;
    });
  }, [onConfigChange]);

  const selectStyle = {
    flex: 1,
    background: 'var(--bg-surface-2)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle, #333)',
    borderRadius: 3,
    fontSize: 11,
    padding: '3px 6px',
  };

  const btnStyle = {
    background: 'var(--bg-surface-2)',
    border: '1px solid var(--border-subtle, #333)',
    color: 'var(--text-secondary)',
    borderRadius: 3,
    fontSize: 13,
    padding: '2px 8px',
    cursor: 'pointer' as const,
    fontWeight: 'bold' as const,
    lineHeight: '18px',
  };

  const infoStyle = {
    fontFamily: 'monospace' as const,
    fontSize: 11,
    color: 'var(--text-tertiary, #666)',
    whiteSpace: 'nowrap' as const,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          borderBottom: '1px solid var(--border-subtle, #333)',
          flexShrink: 0,
        }}
      >
        <select
          value={selectedTopic}
          onChange={(e) => {
            onConfigChange({ topic: e.target.value });
            setTrail([]);
          }}
          style={selectStyle}
        >
          <option value="">Select GPS topic...</option>
          {gpsTopics.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>

        {currentPos && (
          <>
            <span style={infoStyle}>
              {currentPos.lat.toFixed(6)}, {currentPos.lon.toFixed(6)}
            </span>
            <span style={infoStyle}>
              alt: {currentPos.alt.toFixed(1)}m
            </span>
          </>
        )}

        <button onClick={handleZoomOut} style={btnStyle} title="Zoom out">
          -
        </button>
        <span style={{ ...infoStyle, minWidth: 16, textAlign: 'center' as const }}>
          {zoomLevel}
        </span>
        <button onClick={handleZoomIn} style={btnStyle} title="Zoom in">
          +
        </button>
      </div>

      {/* Map area */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-base, #0a0a0a)',
          position: 'relative',
        }}
      >
        {!selectedTopic && !currentPos && (
          <div style={{ color: 'var(--text-tertiary, #666)', fontSize: 12, position: 'absolute', zIndex: 10 }}>
            Select a NavSatFix topic to view GPS position
          </div>
        )}

        {/* Tile grid */}
        <div
          style={{
            position: 'relative',
            width: mapWidth,
            height: mapHeight,
            flexShrink: 0,
          }}
        >
          {tiles.map((tile) => (
            <img
              key={tile.url}
              src={tile.url}
              alt=""
              style={{
                position: 'absolute',
                left: tile.gridX * TILE_SIZE,
                top: tile.gridY * TILE_SIZE,
                width: TILE_SIZE,
                height: TILE_SIZE,
                imageRendering: 'auto',
                // Invert and adjust for dark theme
                filter: 'invert(1) hue-rotate(180deg) brightness(0.8) contrast(1.2)',
              }}
              crossOrigin="anonymous"
              loading="eager"
            />
          ))}

          {/* Canvas overlay for trail + marker */}
          <canvas
            ref={canvasRef}
            width={mapWidth}
            height={mapHeight}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: mapWidth,
              height: mapHeight,
              pointerEvents: 'none',
            }}
          />

          {/* Crosshair at center when no GPS data */}
          {!currentPos && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24">
                <line x1="12" y1="4" x2="12" y2="20" stroke="var(--text-tertiary, #666)" strokeWidth="1" />
                <line x1="4" y1="12" x2="20" y2="12" stroke="var(--text-tertiary, #666)" strokeWidth="1" />
                <circle cx="12" cy="12" r="3" stroke="var(--text-tertiary, #666)" strokeWidth="1" fill="none" />
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
