// @ts-nocheck
import { describe, it, expect } from "bun:test";
import { TelemetryCollector } from "../index";

describe("TelemetryCollector constructor", () => {
  it("creates collector with tenant name", () => {
    const c = new TelemetryCollector("test-tenant");
    expect(c.getEntries()).toHaveLength(0);
  });

  it("starts with zero entries", () => {
    expect(new TelemetryCollector("x").getEntries()).toHaveLength(0);
  });

  it("accepts any string as tenant name", () => {
    const c = new TelemetryCollector("tenant-123_slug");
    expect(c.getEntries()).toHaveLength(0);
  });

  it("accepts empty string tenant", () => {
    expect(new TelemetryCollector("").getEntries()).toHaveLength(0);
  });

  it("creates independent instances", () => {
    const a = new TelemetryCollector("a");
    const b = new TelemetryCollector("b");
    expect(a.getEntries()).not.toBe(b.getEntries());
  });
});
