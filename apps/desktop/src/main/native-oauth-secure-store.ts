/** @file Electron safeStorage 支持的原子 Refresh Token store / Atomic Refresh Token store backed by Electron safeStorage. */

import { constants } from 'node:fs'
import { chmod, lstat, mkdir, open, rename, unlink } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import path from 'node:path'

import {
  API_V2_OAUTH_ISSUER,
  API_V2_OAUTH_JWKS_URI
} from '@ai-job-workspace/product-api-v2/native-oauth'

import type { NativeRefreshGrantStore, NativeStoredRefreshGrant } from './native-oauth-session'

/** @brief 加密记录 schema version / Encrypted-record schema version. */
const SECURE_GRANT_VERSION = 1

/** @brief 加密前 JSON 最大字符数 / Maximum JSON characters before encryption. */
const MAX_PLAINTEXT_CHARACTERS = 64 * 1024

/** @brief 磁盘密文最大字节数 / Maximum ciphertext bytes on disk. */
const MAX_CIPHERTEXT_BYTES = 256 * 1024

/** @brief Electron async safeStorage 的最小端口 / Minimum Electron async-safeStorage port. */
export interface NativeSafeStoragePort {
  /** @brief 异步解密并报告密钥轮换 / Decrypt asynchronously and report key rotation. */
  readonly decryptStringAsync: (
    encrypted: Buffer
  ) => Promise<{ readonly result: string; readonly shouldReEncrypt: boolean }>
  /** @brief 异步加密字符串 / Encrypt a string asynchronously. */
  readonly encryptStringAsync: (plainText: string) => Promise<Buffer>
  /** @brief 当前 async provider 是否可用 / Whether the current async provider is available. */
  readonly isAsyncEncryptionAvailable: () => Promise<boolean>
}

/** @brief POSIX metadata access used by the secure-storage ownership policy. */
export interface NativePosixMetadataPort {
  /** @brief Current POSIX user ID, or undefined when the runtime cannot prove it. */
  readonly currentUserId: () => number | undefined
  /** @brief Owner UID from file metadata. */
  readonly ownerUserId: (metadata: Stats) => number
  /** @brief POSIX permission bits from file metadata. */
  readonly permissions: (metadata: Stats) => number
}

/** @brief Real process-backed POSIX metadata policy used in production. */
const nativePosixMetadata: NativePosixMetadataPort = Object.freeze({
  currentUserId: () => (typeof process.getuid === 'function' ? process.getuid() : undefined),
  ownerUserId: (metadata: Stats) => metadata.uid,
  permissions: (metadata: Stats) => metadata.mode
})

/** @brief Directory durability operation used after same-directory file entry changes. */
export interface NativeDirectorySyncPort {
  /** @brief Persist directory-entry metadata for a controlled directory. */
  readonly sync: (directoryPath: string) => Promise<void>
}

/** @brief Real directory fsync implementation used in production. */
const nativeDirectorySync: NativeDirectorySyncPort = Object.freeze({
  sync: async (directoryPath: string) => {
    const directory = await open(directoryPath, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0))
    try {
      await directory.sync()
    } finally {
      await directory.close()
    }
  }
})

/** @brief Electron secure grant store 构造选项 / Construction options for the Electron secure grant store. */
export interface ElectronNativeRefreshGrantStoreOptions {
  /** @brief Electron app userData 目录 / Electron app userData directory. */
  readonly userDataDirectory: string
  /** @brief Electron async safeStorage adapter / Electron async-safeStorage adapter. */
  readonly safeStorage: NativeSafeStoragePort
  /** @brief 当前 Node 平台；测试可替换 / Current Node platform, replaceable in tests. */
  readonly platform?: NodeJS.Platform | undefined
  /** @brief POSIX metadata policy; production defaults to process and Stats metadata. */
  readonly posixMetadata?: NativePosixMetadataPort | undefined
  /** @brief Directory durability policy; production defaults to directory fsync. */
  readonly directorySync?: NativeDirectorySyncPort | undefined
}

/** @brief Native secure storage 不可用的低基数原因 / Low-cardinality reason for unavailable native secure storage. */
export type NativeSecureStorageUnavailableReason =
  'persistent-login-unsupported' | 'temporarily-unavailable'

