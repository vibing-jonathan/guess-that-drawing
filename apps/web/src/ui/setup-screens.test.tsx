import { DEFAULT_AVATAR } from "@gtd/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../realtime/runtime", () => ({
  roomController: {
    joinRoom: vi.fn(),
  },
}));

import { JoinScreen, ProfileScreen } from "./setup-screens";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("JoinScreen", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
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

  it("keeps a previously selected custom avatar background keyboard accessible", () => {
    localStorage.setItem(
      "gtd:profile:v1",
      JSON.stringify({
        name: "Maya",
        avatar: { ...DEFAULT_AVATAR, backgroundColor: "#123456" },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/profile?next=/create"]}>
        <ProfileScreen />
      </MemoryRouter>,
    );

    expect(screen.getByRole("radio", { name: "Custom" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Custom" })).toHaveAttribute(
      "tabindex",
      "0",
    );
  });

  it("edits every avatar layer through the compact controls", () => {
    render(
      <MemoryRouter initialEntries={["/profile?next=/create"]}>
        <ProfileScreen />
      </MemoryRouter>,
    );

    const feature = screen.getByLabelText("Avatar feature");
    fireEvent.change(feature, { target: { value: "hairStyle" } });

    const choice = screen.getByLabelText("Hair style choice");
    fireEvent.change(choice, { target: { value: "waves" } });

    expect(feature).toHaveValue("hairStyle");
    expect(choice).toHaveValue("waves");
    expect(screen.getByRole("radio", { name: "Waves" })).toBeChecked();
  });

  it("reflects the maximum supported name in the live preview", () => {
    render(
      <MemoryRouter initialEntries={["/profile?next=/create"]}>
        <ProfileScreen />
      </MemoryRouter>,
    );

    const maximumName = "W".repeat(24);
    const name = screen.getByLabelText("Display name");
    expect(name).toHaveAttribute("maxlength", "24");

    fireEvent.change(name, { target: { value: maximumName } });

    expect(name).toHaveValue(maximumName);
    expect(screen.getByText(maximumName)).toBeInTheDocument();
  });
});
