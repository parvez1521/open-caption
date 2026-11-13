/** Auto caption generator FAQ. Shared by the FAQ section on the page and the
 *  FAQPage structured data in layout.tsx, so the two always match. Every
 *  answer states only verified product facts (see the baseline audit in
 *  seo/competitor-intelligence/audit/captionit-baseline.md). */
export const AUTO_CAPTION_FAQS = [
  {
    q: "Is the automatic caption generator free?",
    a: "Yes. Captions, every look, the full editor and MP4 and SRT exports are free, with no watermark. Free videos can be up to 5 minutes long. Paid 30-day passes raise the limits — see Pricing.",
  },
  {
    q: "Do I have to upload my video anywhere?",
    a: "For transcription and the normal MP4 export, no. Speech recognition and rendering run inside your browser, so the video file is not sent anywhere for those. The file name, size, length and format are stored with your project, and your captions and transcripts are saved so you can reopen the project later. One exception: transparent overlay exports are rendered by the optional desktop Companion app, and that render does use the video from your project.",
  },
  {
    q: "Which languages can it caption?",
    a: "14 languages: English, Hindi, Hinglish, Tamil, Telugu, Bengali, Marathi, Punjabi, Urdu, Spanish, French, German, Arabic and Portuguese. Hindi and Hinglish captions come out in Roman script, the way most creators type; Hindi in Devanagari script is a separate option.",
  },
  {
    q: "Can I fix a word it heard wrong?",
    a: "Yes. Every word is timed to the speech and every word is editable. Click a word, type the correction, and the timing stays. You can also shift all captions at once if the whole track is early or late.",
  },
  {
    q: "What can I export?",
    a: "An MP4 with the captions burned in, ready to post on Reels, Shorts and TikTok; transparent overlay videos (MOV and WebM) rendered by the free desktop Companion app; and caption files (SRT, VTT, ASS, plain text and JSON) for YouTube, LinkedIn, Premiere, CapCut and other editors. MP4 export needs Chrome, Edge or Safari.",
  },
  {
    q: "What can it not do?",
    a: "It transcribes what was actually said, so it cannot invent captions for silent video, and it will make mistakes on heavy background noise, overlapping speakers or very quiet speech. Fix those by editing the words. It is built for short video: free videos can be up to 5 minutes long, and the longest paid plan allows videos up to 3 hours.",
  },
] as const;
