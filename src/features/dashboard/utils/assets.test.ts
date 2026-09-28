import { describe, expect, it } from 'vitest'
import type { AssetNode } from '../types'
import { flattenSelectableAssets } from './assets'

function node(
  id: string,
  name: string,
  assetlevel_id: number,
  children: AssetNode[] = [],
  codename: string | null = null,
) {
  return { id, name, codename, assetlevel_id, hierarchy: null, children }
}

const tree: AssetNode[] = [
  node('org', 'Org', 50, [
    node('plant', 'Plant', 40, [
      node('shop', 'Shop', 30, [
        node('line-1', 'Line 1', 20, [
          node('m-1', 'Machine 1', 10, [node('m-1a', 'Sub machine', 10, [], 'SUB-1')], 'M-01'),
          node('m-2', 'Machine 2', 10, [], 'Machine 2'),
        ]),
        node('m-3', 'Standalone', 10),
      ]),
    ]),
  ]),
]

describe('flattenSelectableAssets', () => {
  it('returns line and machine nodes in tree order, keeping id and asset level', () => {
    expect(flattenSelectableAssets(tree).map(({ assetId, assetLevelId }) => [assetId, assetLevelId])).toEqual([
      ['line-1', 20],
      ['m-1', 10],
      ['m-1a', 10],
      ['m-2', 10],
      ['m-3', 10],
    ])
  })

  it('groups by the nearest non-selectable ancestor and tracks nesting depth', () => {
    expect(flattenSelectableAssets(tree).map(({ name, groupLabel, depth }) => [name, groupLabel, depth])).toEqual([
      ['Line 1', 'Shop', 0],
      ['Machine 1', 'Shop', 1],
      ['Sub machine', 'Shop', 2],
      ['Machine 2', 'Shop', 1],
      ['Standalone', 'Shop', 0],
    ])
  })

  it('keeps codename only when it adds information', () => {
    const byId = new Map(flattenSelectableAssets(tree).map((option) => [option.assetId, option.codename]))
    expect(byId.get('m-1')).toBe('M-01')
    expect(byId.get('m-2')).toBeNull()
    expect(byId.get('line-1')).toBeNull()
  })

  it('handles the sample payload shape with optional fields absent', () => {
    const roots: AssetNode[] = [{ id: 'l', name: 'SMT Line 1', assetlevel_id: 20, children: [] }]
    expect(flattenSelectableAssets(roots)).toEqual([
      { assetId: 'l', assetLevelId: 20, name: 'SMT Line 1', codename: null, groupLabel: 'SMT Line 1', depth: 0 },
    ])
  })

  it('skips duplicate node ids', () => {
    const duplicate = node('m-2', 'Machine 2 again', 10)
    const roots = [node('line', 'Line', 20, [node('m-2', 'Machine 2', 10), duplicate])]
    expect(flattenSelectableAssets(roots).map((option) => option.name)).toEqual(['Line', 'Machine 2'])
  })

  it('does not mutate the backend response', () => {
    const snapshot = structuredClone(tree)
    flattenSelectableAssets(tree)
    expect(tree).toEqual(snapshot)
  })

  it('accepts a custom set of selectable levels', () => {
    expect(flattenSelectableAssets(tree, new Set([30])).map((option) => option.assetId)).toEqual(['shop'])
  })
})
