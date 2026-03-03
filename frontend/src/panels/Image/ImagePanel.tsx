/**
 * Image Panel — Canvas-based rendering for sensor_msgs/Image and CompressedImage.
 * Supports rgb8, bgr8, mono8 raw encodings and base64 CompressedImage decoding.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTopics, useSubscription } from '@/data-source/hooks';

interface ImageMessage {
  header?: { stamp?: { sec: number; nanosec: number }; frame_id?: string };
  height: number;
  width: number;
  encoding?: string;
  is_bigendian?: number;
  step?: number;
  data: number[] | Uint8Array | string;
}

interface CompressedImageMessage {
  header?: { stamp?: { sec: number; nanosec: number }; frame_id?: string };
  format: string;
  data: string; // base64-encoded
}

export default function ImagePanel(props: any) {
  const { config = {}, onConfigChange = () => {} } = props;
  const topics = useTopics();
  const selectedTopic = (config.topic as string) || '';
  const [zoom, setZoom] = useState(false); // false = fit, true = 1:1
  const [fps, setFps] = useState(0);
  const [resolution, setResolution] = useState('');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTimestampRef = useRef<number>(0);
  const fpsAccumRef = useRef<number[]>([]);

  // Filter to image-like topics
  const imageTopics = topics.filter(
    (t) =>
      t.schemaName.includes('Image') ||
      t.schemaName.includes('image'),
  );

  const latestEvent = useSubscription(selectedTopic);

  // Compute FPS from message intervals
  useEffect(() => {
    if (!latestEvent) return;
    const now = latestEvent.receiveTime;
    if (lastTimestampRef.current > 0) {
      const delta = now - lastTimestampRef.current;
      if (delta > 0) {
        fpsAccumRef.current.push(1000 / delta);
        if (fpsAccumRef.current.length > 30) {
          fpsAccumRef.current.shift();
        }
        const avg =
          fpsAccumRef.current.reduce((a, b) => a + b, 0) /
          fpsAccumRef.current.length;
        setFps(Math.round(avg));
      }
    }
    lastTimestampRef.current = now;
  }, [latestEvent]);

  // Render image to canvas
  const renderImage = useCallback(
    async (msg: unknown, schemaName: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const isCompressed =
        schemaName.includes('CompressedImage') ||
        schemaName.includes('compressed_image');

      if (isCompressed) {
        const cMsg = msg as CompressedImageMessage;
        const base64 = typeof cMsg.data === 'string' ? cMsg.data : '';
        if (!base64) return;

        try {
          const format = cMsg.format || 'jpeg';
          const mimeType = format.includes('png') ? 'image/png' : 'image/jpeg';
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: mimeType });
          const bitmap = await createImageBitmap(blob);

          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          setResolution(`${bitmap.width}x${bitmap.height}`);
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
        } catch {
          // Failed to decode compressed image
        }
      } else {
        const rMsg = msg as ImageMessage;
        if (!rMsg.width || !rMsg.height) return;
        const { width, height, encoding = 'rgb8' } = rMsg;

        canvas.width = width;
        canvas.height = height;
        setResolution(`${width}x${height}`);

        const imageData = ctx.createImageData(width, height);
        const pixels = imageData.data;

        // Convert data to number array
        let rawData: number[];
        if (Array.isArray(rMsg.data)) {
          rawData = rMsg.data;
        } else if (typeof rMsg.data === 'string') {
          // base64-encoded raw data
          try {
            const binary = atob(rMsg.data);
            rawData = new Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              rawData[i] = binary.charCodeAt(i);
            }
          } catch {
            return;
          }
        } else {
          rawData = Array.from(rMsg.data);
        }

        const enc = encoding.toLowerCase();

        if (enc === 'rgb8') {
          for (let i = 0; i < width * height; i++) {
            pixels[i * 4] = rawData[i * 3];
            pixels[i * 4 + 1] = rawData[i * 3 + 1];
            pixels[i * 4 + 2] = rawData[i * 3 + 2];
            pixels[i * 4 + 3] = 255;
          }
        } else if (enc === 'bgr8') {
          for (let i = 0; i < width * height; i++) {
            pixels[i * 4] = rawData[i * 3 + 2];
            pixels[i * 4 + 1] = rawData[i * 3 + 1];
            pixels[i * 4 + 2] = rawData[i * 3];
            pixels[i * 4 + 3] = 255;
          }
        } else if (enc === 'mono8' || enc === '8uc1') {
          for (let i = 0; i < width * height; i++) {
            const v = rawData[i];
            pixels[i * 4] = v;
            pixels[i * 4 + 1] = v;
            pixels[i * 4 + 2] = v;
            pixels[i * 4 + 3] = 255;
          }
        } else if (enc === 'rgba8') {
          for (let i = 0; i < width * height; i++) {
            pixels[i * 4] = rawData[i * 4];
            pixels[i * 4 + 1] = rawData[i * 4 + 1];
            pixels[i * 4 + 2] = rawData[i * 4 + 2];
            pixels[i * 4 + 3] = rawData[i * 4 + 3];
          }
        } else if (enc === 'bgra8') {
          for (let i = 0; i < width * height; i++) {
            pixels[i * 4] = rawData[i * 4 + 2];
            pixels[i * 4 + 1] = rawData[i * 4 + 1];
            pixels[i * 4 + 2] = rawData[i * 4];
            pixels[i * 4 + 3] = rawData[i * 4 + 3];
          }
        } else if (enc === 'mono16' || enc === '16uc1') {
          for (let i = 0; i < width * height; i++) {
            // Take high byte for visualization
            const v = rawData[i * 2 + 1];
            pixels[i * 4] = v;
            pixels[i * 4 + 1] = v;
            pixels[i * 4 + 2] = v;
            pixels[i * 4 + 3] = 255;
          }
        } else {
          // Fallback: try rgb8 layout
          for (let i = 0; i < width * height; i++) {
            pixels[i * 4] = rawData[i * 3] ?? 0;
            pixels[i * 4 + 1] = rawData[i * 3 + 1] ?? 0;
            pixels[i * 4 + 2] = rawData[i * 3 + 2] ?? 0;
            pixels[i * 4 + 3] = 255;
          }
        }

        ctx.putImageData(imageData, 0, 0);
      }
    },
    [],
  );

  // Render on new message
  useEffect(() => {
    if (latestEvent) {
      renderImage(latestEvent.message, latestEvent.schemaName);
    }
  }, [latestEvent, renderImage]);

  // ResizeObserver for container-fit scaling
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const updateCanvasStyle = () => {
      if (zoom) {
        canvas.style.width = '';
        canvas.style.height = '';
        canvas.style.objectFit = '';
      } else {
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.objectFit = 'contain';
      }
    };

    updateCanvasStyle();

    const ro = new ResizeObserver(updateCanvasStyle);
    ro.observe(container);
    return () => ro.disconnect();
  }, [zoom]);

  const handleToggleZoom = useCallback(() => {
    setZoom((z) => !z);
  }, []);

  // Shared styles for toolbar controls
  const selectStyle = {
    flex: 1,
    background: 'var(--bg-surface-2)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle, #333)',
    borderRadius: 3,
    fontSize: 11,
    padding: '3px 6px',
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
            setFps(0);
            setResolution('');
            fpsAccumRef.current = [];
            lastTimestampRef.current = 0;
          }}
          style={selectStyle}
        >
          <option value="">Select image topic...</option>
          {imageTopics.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>

        {resolution && <span style={infoStyle}>{resolution}</span>}
        {fps > 0 && <span style={infoStyle}>{fps} Hz</span>}

        <button
          onClick={handleToggleZoom}
          style={{
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--border-subtle, #333)',
            color: zoom ? 'var(--accent)' : 'var(--text-secondary)',
            borderRadius: 3,
            fontSize: 11,
            padding: '3px 8px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          title={zoom ? 'Switch to fit-to-container' : 'Switch to 1:1 pixel zoom'}
        >
          {zoom ? '1:1' : 'Fit'}
        </button>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        onClick={handleToggleZoom}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: zoom ? 'auto' : 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-base, #0a0a0a)',
          cursor: 'pointer',
        }}
      >
        {!selectedTopic && (
          <div style={{ color: 'var(--text-tertiary, #666)', fontSize: 12 }}>
            Select an image topic to view
          </div>
        )}
        {selectedTopic && !latestEvent && (
          <div style={{ color: 'var(--text-tertiary, #666)', fontSize: 12 }}>
            Waiting for images on {selectedTopic}...
          </div>
        )}
        <canvas
          ref={canvasRef}
          style={{
            display: latestEvent ? 'block' : 'none',
            imageRendering: zoom ? 'pixelated' : 'auto',
          }}
        />
      </div>
    </div>
  );
}
