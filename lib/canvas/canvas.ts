import { createClient } from "@/lib/supabase/client";
import { SupabaseClient } from "@supabase/supabase-js";
import { Dispatch, SetStateAction } from "react";
import rough from "roughjs";
import { RoughCanvas } from "roughjs/bin/canvas";
import { Drawable, Options } from "roughjs/bin/core";

// ================== Types & Interfaces ==================

export type RoughShape = ReturnType<typeof GENERATOR.rectangle>;

export type Shapes =
  | "Square"
  | "Circle"
  | "Triangle"
  | "Line"
  | "ArrowedLine"
  | "Text";

export type Tools = "Eraser" | "Panning" | Shapes;

type TextAlignment = "Left" | "Center" | "Right";
type TextSize = "sm" | "md" | "lg" | "xl";
type TextFontFamily = "Excalifont";

export interface TextElement {
  content: string;
  lineHeight: number;
  alignment: TextAlignment;
  size: TextSize;
  fontFamily: TextFontFamily;
}
export interface CanvasElement {
  type: Shapes;
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: Drawable | Drawable[];
  text?: TextElement;
}

// ================== Constants ==================

const SUPABASE = createClient();
const ERASER_TOLERANCE = 7; // 7 pixels
const GENERATOR = rough.generator({
  options: {
    bowing: 1.5,
    strokeWidth: 1.5,
    seed: 1,
    // curveStepCount: 10,
    roughness: 1,
    preserveVertices: true,
    // roughness: 1,
    maxRandomnessOffset: 1,
    // disableMultiStroke: true,
  },
});
const DELETION_STROKE_STYLE = {
  stroke: "rgba(0, 0, 0, 0.3)",
  strokeWidth: 2,
};

// ================== Utility Functions ==================

/**
 * Calculates the shortest distance from a point to a line segment.
 *
 * @param x The cursor's x-coordinate.
 * @param y The cursor's y-coordinate.
 * @param x1 The line segment's start x.
 * @param y1 The line segment's start y.
 * @param x2 The line segment's end x.
 * @param y2 The line segment's end y.
 * @returns The shortest distance from the point to the line segment.
 */
