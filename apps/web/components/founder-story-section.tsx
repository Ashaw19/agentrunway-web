import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function FounderStorySection() {
  return (
    <section
      className="px-6 py-20 sm:px-10 sm:py-24"
      style={{ background: "#010D1F" }}
    >
      <div className="mx-auto max-w-6xl">
        <div className="grid items-center gap-12 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
          {/* ── Text column ── */}
          <div className="order-2 lg:order-1">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">
              From a working REALTOR in New Brunswick
            </p>
            <h2 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              I built Agent Runway because I needed&nbsp;it.
            </h2>

            <div className="mt-6 space-y-5 text-base leading-relaxed text-slate-300 sm:text-lg">
              <p>
                I&apos;m a licensed real estate agent at Ellis Realty in Saint
                John, New Brunswick. A few years ago I was doing well by any
                outward measure — closing deals, building a client base — but I
                had no idea what I&apos;d actually owe CRA until April, whether
                my pipeline would cover my expenses in Q3, or if I was running
                my business at a profit or just running fast.
              </p>
              <p>
                Every tool I tried was either built for the US, too generic to
                touch tax, or just a fancier spreadsheet. So I started building
                Agent Runway for myself. Canadian-specific. Real tax math.
                Something that could actually answer the questions I had at
                10pm on a Tuesday.
              </p>
              <p>
                Now it&apos;s live, and I use it for my own business every
                week. If you&apos;re a Canadian agent who wants to know where
                you actually stand — not just your GCI, but your real
                take-home, your runway, your CRA picture — this was built for
                you.
              </p>
            </div>

            <p className="mt-6 text-sm text-slate-500">
              Andrew Shaw · REALTOR® · Ellis Realty · Saint John, NB
            </p>

            <Link
              href="/about/andrew-shaw"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-400 transition-colors hover:text-blue-300"
            >
              More about Andrew <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {/* ── Photo column ── */}
          <div className="order-1 flex justify-center lg:order-2 lg:justify-end">
            <div className="relative aspect-[3/4] w-full max-w-xs overflow-hidden rounded-2xl border border-slate-700/60 shadow-2xl">
              <Image
                src="/images/andrew-shaw.jpg"
                alt="Andrew Shaw, founder of Agent Runway and REALTOR at Ellis Realty in Saint John, NB"
                fill
                className="object-cover object-top"
                sizes="(max-width: 1024px) 80vw, 320px"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
