import {
  CanvasElement,
  getOrCreateShape,
  detectElementsToDelete,
  saveCanvasElementToDb,
  Tools,
  deleteElements,
} from "@/lib/canvas/canvas";
import { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useState } from "react";
import { Drawable } from "roughjs/bin/core";

const isShape = (tool: Tools) => {
  return tool !== "Eraser" && tool !== "Panning";
};

export default function useCanvasDrawings(
  ctx: CanvasRenderingContext2D | null,
  selectedTool: Tools,
  supabase: SupabaseClient | undefined,
  roomId: string | undefined,
  userId: string | undefined
) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [typingConfig, setTypingConfig] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [elementsToDelete, setElementsToDelete] = useState<
    Map<string, CanvasElement & { translucent: boolean }>
  >(new Map());
  const [existingShapes, setExistingShapes] = useState<
    Map<string, CanvasElement>
  >(new Map());
  const [tempShape, setTempShape] = useState<Drawable[]>([]); // simplifying temp shape by always keeping it an array ( array is required for arrowed line ).
  const [startingPoint, setStartingPoint] = useState<{
    startX: number;
    startY: number;
  } | null>(null);

  const handleTextareaBlur = useCallback(
    async (text: string, width: number, height: number, lineHeight: number) => {
      if (!typingConfig) return;

      if (!text.trim()) {
        setTypingConfig(null);
        return;
      }

      const newTextElement: Omit<CanvasElement, "shape"> = {
        type: "Text",
        x: typingConfig.x,
        y: typingConfig.y,
        width,
        height,
        text: {
          content: text.trim(),
          lineHeight,
          size: "md",
          alignment: "Left",
          fontFamily: "Excalifont",
        },
      };

      let newShapeId = Date.now().toString();
      if (supabase && roomId && userId) {
        newShapeId = await saveCanvasElementToDb(
          newTextElement,
          roomId,
          userId
        );
      }

      setExistingShapes((prev) =>
        new Map(prev).set(newShapeId, newTextElement)
      );
      setTypingConfig(null);
    },
    [typingConfig, roomId, userId, supabase]
  );

  const resizeTextarea = useCallback((textarea: HTMLTextAreaElement) => {
    if (textarea) {
      // Measure width using Canvas API
      const lines = textarea.value.split("\n");

      textarea.style.height = "auto";
      if (lines.length > 1)
        textarea.style.height = textarea.scrollHeight + "px";

      const font = window.getComputedStyle(textarea).font;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (context) {
        context.font = font;
        const maxWidth = Math.max(
          ...lines.map((line) => context.measureText(line || " ").width)
        );
        textarea.style.width = `${Math.ceil(maxWidth)}px`;
      }
    }
  }, []);

  const handleOnMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (selectedTool !== "Text") {
        setStartingPoint({ startX: e.clientX, startY: e.clientY });
        setIsDrawing(true);
        setTypingConfig(null);
      } else {
        if (!ctx || typingConfig) return;

        setTypingConfig({ x: e.clientX, y: e.clientY });
        setIsDrawing(false);
      }
    },
    [selectedTool, typingConfig, ctx]
  );

  const handleOnMouseUp = useCallback(
    async (e: React.MouseEvent) => {
      if (!isDrawing || !startingPoint || !supabase) return;

      if (isShape(selectedTool) && selectedTool !== "Text") {
        const { startX, startY } = startingPoint;

        const endX = e.clientX;
        const endY = e.clientY;

        const width = endX - startX;
        const height = endY - startY;

        // the main Drawable shape, which is used to draw shape on canvas
        const drawableShape = getOrCreateShape(
          selectedTool,
          startX,
          startY,
          width,
          height
        );

        // an extra shape, which stores metadata of the shape. Used when updating the shape, we can directly get its coordinates and other options.
        const shapeWithMetadata = {
          type: selectedTool,
          x: startX,
          y: startY,
          width,
          height,
          shape: drawableShape,
        };

        let shapeId = Date.now().toString();
        if (roomId && userId) {
          shapeId = await saveCanvasElementToDb(
            shapeWithMetadata,
            roomId,
            userId
          );
        }

        setExistingShapes((prev) =>
          new Map(prev).set(shapeId, shapeWithMetadata)
        );

        setTempShape([]);
      } else if (selectedTool === "Eraser") {
        deleteElements(elementsToDelete, setExistingShapes, roomId, supabase);
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

      if (isShape(selectedTool) && selectedTool !== "Text") {
        const { startX, startY } = startingPoint;
        const currentX = e.clientX;
        const currentY = e.clientY;

        const width = currentX - startX;
        const height = currentY - startY;

        const tempShape = getOrCreateShape(
          selectedTool,
          startX,
          startY,
          width,
          height
        );

        // simplifying temp shape by always keeping it an array.
        setTempShape(Array.isArray(tempShape) ? tempShape : [tempShape]);
      } else if (selectedTool === "Eraser") {
        detectElementsToDelete(
          e,
          existingShapes,
          elementsToDelete,
          setElementsToDelete
        );
      }
    },
    [selectedTool, isDrawing, startingPoint, existingShapes, elementsToDelete]
  );

  return {
    existingShapes,
    setExistingShapes,
    tempShape,
    elementsToDelete,
    typingConfig,
    handleOnMouseDown,
    handleOnMouseMove,
    handleOnMouseUp,
    handleTextareaBlur,
    resizeTextarea,
  };
}