/** @brief Electron async secure storage 当前不可用 / Electron async secure storage is currently unavailable. */
export class NativeSecureStorageUnavailableError extends Error {
  override readonly name = 'NativeSecureStorageUnavailableError'
  /** @brief 不暴露 provider 细节的低基数原因 / Low-cardinality reason exposing no provider detail. */
  readonly reason: NativeSecureStorageUnavailableReason

  /**
   * @brief 构造不暴露 provider 细节的安全错误 / Construct a safe error without provider details.
   * @param reason 安全存储不可用原因 / Secure-storage unavailability reason.
   */
  constructor(reason: NativeSecureStorageUnavailableReason = 'temporarily-unavailable') {
    super(
      reason === 'persistent-login-unsupported'
        ? 'Persistent native OAuth login is unsupported on this platform.'
        : 'OS-backed secure storage is unavailable for native OAuth.'
    )
    this.reason = reason
  }
}

/** @brief 加密 Refresh Token 记录损坏 / The encrypted Refresh Token record is corrupt. */
export class NativeSecureStorageCorruptError extends Error {
  override readonly name = 'NativeSecureStorageCorruptError'

  /** @brief 构造不反射密文或明文的安全错误 / Construct a safe error that reflects neither ciphertext nor plaintext. */
  constructor() {
    super('The native OAuth secure-storage record is corrupt.')
  }
}

/**
 * @brief 把未知值严格收窄为普通对象 / Narrow an unknown value to a plain record.
 * @param value 未经信任值 / Untrusted value.
 * @param keys 允许的精确字段 / Exact allowed fields.
 * @return 精确字段对象 / Exact-field record.
 */
function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new NativeSecureStorageCorruptError()
  }
  /** @brief 待校验对象 / Record under validation. */
  const record = value as Record<string, unknown>
  /** @brief 实际字段 / Actual fields. */
  const actualKeys = Object.keys(record)
  if (actualKeys.length !== keys.length || actualKeys.some((key) => !keys.includes(key))) {
    throw new NativeSecureStorageCorruptError()
  }
  return record
}

/**
 * @brief 读取有界非空字符串 / Read a bounded non-empty string.
 * @param value 未经信任值 / Untrusted value.
 * @param maximumLength 最大字符数 / Maximum character count.
 * @return 已验证字符串 / Validated string.
 */
function boundedString(value: unknown, maximumLength: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) {
    throw new NativeSecureStorageCorruptError()
  }
  return value
}

/**
 * @brief 读取非负安全整数 / Read a non-negative safe integer.
 * @param value 未经信任值 / Untrusted value.
 * @return 已验证整数 / Validated integer.
 */
function nonNegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new NativeSecureStorageCorruptError()
  }
  return value as number
}

/**
 * @brief 读取有界唯一字符串数组 / Read a bounded unique string array.
 * @param value 未经信任值 / Untrusted value.
 * @param maximumItems 最大元素数 / Maximum item count.
 * @return 冻结字符串数组 / Frozen string array.
 */
function stringArray(value: unknown, maximumItems: number): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximumItems) {
    throw new NativeSecureStorageCorruptError()
  }
  /** @brief 已验证字符串元素 / Validated string items. */
  const values = value.map((item) => boundedString(item, 255))
  if (new Set(values).size !== values.length) throw new NativeSecureStorageCorruptError()
  return Object.freeze(values)
}

/**
 * @brief 严格解析解密后的长期授权 JSON / Strictly parse decrypted long-lived-grant JSON.
 * @param plainText safeStorage 返回的明文 / Plaintext returned by safeStorage.
 * @return 完整 native grant / Complete native grant.
 */
