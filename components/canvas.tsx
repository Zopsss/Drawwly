"use client";

import {
  CanvasElement,
  Tools,
  renderElementOnCanvas,
  getOrCreateShape,
} from "@/lib/canvas/canvas";
import { createClient } from "@/lib/supabase/client";
import { SupabaseClient } from "@supabase/supabase-js";

import React, { useEffect, useRef, useState } from "react";
import rough from "roughjs";

import { CursorFollower } from "./cursor-follower";
import ShapeToolbar from "./ui/shape-toolbar";
import useCanvasDrawings from "@/hooks/useCanvasDrawing";

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
  const [showCursorFollower, setShowCurosorFollower] = useState(false);
  const [supabase, setSupabase] = useState<SupabaseClient>();
  const [selectedTool, setSelectedTool] = useState<Tools>("Square");
  const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);
  const [fontLoaded, setFontLoaded] = useState(false);

  const {
    existingShapes,
    setExistingShapes,
    tempShape,
    elementsToDelete,
    typingConfig,
    handleOnMouseDown,
    handleOnMouseMove,
    handleOnMouseUp,
    handleTextareaBlur,
    resizeTextarea,
  } = useCanvasDrawings(ctx, selectedTool, supabase, roomId, userId);

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

      // Set the canvas size in CSS pixels
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";

      // Set the canvas size in actual pixels
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;

      // Scale the context to match the device pixel ratio
      ctx.scale(dpr, dpr);

      // FIX: Re-trigger drawing on resize by creating a new Map instance.
      // This guarantees a re-render because the object reference changes.
      setExistingShapes((prev) => new Map(prev));
    };

    updateCanvasSize();

    rc.current = rough.canvas(canvasRef.current);

    window.addEventListener("resize", updateCanvasSize);

    setShowCurosorFollower(true);
    return () => window.removeEventListener("resize", updateCanvasSize);
  }, [setExistingShapes, canvasRef]);
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
            const { x, y, width, height, text } = data;

            if (type !== "Text") {
              const shape = getOrCreateShape(type, x, y, width, height);
              shapesMap.set(id, { type, x, y, width, height, shape });
            } else {
              shapesMap.set(id, { type, x, y, width, height, text });
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

    existingShapes.forEach((element, id) => {
      // skip if element is about to be deleted, we draw them separately below
      if (elementsToDelete.has(id)) return;

      renderElementOnCanvas(element, roughCanvas, ctx);
    });

    elementsToDelete.forEach((element) => {
      renderElementOnCanvas(element, roughCanvas, ctx);
    });

    tempShape.forEach((shape) => {
      roughCanvas.draw(shape);
    });
  }, [existingShapes, tempShape, elementsToDelete, ctx, fontLoaded]);

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
          const { x, y, width, height, text } = data;

          setExistingShapes((prevShapes) => {
            const newShapes = new Map(prevShapes);
            if (type !== "Text") {
              const newShape = getOrCreateShape(type, x, y, width, height);
              newShapes.set(id, { type, x, y, width, height, shape: newShape });
            } else {
              console.log(text);
              newShapes.set(id, { type, x, y, width, height, text });
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
        <textarea
          ref={textareaRef}
          rows={1}
          className="absolute bg-transparent z-10 border-none outline-none resize-none"
          style={{
            top: `${typingConfig.y}px`,
            left: `${typingConfig.x}px`,
            fontSize: "24px",
            fontFamily: "Excalifont, monospace",
            overflow: "scroll",
          }}
          value={textValue}
          onChange={(e) => {
            setTextValue(e.target.value);
            resizeTextarea(textareaRef.current!);
          }}
          onBlur={() => {
            const width = textareaRef.current!.offsetWidth;
            const height = textareaRef.current!.offsetHeight;
            const computedStyle = getComputedStyle(textareaRef.current!);
            const fontSize = parseFloat(computedStyle.fontSize);
            const lineHeight =
              parseFloat(computedStyle.lineHeight) || fontSize * 1.2;

            handleTextareaBlur(textValue, width, height, lineHeight);
            setTextValue(""); // Reset for next use
          }}
        />
      )}
      <canvas
        className="font-mono"
        ref={canvasRef}
        onMouseDown={handleOnMouseDown}
        onMouseUp={handleOnMouseUp}
        onMouseMove={handleOnMouseMove}
      />
      {showCursorFollower && <CursorFollower />}
    </div>
  );
}
