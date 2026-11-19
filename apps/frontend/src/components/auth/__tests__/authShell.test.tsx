import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field, PasswordField } from "../AuthShell";

/**
 * MA-A5-001: auth + settings labels must be programmatically associated
 * with their inputs — a screen reader has to announce the label for the
 * sign-in, forgot-password and reset-password fields. Every Field /
 * PasswordField renders a label whose htmlFor matches its input's id,
 * whether the caller passes an explicit id or one is derived from the label.
 */
describe("AuthShell Field / PasswordField label association (MA-A5-001)", () => {
  it("Field wires an explicit id to its label", () => {
    render(<Field id="login-email" label="Email Address" type="email" value="" onChange={() => {}} />);
    const input = screen.getByLabelText("Email Address");
    expect(input.id).toBe("login-email");
  });

  it("PasswordField wires an explicit id to its label", () => {
    render(<PasswordField id="login-password" label="Password" value="" onChange={() => {}} />);
    const input = screen.getByLabelText("Password");
    expect(input.id).toBe("login-password");
  });

  it("derives a matching id from the label when the caller passes none", () => {
    render(<Field label="Email" type="email" value="" onChange={() => {}} />);
    const input = screen.getByLabelText("Email");
    expect(input.id).toBe("field-email");
    expect(document.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
  });
});
