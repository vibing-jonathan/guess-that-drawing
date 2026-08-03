import {
  DEFAULT_AVATAR,
  type RoomSettings,
} from "@gtd/contracts";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { roomStore } from "../state/room-store";
import {
  makeEstablished,
  makePlayer,
  makeSnapshot,
} from "../state/__tests__/fixtures";

const controller = vi.hoisted(() => ({
  joinRoom: vi.fn(() => Promise.resolve()),
  updateSettings: vi.fn((_settings: RoomSettings) => Promise.resolve()),
  kickPlayer: vi.fn(() => Promise.resolve()),
  startMatch: vi.fn(() => Promise.resolve()),
  leaveRoom: vi.fn(() => Promise.resolve()),
}));

vi.mock("../realtime/runtime", () => ({
  roomController: controller,
}));

import {
  CreateRoomScreen,
  JoinScreen,
  LobbyScreen,
  ProfileScreen,
} from "./setup-screens";
import { SetupProvider } from "./setup-context";

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
    vi.clearAllMocks();
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

  it("gives a specific heading when the room has already started", async () => {
    controller.joinRoom.mockRejectedValueOnce(
      Object.assign(new Error("A match is already in progress."), {
        code: "ROOM_STARTED",
      }),
    );
    render(
      <MemoryRouter>
        <JoinScreen />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByTestId("join-room-code"), {
      target: { value: "ABC234" },
    });
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Maya" },
    });
    fireEvent.click(screen.getByTestId("join-submit"));

    expect(
      await screen.findByText("This game has already started"),
    ).toBeInTheDocument();
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

    fireEvent.click(
      screen.getByRole("tab", { name: /Avatar background/ }),
    );
    expect(screen.getByRole("radio", { name: "Custom" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Custom" })).toHaveAttribute(
      "tabindex",
      "0",
    );
  });

  it("edits avatar layers through the focused workbench", () => {
    render(
      <MemoryRouter initialEntries={["/profile?next=/create"]}>
        <ProfileScreen />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("tab")).toHaveLength(7);
    fireEvent.click(screen.getByRole("tab", { name: /Hair style/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Waves" }));

    expect(screen.getByRole("tab", { name: /Hair style.*Waves/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Waves" })).toBeChecked();
  });

  it("always gives Surprise me a visibly different avatar", () => {
    render(
      <MemoryRouter initialEntries={["/profile?next=/create"]}>
        <ProfileScreen />
      </MemoryRouter>,
    );

    const surprise = screen.getByRole("button", { name: "Surprise me" });
    const selectedBefore = screen.getByRole("radio", { checked: true });
    const selectedNameBefore = selectedBefore.textContent;

    expect(surprise).toHaveAttribute("type", "button");
    fireEvent.click(surprise);

    expect(screen.getByRole("radio", { checked: true })).not.toHaveTextContent(
      selectedNameBefore ?? "",
    );
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

function renderCreateFlow() {
  return render(
    <MemoryRouter initialEntries={["/create"]}>
      <SetupProvider>
        <Routes>
          <Route path="/create" element={<CreateRoomScreen />} />
          <Route path="/themes" element={<div>Theme route</div>} />
          <Route path="/review" element={<div>Review route</div>} />
        </Routes>
      </SetupProvider>
    </MemoryRouter>,
  );
}

describe("mode-aware room setup", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    roomStore.getState().reset();
  });

  it("keeps Classic and Pro on the theme route", () => {
    renderCreateFlow();

    fireEvent.click(screen.getByRole("button", { name: "Choose a theme" }));

    expect(screen.getByText("Theme route")).toBeInTheDocument();
  });

  it("preserves the legacy 80-second turn option in room setup", () => {
    renderCreateFlow();

    expect(
      screen.getByRole("option", { name: "80 seconds" }),
    ).toBeInTheDocument();
  });

  it("uses the three-step Phone route and skips directly to review", () => {
    renderCreateFlow();

    fireEvent.click(screen.getByRole("radio", { name: /Phone/ }));

    const steps = screen.getByRole("list", {
      name: "Step 2 of 3",
    });
    expect(steps).toHaveClass("setup-steps--3");
    expect(screen.getByText("Player-written")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Review Phone room" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Review Phone room" }),
    );
    expect(screen.getByText("Review route")).toBeInTheDocument();
  });

  it("switches lobby settings to Phone atomically and disables mode cards while saving", async () => {
    const snapshot = makeSnapshot({
      phase: "lobby",
      selfPlayerId: "player-1",
    });
    roomStore.getState().establishSession(makeEstablished(snapshot));
    roomStore.getState().setConnection("connected");
    let resolveUpdate: (() => void) | undefined;
    controller.updateSettings.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveUpdate = resolve;
      }),
    );

    render(
      <MemoryRouter>
        <SetupProvider>
          <LobbyScreen />
        </SetupProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("radio", { name: /Phone/ }));

    expect(controller.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "phone",
        maxPlayers: expect.any(Number),
      }),
    );
    const submittedSettings = controller.updateSettings.mock.calls[0]?.[0];
    expect(submittedSettings?.maxPlayers).toBeGreaterThanOrEqual(4);
    for (const card of screen.getAllByRole("radio")) {
      expect(card).toBeDisabled();
    }
    expect(screen.getByText("Player-written")).toBeInTheDocument();

    await act(async () => {
      resolveUpdate?.();
    });
    await waitFor(() => {
      for (const card of screen.getAllByRole("radio")) {
        expect(card).toBeEnabled();
      }
    });
  });

  it("uses singular player copy when the host is alone", () => {
    const snapshot = makeSnapshot({
      phase: "lobby",
      selfPlayerId: "player-1",
      players: [makePlayer("player-1")],
    });
    roomStore.getState().establishSession(makeEstablished(snapshot));
    roomStore.getState().setConnection("connected");

    render(
      <MemoryRouter>
        <SetupProvider>
          <LobbyScreen />
        </SetupProvider>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("button", { name: "Start Classic · 1 player" }),
    ).toBeDisabled();
  });
});
