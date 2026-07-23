import { chmod, lstat, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  API_V2_OAUTH_ISSUER,
  API_V2_OAUTH_JWKS_URI
} from '@ai-job-workspace/product-api-v2/native-oauth'

import {
  ElectronNativeRefreshGrantStore,
  NativeSecureStorageUnavailableError,
  type NativeSafeStoragePort
} from './native-oauth-secure-store'
import type { NativeStoredRefreshGrant } from './native-oauth-session'

/** @brief 每个测试创建的临时目录 / Temporary directories created by each test. */
const temporaryDirectories: string[] = []

/** @brief CI 上用于测试可持久 provider 路径的平台 / Platform used to exercise persistent-provider paths in CI. */
const persistentTestPlatform: NodeJS.Platform =
  process.platform === 'linux' ? 'darwin' : process.platform

afterEach(async (): Promise<void> => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  )
})

/** @brief 创建测试 userData 目录 / Create a test userData directory. */
async function createUserDataDirectory(): Promise<string> {
  /** @brief 唯一临时目录 / Unique temporary directory. */
  const directory = await mkdtemp(path.join(os.tmpdir(), 'workspace-oauth-store-'))
  temporaryDirectories.push(directory)
  return directory
}

/**
 * @brief 创建有效持久授权 / Create a valid persisted grant.
 * @param refreshToken 测试 Refresh Token / Test Refresh Token.
 * @return 完整授权 / Complete grant.
 */
function grant(refreshToken: string): NativeStoredRefreshGrant {
  return {
    clientId: 'desktop-client',
    identity: {
      audience: ['desktop-client'],
      authorizedParty: null,
      expiresAtEpochSeconds: 20_000,
      issuedAtEpochSeconds: 10_000,
      issuer: API_V2_OAUTH_ISSUER,
      subject: 'subject-1'
    },
    refreshToken,
    scopes: ['openid', 'offline_access', 'workspace.read'],
    verificationContext: {
      allowedAlgorithms: ['RS256'],
      clientId: 'desktop-client',
      issuer: API_V2_OAUTH_ISSUER,
      jwksUri: API_V2_OAUTH_JWKS_URI,
      nonce: 'nonce-with-enough-entropy-for-test'
    }
  }
}

/** @brief 可控制的无保密测试 cryptography / Controllable non-secret test cryptography. */
class TestSafeStorage implements NativeSafeStoragePort {
  /** @brief provider 可用性 / Provider availability. */
  available = true
  /** @brief 下一次加密是否失败 / Whether the next encryption fails. */
  failEncryption = false
  /** @brief 是否返回损坏明文 / Whether to return corrupt plaintext. */
  corruptDecryption = false
  /** @brief 首次解密是否要求 key rotation / Whether first decryption requests key rotation. */
  requestReEncryption = false
  /** @brief 解密调用次数 / Decryption call count. */
  decryptCalls = 0
  /** @brief 加密调用 spy / Encryption-call spy. */
  readonly encryptSpy = vi.fn()

  /** @brief 返回配置的 async 可用性 / Return configured async availability. */
  isAsyncEncryptionAvailable(): Promise<boolean> {
    return Promise.resolve(this.available)
  }

  /** @brief UTF-8 编码测试明文 / UTF-8 encode test plaintext. */
  encryptStringAsync(plainText: string): Promise<Buffer> {
    this.encryptSpy(plainText)
    if (this.failEncryption) return Promise.reject(new Error('injected encryption failure'))
    return Promise.resolve(Buffer.from(plainText, 'utf8'))
  }

  /** @brief UTF-8 解码测试密文 / UTF-8 decode test ciphertext. */
  decryptStringAsync(
    encrypted: Buffer
  ): Promise<{ readonly result: string; readonly shouldReEncrypt: boolean }> {
    this.decryptCalls += 1
    return Promise.resolve({
      result: this.corruptDecryption ? '{not-json' : encrypted.toString('utf8'),
      shouldReEncrypt: this.requestReEncryption && this.decryptCalls === 1
    })
  }
}

