import { access, lstat, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

/**
 * @brief 将 ASAR 内部条目规范化为平台无关路径 / Normalize an ASAR entry to a platform-independent path.
 * @param entry @electron/asar 返回的条目 / Entry returned by @electron/asar.
 * @return 使用正斜杠的 ASAR 逻辑路径 / Logical ASAR path using forward slashes.
 */
export function normalizeAsarEntryPath(entry) {
  return entry.replaceAll('\\', '/')
}

/**
 * @brief 返回当前平台可能的 unpacked 应用布局 / Return possible unpacked application layouts for the current platform.
 * @param releaseRoot electron-builder 输出目录 / electron-builder output directory.
 * @param platform Node.js 平台名 / Node.js platform name.
 * @param architecture Node.js 架构名 / Node.js architecture name.
 * @return 按优先级排列的应用布局 / Application layouts in priority order.
 */
export function createPackagedLayoutCandidates(releaseRoot, platform, architecture) {
  if (platform === 'linux') {
    /** @brief Linux unpacked 根目录 / Linux unpacked root directory. */
    const applicationPath = path.join(releaseRoot, 'linux-unpacked')
    return [
      {
        applicationPath,
        asarPath: path.join(applicationPath, 'resources', 'app.asar'),
        executablePath: path.join(applicationPath, 'ai-job-workspace'),
        resourcesPath: path.join(applicationPath, 'resources')
      }
    ]
  }

  if (platform === 'win32') {
    /** @brief Windows unpacked 根目录 / Windows unpacked root directory. */
    const applicationPath = path.join(releaseRoot, 'win-unpacked')
    return [
      {
        applicationPath,
        asarPath: path.join(applicationPath, 'resources', 'app.asar'),
        executablePath: path.join(applicationPath, 'ai-job-workspace.exe'),
        resourcesPath: path.join(applicationPath, 'resources')
      }
    ]
  }

  if (platform === 'darwin') {
    /** @brief electron-builder 可能使用的 macOS 输出目录 / macOS output directories electron-builder may use. */
    const outputDirectoryNames = [
      `mac-${architecture}`,
      architecture === 'x64' ? 'mac' : '',
      'mac-universal',
      'mac'
    ].filter((value, index, values) => value.length > 0 && values.indexOf(value) === index)

    return outputDirectoryNames.map((directoryName) => {
      /** @brief macOS `.app` bundle 根目录 / macOS `.app` bundle root. */
      const applicationPath = path.join(releaseRoot, directoryName, 'AI Job Workspace.app')
      /** @brief macOS bundle Resources 目录 / macOS bundle Resources directory. */
      const resourcesPath = path.join(applicationPath, 'Contents', 'Resources')
      return {
        applicationPath,
        asarPath: path.join(resourcesPath, 'app.asar'),
        executablePath: path.join(applicationPath, 'Contents', 'MacOS', 'AI Job Workspace'),
        resourcesPath
      }
    })
  }

  throw new Error(`Packaged desktop smoke does not support platform ${platform}.`)
}

/**
 * @brief 定位当前平台已生成的 unpacked 应用 / Locate the unpacked application produced for the current platform.
 * @param releaseRoot electron-builder 输出目录 / electron-builder output directory.
 * @param platform Node.js 平台名 / Node.js platform name.
 * @param architecture Node.js 架构名 / Node.js architecture name.
 * @return 首个同时包含可执行文件与 ASAR 的布局 / First layout containing both the executable and ASAR.
 */
export async function resolvePackagedDesktopLayout(
  releaseRoot,
  platform = process.platform,
  architecture = process.arch
) {
  /** @brief 当前平台的候选布局 / Candidate layouts for the current platform. */
  const candidates = createPackagedLayoutCandidates(releaseRoot, platform, architecture)

  for (const candidate of candidates) {
    try {
      await Promise.all([access(candidate.executablePath), access(candidate.asarPath)])
      return candidate
    } catch {
      // Continue until a complete layout is found.
    }
  }

  throw new Error(
    `No packaged desktop application was found. Run pnpm package first. Checked: ${candidates
      .map((candidate) => candidate.applicationPath)
      .join(', ')}`
  )
}

/**
 * @brief 递归计算目录或文件的逻辑字节数 / Recursively calculate logical bytes for a directory or file.
 * @param targetPath 需要度量的路径 / Path to measure.
 * @return 不跟随符号链接的逻辑字节数 / Logical bytes without following symbolic links.
 */
export async function measurePathBytes(targetPath) {
  /** @brief 当前路径的文件系统信息 / Filesystem metadata for the current path. */
  const metadata = await lstat(targetPath)
  if (!metadata.isDirectory()) return metadata.size

  /** @brief 当前目录的直接子项 / Direct entries in the current directory. */
  const entries = await readdir(targetPath)
  /** @brief 所有直接子项的递归大小 / Recursive sizes of all direct entries. */
  const entrySizes = await Promise.all(
    entries.map((entry) => measurePathBytes(path.join(targetPath, entry)))
  )
  return entrySizes.reduce((total, size) => total + size, 0)
}

/**
 * @brief 验证应用代码只以非空 ASAR 分发 / Verify application code is distributed only as a non-empty ASAR.
 * @param layout 已定位的应用布局 / Resolved application layout.
 * @return ASAR 的字节数 / ASAR size in bytes.
 */
export async function verifyPackagedAsar(layout) {
  /** @brief app.asar 文件信息 / app.asar file metadata. */
  const asarMetadata = await stat(layout.asarPath)
  if (!asarMetadata.isFile() || asarMetadata.size < 1024) {
    throw new Error('Packaged app.asar is missing or unexpectedly small.')
  }

  /** @brief 未归档应用目录 / Unarchived application directory. */
  const unarchivedApplicationPath = path.join(layout.resourcesPath, 'app')
  try {
    await access(unarchivedApplicationPath)
    throw new Error(`Packaged application unexpectedly contains ${unarchivedApplicationPath}.`)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Packaged application unexpectedly')) {
      throw error
    }
  }

  return asarMetadata.size
}
