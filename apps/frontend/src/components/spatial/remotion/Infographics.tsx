"use client";
import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig, spring, Easing, AbsoluteFill } from 'remotion';

export const WordLevelTiming = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = interpolate(frame, [0, fps * 1.5], [10, 80], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.25, 1, 0.5, 1)
  });
  
  const nudge = spring({
    frame: frame - fps * 1.6,
    fps,
    config: { damping: 12, mass: 0.5, stiffness: 120 }
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: '85%', height: '6px', backgroundColor: 'rgba(26,26,26,0.1)', borderRadius: '3px', position: 'relative' }}>
        {/* Timeline markers */}
        <div style={{ position: 'absolute', left: '20%', top: '-4px', width: '2px', height: '14px', backgroundColor: 'rgba(26,26,26,0.2)' }} />
        <div style={{ position: 'absolute', left: '50%', top: '-4px', width: '2px', height: '14px', backgroundColor: 'rgba(26,26,26,0.2)' }} />
        <div style={{ position: 'absolute', left: '80%', top: '-4px', width: '2px', height: '14px', backgroundColor: 'rgba(26,26,26,0.2)' }} />
        
        {/* Moving Word */}
        <div style={{ 
          position: 'absolute', 
          top: '-18px', 
          left: `${progress}%`, 
          transform: `translateX(-50%) translateX(${nudge * 20}px)`, 
          backgroundColor: '#34D399', 
          padding: '4px 14px', 
          borderRadius: '8px', 
          color: '#fff', 
          fontWeight: 600, 
          fontSize: '18px',
          fontFamily: 'sans-serif',
          boxShadow: '0 4px 12px rgba(52,211,153,0.4)',
          border: '1px solid rgba(255,255,255,0.4)'
        }}>
           Perfect
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const EmotionStyles = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale1 = spring({ frame: frame - 10, fps, config: { damping: 10, mass: 0.8, stiffness: 150 } });
  const scale2 = spring({ frame: frame - 25, fps, config: { damping: 10, mass: 0.8, stiffness: 150 } });
  const scale3 = spring({ frame: frame - 40, fps, config: { damping: 10, mass: 0.8, stiffness: 150 } });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: '24px' }}>
        <div style={{ transform: `scale(${scale1}) rotate(${interpolate(scale1, [0, 1], [-20, 0])}deg)`, backgroundColor: '#fff', borderRadius: '16px', padding: '16px', fontSize: '32px', boxShadow: '0 8px 24px rgba(26,26,26,0.08)' }}>🤣</div>
        <div style={{ transform: `scale(${scale2}) rotate(${interpolate(scale2, [0, 1], [20, 0])}deg)`, backgroundColor: '#fff', borderRadius: '16px', padding: '16px', fontSize: '42px', boxShadow: '0 12px 32px rgba(26,26,26,0.1)' }}>🔥</div>
        <div style={{ transform: `scale(${scale3}) rotate(${interpolate(scale3, [0, 1], [-20, 0])}deg)`, backgroundColor: '#fff', borderRadius: '16px', padding: '16px', fontSize: '32px', boxShadow: '0 8px 24px rgba(26,26,26,0.08)' }}>🚀</div>
    </AbsoluteFill>
  );
};

export const KeywordPop = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const highlight = spring({ frame: frame - 20, fps, config: { damping: 14 } });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
       <div style={{ display: 'flex', gap: '8px', fontSize: '28px', fontWeight: 'bold', fontFamily: 'sans-serif', color: 'rgba(26,26,26,0.8)' }}>
          <span>Watch</span>
          <span>this</span>
          <span style={{ 
            color: highlight > 0.5 ? '#fff' : 'rgba(26,26,26,0.8)',
            backgroundColor: highlight > 0.5 ? '#34D399' : 'transparent',
            padding: '2px 12px',
            borderRadius: '12px',
            transform: `scale(${1 + highlight * 0.15})`,
            boxShadow: highlight > 0.5 ? '0 8px 24px rgba(52,211,153,0.5)' : 'none',
            display: 'inline-block'
          }}>IMPORTANT</span>
          <span>part.</span>
       </div>
    </AbsoluteFill>
  );
};

export const ProResTransparency = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const gridY = interpolate(frame % 60, [0, 60], [0, 20]);

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
      {/* Moving Checkerboard Background representing transparency */}
      <div style={{
         position: 'absolute', inset: -40,
         backgroundImage: 'repeating-linear-gradient(45deg, rgba(26,26,26,0.03) 25%, transparent 25%, transparent 75%, rgba(26,26,26,0.03) 75%, rgba(26,26,26,0.03)), repeating-linear-gradient(45deg, rgba(26,26,26,0.03) 25%, #ffffff 25%, #ffffff 75%, rgba(26,26,26,0.03) 75%, rgba(26,26,26,0.03))',
         backgroundPosition: `0 ${gridY}px, 10px ${10 + gridY}px`,
         backgroundSize: '20px 20px',
      }} />
      <div style={{ zIndex: 10, color: '#1A1A1A', fontSize: '32px', fontWeight: 800, fontFamily: 'sans-serif', textTransform: 'uppercase', letterSpacing: '4px', textShadow: '0 4px 12px rgba(255,255,255,1)' }}>
         <span style={{ opacity: interpolate(frame % 60, [0, 30, 60], [1, 0.4, 1]) }}>Captions</span>
      </div>
    </AbsoluteFill>
  );
};
