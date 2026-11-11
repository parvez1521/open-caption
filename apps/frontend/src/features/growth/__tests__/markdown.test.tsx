import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownText } from "../markdown";

/**
 * The coach's markdown renderer (bugfix 2026-11-11): model replies arrive
 * as markdown and used to render as plain text, so `**`, `#` and `-`
 * markers showed raw in the chat. These tests pin the formatted output —
 * and the safety contract: the renderer builds React nodes only, so any
 * markup inside the model's text must come out as inert visible text,
 * never as live DOM.
 */

describe("MarkdownText", () => {
  it("renders **bold** as a strong element with no asterisks left", () => {
    const { container } = render(<MarkdownText text={"Try **importing them** first."} />);
    const strong = container.querySelector("strong");
    expect(strong?.textContent).toBe("importing them");
    expect(container.textContent).toBe("Try importing them first.");
    expect(container.textContent).not.toContain("*");
  });

  it("renders a heading line as a heading, marker gone", () => {
    const { container } = render(<MarkdownText text={"## How to bring in past posts"} />);
    const heading = container.querySelector("h3, h4");
    expect(heading?.textContent).toBe("How to bring in past posts");
    expect(container.textContent).not.toContain("#");
  });

  it("renders bullet and numbered lists as list elements", () => {
    const { container } = render(
      <MarkdownText text={"Options:\n\n- Import a CSV\n- Add posts by hand\n\n1. First step\n2. Second step"} />,
    );
    const ul = container.querySelector("ul");
    expect(ul?.querySelectorAll("li")).toHaveLength(2);
    expect(ul?.textContent).toContain("Import a CSV");
    const ol = container.querySelector("ol");
    expect(ol?.querySelectorAll("li")).toHaveLength(2);
    expect(container.textContent).not.toContain("- Import");
  });

  it("leaves plain paragraphs plain — same words, paragraph per blank line", () => {
    const { container } = render(<MarkdownText text={"Reach fell last week.\n\nYour top post aged out."} />);
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]?.textContent).toBe("Reach fell last week.");
    expect(paragraphs[1]?.textContent).toBe("Your top post aged out.");
  });

  it("renders model markup INERT: script and img payloads stay visible text", () => {
    const { container } = render(
      <MarkdownText text={'<script>alert("xss")</script>\n\n**<img src=x onerror="alert(1)">**'} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    // The payload is still readable — as text, inside the strong element.
    expect(container.textContent).toContain('<script>alert("xss")</script>');
    const strong = container.querySelector("strong");
    expect(strong?.textContent).toBe('<img src=x onerror="alert(1)">');
  });

  it("links: http(s) becomes an anchor, other schemes degrade to the label", () => {
    const { container } = render(
      <MarkdownText text={"See [the guide](https://example.com/guide) and [this](javascript:alert(1))."} />,
    );
    const anchor = container.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe("https://example.com/guide");
    expect(anchor?.textContent).toBe("the guide");
    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(container.textContent).toContain("this");
    expect(container.innerHTML).not.toContain("javascript:");
  });
});
