import type { ReactNode } from 'react';

/** Small stroke icon set (24px grid). One place, so the whole product shares a visual language. */
const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export const ICONS = {
  home: <Svg><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></Svg>,
  invoices: <Svg><path d="M6 3.5h9l4 4V20a.5.5 0 0 1-.5.5h-12A.5.5 0 0 1 6 20V3.5Z" /><path d="M14.5 3.5V8H19M9 12.5h6M9 16h4" /></Svg>,
  approvals: <Svg><path d="M12 3.5 4.5 6.5v5.2c0 4.3 3 7.6 7.5 8.8 4.5-1.2 7.5-4.5 7.5-8.8V6.5L12 3.5Z" /><path d="m8.8 12 2.3 2.3 4.2-4.6" /></Svg>,
  vendors: <Svg><path d="M4 20.5V9l8-5 8 5v11.5" /><path d="M9.5 20.5v-6h5v6M3 20.5h18" /></Svg>,
  mandates: <Svg><path d="M5 7h9M18 7h1M5 17h1M10 17h9" /><circle cx="16" cy="7" r="2.2" /><circle cx="8" cy="17" r="2.2" /></Svg>,
  agents: <Svg><rect x="4.5" y="8" width="15" height="11" rx="3" /><path d="M12 8V4.5M9.2 13v1.4M14.8 13v1.4M2.5 13v2M21.5 13v2" /><circle cx="12" cy="3.6" r="1" /></Svg>,
  audit: <Svg><path d="M5 5h14M5 10h14M5 15h8" /><circle cx="17.5" cy="16.5" r="3" /><path d="m19.7 18.7 1.8 1.8" /></Svg>,
  playground: <Svg><path d="M9.5 3.5h5M10.5 3.5v6L5.2 18.2a1.8 1.8 0 0 0 1.6 2.8h10.4a1.8 1.8 0 0 0 1.6-2.8L13.5 9.5v-6" /><path d="M8 15h8" /></Svg>,
};
export type IconName = keyof typeof ICONS;
