import { normalizeConstruction } from './construction-contract';
import type { DoorLineInput } from './job-intake-types';

// Presentation only: the internal astragal remains a geometry/persistence input.
// Special constructions and compound configurations await separate product decisions.
export function showsMagCatch(line: Readonly<DoorLineInput>): boolean {
  return line.mode === 'Interior' && line.config === 'DD'
    && normalizeConstruction(line.construction) === 'standard';
}
