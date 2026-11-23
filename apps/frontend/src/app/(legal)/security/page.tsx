import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { LegalDoc, Sec } from "@/components/legal/Doc";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = pageMetadata({ title: "Security", description: "How Captionit protects your account, projects and payments — and how to report a vulnerability.", path: "/security" });

export default function SecurityPage() {
  return (
    <LegalDoc
      title="Sec"
      accent="urity"
      intro={<>How {LEGAL.product} protects your account, your projects and your payments. This page describes the measures already in place — nothing here is a certification or a promise that no system can ever fail.</>}
    >
      <Sec id="measures" title="What we do">
        <ul>
          <li>Data is encrypted in transit (HTTPS) and at rest by our storage providers.</li>
          <li>Each account&rsquo;s data is isolated with database row-level security, so one account cannot read another&rsquo;s projects.</li>
          <li>Files are private and served only through short-lived signed links.</li>
          <li>Companion pairing tokens are stored only as a secure hash and can be revoked in Settings.</li>
          <li>Payments are processed by Cashfree — card data is handled by Cashfree and never touches our servers.</li>
          <li>Transcription and MP4 export run in your browser, so your video and audio are not sent to us for those steps.</li>
        </ul>
      </Sec>

      <Sec id="limits" title="What this does not mean">
        <p>No system is perfectly secure. If a breach affects you, we will notify you and the authorities as the law requires. You can help by keeping your Google account secure, signing out on shared devices, and revoking paired computers you no longer use in Settings.</p>
      </Sec>

      <Sec id="disclosure" title="Report a vulnerability">
        <p>If you find a security problem in Captionit — the website, sign-in, payments, or how projects and media are stored — please tell us at <strong>{LEGAL.email}</strong> with the subject &ldquo;Security report&rdquo;. Include what you found, where it is, and the steps to reproduce it, so we can check it quickly.</p>
        <p>We will confirm we received your report, investigate it, and fix confirmed problems. There is no bug bounty programme and no payment for reports.</p>
        <p>Please do not access other people&rsquo;s accounts or data, change or delete anything that is not yours, or disrupt the service while testing. If you are unsure whether a test is safe, ask us first at the same address.</p>
      </Sec>
    </LegalDoc>
  );
}
