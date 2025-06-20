"use client";

import { CursorFollower } from "@/components/CursorFollower";

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

export default function Home() {
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

  const handleSelectShape = (shapeName: Shapes) => {
    setSelectedShape(shapeName);
  };

  const handleOnMouseDown = (e: React.MouseEvent) => {
    setIsDrawing(true);
    setStartingPoint({ x: e.clientX, y: e.clientY });
  };

  const handleOnMouseUp = (e: React.MouseEvent) => {
    if (!isDrawing || !startingPoint) return;

    const endX = e.clientX;
    const endY = e.clientY;
    const x = startingPoint.x;
    const y = startingPoint.y;
    const width = endX - x;
    const height = endY - y;

    const newShape = generator.rectangle(x, y, width, height);

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

    const temp = generator.rectangle(startX, startY, width, height);

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
}
