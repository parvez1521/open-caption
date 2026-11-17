#!/usr/bin/env python3
"""Synthesize the 29 everyday SFX for the Captionit Studio bundled pack.

Reproducible generator (2026-11-18): every sound is built from scratch in
code with numpy/scipy DSP -- oscillators, filtered noise, envelopes -- and
encoded to OGG Vorbis with ffmpeg. NO downloaded audio, NO copied
recordings: the famous meme recordings and Freesound files are off limits,
and the Freesound CDN refuses downloads from this sandbox anyway (the same
reason the 2026-11-11 meme group was synthesized in code).

Usage (from the repo root of this worktree):
    python3 apps/frontend/scripts/synthesize-sfx-2026-11-18.py

It writes the 29 .ogg files to apps/frontend/public/stock-sfx/, verifies
each one (OggS header, ffprobe duration vs the target, RMS non-silence,
size < 150 KB), and appends the matching records to manifest.json
(replacing any previous records with the same ids, so re-runs are safe).
It also extends the pack note with one line recording this batch.

Families (29): whoosh 5, pop 4, click 3, ding 4, riser 3, downlifter 2,
impact 3, tick 2, glitch 2, boing 1.
"""

import json
import math
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfilt

SR = 44100
SCRIPT_DIR = Path(__file__).resolve().parent
SFX_DIR = SCRIPT_DIR.parent / "public" / "stock-sfx"
MANIFEST = SFX_DIR / "manifest.json"
DATE = "2026-11-18"
MAX_KB = 150

# ---------------------------------------------------------------- helpers

def t_axis(dur):
    return np.arange(int(SR * dur)) / SR


def normalise(x, peak=0.85):
    m = np.max(np.abs(x))
    return x * (peak / m) if m > 0 else x


def fade_out(x, ms=8):
    n = min(len(x), int(SR * ms / 1000))
    if n:
        x = x.copy()
        x[-n:] *= np.linspace(1.0, 0.0, n)
    return x


def sine_glide(f0, f1, dur, amp=1.0, curve="exp"):
    """Sine whose frequency sweeps f0 -> f1 (exponential by default)."""
    t = t_axis(dur)
    frac = t / dur
    freq = f0 * (f1 / f0) ** frac if curve == "exp" else f0 + (f1 - f0) * frac
    phase = 2 * np.pi * np.cumsum(freq) / SR
    return amp * np.sin(phase)


def adsr_env(n, attack_frac=0.05, decay=4.0):
    """Fast attack, exponential decay to ~0. attack_frac of the length."""
    t = np.arange(n) / n
    env = np.ones(n)
    a = max(1, int(n * attack_frac))
    env[:a] = np.linspace(0.0, 1.0, a)
    env[a:] = np.exp(-decay * (t[a:] - attack_frac) / max(1e-9, 1 - attack_frac))
    return env


def swell_env(n, peak_frac=0.4):
    """Rise to a peak then fall -- the whoosh/riser shape."""
    t = np.arange(n) / n
    env = np.where(t < peak_frac, t / peak_frac,
                   np.exp(-3.0 * (t - peak_frac) / max(1e-9, 1 - peak_frac)))
    return env


def bp_noise(dur, points, seed, q_width=1.6):
    """White noise through a band-pass whose centre sweeps along `points`
    (list of (fraction, Hz), log-interpolated), windowed overlap-add so the
    sweep is smooth. This is what makes a whoosh sound like air moving."""
    n = int(SR * dur)
    rng = np.random.default_rng(seed)
    x = rng.standard_normal(n)
    fr = np.array([p[0] for p in points], dtype=float)
    fq = np.array([p[1] for p in points], dtype=float)
    win, hop = 1024, 256
    hann = np.hanning(win)
    out = np.zeros(n)
    wsum = np.zeros(n)
    for start in range(0, n, hop):
        end = min(start + win, n)
        frac = (start + win / 2) / n
        fc = float(np.exp(np.interp(frac, fr, np.log(fq))))
        lo = max(40.0, fc / q_width)
        hi = min(SR / 2 - 100.0, fc * q_width)
        sos = butter(2, [lo, hi], btype="band", fs=SR, output="sos")
        seg = sosfilt(sos, x[start:end])
        seg = seg * hann[: len(seg)]
        out[start:end] += seg
        wsum[start:end] += hann[: len(seg)]
    wsum[wsum < 1e-6] = 1.0
    return out / wsum


