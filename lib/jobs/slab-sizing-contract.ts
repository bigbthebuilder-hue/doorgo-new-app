import type { DoorLineInput } from './job-intake-types';

// Existing text column/RPC contract; legacy paired values retain paired meaning.
export const SLAB_SIZING_MODES = ['No', 'RO', 'WoodCustom', 'CustomWidth', 'CustomHeight'] as const;
export type SlabSizingMode = typeof SLAB_SIZING_MODES[number];
export type SlabAxis = 'width' | 'height';

export function customSlabAxis(line: Pick<DoorLineInput, 'customSlab'>, axis: SlabAxis): boolean {
  return line.customSlab === 'WoodCustom' || line.customSlab === 'Yes'
    || line.customSlab === (axis === 'width' ? 'CustomWidth' : 'CustomHeight');
}

export function hasCustomSlabAxis(line: Pick<DoorLineInput, 'customSlab'>): boolean {
  return customSlabAxis(line, 'width') || customSlabAxis(line, 'height');
}

export function slabAxisInput(line: DoorLineInput, axis: SlabAxis): unknown {
  return customSlabAxis(line, axis) ? line[axis === 'width' ? 'customSlabWidth' : 'customSlabHeight'] : line[axis];
}

export function selectSlabAxis(line: DoorLineInput, axis: SlabAxis, value: string): DoorLineInput {
  const width = axis === 'width' ? value === 'Custom' : customSlabAxis(line, 'width');
  const height = axis === 'height' ? value === 'Custom' : customSlabAxis(line, 'height');
  const customSlab: SlabSizingMode = width && height ? 'WoodCustom' : width ? 'CustomWidth' : height ? 'CustomHeight' : line.customSlab === 'RO' ? 'RO' : 'No';
  return {
    ...line, customSlab,
    ...(value === 'Custom' ? {} : { [axis]: value }),
    customSlabWidth: width ? line.customSlabWidth ?? '' : '',
    customSlabHeight: height ? line.customSlabHeight ?? '' : '',
    ...(line.customSlab === 'RO' && value === 'Custom' ? { roWidth: '', roHeight: '' } : {}),
  };
}
