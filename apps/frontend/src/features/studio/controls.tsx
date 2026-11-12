"use client";

import React, { useRef, useState } from "react";

/** Small light-theme form primitives shared by the studio panels. */

/**
 * A panel section. `hint` is the ONE line that stays on the surface; anything longer
 * goes in `more`, behind a Details disclosure — the explanation stays one tap away
 * instead of stacking above the section's controls (owner declutter order, 2026-11-11).
 */
export const Section: React.FC<{ title: string; children: React.ReactNode; hint?: string; more?: string }> = ({ title, children, hint, more }) => (
  <section className="border-b border-st-line px-4 py-4">
    <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-st-muted">{title}</h3>
    {hint || more ? (
      <div className="mb-3">
        {hint ? <p className="text-xs text-st-faint">{hint}</p> : null}
        {more ? (
          <details className="mt-1.5">
            <summary className="cursor-pointer text-xs font-medium text-st-muted">Details</summary>
            <p className="mt-1 text-xs leading-relaxed text-st-faint">{more}</p>
          </details>
        ) : null}
      </div>
    ) : null}
    <div className="space-y-3">{children}</div>
  </section>
);

const row = "flex items-center justify-between gap-3 text-sm text-st-text/90";

/** Decimals a step needs (0.05 -> 2, 1 -> 0), so a typed value snaps to the same grid the slider moves on. */
const decimalsOf = (step: number) => {
  const s = String(step);
  const i = s.indexOf(".");
  return i === -1 ? 0 : s.length - i - 1;
};

/**
 * Slider with a paired numeric input (Phase 2B pro precision): dragging still
 * works exactly as before, and a pro can also type the exact value — "1.25"
 * brightness, "-6 dB" — instead of dragging to it. The typed value clamps to
 * [min, max] and snaps to the step grid on blur/Enter; garbage reverts.
 */
export const Slider: React.FC<{ label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; format?: (v: number) => string }> = ({
  label, value, min, max, step = 1, unit = "", onChange, format,
}) => {
  const decimals = decimalsOf(step);
  const snap = (v: number) => Number((Math.round(v / step) * step).toFixed(decimals));
  /** typed text while the number field has focus; null means "show the live value" */
  const [draft, setDraft] = useState<string | null>(null);
  /** ref mirror of draft: commit() must be idempotent — Enter commits then blurs, and the blur fires commit again */
  const draftRef = useRef<string | null>(null);
  const setDraftBoth = (v: string | null) => { draftRef.current = v; setDraft(v); };
  const shown = draft ?? String(Number(value.toFixed(decimals)));
  const commit = () => {
    const d = draftRef.current;
    if (d === null) return;
    draftRef.current = null;
    setDraft(null);
    if (d.trim() === "") return; // cleared field reverts; Number("") is 0 and must never commit
    const n = Number(d);
    if (!Number.isFinite(n)) return;
    const clamped = snap(Math.min(max, Math.max(min, n)));
    if (clamped !== value) onChange(clamped);
  };
  return (
    <label className="block text-sm text-st-text/90">
      <span className="mb-1 flex justify-between">
        <span>{label}</span>
        <span className="tabular-nums text-st-muted">{format ? format(value) : `${Math.round(value * 100) / 100}${unit}`}</span>
      </span>
      <span className="flex items-center gap-2">
        <input type="range" className="min-w-0 flex-1 accent-[#34D399]" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
        <input
          type="number"
          aria-label={`${label} (exact value${unit ? ` in ${unit.trim()}` : ""})`}
          className="w-20 shrink-0 rounded-md border border-st-line bg-st-panel px-2 py-1 text-sm tabular-nums text-st-text outline-none focus:border-st-lav"
          min={min}
          max={max}
          step={step}
          value={shown}
          onChange={(e) => setDraftBoth(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { commit(); (e.target as HTMLInputElement).blur(); }
            if (e.key === "Escape") { setDraftBoth(null); (e.target as HTMLInputElement).blur(); }
          }}
        />
      </span>
    </label>
  );
};

export const Toggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }> = ({ label, checked, onChange, hint }) => (
  <label className={`${row} cursor-pointer`}>
    <span>
      {label}
      {hint ? <span className="block text-xs text-st-faint">{hint}</span> : null}
    </span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? "bg-st-em" : "bg-st-hover ring-1 ring-inset ring-st-ink/10"}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-st-panel shadow-sm transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
    </button>
  </label>
);

export const Select: React.FC<{ label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }> = ({ label, value, options, onChange }) => (
  <label className={row}>
    <span>{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-[55%] rounded-md border border-st-line bg-st-panel px-2 py-1 text-sm text-st-text outline-none focus:border-st-lav"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </label>
);

export const ColorField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
  return (
    <label className={row}>
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          aria-label={`${label} (hex value)`}
          className="w-24 rounded-md border border-st-line bg-st-panel px-2 py-1 font-mono text-xs text-st-text outline-none focus:border-st-lav"
        />
        {/* the wrapping <label> only names its first control (the hex input above),
            so the swatch needs its own accessible name (Wave-4 a11y fix) */}
        <input type="color" value={hex} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={`${label} (colour picker)`} className="h-7 w-7 cursor-pointer rounded border border-st-line bg-transparent p-0" />
      </span>
    </label>
  );
};

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "ghost" | "danger" }> = ({ tone = "ghost", className = "", ...p }) => (
  <button
    {...p}
    className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
      tone === "primary" ? "bg-st-ink text-st-panel hover:bg-st-ink/85" : tone === "danger" ? "bg-st-or/25 text-st-text hover:bg-st-or/45" : "border border-st-line bg-st-panel text-st-text hover:bg-st-hover"
    } ${className}`}
  />
);

export const Segmented: React.FC<{ value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }> = ({ value, options, onChange }) => (
  <div className="inline-flex rounded-lg border border-st-line bg-st-raised p-0.5">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        onClick={() => onChange(o.value)}
        className={`rounded-md px-2.5 py-2 text-xs font-medium transition lg:py-1 ${value === o.value ? "bg-st-lav text-obsidian" : "text-st-text/80 hover:text-st-text"}`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export const fmtTime = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 100) / 10);
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(1).padStart(4, "0")}`;
};

export const fmtBytes = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);

/** Starts a file download without navigating away from the editor. */
export function triggerDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
