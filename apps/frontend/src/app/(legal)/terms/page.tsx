import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { PLANS } from "@capseasy/shared";
import { uploadLimitLabel } from "@/lib/billing/pricingDisplay";
import { LegalDoc, Sec } from "@/components/legal/Doc";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = pageMetadata({ title: "Terms of Service", description: "The agreement that governs your use of Captionit.", path: "/terms" });

export default function TermsPage() {
  const free = PLANS.free;
  return (
    <LegalDoc
      title="Terms of"
      accent="Service"
      intro={<>These terms are the agreement between you and {LEGAL.operator} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) for using {LEGAL.product}: the website, the web studio, the Captionit Companion app and everything they produce. By creating an account or using the service you accept them. If you use {LEGAL.product} for an organisation, you accept them on its behalf.</>}
    >
      <Sec id="service" title="1. The service">
        <p>{LEGAL.product} turns your videos into captioned videos and subtitle files. You upload a video, captions are transcribed, you style and edit them in the studio, and you export the result.</p>
        <p>Transcription and MP4 export run <strong>in your browser</strong>, on your own device. Transparent overlay exports use the optional free desktop Companion app on your computer. Your projects and exports are stored with our hosting providers (see the <Link href="/subprocessors">subprocessors</Link>); your video files stay on your device — only their file name, size, length and format are stored with your project — except one you send to a Companion export.</p>
        <p>We improve the service continuously, so features may change. We will tell you in advance before removing a core feature.</p>
      </Sec>

      <Sec id="accounts" title="2. Your account">
        <ul>
          <li>You must be at least {LEGAL.minAge} years old, and old enough to agree to these terms where you live (or have a parent or guardian agree for you).</li>
          <li>Give accurate sign-up details and keep your password and any paired Companion devices secure. You are responsible for activity under your account.</li>
          <li>Tell us promptly at {LEGAL.email} if you believe your account has been accessed without permission. You can revoke paired computers at any time in Settings.</li>
        </ul>
      </Sec>

      <Sec id="plans" title="3. Free service and limits">
        <p>The <strong>Free</strong> plan currently includes videos up to {Math.round(free.maxDurationSec / 60)} minutes, kept on your device up to {uploadLimitLabel(free.maxLocalBytes)}, up to {free.maxProjects} projects, with exports kept for {free.exportRetentionDays} days. Files sent to our storage — for example a video sent to a Companion export — are limited to {uploadLimitLabel(free.maxUploadBytes)}. Transcription runs in your browser and is unlimited.</p>
        <p>Paid plans (Starter, Plus and Pro) raise those limits for 30 days at a time. They are sold as one-time 30-day passes at the prices published on the <Link href="/pricing">Pricing page</Link>, with payment processed by Cashfree. A pass never renews or charges you automatically: when its 30 days end, your account returns to Free limits and your projects are untouched. Nothing is ever charged unless you explicitly buy a pass.</p>
      </Sec>

      <Sec id="content" title="4. Your content">
        <p><strong>You own your content.</strong> Videos, audio, transcripts, captions, styles and exports you create stay yours. You give us a limited licence to host, process, transcribe, render and display your content only as needed to run the service for you, and to keep backups for as long as it is stored.</p>
        <p>You confirm that you have the rights needed to upload and process your content, including the consent of people who appear or speak in it where the law requires it.</p>
        <p>We do not sell your content, and we do not use your videos or transcripts to train machine-learning models.</p>
      </Sec>

      <Sec id="use" title="5. Acceptable use">
        <p>Use {LEGAL.product} lawfully and follow our <Link href="/acceptable-use">Acceptable Use Policy</Link>. We may remove content or suspend accounts that break it, and we respond to copyright notices as described in our <Link href="/copyright">Copyright &amp; Takedowns policy</Link>.</p>
      </Sec>

      <Sec id="companion" title="6. The Companion app">
        <p>The Companion is software you install on your computer. We grant you a personal, non-exclusive, non-transferable licence to use it with your account. It downloads the components it needs (for example a speech-recognition model and a headless browser for rendering), uses your computer&rsquo;s processor, memory and disk while it works, and connects only to our service and the storage links we issue. You can uninstall it at any time.</p>
        <p>Third-party components included in the Companion and the website remain under their own licences.</p>
      </Sec>

      <Sec id="ai" title="7. Automatic transcription">
        <p>Captions are produced by speech-recognition models and can contain mistakes: misheard words, wrong names, timing slips. Review your captions before publishing, especially for accessibility, legal, medical or financial content. You are responsible for what you publish.</p>
      </Sec>

      <Sec id="retention" title="8. Storage, retention and deletion">
        <p>Exports are kept for the period your plan allows and then deleted; you can re-export while the project exists. You can delete projects at any time, and delete your account by writing to {LEGAL.email}. See the <Link href="/privacy">Privacy Policy</Link> for what we keep and for how long. Keep your own copies of anything important: {LEGAL.product} is not a backup service.</p>
      </Sec>

      <Sec id="ip" title="9. Our rights">
        <p>The service, its software, looks, templates, design and brand belong to {LEGAL.operator} or its licensors. You may use the caption looks in videos you create with {LEGAL.product}, including commercially. You may not copy, resell or reverse-engineer the service, or use it to build a competing product.</p>
        <p>If you send us feedback, we may use it without obligation to you.</p>
      </Sec>

      <Sec id="termination" title="10. Suspension and ending the agreement">
        <p>You can stop using {LEGAL.product} and close your account at any time. We may suspend or end your access if you seriously or repeatedly break these terms, if required by law, or to protect the service or other users. Where reasonable we will give notice and a chance to export your content first.</p>
      </Sec>

      <Sec id="warranty" title="11. Disclaimers">
        <p>The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the extent the law allows, we disclaim implied warranties of merchantability, fitness for a particular purpose and non-infringement, and we do not promise the service will be uninterrupted or error-free. Nothing in these terms limits rights you have as a consumer that cannot be limited by law.</p>
      </Sec>

      <Sec id="liability" title="12. Limitation of liability">
        <p>To the extent the law allows, we are not liable for indirect, incidental, special or consequential losses, or for lost profits, revenue, data or goodwill. Our total liability for any claim relating to the service is limited to the greater of the amount you paid us in the 12 months before the claim and INR 5,000 (or its equivalent). These limits do not apply to liability that cannot be limited by law, such as for fraud or gross negligence.</p>
      </Sec>

      <Sec id="indemnity" title="13. Indemnity">
        <p>If someone brings a claim against us because of content you uploaded or your breach of these terms, you agree to cover the reasonable costs and losses that result, to the extent the law allows.</p>
      </Sec>

      <Sec id="changes" title="14. Changes to these terms">
        <p>We may update these terms. For material changes we will notify you by email or in the app at least 14 days before they take effect. If you keep using the service after that, the new terms apply; if you do not agree, you can close your account.</p>
      </Sec>

      <Sec id="law" title="15. Governing law and disputes">
        <p>These terms are governed by the laws of {LEGAL.jurisdiction}. Disputes are subject to the exclusive jurisdiction of {LEGAL.courts}, unless the law where you live gives you the right to bring proceedings there. Please contact us first: most problems are solved quickly by email.</p>
      </Sec>

      <Sec id="contact" title="16. Contact">
        <p>{LEGAL.operator}, {LEGAL.address}. Email: {LEGAL.email}.</p>
      </Sec>
    </LegalDoc>
  );
}
