import React from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FAVOURITE_LOOKS_EVENT,
  FAVOURITE_LOOKS_KEY,
  parseFavouriteLooks,
  readFavouriteLooks,
  readRawFavouriteLooks,
  toggleFavouriteLook,
  useFavouriteLooks,
  writeFavouriteLooks,
} from "../favouriteLooks";

/**
 * Favourite looks are local-only: one localStorage key, a JSON array of
 * look ids. Corrupt data must never crash the panel, and ids for looks
 * that no longer exist are ignored on read.
 */
describe("favouriteLooks store", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("parse: a valid array round-trips, anything else is empty", () => {
    expect([...parseFavouriteLooks(JSON.stringify(["a", "b"]))]).toEqual(["a", "b"]);
    expect(parseFavouriteLooks(null).size).toBe(0);
    expect(parseFavouriteLooks("").size).toBe(0);
    expect(parseFavouriteLooks("not json{").size).toBe(0);
    expect(parseFavouriteLooks(JSON.stringify({ a: 1 })).size).toBe(0);
    expect(parseFavouriteLooks(JSON.stringify("a")).size).toBe(0);
    expect([...parseFavouriteLooks(JSON.stringify(["a", 7, null, "b"]))]).toEqual(["a", "b"]);
  });

  it("write then read round-trips", () => {
    writeFavouriteLooks(new Set(["kinetic_mix", "hormozi_box"]));
    expect([...readRawFavouriteLooks()]).toEqual(["kinetic_mix", "hormozi_box"]);
    expect(window.localStorage.getItem(FAVOURITE_LOOKS_KEY)).toBe(JSON.stringify(["kinetic_mix", "hormozi_box"]));
  });

  it("corrupt stored JSON reads as empty, never throws", () => {
    window.localStorage.setItem(FAVOURITE_LOOKS_KEY, "{broken");
    expect(() => readFavouriteLooks()).not.toThrow();
    expect(readFavouriteLooks().size).toBe(0);
  });

  it("read ignores ids that are not in the known set", () => {
    writeFavouriteLooks(new Set(["kinetic_mix", "gone_look", "hormozi_box"]));
    expect([...readFavouriteLooks(new Set(["kinetic_mix", "hormozi_box"]))]).toEqual(["kinetic_mix", "hormozi_box"]);
    // ...but the unknown id is still in storage, not deleted by the read
    expect([...readRawFavouriteLooks()]).toContain("gone_look");
  });

  it("toggleFavouriteLook adds then removes, and never mutates its input", () => {
    const start = new Set(["a"]);
    const added = toggleFavouriteLook(start, "b");
    expect([...added].sort()).toEqual(["a", "b"]);
    expect([...start]).toEqual(["a"]);
    expect([...toggleFavouriteLook(added, "a")]).toEqual(["b"]);
  });
});

describe("useFavouriteLooks hook", () => {
  const KNOWN = new Set(["kinetic_mix", "hormozi_box", "beast_bounce"]);

  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("starts empty on first render, then reads the stored set", () => {
    writeFavouriteLooks(new Set(["kinetic_mix"]));
    const { result } = renderHook(() => useFavouriteLooks(KNOWN));
    expect(result.current.favourites.has("kinetic_mix")).toBe(true);
  });

  it("toggle adds and removes, and persists to localStorage", () => {
    const { result } = renderHook(() => useFavouriteLooks(KNOWN));
    act(() => result.current.toggleFavourite("hormozi_box"));
    expect(result.current.favourites.has("hormozi_box")).toBe(true);
    expect([...readRawFavouriteLooks()]).toEqual(["hormozi_box"]);
    act(() => result.current.toggleFavourite("hormozi_box"));
    expect(result.current.favourites.has("hormozi_box")).toBe(false);
    expect(readRawFavouriteLooks().size).toBe(0);
  });

  it("the toggle reference is stable across re-renders", () => {
    const { result, rerender } = renderHook(() => useFavouriteLooks(KNOWN));
    const first = result.current.toggleFavourite;
    rerender();
    expect(result.current.toggleFavourite).toBe(first);
  });

  it("a storage event from another tab refreshes the set", () => {
    const { result } = renderHook(() => useFavouriteLooks(KNOWN));
    expect(result.current.favourites.size).toBe(0);
    act(() => {
      window.localStorage.setItem(FAVOURITE_LOOKS_KEY, JSON.stringify(["beast_bounce"]));
      window.dispatchEvent(new StorageEvent("storage", { key: FAVOURITE_LOOKS_KEY }));
    });
    expect(result.current.favourites.has("beast_bounce")).toBe(true);
  });

  it("a write in this tab reaches a second hook instance", () => {
    const first = renderHook(() => useFavouriteLooks(KNOWN));
    const second = renderHook(() => useFavouriteLooks(KNOWN));
    act(() => first.result.current.toggleFavourite("kinetic_mix"));
    expect(second.result.current.favourites.has("kinetic_mix")).toBe(true);
    first.unmount();
    second.unmount();
  });

  it("the custom event fires on write", () => {
    const seen: Event[] = [];
    const onEvent = (e: Event) => seen.push(e);
    window.addEventListener(FAVOURITE_LOOKS_EVENT, onEvent);
    writeFavouriteLooks(new Set(["kinetic_mix"]));
    expect(seen).toHaveLength(1);
    window.removeEventListener(FAVOURITE_LOOKS_EVENT, onEvent);
  });
});
