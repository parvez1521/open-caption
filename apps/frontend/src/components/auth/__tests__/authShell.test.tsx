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

  it("keeps the password toggle in the tab order (MA-A5-011)", () => {
    render(<PasswordField id="login-password" label="Password" value="" onChange={() => {}} />);
    const toggle = screen.getByLabelText("Show password");
    expect(toggle.getAttribute("tabindex")).not.toBe("-1");
  });
});

/**
 * MA-A5-008: a field error must be programmatically tied to its input — the
 * billing page pattern (aria-invalid + aria-describedby to an id'd
 * role="alert" <p>), applied to the shared auth fields so login, forgot and
 * reset all get it.
 */
describe("AuthShell field errors (MA-A5-008)", () => {
  it("Field with an error: aria-invalid + aria-describedby to the alert", () => {
    render(<Field id="login-email" label="Email Address" type="email" value="" onChange={() => {}} error="Enter a valid email" />);
    const input = screen.getByLabelText("Email Address");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "login-email-error");
    const alert = screen.getByRole("alert");
    expect(alert.id).toBe("login-email-error");
    expect(alert).toHaveTextContent("Enter a valid email");
  });

  it("PasswordField with an error: aria-invalid + aria-describedby to the alert", () => {
    render(<PasswordField id="login-password" label="Password" value="" onChange={() => {}} error="Password is required" />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "login-password-error");
    expect(screen.getByRole("alert")).toHaveTextContent("Password is required");
  });

  it("no error: no aria-invalid, and a hint is described instead", () => {
    render(<Field id="login-email" label="Email Address" type="email" value="" onChange={() => {}} hint="We never share your email" />);
    const input = screen.getByLabelText("Email Address");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).toHaveAttribute("aria-describedby", "login-email-hint");
    expect(document.getElementById("login-email-hint")).toHaveTextContent("We never share your email");
  });
});
