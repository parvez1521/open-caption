import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { LegalDoc, Sec } from "@/components/legal/Doc";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = pageMetadata({ title: "Privacy Policy", description: "What Captionit collects, why, where it is stored and your choices.", path: "/privacy" });

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="Privacy"
      accent="Policy"
      intro={<>This policy explains what we collect when you use the website, the studio and the optional desktop Companion app, why, who processes it for us, how long we keep it, and the choices you have. {LEGAL.operator} is the controller of this data.</>}
    >
      <Sec id="summary" title="In short">
        <ul>
          <li>Speech recognition runs <strong>in your browser</strong>, on your own device. We do not send your audio to a third-party speech service.</li>
          <li>We store your account, your projects (captions, full word-level transcripts and settings) and your exports so the studio works across devices. Your video files stay on your device — only their file name, size, length and format are stored with your project. The one exception is a transparent-overlay export you send to the desktop Companion app: that video passes through our storage so the Companion can render it.</li>
          <li>We do not sell personal data, and do not train AI models on your videos or transcripts.</li>
          <li>If advertising is enabled on the site, Google and other third-party vendors may use cookies to serve ads based on your prior visits — section 8 explains this and how to opt out. No ads run inside the editor, and advertising never touches your videos or transcripts.</li>
        </ul>
      </Sec>

      <Sec id="collect" title="1. What we collect">
        <ul>
          <li><strong>Account data:</strong> email address, name, password (stored only as a secure hash by our authentication provider) or your Google sign-in identity, and profile picture if your sign-in provider supplies one.</li>
          <li><strong>Your content:</strong> the videos you add (the files stay on your device; only their file name, size, length and format are stored with your project — except a video you send to a Companion export, which passes through our storage for that job), transcripts, captions, styles, saved looks, brand colours and fonts, and the files you export.</li>
          <li><strong>Companion data:</strong> for each computer you pair: its name, operating system, app version and capabilities (such as available disk space and installed speech models), and when it was last online. Pairing tokens are stored only as a secure hash.</li>
          <li><strong>Usage data:</strong> how much you upload, transcribe and render (to apply plan limits), job status and error logs, and basic request logs (IP address, browser, time) kept by our hosting provider for security and debugging.</li>
          <li><strong>Messages:</strong> anything you send us by email.</li>
        </ul>
      </Sec>

      <Sec id="use" title="2. Why we use it">
        <ul>
          <li>To provide the service: store and show your projects, transcribe and render when you ask, keep your edits in sync (performance of our contract with you).</li>
          <li>To keep it secure and working: detect abuse, prevent fraud, rate-limit, debug (legitimate interests).</li>
          <li>To apply usage limits (contract).</li>
          <li>To contact you about your account and important changes (contract; legitimate interests). Product newsletters only with your consent, with an unsubscribe link in every one.</li>
        </ul>
      </Sec>

      <Sec id="local" title="3. On-device processing">
        <p>By default, everything runs in your browser: speech recognition, editing and MP4 rendering happen on your device, and your video file is never uploaded. Only the file&rsquo;s name, size, length and format are sent to our servers and stored with your project. The optional desktop Companion app is the exception. For a transparent overlay export, the Companion downloads your video from our storage to your computer, renders the export locally, and uploads the result back to your account. The rendering never sends your video or audio anywhere else. The Companion keeps a local cache of videos it has processed, which you can clear by deleting its cache folder.</p>
      </Sec>

      <Sec id="ai" title="AI features">
        <p>Some features send text you choose to our AI provider, Groq (see the <Link href="/subprocessors">Subprocessors page</Link>). Growth Coach sends the question you ask, the last few turns of that chat, and a summary of your own Growth Studio data — your post titles and their views, reach, likes, comments, shares and saves, and the names, handles and notes of competitors you track. The Create tools send the prompt text you write, and Clipper highlights send transcript text from your video. No audio or video is ever sent to Groq, and we do not train AI models on anything you send.</p>
      </Sec>

      <Sec id="cloud" title="4. Transcription">
        <p>Speech recognition runs in your browser with a speech model downloaded once to your device. The audio of your video is processed there and is not sent to a third-party speech service.</p>
      </Sec>

      <Sec id="sharing" title="5. Who processes data for us">
        <p>We use a small number of service providers (subprocessors) to host the service, store files, sign you in, report errors, run our AI features and deliver speech models to your browser. The current list, with what each one does and where, is on our <Link href="/subprocessors">Subprocessors page</Link>. We share data with authorities only when legally required, and we would tell you unless we are prohibited from doing so.</p>
      </Sec>

      <Sec id="transfers" title="6. International transfers">
        <p>Our providers may store or process data outside your country, including in India (database and file storage) and the United States (website hosting and AI processing). Where the law requires it, we rely on appropriate safeguards such as standard contractual clauses.</p>
      </Sec>

      <Sec id="retention" title="7. How long we keep it">
        <ul>
          <li>Projects and captions: until you delete them or close your account.</li>
          <li>Exports: kept for 7 to 60 days depending on your plan (see Pricing), then deleted automatically.</li>
          <li>Deleted projects: removed from storage within 30 days, including backups.</li>
          <li>Account data: until you close your account, then deleted within 30 days, except records we must keep by law (for example invoices).</li>
          <li>Security and request logs: typically up to 30 days.</li>
        </ul>
      </Sec>

      <Sec id="advertising" title="8. Advertising">
        <p>We may show advertising on this website, served by Google AdSense. This section applies whenever advertising is enabled; while it is not enabled, no advertising cookies are set and no ad requests are made.</p>
        <ul>
          <li>Third-party vendors, including Google, use cookies to serve ads based on your prior visits to this and other websites.</li>
          <li>Google&rsquo;s use of advertising cookies enables it and its partners to serve ads based on your visits to this site and/or other sites on the Internet.</li>
          <li>You can opt out of personalised advertising by visiting <a href="https://www.google.com/settings/ads" target="_blank" rel="noreferrer">Google Ads Settings</a>, or opt out of many third-party vendors&rsquo; cookies at <a href="https://www.aboutads.info/choices/" target="_blank" rel="noreferrer">aboutads.info</a>. Opting out does not remove ads; it makes them non-personalised.</li>
          <li>Where the law requires it (for example in the EEA and the UK), personalised ads are only served after a consent choice through a Google-certified consent management platform.</li>
          <li>Advertising is separate from the product: it never uses your videos, audio, transcripts or projects, and ads are not shown inside the editor or your account pages.</li>
        </ul>
      </Sec>

      <Sec id="rights" title="9. Your rights and choices">
        <p>Depending on where you live (including under India&rsquo;s Digital Personal Data Protection Act, the GDPR and US state privacy laws) you can ask to access, correct, download or delete your personal data, object to or restrict some processing, withdraw consent, and nominate someone to exercise your rights. Email {LEGAL.email}; we reply within 30 days. You can also complain to your local data protection authority.</p>
        <p>You can edit your name in Settings, delete projects in the studio, revoke paired computers in Settings, and ask us to delete your account.</p>
      </Sec>

      <Sec id="security" title="10. Security">
        <p>Data is encrypted in transit (HTTPS) and at rest by our storage providers. Each account&rsquo;s data is isolated with database row-level security, files are private and served only through short-lived signed links, and Companion tokens are hashed and revocable. No system is perfectly secure; if a breach affects you we will notify you and the authorities as the law requires.</p>
      </Sec>

      <Sec id="children" title="11. Children">
        <p>{LEGAL.product} is not directed at children under {LEGAL.minAge}, and we do not knowingly collect their data. If you believe a child has given us data, contact us and we will delete it.</p>
      </Sec>

      <Sec id="cookies" title="12. Cookies and local storage">
        <p>We use only what is needed to keep you signed in and remember a few editor preferences. Our analytics (Vercel Analytics and Speed Insights) record page visits and a few product events without setting cookies. If advertising is enabled, Google and its partners may also set advertising cookies as described in section 8. See the <Link href="/cookies">Cookie Policy</Link>.</p>
      </Sec>

      <Sec id="changes" title="13. Changes">
        <p>We will update this policy as the service changes and tell you about material changes by email or in the app before they apply. The effective date at the top shows the current version.</p>
      </Sec>

      <Sec id="contact" title="14. Contact and grievance officer">
        <p>Privacy questions and requests: {LEGAL.email}. {LEGAL.operator}, {LEGAL.address}.</p>
      </Sec>
    </LegalDoc>
  );
}
