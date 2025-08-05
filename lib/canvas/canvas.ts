import { createClient } from "@/lib/supabase/client";
import getStroke, { StrokeOptions } from "perfect-freehand";
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
  | "Text"
  | "Pencil";

export type Tools = "Eraser" | "Panning" | "Selection" | Shapes;

// Currently we're manually specifying the non shape tools that we want to use.
// TODO: Find a better way to automatically include all the non shape tools instead of manually defining them.
const NonShapeTools: Exclude<Tools, Shapes>[] = ["Eraser", "Selection"];

type TextAlignment = "Left" | "Center" | "Right";
type TextSize = "sm" | "md" | "lg" | "xl";
type TextFontFamily = "Excalifont";

interface CommonFields {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextElement extends CommonFields {
  type: "Text";
  content: string;
  options: {
    lineHeight: number;
    alignment: TextAlignment;
    size: TextSize;
    fontFamily: TextFontFamily;
  };
}

export interface ShapeElement extends CommonFields {
  type: Exclude<Shapes, "Pencil" | "Text">;
  shape: Drawable | Drawable[];
}

export interface PencilElement extends CommonFields {
  type: "Pencil";
  points: number[][];
  options: StrokeOptions;
}

export type CanvasElement = ShapeElement | TextElement | PencilElement;

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
export const distanceToLineSegment = (
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
export const isCursorOnCanvasElement = (
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

    case "Pencil": {
      const { points } = element as PencilElement;
      // Check distance to each segment of the stroke
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const distance = distanceToLineSegment(
          cursorX,
          cursorY,
          p1[0],
          p1[1],
          p2[0],
          p2[1]
        );
        if (distance <= ERASER_TOLERANCE) {
          return true; // Cursor is on the path
        }
      }
      return false;
    }
    default:
      return false;
  }
};

/**
 * Checks if a point is inside an element, which is different from being "on" an element's line.
 * This is primarily used for the selection tool to detect clicks inside shapes.
 *
 * @param cursorX The cursor's x-coordinate.
 * @param cursorY The cursor's y-coordinate.
 * @param element The canvas element to check against.
 * @returns `true` if the cursor is inside the element, `false` otherwise.
 */
export const isPointInsideElement = (
  cursorX: number,
  cursorY: number,
  element: CanvasElement
): boolean => {
  const { type, x, y, width, height } = element;

  switch (type) {
    case "Square":
    case "Triangle": // Using bounding box for triangle for simplicity in selection.
    case "Text": {
      const x1 = Math.min(x, x + width);
      const x2 = Math.max(x, x + width);
      const y1 = Math.min(y, y + height);
      const y2 = Math.max(y, y + height);
      return cursorX >= x1 && cursorX <= x2 && cursorY >= y1 && cursorY <= y2;
    }

    case "Circle": {
      const centerX = x + width / 2;
      const centerY = y + height / 2;
      const radius = Math.abs(width) / 2;
      const dist = Math.sqrt(
        Math.pow(cursorX - centerX, 2) + Math.pow(cursorY - centerY, 2)
      );
      return dist <= radius;
    }

    // For lines and free-form drawings, "inside" is the same as being "on" the line.
    case "Line":
    case "ArrowedLine":
    case "Pencil":
      return isCursorOnCanvasElement(cursorX, cursorY, element);

    default:
      return false;
  }
};

export const getBoundingBox = (points: number[][]) => {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  let minX = points[0][0];
  let minY = points[0][1];
  let maxX = points[0][0];
  let maxY = points[0][1];

  for (const point of points) {
    minX = Math.min(minX, point[0]);
    minY = Math.min(minY, point[1]);
    maxX = Math.max(maxX, point[0]);
    maxY = Math.max(maxY, point[1]);
  }
  return { minX, minY, maxX, maxY };
};

const insertElementInDb = async (
  room_id: string,
  user_id: string,
  type: string,
  width: number,
  height: number,
  x: number,
  y: number,
  additionalData?: Record<string, unknown> // using record instead of "{}" because got this build error:
  // Error: The `{}` ("empty object") type allows any non-nullish value, including literals like `0` and `""`.
) => {
  const { error, data } = await SUPABASE.from("drawing_elements")
    .insert({
      room_id,
      user_id,
      type,
      data: {
        width,
        height,
        x,
        y,
        ...additionalData,
      },
    })
    .select("id")
    .single();

  if (error) {
    throw new Error("Error saving drawing element", error);
  }

  return data?.id;
};

// ================== Main Exports ==================

export const isShapeTool = (tool: Tools): tool is Shapes => {
  return (
    !NonShapeTools.includes(tool as Exclude<Tools, Shapes>) &&
    tool !== "Pencil" &&
    tool !== "Panning" &&
    tool !== "Selection"
  );
};

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
  elementToSave: CanvasElement,
  room_id: string,
  user_id: string
) => {
  try {
    const { x, y, width, height, type } = elementToSave;

    switch (type) {
      case "Circle":
      case "Square":
      case "Triangle":
      case "ArrowedLine":
      case "Line":
        return await insertElementInDb(
          room_id,
          user_id,
          type,
          width,
          height,
          x,
          y
        );

      case "Text": {
        const { content, options } = elementToSave as TextElement;
        return await insertElementInDb(
          room_id,
          user_id,
          type,
          width,
          height,
          x,
          y,
          { content, options }
        );
      }

      case "Pencil": {
        const { x, y, width, height, points, options } =
          elementToSave as PencilElement;
        return await insertElementInDb(
          room_id,
          user_id,
          type,
          width,
          height,
          x,
          y,
          {
            points,
            options,
          }
        );
      }

      default:
        throw new Error("Invalid element type while saving in db.");
    }
  } catch (error) {
    throw new Error("Error saving drawing element: " + error);
  }
};