def lp_noise(dur, cutoff, seed):
    rng = np.random.default_rng(seed)
    sos = butter(2, cutoff, btype="low", fs=SR, output="sos")
    return sosfilt(sos, rng.standard_normal(int(SR * dur)))


def hp_noise(dur, f0, f1, seed):
    """High-passed noise with a rising cutoff (airy riser)."""
    n = int(SR * dur)
    rng = np.random.default_rng(seed)
    x = rng.standard_normal(n)
    win, hop = 1024, 256
    hann = np.hanning(win)
    out = np.zeros(n)
    wsum = np.zeros(n)
    for start in range(0, n, hop):
        end = min(start + win, n)
        frac = (start + win / 2) / n
        fc = f0 * (f1 / f0) ** frac
        sos = butter(2, min(fc, SR / 2 - 100), btype="high", fs=SR, output="sos")
        seg = sosfilt(sos, x[start:end]) * hann[: end - start]
        out[start:end] += seg
        wsum[start:end] += hann[: end - start]
    wsum[wsum < 1e-6] = 1.0
    return out / wsum


def bell(partials, dur):
    """Inharmonic bell: [(freq, amp, decay_rate)] partials, exp decay."""
    t = t_axis(dur)
    out = np.zeros_like(t)
    for f, a, d in partials:
        out += a * np.sin(2 * np.pi * f * t) * np.exp(-d * t)
    return out


def blip(freq, dur, amp=1.0, decay=90.0):
    t = t_axis(dur)
    return amp * np.sin(2 * np.pi * freq * t) * np.exp(-decay * t)


def rms(x):
    return float(np.sqrt(np.mean(np.asarray(x, dtype=float) ** 2)))


def place(dur, segments):
    """Mix (offset_seconds, samples) segments into a buffer of exact length
    int(SR * dur), truncating any overflow. Avoids float-rounding length
    mismatches when a segment length is computed as dur - offset."""
    total = int(SR * dur)
    out = np.zeros(total)
    for off, seg in segments:
        start = int(SR * off)
        end = min(total, start + len(seg))
        if end > start:
            out[start:end] += seg[: end - start]
    return out


# ---------------------------------------------------------------- sounds
# Each entry: (id, displayName, use, dsp note, duration_s, synth_fn)
# synth_fn takes the sound's index (used as the deterministic RNG seed).

def _whoosh(seed, dur, points, extra=None):
    x = bp_noise(dur, points, seed) * swell_env(int(SR * dur))
    if extra is not None:
        x = x + extra
    return fade_out(normalise(x, 0.8))


def _pop(seed, dur, f0, f1, amp=1.0, attack=0.02):
    x = sine_glide(f0, f1, dur) * adsr_env(int(SR * dur), attack_frac=attack, decay=6.0)
    click = lp_noise(0.02, 4000, seed) * 0.25
    x[: len(click)] += click
    return fade_out(normalise(x * amp, 0.8))


def _click(seed, freq, dur, noise_cutoff, noise_amp):
    x = blip(freq, dur, amp=0.9, decay=140.0)
    x[: int(SR * 0.008)] += lp_noise(0.008, noise_cutoff, seed) * noise_amp
    return fade_out(normalise(x, 0.7))


def _ding(seed, partials, dur):
    return fade_out(normalise(bell(partials, dur), 0.8))