describe('ElectronNativeRefreshGrantStore', (): void => {
  it('构造时拒绝相对 userData 路径', (): void => {
    expect(
      () =>
        new ElectronNativeRefreshGrantStore({
          safeStorage: new TestSafeStorage(),
          userDataDirectory: 'relative-user-data'
        })
    ).toThrow('must be absolute')
  })

  it('在 OS async encryption 不可用时失败关闭', async (): Promise<void> => {
    /** @brief 不可用 provider / Unavailable provider. */
    const safeStorage = new TestSafeStorage()
    safeStorage.available = false
    /** @brief 待测 store / Store under test. */
    const store = new ElectronNativeRefreshGrantStore({
      platform: 'darwin',
      safeStorage,
      userDataDirectory: await createUserDataDirectory()
    })

    await expect(store.replace(grant('refresh-token-a-000000000000'))).rejects.toBeInstanceOf(
      NativeSecureStorageUnavailableError
    )
  })

  it.each(['basic_text', 'kwallet6'])(
    'Linux 不用同步 %s backend 或 async available 冒充可证明的 secret provider',
    async (backend): Promise<void> => {
      /** @brief async 报告可用但无法证明供应者身份的 provider / Provider reporting async availability without attestable provider identity. */
      const safeStorage = new TestSafeStorage()
      /** @brief Linux 策略不应查询的 async 可用性 / Async availability that the Linux policy must not query. */
      const asyncAvailability = vi.spyOn(safeStorage, 'isAsyncEncryptionAvailable')
      /** @brief 不应被 async store 查询的同步 API / Synchronous API that the async store must not query. */
      const synchronousBackend = vi.fn(() => backend)
      Object.assign(safeStorage, { getSelectedStorageBackend: synchronousBackend })
      /** @brief 待测 store / Store under test. */
      const store = new ElectronNativeRefreshGrantStore({
        platform: 'linux',
        safeStorage,
        userDataDirectory: await createUserDataDirectory()
      })

      await expect(store.ensureAvailable()).rejects.toMatchObject({
        reason: 'persistent-login-unsupported'
      })
      expect(asyncAvailability).not.toHaveBeenCalled()
      expect(synchronousBackend).not.toHaveBeenCalled()
    }
  )

  it('Linux fail-closed 会清理无法证明 provider 的旧 v10 密文', async (): Promise<void> => {
    /** @brief 含旧 Chromium v10 密文的 userData / User data containing legacy Chromium v10 ciphertext. */
    const userDataDirectory = await createUserDataDirectory()
    /** @brief 受控 OAuth 目录 / Controlled OAuth directory. */
    const oauthDirectory = path.join(userDataDirectory, 'oauth')
    /** @brief 旧密文路径 / Legacy ciphertext path. */
    const recordPath = path.join(oauthDirectory, 'refresh-grant.v1.bin')
    await mkdir(oauthDirectory, { mode: 0o700 })
    await writeFile(recordPath, Buffer.from('v10legacy-ciphertext'), { mode: 0o600 })
    /** @brief Linux 待测 store / Linux store under test. */
    const store = new ElectronNativeRefreshGrantStore({
      platform: 'linux',
      safeStorage: new TestSafeStorage(),
      userDataDirectory
    })

    await expect(store.read()).rejects.toMatchObject({
      reason: 'persistent-login-unsupported'
    })
    await expect(lstat(recordPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('provider 暂时不可用时保留既有密文供稍后恢复', async (): Promise<void> => {
    /** @brief 可切换可用性的 provider / Provider with switchable availability. */
    const safeStorage = new TestSafeStorage()
    /** @brief 待测 store / Store under test. */
    const store = new ElectronNativeRefreshGrantStore({
      platform: 'darwin',
      safeStorage,
      userDataDirectory: await createUserDataDirectory()
    })
    /** @brief 既有授权 / Existing grant. */
    const storedGrant = grant('refresh-token-temporary-000000')
    await store.replace(storedGrant)
    safeStorage.available = false

    await expect(store.read()).rejects.toBeInstanceOf(NativeSecureStorageUnavailableError)
    safeStorage.available = true
    await expect(store.read()).resolves.toEqual(storedGrant)
  })

  it('加密失败不会覆盖上一代密文', async (): Promise<void> => {
    /** @brief 可控 provider / Controllable provider. */
    const safeStorage = new TestSafeStorage()
    /** @brief 待测 store / Store under test. */
    const store = new ElectronNativeRefreshGrantStore({
      platform: 'darwin',
      safeStorage,
      userDataDirectory: await createUserDataDirectory()
    })
    /** @brief 已提交旧授权 / Committed old grant. */
    const oldGrant = grant('refresh-token-old-0000000000')
    await store.replace(oldGrant)
    safeStorage.failEncryption = true

    await expect(store.replace(grant('refresh-token-new-0000000000'))).rejects.toThrow()
    safeStorage.failEncryption = false
    await expect(store.read()).resolves.toEqual(oldGrant)
  })

  it('解密或 JSON 损坏时删除精确本地记录并返回匿名', async (): Promise<void> => {
    /** @brief 可控 provider / Controllable provider. */
    const safeStorage = new TestSafeStorage()
    /** @brief 待测 store / Store under test. */
    const store = new ElectronNativeRefreshGrantStore({
      platform: 'darwin',
      safeStorage,
      userDataDirectory: await createUserDataDirectory()
    })
    await store.replace(grant('refresh-token-corrupt-0000000'))
    safeStorage.corruptDecryption = true

    await expect(store.read()).resolves.toBeNull()
    safeStorage.corruptDecryption = false
    await expect(store.read()).resolves.toBeNull()
  })

  it('遵循 shouldReEncrypt 并以当前 provider key 原子重写', async (): Promise<void> => {
    /** @brief 请求 key rotation 的 provider / Provider requesting key rotation. */
    const safeStorage = new TestSafeStorage()
    /** @brief 待测 store / Store under test. */
    const store = new ElectronNativeRefreshGrantStore({
      platform: 'darwin',
      safeStorage,
      userDataDirectory: await createUserDataDirectory()
    })
    /** @brief 初始授权 / Initial grant. */
    const storedGrant = grant('refresh-token-rotate-00000000')
    await store.replace(storedGrant)
    safeStorage.requestReEncryption = true
    safeStorage.decryptCalls = 0

    await expect(store.read()).resolves.toEqual(storedGrant)
    expect(safeStorage.decryptCalls).toBe(2)
    expect(safeStorage.encryptSpy).toHaveBeenCalledTimes(2)
  })

  it('拒绝 userData 或密文路径中的符号链接', async (): Promise<void> => {
    if (process.platform === 'win32') return
    /** @brief 实际 userData 目录 / Real userData directory. */
    const realUserData = await createUserDataDirectory()
    /** @brief 指向 userData 的符号链接 / Symbolic link pointing at userData. */
    const linkedUserData = `${realUserData}-link`
    temporaryDirectories.push(linkedUserData)
    await symlink(realUserData, linkedUserData, 'dir')
    /** @brief 通过符号链接根目录构造的 store / Store constructed through a symlinked root. */
    const linkedStore = new ElectronNativeRefreshGrantStore({
      platform: persistentTestPlatform,
      safeStorage: new TestSafeStorage(),
      userDataDirectory: linkedUserData
    })
    await expect(linkedStore.replace(grant('refresh-token-linked-root-00000'))).rejects.toThrow()

    /** @brief 正常 root 下的 OAuth 目录 / OAuth directory below a normal root. */
    const oauthDirectory = path.join(realUserData, 'oauth')
    await mkdir(oauthDirectory, { mode: 0o700 })
    /** @brief 攻击者控制的普通文件 / Attacker-controlled regular file. */
    const target = path.join(realUserData, 'attacker-target')
    await symlink(target, path.join(oauthDirectory, 'refresh-grant.v1.bin'))
    /** @brief 直接使用正常 root 的 store / Store using the normal root directly. */
    const fileLinkStore = new ElectronNativeRefreshGrantStore({
      platform: persistentTestPlatform,
      safeStorage: new TestSafeStorage(),
      userDataDirectory: realUserData
    })
    await expect(fileLinkStore.read()).rejects.toThrow()
  })

  it('创建 0700 目录与 0600 文件，并修复专用目录的宽松读取权限', async (): Promise<void> => {
    if (process.platform === 'win32') return
    /** @brief 测试 userData / Test userData. */
    const userDataDirectory = await createUserDataDirectory()
    /** @brief 预先存在且权限过宽的专用目录 / Pre-existing dedicated directory with overly broad read permissions. */
    const oauthDirectory = path.join(userDataDirectory, 'oauth')
    await mkdir(oauthDirectory, { mode: 0o755 })
    await chmod(oauthDirectory, 0o755)
    /** @brief 待测 store / Store under test. */
    const store = new ElectronNativeRefreshGrantStore({
      platform: persistentTestPlatform,
      safeStorage: new TestSafeStorage(),
      userDataDirectory
    })

    await store.replace(grant('refresh-token-permissions-00000'))
    /** @brief 加固后的目录元数据 / Hardened directory metadata. */
    const directoryMetadata = await lstat(oauthDirectory)
    /** @brief 原子替换后的文件元数据 / File metadata after atomic replacement. */
    const fileMetadata = await lstat(path.join(oauthDirectory, 'refresh-grant.v1.bin'))
    expect(directoryMetadata.mode & 0o777).toBe(0o700)
    expect(fileMetadata.mode & 0o777).toBe(0o600)
  })

  it('clear 删除后可再次读取匿名，并通过同一目录持久边界', async (): Promise<void> => {
    /** @brief 待测 store / Store under test. */
    const store = new ElectronNativeRefreshGrantStore({
      platform: persistentTestPlatform,
      safeStorage: new TestSafeStorage(),
      userDataDirectory: await createUserDataDirectory()
    })
    await store.replace(grant('refresh-token-clear-fsync-00000'))

    await expect(store.clear()).resolves.toBeUndefined()
    await expect(store.read()).resolves.toBeNull()
  })

  it('clear 在首个删除成功、第二个路径失败时仍走 finally durability 边界', async (): Promise<void> => {
    if (process.platform === 'win32') return
    /** @brief 待测 userData / User data under test. */
    const userDataDirectory = await createUserDataDirectory()
    /** @brief 待测 store / Store under test. */
    const store = new ElectronNativeRefreshGrantStore({
      platform: persistentTestPlatform,
      safeStorage: new TestSafeStorage(),
      userDataDirectory
    })
    await store.replace(grant('refresh-token-clear-partial-0000'))
    /** @brief 不允许被删除的 staging 符号链接 / Staging symlink that deletion must reject. */
    const stagingPath = path.join(userDataDirectory, 'oauth', 'refresh-grant.v1.next')
    await symlink(path.join(userDataDirectory, 'outside'), stagingPath)

    await expect(store.clear()).rejects.toBeInstanceOf(Error)
    await expect(
      lstat(path.join(userDataDirectory, 'oauth', 'refresh-grant.v1.bin'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
