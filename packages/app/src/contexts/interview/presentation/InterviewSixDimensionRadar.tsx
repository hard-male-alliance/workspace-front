import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import type {
  UiInterviewReport,
  UiInterviewRubricDimension,
  UiInterviewRubricScore,
  UiInterviewScenario
} from '../domain/models'
import {
  SIX_DIMENSION_IDS,
  SIX_DIMENSION_RUBRIC_ID,
  SIX_DIMENSION_RUBRIC_VERSION
} from './six-dimension-rubric'

const RADAR_CENTER = 210
const RADAR_RADIUS = 126
const RADAR_LABEL_RADIUS = 172
const RADAR_LEVELS = [20, 40, 60, 80, 100] as const

/** @brief 一个经过完整 Rubric/Report 交叉核验的六维分数 / One six-dimension score cross-checked against the complete Rubric and Report. */
export interface SixDimensionRadarItem {
  readonly dimension: UiInterviewRubricDimension
  readonly score: UiInterviewRubricScore
}

/** @brief 可安全绘制的六维雷达模型 / Six-dimension radar model safe to render. */
export interface SixDimensionRadarModel {
  readonly items: readonly [
    SixDimensionRadarItem,
    SixDimensionRadarItem,
    SixDimensionRadarItem,
    SixDimensionRadarItem,
    SixDimensionRadarItem,
    SixDimensionRadarItem
  ]
}

/** @brief SVG 平面点 / Point in the SVG plane. */
export interface RadarPoint {
  readonly x: number
  readonly y: number
}

/**
 * @brief 计算六轴雷达图上的一点 / Calculate one point on a six-axis radar.
 * @param index 从正上方顺时针的轴序号 / Clockwise axis index starting at the top.
 * @param value 0–100 值 / Value from 0 through 100.
 * @param radius 图形最大半径 / Maximum chart radius.
 * @return SVG 坐标 / SVG coordinates.
 */
export function radarPoint(index: number, value: number, radius = RADAR_RADIUS): RadarPoint {
  const angle = (-90 + index * 60) * (Math.PI / 180)
  const scaledRadius = radius * (value / 100)
  return {
    x: RADAR_CENTER + scaledRadius * Math.cos(angle),
    y: RADAR_CENTER + scaledRadius * Math.sin(angle)
  }
}

/** @brief 将一组点序列化为 SVG polygon points / Serialize points for an SVG polygon. */
function polygonPoints(points: readonly RadarPoint[]): string {
  return points.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
}

/**
 * @brief 只接受冻结六维 Rubric 的完整、唯一、0–100 Report 分数 / Accept only complete, unique 0–100 scores for the frozen six-dimension Rubric.
 * @param report 后端持久化报告 / Persisted backend Report.
 * @param scenario Session 绑定场景 / Scenario bound to the Session.
 * @return 可绘制模型；任一事实不成立时为空 / Renderable model, or null when any fact fails.
 */
export function buildSixDimensionRadarModel(
  report: UiInterviewReport,
  scenario: UiInterviewScenario
): SixDimensionRadarModel | null {
  if (
    report.rubricRef.id !== scenario.rubric.rubricId ||
    report.rubricRef.version !== scenario.rubric.rubricVersion ||
    scenario.rubric.rubricId !== SIX_DIMENSION_RUBRIC_ID ||
    scenario.rubric.rubricVersion !== SIX_DIMENSION_RUBRIC_VERSION ||
    scenario.rubric.dimensions.length !== SIX_DIMENSION_IDS.length ||
    report.rubricScores.length !== SIX_DIMENSION_IDS.length
  ) {
    return null
  }

  const dimensions = new Map(
    scenario.rubric.dimensions.map((dimension) => [dimension.dimensionId, dimension])
  )
  const scores = new Map(report.rubricScores.map((score) => [score.dimensionId, score]))
  if (dimensions.size !== SIX_DIMENSION_IDS.length || scores.size !== SIX_DIMENSION_IDS.length) {
    return null
  }

  const items = SIX_DIMENSION_IDS.map((dimensionId): SixDimensionRadarItem | null => {
    const dimension = dimensions.get(dimensionId)
    const score = scores.get(dimensionId)
    if (
      dimension === undefined ||
      score === undefined ||
      dimension.scoringScale.minimum !== 0 ||
      dimension.scoringScale.maximum !== 100 ||
      !Number.isFinite(score.score) ||
      score.score < 0 ||
      score.score > 100
    ) {
      return null
    }
    return { dimension, score }
  })
  const [roleCompetency, problemSolving, projectEvidence, communication, collaboration, growth] =
    items
  if (
    roleCompetency === null ||
    roleCompetency === undefined ||
    problemSolving === null ||
    problemSolving === undefined ||
    projectEvidence === null ||
    projectEvidence === undefined ||
    communication === null ||
    communication === undefined ||
    collaboration === null ||
    collaboration === undefined ||
    growth === null ||
    growth === undefined
  ) {
    return null
  }
  return {
    items: [roleCompetency, problemSolving, projectEvidence, communication, collaboration, growth]
  }
}

