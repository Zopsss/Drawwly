import { createClient } from "@/utils/supabase/server";

import { redirect } from "next/navigation";

export default async function Page() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  console.log("user: ", user);

  const { data: newRoom, error } = await supabase
    .from("rooms")
    .insert({
      is_guest: true,
      owner_id: null,
      room_name: "Testing",
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating room:", error);
    throw new Error(`Failed to create room: ${error.message}`);
  }

  if (!newRoom) {
    throw new Error("Room creation returned null data");
  }

  console.log("newRoom: ", newRoom);
  return redirect(`/draw/${newRoom.id}`);
}
