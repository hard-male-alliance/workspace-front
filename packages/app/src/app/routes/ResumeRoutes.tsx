import { Navigate, Route, Routes } from 'react-router-dom'

import {
  ResumeCreationPage,
  ResumeEditorPage,
  ResumeListPage,
  TemplateSettingsPage
} from '../../contexts/resume'

/**
 * @brief 简历限界上下文的异步路由入口 / Async route entry for the Resume bounded context.
 * @return 简历列表、创建、编辑器与模板设置路由 / Resume list, creation, editor, and template-settings routes.
 * @note 该入口使同一限界上下文的页面作为一个部署单元加载 / This entry loads one bounded context as a deployment unit.
 */
export default function ResumeRoutes(): React.JSX.Element {
  return (
    <Routes>
      <Route element={<ResumeListPage />} index />
      <Route element={<ResumeCreationPage />} path="new" />
      <Route element={<ResumeEditorPage />} path=":resumeId/edit" />
      <Route element={<TemplateSettingsPage />} path=":resumeId/template" />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  )
}
