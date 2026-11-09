"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Section1Productivity } from './Section1Productivity';
import { Section2 } from './Section2';
import { Section3 } from './Section3';
import { Section4 } from './Section4';
import { useIsMobile } from './useIsMobile';
import { ensureGsap, prefersReducedMotion } from '@/components/home/gsap';

// scroll timeline, in "viewport scrolls" (1 = 1000px): hold, move, hold, move, hold, move, hold
const HOLD = 0.45;
const MOVE = 1;
const TOTAL = HOLD * 4 + MOVE * 3;
const MIDS = [1, 2, 3].map((k) => HOLD * k + MOVE * (k - 0.5));

function ShowcaseHeading({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none text-center ${className}`}>
      <h2 className="text-[30px] font-bold leading-[1.05] tracking-[-0.03em] text-[#FFFFEB] sm:text-[40px]">
        Four reasons it feels <em className="font-accent font-normal">effortless.</em>
      </h2>
    </div>
  );
}

export function SpatialScroll() {
  const isMobile = useIsMobile();
  const isPhone = useIsMobile(600);
  const wrapperRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isMobile || prefersReducedMotion() || !wrapperRef.current || !canvasRef.current) return;
    
    // We must ensure the element is visible before calculating ScrollTrigger, 
    // sometimes a tiny timeout helps when rendering dynamic components.
    const { gsap } = ensureGsap();
    
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: wrapperRef.current,
          start: "top top",
          end: `+=${Math.round(TOTAL * 1000)}`,
          scrub: 1,
          pin: true,
          anticipatePin: 1,
        },
      });

      // Path: (0,0) -> (-100vw, 0) -> (-100vw, -100vh) -> (0vw, -100vh), with a hold on every card
      // (including the last, so it doesn't scroll away the moment it arrives)
      const c = canvasRef.current;
      tl.to({}, { duration: HOLD })
        .to(c, { x: "-100vw", y: "0vh", ease: "power2.inOut", duration: MOVE })
        .to({}, { duration: HOLD })
        .to(c, { x: "-100vw", y: "-100vh", ease: "power2.inOut", duration: MOVE })
        .to({}, { duration: HOLD })
        .to(c, { x: "0vw", y: "-100vh", ease: "power2.inOut", duration: MOVE })
        .to({}, { duration: HOLD });
        
    }, wrapperRef);

    return () => ctx.revert();
  }, [isMobile]);

  if (isMobile) {
    const isTablet = !isPhone;
    const snapSlot: React.CSSProperties = {
      minHeight: '100svh',
      scrollSnapAlign: 'start',
      scrollSnapStop: 'always',
      overflow: 'hidden',
      paddingBottom: isTablet ? '36px' : 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    };
    return (
      <div key="mobile" id="spatial-scroll-container" className="mb-20 sm:mb-32" style={{ width: '100vw', backgroundColor: '#141412', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        <ShowcaseHeading className="px-4 pt-16" />
        <div style={snapSlot}><Section1Productivity /></div>
        <div style={snapSlot}><Section2 /></div>
        <div style={snapSlot}><Section3 /></div>
        <div style={snapSlot}><Section4 /></div>
      </div>
    );
  }

  return (
    // GSAP's pin moves the <section> into a spacer; this wrapper stays React's, so unmounting never trips over it.
    // The key matters: without it React reuses this div when the layout switches to mobile and tries to remove
    // the (moved) section from it -> "removeChild: the node to be removed is not a child of this node".
    <div key="desktop" className="mb-24 sm:mb-36">
      <section ref={wrapperRef} className="relative w-screen h-screen overflow-hidden bg-[#1E1E1B]">
        <ShowcaseHeading className="absolute inset-x-0 top-[3.5vh] z-40" />

        <div ref={canvasRef} className="absolute top-0 left-0 w-[200vw] h-[200vh] flex flex-wrap will-change-transform">
          {/* Row 1 */}
          <div className="w-[100vw] h-[100vh] relative"><Section1Productivity /></div>
          <div className="w-[100vw] h-[100vh] relative"><Section2 /></div>
          {/* Row 2 */}
          <div className="w-[100vw] h-[100vh] relative"><Section4 /></div>
          <div className="w-[100vw] h-[100vh] relative"><Section3 /></div>
        </div>
      </section>
    </div>
  );
}
