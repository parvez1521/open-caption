"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader } from "@/components/home/Loader";
import { ensureGsap, prefersReducedMotion } from "@/components/home/gsap";
import dynamic from "next/dynamic";
import { ClosingCta, Control, Faq, Footer, Hero, HomePricingSection, HowItWorks, MotionStudioSection, Nav, Privacy, ToolDoors, TranscribeSection } from "@/components/home/Sections";

const SpatialScroll = dynamic(
  () => import("@/components/spatial/SpatialScroll").then((m) => m.SpatialScroll),
  { ssr: false, loading: () => <div className="h-screen w-full bg-[#141412]" /> }
);

export default function LandingPage() {
  const root = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);
  const onLoaderDone = useCallback(() => setReady(true), []);
  const looksRef = useRef<HTMLDivElement>(null);
  const [showcaseNear, setShowcaseNear] = useState(false);
  // last scroll direction the nav has been tweened to (1 down / -1 up): the
  // hide-on-scroll tween only runs when the direction actually flips, so
  // wheel jitter doesn't restart it every tick and make the nav flicker
  const navDir = useRef(0);

  // The showcase is the heaviest thing on the page (four sections, their transcripts, fonts and
  // players). Mounting it the moment the intro ends — even for visitors who never scroll — made
  // the first seconds jank. Mount it when the visitor gets within ~a screen of it instead; the
  // #looks anchor keeps its position, so nav/footer jumps land in the same place.
  useEffect(() => {
    const el = looksRef.current;
    if (!el || showcaseNear) return;
    const io = new IntersectionObserver(
      ([e]) => e?.isIntersecting && setShowcaseNear(true),
      { rootMargin: "1000px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [showcaseNear]);

  // the showcase changes the page height when it lands; re-measure scroll triggers against the
  // real layout so the reveals below it keep their positions
  useEffect(() => {
    if (!showcaseNear) return;
    const t = setTimeout(() => ensureGsap().ScrollTrigger.refresh(), 350);
    return () => clearTimeout(t);
  }, [showcaseNear]);

  // Scrolling is NATIVE here on purpose (owner report 2026-11-15: the page felt
  // glitchy next to SwitchRoute's smooth native scroll). Lenis used to hijack
  // the wheel and animate scrollTop toward a target over 1.1s with an
  // exponential ease (half the distance in the first 10% of the time), so a
  // wheel flick lurched ~300px in 100ms and then dragged — and the pinned
  // showcase's scrubbed timeline lagged a further second behind. Native
  // scroll tracks the hand 1:1; ScrollTrigger follows it directly, and anchor
  // jumps stay smooth via `scroll-behavior: smooth` in globals.css.
  // choreography: starts once the intro curtain has lifted
  useEffect(() => {
    if (!ready || !root.current) return;
    if (prefersReducedMotion()) return;
    const { gsap, ScrollTrigger } = ensureGsap();
    const ctx = gsap.context(() => {
      // hero entrance: pure CSS in globals.css (timed from first paint, so hydration can never reset it)

      // parallax blobs
      gsap.utils.toArray<HTMLElement>("[data-parallax]").forEach((el) => {
        gsap.to(el, { yPercent: -60 * Number(el.dataset.parallax ?? 0.3), ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true } });
      });

      // nav hides on scroll down, returns on scroll up
      const nav = document.querySelector<HTMLElement>("[data-nav]");
      if (nav) {
        ScrollTrigger.create({
          start: 120,
          end: "max",
          onUpdate: (self) => {
            const dir = self.direction;
            if (dir === 0 || dir === navDir.current) return;
            navDir.current = dir;
            gsap.to(nav, { yPercent: dir === 1 ? -130 : 0, duration: 0.45, ease: "power3.out", overwrite: true });
          },
          onLeaveBack: () => {
            navDir.current = 0;
            gsap.to(nav, { yPercent: 0, duration: 0.3, overwrite: true });
          },
        });
      }

      // generic section reveals
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.from(el, { y: 50, opacity: 0, duration: 1.1, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 85%" } });
      });

      // how it works: steps pop in
      if (document.querySelector('[data-step]') && document.querySelector("#how")) gsap.from("[data-step]", { y: 70, opacity: 0, duration: 1, stagger: 0.18, ease: "expo.out", scrollTrigger: { trigger: "#how", start: "top 65%" } });

      if (document.querySelector('[data-feature]') && document.querySelector("#features")) gsap.from("[data-feature]", { y: 40, opacity: 0, scale: 0.97, duration: 0.9, stagger: 0.07, ease: "expo.out", scrollTrigger: { trigger: "#features", start: "top 65%" } });
      if (document.querySelector('[data-tier]') && document.querySelector("#pricing")) gsap.from("[data-tier]", { y: 60, opacity: 0, duration: 1, stagger: 0.15, ease: "expo.out", scrollTrigger: { trigger: "#pricing", start: "top 70%" } });
    }, root);
    // previews and fonts change layout after mount; re-measure once they settle
    // — and again on window load, when videos and fonts have all landed, so
    // reveal/pin positions never go stale and sections pop in late mid-scroll
    const t = setTimeout(() => ScrollTrigger.refresh(), 800);
    const onLoad = () => ScrollTrigger.refresh();
    window.addEventListener("load", onLoad);
    return () => {
      clearTimeout(t);
      window.removeEventListener("load", onLoad);
      ctx.revert();
    };
  }, [ready]);

  return (
    <main id="main-content" ref={root} className="relative min-h-screen overflow-x-clip bg-[#141412] font-sans text-[#FFFFEB]">
      <Loader onDone={onLoaderDone} />
      <Nav />
      <Hero />
      <ToolDoors />
      <HowItWorks />
      {/* ClipperSection hidden for now (owner order 2026-11-13): component stays live in
          components/home/Sections.tsx — re-add it here to restore the section. */}
      <TranscribeSection />
      <MotionStudioSection />
      <Control />
      {/* the heavy showcase (live players) mounts after the intro, so the intro and hero entrance get the main thread */}
      {/* the #looks anchor lives outside the late-mounting showcase, so nav and footer links always land */}
      <div id="looks" ref={looksRef} className="scroll-mt-20">
        {ready && showcaseNear ? <SpatialScroll /> : <div className="h-screen w-full bg-[#141412]" />}
      </div>
      <Privacy />
      <Faq />
      <ClosingCta />
      <HomePricingSection />
      <Footer />
    </main>
  );
}
