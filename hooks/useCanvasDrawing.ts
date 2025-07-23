import {
  CanvasElement,
  getOrCreateShape,
  isPointOnShapeBorder,
  saveDrawingElementToDb,
  Tools,
} from "@/lib/canvas/canvas";
import { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useState } from "react";
import { Drawable } from "roughjs/bin/core";

const isShape = (tool: Tools) => {
  return tool !== "Eraser" && tool !== "Panning";
};

const DELETION_STROKE_STYLE = {
  stroke: "rgba(0, 0, 0, 0.3)",
  strokeWidth: 2,
};

export default function useCanvasDrawings(
  selectedTool: Tools,
  supabase: SupabaseClient | undefined,
  roomId: string | undefined,
  userId: string | undefined
) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [elementsToDelete, setElementsToDelete] = useState<
    Map<string, Drawable | Drawable[]>
  >(new Map());
  const [existingShapes, setExistingShapes] = useState<
    Map<string, CanvasElement>
  >(new Map());
  const [tempShape, setTempShape] = useState<Drawable[]>([]); // simplifying temp shape by always keeping it an array ( array is required for arrowed line ).
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

        const shape = {
          type: selectedTool,
          x: startX,
          y: startY,
          width,
          height,
          shape: newShape,
        };
        setExistingShapes((prev) => new Map(prev).set(newShapeId, shape));

        setTempShape([]);
      } else if (selectedTool === "Eraser") {
        if (roomId) {
          await supabase
            .from("drawing_elements")
            .delete()
            .in("id", Array.from(elementsToDelete.keys()));
        }

        setExistingShapes((prev) => {
          const newShapes = new Map(prev);
          elementsToDelete.forEach((ele, id) => {
            newShapes.delete(id);
          });
          return newShapes;
        });
      }

      setIsDrawing(false);
      setStartingPoint(null);
      setElementsToDelete(new Map()); // clear the set
    },
    [
      selectedTool,
      isDrawing,
      startingPoint,
      supabase,
      roomId,
      userId,
      elementsToDelete,
    ]
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
        const { clientX, clientY } = e;

        let changed = false;
        const newElementsToDelete = new Map(elementsToDelete);

        existingShapes.forEach((element, id) => {
          if (
            isPointOnShapeBorder(clientX, clientY, element) &&
            !elementsToDelete.has(id)
          ) {
            const translucentShape = getOrCreateShape(
              element.type,
              element.x,
              element.y,
              element.width,
              element.height,
              DELETION_STROKE_STYLE
            );

            newElementsToDelete.set(id, translucentShape);
            changed = true;
          }
        });

        if (changed) {
          setElementsToDelete(newElementsToDelete);
        }
      }
    },
    [selectedTool, isDrawing, startingPoint, existingShapes, elementsToDelete]
  );

  return {
    existingShapes,
    setExistingShapes,
    tempShape,
    elementsToDelete,
    handleOnMouseDown,
    handleOnMouseMove,
    handleOnMouseUp,
  };
}
