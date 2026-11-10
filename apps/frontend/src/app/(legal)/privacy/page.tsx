import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { PLANS } from "@capseasy/shared";
import { LegalDoc, Sec } from "@/components/legal/Doc";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = pageMetadata({ title: "Privacy Policy", description: "What Open Caption collects, why, where it is stored and your choices.", path: "/privacy" });

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="Privacy"
      accent="Policy"
      intro={<>This policy explains what we collect when you use the website, the studio and the optional desktop helper app, why, who processes it for us, how long we keep it, and the choices you have. {LEGAL.operator} is the controller of this data.</>}
    >
      <Sec id="summary" title="In short">
        <ul>
          <li>Speech recognition runs <strong>in your browser</strong>, on your own device. We do not send your audio to a third-party speech service.</li>
          <li>We store your account, your projects, your uploaded videos and your exports so the studio works across devices.</li>
          <li>We do not sell personal data, do not show ads, and do not train AI models on your videos or transcripts.</li>
        </ul>
      </Sec>

      <Sec id="collect" title="1. What we collect">
        <ul>
          <li><strong>Account data:</strong> email address, name, password (stored only as a secure hash by our authentication provider) or your Google sign-in identity, and profile picture if your sign-in provider supplies one.</li>
          <li><strong>Your content:</strong> videos you upload, audio extracted from them, transcripts, captions, styles, saved looks, brand colours and fonts, and the files you export.</li>
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
        <p>The Open Caption Companion downloads your video from our storage to your computer, transcribes it with a speech model that runs locally, renders exports locally, and uploads the results back to your account. The speech model and rendering never send your audio anywhere else. The Companion keeps a local cache of videos it has processed, which you can clear by deleting its cache folder.</p>
      </Sec>

      <Sec id="cloud" title="4. Transcription">
        <p>Speech recognition runs in your browser with a speech model downloaded once to your device. The audio of your video is processed there and is not sent to a third-party speech service.</p>
      </Sec>

      <Sec id="sharing" title="5. Who processes data for us">
        <p>We use a small number of service providers (subprocessors) to host the service, store files, sign you in. The current list, with what each one does and where, is on our <Link href="/subprocessors">Subprocessors page</Link>. We share data with authorities only when legally required, and we would tell you unless we are prohibited from doing so.</p>
      </Sec>

      <Sec id="transfers" title="6. International transfers">
        <p>Our providers may store or process data outside your country, including in South Korea (database and file storage) and the United States (website hosting). Where the law requires it, we rely on appropriate safeguards such as standard contractual clauses.</p>
      </Sec>

      <Sec id="retention" title="7. How long we keep it">
        <ul>
          <li>Projects, videos and captions: until you delete them or close your account.</li>
          <li>Exports: {PLANS.free.exportRetentionDays} days, then deleted automatically.</li>
          <li>Deleted projects: removed from storage within 30 days, including backups.</li>
          <li>Account data: until you close your account, then deleted within 30 days, except records we must keep by law (for example invoices).</li>
          <li>Security and request logs: typically up to 30 days.</li>
        </ul>
      </Sec>

      <Sec id="rights" title="8. Your rights and choices">
        <p>Depending on where you live (including under India&rsquo;s Digital Personal Data Protection Act, the GDPR and US state privacy laws) you can ask to access, correct, download or delete your personal data, object to or restrict some processing, withdraw consent, and nominate someone to exercise your rights. Email {LEGAL.email}; we reply within 30 days. You can also complain to your local data protection authority.</p>
        <p>You can edit your name in Settings, delete projects in the studio, revoke paired computers in Settings, and ask us to delete your account.</p>
      </Sec>

      <Sec id="security" title="9. Security">
        <p>Data is encrypted in transit (HTTPS) and at rest by our storage providers. Each account&rsquo;s data is isolated with database row-level security, files are private and served only through short-lived signed links, and Companion tokens are hashed and revocable. No system is perfectly secure; if a breach affects you we will notify you and the authorities as the law requires.</p>
      </Sec>

      <Sec id="children" title="10. Children">
        <p>{LEGAL.product} is not directed at children under {LEGAL.minAge}, and we do not knowingly collect their data. If you believe a child has given us data, contact us and we will delete it.</p>
      </Sec>

      <Sec id="cookies" title="11. Cookies and local storage">
        <p>We use only what is needed to keep you signed in and remember a few editor preferences. See the <Link href="/cookies">Cookie Policy</Link>.</p>
      </Sec>

      <Sec id="changes" title="12. Changes">
        <p>We will update this policy as the service changes and tell you about material changes by email or in the app before they apply. The effective date at the top shows the current version.</p>
      </Sec>

      <Sec id="contact" title="13. Contact and grievance officer">
        <p>Privacy questions and requests: {LEGAL.email}. {LEGAL.operator}, {LEGAL.address}.</p>
      </Sec>
    </LegalDoc>
  );
}