export const updateCanvasElementInDb = async (
  elementToSave: CanvasElement,
  elementId: string
) => {
  try {
    const { x, y, width, height, type } = elementToSave;

    let dataToUpdate: Record<string, unknown> = {
      x,
      y,
      width,
      height,
    };

    if (type === "Text") {
      const { content, options } = elementToSave as TextElement;
      dataToUpdate = { ...dataToUpdate, content, options };
    } else if (type === "Pencil") {
      const { points, options } = elementToSave as PencilElement;
      dataToUpdate = { ...dataToUpdate, points, options };
    }

    await SUPABASE.from("drawing_elements")
      .update({ data: dataToUpdate })
      .eq("id", elementId);
  } catch (error) {
    console.log(error);
  }
};

export const renderElementOnCanvas = (
  canvasElement: CanvasElement & { translucent?: boolean },
  roughCanvas: RoughCanvas,
  ctx: CanvasRenderingContext2D
) => {
  ctx.save();

  // if element is about to be deleted then decrease its opacity.
  if (canvasElement.translucent) ctx.globalAlpha = 0.5;

  switch (canvasElement.type) {
    case "Circle":
    case "Line":
    case "Square":
    case "Triangle":
    case "ArrowedLine":
      const shapeElement = canvasElement as unknown as ShapeElement;
      const shape = shapeElement.shape;
      if (!Array.isArray(shape)) {
        // for normal shapes
        roughCanvas.draw(shape);
      } else {
        // for ArrowedLine
        shape.forEach((shape) => {
          roughCanvas.draw(shape);
        });
      }
      break;
    case "Text":
      const textElement = canvasElement as unknown as TextElement;

      ctx.font = "24px Excalifont";
      ctx.textBaseline = "top";
      ctx.fillStyle = "black";
      ctx.textRendering = "optimizeLegibility";
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      const lines = textElement.content.split("\n");

      lines.forEach((line, index) => {
        ctx.fillText(
          line,
          canvasElement.x,
          canvasElement.y + index * canvasElement.options.lineHeight
        );
      });
      break;
    case "Pencil":
      const { points, options } = canvasElement as unknown as PencilElement;
      const stroke = getStroke(points, options);

      const pathData = getSvgPathFromStroke(stroke);

      const myPath = new Path2D(pathData);

      ctx.fill(myPath);
      break;

    default:
      break;
  }

  ctx.restore();
};

export const detectElementsToDelete = (
  e: React.MouseEvent,
  existingShapes: Map<string, CanvasElement>,
  elementsToDelete: Map<string, CanvasElement & { translucent: boolean }>,
  setElementsToDelete: Dispatch<
    SetStateAction<Map<string, CanvasElement & { translucent: boolean }>>
  >,
  zoom: number,
  panOffset: { x: number; y: number }
) => {
  const worldX = (e.pageX - panOffset.x) / zoom;
  const worldY = (e.pageY - panOffset.y) / zoom;

  let changed = false;
  const newElementsToDelete = new Map(elementsToDelete);

  existingShapes.forEach((element, id) => {
    if (
      isCursorOnCanvasElement(worldX, worldY, element) &&
      !elementsToDelete.has(id)
    ) {
      const { type, height, width, x, y } = element;

      if (element.type !== "Text" && element.type !== "Pencil") {
        const translucentShape = getOrCreateShape(
          type,
          x,
          y,
          width,
          height,
          DELETION_STROKE_STYLE
        );

        const shapeElement: ShapeElement & { translucent: boolean } = {
          ...element,
          shape: translucentShape,
          translucent: true,
        };

        newElementsToDelete.set(id, shapeElement);
      } else if (type === "Text" || type === "Pencil") {
        newElementsToDelete.set(id, {
          ...element,
          translucent: true,
        });
      } else {
        throw new Error("Invalid shape type in detectElementsToDelete");
      }
      changed = true;
    }
  });

  if (changed) {
    setElementsToDelete(newElementsToDelete);
  }
};

// from https://www.npmjs.com/package/perfect-freehand#rendering
const average = (a: number, b: number) => (a + b) / 2;

export const getSvgPathFromStroke = (points: number[][], closed = true) => {
  const len = points.length;

  if (len < 4) {
    return ``;
  }

  let a = points[0];
  let b = points[1];
  const c = points[2];

  let result = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(
    2
  )},${b[1].toFixed(2)} ${average(b[0], c[0]).toFixed(2)},${average(
    b[1],
    c[1]
  ).toFixed(2)} T`;

  for (let i = 2, max = len - 1; i < max; i++) {
    a = points[i];
    b = points[i + 1];
    result += `${average(a[0], b[0]).toFixed(2)},${average(a[1], b[1]).toFixed(
      2
    )} `;
  }

  if (closed) {
    result += "Z";
  }

  return result;
};
