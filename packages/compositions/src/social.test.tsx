import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OverlayItem, OverlaySocialVariant } from "@capseasy/shared";
import { OverlayView } from "./overlays";
import { SOCIAL_META, SocialOverlayView, audioBarsAt, bellRingDeg, chatStackAt, chatTicksAt, countdownAt, counterAt, cursorChoreoAt, easeInOutCubic, easeOutQuint, formCardAt, glitchAt, kineticTitleAt, liveViewersAt, neonFlickerAt, orbitAngle, overlayPhase, particleBurstAt, postCardAt, repostAt, searchBarAt, shareFlightAt, socialSeededUnit, springOut, typingAt, upvoteAt, voiceCardAt } from "./social";

/**
 * Animated Social Media overlays: phases are pure functions of the item's own window, so the same
 * (localMs, durationMs) draws the same frame in the Player, the browser export and a server render.
 * Everything is drawn divs/SVG — no assets — so unlike image overlays these DO carry in server renders.
 */

const item = (variant: OverlaySocialVariant, text: string, over: Partial<OverlayItem> = {}): OverlayItem => ({
  id: `soc-${variant}`, kind: "social", variant, text,
  startMs: 0, endMs: 4000, x: 0.5, y: 0.78, scale: 1, rotation: 0, color: "#FFA946", ...over,
});
const render = (it2: OverlayItem, localMs: number) => renderToStaticMarkup(<SocialOverlayView item={it2} sc={1} localMs={localMs} />);

describe("overlayPhase (the shared animated-overlay foundation)", () => {
  it("boundaries: not entered at 0, fully entered after the enter window, exiting at the end", () => {
    expect(overlayPhase(0, 4000).enter).toBe(0);
    expect(overlayPhase(500, 4000).enter).toBe(1);
    expect(overlayPhase(3999, 4000).exit).toBeGreaterThan(0.9);
    expect(overlayPhase(2000, 4000).exit).toBe(0);
  });
  it("the act beat lands mid-item: not acted early, acted late, deterministic", () => {
    expect(overlayPhase(200, 4000).acted).toBe(false);
    expect(overlayPhase(2500, 4000).acted).toBe(true);
    expect(overlayPhase(1500, 4000)).toEqual(overlayPhase(1500, 4000));
  });
  it("enter window is clamped (120–400 ms) whatever the item duration", () => {
    expect(overlayPhase(119, 600).enter).toBeLessThan(1);
    expect(overlayPhase(121, 600).enter).toBeGreaterThan(0);
    expect(overlayPhase(401, 60000).enter).toBe(1);
  });
});

describe("bellRingDeg", () => {
  it("starts at rest, swings, and decays toward rest", () => {
    expect(bellRingDeg(-10)).toBe(0);
    expect(bellRingDeg(0)).toBe(0);
    const early = Math.max(...Array.from({ length: 20 }, (_, i) => Math.abs(bellRingDeg(i * 15))));
    expect(early).toBeGreaterThan(10);
    expect(Math.abs(bellRingDeg(2400))).toBeLessThan(0.5);
    expect(bellRingDeg(140)).toBe(bellRingDeg(140));
  });
});

describe("shared easing (smoothness pass, follow-up 2026-11-11)", () => {
  it("springOut overshoots past 1 mid-way but lands exactly on 1 (no end pop)", () => {
    expect(springOut(0)).toBe(0);
    expect(springOut(1)).toBe(1);
    expect(springOut(0.5)).toBeGreaterThan(1);
    expect(springOut(-0.5)).toBe(0);
    expect(springOut(2)).toBe(1);
  });
  it("easeOutQuint / easeInOutCubic endpoints and symmetry", () => {
    expect(easeOutQuint(0)).toBe(0);
    expect(easeOutQuint(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 6);
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25);
    expect(easeInOutCubic(0.75)).toBeGreaterThan(0.75);
  });
  it("the shared enter/exit are eased, not linear: exit midpoint is smooth (0.5) and the enter is fast-then-settle", () => {
    // exit window = last 15% of a 4000 ms item (600 ms): at its midpoint the eased exit is 0.5
    expect(overlayPhase(3700, 4000).exit).toBeCloseTo(0.5, 3);
    // enter (400 ms window): easeOutQuint is ahead of linear mid-way, easing to the stop
    expect(overlayPhase(200, 4000).enter).toBeGreaterThan(0.9);
    expect(overlayPhase(200, 4000).enter).toBeLessThan(1);
  });
});

