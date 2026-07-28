(() => {
const { createElement: h } = React;

const ICON_PATHS = {
  arrowLeft: [["path", { d: "m15 18-6-6 6-6" }], ["path", { d: "M9 12h10" }]],
  arrowRight: [["path", { d: "m9 18 6-6-6-6" }], ["path", { d: "M5 12h10" }]],
  brush: [["path", { d: "m9.06 11.9 8.07-8.06a2 2 0 1 1 2.83 2.83l-8.07 8.07" }], ["path", { d: "M7.07 14.94c-1.45 0-2.66.88-3.16 2.1-.45 1.1-1.89 1.12-2.5 1.12 0 0 .3 2.84 4.66 2.84 2.32 0 4-1.38 4-3.5 0-.79-.3-1.5-.76-2.05-.6-.72-1.42-.51-2.24-.51Z" }]],
  check: [["path", { d: "m5 12 4 4L19 6" }]],
  checkCircle: [["path", { d: "M22 11.1V12a10 10 0 1 1-5.9-9.1" }], ["path", { d: "m9 11 3 3L22 4" }]],
  chevronDown: [["path", { d: "m6 9 6 6 6-6" }]],
  circleAlert: [["circle", { cx: "12", cy: "12", r: "10" }], ["path", { d: "M12 8v4" }], ["path", { d: "M12 16h.01" }]],
  circleX: [["circle", { cx: "12", cy: "12", r: "10" }], ["path", { d: "m15 9-6 6" }], ["path", { d: "m9 9 6 6" }]],
  clock: [["circle", { cx: "12", cy: "12", r: "9" }], ["path", { d: "M12 7v5l3 2" }]],
  cloudOff: [["path", { d: "m2 2 20 20" }], ["path", { d: "M5.8 5.8A7 7 0 0 1 18.8 9H20a4 4 0 0 1 1.1 7.8" }], ["path", { d: "M6.7 18H6a4 4 0 0 1-.8-7.9" }]],
  copy: [["rect", { width: "14", height: "14", x: "8", y: "8", rx: "2" }], ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }]],
  crown: [["path", { d: "m2 4 3 12h14l3-12-6 5-4-7-4 7Z" }], ["path", { d: "M5 20h14" }]],
  download: [["path", { d: "M12 3v12" }], ["path", { d: "m7 10 5 5 5-5" }], ["path", { d: "M5 21h14" }]],
  ellipse: [["ellipse", { cx: "12", cy: "12", rx: "9", ry: "6" }]],
  eraser: [["path", { d: "m7 21-4-4a2 2 0 0 1 0-3L14 3a2 2 0 0 1 3 0l4 4a2 2 0 0 1 0 3L10 21" }], ["path", { d: "m6 11 8 8" }], ["path", { d: "M5 21h14" }]],
  eye: [["path", { d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" }], ["circle", { cx: "12", cy: "12", r: "3" }]],
  fileUp: [["path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" }], ["path", { d: "M14 2v6h6" }], ["path", { d: "m12 18 3-3" }], ["path", { d: "m9 15 3 3v-6" }]],
  fill: [["path", { d: "m19 11-8-8-8 8 8 8Z" }], ["path", { d: "m5 9 8 8" }], ["path", { d: "M19 17c.7.7 1 1.2 1 1.8a2 2 0 0 1-4 0c0-.6.3-1.1 1-1.8l1-1Z" }]],
  home: [["path", { d: "m3 11 9-8 9 8" }], ["path", { d: "M5 10v10h14V10" }], ["path", { d: "M9 20v-6h6v6" }]],
  key: [["circle", { cx: "8", cy: "15", r: "4" }], ["path", { d: "m11 12 8-8" }], ["path", { d: "m18 5 2 2" }], ["path", { d: "m15 8 2 2" }]],
  lightbulb: [["path", { d: "M9 18h6" }], ["path", { d: "M10 22h4" }], ["path", { d: "M8.5 15c-1.5-1.1-2.5-2.8-2.5-4.8a6 6 0 1 1 12 0c0 2-1 3.7-2.5 4.8-.4.3-.5.8-.5 1.3V17H9v-.7c0-.5-.1-1-.5-1.3Z" }]],
  line: [["path", { d: "M5 19 19 5" }]],
  link: [["path", { d: "M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" }], ["path", { d: "M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" }]],
  lock: [["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2" }], ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4" }]],
  logOut: [["path", { d: "M10 17l5-5-5-5" }], ["path", { d: "M15 12H3" }], ["path", { d: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" }]],
  menu: [["path", { d: "M4 6h16" }], ["path", { d: "M4 12h16" }], ["path", { d: "M4 18h16" }]],
  minus: [["path", { d: "M5 12h14" }]],
  music: [["path", { d: "M9 18V5l12-2v13" }], ["circle", { cx: "6", cy: "18", r: "3" }], ["circle", { cx: "18", cy: "16", r: "3" }]],
  palette: [["circle", { cx: "13.5", cy: "6.5", r: ".5", fill: "currentColor" }], ["circle", { cx: "17.5", cy: "10.5", r: ".5", fill: "currentColor" }], ["circle", { cx: "8.5", cy: "7.5", r: ".5", fill: "currentColor" }], ["circle", { cx: "6.5", cy: "12.5", r: ".5", fill: "currentColor" }], ["path", { d: "M12 22a10 10 0 1 1 10-10c0 2.8-1.8 5-4.5 5H16a2 2 0 0 0-2 2v.5c0 1.4-.9 2.5-2 2.5Z" }]],
  pencil: [["path", { d: "M12 20h9" }], ["path", { d: "M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" }]],
  plus: [["path", { d: "M12 5v14" }], ["path", { d: "M5 12h14" }]],
  rectangle: [["rect", { width: "18", height: "14", x: "3", y: "5", rx: "1" }]],
  redo: [["path", { d: "m15 9 4-4 4 4" }], ["path", { d: "M19 5v7a7 7 0 0 1-7 7H5" }]],
  refresh: [["path", { d: "M20 6v5h-5" }], ["path", { d: "M4 18v-5h5" }], ["path", { d: "M5.5 9A7 7 0 0 1 18 6l2 5" }], ["path", { d: "M18.5 15A7 7 0 0 1 6 18l-2-5" }]],
  save: [["path", { d: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" }], ["path", { d: "M17 21v-8H7v8" }], ["path", { d: "M7 3v5h8" }]],
  send: [["path", { d: "m22 2-7 20-4-9-9-4Z" }], ["path", { d: "M22 2 11 13" }]],
  settings: [["path", { d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" }], ["circle", { cx: "12", cy: "12", r: "3" }]],
  sparkles: [["path", { d: "m12 3-1.5 4.5L6 9l4.5 1.5L12 15l1.5-4.5L18 9l-4.5-1.5Z" }], ["path", { d: "m5 16-.8 2.2L2 19l2.2.8L5 22l.8-2.2L8 19l-2.2-.8Z" }]],
  trash: [["path", { d: "M3 6h18" }], ["path", { d: "M8 6V4h8v2" }], ["path", { d: "M19 6l-1 15H6L5 6" }], ["path", { d: "M10 11v5" }], ["path", { d: "M14 11v5" }]],
  trophy: [["path", { d: "M8 21h8" }], ["path", { d: "M12 17v4" }], ["path", { d: "M7 4h10v5a5 5 0 0 1-10 0Z" }], ["path", { d: "M7 6H4v2a4 4 0 0 0 4 4" }], ["path", { d: "M17 6h3v2a4 4 0 0 1-4 4" }]],
  undo: [["path", { d: "m9 9-4-4-4 4" }], ["path", { d: "M5 5v7a7 7 0 0 0 7 7h7" }]],
  upload: [["path", { d: "M12 17V3" }], ["path", { d: "m7 8 5-5 5 5" }], ["path", { d: "M5 21h14" }]],
  user: [["circle", { cx: "12", cy: "8", r: "4" }], ["path", { d: "M4 21a8 8 0 0 1 16 0" }]],
  users: [["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }], ["circle", { cx: "9", cy: "7", r: "4" }], ["path", { d: "M22 21v-2a4 4 0 0 0-3-3.87" }], ["path", { d: "M16 3.13a4 4 0 0 1 0 7.75" }]],
  wifi: [["path", { d: "M5 12.6a10 10 0 0 1 14 0" }], ["path", { d: "M8.5 16a5 5 0 0 1 7 0" }], ["path", { d: "M12 20h.01" }]],
  wifiOff: [["path", { d: "m2 2 20 20" }], ["path", { d: "M8.5 16a5 5 0 0 1 6.3-.6" }], ["path", { d: "M5 12.6a10 10 0 0 1 5.2-2.5" }], ["path", { d: "M15.5 10.6A10 10 0 0 1 19 12.6" }], ["path", { d: "M12 20h.01" }]],
  x: [["path", { d: "M18 6 6 18" }], ["path", { d: "m6 6 12 12" }]]
};

function Icon({ name, size = 20, label, className = "" }) {
  const nodes = ICON_PATHS[name] || ICON_PATHS.circleAlert;
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : "true"}
      aria-label={label || undefined}
    >
      {label ? <title>{label}</title> : null}
      {nodes.map(([tag, props], index) => h(tag, { ...props, key: `${name}-${index}` }))}
    </svg>
  );
}

Object.assign(window, { GTDIcons: { Icon } });
})();
