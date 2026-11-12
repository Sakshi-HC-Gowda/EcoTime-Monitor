import type { GreenWindow } from '@/types/domain';

export function getGreenWindowLabel(index: number): string {
  return `Green Window ${index + 1}`;
}

export function getGreenWindowLabelById(
  windows: GreenWindow[],
  windowId?: string,
): string | undefined {
  if (!windowId) return undefined;
  const index = windows.findIndex((window) => window.id === windowId);
  return index >= 0 ? getGreenWindowLabel(index) : undefined;
}
