import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Box,
  Paper,
  IconButton,
  Slider,
  Tooltip,
  Typography,
  Button,
  Chip,
  Stack,
  Divider,
  Switch,
  FormControlLabel,
} from '@mui/material';
import BrushIcon from '@mui/icons-material/Brush';
import HighlightIcon from '@mui/icons-material/Highlight';
import BlurOnIcon from '@mui/icons-material/BlurOn';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import PanoramaFishEyeIcon from '@mui/icons-material/PanoramaFishEye';
import FormatColorFillIcon from '@mui/icons-material/FormatColorFill';
import AutoFixNormalIcon from '@mui/icons-material/AutoFixNormal';
import UndoIcon from '@mui/icons-material/Undo';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import DownloadIcon from '@mui/icons-material/Download';
import GridOnIcon from '@mui/icons-material/GridOn';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CreateIcon from '@mui/icons-material/Create';
import { DrawStrokePayload, DrawToolType, StrokePoint } from '../types/game';

const COLOR_PALETTE = [
  '#0f172a', '#475569', '#94a3b8', '#ffffff',
  '#ef4444', '#dc2626', '#f97316', '#f59e0b',
  '#eab308', '#facc15', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#2563eb', '#6366f1', '#8b5cf6',
  '#a855f7', '#d946ef', '#ec4899', '#78350f',
];

const BRUSH_PRESETS = [
  { label: 'S', size: 4 },
  { label: 'M', size: 10 },
  { label: 'L', size: 20 },
  { label: 'XL', size: 34 },
];

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 520;
const CANVAS_BG = '#ffffff';

function hexToRgba(hex: string): [number, number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b, 255];
  }
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return [r, g, b, 255];
}

