/**
 * @brief 构造跨平台 Electron smoke 启动命令 / Build a cross-platform Electron smoke launch command.
 * @param nodeExecutablePath Node.js 可执行文件路径 / Node.js executable path.
 * @param electronCliScriptPath Electron CLI 脚本路径 / Electron CLI script path.
 * @param desktopMainPath 已构建的桌面 main 入口 / Built desktop main entrypoint.
 * @return 可直接传入 `spawn` 的命令与参数 / Command and arguments suitable for `spawn`.
 * @note 直接执行 CLI 脚本可避开 Windows `.cmd` shim 与 shell 引号规则。
 */
export function createDesktopSmokeLaunch(
  nodeExecutablePath,
  electronCliScriptPath,
  desktopMainPath
) {
  return {
    command: nodeExecutablePath,
    args: [electronCliScriptPath, desktopMainPath]
  }
}
