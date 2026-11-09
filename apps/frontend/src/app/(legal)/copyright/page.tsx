import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { LegalDoc, Sec } from "@/components/legal/Doc";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = pageMetadata({ title: "Copyright & Takedowns", description: "How to report copyright infringement to Open Caption and how counter-notices work.", path: "/copyright" });

export default function CopyrightPage() {
  return (
    <LegalDoc
      title="Copyright &"
      accent="Takedowns"
      intro={<>We respect creators&rsquo; rights, including yours. Videos on {LEGAL.product} are private to their owners, but if you believe content processed or stored with {LEGAL.product} infringes your copyright, tell us and we will act quickly. This process follows the US DMCA and India&rsquo;s IT Rules notice-and-takedown framework.</>}
    >
      <Sec id="notice" title="Sending a takedown notice">
        <p>Email {LEGAL.email} with the subject &ldquo;Copyright notice&rdquo; and include:</p>
        <ul>
          <li>your name, address, phone number and email;</li>
          <li>a description of the copyrighted work;</li>
          <li>where the infringing material is (a shared link or other details that let us find it);</li>
          <li>a statement that you have a good-faith belief the use is not authorised by the owner, its agent or the law;</li>
          <li>a statement, under penalty of perjury, that your notice is accurate and that you are the owner or authorised to act for them;</li>
          <li>your physical or electronic signature.</li>
        </ul>
      </Sec>

      <Sec id="counter" title="Counter-notices">
        <p>If your content was removed and you believe that was a mistake or you have permission to use it, reply with a counter-notice including your contact details, what was removed, a statement under penalty of perjury that it was removed by mistake or misidentification, your consent to the jurisdiction of the relevant courts, and your signature. We forward it to the complainant and may restore the content unless they start legal action within the legal timeframe.</p>
      </Sec>

      <Sec id="repeat" title="Repeat infringers">
        <p>We close the accounts of users who repeatedly infringe others&rsquo; rights.</p>
      </Sec>

      <Sec id="false" title="Please be accurate">
        <p>Knowingly false notices or counter-notices can make you liable for damages. If you are not sure whether something infringes, consider getting legal advice first.</p>
      </Sec>
    </LegalDoc>
  );
}
