"use client";

import { CanvasElement, Tools, getOrCreateShape } from "@/lib/canvas/canvas";
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

  const [showCursorFollower, setShowCurosorFollower] = useState(false);
  const [supabase, setSupabase] = useState<SupabaseClient>();
  const [selectedTool, setSelectedTool] = useState<Tools>("Square");

  const {
    existingShapes,
    setExistingShapes,
    tempShape,
    elementsToDelete,
    handleOnMouseDown,
    handleOnMouseMove,
    handleOnMouseUp,
  } = useCanvasDrawings(selectedTool, supabase, roomId, userId);

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
          const shapesMap = new Map<string, CanvasElement>();
          data.map((element) => {
            const { type, data, id } = element;
            const { x, y, width, height } = data;
            const shape = getOrCreateShape(type, x, y, width, height);

            shapesMap.set(id, { type, x, y, width, height, shape });
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
    console.log("existing shapes changed...");

    existingShapes.forEach((element, id) => {
      // skip if element is about to be deleted, we draw them separately below
      if (elementsToDelete.has(id)) return;

      if (!Array.isArray(element.shape)) {
        roughCanvas.draw(element.shape);
      } else {
        // for handling arrowed line shape
        element.shape.forEach((shape) => {
          roughCanvas.draw(shape);
        });
      }
    });

    tempShape.forEach((shape) => {
      roughCanvas.draw(shape);
    });

    elementsToDelete.forEach((shape) => {
      if (!Array.isArray(shape)) {
        roughCanvas.draw(shape);
      } else {
        shape.forEach((shape) => {
          roughCanvas.draw(shape);
        });
      }
    });
  }, [existingShapes, tempShape, elementsToDelete]);

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
          const { x, y, width, height } = data;
          const newShape = getOrCreateShape(type, x, y, width, height);

          setExistingShapes((prevShapes) => {
            const newShapes = new Map(prevShapes);
            newShapes.set(id, { type, x, y, width, height, shape: newShape });
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
