import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { ArtifactSavePort } from '@ai-job-workspace/platform'

/** @brief 宿主产物保存上下文 / Host artifact-save context. */
const ArtifactSaveContext = createContext<ArtifactSavePort | null>(null)

/** @brief 宿主能力提供器属性 / Host-capability provider properties. */
export interface HostProviderProps {
  /** @brief 当前运行时实现的产物保存端口 / Artifact-save port implemented by the current runtime. */
  readonly artifactSave: ArtifactSavePort
  /** @brief 使用宿主能力的应用子树 / Application subtree consuming host capabilities. */
  readonly children: ReactNode
}

/**
 * @brief 显式注入与业务数据无关的宿主能力 / Explicitly inject host capabilities independent of business data.
 * @param props 宿主能力与应用子树 / Host capabilities and application subtree.
 * @return 宿主上下文提供器 / Host-context provider.
 */
export function HostProvider({ artifactSave, children }: HostProviderProps): React.JSX.Element {
  return (
    <ArtifactSaveContext.Provider value={artifactSave}>{children}</ArtifactSaveContext.Provider>
  )
}

/**
 * @brief 读取宿主产物保存端口 / Read the host artifact-save port.
 * @return 组合根显式注入的产物保存端口 / Artifact-save port explicitly injected by the composition root.
 * @throws 未在 HostProvider 内使用时抛出 / Throws when used outside HostProvider.
 */
export function useArtifactSave(): ArtifactSavePort {
  /** @brief 当前宿主保存端口 / Current host save port. */
  const port = useContext(ArtifactSaveContext)

  if (port === null) throw new Error('Artifact saving requires HostProvider.')
  return port
}
