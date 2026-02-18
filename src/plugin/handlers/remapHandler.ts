// 壊れた Variable 参照のスキャンとリマップ処理
import {
  MessageType,
  BrokenReference,
  BrokenReferenceGroup,
  CandidateVariable,
  ScanResult,
  RemapMapping,
  RemapResult,
  BindingLocation,
} from '../../shared/types';
import { logger } from '../../shared/logger';

// ---------------------------------------------------------------------------
// スキャン処理
// ---------------------------------------------------------------------------

/**
 * 現在のページ内の全ノードをスキャンし、壊れた Variable 参照を検出する。
 * 結果は壊れた Variable ID ごとにグルーピングして返す。
 */
export async function scanBrokenReferences(): Promise<ScanResult> {
  const allNodes = figma.currentPage.findAll();
  const totalNodesScanned = allNodes.length;

  logger.log(`[scanBrokenReferences] Scanning ${totalNodesScanned} nodes...`);

  // 壊れた参照を収集
  const brokenRefs: BrokenReference[] = [];

  // 解決済み Variable ID のキャッシュ（同じ ID を何度も問い合わせない）
  const resolvedCache = new Map<string, boolean>();

  async function isVariableBroken(variableId: string): Promise<boolean> {
    if (resolvedCache.has(variableId)) {
      return resolvedCache.get(variableId)!;
    }
    try {
      const variable = await figma.variables.getVariableByIdAsync(variableId);
      const broken = variable === null;
      resolvedCache.set(variableId, broken);
      return broken;
    } catch {
      resolvedCache.set(variableId, true);
      return true;
    }
  }

  for (let i = 0; i < allNodes.length; i++) {
    const node = allNodes[i];

    // 進捗を 100 件ごとに通知
    if (i % 100 === 0) {
      figma.ui.postMessage({
        type: MessageType.PROGRESS,
        data: {
          current: i,
          total: totalNodesScanned,
          phase: 'scanning' as string,
          message: `スキャン中: ${i}/${totalNodesScanned} ノード...`,
        },
      });
    }

    // 1) ノードレベルの boundVariables をチェック
    if (node.boundVariables) {
      const bv = node.boundVariables as Record<string, VariableAlias | VariableAlias[] | undefined>;
      for (const field of Object.keys(bv)) {
        const binding = bv[field];
        if (!binding) continue;

        const aliases: VariableAlias[] = Array.isArray(binding) ? binding : [binding];
        for (const alias of aliases) {
          if (alias && alias.id && (await isVariableBroken(alias.id))) {
            brokenRefs.push({
              nodeId: node.id,
              nodeName: node.name,
              nodeType: node.type,
              location: { kind: 'node', field },
              brokenVariableId: alias.id,
            });
          }
        }
      }
    }

    // 2) fills の Paint レベル boundVariables をチェック
    if ('fills' in node && Array.isArray((node as GeometryMixin).fills)) {
      const fills = (node as GeometryMixin).fills as Paint[];
      for (let pi = 0; pi < fills.length; pi++) {
        const paint = fills[pi];
        if (paint.type === 'SOLID' && paint.boundVariables?.color) {
          const alias = paint.boundVariables.color;
          if (alias && alias.id && (await isVariableBroken(alias.id))) {
            brokenRefs.push({
              nodeId: node.id,
              nodeName: node.name,
              nodeType: node.type,
              location: { kind: 'fill', paintIndex: pi },
              brokenVariableId: alias.id,
            });
          }
        }
      }
    }

    // 3) strokes の Paint レベル boundVariables をチェック
    if ('strokes' in node && Array.isArray((node as GeometryMixin).strokes)) {
      const strokes = (node as GeometryMixin).strokes as Paint[];
      for (let pi = 0; pi < strokes.length; pi++) {
        const paint = strokes[pi];
        if (paint.type === 'SOLID' && paint.boundVariables?.color) {
          const alias = paint.boundVariables.color;
          if (alias && alias.id && (await isVariableBroken(alias.id))) {
            brokenRefs.push({
              nodeId: node.id,
              nodeName: node.name,
              nodeType: node.type,
              location: { kind: 'stroke', paintIndex: pi },
              brokenVariableId: alias.id,
            });
          }
        }
      }
    }
  }

  logger.log(`[scanBrokenReferences] Found ${brokenRefs.length} broken references`);

  // 壊れた Variable ID でグルーピング
  const groupMap = new Map<string, BrokenReference[]>();
  for (const ref of brokenRefs) {
    const list = groupMap.get(ref.brokenVariableId) ?? [];
    list.push(ref);
    groupMap.set(ref.brokenVariableId, list);
  }

  // 候補 Variable を検索
  const allVariables = await figma.variables.getLocalVariablesAsync();
  const allCollections = await figma.variables.getLocalVariableCollectionsAsync();
  const collectionNameMap = new Map<string, string>();
  for (const c of allCollections) {
    collectionNameMap.set(c.id, c.name);
  }

  const brokenGroups: BrokenReferenceGroup[] = [];

  for (const [brokenId, refs] of groupMap) {
    const candidates = buildCandidateList(allVariables, collectionNameMap);

    brokenGroups.push({
      brokenVariableId: brokenId,
      affectedCount: refs.length,
      references: refs,
      candidates,
    });
  }

  logger.log(`[scanBrokenReferences] Grouped into ${brokenGroups.length} broken variable IDs`);

  return { totalNodesScanned, brokenGroups };
}