export function parseNativeRefreshGrantRecord(plainText: string): NativeStoredRefreshGrant {
  if (plainText.length === 0 || plainText.length > MAX_PLAINTEXT_CHARACTERS) {
    throw new NativeSecureStorageCorruptError()
  }
  /** @brief 未经信任的 JSON 值 / Untrusted JSON value. */
  let value: unknown
  try {
    value = JSON.parse(plainText)
  } catch {
    throw new NativeSecureStorageCorruptError()
  }
  /** @brief 顶层加密记录 / Top-level encrypted record. */
  const record = exactRecord(value, [
    'version',
    'client_id',
    'refresh_token',
    'scopes',
    'identity',
    'verification_context'
  ])
  if (record.version !== SECURE_GRANT_VERSION) throw new NativeSecureStorageCorruptError()
  /** @brief 已验证身份对象 / Validated identity record. */
  const identity = exactRecord(record.identity, [
    'issuer',
    'subject',
    'audience',
    'authorized_party',
    'expires_at_epoch_seconds',
    'issued_at_epoch_seconds'
  ])
  /** @brief 已验证 refresh 验证上下文 / Validated refresh-verification context. */
  const context = exactRecord(record.verification_context, [
    'client_id',
    'issuer',
    'jwks_uri',
    'nonce',
    'allowed_algorithms'
  ])
  /** @brief public client ID / Public client ID. */
  const clientId = boundedString(record.client_id, 255)
  /** @brief 身份 issuer / Identity issuer. */
  const identityIssuer = boundedString(identity.issuer, 2048)
  /** @brief 验证上下文 issuer / Verification-context issuer. */
  const contextIssuer = boundedString(context.issuer, 2048)
  /** @brief 已验证 audience / Validated audience. */
  const audience = stringArray(identity.audience, 16)
  /** @brief 可选 authorized party / Optional authorized party. */
  const authorizedParty =
    identity.authorized_party === null ? null : boundedString(identity.authorized_party, 255)
  /** @brief 允许的签名算法 / Allowed signature algorithms. */
  const allowedAlgorithms = stringArray(context.allowed_algorithms, 2)
  if (
    identityIssuer !== API_V2_OAUTH_ISSUER ||
    contextIssuer !== API_V2_OAUTH_ISSUER ||
    context.client_id !== clientId ||
    context.jwks_uri !== API_V2_OAUTH_JWKS_URI ||
    !audience.includes(clientId) ||
    allowedAlgorithms.some((algorithm) => algorithm !== 'ES256' && algorithm !== 'RS256')
  ) {
    throw new NativeSecureStorageCorruptError()
  }
  return Object.freeze({
    clientId,
    identity: Object.freeze({
      audience,
      authorizedParty,
      expiresAtEpochSeconds: nonNegativeInteger(identity.expires_at_epoch_seconds),
      issuedAtEpochSeconds: nonNegativeInteger(identity.issued_at_epoch_seconds),
      issuer: identityIssuer,
      subject: boundedString(identity.subject, 2048)
    }),
    refreshToken: boundedString(record.refresh_token, 8192),
    scopes: stringArray(record.scopes, 64),
    verificationContext: Object.freeze({
      allowedAlgorithms,
      clientId,
      issuer: contextIssuer,
      jwksUri: API_V2_OAUTH_JWKS_URI,
      nonce: boundedString(context.nonce, 255)
    })
  })
}

/**
 * @brief 稳定序列化一个完整长期授权 / Serialize a complete long-lived grant deterministically.
 * @param grant 长期授权 / Long-lived grant.
 * @return 待 safeStorage 加密的 JSON / JSON awaiting safeStorage encryption.
 */
function serializeNativeRefreshGrantRecord(grant: NativeStoredRefreshGrant): string {
  /** @brief 稳定字段顺序的 JSON / JSON with stable field ordering. */
  const plainText = JSON.stringify({
    version: SECURE_GRANT_VERSION,
    client_id: grant.clientId,
    refresh_token: grant.refreshToken,
    scopes: grant.scopes,
    identity: {
      issuer: grant.identity.issuer,
      subject: grant.identity.subject,
      audience: grant.identity.audience,
      authorized_party: grant.identity.authorizedParty,
      expires_at_epoch_seconds: grant.identity.expiresAtEpochSeconds,
      issued_at_epoch_seconds: grant.identity.issuedAtEpochSeconds
    },
    verification_context: {
      client_id: grant.verificationContext.clientId,
      issuer: grant.verificationContext.issuer,
      jwks_uri: grant.verificationContext.jwksUri,
      nonce: grant.verificationContext.nonce,
      allowed_algorithms: grant.verificationContext.allowedAlgorithms
    }
  })
  if (plainText.length > MAX_PLAINTEXT_CHARACTERS) {
    throw new NativeSecureStorageCorruptError()
  }
  return plainText
}

/**
 * @brief 判断文件系统错误是否为 ENOENT / Determine whether a filesystem error is ENOENT.
 * @param error 未知错误 / Unknown error.
 * @return ENOENT 时为 true / True for ENOENT.
 */