const distanceToLineSegment = (
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number => {
  const A = x - x1;
  const B = y - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const len_sq = C * C + D * D;
  let param = -1;
  if (len_sq !== 0) {
    // in case of 0 length line
    param = dot / len_sq;
  }

  let xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = x - xx;
  const dy = y - yy;
  return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Checks if the mouse pointer is on given canvas element like a shape or text.
 *
 * @param cursorX cursor's X position
 * @param cursorY cursor's Y position
 * @param element element to check
 * @returns true if cursor is on an element, false otherwise
 */
const isPointOnCanvasElement = (
  cursorX: number,
  cursorY: number,
  element: CanvasElement
): boolean => {
  const { type, x, y, width, height } = element;

  switch (type) {
    case "Line":
    case "ArrowedLine": {
      const dist = distanceToLineSegment(
        cursorX,
        cursorY,
        x,
        y,
        x + width,
        y + height
      );
      return dist <= ERASER_TOLERANCE;
    }
    case "Square": {
      const topLeft = { x, y };
      const topRight = { x: x + width, y };
      const bottomLeft = { x, y: y + height };
      const bottomRight = { x: x + width, y: y + height };

      const onTop =
        distanceToLineSegment(
          cursorX,
          cursorY,
          topLeft.x,
          topLeft.y,
          topRight.x,
          topRight.y
        ) <= ERASER_TOLERANCE;
      const onRight =
        distanceToLineSegment(
          cursorX,
          cursorY,
          topRight.x,
          topRight.y,
          bottomRight.x,
          bottomRight.y
        ) <= ERASER_TOLERANCE;
      const onBottom =
        distanceToLineSegment(
          cursorX,
          cursorY,
          bottomRight.x,
          bottomRight.y,
          bottomLeft.x,
          bottomLeft.y
        ) <= ERASER_TOLERANCE;
      const onLeft =
        distanceToLineSegment(
          cursorX,
          cursorY,
          bottomLeft.x,
          bottomLeft.y,
          topLeft.x,
          topLeft.y
        ) <= ERASER_TOLERANCE;

      return onTop || onRight || onBottom || onLeft;
    }
    case "Triangle": {
      const p1 = { x: x + width / 2, y };
      const p2 = { x, y: y + height };
      const p3 = { x: x + width, y: y + height };

      const onSide1 =
        distanceToLineSegment(cursorX, cursorY, p1.x, p1.y, p2.x, p2.y) <=
        ERASER_TOLERANCE;
      const onSide2 =
        distanceToLineSegment(cursorX, cursorY, p2.x, p2.y, p3.x, p3.y) <=
        ERASER_TOLERANCE;
      const onSide3 =
        distanceToLineSegment(cursorX, cursorY, p3.x, p3.y, p1.x, p1.y) <=
        ERASER_TOLERANCE;

      return onSide1 || onSide2 || onSide3;
    }
    case "Circle": {
      const centerX = x + width / 2;
      const centerY = y + height / 2;
      // In getOrCreateShape, the diameter is Math.abs(width)
      const radius = Math.abs(width) / 2;

      const distToCenter = Math.sqrt(
        Math.pow(cursorX - centerX, 2) + Math.pow(cursorY - centerY, 2)
      );

      // Check if the distance to the center is within the tolerance range of the radius
      return Math.abs(distToCenter - radius) <= ERASER_TOLERANCE;
    }
    case "Text": {
      const { x, y, width, height } = element;

      return (
        cursorX >= x &&
        cursorX <= width + x &&
        cursorY >= y &&
        cursorY <= height + y
      );
    }
    default:
      return false;
  }
};

// ================== Main Exports ==================

export const getOrCreateShape = (
  type: Shapes,
  x: number,
  y: number,
  width: number,
  height: number,
  options?: Options
) => {
  switch (type) {
    case "Square":
      return GENERATOR.rectangle(x, y, width, height, options);

    case "Circle":
      return GENERATOR.circle(
        x + width / 2,
        y + height / 2,
        Math.abs(width),
        options
      );

    case "Triangle":
      return GENERATOR.polygon(
        [
          [x + width / 2, y],
          [x, y + height],
          [x + width, y + height],
        ],
        options
      );

    case "Line":
      return GENERATOR.line(x, y, x + width, y + height, options);

    case "ArrowedLine": {
      const lineStartX = x;
      const lineStartY = y;
      const lineEndX = x + width;
      const lineEndY = y + height;

      const mainLine = GENERATOR.line(
        lineStartX,
        lineStartY,
        lineEndX,
        lineEndY,
        options
      );

      // Calculate the angle of the line
      const angle = Math.atan2(lineEndY - lineStartY, lineEndX - lineStartX);

      const arrowheadLength = 20;
      const arrowheadSpread = Math.PI / 6; // 30 degrees

      const arrowheadWing1X =
        lineEndX - arrowheadLength * Math.cos(angle - arrowheadSpread);
      const arrowheadWing1Y =
        lineEndY - arrowheadLength * Math.sin(angle - arrowheadSpread);

      const arrowheadWing2X =
        lineEndX - arrowheadLength * Math.cos(angle + arrowheadSpread);
      const arrowheadWing2Y =
        lineEndY - arrowheadLength * Math.sin(angle + arrowheadSpread);

      const arrowheadWing1 = GENERATOR.line(
        arrowheadWing1X,
        arrowheadWing1Y,
        lineEndX,
        lineEndY,
        options
      );

      const arrowheadWing2 = GENERATOR.line(
        arrowheadWing2X,
        arrowheadWing2Y,
        lineEndX,
        lineEndY,
        options
      );

      return [mainLine, arrowheadWing1, arrowheadWing2];
    }
    default:
      throw new Error("Invalid shape type");
  }
};

export const saveCanvasElementToDb = async (
  element: Omit<CanvasElement, "shape">,
  room_id: string,
  user_id: string
) => {
  try {
    const { x, y, width, height, type, text } = element;
    const { error, data } = await SUPABASE.from("drawing_elements")
      .insert({
        room_id,
        user_id,
        type,
        data: {
          x,
          y,
          width,
          height,
          text,
        },
      })
      .select("id")
      .single();

    if (error) {
      throw new Error("Error saving drawing element", error);
    }

    return data?.id;
  } catch (error) {
    throw new Error("Error saving drawing element" + error);
  }
};

export const renderElementOnCanvas = (
  element: CanvasElement & { translucent?: boolean },
  roughCanvas: RoughCanvas,
  ctx: CanvasRenderingContext2D
) => {
  ctx.save();

  // if element is about to be deleted then decrease its opacity.
  if (element.translucent) ctx.globalAlpha = 0.5;

  if (element.shape) {
    const shape = element.shape;
    if (!Array.isArray(shape)) {
      // for normal shapes
      roughCanvas.draw(shape);
    } else {
      // for ArrowedLine
      shape.forEach((shape) => {
        roughCanvas.draw(shape);
      });
    }
  } else if (element.text) {
    ctx.font = "24px Excalifont";
    ctx.textBaseline = "top";
    ctx.fillStyle = "black";
    ctx.textRendering = "optimizeLegibility";
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const lines = element.text.content.split("\n");

    lines.forEach((line, index) => {
      ctx.fillText(
        line,
        element.x,
        element.y + index * element.text!.lineHeight
      );
    });
  }

  ctx.restore();
};

export const detectElementsToDelete = (
  e: React.MouseEvent,
  existingShapes: Map<string, CanvasElement>,
  elementsToDelete: Map<string, CanvasElement & { translucent: boolean }>,
  setElementsToDelete: Dispatch<
    SetStateAction<Map<string, CanvasElement & { translucent: boolean }>>
  >
) => {
  const { clientX, clientY } = e;

  let changed = false;
  const newElementsToDelete = new Map(elementsToDelete);

  existingShapes.forEach((element, id) => {
    if (
      isPointOnCanvasElement(clientX, clientY, element) &&
      !elementsToDelete.has(id)
    ) {
      if (element.type !== "Text") {
        const translucentShape = getOrCreateShape(
          element.type,
          element.x,
          element.y,
          element.width,
          element.height,
          DELETION_STROKE_STYLE
        );

        newElementsToDelete.set(id, {
          ...element,
          shape: translucentShape,
          translucent: true,
        });
      } else if (element.type === "Text" && element.text) {
        newElementsToDelete.set(id, {
          ...element,
          translucent: true,
        });
      }
      changed = true;
    }
  });

  if (changed) {
    setElementsToDelete(newElementsToDelete);
  }
};

export const deleteElements = async (
  elementsToDelete: Map<string, CanvasElement>,
  setExistingShapes: Dispatch<SetStateAction<Map<string, CanvasElement>>>,
  roomId: string | undefined,
  supabase: SupabaseClient | undefined
) => {
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
};
