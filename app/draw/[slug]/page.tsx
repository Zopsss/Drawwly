// app/draw/[slug]/page.tsx
import { Canvas } from "@/components/Canvas";
import { createClient } from "@/utils/supabase/server";
import { createServerClient } from "@supabase/ssr";

import { cookies } from "next/headers";
import { notFound } from "next/navigation";

// Adjust path as needed

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Check if room exists (more efficient - only fetch needed fields)
  const { data: room, error } = await supabase
    .from("rooms")
    .select("id, room_name, is_guest, owner_id")
    .eq("id", slug)
    .single();

  if (error) {
    console.error("Error fetching room:", error);
    // If the error is because no rows were found, show 404
    if (error.code === "PGRST116") {
      notFound();
    }
    // For other errors, you might want to handle differently
    throw new Error(`Failed to fetch room: ${error.message}`);
  }

  if (!room) {
    notFound();
  }

  console.log("Room found:", room);

  // Your drawing page content here
  return (
    <div>
      <Canvas roomId={room.id} />
    </div>
  );
}
