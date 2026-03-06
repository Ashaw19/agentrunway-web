import Link from "next/link";
import Image from "next/image";

export function MarketingNav() {
  return (
    <header className="border-b border-slate-800 px-6 py-5 sm:px-10">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="Agent Runway"
            width={28}
            height={28}
            className="rounded-lg"
          />
          <span className="text-lg font-bold tracking-tight text-white">
            Agent Runway
          </span>
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
        >
          Sign In
        </Link>
      </div>
    </header>
  );
}
