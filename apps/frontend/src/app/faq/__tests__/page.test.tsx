import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FAQS } from "@/components/home/faqs";

/**
 * /faq help centre (production-pages audit): the page renders the exact
 * 8 Q&As from src/components/home/faqs.ts — reused, never rewritten — so
 * the homepage section and the help route cannot diverge.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/home/Sections", () => ({
  Nav: () => <nav>nav</nav>,
  Footer: () => <footer>footer</footer>,
}));

import FaqPage from "../page";

describe("FAQ page", () => {
  it("renders all 8 questions and answers from faqs.ts", () => {
    render(<FaqPage />);
    expect(FAQS).toHaveLength(8);
    for (const faq of FAQS) {
      expect(screen.getByRole("heading", { name: faq.q })).toBeTruthy();
      expect(screen.getByText(faq.a)).toBeTruthy();
    }
  });

  it("links to the support inbox for anything else", () => {
    render(<FaqPage />);
    const links = screen.getAllByRole("link", { name: "work.techhacksai@gmail.com" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute("href", "mailto:work.techhacksai@gmail.com");
  });

  it("emits FAQPage structured data from the same array", () => {
    const { container } = render(<FaqPage />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script?.textContent).toContain("FAQPage");
    expect(script?.textContent).toContain(FAQS[0]!.q);
  });
});
