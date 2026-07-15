/**
 * @brief 构造跨平台 Electron smoke 启动命令 / Build a cross-platform Electron smoke launch command.
 * @param platform 目标操作系统平台 / Target operating-system platform.
 * @param commandShell Windows 命令解释器路径 / Windows command-interpreter path.
 * @param electronCliPath Electron CLI 路径 / Electron CLI path.
 * @param desktopMainPath 已构建的桌面 main 入口 / Built desktop main entrypoint.
 * @return 可直接传入 `spawn` 的命令与参数 / Command and arguments suitable for `spawn`.
 * @note Windows 的 `.cmd` shim 不能被 `spawn` 直接执行，必须经 `cmd.exe` 调用。
 */
export function createDesktopSmokeLaunch(platform, commandShell, electronCliPath, desktopMainPath) {
  if (platform === 'win32') {
    return {
      command: commandShell ?? 'cmd.exe',
      args: ['/d', '/s', '/c', `"${electronCliPath}" "${desktopMainPath}"`]
    }
  }

  return {
    command: electronCliPath,
    args: [desktopMainPath]
  }
}
