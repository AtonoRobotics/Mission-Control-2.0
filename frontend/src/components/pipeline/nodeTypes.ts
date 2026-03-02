// ============================================================
// Pipeline Node Types — registry for React Flow custom nodes
// used in the Physical AI Pipeline bipartite DAG.
// ============================================================

import AssetNode from './AssetNode';
import OperationNode from './OperationNode';

export const pipelineNodeTypes = {
  asset: AssetNode,
  operation: OperationNode,
} as const;