/** @brief 保留整数，非整数最多展示一位小数 / Preserve integers and show at most one decimal otherwise. */
function formatDimensionScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/** @brief 转录下方的真实六维评分与 SVG 图 / Real six-dimension scores and SVG chart below the Transcript. */
export function InterviewSixDimensionRadar({
  report,
  scenario
}: {
  readonly report: UiInterviewReport
  readonly scenario: UiInterviewScenario
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const titleId = useId()
  const descriptionId = useId()
  const model = buildSixDimensionRadarModel(report, scenario)
  if (model === null) return null

  const shortLabels = [
    t('interviewSummary.sixDimension.short.roleCompetency', {
      defaultValue: '专业能力'
    }),
    t('interviewSummary.sixDimension.short.problemSolving', {
      defaultValue: '问题解决'
    }),
    t('interviewSummary.sixDimension.short.projectEvidence', {
      defaultValue: '项目证据'
    }),
    t('interviewSummary.sixDimension.short.communication', {
      defaultValue: '沟通表达'
    }),
    t('interviewSummary.sixDimension.short.collaboration', {
      defaultValue: '协作推动'
    }),
    t('interviewSummary.sixDimension.short.growth', {
      defaultValue: '学习成长'
    })
  ] as const
  const scoreDescription = model.items
    .map(({ dimension, score }) => `${dimension.name} ${formatDimensionScore(score.score)} / 100`)
    .join('；')
  const scorePolygon = polygonPoints(
    model.items.map(({ score }, index) => radarPoint(index, score.score))
  )

  return (
    <section
      className="aw-summary-section aw-six-dimension-report"
      data-testid="interview-six-dimension-report"
    >
      <div className="aw-section-heading">
        <div>
          <h2>
            {t('interviewSummary.sixDimension.title', {
              defaultValue: '六维能力图'
            })}
          </h2>
          <p>
            {t('interviewSummary.sixDimension.description', {
              defaultValue: '分数来自本次面试的持久化转录和冻结评分量表。'
            })}
          </p>
        </div>
      </div>
      <div className="aw-six-dimension-layout">
        <svg
          aria-describedby={descriptionId}
          aria-labelledby={titleId}
          className="aw-six-dimension-chart"
          role="img"
          viewBox="0 0 420 420"
        >
          <title id={titleId}>
            {t('interviewSummary.sixDimension.chartTitle', {
              defaultValue: '本次面试六维能力雷达图'
            })}
          </title>
          <desc id={descriptionId}>{scoreDescription}</desc>
          {RADAR_LEVELS.map((level) => (
            <polygon
              className="aw-six-dimension-grid"
              key={level}
              points={polygonPoints(
                SIX_DIMENSION_IDS.map((_dimensionId, index) => radarPoint(index, level))
              )}
            />
          ))}
          {SIX_DIMENSION_IDS.map((_dimensionId, index) => {
            const edge = radarPoint(index, 100)
            return (
              <line
                className="aw-six-dimension-axis"
                key={index}
                x1={RADAR_CENTER}
                x2={edge.x}
                y1={RADAR_CENTER}
                y2={edge.y}
              />
            )
          })}
          <polygon className="aw-six-dimension-score-shape" points={scorePolygon} />
          {model.items.map(({ score }, index) => {
            const point = radarPoint(index, score.score)
            return (
              <circle
                className="aw-six-dimension-score-point"
                cx={point.x}
                cy={point.y}
                key={score.dimensionId}
                r="4"
              />
            )
          })}
          {shortLabels.map((label, index) => {
            const point = radarPoint(index, 100, RADAR_LABEL_RADIUS)
            const textAnchor =
              point.x < RADAR_CENTER - 8 ? 'end' : point.x > RADAR_CENTER + 8 ? 'start' : 'middle'
            return (
              <text
                className="aw-six-dimension-axis-label"
                dominantBaseline="middle"
                key={SIX_DIMENSION_IDS[index]}
                textAnchor={textAnchor}
                x={point.x}
                y={point.y}
              >
                {label}
              </text>
            )
          })}
        </svg>
        <ol
          aria-label={t('interviewSummary.sixDimension.scoreList', {
            defaultValue: '六项能力分数'
          })}
          className="aw-six-dimension-scores"
        >
          {model.items.map(({ dimension, score }) => (
            <li key={dimension.dimensionId}>
              <span>{dimension.name}</span>
              <strong>{formatDimensionScore(score.score)} / 100</strong>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
