import { apiClient, DEFAULT_RETRIES } from '../../../api/client'
import type { AssetNode } from '../types'

export const assetsApi = {
  getTree: (signal?: AbortSignal) =>
    apiClient.get<AssetNode[]>('/core/assets/tree', { signal, retries: DEFAULT_RETRIES }),
}
