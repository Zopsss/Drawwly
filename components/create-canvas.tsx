"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function CreateCanvas({ userId }: { userId: string }) {
  const [roomName, setRoomName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("rooms")
        .insert({
          room_name: roomName,
          owner_id: userId,
        })
        .select();

      if (error) {
        setError(error.message);
      } else if (data && data[0] && data[0].id) {
        setRoomName("");
        router.push(`/draw/${data[0].id}`);
      } else {
        setError(
          "Room created, but could not retrieve room ID. Please try again."
        );
      }
      setLoading(false);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Unknown error");
      }
    }
  };

  return (
    <div>
      <h1>Create Canvas: </h1>
      <form onSubmit={handleSubmit}>
        <Input
          placeholder="room name"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
        />
        <Button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Submit"}
        </Button>
      </form>
      {error && <div style={{ color: "red" }}>{error}</div>}
    </div>
  );
}
