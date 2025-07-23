import {
  getOrCreateShape,
  isPointInShape,
  saveDrawingElementToDb,
  Tools,
} from "@/lib/canvas/canvas";
import { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useState } from "react";
import { Drawable } from "roughjs/bin/core";

const isShape = (tool: Tools) => {
  return tool !== "Eraser" && tool !== "Panning";
};

export default function useCanvasDrawings(
  selectedTool: Tools,
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

      if (isShape(selectedTool)) {
        const { startX, startY } = startingPoint;

        const endX = e.clientX;
        const endY = e.clientY;

        const width = endX - startX;
        const height = endY - startY;

        const newShape = getOrCreateShape(
          selectedTool,
          startX,
          startY,
          width,
          height
        );

        let newShapeId = Date.now().toString();
        if (roomId && userId) {
          newShapeId = await saveDrawingElementToDb(
            selectedTool,
            startX,
            startY,
            width,
            height,
            roomId,
            userId
          );
        }

        setExistingShapes((prev) => new Map(prev).set(newShapeId, newShape));

        setTempShape([]);
      }

      setIsDrawing(false);
      setStartingPoint(null);
    },
    [selectedTool, isDrawing, startingPoint, supabase, roomId, userId]
  );

  const handleOnMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing || !startingPoint) return;

      if (isShape(selectedTool)) {
        const { startX, startY } = startingPoint;
        const currentX = e.clientX;
        const currentY = e.clientY;

        const width = currentX - startX;
        const height = currentY - startY;

        const newShape = getOrCreateShape(
          selectedTool,
          startX,
          startY,
          width,
          height
        );

        // simplifying temp shape by always keeping it an array.
        setTempShape(Array.isArray(newShape) ? newShape : [newShape]);
      } else if (selectedTool === "Eraser") {
        // handleEraser(e, setExistingShapes);
        const { clientX, clientY } = e;
        setExistingShapes((prev) => {
          const newShapes = new Map(prev);
          newShapes.forEach(async (shape, id) => {
            if (isPointInShape(clientX, clientY, shape)) {
              newShapes.delete(id);
              if (supabase && roomId)
                await supabase.from("drawing_elements").delete().eq("id", id);
            }
          });
          return newShapes;
        });
      }
    },
    [selectedTool, isDrawing, startingPoint]
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