describe("cursorChoreoAt (cursor move → click → react)", () => {
  const from = { x: 600, y: 300 };
  const to = { x: 420, y: 150 };
  it("starts at `from`, ends exactly at `to`, and stays there after arrival", () => {
    const start = cursorChoreoAt(0, 4500, from, to);
    expect(start.x).toBeCloseTo(from.x, 3);
    expect(start.y).toBeCloseTo(from.y, 3);
    const mid = cursorChoreoAt(990, 4500, from, to); // 6%..38% window midpoint
    expect(mid.x).toBeLessThan(from.x);
    expect(mid.x).toBeGreaterThan(to.x);
    const end = cursorChoreoAt(1710, 4500, from, to);
    expect(end.x).toBeCloseTo(to.x, 3);
    expect(end.y).toBeCloseTo(to.y, 3);
    expect(end.arrived).toBe(true);
  });
  it("the travel arc lifts above the straight line (control point is raised)", () => {
    const mid = cursorChoreoAt(990, 4500, from, to);
    const straightMidY = (from.y + to.y) / 2;
    expect(mid.y).toBeLessThan(straightMidY);
  });
  it("press peaks at the click moment and the ripple grows then fades after it", () => {
    const clickAt = 4500 * 0.44;
    expect(cursorChoreoAt(clickAt, 4500, from, to).press).toBeCloseTo(1, 3);
    expect(cursorChoreoAt(clickAt, 4500, from, to).clicked).toBe(true);
    expect(cursorChoreoAt(clickAt - 400, 4500, from, to).press).toBeLessThan(0.5);
    const r1 = cursorChoreoAt(clickAt + 300, 4500, from, to);
    const r2 = cursorChoreoAt(clickAt + 900, 4500, from, to);
    expect(r2.rippleP).toBeGreaterThan(r1.rippleP);
    expect(r2.rippleOpacity).toBeLessThan(r1.rippleOpacity);
    expect(cursorChoreoAt(4500, 4500, from, to).rippleP).toBe(1);
  });
});

describe("follow-up helpers (chatTicksAt / countdownAt / shareFlightAt)", () => {
  it("chat ticks stage sent → delivered → read with time", () => {
    expect(chatTicksAt(0, 4000).stage).toBe(0);
    expect(chatTicksAt(1600, 4000).stage).toBe(1);
    expect(chatTicksAt(3000, 4000).stage).toBe(2);
  });
  it("countdown steps 3 → 2 → 1 → word, springing in each step", () => {
    expect(countdownAt(100, 4000).label).toBe("3");
    expect(countdownAt(1100, 4000).label).toBe("2");
    expect(countdownAt(2050, 4000).label).toBe("1");
    expect(countdownAt(3000, 4000).label).toBeNull();
    expect(countdownAt(3000, 4000).step).toBe(3);
    expect(countdownAt(1100, 4000).p).toBeGreaterThan(countdownAt(970, 4000).p);
  });
  it("share flight leaves after the beat and the count ticks up", () => {
    expect(shareFlightAt(600, 4000, 100).p).toBe(0);
    const late = shareFlightAt(3400, 4000, 100);
    expect(late.p).toBeGreaterThan(0.9);
    expect(late.count).toBeGreaterThan(100);
    expect(late.opacity).toBeLessThan(0.2);
  });
});

