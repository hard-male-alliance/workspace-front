import { Navigate, Route, Routes } from 'react-router-dom'

import { KnowledgePage, KnowledgeVisibilityPage } from '../../contexts/knowledge'

/**
 * @brief 知识限界上下文的异步路由入口 / Async route entry for the Knowledge bounded context.
 * @return 知识库与来源可见性路由 / Knowledge-library and source-visibility routes.
 * @note 该入口使同一限界上下文的页面作为一个部署单元加载 / This entry loads one bounded context as a deployment unit.
 */
export default function KnowledgeRoutes(): React.JSX.Element {
  return (
    <Routes>
      <Route element={<KnowledgePage />} index />
      <Route element={<KnowledgeVisibilityPage />} path=":sourceId/visibility" />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  )
}