// ---------------------------------------------------------------------------
// 候補 Variable リスト生成
// ---------------------------------------------------------------------------

function buildCandidateList(
  allVariables: Variable[],
  collectionNameMap: Map<string, string>,
): CandidateVariable[] {
  return allVariables.map((v) => ({
    id: v.id,
    name: v.name,
    resolvedType: v.resolvedType,
    collectionName: collectionNameMap.get(v.variableCollectionId) ?? 'Unknown',
  }));
}

// ---------------------------------------------------------------------------
// リマップ処理
// ---------------------------------------------------------------------------

/**
 * ユーザーが選択したマッピングに基づいて壊れた参照をリマップする。
 */
export async function remapVariables(
  mappings: RemapMapping[],
  scanResult: ScanResult,
): Promise<RemapResult> {
  const errors: string[] = [];
  let totalRemapped = 0;

  // マッピングを brokenVariableId → replacementVariableId の Map に変換
  const mappingMap = new Map<string, string>();
  for (const m of mappings) {
    mappingMap.set(m.brokenVariableId, m.replacementVariableId);
  }

  // 置換先 Variable のキャッシュ
  const variableCache = new Map<string, Variable>();

  async function getReplacementVariable(id: string): Promise<Variable | null> {
    if (variableCache.has(id)) return variableCache.get(id)!;
    const v = await figma.variables.getVariableByIdAsync(id);
    if (v) variableCache.set(id, v);
    return v;
  }

  // 全グループを走査して再バインド
  for (const group of scanResult.brokenGroups) {
    const replacementId = mappingMap.get(group.brokenVariableId);
    if (!replacementId) continue; // マッピングなし → スキップ

    const replacementVar = await getReplacementVariable(replacementId);
    if (!replacementVar) {
      errors.push(`置換先 Variable (${replacementId}) が見つかりません`);
      continue;
    }

    for (let i = 0; i < group.references.length; i++) {
      const ref = group.references[i];

      // 進捗通知
      if (i % 20 === 0) {
        figma.ui.postMessage({
          type: MessageType.PROGRESS,
          data: {
            current: totalRebound,
            total: scanResult.brokenGroups.reduce((s, g) => s + g.affectedCount, 0),
            phase: 'remapping' as string,
            message: `リマップ中...`,
          },
        });
      }

      try {
        const node = await figma.getNodeByIdAsync(ref.nodeId) as SceneNode | null;
        if (!node) {
          errors.push(`ノード ${ref.nodeName} (${ref.nodeId}) が見つかりません`);
          continue;
        }

        await applyRemap(node, ref.location, replacementVar);
        totalRemapped++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${ref.nodeName}.${locationLabel(ref.location)}: ${msg}`);
      }
    }
  }

  logger.log(`[remapVariables] Remapped ${totalRemapped} references, ${errors.length} errors`);

  return {
    success: errors.length === 0,
    totalRemapped,
    errors,
  };
}

// ---------------------------------------------------------------------------
// 内部ヘルパー
// ---------------------------------------------------------------------------

/**
 * 1つの壊れた参照を実際にリマップする。
 */
async function applyRemap(
  node: SceneNode,
  location: BindingLocation,
  replacementVar: Variable,
): Promise<void> {
  switch (location.kind) {
    case 'node': {
      const nodeAny = node as SceneNode & Record<string, unknown>;
      if (typeof nodeAny.setBoundVariable !== 'function') {
        throw new Error(`ノード ${node.name} は setBoundVariable をサポートしていません`);
      }
      (nodeAny.setBoundVariable as (field: VariableBindableNodeField, variable: Variable) => void)(
        location.field as VariableBindableNodeField,
        replacementVar,
      );
      break;
    }

    case 'fill': {
      if (!('fills' in node)) {
        throw new Error(`ノード ${node.name} は fills を持っていません`);
      }
      const fillNode = node as GeometryMixin;
      const fills = [...(fillNode.fills as Paint[])];
      const paint = fills[location.paintIndex];
      if (!paint || paint.type !== 'SOLID') {
        throw new Error(`fill[${location.paintIndex}] が SOLID ではありません`);
      }
      fills[location.paintIndex] = figma.variables.setBoundVariableForPaint(
        paint,
        'color',
        replacementVar,
      );
      fillNode.fills = fills;
      break;
    }

    case 'stroke': {
      if (!('strokes' in node)) {
        throw new Error(`ノード ${node.name} は strokes を持っていません`);
      }
      const strokeNode = node as GeometryMixin;
      const strokes = [...(strokeNode.strokes as Paint[])];
      const paint = strokes[location.paintIndex];
      if (!paint || paint.type !== 'SOLID') {
        throw new Error(`stroke[${location.paintIndex}] が SOLID ではありません`);
      }
      strokes[location.paintIndex] = figma.variables.setBoundVariableForPaint(
        paint,
        'color',
        replacementVar,
      );
      strokeNode.strokes = strokes;
      break;
    }
  }
}

function locationLabel(loc: BindingLocation): string {
  switch (loc.kind) {
    case 'node':
      return loc.field;
    case 'fill':
      return `fills[${loc.paintIndex}].color`;
    case 'stroke':
      return `strokes[${loc.paintIndex}].color`;
  }
}
