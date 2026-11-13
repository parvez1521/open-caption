# Node Whisper reference — summary

Model: onnx-community/whisper-base_timestamped @ 608c49e6 (stock base, q8), cache-only.
Hinglish note: stock base with language token `en`. The app's Hinglish choice uses a fine-tuned model not in the cache, so Hinglish rows are an approximation.
This tests the model, not the browser worker path.

- v01_short_hinglish_720x1280.mp4: ok — 1/8 ref words matched; missing: aapki, reel, pe, dekhi, ja, rahi, hai — "You are watching on real mute."
- v02_normal_hinglish_1080x1920.mp4: ok — 5/26 ref words matched; missing: aapki, reel, mute, pe, dekhi, ja, rahi, hai, aadhe, log, karte, hi, nahi, bina, ke, aapki, kabhi, suni, hi, nahi, jaati — "Your real mood is going on. People don't sound on the streets. Without the captions, your best line never goes on."
- v03_long_hinglish_1280x720.mp4: ok — 8/50 ref words matched; missing: aapki, reel, mute, pe, dekhi, ja, rahi, hai, aadhe, log, karte, hi, nahi, bina, ke, aapki, kabhi, suni, hi, nahi, jaati, ek, reel, ke, ek, minute, mein, dekho, kaise, step, one, clip, drop, karo, step, two, har, apne, pe, aa, jaata, hai — "Your real mood is going on. People don't sound like this. Without the captions, your best line never goes on. Caption it"
- v04_english_720x1280.mp4: ok — "hyperbolic"
- v05_hinglish_720x1280.mp4: ok — 4/18 ref words matched; missing: aadhe, log, on, karte, hi, nahi, bina, ke, aapki, kabhi, suni, hi, nahi, jaati — "People don't sound like them. Without the captions, your best line never goes to listen."
- v06_music_hinglish_720x1280.mp4: ok — 4/18 ref words matched; missing: aadhe, log, on, karte, hi, nahi, bina, ke, aapki, kabhi, suni, hi, nahi, jaati — "People don't sound like them. Without the captions, your best line never goes to sleep."
- v07_silence_720x1280.mp4: ok — 0/0 ref words matched; missing: none — "you"
- v08_noisy_hinglish_720x1280.mp4: ok — 3/18 ref words matched; missing: aadhe, log, on, karte, hi, nahi, bina, ke, aapki, line, kabhi, suni, hi, nahi, jaati — "People don't sound like this. Without any captions, your best flying hobby will never be seen."
- v09_noaudio_720x1280.mp4: ffmpeg-failed
- v13_twoseg_720x1280.mp4: ok — 2/17 ref words matched; missing: aapki, reel, mute, pe, dekhi, ja, rahi, hai, ek, reel, ke, ek, mein, dekho, kaise — "Your Rehearsal is going to be seen on your Reheal. 1 Reheal Captions, 1 Minute. How to see?"
