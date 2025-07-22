import {
  getOrCreateShape,
  saveDrawingElementToDb,
  Shapes,
} from "@/lib/canvas/canvas";
import { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useState } from "react";
import { Drawable } from "roughjs/bin/core";

export default function useCanvasDrawings(
  selectedShape: Shapes,
  supabase: SupabaseClient | undefined,
  roomId: string | undefined,
  userId: string | undefined
) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [existingShapes, setExistingShapes] = useState(
    new Map<string, Drawable | Drawable[]>()
  );
  const [tempShape, setTempShape] = useState<Drawable[]>([]); // simplifying temp shape by always keeping it an array.
  const [startingPoint, setStartingPoint] = useState<{
    startX: number;
    startY: number;
  } | null>(null);

  const handleOnMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDrawing(true);
    setStartingPoint({ startX: e.clientX, startY: e.clientY });
  }, []);

  const handleOnMouseUp = useCallback(
    async (e: React.MouseEvent) => {
      if (!isDrawing || !startingPoint || !supabase) return;

      const { startX, startY } = startingPoint;

      const endX = e.clientX;
      const endY = e.clientY;

      const width = endX - startX;
      const height = endY - startY;

      const newShape = getOrCreateShape(
        selectedShape,
        startX,
        startY,
        width,
        height
      );

      let newShapeId = Date.now().toString();
      if (roomId && userId) {
        newShapeId = await saveDrawingElementToDb(
          selectedShape,
          startX,
          startY,
          width,
          height,
          roomId,
          userId
        );
      }

      setExistingShapes((prev) => new Map(prev).set(newShapeId, newShape));

      setIsDrawing(false);
      setStartingPoint(null);
      setTempShape([]);
    },
    [selectedShape, isDrawing, startingPoint, supabase, roomId, userId]
  );

  const handleOnMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing || !startingPoint) return;

      const { startX, startY } = startingPoint;
      const currentX = e.clientX;
      const currentY = e.clientY;

      const width = currentX - startX;
      const height = currentY - startY;

      const newShape = getOrCreateShape(
        selectedShape,
        startX,
        startY,
        width,
        height
      );

      // simplifying temp shape by always keeping it an array.
      setTempShape(Array.isArray(newShape) ? newShape : [newShape]);
    },
    [selectedShape, isDrawing, startingPoint]
  );

  return {
    existingShapes,
    setExistingShapes,
    tempShape,
    handleOnMouseDown,
    handleOnMouseMove,
    handleOnMouseUp,
  };
}
