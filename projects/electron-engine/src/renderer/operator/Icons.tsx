import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconFrame({ children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      viewBox="0 0 24 24"
      width="20"
      {...props}
    >
      {children}
    </svg>
  );
}

export function StatusIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7.1 16.9a6.9 6.9 0 0 1 0-9.8M16.9 7.1a6.9 6.9 0 0 1 0 9.8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M4.2 19.8a11 11 0 0 1 0-15.6M19.8 4.2a11 11 0 0 1 0 15.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </IconFrame>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M8 4.5h8M9 3h6v3H9zM6 5.5h12v15H6z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="m8.8 13 2.1 2.1 4.6-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
    </IconFrame>
  );
}

export function SceneIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M3.5 7h17v13h-17zM3.5 7l2-3h17l-2 3M8 4 6 7M14 4l-2 3M20 4l-2 3" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="m10 11 5 3-5 3z" fill="currentColor" />
    </IconFrame>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 2.8v2.1M12 19.1v2.1M21.2 12h-2.1M4.9 12H2.8M18.5 5.5 17 7M7 17l-1.5 1.5M18.5 18.5 17 17M7 7 5.5 5.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </IconFrame>
  );
}

export function DiagnosticsIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M2 12h4l1.7-5.8 3.1 12.3 2.6-9 1.8 5H22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </IconFrame>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m8 5 11 7-11 7z" fill="currentColor" />
    </IconFrame>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" />
    </IconFrame>
  );
}

export function ReturnIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="m9 7-5 5 5 5M5 12h8.5a5 5 0 0 1 0 10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </IconFrame>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M12 3 2.8 20h18.4z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M12 8v6M12 17.5v.1" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </IconFrame>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M20 7v5h-5M4 17v-5h5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M6.1 8.2A7.2 7.2 0 0 1 18.8 7L20 12M4 12l1.2 5A7.2 7.2 0 0 0 18 15.8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </IconFrame>
  );
}

export function ExportIcon(props: IconProps) {
  return (
    <IconFrame {...props}>
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 13v7h14v-7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </IconFrame>
  );
}
