import {
  CanvasElement,
  Tools,
  getOrCreateShape,
  updateCanvasElementInDb,
  isPointInsideElement,
  PencilElement,
} from "@/lib/canvas/canvas";
import { SupabaseClient } from "@supabase/supabase-js";
import React, { useCallback, useState } from "react";

export interface SelectionState {
  selectedElementId: string | null;
  selectedElement: CanvasElement | null;
  originalElement: CanvasElement | null;
  isMoving: boolean;
  isResizing: boolean;
  resizeHandle: string | null;
  startPoint: { x: number; y: number } | null;
}

export interface ResizeHandle {
  id: string;
  x: number;
  y: number;
  cursor: string;
}

export default function useSelection(
  zoom: number,
  panOffset: { x: number; y: number },
  ctx: CanvasRenderingContext2D | null,
  selectedTool: Tools,
  existingShapes: Map<string, CanvasElement>,
  setExistingShapes: React.Dispatch<
    React.SetStateAction<Map<string, CanvasElement>>
  >,
  supabase: SupabaseClient | undefined,
  roomId: string | undefined
) {
  const [selectionState, setSelectionState] = useState<SelectionState>({
    selectedElementId: null,
    selectedElement: null,
    originalElement: null,
    isMoving: false,
    isResizing: false,
    resizeHandle: null,
    startPoint: null,
  });

  const getWorldCoordinates = useCallback(
    (event: React.MouseEvent) => {
      if (!ctx) return { worldX: 0, worldY: 0 };
      const worldX = (event.pageX - panOffset.x) / zoom;
      const worldY = (event.pageY - panOffset.y) / zoom;
      return { worldX, worldY };
    },
    [ctx, zoom, panOffset]
  );

  const getResizeHandles = useCallback(
    (element: CanvasElement): ResizeHandle[] => {
      const { x, y, width, height, type } = element;
      const handleSize = 8 / zoom;
      const padding = type === "Square" ? 10 : 0;

      // Define the dimensions of the visual selection box
      const selectionX = x - padding;
      const selectionY = y - padding;
      const selectionWidth = width + padding * 2;
      const selectionHeight = height + padding * 2;

      const halfWidth = selectionWidth / 2;
      const halfHeight = selectionHeight / 2;

      return [
        // Corners
        {
          id: "top-left",
          x: selectionX - handleSize / 2,
          y: selectionY - handleSize / 2,
          cursor: "nwse-resize",
        },
        {
          id: "top-right",
          x: selectionX + selectionWidth - handleSize / 2,
          y: selectionY - handleSize / 2,
          cursor: "nesw-resize",
        },
        {
          id: "bottom-left",
          x: selectionX - handleSize / 2,
          y: selectionY + selectionHeight - handleSize / 2,
          cursor: "nesw-resize",
        },
        {
          id: "bottom-right",
          x: selectionX + selectionWidth - handleSize / 2,
          y: selectionY + selectionHeight - handleSize / 2,
          cursor: "nwse-resize",
        },
        // Mid-points
        {
          id: "top-middle",
          x: selectionX + halfWidth - handleSize / 2,
          y: selectionY - handleSize / 2,
          cursor: "ns-resize",
        },
        {
          id: "bottom-middle",
          x: selectionX + halfWidth - handleSize / 2,
          y: selectionY + selectionHeight - handleSize / 2,
          cursor: "ns-resize",
        },
        {
          id: "left-middle",
          x: selectionX - handleSize / 2,
          y: selectionY + halfHeight - handleSize / 2,
          cursor: "ew-resize",
        },
        {
          id: "right-middle",
          x: selectionX + selectionWidth - handleSize / 2,
          y: selectionY + halfHeight - handleSize / 2,
          cursor: "ew-resize",
        },
      ];
    },
    [zoom]
  );

  const isCursorOnResizeHandle = useCallback(
    (
      cursorX: number,
      cursorY: number,
      handles: ResizeHandle[]
    ): string | null => {
      const tolerance = 8;
      for (const handle of handles) {
        if (
          cursorX >= handle.x &&
          cursorX <= handle.x + tolerance &&
          cursorY >= handle.y &&
          cursorY <= handle.y + tolerance
        ) {
          return handle.id;
        }
      }
      return null;
    },
    []
  );

  const handleSelectionMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (selectedTool !== "Selection") return;

      const { worldX, worldY } = getWorldCoordinates(e);
      const { selectedElement } = selectionState;

      // 1. Check for resize handle on the currently selected element
      if (selectedElement) {
        const handles = getResizeHandles(selectedElement);
        const handleId = isCursorOnResizeHandle(worldX, worldY, handles);
        if (handleId) {
          setSelectionState((prev) => ({
            ...prev,
            isResizing: true,
            resizeHandle: handleId,
            startPoint: { x: worldX, y: worldY },
            originalElement: prev.selectedElement,
          }));
          return;
        }
      }

      // 2. Check if clicking inside the bounding box of the currently selected element to start moving
      if (selectedElement) {
        const { x, y, width, height, type } = selectedElement;
        // This padding logic should match what's used for drawing the selection box
        const padding = type === "Square" ? 10 : 0;
        const selectionX1 = x - padding;
        const selectionY1 = y - padding;
        const selectionWidth = width + padding * 2;
        const selectionHeight = height + padding * 2;

        // Handle negative dimensions for the bounding box check
        const finalX =
          selectionWidth < 0 ? selectionX1 + selectionWidth : selectionX1;
        const finalY =
          selectionHeight < 0 ? selectionY1 + selectionHeight : selectionY1;
        const finalWidth = Math.abs(selectionWidth);
        const finalHeight = Math.abs(selectionHeight);

        if (
          worldX >= finalX &&
          worldX <= finalX + finalWidth &&
          worldY >= finalY &&
          worldY <= finalY + finalHeight
        ) {
          setSelectionState((prev) => ({
            ...prev,
            isMoving: true,
            isResizing: false,
            startPoint: { x: worldX, y: worldY },
            originalElement: prev.selectedElement,
          }));
          return;
        }
      }

      // 3. If not moving/resizing, check if clicking a new element to select it
      const reversedElements = Array.from(existingShapes.entries()).reverse();
      for (const [id, element] of reversedElements) {
        if (isPointInsideElement(worldX, worldY, element)) {
          setSelectionState({
            selectedElementId: id,
            selectedElement: element,
            originalElement: element,
            isMoving: true,
            isResizing: false,
            resizeHandle: null,
            startPoint: { x: worldX, y: worldY },
          });
          return;
        }
      }

      // 4. If clicking on empty space, deselect
      setSelectionState({
        selectedElementId: null,
        selectedElement: null,
        originalElement: null,
        isMoving: false,
        isResizing: false,
        resizeHandle: null,
        startPoint: null,
      });
    },
    [
      selectedTool,
      getWorldCoordinates,
      selectionState,
      getResizeHandles,
      isCursorOnResizeHandle,
      existingShapes,
    ]
  );

  const handleSelectionMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (selectedTool !== "Selection") {
        document.body.style.cursor = "default";
        return;
      }
      const { worldX, worldY } = getWorldCoordinates(e);

      // If not dragging, update cursor based on hover state
      if (!selectionState.isMoving && !selectionState.isResizing) {
        let cursor = "default";
        const { selectedElement } = selectionState;

        // 1. Check for resize handles on the selected element
        if (selectedElement) {
          const handles = getResizeHandles(selectedElement);
          const handleId = isCursorOnResizeHandle(worldX, worldY, handles);
          if (handleId) {
            cursor =
              handles.find((h) => h.id === handleId)?.cursor || "default";
          } else {
            // 2. Check if inside selected element's bounding box
            const { x, y, width, height, type } = selectedElement;
            const padding = type === "Square" ? 10 : 0;
            const selectionX1 = x - padding;
            const selectionY1 = y - padding;
            const selectionWidth = width + padding * 2;
            const selectionHeight = height + padding * 2;

            const finalX =
              selectionWidth < 0 ? selectionX1 + selectionWidth : selectionX1;
            const finalY =
              selectionHeight < 0 ? selectionY1 + selectionHeight : selectionY1;
            const finalWidth = Math.abs(selectionWidth);
            const finalHeight = Math.abs(selectionHeight);

            if (
              worldX >= finalX &&
              worldX <= finalX + finalWidth &&
              worldY >= finalY &&
              worldY <= finalY + finalHeight
            ) {
              cursor = "move";
            }
          }
        }

        // 3. If cursor not set, check for hover over any unselected element
        if (cursor === "default") {
          const hoveringElement = Array.from(existingShapes.values())
            .reverse()
            .find((element) => isPointInsideElement(worldX, worldY, element));
          if (hoveringElement) {
            cursor = "move";
          }
        }
        document.body.style.cursor = cursor;
      }

      if (!selectionState.startPoint || !selectionState.originalElement) return;

      const deltaX = worldX - selectionState.startPoint.x;
      const deltaY = worldY - selectionState.startPoint.y;

      let updatedElement: CanvasElement;
      const original = selectionState.originalElement;

      if (selectionState.isResizing && selectionState.resizeHandle) {
        let { x, y, width, height } = original;

        if (original.type === "Circle") {
          const diameterX = Math.abs(
            width +
              (selectionState.resizeHandle.includes("right") ? deltaX : -deltaX)
          );
          const diameterY = Math.abs(
            height +
              (selectionState.resizeHandle.includes("bottom")
                ? deltaY
                : -deltaY)
          );
          const diameter = Math.max(diameterX, diameterY);

          const signX = Math.sign(width);
          const signY = Math.sign(height);

          const newWidth = diameter * signX;
          const newHeight = diameter * signY;

          if (selectionState.resizeHandle.includes("left")) {
            x = original.x + (width - newWidth);
          }
          if (selectionState.resizeHandle.includes("top")) {
            y = original.y + (height - newHeight);
          }

          width = newWidth;
          height = newHeight;
        } else {
          switch (selectionState.resizeHandle) {
            case "top-left":
              x += deltaX;
              y += deltaY;
              width -= deltaX;
              height -= deltaY;
              break;
            case "top-right":
              y += deltaY;
              width += deltaX;
              height -= deltaY;
              break;
            case "bottom-left":
              x += deltaX;
              width -= deltaX;
              height += deltaY;
              break;
            case "bottom-right":
              width += deltaX;
              height += deltaY;
              break;
            case "top-middle":
              y += deltaY;
              height -= deltaY;
              break;
            case "bottom-middle":
              height += deltaY;
              break;
            case "left-middle":
              x += deltaX;
              width -= deltaX;
              break;
            case "right-middle":
              width += deltaX;
              break;
          }
        }
        updatedElement = { ...original, x, y, width, height };

        if (updatedElement.type === "Pencil") {
          const origPencil = original as PencilElement;
          const updatedPencil = updatedElement;
          // Prevent division by zero for straight lines
          const scaleX =
            origPencil.width === 0 ? 1 : updatedPencil.width / origPencil.width;
          const scaleY =
            origPencil.height === 0
              ? 1
              : updatedPencil.height / origPencil.height;

          updatedPencil.points = origPencil.points.map((p) => [
            updatedPencil.x + (p[0] - origPencil.x) * scaleX,
            updatedPencil.y + (p[1] - origPencil.y) * scaleY,
          ]);
        }
      } else if (selectionState.isMoving) {
        updatedElement = {
          ...original,
          x: original.x + deltaX,
          y: original.y + deltaY,
        };

        if (updatedElement.type === "Pencil") {
          updatedElement.points = updatedElement.points.map((p) => [
            p[0] + deltaX,
            p[1] + deltaY,
          ]);
        }
      } else {
        return;
      }

      if (updatedElement.type !== "Text" && updatedElement.type !== "Pencil") {
        updatedElement.shape = getOrCreateShape(
          updatedElement.type,
          updatedElement.x,
          updatedElement.y,
          updatedElement.width,
          updatedElement.height
        );
      }

      setSelectionState((prev) => ({
        ...prev,
        selectedElement: updatedElement,
      }));
    },
    [
      selectedTool,
      selectionState,
      getWorldCoordinates,
      getResizeHandles,
      isCursorOnResizeHandle,
      existingShapes,
    ]
  );

  const handleSelectionMouseUp = useCallback(() => {
    if (selectedTool !== "Selection") return;

    if (
      (selectionState.isMoving || selectionState.isResizing) &&
      selectionState.selectedElement &&
      selectionState.selectedElementId
    ) {
      setExistingShapes((prev) => {
        const newShapes = new Map(prev);
        newShapes.set(
          selectionState.selectedElementId!,
          selectionState.selectedElement!
        );
        return newShapes;
      });

      if (supabase && roomId) {
        updateCanvasElementInDb(
          selectionState.selectedElement,
          selectionState.selectedElementId
        ).catch((error) => {
          console.error("Error updating element in database:", error);
        });
      }
    }

    setSelectionState((prev) => ({
      ...prev,
      isMoving: false,
      isResizing: false,
      resizeHandle: null,
      startPoint: null,
      originalElement: null, // Clear the snapshot
    }));
  }, [selectedTool, roomId, supabase, selectionState, setExistingShapes]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (selectedTool !== "Selection" || !selectionState.selectedElementId)
        return;

      if (e.key === "Delete" || e.key === "Backspace") {
        if (supabase && roomId) {
          (async () => {
            try {
              await supabase
                .from("drawing_elements")
                .delete()
                .eq("id", selectionState.selectedElementId);
            } catch (error) {
              console.error("Error deleting element from database:", error);
            }
          })();
        }

        setExistingShapes((prev: Map<string, CanvasElement>) => {
          const newShapes = new Map(prev);
          newShapes.delete(selectionState.selectedElementId!);
          return newShapes;
        });

        setSelectionState({
          selectedElementId: null,
          selectedElement: null,
          originalElement: null,
          isMoving: false,
          isResizing: false,
          resizeHandle: null,
          startPoint: null,
        });
      }
    },
    [
      selectedTool,
      selectionState.selectedElementId,
      setExistingShapes,
      supabase,
      roomId,
    ]
  );

  return {
    selectionState,
    getResizeHandles,
    handleSelectionMouseDown,
    handleSelectionMouseMove,
    handleSelectionMouseUp,
    handleKeyDown,
  };
}
