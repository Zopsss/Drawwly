import { createClient } from "@/lib/supabase/client";
import rough from "roughjs";

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

export type Shapes =
  | "Square"
  | "Circle"
  | "Triangle"
  | "Line"
  | "ArrowedLine"
  | "Eraser";

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
