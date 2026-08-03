import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const controller = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("./realtime/runtime", () => ({
  roomController: controller,
}));

vi.mock("./state/room-store", () => ({
  useRoomStore: (
    selector: (state: {
      connectionMessage: null;
      latestGuessFeedback: null;
      lastError: null;
    }) => unknown,
  ) =>
    selector({
      connectionMessage: null,
      latestGuessFeedback: null,
      lastError: null,
    }),
}));

vi.mock("./ui/game-screens", () => ({
  RoomScreen: () => {
    const navigate = useNavigate();
    return (
      <button
        type="button"
        onClick={() => navigate("/join?code=ABC234", { replace: true })}
      >
        Join this room
      </button>
    );
  },
}));

vi.mock("./ui/setup-screens", () => ({
  CreateRoomScreen: () => {
    const navigate = useNavigate();
    return (
      <main id="main-content">
        <button type="button" onClick={() => navigate("/themes")}>
          Choose a theme
        </button>
      </main>
    );
  },
  HomeScreen: () => null,
  JoinScreen: () => <div>Join screen</div>,
  ProfileScreen: () => null,
  ReviewRoomScreen: () => null,
  ThemeEditorScreen: () => null,
  ThemeLibraryScreen: () => <main id="main-content">Theme library</main>,
}));

import App from "./App";

beforeEach(() => {
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("App realtime lifecycle", () => {
  it("keeps the controller running while navigating from room recovery to join", () => {
    const rendered = render(
      <MemoryRouter initialEntries={["/room/ABC234"]}>
        <App />
      </MemoryRouter>,
    );

    expect(controller.start).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Join this room" }));

    expect(screen.getByText("Join screen")).toBeInTheDocument();
    expect(controller.stop).not.toHaveBeenCalled();

    rendered.unmount();
    expect(controller.stop).toHaveBeenCalledTimes(1);
  });
});

describe("room creation navigation", () => {
  it("starts each setup step at the top", () => {
    render(
      <MemoryRouter initialEntries={["/create"]}>
        <App />
      </MemoryRouter>,
    );

    const scrollTo = vi.mocked(window.scrollTo);
    scrollTo.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Choose a theme" }));

    expect(screen.getByText("Theme library")).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  });

  it("starts non-setup destinations at the top too", () => {
    render(
      <MemoryRouter initialEntries={["/room/ABC234"]}>
        <App />
      </MemoryRouter>,
    );

    const scrollTo = vi.mocked(window.scrollTo);
    scrollTo.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Join this room" }));

    expect(screen.getByText("Join screen")).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  });
});
