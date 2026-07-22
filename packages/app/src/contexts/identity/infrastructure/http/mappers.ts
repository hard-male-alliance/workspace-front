/** @file Identity v1 HTTP DTO 到领域投影的映射 / Mapping from Identity v1 HTTP DTOs to domain projections. */

import type { UiCurrentUser } from '../../domain/models'
import { asUiOpaqueId } from '../../../../shared-kernel/identity'
import type { CurrentUserDto } from './transport-types'

/**
 * @brief 将当前用户 DTO 映射为领域投影 / Map a current-user DTO to a domain projection.
 * @param currentUser 当前用户 DTO / Current-user DTO.
 * @return 当前用户领域投影 / Current-user domain projection.
 */
export function mapCurrentUserDto(currentUser: CurrentUserDto): UiCurrentUser {
  return {
    defaultWorkspaceId:
      currentUser.default_workspace_id === null
        ? null
        : asUiOpaqueId<'workspace'>(currentUser.default_workspace_id),
    displayName: currentUser.display_name,
    id: asUiOpaqueId<'user'>(currentUser.id),
    locale: currentUser.locale,
    timezone: currentUser.timezone
  }
}