function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'ENOENT'
  )
}

/** @brief Electron async safeStorage 的原子文件实现 / Atomic-file implementation for Electron async safeStorage. */
export class ElectronNativeRefreshGrantStore implements NativeRefreshGrantStore {
  /** @brief Electron async safeStorage / Electron async safeStorage. */
  private readonly safeStorage: NativeSafeStoragePort
  /** @brief 当前平台 / Current platform. */
  private readonly platform: NodeJS.Platform
  /** @brief POSIX ownership and permission metadata policy. */
  private readonly posixMetadata: NativePosixMetadataPort
  /** @brief Directory-entry durability policy. */
  private readonly directorySync: NativeDirectorySyncPort
  /** @brief Electron 创建且已解析的 userData 根目录 / Electron-created, resolved userData root directory. */
  private readonly userDataDirectory: string
  /** @brief 固定密文路径 / Fixed ciphertext path. */
  private readonly recordPath: string
  /** @brief 同目录固定 staging 路径 / Fixed same-directory staging path. */
  private readonly stagingPath: string
  /** @brief 记录目录 / Record directory. */
  private readonly directory: string

  /**
   * @brief 创建 OS-backed grant store / Construct an OS-backed grant store.
   * @param options userData、safeStorage 与平台 / userData, safeStorage, and platform.
   */
  constructor(options: ElectronNativeRefreshGrantStoreOptions) {
    this.safeStorage = options.safeStorage
    this.platform = options.platform ?? process.platform
    this.posixMetadata = options.posixMetadata ?? nativePosixMetadata
    this.directorySync = options.directorySync ?? nativeDirectorySync
    if (!path.isAbsolute(options.userDataDirectory)) {
      throw new TypeError('The native OAuth userData directory must be absolute.')
    }
    this.userDataDirectory = path.resolve(options.userDataDirectory)
    this.directory = path.resolve(this.userDataDirectory, 'oauth')
    /** @brief userData 到记录目录的相对路径 / Relative path from userData to the record directory. */
    const relativeDirectory = path.relative(this.userDataDirectory, this.directory)
    if (
      relativeDirectory.length === 0 ||
      relativeDirectory.startsWith(`..${path.sep}`) ||
      relativeDirectory === '..' ||
      path.isAbsolute(relativeDirectory)
    ) {
      throw new TypeError('The native OAuth storage directory escapes userData.')
    }
    this.recordPath = path.join(this.directory, 'refresh-grant.v1.bin')
    this.stagingPath = path.join(this.directory, 'refresh-grant.v1.next')
  }

  /**
   * @brief 确认 Electron async provider 当前可用 / Ensure the Electron async provider is currently available.
   * @return 可用性检查完成 / Resolves after the availability check.
   * @note 同步 getSelectedStorageBackend 不描述 async portal provider，不能用于推断其安全性 / The synchronous getSelectedStorageBackend API does not describe the async portal provider and cannot establish its security.
   */
  async ensureAvailable(): Promise<void> {
    if (this.platform === 'linux') {
      await this.clear()
      throw new NativeSecureStorageUnavailableError('persistent-login-unsupported')
    }
    /** @brief async provider 可用性 / Async-provider availability. */
    const available = await this.safeStorage.isAsyncEncryptionAvailable().catch(() => false)
    if (!available) throw new NativeSecureStorageUnavailableError()
  }

  /**
   * @brief 校验路径对象由当前用户拥有且类型正确 / Validate that a path object is correctly typed and owned by the current user.
   * @param metadata lstat/fstat 元数据 / Metadata returned by lstat or fstat.
   * @param expectedType 预期目录或普通文件 / Expected directory or regular-file type.
   * @return 无返回值 / No return value.
   */
  private assertSafeMetadata(metadata: Stats, expectedType: 'directory' | 'file'): void {
    if (
      metadata.isSymbolicLink() ||
      (expectedType === 'directory' ? !metadata.isDirectory() : !metadata.isFile())
    ) {
      throw new NativeSecureStorageCorruptError()
    }
    if (this.platform === 'win32') return
    /** @brief 当前 POSIX 用户 ID；不支持时为 undefined / Current POSIX user ID, or undefined when unsupported. */
    const currentUserId = this.posixMetadata.currentUserId()
    if (currentUserId === undefined || this.posixMetadata.ownerUserId(metadata) !== currentUserId) {
      throw new NativeSecureStorageCorruptError()
    }
    /** @brief 非 owner 权限位 / Permission bits available to group and others. */
    const mode = this.posixMetadata.permissions(metadata)
    const nonOwnerPermissions = mode & 0o077
    if (
      (expectedType === 'directory' && (mode & 0o022) !== 0) ||
      (expectedType === 'file' && nonOwnerPermissions !== 0)
    ) {
      throw new NativeSecureStorageCorruptError()
    }
  }

