import { useRef, useEffect, useCallback, useState } from 'react';
import type { ScenePlacement } from '@/stores/sceneStore';

// --- Props ---

export interface SceneCanvas2DProps {
  placements: ScenePlacement[];
  selectedId: string | null;
  onSelectPlacement: (id: string | null) => void;
  onUpdatePlacement: (id: string, updates: Partial<ScenePlacement>) => void;
  onDropAsset: (assetData: string, canvasX: number, canvasY: number) => void;
  onRemovePlacement: (id: string) => void;
}

// --- Constants ---

const GRID_SPACING = 0.1; // metres
const GRID_COLOR = '#222222';
const BG_COLOR = '#0d0d0d';
const AXIS_COLOR_X = '#ff4444';
const AXIS_COLOR_Y = '#44ff44';
const LABEL_FONT = '10px monospace';
const SELECTED_GLOW_COLOR = '#ffffff';

interface Transform {
  offsetX: number;
  offsetY: number;
  scale: number; // pixels per metre
}

interface DragState {
  placementId: string;
  startWorldX: number;
  startWorldY: number;
  startPlacementX: number;
  startPlacementY: number;
}

// --- Shape sizes (metres) per asset type ---

function getAssetSize(type: ScenePlacement['asset_type']): { w: number; h: number } {
  switch (type) {
    case 'robot':
      return { w: 0.3, h: 0.3 };
    case 'environment':
      return { w: 2, h: 2 };
    case 'object':
      return { w: 0.15, h: 0.15 };
    case 'sensor':
      return { w: 0.1, h: 0.1 };
    case 'light':
      return { w: 0.1, h: 0.1 };
  }
}

function getAssetColor(type: ScenePlacement['asset_type']): string {
  switch (type) {
    case 'robot':
      return '#ffaa00';
    case 'environment':
      return '#4488ff';
    case 'object':
      return '#44cc88';
    case 'sensor':
      return '#cc44ff';
    case 'light':
      return '#ffcc44';
  }
}

// --- Coordinate helpers ---

/** Convert world coords (metres) to canvas pixel coords */
function worldToCanvas(wx: number, wy: number, t: Transform, canvasW: number, canvasH: number) {
  const cx = canvasW / 2 + (wx * t.scale) + t.offsetX;
  const cy = canvasH / 2 - (wy * t.scale) + t.offsetY; // Y up → screen Y down
  return { cx, cy };
}

/** Convert canvas pixel coords to world coords (metres) */
function canvasToWorld(cx: number, cy: number, t: Transform, canvasW: number, canvasH: number) {
  const wx = (cx - canvasW / 2 - t.offsetX) / t.scale;
  const wy = -(cy - canvasH / 2 - t.offsetY) / t.scale;
  return { wx, wy };
}

// --- Drawing ---

function drawGrid(ctx: CanvasRenderingContext2D, t: Transform, w: number, h: number) {
  const topLeft = canvasToWorld(0, 0, t, w, h);
  const bottomRight = canvasToWorld(w, h, t, w, h);

  const minX = Math.floor(topLeft.wx / GRID_SPACING) * GRID_SPACING;
  const maxX = Math.ceil(bottomRight.wx / GRID_SPACING) * GRID_SPACING;
  const minY = Math.floor(bottomRight.wy / GRID_SPACING) * GRID_SPACING;
  const maxY = Math.ceil(topLeft.wy / GRID_SPACING) * GRID_SPACING;

  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 0.5;
  ctx.beginPath();

  // Vertical lines (X)
  for (let x = minX; x <= maxX; x += GRID_SPACING) {
    const { cx } = worldToCanvas(x, 0, t, w, h);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, h);
  }

  // Horizontal lines (Y)
  for (let y = minY; y <= maxY; y += GRID_SPACING) {
    const { cy } = worldToCanvas(0, y, t, w, h);
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
  }

  ctx.stroke();
}

function drawAxes(ctx: CanvasRenderingContext2D, t: Transform, w: number, h: number) {
  const origin = worldToCanvas(0, 0, t, w, h);

  // X axis
  ctx.strokeStyle = AXIS_COLOR_X;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, origin.cy);
  ctx.lineTo(w, origin.cy);
  ctx.stroke();

  // Y axis
  ctx.strokeStyle = AXIS_COLOR_Y;
  ctx.beginPath();
  ctx.moveTo(origin.cx, 0);
  ctx.lineTo(origin.cx, h);
  ctx.stroke();

  // Labels
  ctx.font = '11px monospace';
  ctx.fillStyle = AXIS_COLOR_X;
  ctx.fillText('X', w - 16, origin.cy - 6);
  ctx.fillStyle = AXIS_COLOR_Y;
  ctx.fillText('Y', origin.cx + 6, 14);
}

