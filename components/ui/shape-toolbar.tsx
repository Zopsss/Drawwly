"use client";

import { Shapes, Tools } from "@/lib/canvas/canvas";
import {
  Circle,
  Eraser,
  Hand,
  Minus,
  MousePointer,
  MoveRight,
  Square,
  Triangle,
} from "lucide-react";
import { JSX } from "react";

const icons: { icon: JSX.Element; type: Shapes }[] = [
  { icon: <Square />, type: "Square" },
  { icon: <Circle />, type: "Circle" },
  { icon: <Triangle />, type: "Triangle" },
  { icon: <Minus />, type: "Line" },
  { icon: <MoveRight />, type: "ArrowedLine" },
];

export default function ShapeToolbar({
  selectedTool,
  setSelectedTool,
}: {
  selectedTool: Tools;
  setSelectedTool: (shape: Tools) => void;
}) {
  const handleEraser = () => {
    setSelectedTool("Eraser");
  };

  return (
    <div className="flex fixed top-5 items-center justify-center w-full px-10 pointer-events-none">
      <div className="p-3 rounded-md drop-shadow-md bg-white flex items-center justify-between gap-10 pointer-events-auto">
        <div className="flex items-center justify-center gap-3">
          <Hand className="cursor-pointer" />
          <MousePointer className="cursor-pointer" />
        </div>
        <div className="flex items-center justify-center gap-3">
          {icons.map((shape, _) => (
            <span
              key={_}
              onClick={() => setSelectedTool(shape.type)}
              className={`cursor-pointer p-1 rounded-md ${
                selectedTool === shape.type && "bg-purple-100"
              }`}
            >
              {shape.icon}
            </span>
          ))}
          <span
            onClick={handleEraser}
            className={`cursor-pointer p-1 rounded-md ${selectedTool === "Eraser" && "bg-purple-100"}`}
          >
            <Eraser />
          </span>
        </div>
      </div>
    </div>
  );
}