  /**
   * @brief 校验并按需创建专用 OAuth 目录 / Validate and optionally create the dedicated OAuth directory.
   * @param create 缺失时是否创建 / Whether to create the directory when absent.
   * @return 目录存在时为 true / True when the directory exists.
   */
  private async ensureDirectory(create: boolean): Promise<boolean> {
    /** @brief Electron userData 根目录元数据 / Electron userData root metadata. */
    const userDataMetadata = await lstat(this.userDataDirectory)
    this.assertSafeMetadata(userDataMetadata, 'directory')
    try {
      /** @brief 专用目录元数据 / Dedicated-directory metadata. */
      const metadata = await lstat(this.directory)
      this.assertSafeMetadata(metadata, 'directory')
    } catch (error: unknown) {
      if (!isMissingFile(error)) throw error
      if (!create) return false
      try {
        await mkdir(this.directory, { mode: 0o700, recursive: false })
      } catch (mkdirError: unknown) {
        if (
          typeof mkdirError !== 'object' ||
          mkdirError === null ||
          !('code' in mkdirError) ||
          (mkdirError as { readonly code?: unknown }).code !== 'EEXIST'
        ) {
          throw mkdirError
        }
      }
    }
    if (this.platform !== 'win32') await chmod(this.directory, 0o700)
    /** @brief 创建或加固后的目录元数据 / Directory metadata after creation or hardening. */
    const hardened = await lstat(this.directory)
    this.assertSafeMetadata(hardened, 'directory')
    if (this.platform !== 'win32' && (this.posixMetadata.permissions(hardened) & 0o777) !== 0o700) {
      throw new NativeSecureStorageCorruptError()
    }
    return true
  }

  /**
   * @brief 安全校验一个可选存储文件 / Safely validate an optional storage file.
   * @param filePath 固定受控路径 / Fixed controlled path.
   * @return 文件存在时为 true / True when the file exists.
   */
  private async validateOptionalFile(filePath: string): Promise<boolean> {
    try {
      /** @brief 路径本身的元数据 / Metadata for the path itself. */
      const metadata = await lstat(filePath)
      this.assertSafeMetadata(metadata, 'file')
      return true
    } catch (error: unknown) {
      if (isMissingFile(error)) return false
      throw error
    }
  }

  /**
   * @brief 删除一个已验证的精确受控文件 / Delete one validated exact controlled file.
   * @param filePath 固定受控路径 / Fixed controlled path.
   * @return 实际删除文件时为 true / True when a file was removed.
   */
  private async unlinkControlledFile(filePath: string): Promise<boolean> {
    if (!(await this.validateOptionalFile(filePath))) return false
    try {
      await unlink(filePath)
      return true
    } catch (error: unknown) {
      if (isMissingFile(error)) return false
      throw error
    }
  }

  /**
   * @brief 在支持目录 fsync 的平台持久化目录项变化 / Persist directory-entry changes on platforms supporting directory fsync.
   * @return 元数据持久化完成 / Resolves after metadata persistence.
   */
  private async syncDirectory(): Promise<void> {
    if (this.platform === 'win32') return
    await this.directorySync.sync(this.directory)
  }

