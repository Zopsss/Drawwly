"use client";

import {
  CanvasElement,
  Tools,
  renderElementOnCanvas,
  getOrCreateShape,
  getSvgPathFromStroke,
} from "@/lib/canvas/canvas";
import { createClient } from "@/lib/supabase/client";
import { SupabaseClient } from "@supabase/supabase-js";

import React, { useCallback, useEffect, useRef, useState } from "react";
import rough from "roughjs";

import { CursorFollower } from "./cursor-follower";
import ShapeToolbar from "./ui/shape-toolbar";
import useCanvasDrawings from "@/hooks/useCanvasDrawing";
import getStroke from "perfect-freehand";
import ZoomButtons from "./zoom-buttons";
import Textarea from "./textarea";
import useZoomAndPan from "@/hooks/useZoomAndPan";

export default function Canvas({
  roomId,
  userId,
}: {
  roomId?: string;
  userId?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rc = useRef<ReturnType<typeof rough.canvas>>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [textValue, setTextValue] = useState("");
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [fontLoaded, setFontLoaded] = useState(false);
  const [showCursorFollower, setShowCurosorFollower] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [supabase, setSupabase] = useState<SupabaseClient>();
  const [selectedTool, setSelectedTool] = useState<Tools>("Square");
  const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);

  const {
    isPanning,
    handleMouseDown: handlePanMouseDown,
    handleMouseMove: handlePanMouseMove,
    handleMouseUp: handlePanMouseUp,
    handleWheel,
    handleZoom,
  } = useZoomAndPan(
    zoom,
    setZoom,
    panOffset,
    setPanOffset,
    isSpacePressed,
    selectedTool
  );

  const {
    existingShapes,
    setExistingShapes,
    points,
    tempShape,
    elementsToDelete,
    typingConfig,
    handleOnMouseDown: handleDrawMouseDown,
    handleOnMouseMove: handleDrawMouseMove,
    handleOnMouseUp: handleDrawMouseUp,
    handleTextareaBlur,
    resizeTextarea,
  } = useCanvasDrawings(
    zoom,
    panOffset,
    ctx,
    selectedTool,
    supabase,
    roomId,
    userId
  );

  const handleOnMouseDown = (e: React.MouseEvent) => {
    if (selectedTool === "Panning" || isSpacePressed) {
      handlePanMouseDown(e);
    } else {
      handleDrawMouseDown(e);
    }
  };

  const handleOnMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      handlePanMouseMove(e);
    } else {
      handleDrawMouseMove(e);
    }
  };

  const handleOnMouseUp = (e: React.MouseEvent) => {
    if (isPanning) {
      handlePanMouseUp();
    } else {
      handleDrawMouseUp(e);
    }
  };

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  // ------------------ useEffects starts from here ------------------

  // Load the custom font
  useEffect(() => {
    const loadFont = async () => {
      try {
        const font = new FontFace(
          "Excalifont",
          "url(/fonts/Excalifont-Regular.woff2)"
        );
        await font.load();
        document.fonts.add(font);
        setFontLoaded(true);
      } catch (error) {
        console.error("Failed to load Excalifont:", error);
        // Fallback to system font if custom font fails to load
        setFontLoaded(true);
      }
    };

    loadFont();
  }, []);

  // Handle spacebar press for panning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === " ") {
        setIsSpacePressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // setting textarea's font and rezing it
  useEffect(() => {
    if (typingConfig && textareaRef.current) {
      // setTimeout is required because this code runs immediately when the typingConfig changes and the element hasnt rendered so it cannot be
      setTimeout(() => {
        textareaRef.current!.focus();
        textareaRef.current!.style.font = "Excalifont";
        resizeTextarea(textareaRef.current!);
      }, 0);
    }
  }, [typingConfig, resizeTextarea]);

  // Initial useEffect, for setting the canvas size and showing cursor follower.
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    setCtx(canvas.getContext("2d"));

    setSupabase(createClient());

    const updateCanvasSize = () => {
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      const dpr = window.devicePixelRatio || 1;

      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);

      setExistingShapes((prev) => new Map(prev));
    };

    updateCanvasSize();

    rc.current = rough.canvas(canvasRef.current!);
    window.addEventListener("resize", updateCanvasSize);

    // Attach the memoized wheel event handler
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    setShowCurosorFollower(true);
    return () => {
      window.removeEventListener("resize", updateCanvasSize);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [setExistingShapes, canvasRef, handleWheel]);
  // 👆🏻 adding setExistingShapes as a dependency just to satisfy the linter, it does not matter if we add it or not.
  // source: https://react.dev/reference/react/useState#setstate, ( The set function has a stable identity, so you will often see it omitted from Effect dependencies, but including it will not cause the Effect to fire. )
  // From legacy docs: https://legacy.reactjs.org/docs/hooks-reference.html#usestate ( React guarantees that setState function identity is stable and won’t change on re-renders. This is why it’s safe to omit from the useEffect or useCallback dependency list. )

  // Loading initial/existing drawings from DB
  useEffect(() => {
    if (!supabase) return;

    const loadInitialDrawings = async () => {
      try {
        const { data, error } = await supabase
          .from("drawing_elements")
          .select("*")
          .eq("room_id", roomId)
          .order("created_at", { ascending: true });

        if (error) {
          console.log("error fetching room data: ", error);
          return;
        }

        if (data) {
          const shapesMap = new Map<string, CanvasElement>();
          data.map((element) => {
            const { type, data, id } = element;
            const { x, y, width, height, content, points, options } = data;

            // for shapes
            if (type !== "Text" && type !== "Pencil") {
              const shape = getOrCreateShape(type, x, y, width, height);
              shapesMap.set(id, {
                type,
                x,
                y,
                width,
                height,
                shape,
              });
            } else if (type === "Text") {
              shapesMap.set(id, {
                type,
                x,
                y,
                width,
                height,
                content,
                options,
              });
            } else if (type === "Pencil") {
              shapesMap.set(id, {
                type,
                x,
                y,
                width,
                height,
                points,
                options,
              });
            }
          });

          setExistingShapes(shapesMap);
        }
      } catch (error) {
        console.log("error fetching room data: ", error);
      }
    };

    if (roomId && userId) {
      loadInitialDrawings();
    }
  }, [roomId, userId, supabase, setExistingShapes]);

  // Rendering Shapes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const roughCanvas = rc.current;

    if (!canvas || !ctx || !roughCanvas || !fontLoaded) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(zoom, zoom);

    existingShapes.forEach((element, id) => {
      if (elementsToDelete.has(id)) return;

      renderElementOnCanvas(element, roughCanvas, ctx);
    });

    elementsToDelete.forEach((element) => {
      renderElementOnCanvas(element, roughCanvas, ctx);
    });

    tempShape.forEach((shape) => {
      roughCanvas.draw(shape);
    });

    // drawing freehand lines
    if (points.length > 1) {
      const stroke = getStroke(points, {
        size: 10,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
      });

      const pathData = getSvgPathFromStroke(stroke);

      const myPath = new Path2D(pathData);

      ctx.fill(myPath);
    }

    ctx.restore();
  }, [
    existingShapes,
    tempShape,
    elementsToDelete,
    ctx,
    fontLoaded,
    points,
    zoom,
    panOffset,
  ]);

  // Handling new shapes created by other users
  useEffect(() => {
    // if roomId is not provided then it means guest user is drawing so we dont need this useEffect.
    if (!supabase || !roomId) return;

    const channel = supabase
      .channel(`drawing-elements`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "drawing_elements",
          filter: `room_id=eq.${roomId}`, // if new shape is added to current room
        },
        (payload) => {
          if (payload.new.user_id === userId) {
            return;
          }

          const { id, type, data } = payload.new;
          const { x, y, width, height, content, points, options } = data;

          setExistingShapes((prevShapes) => {
            const newShapes = new Map(prevShapes);
            if (type !== "Text" && type !== "Pencil") {
              const newShape = getOrCreateShape(type, x, y, width, height);
              newShapes.set(id, {
                type,
                x,
                y,
                width,
                height,
                shape: newShape,
              });
            } else if (type === "Text") {
              newShapes.set(id, {
                type,
                x,
                y,
                width,
                height,
                options,
                content,
              });
            } else if (type === "Pencil") {
              newShapes.set(id, {
                type,
                x,
                y,
                width,
                height,
                points,
                options,
              });
            }
            return newShapes;
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "drawing_elements",
        },
        (payload) => {
          const { id } = payload.old;

          setExistingShapes((prevShapes) => {
            const newShapes = new Map(prevShapes);
            if (newShapes.has(id)) {
              newShapes.delete(id);
              return newShapes;
            }
            return prevShapes; // Return previous state if ID not found
          });
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("Successfully subscribed to real-time channel!");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, roomId, userId, setExistingShapes]);

  return (
    <div>
      <ShapeToolbar
        selectedTool={selectedTool}
        setSelectedTool={setSelectedTool}
      />
      {typingConfig && (
        <Textarea
          textareaRef={textareaRef}
          typingConfig={typingConfig}
          zoom={zoom}
          panOffset={panOffset}
          textValue={textValue}
          setTextValue={setTextValue}
          resizeTextarea={resizeTextarea}
          handleTextareaBlur={handleTextareaBlur}
        />
      )}
      <canvas
        className={`font-mono ${
          isPanning
            ? "cursor-grabbing"
            : selectedTool === "Panning"
              ? "cursor-grab"
              : ""
        }`}
        ref={canvasRef}
        onMouseDown={handleOnMouseDown}
        onMouseUp={handleOnMouseUp}
        onMouseMove={handleOnMouseMove}
      />
      <ZoomButtons zoom={zoom} handleZoom={handleZoom} resetZoom={resetZoom} />
      {showCursorFollower && <CursorFollower />}
    </div>
  );
}