describe("counterAt (Counter / Odometer)", () => {
  it("counts from -> to monotonically and lands exactly, with grouped formatting", () => {
    let prev = -1;
    for (let t = 0; t <= 4000; t += 200) {
      const c = counterAt(t, 4000, 0, 50000);
      expect(c.value).toBeGreaterThanOrEqual(prev);
      prev = c.value;
    }
    expect(counterAt(4000, 4000, 0, 50000).value).toBe(50000);
    expect(counterAt(4000, 4000, 0, 50000).formatted).toBe("50,000");
    expect(counterAt(0, 4000, 0, 50000).value).toBe(0);
  });
  it("exposes one rolling column per digit; columns settle right-to-left", () => {
    const mid = counterAt(1600, 4000, 0, 50000);
    expect(mid.columns.length).toBe(String(Math.floor(mid.value)).length);
    const settles = mid.columns.map((c) => c.settle);
    expect(settles[settles.length - 1]!).toBeGreaterThanOrEqual(settles[0]!);
    for (const col of mid.columns) {
      expect(col.offset).toBeGreaterThanOrEqual(0);
      expect(col.offset).toBeLessThan(10);
    }
    expect(counterAt(1600, 4000, 0, 50000)).toEqual(counterAt(1600, 4000, 0, 50000));
  });
});

describe("chatStackAt + orbitAngle + seeded floaters", () => {
  it("bubbles arrive in order (later bubbles are less entered), capped at 4", () => {
    const cs = chatStackAt(500, 4000, 9);
    expect(cs.bubbles).toHaveLength(4);
    for (let i = 1; i < 4; i++) expect(cs.bubbles[i]!.p).toBeLessThanOrEqual(cs.bubbles[i - 1]!.p);
    expect(chatStackAt(3900, 4000, 3).bubbles.every((b) => b.p === 1)).toBe(true);
  });
  it("orbit angle wraps seamlessly every 12 s", () => {
    expect(orbitAngle(0)).toBe(0);
    expect(orbitAngle(6000)).toBe(180);
    expect(orbitAngle(12000)).toBe(0);
    expect(orbitAngle(15000)).toBe(90);
  });
  it("seeded units are deterministic and in [0,1)", () => {
    for (const s of [1, 42, 999]) {
      expect(socialSeededUnit(s)).toBe(socialSeededUnit(s));
      expect(socialSeededUnit(s)).toBeGreaterThanOrEqual(0);
      expect(socialSeededUnit(s)).toBeLessThan(1);
    }
  });
});

