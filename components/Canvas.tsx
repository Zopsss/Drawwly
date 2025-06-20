"use client";

import { CursorFollower } from "@/components/CursorFollower";
import { createClient } from "@/utils/supabase/client";

import { JSX, useEffect, useRef, useState } from "react";

import {
  Circle,
  Hand,
  Minus,
  MousePointer,
  MoveRight,
  Square,
  Triangle,
} from "lucide-react";
import rough from "roughjs";

const generator = rough.generator();

type RoughShape = ReturnType<typeof generator.rectangle>;

interface CanvasProps {
  roomId: string;
}

export const Canvas = ({ roomId }: CanvasProps) => {
  type Shapes = "Square" | "Circle" | "Triangle" | "Line" | "ArrowedLine";
  const icons: { icon: JSX.Element; shape: Shapes }[] = [
    {
      icon: <Square />,
      shape: "Square",
    },
    { icon: <Circle />, shape: "Circle" },
    { icon: <Triangle />, shape: "Triangle" },
    { icon: <Minus />, shape: "Line" },
    { icon: <MoveRight />, shape: "ArrowedLine" },
  ];

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rc = useRef<ReturnType<typeof rough.canvas>>(null);
  const supabase = createClient();

  const [showCursorFollower, setShowCurosorFollower] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [existingShapes, setExistingShapes] = useState<RoughShape[]>([]);
  const [tempShape, setTempShape] = useState<RoughShape | null>(null);
  const [selectedShape, setSelectedShape] = useState<Shapes>("Square");
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [startingPoint, setStartingPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const updateSize = () => {
      setCanvasSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateSize(); // initial size

    rc.current = rough.canvas(canvasRef.current);

    window.addEventListener("resize", updateSize);

    setShowCurosorFollower(true);

    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    if (!canvas || !ctx || !rc.current) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    existingShapes.forEach((shape) => rc.current!.draw(shape));

    if (tempShape) rc.current!.draw(tempShape);
  }, [existingShapes, tempShape]);

  // Load existing drawing elements from database
  useEffect(() => {
    const loadDrawingElements = async () => {
      try {
        const { data, error } = await supabase
          .from("drawing_elements")
          .select("*")
          .eq("room_id", roomId)
          .order("created_at", { ascending: true });

        if (error) {
          console.error("Error loading drawing elements:", error);
          return;
        }

        console.log("data", data);
        if (data) {
          // Convert database data back to RoughJS shapes
          const shapes = data.map((element) => {
            const { type, data: shapeData } = element;

            // Recreate the shape based on type and data
            return getShape(type, shapeData);
          });

          setExistingShapes(shapes);
          console.log("shapes: ", shapes);
        }
      } catch (err) {
        console.error("Error in loadDrawingElements:", err);
      }
    };

    if (roomId) {
      loadDrawingElements();
    }
  }, [roomId, supabase]);

  // Add this to useEffect for real-time updates
  useEffect(() => {
    const channel = supabase
      .channel("drawing-elements")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "drawing_elements",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          // Handle new drawing elements from other users
          console.log("New drawing element:", payload.new);
          // setExistingShapes((prev: any) => [...prev, payload.new]);
          const newShape = getShape(payload.new.type, payload.new.data);
          setExistingShapes((prev) => [...prev, newShape]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, supabase]);

  const getShape = (type: Shapes, shapeData: any) => {
    switch (type) {
      case "Square":
        return generator.rectangle(
          shapeData.x,
          shapeData.y,
          shapeData.width,
          shapeData.height,
        );
      case "Circle":
        return generator.circle(
          shapeData.x + shapeData.width / 2,
          shapeData.y + shapeData.height / 2,
          Math.abs(shapeData.width),
        );
      case "Triangle":
        return generator.polygon([
          [shapeData.x + shapeData.width / 2, shapeData.y],
          [shapeData.x, shapeData.y + shapeData.height],
          [shapeData.x + shapeData.width, shapeData.y + shapeData.height],
        ]);
      case "Line":
        return generator.line(
          shapeData.x,
          shapeData.y,
          shapeData.x + shapeData.width,
          shapeData.y + shapeData.height,
        );
      case "ArrowedLine":
        // For arrowed line, you might need to implement custom arrow drawing
        return generator.line(
          shapeData.x,
          shapeData.y,
          shapeData.x + shapeData.width,
          shapeData.y + shapeData.height,
        );
      default:
        return generator.rectangle(
          shapeData.x,
          shapeData.y,
          shapeData.width,
          shapeData.height,
        );
    }
  };

  const handleSelectShape = (shapeName: Shapes) => {
    setSelectedShape(shapeName);
  };

  const handleOnMouseDown = (e: React.MouseEvent) => {
    setIsDrawing(true);
    setStartingPoint({ x: e.clientX, y: e.clientY });
  };

  const createShape = (
    type: Shapes,
    x: number,
    y: number,
    width: number,
    height: number,
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
      case "ArrowedLine":
        // For now, just a line. You can enhance this with arrow heads later
        return generator.line(x, y, x + width, y + height);
      default:
        return generator.rectangle(x, y, width, height);
    }
  };

  const saveDrawingElement = async (
    type: Shapes,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    console.log("roomId: ", roomId);
    try {
      const { error } = await supabase.from("drawing_elements").insert({
        room_id: roomId,
        type: type,
        data: {
          x,
          y,
          width,
          height,
        },
      });

      if (error) {
        console.error("Error saving drawing element:", error);
      }
    } catch (err) {
      console.error("Error in saveDrawingElement:", err);
    }
  };

  const handleOnMouseUp = async (e: React.MouseEvent) => {
    if (!isDrawing || !startingPoint) return;

    const endX = e.clientX;
    const endY = e.clientY;
    const x = startingPoint.x;
    const y = startingPoint.y;
    const width = endX - x;
    const height = endY - y;

    // Create the shape based on selected type
    const newShape = createShape(selectedShape, x, y, width, height);

    // Save to database
    await saveDrawingElement(selectedShape, x, y, width, height);

    // Update local state
    setExistingShapes((prev: any) => [...prev, newShape]);
    setIsDrawing(false);
    setStartingPoint(null);
    setTempShape(null);
  };

  const handleOnMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !startingPoint) return;

    const { x: startX, y: startY } = startingPoint;
    const currentX = e.clientX;
    const currentY = e.clientY;

    const width = currentX - startX;
    const height = currentY - startY;

    // Create temporary shape based on selected type
    const temp = createShape(selectedShape, startX, startY, width, height);

    setTempShape(temp);
  };

  return (
    <>
      <div>
        <div className="flex fixed top-5 items-center justify-center w-full px-10 pointer-events-none">
          <div className="p-3 rounded-md drop-shadow-md bg-white flex items-center justify-between gap-10 pointer-events-auto">
            <div className="flex items-center justify-center gap-3">
              <Hand className="cursor-pointer" />{" "}
              <MousePointer className="cursor-pointer" />
            </div>
            <div className="flex items-center justify-center gap-3">
              {icons.map((shape, index) => (
                <span
                  key={index}
                  onClick={() => handleSelectShape(shape.shape)}
                  className={`cursor-pointer p-1 rounded-md ${
                    selectedShape === shape.shape ? "bg-purple-100" : ""
                  }`}
                >
                  {shape.icon}
                </span>
              ))}
            </div>
          </div>
        </div>
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          onMouseDown={handleOnMouseDown}
          onMouseUp={handleOnMouseUp}
          onMouseMove={handleOnMouseMove}
        ></canvas>
      </div>
      {showCursorFollower && <CursorFollower />}
    </>
  );
};
