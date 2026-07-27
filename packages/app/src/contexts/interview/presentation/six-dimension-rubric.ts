import { asUiOpaqueId } from '../../../shared-kernel/identity'

/** @brief 六维 Demo 场景的稳定 Rubric identity / Stable Rubric identity for the six-dimension Demo scenario. */
export const SIX_DIMENSION_RUBRIC_ID = asUiOpaqueId<'interview-rubric'>(
  'rubric_demo_general_six_dimension'
)

/** @brief 六维 Demo 场景的不可变 Rubric 版本 / Immutable Rubric version for the six-dimension Demo scenario. */
export const SIX_DIMENSION_RUBRIC_VERSION = '1.0'

/** @brief 六维评分的稳定维度 identities，顺序同时定义雷达轴顺序 / Stable dimension identities whose order also defines the radar axes. */
export const SIX_DIMENSION_IDS = [
  asUiOpaqueId<'interview-rubric-dimension'>('rubric_dimension_role_competency'),
  asUiOpaqueId<'interview-rubric-dimension'>('rubric_dimension_problem_solving'),
  asUiOpaqueId<'interview-rubric-dimension'>('rubric_dimension_project_evidence'),
  asUiOpaqueId<'interview-rubric-dimension'>('rubric_dimension_communication'),
  asUiOpaqueId<'interview-rubric-dimension'>('rubric_dimension_collaboration'),
  asUiOpaqueId<'interview-rubric-dimension'>('rubric_dimension_growth')
] as const