SOUNDS = [
    # -- whoosh x5: band-passed noise, different sweep / length / weight --
    ("sfx-whoosh-soft", "Whoosh (soft)",
     "A gentle airy whoosh for soft cuts and calm scene changes.",
     "band-passed noise sweep 300 to 1200 Hz, 0.6 s swell",
     0.60, lambda i: _whoosh(i, 0.60, [(0, 300), (1, 1200)])),
    ("sfx-whoosh-fast", "Whoosh (fast)",
     "A quick snappy whoosh for fast cuts and whip transitions.",
     "band-passed noise sweep 400 to 3200 Hz, 0.35 s",
     0.35, lambda i: _whoosh(i, 0.35, [(0, 400), (1, 3200)])),
    ("sfx-whoosh-heavy", "Whoosh (heavy)",
     "A long heavy whoosh with a low thump for big reveals.",
     "band-passed noise sweep 150 to 900 Hz + 120 to 50 Hz sine thump, 1.2 s",
     1.20, lambda i: _whoosh(i, 1.20, [(0, 150), (1, 900)],
                             extra=sine_glide(120, 50, 1.20) * swell_env(int(SR * 1.20), 0.5) * 0.9)),
    ("sfx-whoosh-swish", "Whoosh (swish)",
     "A swish that rises and falls, for slides and swipes.",
     "band-passed noise sweep 900 to 2600 back to 900 Hz, 0.5 s",
     0.50, lambda i: _whoosh(i, 0.50, [(0, 900), (0.5, 2600), (1, 900)])),
    ("sfx-whoosh-whip-pan", "Whoosh (whip pan)",
     "A whip-pan whoosh that snaps up and drops, for punch-in cuts.",
     "band-passed noise sweep 500 to 4200 Hz + 800 to 200 Hz sine tail, 0.45 s",
     0.45, lambda i: _whoosh(i, 0.45, [(0, 500), (1, 4200)],
                             extra=np.concatenate([np.zeros(int(SR * 0.30)),
                                                   sine_glide(800, 200, 0.15) * 0.7]))),
    # -- pop x4: sine burst pitching down, different start pitch / length --
    ("sfx-pop-bright", "Pop (bright)",
     "A bright pop for text and stickers snapping onto screen.",
     "sine glide 900 to 300 Hz, 0.09 s",
     0.09, lambda i: _pop(i, 0.09, 900, 300)),
    ("sfx-pop-soft", "Pop (soft)",
     "A soft pop for gentle elements fading in.",
     "sine glide 500 to 200 Hz, 0.12 s, slow attack",
     0.12, lambda i: _pop(i, 0.12, 500, 200, attack=0.10)),
    ("sfx-pop-deep", "Pop (deep)",
     "A deep rounded pop for big words landing.",
     "sine glide 300 to 80 Hz, 0.18 s",
     0.18, lambda i: _pop(i, 0.18, 300, 80)),
    ("sfx-pop-bubble", "Pop (bubble)",
     "A playful bubble pop that wobbles up then down.",
     "sine glide 600 to 1400 to 350 Hz, 0.16 s",
     0.16, lambda i: fade_out(normalise(
        np.concatenate([sine_glide(600, 1400, 0.08), sine_glide(1400, 350, 0.08)])
        * adsr_env(int(SR * 0.16), attack_frac=0.02, decay=6.0), 0.8))),
    # -- click x3: short blip + noise tick, different pitch / hardness --
    ("sfx-click-soft", "Click (soft)",
     "A soft UI click for taps and gentle button presses.",
     "1200 Hz sine blip + soft noise tick, 0.05 s",
     0.05, lambda i: _click(i, 1200, 0.05, 2000, 0.30)),
    ("sfx-click-mechanical", "Click (mechanical)",
     "A sharp mechanical click for keyboards and switches.",
     "2600 Hz blip + sharp noise burst, 0.07 s",
     0.07, lambda i: _click(i, 2600, 0.07, 6000, 0.55)),
    ("sfx-click-tick", "Click (tick)",
     "A tiny high tick for list items landing one by one.",
     "2000 Hz sine blip, 0.04 s",
     0.04, lambda i: _click(i, 2000, 0.04, 5000, 0.35)),
    # -- ding x4: inharmonic bell partials, different pitch / pattern --
    ("sfx-ding-high", "Ding (high)",
     "A high clear ding for notifications and highlights.",
     "bell partials 2093, 3520, 5274 Hz, 0.9 s decay",
     0.90, lambda i: _ding(i, [(2093, 1.0, 4.0), (3520, 0.5, 6.0), (5274, 0.25, 9.0)], 0.90)),
    ("sfx-ding-soft", "Ding (soft)",
     "A soft warm ding for calm confirmations.",
     "bell partials 880, 1318, 1760 Hz, 0.8 s decay",
     0.80, lambda i: _ding(i, [(880, 1.0, 3.5), (1318, 0.45, 5.0), (1760, 0.2, 7.0)], 0.80)),
    ("sfx-ding-triple", "Ding (triple)",
     "Three rising dings for a three-step win or countdown end.",
     "three bell strikes 1568, 1319, 1760 Hz at 0, 0.18, 0.36 s, 1.2 s",
     1.20, lambda i: fade_out(normalise(place(1.20, [
        (off, bell([(f, 1.0, 4.0), (f * 2.76, 0.4, 7.0)], 1.20 - off))
        for off, f in [(0, 1568), (0.18, 1319), (0.36, 1760)]]), 0.8))),
    ("sfx-ding-chime", "Ding (chime)",
     "A five-note chime arpeggio for completions and celebrations.",
     "five bell strikes C5 E5 G5 B5 D6 every 0.16 s, 1.8 s",
     1.80, lambda i: fade_out(normalise(place(1.80, [
        (k * 0.16, bell([(f, 1.0, 3.0), (f * 2.0, 0.35, 6.0)], 1.80 - k * 0.16))
        for k, f in enumerate([523, 659, 784, 988, 1175])]), 0.8))),
    # -- riser x3: rising pitch / noise, different length / airiness --
    ("sfx-riser-short", "Riser (short)",
     "A short build-up riser into a quick reveal.",
     "sine sweep 200 to 1200 Hz + noise sweep 400 to 2000 Hz, 0.7 s",
     0.70, lambda i: fade_out(normalise(
        sine_glide(200, 1200, 0.70) * swell_env(int(SR * 0.70), 0.9) * 0.7
        + bp_noise(0.70, [(0, 400), (1, 2000)], i) * swell_env(int(SR * 0.70), 0.9) * 0.8, 0.8))),
    ("sfx-riser-long", "Riser (long)",
     "A long two-second riser building into a big payoff.",
     "sine sweep 150 to 1800 Hz + noise sweep 300 to 3000 Hz, 2.0 s",
     2.00, lambda i: fade_out(normalise(
        sine_glide(150, 1800, 2.00) * swell_env(int(SR * 2.00), 0.95) * 0.7
        + bp_noise(2.00, [(0, 300), (1, 3000)], i) * swell_env(int(SR * 2.00), 0.95) * 0.8, 0.8))),
    ("sfx-riser-air", "Riser (air)",
     "An airy breath-like riser for dreamy transitions.",
     "high-passed noise cutoff sweep 1000 to 6000 Hz, 1.5 s",
     1.50, lambda i: fade_out(normalise(
        hp_noise(1.50, 1000, 6000, i) * swell_env(int(SR * 1.50), 0.9), 0.75))),
    # -- downlifter x2: falling pitch / noise, the release after a riser --
    ("sfx-downlifter-short", "Downlifter (short)",
     "A short falling sweep to release tension after a reveal.",
     "sine sweep 1200 to 120 Hz + noise sweep 2000 to 300 Hz, 0.8 s",
     0.80, lambda i: fade_out(normalise(
        sine_glide(1200, 120, 0.80) * adsr_env(int(SR * 0.80), attack_frac=0.02, decay=2.5) * 0.8
        + bp_noise(0.80, [(0, 2000), (1, 300)], i) * adsr_env(int(SR * 0.80), attack_frac=0.02, decay=2.5) * 0.6, 0.8))),
    ("sfx-downlifter-long", "Downlifter (long)",
     "A long slow fall with a soft tail, for scene exits.",
     "sine sweep 900 to 60 Hz + noise sweep 1500 to 200 Hz, 1.6 s",
     1.60, lambda i: fade_out(normalise(
        sine_glide(900, 60, 1.60) * adsr_env(int(SR * 1.60), attack_frac=0.02, decay=2.0) * 0.8
        + bp_noise(1.60, [(0, 1500), (1, 200)], i) * adsr_env(int(SR * 1.60), attack_frac=0.02, decay=2.0) * 0.6, 0.8))),
    # -- impact x3: low sine drop + noise thump, different weight --
    ("sfx-impact-deep", "Impact (deep)",
     "A deep bass impact for the biggest moment landing.",
     "sine drop 90 to 35 Hz + low-passed noise thump, 1.0 s",
     1.00, lambda i: fade_out(normalise(
        sine_glide(90, 35, 1.00) * adsr_env(int(SR * 1.00), attack_frac=0.01, decay=3.0)
        + lp_noise(1.00, 250, i) * adsr_env(int(SR * 1.00), attack_frac=0.01, decay=5.0) * 0.6, 0.85))),
    ("sfx-impact-punch", "Impact (punch)",
     "A short punchy hit for cuts that need weight.",
     "sine drop 160 to 50 Hz + click transient, 0.4 s",
     0.40, lambda i: fade_out(normalise(
        sine_glide(160, 50, 0.40) * adsr_env(int(SR * 0.40), attack_frac=0.01, decay=5.0)
        + np.concatenate([lp_noise(0.02, 3000, i) * 0.5, np.zeros(int(SR * 0.38))]), 0.85))),
    ("sfx-impact-thud", "Impact (thud)",
     "A dull heavy thud for titles and big words landing.",
     "sine drop 120 to 60 Hz + dull low-passed noise, 0.6 s",
     0.60, lambda i: fade_out(normalise(
        sine_glide(120, 60, 0.60) * adsr_env(int(SR * 0.60), attack_frac=0.01, decay=4.0)
        + lp_noise(0.60, 300, i) * adsr_env(int(SR * 0.60), attack_frac=0.01, decay=4.0) * 0.8, 0.85))),
    # -- tick x2: countdown ticks, different rhythm --
    ("sfx-tick-fast", "Tick (fast)",
     "Three rapid ticks for fast countdowns.",
     "three 3000 Hz ticks at 0, 0.12, 0.24 s, 0.35 s",
     0.35, lambda i: fade_out(normalise(place(0.35, [
        (off, blip(3000, 0.35 - off, amp=0.9, decay=160.0))
        for off in [0, 0.12, 0.24]]), 0.7))),
    ("sfx-tick-clock", "Tick (clock)",
     "A single woody clock tick for timers and waiting beats.",
     "1800 Hz sine tick + short noise, 0.12 s",
     0.12, lambda i: fade_out(normalise(
        blip(1800, 0.12, amp=0.9, decay=110.0)
        + np.concatenate([lp_noise(0.01, 2500, i) * 0.4, np.zeros(int(SR * 0.11))]), 0.7))),
    # -- glitch x2: chopped digital slices, different character --
    ("sfx-glitch-digital", "Glitch (digital)",
     "A digital glitch burst for tech and gaming cuts.",
     "8 random square-wave slices 800 to 4000 Hz with noise bursts, 0.5 s",
     0.50, lambda i: fade_out(normalise(_glitch_digital(i), 0.7))),
    ("sfx-glitch-stutter", "Glitch (stutter)",
     "A stuttering sliced tone for jump cuts and errors.",
     "660 Hz sine chopped into 6 slices, 4-bit crushed, 0.6 s",
     0.60, lambda i: fade_out(normalise(_glitch_stutter(i), 0.7))),
    # -- boing x1 --
    ("sfx-boing", "Boing",
     "A springy cartoon boing for comedy beats.",
     "sine 320 to 85 Hz with damped 12 Hz wobble + 2nd harmonic, 0.7 s",
     0.70, lambda i: fade_out(normalise(_boing(), 0.8))),
]


