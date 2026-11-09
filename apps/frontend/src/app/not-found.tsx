import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-[100svh] place-items-center bg-[#FFFFEB] px-6 text-center text-[#1A1A1A]">
      <div>
        <p className="font-mono text-sm text-[#1A1A1A]/40">404</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">This page doesn&apos;t exist</h1>
        <p className="mt-2 text-[15px] text-[#1A1A1A]/65">The link may be old or mistyped.</p>
        <Link href="/" className="mt-6 inline-block rounded-full bg-[#1A1A1A] px-5 py-2.5 text-sm font-semibold text-[#FFFFEB]">Back to Open Caption</Link>
      </div>
    </main>
  );
}
