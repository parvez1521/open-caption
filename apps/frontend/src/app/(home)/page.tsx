"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import { Loader } from "@/components/home/Loader";
import { ensureGsap, prefersReducedMotion } from "@/components/home/gsap";
import dynamic from "next/dynamic";
import { ClipperSection, ClosingCta, Control, Faq, Footer, Hero, HowItWorks, MotionStudioSection, Nav, Privacy, ToolDoors, TranscribeSection } from "@/components/home/Sections";

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

  // smooth scroll, driven by GSAP's ticker so ScrollTrigger and Lenis agree on every frame
  useEffect(() => {
    // phones scroll natively (smooth-scroll emulation costs a frame budget they don't have)
    if (prefersReducedMotion() || window.matchMedia("(pointer: coarse)").matches) return;
    const { gsap, ScrollTrigger } = ensureGsap();
    const lenis = new Lenis({ duration: 1.1, easing: (t) => 1 - Math.pow(2, -10 * t), anchors: { offset: -80 } });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);

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
          onUpdate: (self) => gsap.to(nav, { yPercent: self.direction === 1 ? -130 : 0, duration: 0.45, ease: "power3.out", overwrite: true }),
          onLeaveBack: () => gsap.to(nav, { yPercent: 0, duration: 0.3, overwrite: true }),
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
    const t = setTimeout(() => ScrollTrigger.refresh(), 800);
    return () => {
      clearTimeout(t);
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
      <ClipperSection />
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
      <Footer />
    </main>
  );
}