def _glitch_digital(seed):
    rng = np.random.default_rng(seed + 1000)
    dur = 0.50
    n = int(SR * dur)
    out = np.zeros(n)
    pos = 0
    while pos < n:
        seg_len = int(SR * rng.uniform(0.02, 0.06))
        freq = float(rng.uniform(800, 4000))
        t = np.arange(seg_len) / SR
        tone = np.sign(np.sin(2 * np.pi * freq * t)) * 0.6
        tone += rng.standard_normal(seg_len) * 0.3
        end = min(pos + seg_len, n)
        out[pos:end] += tone[: end - pos]
        pos = end + int(SR * rng.uniform(0.005, 0.02))  # gap = the stutter
    return out * adsr_env(n, attack_frac=0.02, decay=1.5)


def _glitch_stutter(seed):
    dur = 0.60
    t = t_axis(dur)
    tone = np.sin(2 * np.pi * 660 * t)
    # 4-bit crush
    tone = np.round(tone * 7) / 7
    # chop into 6 slices with growing gaps
    out = tone.copy()
    edges = np.linspace(0, 1, 7)
    for k in range(6):
        gap = 0.02 + 0.02 * k
        s, e = int(SR * edges[k]), int(SR * edges[k + 1])
        cut = int(SR * gap * 0.3)
        if k < 5:
            out[e - cut:e] = 0
    return out * adsr_env(int(SR * dur), attack_frac=0.02, decay=2.0)


