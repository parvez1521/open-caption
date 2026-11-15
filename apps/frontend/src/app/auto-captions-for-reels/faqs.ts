/** Auto captions for Reels FAQ. Shared by the FAQ section on the page and the
 *  FAQPage structured data in layout.tsx, so the two always match. Every
 *  answer states only verified product facts. */
export const REELS_FAQS = [
  {
    q: "Is it free to add auto captions to a Reel?",
    a: "Yes. Captions, every look, the full editor, MP4 and SRT exports are free. No watermark. Free videos can be up to 5 minutes long. Paid plans raise the limits. See Pricing.",
  },
  {
    q: "Do I still need Instagram's built-in captions?",
    a: "No. Burned-in captions are part of the video, so they show for everyone, everywhere. Instagram's own captions are an extra option: the viewer can turn them off, and they only work inside Instagram. Use one or the other, not both at once — two caption tracks on the same Reel fight each other.",
  },
  {
    q: "Will the captions show if someone downloads my Reel?",
    a: "Yes. Burned-in captions are part of the video file itself, so they travel with it — downloads, reposts, other apps. Instagram's built-in captions do not travel: they are an overlay Instagram adds only while the Reel plays inside Instagram.",
  },
  {
    q: "Which languages can it caption?",
    a: "14 languages: English, Hindi, Hinglish, Tamil, Telugu, Bengali, Marathi, Punjabi, Urdu, Spanish, French, German, Arabic and Portuguese. Hindi and Hinglish captions come out in Roman script, the way most creators type; Hindi in Devanagari script is a separate option.",
  },
  {
    q: "Can I fix a word it heard wrong?",
    a: "Yes. Every word is timed to the speech, and every word is editable. Click a word and type the correction. The timing stays. You can also shift all captions at once. If the whole track is early or late.",
  },
  {
    q: "Can I change the style after exporting?",
    a: "Yes. Your project is saved. Open it, pick another look, and export again. The captions and timing stay; only the style changes.",
  },
] as const;
