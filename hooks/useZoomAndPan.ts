import { useState, useCallback, useRef, useEffect } from "react";

export default function useZoomAndPan(
  zoom: number,
  setZoom: React.Dispatch<React.SetStateAction<number>>,
  panOffset: { x: number; y: number },
  setPanOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>,
  isSpacePressed: boolean,
  selectedTool: string
) {
  const [isPanning, setIsPanning] = useState(false);
  const panStartPoint = useRef<{ x: number; y: number } | null>(null);
  const animationFrameId = useRef<number | null>(null);

  const handleZoom = useCallback(
    (delta: number, zoomOrigin?: { x: number; y: number }) => {
      const origin = zoomOrigin || {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      };
      const newZoom = Math.max(0.1, Math.min(20, zoom + delta));
      const worldPoint = {
        x: (origin.x - panOffset.x) / zoom,
        y: (origin.y - panOffset.y) / zoom,
      };
      const newPanOffset = {
        x: origin.x - worldPoint.x * newZoom,
        y: origin.y - worldPoint.y * newZoom,
      };
      setZoom(newZoom);
      setPanOffset(newPanOffset);
    },
    [zoom, panOffset, setZoom, setPanOffset]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (selectedTool === "Panning" || isSpacePressed) {
        setIsPanning(true);
        panStartPoint.current = { x: e.pageX, y: e.pageY };
      }
    },
    [isSpacePressed, selectedTool]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning && panStartPoint.current) {
        const deltaX = e.pageX - panStartPoint.current.x;
        const deltaY = e.pageY - panStartPoint.current.y;
        setPanOffset((prev) => ({
          x: prev.x + deltaX,
          y: prev.y + deltaY,
        }));
        panStartPoint.current = { x: e.pageX, y: e.pageY };
      }
    },
    [isPanning, setPanOffset]
  );

  const handleMouseUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      panStartPoint.current = null;
    }
  }, [isPanning]);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();

      if (e.ctrlKey) {
        let delta = -e.deltaY * 0.03;
        if (Math.abs(e.deltaY) > 10) {
          delta = -Math.sign(e.deltaY) * 0.1;
        }
        handleZoom(delta, { x: e.pageX, y: e.pageY });
      } else if (e.shiftKey) {
        // Horizontal panning with Shift + Wheel
        // Most mice send horizontal scroll data in deltaX, but some trackpads might use deltaY.
        // This prioritizes deltaX but falls back to deltaY for broader compatibility.
        const scrollDelta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
        setPanOffset((prev) => ({
          x: prev.x - scrollDelta,
          y: prev.y, // Do not change the Y-axis
        }));
      } else {
        setPanOffset((prev) => ({
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        }));
      }
    },
    [handleZoom, setPanOffset]
  );

  // Pan loop for smooth updates
  const panLoop = useCallback(() => {
    animationFrameId.current = requestAnimationFrame(panLoop);
  }, []);

  useEffect(() => {
    animationFrameId.current = requestAnimationFrame(panLoop);
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [panLoop]);

  return {
    isPanning,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    handleZoom,
  };
}
