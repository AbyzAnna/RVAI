import { describe, expect, it } from "vitest";
import { auditOutput, checkRequest, isSafeUrl } from "../src/guardrails.js";

describe("checkRequest", () => {
  it.each([
    ["How do I crack Photoshop?", "piracy"],
    ["give me a keygen for AutoCAD", "piracy"],
    ["where can I torrent Premiere Pro", "piracy"],
    ["find a free license key for Office", "piracy"],
    ["download a cracked apk of Minecraft", "piracy"],
    ["how to bypass the license check in Ableton", "license-bypass"],
    ["reset the trial of Lightroom", "license-bypass"],
    ["remove the DRM from this game", "license-bypass"],
    ["help me decompile AutoCAD", "reverse-engineering"],
    ["reverse engineer the Photoshop file loader", "reverse-engineering"],
    ["rip the sprites from Age of Empires for my game", "asset-ripping"],
    ["extract the music from Minecraft", "asset-ripping"],
    ["make an exact clone of Civilization", "asset-ripping"],
    ["an aimbot for multiplayer", "cheating"],
  ])("refuses %s", (text, category) => {
    const result = checkRequest(text);
    expect(result.allowed).toBe(false);
    expect(result.category).toBe(category);
  });

  it.each([
    "I need something like Photoshop for my laptop",
    "There is a crackling sound when I record vocals",
    "A cozy game like Minecraft for my kids",
    "Free office software to write my essay",
    "Does Ableton have a free trial or student discount?",
    "Help me design my own strategy game inspired by Civilization",
  ])("allows %s", (text) => {
    expect(checkRequest(text).allowed).toBe(true);
  });
});

describe("isSafeUrl", () => {
  it("accepts official https links", () => {
    expect(isSafeUrl("https://www.gimp.org")).toBe(true);
    expect(isSafeUrl("https://www.blender.org/download/")).toBe(true);
  });

  it("rejects http, junk and piracy-looking links", () => {
    expect(isSafeUrl("http://www.gimp.org")).toBe(false);
    expect(isSafeUrl("not a url")).toBe(false);
    expect(isSafeUrl("https://photoshop-crack.example")).toBe(false);
    expect(isSafeUrl("https://example.com/keygen/autocad")).toBe(false);
    expect(isSafeUrl("https://thepiratebay.example")).toBe(false);
  });
});

describe("auditOutput", () => {
  it("finds unsafe links and piracy words anywhere in a nested value", () => {
    const problems = auditOutput({ picks: [{ url: "https://warez.example" }, { note: "grab the keygen" }], ok: "fine" });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("picks[0].url");
  });

  it("returns nothing for clean output", () => {
    expect(auditOutput({ url: "https://krita.org", why: "Great for painting" })).toEqual([]);
  });
});
