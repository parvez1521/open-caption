/** Auto caption generator FAQ. Shared by the FAQ section on the page and the
 *  FAQPage structured data in layout.tsx, so the two always match. Every
 *  answer states only verified product facts (see the baseline audit in
 *  seo/competitor-intelligence/audit/captionit-baseline.md). */
export const AUTO_CAPTION_FAQS = [
  {
    q: "Is the automatic caption generator free?",
    a: "Yes. Captions, every look, the full editor and SRT exports are free. Free MP4 exports carry a small Captionit watermark. Paid plans export clean, and ₹69 once removes it from one video. Free videos can be up to 5 minutes long. Paid plans add minutes — see Pricing.",
  },
  {
    q: "Do I have to upload my video anywhere?",
    a: "For transcription and the normal MP4 export, no. Speech recognition and rendering run inside your browser. The video file is not sent anywhere for those. The file name, size, length and format are stored with your project. Your captions and transcripts are saved. So you can reopen the project later.. One exception: transparent overlay exports are rendered by the desktop Companion app. That render does use the video from your project.",
  },
  {
    q: "Which languages can it caption?",
    a: "14 languages: English, Hindi, Hinglish, Tamil, Telugu, Bengali, Marathi, Punjabi, Urdu, Spanish, French, German, Arabic and Portuguese. Hindi and Hinglish captions come out in Roman script, the way most creators type; Hindi in Devanagari script is a separate option.",
  },
  {
    q: "Can I fix a word it heard wrong?",
    a: "Yes. Every word is timed to the speech, and every word is editable. Click a word and type the correction. The timing stays. You can also shift all captions at once. If the whole track is early or late..",
  },
  {
    q: "What can I export?",
    a: "An MP4 with the captions burned in, ready to post on Reels, Shorts and TikTok; transparent overlay videos (MOV and WebM) rendered by the free desktop Companion app; and caption files (SRT, VTT, ASS, plain text and JSON) for YouTube, LinkedIn, Premiere, CapCut and other editors. MP4 export needs Chrome, Edge or Safari.",
  },
  {
    q: "What can it not do?",
    a: "It transcribes what was actually said. So it cannot invent captions for silent video. It will make mistakes on heavy background noise. Overlapping speakers. Or very quiet speech.. Fix those by editing the words. It is built for short video. Free videos can be up to 5 minutes long. The longest paid plan allows videos up to 3 hours.",
  },
] as const;
