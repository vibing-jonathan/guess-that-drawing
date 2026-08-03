import { useEffect, useLayoutEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";

import { roomController } from "./realtime/runtime";
import { useRoomStore } from "./state/room-store";
import { RoomScreen } from "./ui/game-screens";
import { GameFeel } from "./ui/game-feel";
import {
  CreateRoomScreen,
  HomeScreen,
  JoinScreen,
  ProfileScreen,
  ReviewRoomScreen,
  ThemeEditorScreen,
  ThemeLibraryScreen,
} from "./ui/setup-screens";

const SETUP_ROUTES = new Set([
  "/profile",
  "/create",
  "/themes",
  "/themes/new",
  "/review",
]);

function RouteEffects() {
  const location = useLocation();
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    const main = document.getElementById("main-content");
    main?.setAttribute("tabindex", "-1");
    main?.focus({ preventScroll: true });
  }, [location.pathname]);
  return null;
}

export default function App() {
  const location = useLocation();
  const isSetupFlow = SETUP_ROUTES.has(location.pathname);
  const connectionMessage = useRoomStore(
    (state) => state.connectionMessage,
  );
  const latestFeedback = useRoomStore(
    (state) => state.latestGuessFeedback,
  );
  const error = useRoomStore((state) => state.lastError);

  useEffect(() => {
    roomController.start();
    return () => roomController.stop();
  }, []);

  return (
    <div
      className={`app-shell ${isSetupFlow ? "app-shell--setup" : ""}`}
      data-design-world="live-comics-desk"
    >
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <RouteEffects />
      <GameFeel />
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {latestFeedback?.message ?? connectionMessage ?? ""}
      </div>
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {error && !error.retryable ? error.message : ""}
      </div>
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/create" element={<CreateRoomScreen />} />
        <Route path="/join" element={<JoinScreen />} />
        <Route path="/themes" element={<ThemeLibraryScreen />} />
        <Route path="/themes/new" element={<ThemeEditorScreen />} />
        <Route path="/review" element={<ReviewRoomScreen />} />
        <Route path="/room/:code" element={<RoomScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
