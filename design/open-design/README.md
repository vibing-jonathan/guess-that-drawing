# Open Design baseline

This directory preserves the reviewed visual source of truth for the
production frontend.

- Project: `Guess That Drawing`
- Entry: `guess-that-drawing-prototype.html`
- Design system: `DESIGN.md`
- Open Design review run: `fe6f6925-e87d-471b-811c-395b0a3aa478`
- Reviewed modes: Classic, Pro, and Phone
- Reviewed states: 56
- Reviewed viewports: 390, 768, 1024, and 1440 px, plus 844×390 landscape
- Setup contract: Mode & settings; code-private rooms; separate Theme step for Classic/Pro
- Phone timers: Text 60 sec default; Drawing 120 sec default
- Phone text tasks: 1–180 trimmed characters; skipped steps preserve the active deadline

The `prototype/` directory contains the reviewed source modules plus a
browser-ready bundle and its vendored React runtime. Rebuild `app.bundle.js`
from `bundle-entry.jsx` after changing the prototype modules. Production React
code may modularize and bind these styles and structures to real application
state, but intentional visual changes must first be reflected in `DESIGN.md`
and reviewed in Open Design.

[Open the project in the local Open Design studio](http://127.0.0.1:45201/projects/guess-that-drawing/conversations/d8dc3b25-04b3-4639-ab8e-025dfa737914/files/guess-that-drawing-prototype.html)
