import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../realtime/runtime", () => ({
  roomController: {
    joinRoom: vi.fn(),
  },
}));

import { JoinScreen } from "./setup-screens";

describe("JoinScreen", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("accepts room-code digits and ignores separators", () => {
    render(
      <MemoryRouter>
        <JoinScreen />
      </MemoryRouter>,
    );

    const input = screen.getByTestId("join-room-code");
    fireEvent.change(input, { target: { value: "AB-2 3CD" } });

    expect(input).toHaveValue("AB23CD");
    expect(screen.getByTestId("join-submit")).toBeEnabled();
  });

  it("uses the shared 24-character player-name limit", () => {
    render(
      <MemoryRouter>
        <JoinScreen />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("Display name")).toHaveAttribute(
      "maxlength",
      "24",
    );
  });
});
