#!/usr/bin/env python3
"""Build synthetic QA test assets for Captionit overnight audit.
gTTS is BLOCKED on this VM (translate.google.com unreachable via the egress
proxy), so speech comes from the campaign's already-rendered Hinglish VO
segments (exact reference text in the reel scripts) + the repo's existing
speech-test.mp3 (real English speech, 3 words, exact text unverified).
Video via ffmpeg (local). Reference transcripts in MANIFEST.md.
"""
import os, subprocess, sys, shutil

OUT = os.path.expanduser("~/workspace/oc-overnight-qa/qa/overnight-audit/tests/assets")
VO = os.path.expanduser("~/workspace/marketing/captionit-15-day-campaign/assets/audio/vo")
BC = os.path.expanduser("~/workspace/oc-browser-check")
os.makedirs(OUT, exist_ok=True)
os.chdir(OUT)

def ff(*args):
    cmd = ["ffmpeg", "-y", "-v", "error"] + list(args)
    r = subprocess.run(cmd)
    if r.returncode != 0:
        print("FAILED:", " ".join(cmd)); sys.exit(1)

def vid(out, w, h, dur, audio=None, mix=None):
    vf = f"color=c=0x1c1c1a:s={w}x{h}:d={dur},format=yuv420p"
    args = ["-f", "lavfi", "-i", vf]
    if audio:
        args += ["-i", audio, "-t", str(dur)]
        if mix:
            args += ["-filter_complex", mix, "-map", "0:v", "-map", "[a]"]
        else:
            args += ["-map", "0:v", "-map", "1:a", "-shortest"]
    else:
        args += ["-t", str(dur), "-an"]
    args += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
             "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", out]
    ff(*args)
    print("made", out)

# Concat helpers (same codec, re-encode for safety)
ff("-i", f"{VO}/r1s1.mp3", "-i", f"{VO}/r1s2.mp3", "-filter_complex",
   "[0:a][1:a]concat=n=2:v=0:a=1[a]", "-map", "[a]", "hinglish_12s.mp3")
ff("-i", f"{VO}/r1s1.mp3", "-i", f"{VO}/r1s2.mp3", "-i", f"{VO}/r1s3.mp3",
   "-i", f"{VO}/r1s4.mp3", "-i", f"{VO}/r2s1.mp3", "-i", f"{VO}/r2s2.mp3",
   "-i", f"{VO}/r2s3.mp3", "-i", f"{VO}/r2s4.mp3", "-filter_complex",
   "[0:a][1:a][2:a][3:a][4:a][5:a][6:a][7:a]concat=n=8:v=0:a=1[a]",
   "-map", "[a]", "hinglish_30s.mp3")

# v01 short Hinglish portrait 720p (~3s, r1s1)
vid("v01_short_hinglish_720x1280.mp4", 720, 1280, 3.2, audio=f"{VO}/r1s1.mp3")
# v02 normal Hinglish portrait 1080p (12s)
vid("v02_normal_hinglish_1080x1920.mp4", 1080, 1920, 12, audio="hinglish_12s.mp3")
# v03 long Hinglish landscape 720p (30s)
vid("v03_long_hinglish_1280x720.mp4", 1280, 720, 30, audio="hinglish_30s.mp3")
# v04 English speech-test (4.3s, exact words unverified)
vid("v04_english_720x1280.mp4", 720, 1280, 4.3, audio=f"{BC}/speech-test.mp3")
# v05 Hinglish single segment (8s, r1s2)
vid("v05_hinglish_720x1280.mp4", 720, 1280, 8, audio=f"{VO}/r1s2.mp3")
# v06 speech + background music tone (8s)
vid("v06_music_hinglish_720x1280.mp4", 720, 1280, 8, audio=f"{VO}/r1s2.mp3",
    mix="[1:a]volume=1.0[sp];sine=frequency=220:duration=8,volume=0.15[mu];[sp][mu]amix=inputs=2:duration=first[a]")
# v07 silence: silent audio track (6s)
ff("-f", "lavfi", "-i", "color=c=0x1c1c1a:s=720x1280:d=6,format=yuv420p",
   "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "6",
   "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", "v07_silence_720x1280.mp4")
print("made v07_silence_720x1280.mp4")
# v08 noisy: speech + white noise (8s)
vid("v08_noisy_hinglish_720x1280.mp4", 720, 1280, 8, audio=f"{VO}/r1s2.mp3",
    mix="[1:a]volume=1.0[sp];anoisesrc=duration=8:color=white,volume=0.12[nz];[sp][nz]amix=inputs=2:duration=first[a]")
# v09 no audio stream at all (6s)
vid("v09_noaudio_720x1280.mp4", 720, 1280, 6, audio=None)
# v10 corrupted: valid mp4 truncated to ~40%
data = open("v01_short_hinglish_720x1280.mp4", "rb").read()
open("v10_corrupt.mp4", "wb").write(data[: int(len(data) * 0.4)])
print("made v10_corrupt.mp4")
# v11 unsupported: plain text renamed .mp4
open("v11_unsupported.mp4", "w").write("this is not a video file\n" * 10)
print("made v11_unsupported.mp4")
# v12 zero-byte
open("v12_zero.mp4", "wb").close()
print("made v12_zero.mp4")
# v13 two segments back-to-back (SAME synthetic voice — not a true multi-speaker test)
ff("-i", f"{VO}/r1s1.mp3", "-i", f"{VO}/r2s1.mp3", "-filter_complex",
   "[0:a][1:a]concat=n=2:v=0:a=1[a]", "-map", "[a]", "twovoice.mp3")
vid("v13_twoseg_720x1280.mp4", 720, 1280, 8, audio="twovoice.mp3")
# v14 reference clip from the repo's earlier browser checks (copy, keep original name in manifest)
shutil.copy(f"{BC}/sample-clip.mp4", "v14_reference_sample-clip.mp4")
print("made v14_reference_sample-clip.mp4")

print("ALL ASSETS BUILT")
for f in sorted(os.listdir(".")):
    if f.endswith(".mp4"):
        print(f, os.path.getsize(f), "bytes")
