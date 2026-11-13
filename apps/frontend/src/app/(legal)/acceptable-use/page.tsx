import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { LegalDoc, Sec } from "@/components/legal/Doc";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = pageMetadata({ title: "Acceptable Use Policy", description: "What you may and may not do with Captionit.", path: "/acceptable-use" });

export default function AcceptableUsePage() {
  return (
    <LegalDoc
      title="Acceptable"
      accent="Use"
      intro={<>Make great videos. This policy lists the few things you may not use {LEGAL.product} for. It is part of our <Link href="/terms">Terms of Service</Link>.</>}
    >
      <Sec id="content" title="Content you may not upload or create">
        <ul>
          <li>Child sexual abuse material, or any sexual content involving minors. We report it to the authorities.</li>
          <li>Content that is illegal where you live or where you publish it.</li>
          <li>Content that infringes someone else&rsquo;s copyright, trademark, privacy or publicity rights, including videos you do not have permission to use.</li>
          <li>Recordings of people made or shared in breach of the law (for example without the consent the law requires).</li>
          <li>Harassment, threats, or content that promotes violence or hatred against people for who they are.</li>
          <li>Deceptive content meant to defraud or mislead people, including captions that impersonate a real person or organisation or misrepresent what someone said.</li>
          <li>Malware, spam, or content designed to manipulate elections or public health information.</li>
        </ul>
      </Sec>

      <Sec id="service" title="Using the service fairly">
        <ul>
          <li>Do not try to access other people&rsquo;s accounts, projects or files, or get around security, rate limits or plan limits.</li>
          <li>Do not probe, scan or load-test the service, or interfere with its operation, without our written permission. Security researchers: please report issues to {LEGAL.email}; we welcome responsible disclosure.</li>
          <li>Do not resell access or create accounts automatically.</li>
          <li>Do not scrape the service, copy the looks library, or use the service to build a competing product.</li>
          <li>Do not modify the Companion app to send us falsified jobs or results.</li>
        </ul>
      </Sec>

      <Sec id="enforcement" title="What happens if the rules are broken">
        <p>We may remove content, pause jobs, limit features, or suspend or close accounts, depending on how serious the problem is, and we may report illegal activity. Where it is safe and lawful we will tell you what happened and how to appeal: reply to our message or write to {LEGAL.email}.</p>
      </Sec>

      <Sec id="report" title="Report a problem">
        <p>Seen something that breaks these rules? Email {LEGAL.email} with a link or description. For copyright complaints, follow the <Link href="/copyright">Copyright &amp; Takedowns</Link> process.</p>
      </Sec>
    </LegalDoc>
  );
}