  /**
   * @brief 把密文以同目录 fsync + rename 原子替换 / Atomically replace ciphertext using same-directory fsync and rename.
   * @param encrypted 新密文 / New ciphertext.
   */
  private async atomicReplace(encrypted: Buffer): Promise<void> {
    if (encrypted.byteLength === 0 || encrypted.byteLength > MAX_CIPHERTEXT_BYTES) {
      throw new NativeSecureStorageCorruptError()
    }
    await this.ensureDirectory(true)
    await this.unlinkControlledFile(this.stagingPath)
    await this.validateOptionalFile(this.recordPath)
    /** @brief 独占创建的 staging 文件 / Exclusively created staging file. */
    const file = await open(
      this.stagingPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
      0o600
    )
    try {
      /** @brief 独占打开后的 staging 元数据 / Staging metadata after exclusive open. */
      const metadata = await file.stat()
      this.assertSafeMetadata(metadata, 'file')
      await file.writeFile(encrypted)
      await file.sync()
    } finally {
      await file.close()
    }
    try {
      await rename(this.stagingPath, this.recordPath)
      await this.syncDirectory()
    } finally {
      await this.unlinkControlledFile(this.stagingPath).catch(() => undefined)
    }
  }

  /**
   * @brief 读取并解密长期授权 / Read and decrypt the long-lived grant.
   * @return 无记录或损坏且已清理时为 null / Null when absent or corrupt and cleared.
   */
  async read(): Promise<NativeStoredRefreshGrant | null> {
    await this.ensureAvailable()
    if (!(await this.ensureDirectory(false))) return null
    if (!(await this.validateOptionalFile(this.recordPath))) return null
    /** @brief 磁文文件 / Ciphertext file. */
    let encrypted: Buffer
    /** @brief 不跟随符号链接打开的密文 handle / Ciphertext handle opened without following symbolic links. */
    let file: FileHandle
    try {
      file = await open(this.recordPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    } catch (error: unknown) {
      if (isMissingFile(error)) return null
      throw error
    }
    try {
      /** @brief 打开后用于消除 lstat/open 竞态的元数据 / Post-open metadata eliminating the lstat/open race. */
      const metadata = await file.stat()
      this.assertSafeMetadata(metadata, 'file')
      if (metadata.size === 0 || metadata.size > MAX_CIPHERTEXT_BYTES) {
        await file.close()
        await this.clear()
        return null
      }
      encrypted = await file.readFile()
    } finally {
      await file.close().catch(() => undefined)
    }
    try {
      /** @brief 首次异步解密结果 / First asynchronous decryption result. */
      let decrypted = await this.safeStorage.decryptStringAsync(encrypted)
      /** @brief provider 是否要求用当前 key 重写记录 / Whether the provider asks to rewrite the record with the current key. */
      const shouldReEncrypt = decrypted.shouldReEncrypt
      if (shouldReEncrypt) {
        decrypted = await this.safeStorage.decryptStringAsync(encrypted)
      }
      /** @brief 严格解析的长期授权 / Strictly parsed long-lived grant. */
      const grant = parseNativeRefreshGrantRecord(decrypted.result)
      if (shouldReEncrypt) {
        /** @brief 使用当前 provider key 重新加密的密文 / Ciphertext re-encrypted with the current provider key. */
        const rotated = await this.safeStorage.encryptStringAsync(decrypted.result)
        try {
          await this.atomicReplace(rotated)
        } finally {
          rotated.fill(0)
        }
      }
      return grant
    } catch (error: unknown) {
      if (error instanceof NativeSecureStorageUnavailableError) throw error
      await this.clear()
      return null
    } finally {
      encrypted.fill(0)
    }
  }

  /**
   * @brief 加密并原子替换完整长期授权 / Encrypt and atomically replace the complete long-lived grant.
   * @param grant 已验证授权 / Validated grant.
   */
  async replace(grant: NativeStoredRefreshGrant): Promise<void> {
    await this.ensureAvailable()
    /** @brief 不离开 main 进程的短生命明文 / Short-lived plaintext confined to main. */
    const plainText = serializeNativeRefreshGrantRecord(grant)
    /** @brief OS-backed 密文 / OS-backed ciphertext. */
    const encrypted = await this.safeStorage.encryptStringAsync(plainText)
    try {
      await this.atomicReplace(encrypted)
    } finally {
      encrypted.fill(0)
    }
  }

  /** @brief 删除精确的密文与 staging 文件 / Delete the exact ciphertext and staging file. */
  async clear(): Promise<void> {
    if (!(await this.ensureDirectory(false))) return
    /** @brief 是否改变了目录项 / Whether a directory entry changed. */
    let changed = false
    try {
      changed = (await this.unlinkControlledFile(this.recordPath)) || changed
      changed = (await this.unlinkControlledFile(this.stagingPath)) || changed
    } finally {
      if (changed) await this.syncDirectory()
    }
  }
}
