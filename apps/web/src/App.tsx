import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { roomController } from "./realtime/runtime";
import { useRoomStore } from "./state/room-store";
import { RoomScreen } from "./ui/game-screens";
import {
  CreateRoomScreen,
  HomeScreen,
  JoinScreen,
  ProfileScreen,
  ThemeEditorScreen,
  ThemeLibraryScreen,
} from "./ui/setup-screens";

function RouteFocus() {
  const location = useLocation();
  useEffect(() => {
    const main = document.getElementById("main-content");
    main?.setAttribute("tabindex", "-1");
    main?.focus({ preventScroll: true });
  }, [location.pathname]);
  return null;
}

export default function App() {
  const location = useLocation();
  const connectionMessage = useRoomStore(
    (state) => state.connectionMessage,
  );
  const latestFeedback = useRoomStore(
    (state) => state.latestGuessFeedback,
  );
  const error = useRoomStore((state) => state.lastError);

  useEffect(() => {
    if (!location.pathname.startsWith("/room/")) {
      return;
    }
    roomController.start();
    return () => roomController.stop();
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <RouteFocus />
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
        <Route path="/room/:code" element={<RoomScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
