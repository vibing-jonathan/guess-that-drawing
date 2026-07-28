import { describe, expect, it, vi } from "vitest";

import { createMutationMeta } from "./client";

describe("createMutationMeta", () => {
  it("creates a unique mutation identity and preserves a revision", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "0f7c69b8-8a92-4a78-9af1-d3da3fd33ef2",
    );

    expect(createMutationMeta(42)).toEqual({
      idempotencyId: "0f7c69b8-8a92-4a78-9af1-d3da3fd33ef2",
      expectedRevision: 42,
    });
  });
});
