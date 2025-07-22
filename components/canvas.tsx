"use client";

import { Shapes, getOrCreateShape } from "@/lib/canvas/canvas";
import { createClient } from "@/lib/supabase/client";
import { SupabaseClient } from "@supabase/supabase-js";

import React, { useEffect, useRef, useState } from "react";
import rough from "roughjs";

import { CursorFollower } from "./cursor-follower";
import ShapeToolbar from "./ui/shape-toolbar";
import useCanvasDrawings from "@/hooks/useCanvasDrawing";
import { Drawable } from "roughjs/bin/core";

export default function Canvas({
  roomId,
  userId,
}: {
  roomId?: string;
  userId?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rc = useRef<ReturnType<typeof rough.canvas>>(null);

  const [showCursorFollower, setShowCurosorFollower] = useState(false);
  const [supabase, setSupabase] = useState<SupabaseClient>();
  const [selectedShape, setSelectedShape] = useState<Shapes>("Square");

  const {
    existingShapes,
    setExistingShapes,
    tempShape,
    handleOnMouseDown,
    handleOnMouseMove,
    handleOnMouseUp,
  } = useCanvasDrawings(selectedShape, supabase, roomId, userId);

  // ------------------ useEffects starts from here ------------------

  // Initial useEffect, for setting the canvas size and showing cursor follower.
  useEffect(() => {
    if (!canvasRef.current) return;

    setSupabase(createClient());

    const updateCanvasSize = () => {
      canvasRef.current!.width = window.innerWidth;
      canvasRef.current!.height = window.innerHeight;

      // FIX: Re-trigger drawing on resize by creating a new Map instance.
      // This guarantees a re-render because the object reference changes.
      setExistingShapes((prev) => new Map(prev));
    };

    updateCanvasSize();

    rc.current = rough.canvas(canvasRef.current);

    window.addEventListener("resize", updateCanvasSize);

    setShowCurosorFollower(true);

    return () => window.removeEventListener("resize", updateCanvasSize);
  }, [setExistingShapes]);
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
          const shapesMap = new Map<string, Drawable | Drawable[]>();
          data.map((element) => {
            const { type, data, id } = element;
            const { x, y, width, height } = data;

            shapesMap.set(id, getOrCreateShape(type, x, y, width, height));
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

  // Handling shape created by current user
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const roughCanvas = rc.current;

    if (!canvas || !ctx || !roughCanvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    existingShapes.forEach((shape) => {
      if (!Array.isArray(shape)) {
        roughCanvas.draw(shape);
      } else {
        // for handling arrowed line shape
        shape.forEach((shape) => {
          roughCanvas.draw(shape);
        });
      }
    });

    tempShape.forEach((shape) => {
      roughCanvas.draw(shape);
    });
  }, [existingShapes, tempShape]);

  // Handling new shapes created by other users
  useEffect(() => {
    // if roomId is not provided then it means guest user is drawing so we dont need this useEffect.
    if (!supabase || !roomId) return;

    const channel = supabase.channel(`drawing-elements-${roomId}`).on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "drawing_elements",
        filter: `user_id=neq.${userId}`,
      },
      (payload) => {
        const { id } = payload.new.id;
        const { x, y, width, height } = payload.new.data;
        const newShape = getOrCreateShape(
          payload.new.type,
          x,
          y,
          width,
          height
        );

        setExistingShapes((prev) => prev.set(id, newShape));
      }
    );

    channel.subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [roomId, setExistingShapes, supabase, userId]);

  return (
    <div>
      <ShapeToolbar
        selectedShape={selectedShape}
        setSelectedShape={setSelectedShape}
      />
      <canvas
        ref={canvasRef}
        onMouseDown={handleOnMouseDown}
        onMouseUp={handleOnMouseUp}
        onMouseMove={handleOnMouseMove}
      />
      {showCursorFollower && <CursorFollower />}
    </div>
  );
}
