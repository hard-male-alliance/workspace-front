import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import { beforeAll, describe, expect, it } from 'vitest'

import { appI18n, appI18nReady } from '../../../i18n'
import { asUiOpaqueId } from '../../../shared-kernel/identity'
import type {
  UiInterviewReport,
  UiInterviewRubricDimension,
  UiInterviewScenario
} from '../domain/models'
import { asUiInterviewType } from '../domain/models'
import {
  buildSixDimensionRadarModel,
  InterviewSixDimensionRadar,
  radarPoint
} from './InterviewSixDimensionRadar'
import {
  SIX_DIMENSION_IDS,
  SIX_DIMENSION_RUBRIC_ID,
  SIX_DIMENSION_RUBRIC_VERSION
} from './six-dimension-rubric'

const DIMENSION_NAMES = [
  '专业能力与岗位匹配',
  '问题分析与解决能力',
  '项目经历与成果证据',
  '沟通表达与结构',
  '协作与推动能力',
  '学习适应与成长性'
] as const

/** @brief 构造六维 Scenario 与打乱顺序的真实 Report fixture / Build a six-dimension Scenario and a Report whose scores are deliberately shuffled. */
function sixDimensionFixture(): {
  readonly report: UiInterviewReport
  readonly scenario: UiInterviewScenario
} {
  const dimensions = SIX_DIMENSION_IDS.map((dimensionId, index): UiInterviewRubricDimension => {
    const name = DIMENSION_NAMES[index] ?? '未知维度'
    return {
      description: `${name}的可观察表现。`,
      dimensionId,
      name,
      observableIndicators: [`${name}证据`],
      scoringScale: { maximum: 100, minimum: 0 },
      weight: [0.25, 0.2, 0.15, 0.15, 0.15, 0.1][index] ?? 0.1
    }
  })
  const scenario: UiInterviewScenario = {
    allowBargeIn: true,
    allowFollowups: true,
    createdAt: '2026-07-27T00:00:00.000Z',
    description: '六维面试测试场景。',
    difficulty: 'intermediate',
    durationMinutes: 20,
    focusAreas: ['专业能力', '问题解决', '项目证据', '沟通表达', '协作推动', '学习成长'],
    id: asUiOpaqueId<'interview-scenario'>('scenario_six_dimension_test'),
    interviewType: asUiInterviewType('general'),
    locale: 'zh-CN',
    name: '本地 Demo 六维面试',
    revision: 1,
    rubric: {
      dimensions,
      name: '本地 Demo 六维面试量表',
      overallScale: { maximum: 100, minimum: 0 },
      rubricId: SIX_DIMENSION_RUBRIC_ID,
      rubricVersion: SIX_DIMENSION_RUBRIC_VERSION
    },
    status: 'active',
    targetQuestionCount: 6,
    updatedAt: '2026-07-27T00:00:00.000Z',
    workspaceId: asUiOpaqueId<'workspace'>('workspace_six_dimension_test')
  }
  const scores = SIX_DIMENSION_IDS.map((dimensionId, index) => ({
    confidence: 0.8,
    dimensionId,
    evidence: [],
    improvementActions: [],
    score: [91, 82, 73, 64, 55, 46][index] ?? 0,
    summary: { plainText: `${DIMENSION_NAMES[index] ?? '未知维度'}评分说明。` }
  })).reverse()
  return {
    report: {
      actionPlan: [],
      communicationMetrics: {
        averageAnswerLengthMs: 12_000,
        fillerWordCount: null,
        interruptionCount: null,
        longPauseCount: null,
        notes: [],
        speakingTimeMs: 72_000,
        wordsPerMinute: null
      },
      createdAt: '2026-07-27T00:10:00.000Z',
      engineVersion: 'model-route:test',
      executiveSummary: { plainText: '六维评分测试报告。' },
      generatedAt: '2026-07-27T00:10:00.000Z',
      id: asUiOpaqueId<'interview-report'>('report_six_dimension_test'),
      improvements: [],
      limitations: [],
      overallConfidence: 0.8,
      overallScore: 74,
      reportVersion: '1',
      revision: 1,
      rubricRef: {
        id: SIX_DIMENSION_RUBRIC_ID,
        version: SIX_DIMENSION_RUBRIC_VERSION
      },
      rubricScores: scores,
      sessionId: asUiOpaqueId<'interview-session'>('session_six_dimension_test'),
      strengths: [],
      updatedAt: '2026-07-27T00:10:00.000Z',
      workspaceId: scenario.workspaceId
    },
    scenario
  }
}

beforeAll(async (): Promise<void> => {
  await appI18nReady
  await appI18n.changeLanguage('zh-SG')
})

describe('InterviewSixDimensionRadar', (): void => {
  it('按冻结 Rubric 顺序展示六项真实分数和可访问 SVG', (): void => {
    const { report, scenario } = sixDimensionFixture()

    render(
      <I18nextProvider i18n={appI18n}>
        <InterviewSixDimensionRadar report={report} scenario={scenario} />
      </I18nextProvider>
    )

    expect(screen.getByRole('heading', { name: '六维能力图' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '本次面试六维能力雷达图' })).toBeInTheDocument()
    const scores = screen.getByRole('list', { name: '六项能力分数' })
    expect(scores).toHaveTextContent('专业能力与岗位匹配91 / 100')
    expect(scores).toHaveTextContent('学习适应与成长性46 / 100')
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '专业能力与岗位匹配91 / 100',
      '问题分析与解决能力82 / 100',
      '项目经历与成果证据73 / 100',
      '沟通表达与结构64 / 100',
      '协作与推动能力55 / 100',
      '学习适应与成长性46 / 100'
    ])
  })

  it('拒绝缺失维度和历史一维或二维报告，不补默认分', (): void => {
    const { report, scenario } = sixDimensionFixture()
    expect(
      buildSixDimensionRadarModel(
        { ...report, rubricScores: report.rubricScores.slice(0, 5) },
        scenario
      )
    ).toBeNull()

    const historicalRubricId = asUiOpaqueId<'interview-rubric'>('rubric_historical_test')
    const historicalScenario: UiInterviewScenario = {
      ...scenario,
      rubric: {
        ...scenario.rubric,
        dimensions: scenario.rubric.dimensions.slice(0, 2),
        rubricId: historicalRubricId,
        rubricVersion: 'historical'
      }
    }
    const historicalReport: UiInterviewReport = {
      ...report,
      rubricRef: { id: historicalRubricId, version: 'historical' },
      rubricScores: report.rubricScores.slice(0, 2)
    }
    const { container } = render(
      <I18nextProvider i18n={appI18n}>
        <InterviewSixDimensionRadar report={historicalReport} scenario={historicalScenario} />
      </I18nextProvider>
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('将 0 分放在中心、100 分放在第一轴外圈', (): void => {
    expect(radarPoint(0, 0)).toEqual({ x: 210, y: 210 })
    const top = radarPoint(0, 100)
    expect(top.x).toBeCloseTo(210)
    expect(top.y).toBeCloseTo(84)
  })
})
