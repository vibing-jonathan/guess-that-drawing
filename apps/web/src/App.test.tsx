import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  CreateRoomScreen: () => null,
  HomeScreen: () => null,
  JoinScreen: () => <div>Join screen</div>,
  ProfileScreen: () => null,
  ReviewRoomScreen: () => null,
  ThemeEditorScreen: () => null,
  ThemeLibraryScreen: () => null,
}));

import App from "./App";

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
