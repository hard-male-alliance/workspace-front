# 仓库说明

- `workspace-shared-docs` 是只读 submodule，也是共享 API 契约的唯一事实来源；禁止在其中编辑、建分支、commit 或 push。
- 修改契约必须在本仓库外单独 clone、审阅并合并；随后仅在本仓库更新 gitlink。发现 submodule 有本地修改时停止，不得代用户处理。
- 当前正式标准只从 `workspace-shared-docs/contracts/v2/` 读取；`contract.md`、`schema.jsonc`、`examples.jsonc` 与 `diff.md` 是唯一发布物，不得创建副本或缺失时回退。clone、CI、测试和构建必须初始化父仓库固定的 revision。
- API v2.0 的 `Published Standard` 状态不表示后端已经实现或部署 v2。运行时迁移必须按 bounded context 显式选择 major version；完成身份、Workspace 授权与端到端验证前，不得把现有 `/api/v1` 调用机械改写为 `/api/v2`，也不得静默回退 v1 或内存 Mock。
- `./update-shared.sh` 可在上游变更合并后更新 revision；测试通过后，gitlink 由用户在父仓库单独提交。
