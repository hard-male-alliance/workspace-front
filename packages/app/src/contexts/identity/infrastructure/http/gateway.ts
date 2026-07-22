/** @file Identity 正式 v1 HTTP Gateway / Production v1 HTTP Gateway for Identity. */

import type { IdentityGateway } from '../../application/gateway'
import type { UiCurrentUser } from '../../domain/models'
import type { HttpClient } from '../../../../infrastructure/http/http-client'
import { mapCurrentUserDto } from './mappers'
import { parseCurrentUserDto } from './validators'

/** @brief Identity v1 HTTP Gateway / Identity v1 HTTP Gateway. */
export class HttpIdentityGateway implements IdentityGateway {
  /** @brief 共享 HTTP client / Shared HTTP client. */
  readonly #client: HttpClient

  /**
   * @brief 构造 Identity HTTP Gateway / Construct an Identity HTTP Gateway.
   * @param client 共享产品 HTTP client / Shared product HTTP client.
   */
  constructor(client: HttpClient) {
    this.#client = client
  }

  /** @inheritdoc */
  async loadCurrentUser(): Promise<UiCurrentUser> {
    /** @brief 当前用户 HTTP 响应 / Current-user HTTP response. */
    const response = await this.#client.getJson('/me')
    return mapCurrentUserDto(parseCurrentUserDto(response.data))
  }
}
