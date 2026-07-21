import { Navigate, Route, Routes } from 'react-router-dom'

import {
  InterviewHubPage,
  InterviewRoomPage,
  InterviewSetupPage,
  InterviewSummaryPage
} from '../../contexts/interview'

/**
 * @brief 面试限界上下文的异步路由入口 / Async route entry for the Interview bounded context.
 * @return 面试中心、配置、房间与总结路由 / Interview hub, setup, room, and summary routes.
 * @note 该入口使同一限界上下文的页面作为一个部署单元加载 / This entry loads one bounded context as a deployment unit.
 */
export default function InterviewRoutes(): React.JSX.Element {
  return (
    <Routes>
      <Route element={<InterviewHubPage />} index />
      <Route element={<InterviewSetupPage />} path="new" />
      <Route element={<InterviewRoomPage />} path=":sessionId" />
      <Route element={<InterviewSummaryPage />} path=":sessionId/summary" />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  )
}
