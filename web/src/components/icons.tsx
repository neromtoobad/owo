import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 20): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
});

export const ArrowRight = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const ArrowLeft = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
);
export const Check = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
export const Shield = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z" /><path d="M8.8 12.2l2.2 2.2 4.4-4.6" /></svg>
);
export const Pen = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4 20l4.2-1 10.6-10.6a2.1 2.1 0 00-3-3L5.2 16 4 20z" /><path d="M14.5 6.5l3 3" /></svg>
);
export const Fuel = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4 20V5.5A1.5 1.5 0 015.5 4h7A1.5 1.5 0 0114 5.5V20M3 20h12M14 9h2.5a1.5 1.5 0 011.5 1.5V16a1.5 1.5 0 003 0V8l-3-3" /><path d="M7 8h4" /></svg>
);
export const Bank = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M3 9.5L12 4l9 5.5M5 10v8M9.7 10v8M14.3 10v8M19 10v8M3 20h18" /></svg>
);
export const Return = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M9 14l-5-5 5-5" /><path d="M4 9h10.5a5.5 5.5 0 010 11H11" /></svg>
);
export const Chart = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4 19h16M7 15l4-4 3 3 5-6" /></svg>
);
export const External = ({ size = 14, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></svg>
);
export const ChevronDown = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M6 9l6 6 6-6" /></svg>
);
export const Search = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>
);
export const Wallet = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M4 7.5A2.5 2.5 0 016.5 5H18v3" /><rect x="4" y="8" width="16" height="11" rx="2.5" /><circle cx="16" cy="13.5" r="1.2" fill="currentColor" stroke="none" /></svg>
);
export const Bitcoin = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M8 6h5.5a3 3 0 010 6H8m0 0h6.5a3 3 0 010 6H8m0-12v12M10 4v2M13 4v2M10 18v2M13 18v2" /></svg>
);
export const Info = ({ size = 16, ...p }: P) => (
  <svg {...base(size)} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
);
export const Alert = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 4l9 16H3l9-16z" /><path d="M12 10v4M12 17h.01" /></svg>
);
export const Copy = ({ size = 16, ...p }: P) => (
  <svg {...base(size)} {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" /></svg>
);
export const Share = ({ size = 16, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M12 4v11M7.5 8.5L12 4l4.5 4.5M5 13v5.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V13" /></svg>
);
export const Clock = ({ size = 16, ...p }: P) => (
  <svg {...base(size)} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
);
export const Close = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const Swap = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}><path d="M7 4v14M3.5 14.5L7 18l3.5-3.5M17 20V6M13.5 9.5L17 6l3.5 3.5" /></svg>
);

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg className="spin" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 00-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
