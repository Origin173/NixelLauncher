const paths = {
  home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  box: 'm12 3 9 5v8l-9 5-9-5V8Zm0 9 9-4M12 12 3 8m9 4v9M7.5 5.5l9 5',
  compass: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM16 8l-3 5-5 3 3-5Z',
  plugin:
    'M9 3H4a1 1 0 0 0-1 1v5h2a3 3 0 1 1 0 6H3v5a1 1 0 0 0 1 1h5v-2a3 3 0 0 1 6 0v2h5a1 1 0 0 0 1-1v-5h-2a3 3 0 0 1 0-6h2V4a1 1 0 0 0-1-1h-5v2a3 3 0 0 1-6 0Z',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2',
  settings:
    'm9 3-.7 2.2-2 .9L4 5.6 2 9l1.8 1.6v2.8L2 15l2 3.4 2.3-.5 2 .9L9 21h6l.7-2.2 2-.9 2.3.5 2-3.4-1.8-1.6v-2.8L22 9l-2-3.4-2.3.5-2-.9L15 3ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  download: 'M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5',
  upload: 'M12 16V4m-5 5 5-5 5 5M4 15v5h16v-5',
  plus: 'M12 5v14M5 12h14',
  search: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-2 5 6 6',
  chevron: 'm9 5 7 7-7 7',
  down: 'm5 9 7 7 7-7',
  play: 'm7 4 14 8-14 8Z',
  stop: 'M5 5h14v14H5Z',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M6 18 18 6',
  minimize: 'M5 12h14',
  maximize: 'M5 5h14v14H5Z',
  moon: 'M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z',
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
  image: 'M3 3h18v18H3Zm0 13 5-5 4 4 4-6 5 8M9 7h.01',
  folder: 'M3 7V4h6l2 3h10v13H3Z',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2',
  refresh: 'M20 7v5h-5M4 17v-5h5M5 7a8 8 0 0 1 13-2l2 2M4 17l2 2a8 8 0 0 0 13-2',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  external: 'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',
  info: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 11v6m0-10h.01',
  alert: 'm12 3 10 18H2ZM12 9v4m0 4h.01',
  shield: 'm12 3 8 3v6c0 4-5 8-8 9-3-1-8-5-8-9V6Zm-4 9 3 3 5-6',
  leaf: 'M20 3C7 2 2 8 5 16s16 6 15-13ZM5 20l10-10',
  cpu: 'M7 7h10v10H7ZM9 2v5m6-5v5M9 17v5m6-5v5M2 9h5m-5 6h5m10-6h5m-5 6h5',
  terminal: 'm4 6 6 6-6 6m9 0h7',
  palette:
    'M21 12a9 9 0 1 0-9 9h1a2 2 0 0 0 0-4 2 2 0 0 1 0-4h5a3 3 0 0 0 3-3M7 9h.01M10 6h.01M15 6h.01M18 9h.01',
  grid: 'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  back: 'M20 12H4m6-6-6 6 6 6',
  sliders: 'M4 7h5m4 0h7M4 17h9m4 0h3M9 4v6m4 4v6',
  bookmark: 'M6 3h12v18l-6-4-6 4Z',
  copy: 'M9 9h12v12H9ZM5 15H3V3h12v2',
  code: 'm8 5-6 7 6 7m8-14 6 7-6 7M14 3l-4 18',
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18Z',
  star: 'm12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z',
  layers: 'm12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5',
};
export type IconName = keyof typeof paths;
export function Icon({
  name,
  size = 18,
  className = '',
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function Brand({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--foreground)" />
      <path d="M8 23V9h5l6 9V9h5v14h-5l-6-9v9Z" fill="var(--background)" />
    </svg>
  );
}
