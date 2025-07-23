import { createClient } from "@/lib/supabase/client";
import rough from "roughjs";
import { Drawable } from "roughjs/bin/core";

const supabase = createClient();

const generator = rough.generator({
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
    fixedDecimalPlaceDigits: 1,
  },
});

export type RoughShape = ReturnType<typeof generator.rectangle>;

export type Shapes = "Square" | "Circle" | "Triangle" | "Line" | "ArrowedLine";

export type Tools = "Eraser" | "Panning" | Shapes;

// used for both - getting the shape and creating the shape.
export const getOrCreateShape = (
  type: Shapes,
  x: number,
  y: number,
  width: number,
  height: number
) => {
  switch (type) {
    case "Square":
      return generator.rectangle(x, y, width, height);

    case "Circle":
      return generator.circle(x + width / 2, y + height / 2, Math.abs(width));

    case "Triangle":
      return generator.polygon([
        [x + width / 2, y],
        [x, y + height],
        [x + width, y + height],
      ]);

    case "Line":
      return generator.line(x, y, x + width, y + height);

    case "ArrowedLine": {
      const lineStartX = x;
      const lineStartY = y;
      const lineEndX = x + width;
      const lineEndY = y + height;

      const mainLine = generator.line(
        lineStartX,
        lineStartY,
        lineEndX,
        lineEndY
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

      const arrowheadWing1 = generator.line(
        arrowheadWing1X,
        arrowheadWing1Y,
        lineEndX,
        lineEndY
      );

      const arrowheadWing2 = generator.line(
        arrowheadWing2X,
        arrowheadWing2Y,
        lineEndX,
        lineEndY
      );

      return [mainLine, arrowheadWing1, arrowheadWing2];
    }
    default:
      throw new Error("Invalid shape type");
  }
};

export const saveDrawingElementToDb = async (
  type: Shapes,
  x: number,
  y: number,
  width: number,
  height: number,
  room_id: string,
  user_id: string
) => {
  try {
    const { error, data } = await supabase
      .from("drawing_elements")
      .insert({
        room_id,
        user_id,
        type,
        data: {
          x,
          y,
          width,
          height,
        },
      })
      .select();

    if (error) {
      console.log("Erro saving drawing element: ", error);
    }

    if (data) {
      return data[0].id;
    }
  } catch (error) {
    console.log("EXCEPTION: Error saving drawing element: ", error);
  }
};

// A function to check if a point is inside a shape's bounding box
export const isPointInShape = (
  x: number,
  y: number,
  shape: Drawable | Drawable[]
): boolean => {
  // This is a simplified check. For more accuracy, you might need a more complex
  // intersection algorithm based on the shape type.
  if (Array.isArray(shape)) {
    return shape.some((s) => isPointInShape(x, y, s));
  }

  const { x1, y1, x2, y2 } = shape.sets[0].ops.reduce(
    (acc, op) => {
      if (op.op === "move" || op.op === "bcurveTo" || op.op === "lineTo") {
        const points = op.data;
        for (let i = 0; i < points.length; i += 2) {
          acc.x1 = Math.min(acc.x1, points[i]);
          acc.y1 = Math.min(acc.y1, points[i + 1]);
          acc.x2 = Math.max(acc.x2, points[i]);
          acc.y2 = Math.max(acc.y2, points[i + 1]);
        }
      }
      return acc;
    },
    { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity }
  );

  console.log("x: ", x, "x2:", x2, "y:", y, "y2:", y2);
  return x >= x1 && x <= x2 && y >= y1 && y <= y2;
};

// export const handleEraser = async (
//   e: React.MouseEvent,
//   setExistingShapes: React.Dispatch<
//     SetStateAction<Map<string, Drawable | Drawable[]>>
//   >
// ) => {
//   const { clientX, clientY } = e;
//   setExistingShapes((prev) => {
//     const newShapes = new Map(prev);
//     newShapes.forEach(async (shape, id) => {
//       if (isPointInShape(clientX, clientY, shape)) {
//         newShapes.delete(id);
//         await supabase.from("drawing_elements").delete().eq("id", id);
//       }
//     });
//     return newShapes;
//   });
// };