def _boing():
    dur = 0.70
    t = t_axis(dur)
    wobble = 1.0 + 0.45 * np.exp(-8 * t) * np.sin(2 * np.pi * 12 * t)
    freq = (320 * (85 / 320) ** (t / dur)) * wobble
    phase = 2 * np.pi * np.cumsum(freq) / SR
    tone = np.sin(phase) + 0.3 * np.sin(2 * phase)
    return tone * adsr_env(int(SR * dur), attack_frac=0.01, decay=3.5)


# ---------------------------------------------------------------- encode

def encode_ogg(samples, out_path):
    """PCM float -> 16-bit WAV temp -> OGG Vorbis (libvorbis q4) via ffmpeg."""
    pcm = np.clip(samples, -1.0, 1.0)
    pcm16 = (pcm * 32767).astype(np.int16)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        with wave.open(tmp_path, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm16.tobytes())
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", tmp_path,
             "-c:a", "libvorbis", "-q:a", "4", str(out_path)],
            check=True)
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def probe_duration(path):
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def main():
    SFX_DIR.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text())
    existing_ids = {it["id"] for it in manifest["items"]}
    assert len(SOUNDS) == 29, f"expected 29 sounds, got {len(SOUNDS)}"
    ids = [s[0] for s in SOUNDS]
    assert len(set(ids)) == 29, "duplicate ids in SOUNDS"
    assert not (set(ids) & existing_ids), "ids already in manifest"

    new_items = []
    print(f"{'id':<24} {'target':>6} {'actual':>7} {'rms':>6} {'size':>7}")
    for idx, (sid, name, use, dsp, dur, fn) in enumerate(SOUNDS):
        samples = fn(idx)
        assert len(samples) == int(SR * dur), f"{sid}: length mismatch"
        r = rms(samples)
        assert r > 0.01, f"{sid}: silent (rms {r:.4f})"
        out_path = SFX_DIR / f"{sid}.ogg"
        encode_ogg(samples, out_path)
        assert out_path.read_bytes()[:4] == b"OggS", f"{sid}: bad OGG header"
        size = out_path.stat().st_size
        assert size < MAX_KB * 1024, f"{sid}: {size} bytes over {MAX_KB} KB"
        actual = probe_duration(out_path)
        assert abs(actual - dur) < 0.08, f"{sid}: duration {actual:.3f} vs {dur}"
        print(f"{sid:<24} {dur:>6.2f} {actual:>7.3f} {r:>6.3f} {size // 1024:>6}K")
        new_items.append({
            "author": "Captionit",
            "displayName": name,
            "durationMs": int(round(actual * 1000)),
            "file": f"{sid}.ogg",
            "format": "OGG Vorbis (original synthesis, no samples)",
            "group": "sfx",
            "id": sid,
            "licence": "CC0 1.0",
            "licenceSource": "synth",
            "originalFile": f"synthesized in code (Python DSP: {dsp})",
            "retrievedAt": DATE,
            "sourceUrl": "/credits#stock-sfx",
            "title": f"Everyday sound effects — {name} (original synthesis)",
            "use": use,
        })

    manifest["items"].extend(new_items)
    note_add = (
        " Everyday SFX (added 2026-11-18): 29 ORIGINAL SYNTHESIZED effects made in code by "
        "Captionit (Python DSP: oscillators, filtered noise, envelopes — see "
        "apps/frontend/scripts/synthesize-sfx-2026-11-18.py) covering the most-used short-form "
        "sounds (whoosh, pop, click, ding, riser, downlifter, impact, tick, glitch, boing) — "
        "never copies of found recordings; each is labelled 'original synthesis' wherever it appears."
    )
    if "2026-11-18" not in manifest["pack"]["note"]:
        manifest["pack"]["note"] += note_add
    MANIFEST.write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n")
    total = sum((SFX_DIR / it["file"]).stat().st_size for it in manifest["items"])
    print(f"\nOK: 29 sounds written, manifest now {len(manifest['items'])} items, "
          f"pack total {total // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
