import 'server-only';

import QRCode from 'qrcode';

/** A QR code as inline SVG (black on white, the most reliable to scan), rendered on the server. */
export async function QrCode({ value, label }: { value: string; label: string }) {
  const svg = await QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return (
    <div
      role="img"
      aria-label={label}
      className="size-40 overflow-hidden rounded-xl [&>svg]:size-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
