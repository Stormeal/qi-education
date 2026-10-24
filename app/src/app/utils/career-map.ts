import { CareerPath, CareerPathStep } from '../app.models';

/** A milestone on the all-careers map; `step` is null for a prerequisite that is not published. */
export type CareerMapNode = { id: string; title: string; step: CareerPathStep | null; column: number; careerIds: string[] };
export type CareerMap = {
  columns: CareerMapNode[][];
  edges: { from: string; to: string }[];
  careers: { id: string; title: string }[];
  notOnMap: { id: string; title: string }[];
};

/** US-L026: every published milestone-format career as one graph, each milestone once, columns by prerequisite depth. */
export function buildCareerMap(paths: CareerPath[]): CareerMap {
  const drawn = paths.filter((path) => path.schemaVersion === 2);
  const steps = new Map<string, CareerPathStep>();
  const careerIds = new Map<string, string[]>();
  const order = new Map<string, number>();
  drawn.forEach((path, pathIndex) => path.steps.forEach((step, stepIndex) => {
    if (!steps.has(step.id)) {
      steps.set(step.id, step);
      order.set(step.id, pathIndex * 10_000 + stepIndex);
    }
    careerIds.set(step.id, [...(careerIds.get(step.id) ?? []), path.id]);
  }));

  const edges = [...new Map([...steps.values()].flatMap((step) =>
    step.prerequisiteStepIds.map((from) => [`${from}>${step.id}`, { from, to: step.id }] as const))).values()];

  // Longest chain of prerequisites; a loop, or anything behind one, has no finite depth.
  const depths = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (id: string): number => {
    const known = depths.get(id);
    if (known !== undefined) return known;
    const step = steps.get(id);
    if (!step) return 0;
    if (visiting.has(id)) return Infinity;
    visiting.add(id);
    const value = step.prerequisiteStepIds.reduce((most, prerequisite) => Math.max(most, depth(prerequisite) + 1), 0);
    visiting.delete(id);
    depths.set(id, value);
    return value;
  };

  const nodes: CareerMapNode[] = [...steps.values()].map((step) =>
    ({ id: step.id, title: step.title, step, column: depth(step.id), careerIds: careerIds.get(step.id) ?? [] }));
  const missing = [...new Set(edges.map((edge) => edge.from).filter((id) => !steps.has(id)))];
  nodes.push(...missing.map((id) => ({ id, title: 'Not published', step: null, column: 0, careerIds: [] })));

  const lastFinite = Math.max(-1, ...nodes.filter((node) => Number.isFinite(node.column)).map((node) => node.column));
  for (const node of nodes) if (!Number.isFinite(node.column)) node.column = lastFinite + 1;
  const columns: CareerMapNode[][] = [];
  for (const node of nodes.sort((a, b) => (order.get(a.id) ?? -1) - (order.get(b.id) ?? -1))) {
    (columns[node.column] ??= []).push(node);
  }

  return {
    columns: columns.filter(Boolean),
    edges,
    careers: drawn.map((path) => ({ id: path.id, title: path.title })),
    notOnMap: paths.filter((path) => path.schemaVersion !== 2).map((path) => ({ id: path.id, title: path.title })),
  };
}
