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

  it("renders a pipe table as a real table — the owner's screenshot shape, bold inside cells", () => {
    // The exact shape the owner screenshotted (2026-11-11): the model
    // answered with pipe tables and the old renderer printed the pipes.
    const text = [
      "Viral-AI topics that have already worked for you",
      "",
      "| Post (date) | Title theme | Engagement |",
      "|---------------|---------------|---------------|",
      "| 2024-11-05 | **ethical Hacking AI tool** – AI for cybersecurity/pentest | 8 834 |",
      "| 2025-04-29 | **Canva coder** – AI-assisted design & code generation | 907 |",
      "| 2025-05-17 | **Python developer humor** – funny AI-coding shorts | 702 |",
    ].join("\n");
    const { container } = render(<MarkdownText text={text} />);
    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    const headers = [...table!.querySelectorAll("th")].map((th) => th.textContent);
    expect(headers).toEqual(["Post (date)", "Title theme", "Engagement"]);
    const rows = table!.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.querySelector("strong")?.textContent).toBe("ethical Hacking AI tool");
    expect(rows[0]?.textContent).toContain("8 834");
    expect(container.textContent).not.toContain("|");
    expect(container.textContent).not.toContain("---");
    // The intro line stays a paragraph before the table.
    expect(container.querySelector("p")?.textContent).toBe("Viral-AI topics that have already worked for you");
    // Wide tables scroll inside their wrapper instead of stretching the chat.
    expect(table!.closest("div")?.className).toContain("overflow-x-auto");
  });

  it("renders the suggestions table shape (two columns, quoted text in cells)", () => {
    const text = [
      "| Suggested angle | Why it fits your data |",
      "|---|---|",
      '| "AI-driven Pen-Test Toolkit" – demo an AI that writes exploits or scans code. | Mirrors the top-performing "ethical Hacking AI tool" post. |',
      '| "AI Coding Bloopers / Funny Shorts" – short clips of AI mis-writes. | Builds on the 702-engagement "python developer" short. |',
    ].join("\n");
    const { container } = render(<MarkdownText text={text} />);
    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    expect([...table!.querySelectorAll("th")].map((th) => th.textContent)).toEqual([
      "Suggested angle",
      "Why it fits your data",
    ]);
    expect(table!.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(table!.textContent).toContain("AI-driven Pen-Test Toolkit");
  });

  it("honours separator alignment (:--- left, ---: right, :-: center)", () => {
    const text = ["| Post | Views | Note |", "|:---|---:|:-:|", "| Launch | 900 | ok |"].join("\n");
    const { container } = render(<MarkdownText text={text} />);
    const ths = container.querySelectorAll("th");
    expect(ths[0]?.className).toContain("text-left");
    expect(ths[1]?.className).toContain("text-right");
    expect(ths[2]?.className).toContain("text-center");
    const tds = container.querySelectorAll("td");
    expect(tds[1]?.className).toContain("text-right");
  });

  it("a header with NO separator row is not a table — plain text fallback, pipes and all", () => {
    const text = "| Post | Views |\n| Launch | 900 |";
    const { container } = render(<MarkdownText text={text} />);
    expect(container.querySelector("table")).toBeNull();
    expect(container.textContent).toContain("| Post | Views |");
    expect(container.textContent).toContain("| Launch | 900 |");
  });

  it("a separator with a different cell count than the header is not a table either", () => {
    const text = "| Post | Views | Likes |\n|---|---|\n| Launch | 900 | 12 |";
    const { container } = render(<MarkdownText text={text} />);
    expect(container.querySelector("table")).toBeNull();
    expect(container.textContent).toContain("Launch");
  });

  it("skips a stray all-empty row inside a table (the model emits lone | lines)", () => {
    const text = ["| Angle | Why |", "|---|---|", "| One | First |", "|", "| Two | Second |"].join("\n");
    const { container } = render(<MarkdownText text={text} />);
    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);
    expect(rows[1]?.textContent).toContain("Two");
  });

  it("XSS inside table cells stays inert; a javascript: link in a cell degrades to its label", () => {
    const text = [
      "| Post | Note |",
      "|---|---|",
      '| <script>alert("xss")</script> | [click](javascript:alert(1)) and <img src=x onerror="alert(2)"> |',
    ].join("\n");
    const { container } = render(<MarkdownText text={text} />);
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(container.textContent).toContain('<script>alert("xss")</script>');
    expect(container.textContent).toContain("click");
    expect(container.innerHTML).not.toContain("javascript:");
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
