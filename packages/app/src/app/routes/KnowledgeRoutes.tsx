import { Navigate, Route, Routes } from 'react-router-dom'

import {
  KnowledgePage,
  KnowledgeSourceDetailPage,
  KnowledgeSourceEditPage,
  ManualNoteCreatePage
} from '../../contexts/knowledge'

/**
 * @brief 知识限界上下文的异步路由入口 / Async route entry for the Knowledge bounded context.
 * @return 知识库、手工创建、权威详情与条件编辑路由 / Knowledge library, manual creation, authority detail, and conditional-edit routes.
 * @note 该入口使同一限界上下文的页面作为一个部署单元加载 / This entry loads one bounded context as a deployment unit.
 */
export default function KnowledgeRoutes(): React.JSX.Element {
  return (
    <Routes>
      <Route element={<KnowledgePage />} index />
      <Route element={<ManualNoteCreatePage />} path="new" />
      <Route element={<KnowledgeSourceDetailPage />} path=":sourceId" />
      <Route element={<KnowledgeSourceEditPage />} path=":sourceId/edit" />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  )
}
