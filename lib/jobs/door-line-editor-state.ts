import type { DoorLineInput } from './job-intake-types';

export function replaceDoorLineAtIndex(lines: readonly DoorLineInput[], editingIndex: number, saved: DoorLineInput): DoorLineInput[] {
  return lines.map((line, index) => index === editingIndex ? saved : line);
}
