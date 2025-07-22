import Canvas from "@/components/canvas";
import CreateCanvas from "@/components/create-canvas";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  if (user) {
    return (
      <div>
        <h1>Welcome, {user.email}! This is your draw dashboard.</h1>
        <CreateCanvas userId={user.id} />
      </div>
    );
  } else {
    return <Canvas />;
  }
}
