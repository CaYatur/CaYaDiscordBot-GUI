import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function IconFrame({ size = 20, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const DashboardIcon = (props: IconProps) => (
  <IconFrame {...props}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></IconFrame>
);

export const ServerIcon = (props: IconProps) => (
  <IconFrame {...props}><rect x="3" y="4" width="18" height="6" rx="2" /><rect x="3" y="14" width="18" height="6" rx="2" /><path d="M7 7h.01M7 17h.01M11 7h7M11 17h7" /></IconFrame>
);

export const MusicIcon = (props: IconProps) => (
  <IconFrame {...props}><path d="M9 18V6l10-2v12" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></IconFrame>
);

export const GameIcon = (props: IconProps) => (
  <IconFrame {...props}><path d="M7 8h10a4 4 0 0 1 3.7 5.5l-1.3 3.2a2.2 2.2 0 0 1-3.5.8L14.4 16H9.6l-1.5 1.5a2.2 2.2 0 0 1-3.5-.8l-1.3-3.2A4 4 0 0 1 7 8z" /><path d="M8 11v4M6 13h4M16 12h.01M18 14h.01" /></IconFrame>
);

export const AiIcon = (props: IconProps) => (
  <IconFrame {...props}><rect x="5" y="5" width="14" height="14" rx="4" /><path d="M9 9h6M9 13h3M4 10H2M4 14H2M22 10h-2M22 14h-2M10 4V2M14 4V2M10 22v-2M14 22v-2" /></IconFrame>
);

export const MessageIcon = (props: IconProps) => (
  <IconFrame {...props}><path d="M5 18l-2 3v-5a8 8 0 1 1 3 3" /><path d="M8 10h8M8 14h5" /></IconFrame>
);

export const ShieldIcon = (props: IconProps) => (
  <IconFrame {...props}><path d="M12 3l7 3v5c0 4.7-2.7 8-7 10-4.3-2-7-5.3-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></IconFrame>
);

export const BanIcon = (props: IconProps) => (
  <IconFrame {...props}><circle cx="12" cy="12" r="9" /><path d="M6 6l12 12" /></IconFrame>
);

export const LogIcon = (props: IconProps) => (
  <IconFrame {...props}><path d="M5 3h11l3 3v15H5z" /><path d="M16 3v4h4M8 11h8M8 15h8" /></IconFrame>
);

export const SettingsIcon = (props: IconProps) => (
  <IconFrame {...props}><circle cx="12" cy="12" r="3" /><path d="M19 13.5l1.4 1.1-2 3.4-1.8-.7a7 7 0 0 1-2.1 1.2l-.3 1.9h-4l-.3-1.9a7 7 0 0 1-2.1-1.2L6 18l-2-3.4 1.4-1.1a7 7 0 0 1 0-3L4 9.4 6 6l1.8.7a7 7 0 0 1 2.1-1.2l.3-1.9h4l.3 1.9a7 7 0 0 1 2.1 1.2L18 6l2 3.4-1.4 1.1a7 7 0 0 1 .4 3z" /></IconFrame>
);

export const DatabaseIcon = (props: IconProps) => (
  <IconFrame {...props}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></IconFrame>
);

export const KeyIcon = (props: IconProps) => (
  <IconFrame {...props}><circle cx="8" cy="12" r="4" /><path d="M12 12h9M17 12v3M20 12v2" /></IconFrame>
);

export const FolderIcon = (props: IconProps) => (
  <IconFrame {...props}><path d="M3 6h7l2 2h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></IconFrame>
);

export const ChevronIcon = (props: IconProps) => (
  <IconFrame {...props}><path d="M9 6l6 6-6 6" /></IconFrame>
);
