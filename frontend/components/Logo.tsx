/* eslint-disable @next/next/no-img-element */
export default function Logo({ height = 30, white = false }: { height?: number; white?: boolean }) {
  return <img src="/logo.png" alt="Rewind" className="logo" style={{ height, filter: white ? "brightness(0) invert(1)" : undefined }} />;
}