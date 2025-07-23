import Canvas from "@/components/canvas";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return notFound();

  const { data: room, error } = await supabase
    .from("rooms")
    .select("id")
    .eq("id", slug)
    .single();

  if (error) {
    notFound();
  }

  if (!room) {
    notFound();
  }

  return (
    <div>
      <Canvas roomId={room.id} userId={user.id} />
    </div>
  );
}
