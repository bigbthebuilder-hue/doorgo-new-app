import { calculateGlassDiagramLayout, type GlassDiagramLayout } from '@/lib/jobs/glass-diagram-contract';
import { isGlassConfiguration, normalizeSidelightType } from '@/lib/jobs/glass-geometry-contract';
import type { DoorLineInput } from '@/lib/jobs/job-intake-types';

export function GlassUnitDiagram({ line, compact = false, layout: suppliedLayout }: { line: DoorLineInput; compact?: boolean; layout?: GlassDiagramLayout | null }) {
  if (!isGlassConfiguration(line.config)) return null;
  const type = normalizeSidelightType(line.sidelightType) ?? 'Glass';
  const calc = line.glassCalc;
  const layout = suppliedLayout ?? calculateGlassDiagramLayout(line);
  if (!layout) return null;
  const pad = Math.max(layout.width, layout.height) * 0.025;

  return (
    <figure className={`glass-unit-diagram ${compact ? 'glass-unit-diagram--compact' : ''}`} data-config={line.config} data-sidelight-type={type}>
      <svg aria-label={`${line.config} ${type} door-unit diagram`} preserveAspectRatio="xMidYMid meet" role="img" viewBox={`${-pad} ${-pad} ${layout.width + pad * 2} ${layout.height + pad * 2}`}>
        <rect className="diagram-background" height={layout.height + pad * 2} rx={pad} width={layout.width + pad * 2} x={-pad} y={-pad} />
        <rect className="diagram-frame" height={layout.height} width={layout.width} x="0" y="0" />
        <defs>{layout.parts.filter((part) => part.label).map((part) => <clipPath id={`diagram-label-${String(line.lineId ?? line.config).replace(/[^a-z0-9]/gi, '-')}-${part.id}`} key={part.id}><rect height={part.height} width={part.width} x={part.x} y={part.y}/></clipPath>)}</defs>
        {layout.parts.map((part) => <g data-height={part.height} data-kind={part.kind} data-width={part.width} data-x={part.x} data-y={part.y} key={part.id}>
          <rect className={`diagram-part diagram-${part.kind}`} height={part.height} width={part.width} x={part.x} y={part.y}/>
          {part.label ? <text clipPath={`url(#diagram-label-${String(line.lineId ?? line.config).replace(/[^a-z0-9]/gi, '-')}-${part.id})`} style={{ fontSize: Math.min(5, part.width / Math.max(2.5, part.label.length * .7), part.height / 5) }} x={part.x + part.width / 2} y={part.y + part.height / 2}>{part.label}</text> : null}
        </g>)}
      </svg>
      {!compact && calc ? <figcaption>{[
        calc.roWidth ? `RO ${String(calc.roWidth)}${calc.roHeight ? ` × ${String(calc.roHeight)}` : ''}` : '',
        calc.sidelightWidth ? `Sidelight ${String(calc.sidelightWidth)} × ${String(calc.sidelightHeight)}` : '',
        calc.panelWidth ? `Panel ${String(calc.panelWidth)} × ${String(calc.panelHeight)}` : '',
        calc.transomWidth ? `Transom ${String(calc.transomWidth)} × ${String(calc.transomHeight)}` : '',
      ].filter(Boolean).join(' · ')}</figcaption> : null}
    </figure>
  );
}
