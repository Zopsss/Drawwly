"use client";

import React from "react";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

type Props = {
  zoom: number;
  handleZoom: (delta: number) => void;
  resetZoom: () => void;
};

const ZoomButtons = ({ zoom, handleZoom, resetZoom }: Props) => {
  return (
    <div className="absolute left-10 bottom-10 flex items-center justify-center gap-3 bg-purple-100 rounded-md font-light">
      <Button
        className="hover:bg-purple-200 text-gray-700 rounded-r-none"
        variant={"ghost"}
        size={"lg"}
        onClick={() => handleZoom(-0.3)}
      >
        -
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            className="hover:bg-transparent text-gray-700 rounded-r-none"
            variant={"ghost"}
            size={"sm"}
            onClick={resetZoom}
          >
            {Math.round(zoom * 100)}%
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-sm">Reset Zoom</TooltipContent>
      </Tooltip>
      <Button
        className="hover:bg-purple-200 text-gray-700 rounded-l-none"
        variant={"ghost"}
        size={"lg"}
        onClick={() => handleZoom(0.3)}
      >
        +
      </Button>
    </div>
  );
};

export default ZoomButtons;
