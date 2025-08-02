"use client";

import React from "react";

type Props = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  typingConfig: { x: number; y: number };
  zoom: number;
  panOffset: { x: number; y: number };
  textValue: string;
  setTextValue: (value: string) => void;
  resizeTextarea: (textarea: HTMLTextAreaElement) => void;
  handleTextareaBlur: (
    textValue: string,
    worldWidth: number,
    worldHeight: number,
    lineHeight: number
  ) => void;
};

const Textarea = ({
  textareaRef,
  typingConfig,
  zoom,
  panOffset,
  textValue,
  setTextValue,
  resizeTextarea,
  handleTextareaBlur,
}: Props) => {
  if (!textareaRef) return null;

  return (
    <textarea
      ref={textareaRef}
      rows={1}
      className="absolute bg-transparent z-10 border-none outline-none resize-none"
      style={{
        top: `${typingConfig.y * zoom + panOffset.y}px`,
        left: `${typingConfig.x * zoom + panOffset.x}px`,
        fontSize: `${24 * zoom}px`,
        fontFamily: "Excalifont, monospace",
        overflow: "scroll",
      }}
      value={textValue}
      onChange={(e) => {
        setTextValue(e.target.value);
        resizeTextarea(textareaRef.current!);
      }}
      onBlur={() => {
        const screenWidth = textareaRef.current!.offsetWidth;
        const screenHeight = textareaRef.current!.offsetHeight;

        const worldWidth = screenWidth / zoom;
        const worldHeight = screenHeight / zoom;

        const computedStyle = getComputedStyle(textareaRef.current!);
        const fontSize = parseFloat(computedStyle.fontSize);
        const lineHeight =
          parseFloat(computedStyle.lineHeight) || fontSize * 1.2;

        handleTextareaBlur(textValue, worldWidth, worldHeight, lineHeight);
        setTextValue("");
      }}
    />
  );
};

export default Textarea;
