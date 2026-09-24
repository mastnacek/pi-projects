// Extracted from viewer.ts to keep modules focused.

import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export const RESET = "\x1b[0m";

export const BOLD = "\x1b[1m";

export const DIM = "\x1b[2m";

export const goldGlow = (s: string) =>
  `\x1b[1m\x1b[38;2;255;215;0m${s}${RESET}`;

export const cyanGlow = (s: string) =>
  `\x1b[1m\x1b[38;2;0;255;255m${s}${RESET}`;

export const greenGlow = (s: string) =>
  `\x1b[1m\x1b[38;2;0;255;127m${s}${RESET}`;

export const pinkGlow = (s: string) =>
  `\x1b[1m\x1b[38;2;255;95;215m${s}${RESET}`;

export const violetGlow = (s: string) =>
  `\x1b[1m\x1b[38;2;186;85;211m${s}${RESET}`;

export const coralGlow = (s: string) =>
  `\x1b[1m\x1b[38;2;255;107;107m${s}${RESET}`;

export const dimGlow = (s: string) => `\x1b[38;2;127;140;141m${s}${RESET}`;