function floodFillCanvas(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  fillHex: string
) {
  const x0 = Math.max(0, Math.min(CANVAS_WIDTH - 1, Math.floor(startX)));
  const y0 = Math.max(0, Math.min(CANVAS_HEIGHT - 1, Math.floor(startY)));

  const imageData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const data = imageData.data;
  const [fillR, fillG, fillB, fillA] = hexToRgba(fillHex);

  const startIdx = (y0 * CANVAS_WIDTH + x0) * 4;
  const targetR = data[startIdx];
  const targetG = data[startIdx + 1];
  const targetB = data[startIdx + 2];
  const targetA = data[startIdx + 3];

  if (
    Math.abs(targetR - fillR) <= 4 &&
    Math.abs(targetG - fillG) <= 4 &&
    Math.abs(targetB - fillB) <= 4 &&
    Math.abs(targetA - fillA) <= 4
  ) {
    return;
  }

  const tolerance = 24;
  const matchesTarget = (idx: number) =>
    Math.abs(data[idx] - targetR) <= tolerance &&
    Math.abs(data[idx + 1] - targetG) <= tolerance &&
    Math.abs(data[idx + 2] - targetB) <= tolerance &&
    Math.abs(data[idx + 3] - targetA) <= tolerance;

  const visited = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
  const stack: number[] = [x0, y0];

  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    let lx = x;

    while (lx >= 0 && !visited[y * CANVAS_WIDTH + lx] && matchesTarget((y * CANVAS_WIDTH + lx) * 4)) {
      lx--;
    }
    lx++;

    let spanAbove = false;
    let spanBelow = false;

    while (
      lx < CANVAS_WIDTH &&
      !visited[y * CANVAS_WIDTH + lx] &&
      matchesTarget((y * CANVAS_WIDTH + lx) * 4)
    ) {
      const pixelPos = y * CANVAS_WIDTH + lx;
      visited[pixelPos] = 1;
      const idx = pixelPos * 4;
      data[idx] = fillR;
      data[idx + 1] = fillG;
      data[idx + 2] = fillB;
      data[idx + 3] = fillA;

      if (y > 0) {
        const aboveMatches =
          !visited[(y - 1) * CANVAS_WIDTH + lx] && matchesTarget(((y - 1) * CANVAS_WIDTH + lx) * 4);
        if (!spanAbove && aboveMatches) {
          stack.push(lx, y - 1);
          spanAbove = true;
        } else if (spanAbove && !aboveMatches) {
          spanAbove = false;
        }
      }

      if (y < CANVAS_HEIGHT - 1) {
        const belowMatches =
          !visited[(y + 1) * CANVAS_WIDTH + lx] && matchesTarget(((y + 1) * CANVAS_WIDTH + lx) * 4);
        if (!spanBelow && belowMatches) {
          stack.push(lx, y + 1);
          spanBelow = true;
        } else if (spanBelow && !belowMatches) {
          spanBelow = false;
        }
      }

      lx++;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

interface DrawingCanvasProps {
  isDrawer: boolean;
  drawerName: string;
  secretWord: string | null;
  wordHint: string | null;
  strokes: DrawStrokePayload[];
  onEmitStroke: (stroke: DrawStrokePayload) => void;
  onUndoStroke: (strokeId?: string) => void;
  onClearCanvas: () => void;
  onRevealHint: () => void;
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  isDrawer,
  drawerName,
  secretWord,
  wordHint,
  strokes,
  onEmitStroke,
  onUndoStroke,
  onClearCanvas,
  onRevealHint,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef<boolean>(false);
  const currentPointsRef = useRef<StrokePoint[]>([]);
  const activeStrokeGroupIdRef = useRef<string>('');
  const snapshotRef = useRef<ImageData | null>(null);

  const [tool, setTool] = useState<DrawToolType>('brush');
  const [color, setColor] = useState<string>('#0f172a');
  const [brushSize, setBrushSize] = useState<number>(8);
  const [shapeFilled, setShapeFilled] = useState<boolean>(false);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [cursorPos, setCursorPos] = useState<StrokePoint | null>(null);

  const isShapeTool = tool === 'line' || tool === 'rect' || tool === 'circle';

  const renderStrokeOnContext = useCallback(
    (ctx: CanvasRenderingContext2D, stroke: DrawStrokePayload) => {
      if (!stroke.points || stroke.points.length === 0) return;

      if (stroke.tool === 'fill') {
        const pt = stroke.points[0];
        floodFillCanvas(ctx, pt.x, pt.y, stroke.color);
        return;
      }

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = stroke.brush_size;
      const strokeColor = stroke.tool === 'eraser' ? CANVAS_BG : stroke.color;
      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = strokeColor;
      ctx.globalAlpha =
        stroke.tool === 'marker' ? 0.36 : stroke.opacity !== undefined ? stroke.opacity : 1.0;

      if (stroke.tool === 'spray') {
        const radius = Math.max(6, stroke.brush_size * 1.4);
        const density = Math.min(40, Math.max(12, Math.round(stroke.brush_size * 1.5)));
        for (const pt of stroke.points) {
          for (let i = 0; i < density; i++) {
            // Deterministic pseudo-random offset from point coordinates + index
            const seed = Math.sin(pt.x * 12.9898 + pt.y * 78.233 + i * 4.1415) * 43758.5453;
            const frac = seed - Math.floor(seed);
            const angle = frac * Math.PI * 2;
            const r = ((i + 1) / density) * radius * ((seed * 1.7) - Math.floor(seed * 1.7));
            const dx = Math.cos(angle) * r;
            const dy = Math.sin(angle) * r;
            ctx.fillRect(pt.x + dx, pt.y + dy, 1.8, 1.8);
          }
        }
        ctx.restore();
        return;
      }

      if (stroke.tool === 'line') {
        const p1 = stroke.points[0];
        const p2 = stroke.points[stroke.points.length - 1];
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.restore();
        return;
      }

      if (stroke.tool === 'rect') {
        const p1 = stroke.points[0];
        const p2 = stroke.points[stroke.points.length - 1];
        const rx = Math.min(p1.x, p2.x);
        const ry = Math.min(p1.y, p2.y);
        const rw = Math.abs(p2.x - p1.x);
        const rh = Math.abs(p2.y - p1.y);
        if (stroke.filled) {
          ctx.fillRect(rx, ry, rw, rh);
        } else {
          ctx.strokeRect(rx, ry, rw, rh);
        }
        ctx.restore();
        return;
      }

      if (stroke.tool === 'circle') {
        const p1 = stroke.points[0];
        const p2 = stroke.points[stroke.points.length - 1];
        const cx = (p1.x + p2.x) / 2;
        const cy = (p1.y + p2.y) / 2;
        const rx = Math.max(1, Math.abs(p2.x - p1.x) / 2);
        const ry = Math.max(1, Math.abs(p2.y - p1.y) / 2);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (stroke.filled) {
          ctx.fill();
        } else {
          ctx.stroke();
        }
        ctx.restore();
        return;
      }

      // Default: 'brush', 'marker', 'eraser' with smooth quadratic curves
      ctx.beginPath();
      const pts = stroke.points;
      if (pts.length === 1) {
        ctx.arc(pts[0].x, pts[0].y, stroke.brush_size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (pts.length === 2) {
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.stroke();
      } else {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const midX = (pts[i].x + pts[i + 1].x) / 2;
          const midY = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
        }
        const last = pts[pts.length - 1];
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
      }
      ctx.restore();
    },
    []
  );

  // Redraw entire stroke history whenever `strokes` updates
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = CANVAS_BG;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    for (const s of strokes) {
      renderStrokeOnContext(ctx, s);
    }
  }, [strokes, renderStrokeOnContext]);

  // Keyboard Ctrl+Z shortcut for Drawer Undo
  useEffect(() => {
    if (!isDrawer) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        onUndoStroke();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawer, onUndoStroke]);

  const getNormalizedCoords = (
    clientX: number,
    clientY: number
  ): StrokePoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    return {
      x: Math.round((clientX - rect.left) * scaleX * 10) / 10,
      y: Math.round((clientY - rect.top) * scaleY * 10) / 10,
    };
  };

  const startDrawing = (pt: StrokePoint | null) => {
    if (!isDrawer || !pt) return;

    const groupId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    activeStrokeGroupIdRef.current = groupId;

    // Immediate Flood Fill on single click/tap
    if (tool === 'fill') {
      const fillStroke: DrawStrokePayload = {
        stroke_id: groupId,
        tool: 'fill',
        color,
        brush_size: 1,
        points: [pt],
      };
      onEmitStroke(fillStroke);
      return;
    }

    isDrawingRef.current = true;
    currentPointsRef.current = [pt];

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      if (isShapeTool) {
        snapshotRef.current = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      } else {
        renderStrokeOnContext(ctx, {
          stroke_id: groupId,
          tool,
          color,
          brush_size: brushSize,
          opacity: tool === 'marker' ? 0.36 : 1.0,
          points: [pt],
        });
      }
    }
  };

  const moveDrawing = (pt: StrokePoint | null) => {
    if (pt) {
      setCursorPos(pt);
    }
    if (!isDrawer || !isDrawingRef.current || !pt) return;

    const pts = currentPointsRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');

    if (isShapeTool) {
      pts[1] = pt;
      if (ctx && snapshotRef.current) {
        ctx.putImageData(snapshotRef.current, 0, 0);
        renderStrokeOnContext(ctx, {
          stroke_id: activeStrokeGroupIdRef.current,
          tool,
          color,
          brush_size: brushSize,
          filled: shapeFilled,
          points: [pts[0], pt],
        });
      }
      return;
    }

    const prevPt = pts[pts.length - 1];
    pts.push(pt);

    if (ctx && prevPt) {
      renderStrokeOnContext(ctx, {
        stroke_id: activeStrokeGroupIdRef.current,
        tool,
        color,
        brush_size: brushSize,
        opacity: tool === 'marker' ? 0.36 : 1.0,
        points: [prevPt, pt],
      });
    }

    // Stream incremental segments for freehand tools (sharing the same stroke_id so Undo removes the whole stroke!)
    if (pts.length >= 4) {
      const segment = pts.slice();
      onEmitStroke({
        stroke_id: activeStrokeGroupIdRef.current,
        tool,
        color,
        brush_size: brushSize,
        opacity: tool === 'marker' ? 0.36 : 1.0,
        points: segment,
      });
      currentPointsRef.current = [pt];
    }
  };

  const finishDrawing = () => {
    if (!isDrawer || !isDrawingRef.current) return;
    isDrawingRef.current = false;
    snapshotRef.current = null;

    const pts = currentPointsRef.current;
    if (pts.length > 0) {
      onEmitStroke({
        stroke_id: activeStrokeGroupIdRef.current,
        tool,
        color,
        brush_size: brushSize,
        filled: shapeFilled,
        opacity: tool === 'marker' ? 0.36 : 1.0,
        points: pts.slice(),
      });
    }
    currentPointsRef.current = [];
  };

  const handleDownloadSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `sketchsync-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // Render Scrabble-style arcade letter tiles for secretWord or wordHint
  const renderWordTiles = () => {
    if (isDrawer && secretWord) {
      const chars = secretWord.toUpperCase().split('');
      return (
        <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap" useFlexGap>
          {chars.map((ch, idx) =>
            ch === ' ' ? (
              <Box key={idx} sx={{ width: 14 }} />
            ) : (
              <Box
                key={idx}
                sx={{
                  minWidth: 30,
                  height: 36,
                  px: 0.8,
                  borderRadius: 1.5,
                  bgcolor: '#0284c7',
                  border: '2px solid #7dd3fc',
                  boxShadow: '0 3px 0 #0369a1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: "'Fredoka', sans-serif",
                  fontWeight: 700,
                  fontSize: '1.1rem',
                  color: '#ffffff',
                }}
              >
                {ch}
              </Box>
            )
          )}
        </Stack>
      );
    }

    const rawHint = wordHint || '_ _ _ _ _';
    const tokens = rawHint.split(' ');
    const letterCount = tokens.filter((t) => t !== '').length;

    return (
      <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap" useFlexGap>
        {tokens.map((tok, idx) =>
          tok === '' ? (
            <Box key={idx} sx={{ width: 10 }} />
          ) : (
            <Box
              key={idx}
              sx={{
                minWidth: 28,
                height: 34,
                px: 0.6,
                borderRadius: 1.5,
                bgcolor: tok !== '_' ? 'rgba(34, 197, 94, 0.25)' : 'rgba(15, 23, 42, 0.85)',
                border:
                  tok !== '_'
                    ? '2px solid #4ade80'
                    : '2px solid rgba(168, 85, 247, 0.55)',
                boxShadow: '0 3px 0 rgba(0,0,0,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 800,
                fontSize: '1rem',
                color: tok !== '_' ? '#4ade80' : '#e2e8f0',
              }}
            >
              {tok === '_' ? '' : tok}
            </Box>
          )
        )}
        <Chip
          label={`${letterCount} letters`}
          size="small"
          sx={{
            ml: 1,
            fontWeight: 800,
            bgcolor: 'rgba(168, 85, 247, 0.2)',
            color: '#d8b4fe',
            border: '1px solid rgba(168, 85, 247, 0.4)',
          }}
        />
      </Stack>
    );
  };

  const TOOL_ITEMS: { id: DrawToolType; short: string; label: string; icon: React.ReactNode }[] = [
    { id: 'brush', short: 'Pen', label: 'Smooth Freehand Pen', icon: <BrushIcon fontSize="small" /> },
    { id: 'marker', short: 'Marker', label: 'Highlighter Marker', icon: <HighlightIcon fontSize="small" /> },
    { id: 'spray', short: 'Spray', label: 'Spray Paint Can', icon: <BlurOnIcon fontSize="small" /> },
    { id: 'line', short: 'Line', label: 'Straight Line (Click & Drag)', icon: <ShowChartIcon fontSize="small" /> },
    { id: 'rect', short: 'Rect', label: 'Rectangle (Click & Drag)', icon: <CropSquareIcon fontSize="small" /> },
    { id: 'circle', short: 'Circle', label: 'Circle / Ellipse (Click & Drag)', icon: <PanoramaFishEyeIcon fontSize="small" /> },
    { id: 'fill', short: 'Fill', label: 'Paint Bucket Flood Fill', icon: <FormatColorFillIcon fontSize="small" /> },
    { id: 'eraser', short: 'Eraser', label: 'Eraser Tool', icon: <AutoFixNormalIcon fontSize="small" /> },
  ];

  return (
    <Paper
      elevation={10}
      sx={{
        p: 2,
        borderRadius: 4,
        bgcolor: 'rgba(30, 41, 59, 0.92)',
        backdropFilter: 'blur(12px)',
        border: isDrawer ? '2px solid #38bdf8' : '2px solid rgba(168, 85, 247, 0.35)',
        boxShadow: isDrawer
          ? '0 10px 30px -5px rgba(56, 189, 248, 0.22)'
          : '0 10px 30px -5px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      }}
    >
      {/* Top Arcade Role & Word Tile Banner */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.5,
          px: 2,
          py: 1.25,
          borderRadius: 3,
          background: isDrawer
            ? 'linear-gradient(135deg, rgba(2, 132, 199, 0.24), rgba(56, 189, 248, 0.1))'
            : 'linear-gradient(135deg, rgba(126, 34, 206, 0.24), rgba(168, 85, 247, 0.1))',
          border: isDrawer
            ? '1px solid rgba(56, 189, 248, 0.45)'
            : '1px solid rgba(168, 85, 247, 0.45)',
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip
            icon={isDrawer ? <CreateIcon /> : <VisibilityIcon />}
            label={isDrawer ? 'YOUR TURN TO DRAW!' : `${drawerName.toUpperCase()} IS DRAWING`}
            color={isDrawer ? 'info' : 'secondary'}
            sx={{
              fontFamily: "'Fredoka', sans-serif",
              fontWeight: 700,
              letterSpacing: 0.6,
            }}
          />
          {isDrawer && (
            <Tooltip title="Reveal 1 random letter hint to help guessers">
              <Button
                size="small"
                variant="outlined"
                color="warning"
                startIcon={<LightbulbIcon />}
                onClick={onRevealHint}
                sx={{
                  borderRadius: 2,
                  fontWeight: 700,
                  textTransform: 'none',
                  py: 0.3,
                }}
              >
                Give Hint
              </Button>
            </Tooltip>
          )}
        </Stack>

        <Box>{renderWordTiles()}</Box>
      </Box>

      {/* Main Shared Canvas Surface + Optional Grid + Live Brush Ring Cursor */}
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
          bgcolor: '#ffffff',
          borderRadius: 3,
          overflow: 'hidden',
          boxShadow: 'inset 0 0 0 2px rgba(15, 23, 42, 0.15), 0 6px 18px rgba(0,0,0,0.35)',
          cursor: isDrawer
            ? tool === 'fill'
              ? 'cell'
              : 'crosshair'
            : 'default',
          touchAction: 'none',
        }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onMouseDown={(e) => startDrawing(getNormalizedCoords(e.clientX, e.clientY))}
          onMouseMove={(e) => moveDrawing(getNormalizedCoords(e.clientX, e.clientY))}
          onMouseUp={finishDrawing}
          onMouseLeave={() => {
            setCursorPos(null);
            finishDrawing();
          }}
          onTouchStart={(e) => {
            if (!isDrawer) return;
            e.preventDefault();
            const t = e.touches[0];
            if (t) startDrawing(getNormalizedCoords(t.clientX, t.clientY));
          }}
          onTouchMove={(e) => {
            if (!isDrawer) return;
            e.preventDefault();
            const t = e.touches[0];
            if (t) moveDrawing(getNormalizedCoords(t.clientX, t.clientY));
          }}
          onTouchEnd={(e) => {
            if (!isDrawer) return;
            e.preventDefault();
            finishDrawing();
          }}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
          }}
        />

        {/* Optional Drawing Reference Grid Overlay (Drawer Helper) */}
        {showGrid && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              backgroundImage:
                'linear-gradient(to right, rgba(15, 23, 42, 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(15, 23, 42, 0.08) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
        )}

        {/* Live Circular Brush Size Preview Cursor */}
        {isDrawer && cursorPos && tool !== 'fill' && !isShapeTool && (
          <Box
            sx={{
              position: 'absolute',
              left: `${(cursorPos.x / CANVAS_WIDTH) * 100}%`,
              top: `${(cursorPos.y / CANVAS_HEIGHT) * 100}%`,
              width: `${Math.max(6, (brushSize / CANVAS_WIDTH) * 100 * 7.5)}px`,
              height: `${Math.max(6, (brushSize / CANVAS_WIDTH) * 100 * 7.5)}px`,
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              border:
                tool === 'eraser'
                  ? '2px dashed #0f172a'
                  : `2px solid ${color === '#ffffff' ? '#0f172a' : color}`,
              bgcolor:
                tool === 'eraser'
                  ? 'rgba(255,255,255,0.6)'
                  : `${color}33`,
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Save PNG Snapshot Floating Action in Corner */}
        <Tooltip title="Download Drawing as PNG">
          <IconButton
            size="small"
            onClick={handleDownloadSnapshot}
            sx={{
              position: 'absolute',
              bottom: 10,
              right: 10,
              bgcolor: 'rgba(15, 23, 42, 0.72)',
              color: '#f8fafc',
              '&:hover': { bgcolor: 'rgba(15, 23, 42, 0.9)' },
            }}
          >
            <DownloadIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Studio Drawing Dock for Drawer vs Spectator Bar for Guessers */}
      {isDrawer ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
            p: 1.5,
            borderRadius: 3,
            bgcolor: 'rgba(15, 23, 42, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          {/* Row 1: Drawing Tools + Shape Fill Toggle + Undo / Grid / Clear */}
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            flexWrap="wrap"
            gap={1}
          >
            {/* 8 Real Drawing Tools */}
            <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap>
              {TOOL_ITEMS.map((item) => {
                const selected = tool === item.id;
                return (
                  <Tooltip title={item.label} key={item.id}>
                    <Button
                      size="small"
                      variant={selected ? 'contained' : 'outlined'}
                      color={item.id === 'eraser' ? 'warning' : 'primary'}
                      startIcon={item.icon}
                      onClick={() => setTool(item.id)}
                      sx={{
                        px: 1.4,
                        py: 0.65,
                        borderRadius: 2,
                        fontWeight: 800,
                        textTransform: 'none',
                        borderColor: selected
                          ? undefined
                          : 'rgba(255,255,255,0.16)',
                      }}
                    >
                      {item.short}
                    </Button>
                  </Tooltip>
                );
              })}

              {(tool === 'rect' || tool === 'circle') && (
                <FormControlLabel
                  sx={{ ml: 1 }}
                  control={
                    <Switch
                      size="small"
                      checked={shapeFilled}
                      onChange={(e) => setShapeFilled(e.target.checked)}
                    />
                  }
                  label={
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                      Fill Shape
                    </Typography>
                  }
                />
              )}
            </Stack>

            {/* Undo / Grid / Clear Actions */}
            <Stack direction="row" spacing={1} alignItems="center">
              <Tooltip title="Toggle Reference Grid">
                <IconButton
                  size="small"
                  color={showGrid ? 'info' : 'default'}
                  onClick={() => setShowGrid((g) => !g)}
                  sx={{
                    bgcolor: showGrid
                      ? 'rgba(56, 189, 248, 0.2)'
                      : 'rgba(255,255,255,0.05)',
                  }}
                >
                  <GridOnIcon fontSize="small" />
                </IconButton>
              </Tooltip>

              <Tooltip title="Undo Last Stroke (Ctrl+Z)">
                <span>
                  <Button
                    size="small"
                    variant="outlined"
                    color="info"
                    disabled={strokes.length === 0}
                    startIcon={<UndoIcon />}
                    onClick={() => onUndoStroke()}
                    sx={{ fontWeight: 700, textTransform: 'none', borderRadius: 2 }}
                  >
                    Undo
                  </Button>
                </span>
              </Tooltip>

              <Button
                size="small"
                variant="outlined"
                color="error"
                startIcon={<DeleteSweepIcon />}
                onClick={onClearCanvas}
                sx={{ fontWeight: 700, textTransform: 'none', borderRadius: 2 }}
              >
                Clear
              </Button>
            </Stack>
          </Stack>

          <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

          {/* Row 2: 24-Color Arcade Palette + Custom Color Input + Brush Size Presets & Slider */}
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'center' }}
            spacing={2}
          >
            {/* Color Swatches + Custom Color Picker */}
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              {/* Active Color Indicator + Custom Picker */}
              <Tooltip title="Click to pick any custom color">
                <Box
                  component="label"
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 2,
                    bgcolor: color,
                    border: '3px solid #38bdf8',
                    boxShadow: '0 0 12px rgba(56,189,248,0.4)',
                    cursor: 'pointer',
                    display: 'inline-block',
                    position: 'relative',
                    overflow: 'hidden',
                    mr: 0.5,
                  }}
                >
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => {
                      setColor(e.target.value);
                      if (tool === 'eraser') setTool('brush');
                    }}
                    style={{
                      opacity: 0,
                      width: '100%',
                      height: '100%',
                      cursor: 'pointer',
                    }}
                  />
                </Box>
              </Tooltip>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(12, 24px)',
                  gap: 0.6,
                }}
              >
                {COLOR_PALETTE.map((swatch) => {
                  const isSelected = tool !== 'eraser' && color.toLowerCase() === swatch.toLowerCase();
                  return (
                    <Tooltip title={swatch} key={swatch}>
                      <Box
                        onClick={() => {
                          setColor(swatch);
                          if (tool === 'eraser') setTool('brush');
                        }}
                        sx={{
                          width: 24,
                          height: 24,
                          borderRadius: 1.2,
                          bgcolor: swatch,
                          cursor: 'pointer',
                          border: isSelected
                            ? '2px solid #38bdf8'
                            : '1px solid rgba(255,255,255,0.25)',
                          transform: isSelected ? 'scale(1.18)' : 'scale(1)',
                          boxShadow: isSelected
                            ? '0 0 8px rgba(56, 189, 248, 0.75)'
                            : 'none',
                          transition: 'all 0.12s ease',
                        }}
                      />
                    </Tooltip>
                  );
                })}
              </Box>
            </Stack>

            {/* Brush Size Quick Dots + Fine Slider */}
            <Stack direction="row" spacing={1.2} alignItems="center">
              {BRUSH_PRESETS.map((preset) => {
                const active = brushSize === preset.size;
                return (
                  <Tooltip title={`Size ${preset.size}px`} key={preset.label}>
                    <Box
                      onClick={() => setBrushSize(preset.size)}
                      sx={{
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        bgcolor: active
                          ? 'rgba(56, 189, 248, 0.25)'
                          : 'rgba(255,255,255,0.05)',
                        border: active
                          ? '2px solid #38bdf8'
                          : '1px solid rgba(255,255,255,0.15)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <Box
                        sx={{
                          width: Math.max(4, Math.min(20, preset.size * 0.6)),
                          height: Math.max(4, Math.min(20, preset.size * 0.6)),
                          borderRadius: '50%',
                          bgcolor: active ? '#38bdf8' : '#cbd5e1',
                        }}
                      />
                    </Box>
                  </Tooltip>
                );
              })}

              <Box sx={{ width: 110, px: 0.5 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 700, display: 'block', lineHeight: 1.1 }}
                >
                  {brushSize}px
                </Typography>
                <Slider
                  size="small"
                  min={2}
                  max={50}
                  value={brushSize}
                  onChange={(_, val) => setBrushSize(val as number)}
                />
              </Box>
            </Stack>
          </Stack>
        </Box>
      ) : (
        <Box
          sx={{
            px: 2,
            py: 1,
            borderRadius: 2.5,
            bgcolor: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography variant="body2" sx={{ color: '#cbd5e1', fontWeight: 600 }}>
            🎨 Live Studio Feed — Watch <strong>{drawerName}</strong>'s strokes and submit your guess!
          </Typography>
          <Chip
            label={`${strokes.length} strokes`}
            size="small"
            variant="outlined"
            sx={{ fontWeight: 700, height: 22 }}
          />
        </Box>
      )}
    </Paper>
  );
};
