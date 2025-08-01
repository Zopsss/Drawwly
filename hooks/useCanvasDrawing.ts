import {
  CanvasElement,
  getOrCreateShape,
  detectElementsToDelete,
  saveCanvasElementToDb,
  Tools,
  isShapeTool,
  TextElement,
  PencilElement,
} from "@/lib/canvas/canvas";
import { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useState } from "react";
import { Drawable } from "roughjs/bin/core";

export default function useCanvasDrawings(
  zoom: number,
  panOffset: { x: number; y: number },
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
  const [points, setPoints] = useState<number[][]>([]);
  const [startingPoint, setStartingPoint] = useState<{
    startX: number;
    startY: number;
  } | null>(null);

  const getWorldCoordinates = useCallback(
    (event: React.MouseEvent) => {
      if (!ctx) return { worldX: 0, worldY: 0 };
      // The formula: world = (screen) / zoom
      const worldX = (event.pageX - panOffset.x) / zoom;
      const worldY = (event.pageY - panOffset.y) / zoom;
      return { worldX, worldY };
    },
    [ctx, zoom, panOffset]
  );

  const handleTextareaBlur = useCallback(
    async (text: string, width: number, height: number, lineHeight: number) => {
      if (!typingConfig) return;

      if (!text.trim()) {
        setTypingConfig(null);
        return;
      }

      const newTextElement: TextElement = {
        type: "Text",
        x: typingConfig.x,
        y: typingConfig.y,
        width,
        height,
        content: text.trim(),
        options: {
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
      const { worldX, worldY } = getWorldCoordinates(e);

      if (selectedTool !== "Text") {
        setStartingPoint({ startX: worldX, startY: worldY });
        setIsDrawing(true);
        setTypingConfig(null);
      } else {
        if (!ctx || typingConfig) return;

        setTypingConfig({ x: worldX, y: worldY });
        setIsDrawing(false);
      }
    },
    [selectedTool, typingConfig, ctx, getWorldCoordinates]
  );

  const handleOnMouseUp = useCallback(
    async (e: React.MouseEvent) => {
      if (!isDrawing || !startingPoint || !supabase) return;

      const { worldX, worldY } = getWorldCoordinates(e);

      let shapeId = Date.now().toString();
      switch (selectedTool) {
        case "ArrowedLine":
        case "Circle":
        case "Line":
        case "Square":
        case "Triangle":
          const { startX, startY } = startingPoint;

          const endX = worldX;
          const endY = worldY;

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

          const finalShape = {
            type: selectedTool,
            x: startX,
            y: startY,
            width,
            height,
            shape: drawableShape,
          };

          if (roomId && userId) {
            shapeId = await saveCanvasElementToDb(finalShape, roomId, userId);
          }

          setExistingShapes((prev) => new Map(prev).set(shapeId, finalShape));
          break;

        case "Eraser":
          if (roomId && supabase) {
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
          break;

        case "Pencil":
          const pencil: PencilElement = {
            type: "Pencil",
            points,
            width: 0,
            height: 0,
            x: 0,
            y: 0,
            options: {
              size: 10,
              thinning: 0.5,
              smoothing: 0.5,
              streamline: 0.5,
            },
          };
          if (roomId && userId) {
            shapeId = await saveCanvasElementToDb(pencil, roomId, userId);
          }

          setExistingShapes((prev) => new Map(prev).set(shapeId, pencil));
          setPoints([]);
          break;

        // no need to do anything for case "Text"
        case "Text":
          break;

        default:
          throw new Error("Invalid element in handleOnMouseUp");
      }

      setTempShape([]);
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
      points,
      getWorldCoordinates,
    ]
  );

  const handleOnMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing || !startingPoint) return;

      const { worldX, worldY } = getWorldCoordinates(e);

      if (isShapeTool(selectedTool)) {
        const { startX, startY } = startingPoint;
        const currentX = worldX;
        const currentY = worldY;

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
          setElementsToDelete,
          zoom,
          panOffset
        );
      } else if (selectedTool === "Pencil") {
        // following code was taken from docs...
        if (e.buttons !== 1) return;

        setPoints((prev) => [...prev, [worldX, worldY]]);
      }
    },
    [
      selectedTool,
      isDrawing,
      startingPoint,
      existingShapes,
      elementsToDelete,
      zoom,
      panOffset,
      getWorldCoordinates,
    ]
  );

  return {
    existingShapes,
    setExistingShapes,
    points,
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
