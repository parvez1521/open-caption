# Node Whisper reference — summary

Model: ishaan-g/whisper-hinglish-swift_timestamped @ eb0fe25c (q8), cache-only.
Hinglish note: the app's real fine-tuned Hinglish model, language token `en` (per runtime.ts).
This tests the model, not the browser worker path.

- v01_short_hinglish_720x1280.mp4: ok — 6/8 ref words matched; missing: reel, pe — "Aapki re mute par dekhi ja rahi hai."
- v02_normal_hinglish_1080x1920.mp4: ok — 20/26 ref words matched; missing: reel, pe, aadhe, nahi, captions, nahi — "Aapki re mute par dekhi ja rahi hai. Aage log sound on karte hi nahin. Bina options ke aapki best line kabhi suni hi nah"
- v03_long_hinglish_1280x720.mp4: ok — 34/50 ref words matched; missing: reel, pe, aadhe, nahi, nahi, reel, step, one, clip, drop, step, two, apne, pe, aa, jaata — "Aapki real mute par dekhi ja rahi hai. Aage log sound on karte hi nahin. Bina cabsions ke, aapki best line kabhi suni hi"
- v05_hinglish_720x1280.mp4: ok — 13/18 ref words matched; missing: aadhe, on, nahi, captions, nahi — "Aage log sound karte hi nahin. Bina options ke aapki best line kabhi suni hi nahin jaati."
- v06_music_hinglish_720x1280.mp4: ok — 13/18 ref words matched; missing: aadhe, on, nahi, captions, nahi — "Aage log sound karte hi nahin. Bina options ke aapki best line kabhi suni hi nahin jaati."
- v07_silence_720x1280.mp4: ok — 0/0 ref words matched; missing: none — "you"
- v08_noisy_hinglish_720x1280.mp4: ok — 13/18 ref words matched; missing: aadhe, nahi, captions, suni, nahi — "Aage log sound on karte hi nahin. Bina options ke aapki best line kabhi sunie nahin jaati."
- v13_twoseg_720x1280.mp4: ok — 13/17 ref words matched; missing: reel, pe, reel, captions — "Aapki re mute par dekhi ja rahi hai. Ek re ke options ek minute mein. Dekho kaise?"
