import { LINE_AND_MACHINE_LEVEL_IDS } from '../constants'
import type { AssetNode, AssetOption } from '../types'

export function flattenSelectableAssets(
  roots: readonly AssetNode[],
  selectableLevelIds: ReadonlySet<number> = LINE_AND_MACHINE_LEVEL_IDS,
): AssetOption[] {
  const options: AssetOption[] = []
  const visited = new Set<string>()

  const visit = (node: AssetNode, groupLabel: string, depth: number) => {
    if (visited.has(node.id)) return
    visited.add(node.id)

    const isSelectable = selectableLevelIds.has(node.assetlevel_id)
    if (isSelectable) {
      options.push({
        assetId: node.id,
        assetLevelId: node.assetlevel_id,
        name: node.name,
        codename: node.codename && node.codename !== node.name ? node.codename : null,
        groupLabel,
        depth,
      })
    }

    for (const child of node.children) {
      visit(child, isSelectable ? groupLabel : node.name, isSelectable ? depth + 1 : 0)
    }
  }

  for (const root of roots) visit(root, root.name, 0)
  return options
}

export function isSameAsset(a: AssetOption, b: AssetOption): boolean {
  return a.assetId === b.assetId && a.assetLevelId === b.assetLevelId
}
