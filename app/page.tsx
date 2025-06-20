import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col  items-center justify-center bg-black h-screen pt-10 text-white gap-5">
      <h1 className="font-bold text-4xl">This will be the landing page</h1>
      <h1 className="font-semibold text-xl">
        Please go to{" "}
        <code className="text-blue-200">
          <Link href="/draw">/draw</Link>
        </code>{" "}
        page to start drawing
      </h1>
      <p className="font-semibold">
        Share that link with others and collaborate in real time 🍏
      </p>
    </div>
  );
}