function drawPlacement(
  ctx: CanvasRenderingContext2D,
  p: ScenePlacement,
  t: Transform,
  w: number,
  h: number,
  isSelected: boolean,
) {
  const { cx, cy } = worldToCanvas(p.position.x, p.position.y, t, w, h);
  const size = getAssetSize(p.asset_type);
  const color = getAssetColor(p.asset_type);
  const pw = size.w * t.scale;
  const ph = size.h * t.scale;

  ctx.save();

  // Selection glow
  if (isSelected) {
    ctx.shadowColor = SELECTED_GLOW_COLOR;
    ctx.shadowBlur = 12;
  }

  ctx.fillStyle = color;
  ctx.strokeStyle = isSelected ? SELECTED_GLOW_COLOR : color;
  ctx.lineWidth = isSelected ? 2 : 1;

  if (p.asset_type === 'sensor') {
    // Circle
    const radius = (pw / 2);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (p.asset_type === 'light') {
    // Diamond
    const half = pw / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - half);
    ctx.lineTo(cx + half, cy);
    ctx.lineTo(cx, cy + half);
    ctx.lineTo(cx - half, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    // Rectangle
    ctx.fillRect(cx - pw / 2, cy - ph / 2, pw, ph);
    ctx.strokeRect(cx - pw / 2, cy - ph / 2, pw, ph);
  }

  ctx.restore();

  // Label
  ctx.font = LABEL_FONT;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(p.label, cx, cy - ph / 2 - 4);
}

// --- Hit testing ---

function hitTest(
  mx: number,
  my: number,
  placements: ScenePlacement[],
  t: Transform,
  w: number,
  h: number,
): ScenePlacement | null {
  // Iterate in reverse so top-drawn items are hit first
  for (let i = placements.length - 1; i >= 0; i--) {
    const p = placements[i];
    const { cx, cy } = worldToCanvas(p.position.x, p.position.y, t, w, h);
    const size = getAssetSize(p.asset_type);
    const pw = size.w * t.scale;
    const ph = size.h * t.scale;

    if (p.asset_type === 'sensor') {
      const radius = pw / 2;
      const dx = mx - cx;
      const dy = my - cy;
      if (dx * dx + dy * dy <= radius * radius) return p;
    } else {
      if (
        mx >= cx - pw / 2 &&
        mx <= cx + pw / 2 &&
        my >= cy - ph / 2 &&
        my <= cy + ph / 2
      ) {
        return p;
      }
    }
  }
  return null;
}

// --- Auto-scale helper ---

function computeAutoFit(
  placements: ScenePlacement[],
  canvasW: number,
  canvasH: number,
): Transform {
  if (placements.length === 0) {
    return { offsetX: 0, offsetY: 0, scale: 100 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of placements) {
    const size = getAssetSize(p.asset_type);
    minX = Math.min(minX, p.position.x - size.w / 2);
    maxX = Math.max(maxX, p.position.x + size.w / 2);
    minY = Math.min(minY, p.position.y - size.h / 2);
    maxY = Math.max(maxY, p.position.y + size.h / 2);
  }

  const worldW = maxX - minX || 1;
  const worldH = maxY - minY || 1;
  const padding = 1.3; // 30% padding
  const scale = Math.min(canvasW / (worldW * padding), canvasH / (worldH * padding));

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return {
    offsetX: -centerX * scale,
    offsetY: centerY * scale,
    scale,
  };
}

// --- Component ---

interface ContextMenu2D {
  x: number;
  y: number;
  placementId: string;
  label: string;
}

export default function SceneCanvas2D({
  placements,
  selectedId,
  onSelectPlacement,
  onUpdatePlacement,
  onDropAsset,
  onRemovePlacement,
}: SceneCanvas2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<Transform>({ offsetX: 0, offsetY: 0, scale: 100 });
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<{ startX: number; startY: number; startOffX: number; startOffY: number } | null>(null);
  const animFrameRef = useRef<number>(0);
  const initialFitDone = useRef(false);

  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });
  const [ctxMenu, setCtxMenu] = useState<ContextMenu2D | null>(null);

  // --- ResizeObserver ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setCanvasSize({ w: Math.floor(width), h: Math.floor(height) });
        }
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // --- Auto-fit on initial render when we have placements ---
  useEffect(() => {
    if (!initialFitDone.current && canvasSize.w > 0 && canvasSize.h > 0) {
      transformRef.current = computeAutoFit(placements, canvasSize.w, canvasSize.h);
      initialFitDone.current = true;
    }
  }, [placements, canvasSize]);

  // --- Render loop ---
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const t = transformRef.current;

    // Clear
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    // Grid
    drawGrid(ctx, t, w, h);

    // Axes
    drawAxes(ctx, t, w, h);

    // Placements
    for (const p of placements) {
      drawPlacement(ctx, p, t, w, h, p.id === selectedId);
    }
  }, [placements, selectedId]);

  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      render();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [render]);

  // --- Mouse handlers ---

  const getMousePos = (e: React.MouseEvent): { mx: number; my: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { mx: 0, my: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      mx: (e.clientX - rect.left) * (canvas.width / rect.width),
      my: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const { mx, my } = getMousePos(e);
    const t = transformRef.current;
    const w = canvasSize.w;
    const h = canvasSize.h;

    // Middle mouse → pan
    if (e.button === 1) {
      e.preventDefault();
      panRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startOffX: t.offsetX,
        startOffY: t.offsetY,
      };
      return;
    }

    // Left click → select / drag
    if (e.button === 0) {
      const hit = hitTest(mx, my, placements, t, w, h);
      if (hit) {
        onSelectPlacement(hit.id);
        const world = canvasToWorld(mx, my, t, w, h);
        dragRef.current = {
          placementId: hit.id,
          startWorldX: world.wx,
          startWorldY: world.wy,
          startPlacementX: hit.position.x,
          startPlacementY: hit.position.y,
        };
      } else {
        onSelectPlacement(null);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Pan
    if (panRef.current) {
      const dx = e.clientX - panRef.current.startX;
      const dy = e.clientY - panRef.current.startY;
      transformRef.current = {
        ...transformRef.current,
        offsetX: panRef.current.startOffX + dx,
        offsetY: panRef.current.startOffY + dy,
      };
      return;
    }

    // Drag placement
    if (dragRef.current) {
      const { mx, my } = getMousePos(e);
      const t = transformRef.current;
      const world = canvasToWorld(mx, my, t, canvasSize.w, canvasSize.h);
      const dx = world.wx - dragRef.current.startWorldX;
      const dy = world.wy - dragRef.current.startWorldY;
      const newX = dragRef.current.startPlacementX + dx;
      const newY = dragRef.current.startPlacementY + dy;
      // Live preview: update position
      onUpdatePlacement(dragRef.current.placementId, {
        position: {
          x: Math.round(newX * 100) / 100,
          y: Math.round(newY * 100) / 100,
          z: 0,
        },
      });
    }
  };

  const handleMouseUp = (_e: React.MouseEvent) => {
    dragRef.current = null;
    panRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const { mx, my } = getMousePos(e);
    const t = transformRef.current;
    const w = canvasSize.w;
    const h = canvasSize.h;

    // World position under cursor before zoom
    const beforeWorld = canvasToWorld(mx, my, t, w, h);

    const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newScale = Math.max(10, Math.min(5000, t.scale * zoomFactor));

    // Recalculate offset so cursor stays on same world point
    const newOffsetX = mx - w / 2 - beforeWorld.wx * newScale;
    const newOffsetY = my - h / 2 + beforeWorld.wy * newScale;

    transformRef.current = { offsetX: newOffsetX, offsetY: newOffsetY, scale: newScale };
  };

  // --- Drop zone ---

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/scene-asset')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const assetData = e.dataTransfer.getData('application/scene-asset');
    if (!assetData) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);

    const t = transformRef.current;
    const { wx, wy } = canvasToWorld(mx, my, t, canvasSize.w, canvasSize.h);
    onDropAsset(assetData, Math.round(wx * 100) / 100, Math.round(wy * 100) / 100);
  };

  // --- Right-click context menu ---

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const { mx, my } = getMousePos(e);
    const t = transformRef.current;
    const hit = hitTest(mx, my, placements, t, canvasSize.w, canvasSize.h);
    if (hit) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      setCtxMenu({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        placementId: hit.id,
        label: hit.label,
      });
    } else {
      setCtxMenu(null);
    }
  };

  // Close context menu on any left click
  const handleMouseDownWrapper = (e: React.MouseEvent) => {
    setCtxMenu(null);
    handleMouseDown(e);
  };

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        background: BG_COLOR,
      }}
    >
      <canvas
        ref={canvasRef}
        width={canvasSize.w}
        height={canvasSize.h}
        style={{ display: 'block', width: '100%', height: '100%', cursor: 'crosshair' }}
        onMouseDown={handleMouseDownWrapper}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onContextMenu={handleContextMenu}
      />
      {/* Context menu */}
      {ctxMenu && (
        <div
          style={{
            position: 'absolute',
            left: ctxMenu.x,
            top: ctxMenu.y,
            zIndex: 100,
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            minWidth: 140,
            padding: '4px 0',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{
            padding: '4px 10px',
            fontSize: 10,
            color: '#666',
            borderBottom: '1px solid #2a2a2a',
            marginBottom: 2,
          }}>
            {ctxMenu.label}
          </div>
          <button
            onClick={() => { onRemovePlacement(ctxMenu.placementId); setCtxMenu(null); }}
            style={{
              display: 'block',
              width: '100%',
              padding: '6px 10px',
              background: 'transparent',
              border: 'none',
              color: '#ff4444',
              fontSize: 11,
              cursor: 'pointer',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,68,68,0.1)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