describe("SocialOverlayView (static markup — the same tree every render path draws)", () => {
  it("subscribe pill flips its label after the tap and carries no platform marks", () => {
    const it2 = item("subscribe-pill", "Subscribe\nSubscribed");
    expect(render(it2, 300)).toContain("Subscribe");
    expect(render(it2, 300)).not.toContain("Subscribed");
    const late = render(it2, 2600);
    expect(late).toContain("Subscribed");
    expect(late).not.toContain("mix-blend-mode");
    expect(late.toLowerCase()).not.toContain("youtube");
  });
  it("subscribe banner shows name lines, flips the pill and rings the bell (svg present)", () => {
    const it2 = item("subscribe-banner", "My Channel\nDaily videos\nSubscribe\nSubscribed");
    const late = render(it2, 3200);
    expect(late).toContain("My Channel");
    expect(late).toContain("Daily videos");
    expect(late).toContain("Subscribed");
    expect(late).toContain("<svg");
  });
  it("follow banner flips Follow -> Following with the user's own lines", () => {
    const it2 = item("follow-banner", "Ada Creator\n@ada\nFollow\nFollowing");
    expect(render(it2, 300)).toContain("Follow");
    expect(render(it2, 300)).not.toContain("Following");
    expect(render(it2, 2600)).toContain("Following");
    expect(render(it2, 2600)).toContain("@ada");
  });
  it("comment popup shows handle + comment and fills its heart on the beat", () => {
    const it2 = item("comment-popup", "@sam\nLoved this part!");
    const early = render(it2, 300);
    expect(early).toContain("@sam");
    expect(early).toContain("Loved this part!");
    expect(early).toContain('fill="none"');
    expect(render(it2, 2600)).not.toContain('fill="none"');
  });
  it("like pop increments the count by exactly one after the tap", () => {
    const it2 = item("like-pop", "128");
    expect(render(it2, 300)).toContain("128");
    expect(render(it2, 2600)).toContain("129");
  });
  it("heart burst renders the main heart plus deterministic floaters and an optional caption", () => {
    const it2 = item("heart-pop", "Thank you!");
    const html = render(it2, 2600);
    expect(html).toContain("Thank you!");
    expect((html.match(/<svg/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(html).toBe(render(it2, 2600));
  });
  it("counter renders rolling digit columns and its label", () => {
    const it2 = item("counter", "0\n50000\nfollowers");
    const html = render(it2, 3900);
    expect(html).toContain("followers");
    expect(html).toContain("translateY(-5.000em)");
  });
  it("chat stack renders one bubble per line and typing dots before the last lands", () => {
    const it2 = item("chat-stack", "Hi there\nHello!\nThird line");
    const late = render(it2, 3900);
    expect(late).toContain("Hi there");
    expect(late).toContain("Third line");
    const mid = render(it2, 1750);
    expect(mid).toContain("border-radius:50%"); // typing dots
  });
  it("orbit badge puts the text on a circular textPath and rotates deterministically", () => {
    const it2 = item("orbit-badge", "NEW VIDEO • ");
    const html = render(it2, 3000);
    expect(html).toContain("<textPath");
    expect(html).toContain("NEW VIDEO");
    expect(html).toContain("rotate(90.00deg)");
    expect(html).toBe(render(it2, 3000));
  });
  it("search bar types its query in steps, then drops the result row in", () => {
    // pure typing math: no characters before the typing window, monotonic, full at the end of it
    expect(searchBarAt(0, 4000, 10).chars).toBe(0);
    let prev = 0;
    for (let t = 0; t <= 4000; t += 100) {
      const s = searchBarAt(t, 4000, 10);
      expect(s.chars).toBeGreaterThanOrEqual(prev);
      prev = s.chars;
    }
    expect(searchBarAt(2600, 4000, 10)).toMatchObject({ chars: 10, typed: true });
    expect(searchBarAt(1000, 4000, 10).resultP).toBe(0);
    expect(searchBarAt(3900, 4000, 10).resultP).toBe(1);
    expect(searchBarAt(1500, 4000, 10)).toEqual(searchBarAt(1500, 4000, 10));
    const it2 = item("search-bar", "how to edit\nFull Guide");
    expect(render(it2, 300)).not.toContain("how to edit");
    const late = render(it2, 3900);
    expect(late).toContain("how to edit");
    expect(late).toContain("Full Guide");
  });
  /**
   * Picker-preview guard (Phase 4 Run 2): the Elements panel's Social Media cards play each
   * graphic through OverlayView, so EVERY variant in SOCIAL_META must (a) draw non-blank markup
   * at several instants inside its window and (b) actually ANIMATE — two renders at different
   * localMs must differ. A variant that silently renders blank or static would ship a dead
   * preview card again. Items carry each variant's own picker defaults (SOCIAL_META text/colour,
   * the same defaults makeSocialOverlay assigns), and the sampled pairs sit on either side of
   * the variant's act beat / key motion (tap flip ~1.7 s, typing window, odometer roll, orbit
   * rotation), so a difference is guaranteed by the drawing's own phases — not by opacity noise:
   * at 350 ms every variant is pre-act; at 2650 ms every variant is post-act / fully typed /
   * rolled / rotated (orbit: 10.5° vs 79.5°).
   */
  it("every SOCIAL_META variant renders non-blank AND animating markup through OverlayView", () => {
    expect(SOCIAL_META.length).toBeGreaterThan(0);
    for (const meta of SOCIAL_META) {
      const it2: OverlayItem = {
        id: `preview-guard-${meta.id}`, kind: "social", variant: meta.id, text: meta.defaultText,
        startMs: 0, endMs: 4000, x: 0.5, y: 0.5, scale: 1, rotation: 0, color: meta.defaultColor,
      };
      const renderAt = (localMs: number) => renderToStaticMarkup(<OverlayView item={it2} sc={1} localMs={localMs} />);
      for (const t of [150, 1200, 2650, 3900]) {
        const html = renderAt(t);
        expect(html.length, `${meta.id} blank at ${t}ms`).toBeGreaterThan(50);
        expect(html, `${meta.id} blend mode at ${t}ms`).not.toContain("mix-blend-mode");
      }
      const early = renderAt(350);
      const late = renderAt(2650);
      expect(late, `${meta.id} does not animate between 350ms and 2650ms`).not.toBe(early);
    }
  });
  it("SOCIAL_META covers 46 variants with unique ids", () => {
    expect(SOCIAL_META).toHaveLength(46);
    expect(new Set(SOCIAL_META.map((m) => m.id)).size).toBe(46);
    for (const m of SOCIAL_META) { expect(m.label.length).toBeGreaterThan(0); expect(m.hint.length).toBeGreaterThan(0); expect(m.defaultColor).toMatch(/^#[0-9A-Fa-f]{6}$/); }
  });
  it("new helpers are pure, seeded and deterministic", () => {
    expect(typingAt(2000, 4000, 10)).toEqual(typingAt(2000, 4000, 10));
    expect(typingAt(0, 4000, 10).chars).toBe(0);
    expect(typingAt(3900, 4000, 10).chars).toBe(10);
    expect(kineticTitleAt(3900, 4000, 3).words.every((w) => w.p === 1)).toBe(true);
    expect(kineticTitleAt(100, 4000, 3).words[2]!.p).toBe(0);
    expect(glitchAt(500)).toEqual(glitchAt(500));
    expect(neonFlickerAt(500)).toEqual(neonFlickerAt(500));
    expect(particleBurstAt(2000, 4000, 7)).toEqual(particleBurstAt(2000, 4000, 7));
    expect(particleBurstAt(2000, 4000, 7).dots).toHaveLength(14);
    expect(liveViewersAt(3900, 4000, 128).viewers).toBeGreaterThan(liveViewersAt(300, 4000, 128).viewers);
    expect(upvoteAt(2600, 4000, 248).count).toBeGreaterThan(248);
    expect(upvoteAt(300, 4000, 248).count).toBe(248);
    const fc = formCardAt(3900, 4000, 42, 3);
    expect(fc.options).toHaveLength(3);
    expect(fc.options.reduce((a, o) => a + o.pct, 0)).toBeGreaterThanOrEqual(99);
    expect(audioBarsAt(1000, 5)).toHaveLength(16);
    expect(audioBarsAt(1000, 5)).toEqual(audioBarsAt(1000, 5));
    expect(audioBarsAt(1000, 5)).not.toEqual(audioBarsAt(1600, 5));
  });
  it("profile-card flips Follow, typing-post types, qr-frame placeholder is not a code, live/upvote/form/audio render", () => {
    expect(render(item("profile-card", "Ada\n@ada\n9K followers\nFollow\nFollowing"), 300)).toContain("Follow");
    expect(render(item("profile-card", "Ada\n@ada\n9K followers\nFollow\nFollowing"), 2600)).toContain("Following");
    const tp = item("typing-post", "Ada\n@ada\nHello world post");
    expect(render(tp, 300)).not.toContain("Hello world");
    expect(render(tp, 3900)).toContain("Hello world post");
    const qr = render(item("qr-frame", "Scan me"), 2000);
    expect(qr).toContain("your QR image");
    expect(qr).toContain("Scan me");
    expect(render(item("live-badge", "LIVE\n100"), 3900)).toContain("watching");
    expect(render(item("upvote-card", "Great tip\n10"), 3900)).not.toContain(">10<");
    expect(render(item("form-card", "Pick one?\nA\nB"), 3900)).toContain("%");
    expect(render(item("audio-bars", ""), 1000).length).toBeGreaterThan(200);
    // avatar asset wiring: assetSrc renders an img, without it the initial letter shows
    const withAsset = renderToStaticMarkup(<SocialOverlayView item={item("profile-card", "Ada\n@ada\n9K\nFollow\nFollowing")} sc={1} localMs={1000} assetSrc="blob:avatar" />);
    expect(withAsset).toContain("blob:avatar");
    const noAsset = render(item("profile-card", "Ada\n@ada\n9K\nFollow\nFollowing"), 1000);
    expect(noAsset).toContain(">A<");
  });
  it("Wave 1.5 helpers are pure, seeded and deterministic", () => {
    expect(postCardAt(300, 4000).liked).toBe(false);
    expect(postCardAt(2600, 4000).liked).toBe(true);
    expect(postCardAt(2000, 4000)).toEqual(postCardAt(2000, 4000));
    expect(repostAt(300, 4000, 248)).toMatchObject({ count: 248, acted: false });
    expect(repostAt(2600, 4000, 248)).toMatchObject({ count: 249, acted: true });
    expect(repostAt(2000, 4000, 248)).toEqual(repostAt(2000, 4000, 248));
    // voice: exactly one speaker at a time, ring only on the speaker, rotation visits >1 member
    const vc = voiceCardAt(1000, 42, 3);
    expect(vc).toEqual(voiceCardAt(1000, 42, 3));
    expect(vc.members).toHaveLength(3);
    expect(vc.members.filter((m) => m.speaking)).toHaveLength(1);
    expect(vc.members[vc.activeIndex]!.speaking).toBe(true);
    expect(vc.members.every((m) => m.speaking === (m.ringOpacity > 0))).toBe(true);
    const speakers = new Set(Array.from({ length: 20 }, (_, s) => voiceCardAt(s * 650 + 100, 42, 3).activeIndex));
    expect(speakers.size).toBeGreaterThan(1);
    expect(voiceCardAt(1000, 42, 9).members).toHaveLength(3); // clamped to the card's 3 rows
    expect(voiceCardAt(1000, 42, 0).members).toHaveLength(0);
  });
  it("post-card shows name/time/body and fills its Like on the beat; avatar slot is wired", () => {
    const it2 = item("post-card", "Ada Creator\n3 hrs ago\nMy brand new post is live");
    const early = render(it2, 300);
    expect(early).toContain("Ada Creator");
    expect(early).toContain("3 hrs ago");
    expect(early).toContain("My brand new post is live");
    expect(early).toContain("Like");
    expect(early).toContain("Comment");
    expect(early).toContain("Share");
    expect(early).not.toContain('fill="#FFA946"'); // thumb still unfilled before the beat
    expect(render(it2, 2600)).toContain('fill="#FFA946"'); // filled with the accent after it
    expect(render(it2, 1000)).toContain(">A<"); // initial-letter fallback without an asset
    const withAsset = renderToStaticMarkup(<SocialOverlayView item={it2} sc={1} localMs={1000} assetSrc="blob:avatar" />);
    expect(withAsset).toContain("blob:avatar");
  });
  it("repost-card ticks its count +1 with a colour flip on the beat; avatar slot is wired", () => {
    const it2 = item("repost-card", "Ada\n@ada\nShipping today\n248");
    const early = render(it2, 300);
    expect(early).toContain("Ada");
    expect(early).toContain("@ada");
    expect(early).toContain("Shipping today");
    expect(early).toContain(">248<");
    expect(early).toContain('stroke="#9A9A94"'); // repost icon in its muted pre-beat colour
    const late = render(it2, 2600);
    expect(late).toContain(">249<");
    expect(late).toContain('stroke="#FFA946"'); // flipped to the accent after the beat
    expect(render(it2, 1000)).toContain(">A<");
    const withAsset = renderToStaticMarkup(<SocialOverlayView item={it2} sc={1} localMs={1000} assetSrc="blob:avatar" />);
    expect(withAsset).toContain("blob:avatar");
  });
  it("voice-card renders the channel and all 3 members, with a pulsing speaking ring", () => {
    const it2 = item("voice-card", "voice-lounge\nAlex\nPriya\nSam");
    const html = render(it2, 1000);
    expect(html).toContain("voice-lounge");
    expect(html).toContain("Alex");
    expect(html).toContain("Priya");
    expect(html).toContain("Sam");
    expect(html).toContain("3 in voice");
    expect(html).toBe(render(it2, 1000)); // deterministic
    expect(html).not.toBe(render(it2, 1750)); // the speaking rotation / pulse moves on
    expect(html.toLowerCase()).not.toContain("discord");
  });
  it("renders through OverlayView (the composition entry) with the item's position/scale", () => {
    const it2 = item("subscribe-pill", "Subscribe\nSubscribed");
    const html = renderToStaticMarkup(<OverlayView item={it2} sc={1} localMs={2600} />);
    expect(html).toContain("Subscribed");
    expect(html).toContain("left:50%");
    expect(html).toContain("top:78%");
    // a social item without a variant is invalid and draws nothing
    const bare = { ...it2, variant: undefined } as OverlayItem;
    expect(renderToStaticMarkup(<OverlayView item={bare} sc={1} localMs={100} />)).toBe("");
  });
});
