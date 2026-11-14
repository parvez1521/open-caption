import { describe, expect, it } from "vitest";
import { normalizeCustomerPhone } from "../customerPhone";

/**
 * One phone rule for Cashfree orders, shared by the billing page and the
 * checkout route: Indian 10-digit mobile, or international with a +
 * country code. Separators are stripped; anything else is rejected.
 */

describe("normalizeCustomerPhone", () => {
  it.each([
    ["9876543210", "9876543210"],
    ["98765 43210", "9876543210"],
    ["98765-43210", "9876543210"],
    ["(98765) 43210", "9876543210"],
    ["09876543210", "9876543210"],
    ["919876543210", "+919876543210"],
    ["+919876543210", "+919876543210"],
    ["+91 98765 43210", "+919876543210"],
    ["+14155552671", "+14155552671"],
  ])("accepts %s as %s", (input, expected) => {
    expect(normalizeCustomerPhone(input)).toBe(expected);
  });

  it.each([
    ["", "empty"],
    ["   ", "blank"],
    ["12345", "too short"],
    ["987654321", "9 digits"],
    ["98765432101", "11 digits without a trunk 0"],
    ["5876543210", "starts with 5, not a mobile"],
    ["98765abc10", "letters"],
    ["+1", "country code only"],
    ["+1234567890123456", "more than 15 digits"],
    [null, "not a string"],
    [9876543210, "a number, not a string"],
  ])("rejects %s (%s)", (input, _label) => {
    expect(normalizeCustomerPhone(input)).toBeNull();
  });
});
