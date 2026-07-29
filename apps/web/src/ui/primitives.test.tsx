import { DEFAULT_AVATAR, type PlayerPublic } from "@gtd/contracts";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Avatar, PlayersPanel } from "./primitives";

function player(
  id: string,
  name: string,
  overrides: Partial<PlayerPublic> = {},
): PlayerPublic {
  return {
    id,
    name,
    avatar: DEFAULT_AVATAR,
    score: 0,
    isHost: false,
    isConnected: true,
    hasGuessed: false,
    isDrawing: false,
    joinedAt: 1_000,
    joinOrder: 0,
    disconnectedUntil: null,
    ...overrides,
  };
}

describe("Avatar", () => {
  it("draws headphones without filling the open headband", () => {
    const rendered = render(
      <Avatar
        name="Maya"
        config={{ ...DEFAULT_AVATAR, accessory: "headphones" }}
      />,
    );

    expect(
      rendered.container.querySelector(
        '[data-avatar-part="headphone-band"]',
      ),
    ).toHaveAttribute("fill", "none");
    expect(
      rendered.container.querySelector(
        '[data-avatar-part="headphone-earcups"]',
      ),
    ).toHaveAttribute("fill", "var(--color-primary)");
  });

  it("keeps the party hat inside the avatar view box", () => {
    const rendered = render(
      <Avatar
        name="Maya"
        config={{ ...DEFAULT_AVATAR, accessory: "party-hat" }}
      />,
    );

    expect(
      rendered.container.querySelector('[data-avatar-part="party-hat"]'),
    ).toHaveAttribute("d", "M34 21 48 2l12 22Z");
  });
});

describe("PlayersPanel", () => {
  it("matches row grid modifiers to the slots that are actually rendered", () => {
    const rendered = render(
      <PlayersPanel
        players={[
          player("player-1", "Host", { isHost: true }),
          player("player-2", "Guest", { joinOrder: 1 }),
        ]}
        selfId="player-1"
        showKick
      />,
    );

    const hostRow = screen.getByText(/Host.*You/).closest("li");
    const guestRow = screen.getByText("Guest").closest("li");
    expect(hostRow).not.toBeNull();
    expect(guestRow).not.toBeNull();
    expect(hostRow).not.toHaveClass("player-row--ranked");
    expect(hostRow).not.toHaveClass("player-row--kickable");
    expect(guestRow).not.toHaveClass("player-row--ranked");
    expect(guestRow).toHaveClass("player-row--kickable");

    rendered.rerender(
      <PlayersPanel
        players={[
          player("player-1", "Host", { isHost: true }),
          player("player-2", "Guest", { joinOrder: 1 }),
        ]}
        selfId="player-1"
        ranked
      />,
    );

    expect(screen.getByText(/Host.*You/).closest("li")).toHaveClass(
      "player-row--ranked",
    );
    expect(screen.getByText("Guest").closest("li")).toHaveClass(
      "player-row--ranked",
    );
  });

  it("marks the active drawer and keeps the host role visible", () => {
    render(
      <PlayersPanel
        players={[
          player("player-1", "Maya", { isHost: true, isDrawing: true }),
          player("player-2", "Noah", { joinOrder: 1 }),
        ]}
        selfId="player-2"
        activeDrawerId="player-1"
        activeDrawerStatus="Choosing"
      />,
    );

    const mayaRow = screen.getByText("Maya").closest("li");
    const noahRow = screen.getByText(/Noah/).closest("li");
    expect(mayaRow).not.toBeNull();
    expect(noahRow).not.toBeNull();
    expect(mayaRow).toHaveClass("player-row--drawer");
    expect(mayaRow).toHaveAttribute("aria-current", "true");
    expect(within(mayaRow!).getByText("Host")).toBeVisible();
    expect(
      within(mayaRow!)
        .getByText("Choosing")
        .closest(".player-row__drawer-badge"),
    ).not.toBeNull();
    expect(noahRow).not.toHaveClass("player-row--drawer");
    expect(noahRow).not.toHaveAttribute("aria-current");
  });

  it.each(["Drawing", "Reconnecting"] as const)(
    "shows the %s active-drawer badge",
    (activeDrawerStatus) => {
      const rendered = render(
        <PlayersPanel
          players={[
            player("player-1", "Maya", {
              isConnected: activeDrawerStatus !== "Reconnecting",
              isDrawing: true,
            }),
          ]}
          selfId="player-1"
          activeDrawerId="player-1"
          activeDrawerStatus={activeDrawerStatus}
        />,
      );

      const activeRow = within(rendered.container)
        .getByText(/Maya/)
        .closest("li");
      expect(activeRow).not.toBeNull();
      expect(
        within(activeRow!)
          .getByText(activeDrawerStatus)
          .closest(".player-row__drawer-badge"),
      ).not.toBeNull();
    },
  );
});
