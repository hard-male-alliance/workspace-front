#!/usr/bin/env node

/** @file 可执行前端架构适应度门禁 / Executable frontend architecture fitness gate. */

import { builtinModules } from 'node:module'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

/** @brief 门禁扫描的源码扩展名 / Source extensions scanned by the gate. */
const SOURCE_EXTENSIONS = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'])

/** @brief 解析无扩展名导入时尝试的源码扩展名 / Source extensions tried for extensionless imports. */
const RESOLUTION_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']

/** @brief 扫描时跳过的生成目录和外部目录 / Generated and external directories ignored while scanning. */
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.cache',
  '.vite',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'workspace-shared-docs'
])

/** @brief 领域层和应用层不能依赖的高层目录 / Higher-level directories forbidden to domain and application layers. */
const OUTER_LAYER_NAMES = new Set([
  'adapter',
  'adapters',
  'infrastructure',
  'infrastructures',
  'presentation'
])

/** @brief 展示层不能依赖的 adapter 目录 / Adapter directories forbidden to presentation layers. */
const ADAPTER_LAYER_NAMES = new Set(['adapter', 'adapters', 'infrastructure', 'infrastructures'])

/** @brief Node 内建模块的无前缀名称集合 / Unprefixed names of Node built-in modules. */
const NODE_BUILTINS = new Set(builtinModules.map((name) => name.replace(/^node:/u, '')))

/** @brief 领域与应用层禁止直接使用的浏览器环境全局 / Browser ambient globals forbidden in domain and application layers. */
const BROWSER_AMBIENT_GLOBALS = new Set([
  'Blob',
  'File',
  'FormData',
  'WebSocket',
  'document',
  'fetch',
  'localStorage',
  'navigator',
  'sessionStorage',
  'window'
])

/** @brief 生产 UI 禁止暴露的非生产数据文案 / Non-production data copy forbidden in production UI. */
const FORBIDDEN_PRODUCTION_UI_COPY =
  /(?:\b(?:demo|fake|fixture|mock(?:ed)?)[\s_-]+(?:adapter|content|data|fallback|gateway|mode|placeholder|response|result|state)\b|\bfallback[\s_-]+(?:content|data|response|result)\b|[（(]\s*mock\s*[）)]|(?:演示|示例|占位|假|模拟|测试|回退|兜底|降级)(?:内容|数据|响应|结果|状态|模式|网关|适配器)|fallback\s*数据)/iu

/** @brief Vitest project 唯一模式清单 / Canonical manifest of Vitest project patterns. */
const TEST_PROJECTS_MANIFEST = 'test-projects.json'

/** @brief 允许的测试运行时类别 / Allowed test runtime categories. */
const TEST_PROJECT_NAMES = Object.freeze(['node', 'dom', 'browser'])

/** @brief AppData gateway hook 所属的限界上下文 / Bounded-context owner of each AppData gateway hook. */
const GATEWAY_HOOK_OWNERS = Object.freeze({
  useInterviewGateway: 'interview',
  useKnowledgeGateway: 'knowledge',
  useResumeGateway: 'resume',
  useWorkspaceGateway: 'workspace'
})

/** @brief 跨上下文命名查询 hook 的页面所有者 / Page owner of each named cross-context query hook. */
const APP_QUERY_HOOK_OWNERS = Object.freeze({
  useInterviewSetupQuery: 'interview',
  useInterviewSummaryQuery: 'interview',
  useWorkspaceHomeQuery: 'workspace'
})

/**
 * @typedef {object} SourceFile
 * @property {string} absolutePath 源码绝对路径 / Absolute source path.
 * @property {string} relativePath 相对仓库根的 POSIX 路径 / POSIX path relative to the repository root.
 * @property {string} text 源码文本 / Source text.
 */

/**
 * @typedef {object} Dependency
 * @property {string} specifier 模块说明符 / Module specifier.
 * @property {number} line 一基行号 / One-based line number.
 * @property {number} column 一基列号 / One-based column number.
 * @property {string[]} importedNames 静态导入的绑定名 / Binding names imported statically.
 * @property {string | undefined} target 已解析的仓库内源码 / Resolved in-repository source.
 */

/**
 * @typedef {object} TestProjectDefinition
 * @property {string[]} roots 相对仓库根的测试目录 / Test roots relative to the repository.
 * @property {string[]} extensions 允许的文件扩展名 / Allowed filename extensions.
 */

/**
 * @typedef {object} Violation
 * @property {string} rule 规则标识 / Rule identifier.
 * @property {string} file 相对文件路径 / Relative file path.
 * @property {number} line 一基行号 / One-based line number.
 * @property {number} column 一基列号 / One-based column number.
 * @property {string} message 可操作诊断 / Actionable diagnostic.
 */

/**
 * @brief 将平台路径规范化为 POSIX 路径 / Normalize a platform path to POSIX form.
 * @param {string} value 待规范化路径 / Path to normalize.
 * @return {string} POSIX 路径 / POSIX path.
 */
function toPosixPath(value) {
  return value.split(path.sep).join('/')
}

/**
 * @brief 判断相对路径是否位于指定目录 / Test whether a relative path is inside a directory.
 * @param {string} relativePath 相对路径 / Relative path.
 * @param {string} directory POSIX 目录 / POSIX directory.
 * @return {boolean} 位于目录内时为 true / True when the path is inside the directory.
 */
function isWithin(relativePath, directory) {
  return relativePath === directory || relativePath.startsWith(`${directory}/`)
}

/**
 * @brief 判断文件是否采用任一测试命名 / Detect any test-like filename.
 * @param {string} relativePath 相对文件路径 / Relative file path.
 * @return {boolean} 测试文件为 true / True for a test file.
 */
function isTestFile(relativePath) {
  return /\.(?:test|spec)\.[^.]+$/u.test(path.posix.basename(relativePath))
}

/**
 * @brief 判断源码是否为明确命名的测试支撑模块 / Detect an explicitly named test-support module.
 * @param {string} relativePath 相对文件路径 / Relative file path.
 * @return {boolean} 测试或测试支撑源码为 true / True for tests or test-support sources.
 */
function isTestSupportSource(relativePath) {
  if (isTestFile(relativePath)) return true
  /** @brief 当前源码文件名 / Current source basename. */
  const basename = path.posix.basename(relativePath)
  return (
    /\.(?:node|dom|browser)-test-(?:fixture|fixtures|harness|helper|helpers|setup)\./u.test(
      basename
    ) ||
    /(?:^|\/)(?:__tests__|test-fixtures|test-support)(?:\/|$)/u.test(relativePath) ||
    /^packages\/[^/]+\/src\/testing(?:\.[^/]+|\/)/u.test(relativePath)
  )
}

/**
 * @brief 判断文件是否属于生产源码图 / Detect a file that belongs to the production source graph.
 * @param {string} relativePath 相对文件路径 / Relative file path.
 * @return {boolean} 生产源码为 true / True for production source.
 */
function isProductionSource(relativePath) {
  return (
    !isTestSupportSource(relativePath) &&
    (/^apps\/[^/]+\/src\//u.test(relativePath) || /^packages\/[^/]+\/src\//u.test(relativePath))
  )
}

/**
 * @brief 判断源码是否属于可能呈现用户文案的生产 UI / Detect production UI source that may present user-facing copy.
 * @param {string} relativePath 相对文件路径 / Relative file path.
 * @return {boolean} 生产 UI 源码为 true / True for production UI source.
 */
function isProductionUiSource(relativePath) {
  if (!isProductionSource(relativePath)) return false
  if (/(?:^|\/)infrastructure\/memory(?:\/|$)/u.test(relativePath)) return false

  return (
    /^apps\/web\/src\//u.test(relativePath) ||
    /^apps\/desktop\/src\/renderer\//u.test(relativePath) ||
    isWithin(relativePath, 'packages/app/src/app') ||
    isWithin(relativePath, 'packages/app/src/app-support/presentation') ||
    isWithin(relativePath, 'packages/app/src/i18n') ||
    isWithin(relativePath, 'packages/app/src/ui') ||
    /^packages\/app\/src\/contexts\/[^/]+\/presentation\//u.test(relativePath)
  )
}

/**
 * @brief 递归发现源码文件且不跟随目录符号链接 / Discover source files without following directory symlinks.
 * @param {string} directory 当前绝对目录 / Current absolute directory.
 * @param {string} rootDir 仓库绝对根目录 / Absolute repository root.
 * @param {SourceFile[]} files 输出源码列表 / Output source list.
 * @return {Promise<void>} 完成 Promise / Completion promise.
 */
async function discoverSourceFiles(directory, rootDir, files) {
  /** @brief 当前目录项 / Current directory entries. */
  const entries = await readdir(directory, { withFileTypes: true })

  for (const entry of entries) {
    /** @brief 当前目录项绝对路径 / Absolute path of the current entry. */
    const absolutePath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        await discoverSourceFiles(absolutePath, rootDir, files)
      }
      continue
    }

    if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      continue
    }

    /** @brief 相对仓库根的稳定路径 / Stable path relative to the repository root. */
    const relativePath = toPosixPath(path.relative(rootDir, absolutePath))
    /** @brief 当前源码文本 / Current source text. */
    const text = await readFile(absolutePath, 'utf8')
    files.push({ absolutePath: path.resolve(absolutePath), relativePath, text })
  }
}

/**
 * @brief 从条件 exports 值选择源码目标 / Select a source target from a conditional exports value.
 * @param {unknown} value package exports 值 / Package exports value.
 * @return {string | undefined} 首个字符串目标 / First string target.
 */
function selectExportTarget(value) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    for (const candidate of value) {
      /** @brief 当前数组候选目标 / Current array target candidate. */
      const target = selectExportTarget(candidate)
      if (target !== undefined) return target
    }
    return undefined
  }
  if (value === null || typeof value !== 'object') return undefined

  /** @brief 优先匹配源码构建常用条件 / Preferred conditions used by source builds. */
  const preferredConditions = ['types', 'import', 'browser', 'node', 'default']
  for (const condition of preferredConditions) {
    if (Object.hasOwn(value, condition)) {
      /** @brief 当前条件导出目标 / Export target for the current condition. */
      const target = selectExportTarget(value[condition])
      if (target !== undefined) return target
    }
  }

  for (const candidate of Object.values(value)) {
    /** @brief 当前后备导出目标 / Current fallback export target. */
    const target = selectExportTarget(candidate)
    if (target !== undefined) return target
  }
  return undefined
}

/**
 * @brief 读取工作区 package 名称、目录与 exports / Load workspace package names, roots, and exports.
 * @param {string} rootDir 仓库绝对根目录 / Absolute repository root.
 * @return {Promise<Map<string, {directory: string, exports: unknown}>>} package 元数据 / Package metadata.
 */
async function loadWorkspacePackages(rootDir) {
  /** @brief 按 package 名称索引的元数据 / Metadata indexed by package name. */
  const packages = new Map()

  for (const collection of ['apps', 'packages']) {
    /** @brief package 集合目录 / Package collection directory. */
    const collectionDirectory = path.join(rootDir, collection)
    /** @brief 集合中的直接子目录 / Direct children in the collection. */
    let entries
    try {
      entries = await readdir(collectionDirectory, { withFileTypes: true })
    } catch (error) {
      if (error !== null && typeof error === 'object' && error.code === 'ENOENT') continue
      throw error
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      /** @brief 当前 package 根目录 / Current package root. */
      const directory = path.join(collectionDirectory, entry.name)
      try {
        /** @brief 当前 package manifest / Current package manifest. */
        const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
        if (typeof manifest.name === 'string') {
          packages.set(manifest.name, { directory, exports: manifest.exports })
        }
      } catch (error) {
        if (error !== null && typeof error === 'object' && error.code === 'ENOENT') continue
        throw new Error(
          `Cannot read ${toPosixPath(path.relative(rootDir, directory))}/package.json`,
          {
            cause: error
          }
        )
      }
    }
  }

  return packages
}

/**
 * @brief 读取并严格校验测试 project 唯一清单 / Load and strictly validate the canonical test-project manifest.
 * @param {string} rootDir 仓库绝对根目录 / Absolute repository root.
 * @return {Promise<Record<string, TestProjectDefinition[]>>} 按运行时索引的 project 定义 / Project definitions indexed by runtime.
 */
async function loadTestProjectDefinitions(rootDir) {
  /** @brief 清单绝对路径 / Absolute manifest path. */
  const manifestPath = path.join(rootDir, TEST_PROJECTS_MANIFEST)
  /** @brief 未校验的 JSON 值 / Unvalidated JSON value. */
  const value = JSON.parse(await readFile(manifestPath, 'utf8'))

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${TEST_PROJECTS_MANIFEST} must contain a project-definition object.`)
  }

  /** @brief 清单中的 project 名称 / Project names present in the manifest. */
  const projectNames = Object.keys(value).sort()
  if (projectNames.join(',') !== [...TEST_PROJECT_NAMES].sort().join(',')) {
    throw new Error(
      `${TEST_PROJECTS_MANIFEST} must define exactly ${TEST_PROJECT_NAMES.join(', ')}.`
    )
  }

  /** @type {Record<string, TestProjectDefinition[]>} */
  const definitions = {}
  for (const projectName of TEST_PROJECT_NAMES) {
    /** @brief 当前 project 的未校验定义 / Unvalidated definitions for the current project. */
    const projectDefinitions = value[projectName]
    if (!Array.isArray(projectDefinitions) || projectDefinitions.length === 0) {
      throw new Error(`${TEST_PROJECTS_MANIFEST} project ${projectName} must not be empty.`)
    }

    definitions[projectName] = projectDefinitions.map((definition) => {
      if (definition === null || typeof definition !== 'object' || Array.isArray(definition)) {
        throw new Error(`${TEST_PROJECTS_MANIFEST} project ${projectName} has an invalid entry.`)
      }
      /** @brief 定义公开的字段 / Fields exposed by the definition. */
      const keys = Object.keys(definition).sort()
      /** @brief 当前定义的测试根 / Test roots in the current definition. */
      const roots = definition.roots
      /** @brief 当前定义的扩展名 / Extensions in the current definition. */
      const extensions = definition.extensions
      if (
        keys.join(',') !== 'extensions,roots' ||
        !Array.isArray(roots) ||
        roots.length === 0 ||
        !Array.isArray(extensions) ||
        extensions.length === 0 ||
        roots.some(
          (root) =>
            typeof root !== 'string' ||
            root.length === 0 ||
            path.posix.isAbsolute(root) ||
            root.split('/').includes('..') ||
            root.endsWith('/')
        ) ||
        extensions.some(
          (extension) => typeof extension !== 'string' || !/^[cm]?[jt]sx?$/u.test(extension)
        )
      ) {
        throw new Error(
          `${TEST_PROJECTS_MANIFEST} project ${projectName} entries require safe roots and source extensions.`
        )
      }
      return { extensions: [...new Set(extensions)], roots: [...new Set(roots)] }
    })
  }
  return definitions
}

/**
 * @brief 提取裸模块说明符中的 package 名称 / Extract a package name from a bare module specifier.
 * @param {string} specifier 模块说明符 / Module specifier.
 * @return {{name: string, subpath: string} | undefined} package 名称和子路径 / Package name and subpath.
 */
function splitPackageSpecifier(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('#')) {
    return undefined
  }
  /** @brief 模块说明符路径段 / Module specifier segments. */
  const segments = specifier.split('/')
  if (specifier.startsWith('@')) {
    if (segments.length < 2) return undefined
    return { name: `${segments[0]}/${segments[1]}`, subpath: segments.slice(2).join('/') }
  }
  return { name: segments[0], subpath: segments.slice(1).join('/') }
}

/**
 * @brief 构造导入候选源码路径 / Build candidate source paths for an import.
 * @param {string} basePath 未扩展的导入绝对路径 / Unexpanded absolute import path.
 * @return {string[]} 按优先级排列的候选路径 / Candidate paths in resolution order.
 */
function buildResolutionCandidates(basePath) {
  /** @brief 去除 URL 查询和 fragment 的路径 / Path without URL query or fragment. */
  const cleanPath = basePath.replace(/[?#].*$/u, '')
  /** @brief 当前显式扩展名 / Current explicit extension. */
  const extension = path.extname(cleanPath)
  /** @brief 去重候选集合 / Deduplicated candidate set. */
  const candidates = new Set([cleanPath])

  if (['.js', '.jsx', '.mjs', '.cjs'].includes(extension)) {
    /** @brief 不含 JavaScript 扩展名的路径 / Path without its JavaScript extension. */
    const stem = cleanPath.slice(0, -extension.length)
    for (const sourceExtension of RESOLUTION_EXTENSIONS) candidates.add(`${stem}${sourceExtension}`)
  } else if (extension.length === 0) {
    for (const sourceExtension of RESOLUTION_EXTENSIONS)
      candidates.add(`${cleanPath}${sourceExtension}`)
  }

  for (const sourceExtension of RESOLUTION_EXTENSIONS) {
    candidates.add(path.join(cleanPath, `index${sourceExtension}`))
  }
  return [...candidates].map((candidate) => path.resolve(candidate))
}

/**
 * @brief 从 package exports 映射精确子路径 / Resolve an exact package exports subpath.
 * @param {unknown} exportsValue package exports 字段 / Package exports field.
 * @param {string} subpath package 子路径 / Package subpath.
 * @return {string | undefined} manifest 相对目标 / Manifest-relative target.
 */
function resolvePackageExport(exportsValue, subpath) {
  if (typeof exportsValue === 'string' || Array.isArray(exportsValue)) {
    return subpath.length === 0 ? selectExportTarget(exportsValue) : undefined
  }
  if (exportsValue === null || typeof exportsValue !== 'object') return undefined

  /** @brief 标准 package exports 键 / Standard package exports key. */
  const exportKey = subpath.length === 0 ? '.' : `./${subpath}`
  if (Object.hasOwn(exportsValue, exportKey)) return selectExportTarget(exportsValue[exportKey])

  for (const [pattern, value] of Object.entries(exportsValue)) {
    if (!pattern.includes('*')) continue
    /** @brief exports pattern 的转义正则 / Escaped regular expression for an exports pattern. */
    const expression = new RegExp(
      `^${pattern
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
        .join('(.+)')}$`,
      'u'
    )
    /** @brief 当前子路径的 pattern 匹配 / Pattern match for the current subpath. */
    const match = expression.exec(exportKey)
    if (match === null) continue
    /** @brief exports pattern 的目标 / Target for the exports pattern. */
    const target = selectExportTarget(value)
    if (target === undefined) return undefined
    /** @brief pattern 中的首个通配内容 / First wildcard value in the pattern. */
    const wildcard = match[1] ?? ''
    return target.replaceAll('*', wildcard)
  }
  return undefined
}

/**
 * @brief 解析仓库内源码依赖 / Resolve a dependency to an in-repository source file.
 * @param {SourceFile} source 导入方源码 / Importing source.
 * @param {string} specifier 模块说明符 / Module specifier.
 * @param {Set<string>} sourcePaths 全部源码绝对路径 / All absolute source paths.
 * @param {Map<string, {directory: string, exports: unknown}>} workspacePackages 工作区 package / Workspace packages.
 * @return {string | undefined} 已解析绝对源码路径 / Resolved absolute source path.
 */
function resolveSourceDependency(source, specifier, sourcePaths, workspacePackages) {
  /** @brief 待扩展的绝对基准路径 / Absolute base path to expand. */
  let basePath

  if (specifier.startsWith('.')) {
    basePath = path.resolve(path.dirname(source.absolutePath), specifier)
  } else {
    /** @brief 裸模块中的 package 信息 / Package information from a bare specifier. */
    const packageSpecifier = splitPackageSpecifier(specifier)
    if (packageSpecifier === undefined) return undefined
    /** @brief 已发现的工作区 package / Discovered workspace package. */
    const packageMetadata = workspacePackages.get(packageSpecifier.name)
    if (packageMetadata === undefined) return undefined

    /** @brief package exports 提供的精确目标 / Exact target provided by package exports. */
    const exportedTarget = resolvePackageExport(packageMetadata.exports, packageSpecifier.subpath)
    if (exportedTarget === undefined) return undefined
    basePath = path.resolve(packageMetadata.directory, exportedTarget)
  }

  for (const candidate of buildResolutionCandidates(basePath)) {
    if (sourcePaths.has(candidate)) return candidate
  }
  return undefined
}

/**
 * @brief 为未解析的相对导入生成架构路径提示 / Build an architectural path hint for an unresolved relative import.
 * @param {SourceFile} source 导入方源码 / Importing source.
 * @param {string} specifier 模块说明符 / Module specifier.
 * @param {string} rootDir 仓库绝对根目录 / Absolute repository root.
 * @return {string | undefined} 相对仓库根路径提示 / Repository-relative path hint.
 */
function dependencyPathHint(source, specifier, rootDir) {
  if (!specifier.startsWith('.')) return undefined
  return toPosixPath(
    path.relative(rootDir, path.resolve(path.dirname(source.absolutePath), specifier))
  )
}

/**
 * @brief 使用 TypeScript AST 收集 import、export 与动态依赖 / Collect imports, exports, and dynamic dependencies with the TypeScript AST.
 * @param {SourceFile} file 待解析源码 / Source to parse.
 * @return {Omit<Dependency, 'target'>[]} 未解析依赖 / Unresolved dependencies.
 */
function parseDependencies(file) {
  /** @brief TypeScript 解析树 / TypeScript syntax tree. */
  const sourceFile = ts.createSourceFile(
    file.absolutePath,
    file.text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.Unknown
  )
  /** @brief 已发现依赖 / Discovered dependencies. */
  const dependencies = []

  /**
   * @brief 记录字符串模块说明符及位置 / Record a string module specifier and its position.
   * @param {import('typescript').StringLiteralLike} literal 模块字符串节点 / Module string node.
   * @param {string[]} [importedNames] 静态绑定名 / Static binding names.
   * @return {void} 无返回值 / No return value.
   */
  function record(literal, importedNames = []) {
    /** @brief 模块说明符的一基位置 / One-based module-specifier position. */
    const position = sourceFile.getLineAndCharacterOfPosition(literal.getStart(sourceFile))
    dependencies.push({
      column: position.character + 1,
      importedNames,
      line: position.line + 1,
      specifier: literal.text
    })
  }

  /**
   * @brief 提取静态 import 的绑定名 / Extract binding names from a static import.
   * @param {import('typescript').ImportClause | undefined} importClause import 子句 / Import clause.
   * @return {string[]} 导入名；default/namespace 使用特殊标记 / Imported names, using markers for default and namespace imports.
   */
  function getImportedNames(importClause) {
    if (importClause === undefined) return []
    /** @brief 当前 import 的绑定名 / Binding names in the current import. */
    const importedNames = []
    if (importClause.name !== undefined) importedNames.push('default')
    if (importClause.namedBindings === undefined) return importedNames
    if (ts.isNamespaceImport(importClause.namedBindings)) {
      importedNames.push('*')
      return importedNames
    }
    for (const element of importClause.namedBindings.elements) {
      importedNames.push((element.propertyName ?? element.name).text)
    }
    return importedNames
  }

  /**
   * @brief 深度优先访问语法树 / Visit the syntax tree depth-first.
   * @param {import('typescript').Node} node 当前 AST 节点 / Current AST node.
   * @return {void} 无返回值 / No return value.
   */
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      record(
        node.moduleSpecifier,
        ts.isImportDeclaration(node) ? getImportedNames(node.importClause) : []
      )
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression !== undefined &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      record(node.moduleReference.expression, ['*'])
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length > 0 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      record(node.arguments[0], ['*'])
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return dependencies
}

/**
 * @brief 判断字符串节点是否为模块说明符 / Detect whether a string node is a module specifier.
 * @param {import('typescript').StringLiteralLike} literal 字符串节点 / String node.
 * @return {boolean} 模块说明符为 true / True for module specifiers.
 */
function isModuleSpecifierLiteral(literal) {
  /** @brief 字符串节点父节点 / Parent of the string node. */
  const parent = literal.parent
  if (
    (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
    parent.moduleSpecifier === literal
  ) {
    return true
  }
  if (ts.isExternalModuleReference(parent) && parent.expression === literal) return true
  return (
    ts.isCallExpression(parent) &&
    parent.arguments[0] === literal &&
    (parent.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(parent.expression) && parent.expression.text === 'require'))
  )
}

/**
 * @brief 判断字符串节点是否只是属性名 / Detect whether a string node is only a property name.
 * @param {import('typescript').StringLiteralLike} literal 字符串节点 / String node.
 * @return {boolean} 属性名为 true / True for property names.
 */
function isStringPropertyName(literal) {
  /** @brief 字符串节点父节点 / Parent of the string node. */
  const parent = literal.parent
  return 'name' in parent && parent.name === literal
}

/**
 * @brief 检查生产 UI 是否泄漏演示、Mock、占位或回退数据文案 / Check production UI for demo, mock, placeholder, or fallback data copy.
 * @param {SourceFile[]} files 全部源码 / All source files.
 * @param {Violation[]} violations 输出违规列表 / Output violations.
 * @return {void} 无返回值 / No return value.
 * @note “Mock interview”和“模拟面试”是产品术语，不属于非生产数据标记。 / “Mock interview” and “模拟面试” are product terms, not non-production data markers.
 */
function checkProductionUiCopy(files, violations) {
  for (const file of files) {
    if (!isProductionUiSource(file.relativePath)) continue

    /** @brief 当前生产 UI 的 TypeScript 语法树 / TypeScript syntax tree for the current production UI source. */
    const sourceFile = ts.createSourceFile(
      file.absolutePath,
      file.text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.Unknown
    )

    /**
     * @brief 记录命中的用户可见文案 / Record matched user-facing copy.
     * @param {import('typescript').Node} node 文案节点 / Copy node.
     * @param {string} value 文案内容 / Copy content.
     * @return {void} 无返回值 / No return value.
     */
    function record(node, value) {
      if (!FORBIDDEN_PRODUCTION_UI_COPY.test(value)) return
      /** @brief 文案节点的一基位置 / One-based position of the copy node. */
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
      violations.push({
        column: position.character + 1,
        file: file.relativePath,
        line: position.line + 1,
        message:
          'Production UI cannot expose demo, mock, placeholder, or fallback data copy; remove the non-production branch or show a truthful unavailable/error state.',
        rule: 'production-ui-placeholder-copy'
      })
    }

    /**
     * @brief 深度优先检查真实字符串节点并忽略注释 / Visit real string nodes depth-first while ignoring comments.
     * @param {import('typescript').Node} node 当前 AST 节点 / Current AST node.
     * @return {void} 无返回值 / No return value.
     */
    function visit(node) {
      if (ts.isStringLiteralLike(node)) {
        if (!isModuleSpecifierLiteral(node) && !isStringPropertyName(node)) record(node, node.text)
      } else if (ts.isTemplateExpression(node)) {
        /** @brief 模板字符串的静态片段 / Static fragments of the template string. */
        const staticText = [
          node.head.text,
          ...node.templateSpans.map((span) => span.literal.text)
        ].join(' ')
        record(node, staticText)
      } else if (ts.isJsxText(node)) {
        record(node, node.getText(sourceFile))
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }
}

/**
 * @brief 判断标识符是否只是成员或声明的名称 / Detect identifiers that are merely member or declaration names.
 * @param {import('typescript').Identifier} identifier 待分类标识符 / Identifier to classify.
 * @return {boolean} 非值引用名称为 true / True for a non-value-reference name.
 */
function isNonReferenceIdentifier(identifier) {
  /** @brief 标识符父节点 / Parent node of the identifier. */
  const parent = identifier.parent

  if (
    (ts.isPropertyAccessExpression(parent) && parent.name === identifier) ||
    (ts.isQualifiedName(parent) && parent.right === identifier) ||
    (ts.isPropertyAssignment(parent) && parent.name === identifier) ||
    (ts.isBindingElement(parent) && parent.propertyName === identifier) ||
    (ts.isImportSpecifier(parent) && parent.propertyName === identifier) ||
    ts.isExportSpecifier(parent) ||
    ts.isLabeledStatement(parent) ||
    ts.isBreakOrContinueStatement(parent) ||
    ts.isJsxAttribute(parent)
  ) {
    return true
  }

  return (
    'name' in parent &&
    parent.name === identifier &&
    !ts.isShorthandPropertyAssignment(parent) &&
    !ts.isJsxOpeningElement(parent) &&
    !ts.isJsxSelfClosingElement(parent) &&
    !ts.isJsxClosingElement(parent)
  )
}

/**
 * @brief 判断标识符是否由源码中的局部声明绑定 / Detect whether an identifier is bound by a source-local declaration.
 * @param {import('typescript').Identifier} identifier 待检查标识符 / Identifier to inspect.
 * @param {import('typescript').TypeChecker} checker TypeScript 符号解析器 / TypeScript symbol checker.
 * @return {boolean} 存在源码声明时为 true / True when a source declaration exists.
 */
function hasSourceDeclaration(identifier, checker) {
  /** @brief 标识符对应符号 / Symbol associated with the identifier. */
  const symbol = checker.getSymbolAtLocation(identifier)
  return (symbol?.declarations?.length ?? 0) > 0
}

/**
 * @brief 检查领域与应用源码对浏览器环境全局的直接耦合 / Check direct browser-global coupling in domain and application sources.
 * @param {SourceFile[]} files 全部源码 / All source files.
 * @param {Violation[]} violations 输出违规列表 / Output violations.
 * @return {void} 无返回值 / No return value.
 */
function checkBrowserAmbientGlobals(files, violations) {
  /** @brief 不加载标准库的绑定程序，便于区分局部符号与环境全局 / No-lib binding program used to distinguish local symbols from ambient globals. */
  const program = ts.createProgram(
    files.map((file) => file.absolutePath),
    {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.Preserve,
      noLib: true,
      noResolve: true,
      target: ts.ScriptTarget.Latest
    }
  )
  /** @brief TypeScript 符号解析器 / TypeScript symbol checker. */
  const checker = program.getTypeChecker()

  for (const file of files) {
    /** @brief 当前 context 分类 / Current context classification. */
    const context = classifyContext(file.relativePath)
    /** @brief 当前 context 层 / Current context layer. */
    const layer = context?.remainder.split('/')[0]
    if (!isProductionSource(file.relativePath) || (layer !== 'domain' && layer !== 'application')) {
      continue
    }

    /** @brief 当前程序中的语法树 / Syntax tree in the binding program. */
    const sourceFile = program.getSourceFile(file.absolutePath)
    if (sourceFile === undefined) continue

    /**
     * @brief 深度优先检查未绑定的浏览器全局 / Visit unbound browser globals depth-first.
     * @param {import('typescript').Node} node 当前 AST 节点 / Current AST node.
     * @return {void} 无返回值 / No return value.
     */
    function visit(node) {
      if (
        ts.isIdentifier(node) &&
        BROWSER_AMBIENT_GLOBALS.has(node.text) &&
        !isNonReferenceIdentifier(node) &&
        !hasSourceDeclaration(node, checker)
      ) {
        /** @brief 环境全局引用的一基位置 / One-based position of the ambient-global reference. */
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
        violations.push({
          column: position.character + 1,
          file: file.relativePath,
          line: position.line + 1,
          message: `Context ${layer} code cannot use browser ambient global ${node.text}; pass platform-neutral data through an application port.`,
          rule: 'context-browser-ambient-global'
        })
      }

      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'globalThis' &&
        BROWSER_AMBIENT_GLOBALS.has(node.name.text) &&
        !hasSourceDeclaration(node.expression, checker)
      ) {
        /** @brief globalThis 成员引用的一基位置 / One-based position of the globalThis member reference. */
        const position = sourceFile.getLineAndCharacterOfPosition(node.name.getStart(sourceFile))
        violations.push({
          column: position.character + 1,
          file: file.relativePath,
          line: position.line + 1,
          message: `Context ${layer} code cannot use browser ambient global globalThis.${node.name.text}; pass platform-neutral data through an application port.`,
          rule: 'context-browser-ambient-global'
        })
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }
}

/**
 * @brief 判断模块是否为 Node 运行时依赖 / Detect a Node runtime dependency.
 * @param {string} specifier 模块说明符 / Module specifier.
 * @return {boolean} Node 内建依赖为 true / True for a Node built-in dependency.
 */
function isNodeDependency(specifier) {
  if (specifier.startsWith('node:')) return true
  /** @brief 去除子路径后的 Node 模块候选 / Node module candidate including subpaths. */
  const candidate = specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/')
  return NODE_BUILTINS.has(specifier) || NODE_BUILTINS.has(candidate)
}

/**
 * @brief 判断模块是否属于 Electron / Detect an Electron dependency.
 * @param {string} specifier 模块说明符 / Module specifier.
 * @return {boolean} Electron 依赖为 true / True for an Electron dependency.
 */
function isElectronDependency(specifier) {
  return /^(?:@electron\/|electron(?:$|[-/]))/u.test(specifier)
}

/**
 * @brief 判断模块是否属于 React 生态 / Detect a React ecosystem dependency.
 * @param {string} specifier 模块说明符 / Module specifier.
 * @return {boolean} React 依赖为 true / True for a React dependency.
 */
function isReactDependency(specifier) {
  return /(?:^|[-/])react(?:$|[-/])/u.test(specifier)
}

/**
 * @brief 判断模块是否提供 DOM 或浏览器测试运行时 / Detect a DOM or browser-test runtime dependency.
 * @param {string} specifier 模块说明符 / Module specifier.
 * @return {boolean} DOM 测试依赖为 true / True for a DOM-test dependency.
 */
function isDomTestDependency(specifier) {
  return (
    /^(?:jsdom|happy-dom)(?:$|\/)/u.test(specifier) ||
    /^@testing-library\/(?:dom|react|user-event)(?:$|\/)/u.test(specifier) ||
    /^(?:@vitest\/browser|vitest\/browser|vitest-browser)(?:$|[-/])/u.test(specifier) ||
    /^(?:@playwright\/test|playwright|puppeteer|selenium-webdriver)(?:$|\/)/u.test(specifier)
  )
}

/**
 * @brief 解析源码所在上下文和上下文内路径 / Classify a source context and its internal path.
 * @param {string} relativePath 相对仓库根路径 / Repository-relative path.
 * @return {{name: string, remainder: string} | undefined} 上下文信息 / Context information.
 */
function classifyContext(relativePath) {
  /** @brief contexts 路径匹配 / Match of a contexts path. */
  const match = /^packages\/app\/src\/contexts\/([^/]+)(?:\/(.*))?$/u.exec(relativePath)
  if (match === null) return undefined
  return { name: match[1], remainder: match[2] ?? '' }
}

/**
 * @brief 提取路径中的架构层名称 / Extract an architectural layer name from a path.
 * @param {string} relativePath 相对仓库根路径或路径提示 / Repository-relative path or hint.
 * @return {string | undefined} 命中的层名称 / Matched layer name.
 */
function classifyLayer(relativePath) {
  /** @brief 路径段 / Path segments. */
  const segments = relativePath.split('/')
  return segments.find(
    (segment) => OUTER_LAYER_NAMES.has(segment) || segment === 'application' || segment === 'domain'
  )
}

/**
 * @brief 判断目标是否为 context 根公开入口 / Test whether a target is a context root public entry.
 * @param {{name: string, remainder: string}} context 目标上下文 / Target context.
 * @return {boolean} 根 index 为 true / True for the root index.
 */
function isContextPublicIndex(context) {
  return /^index\.(?:[cm]?[jt]sx?)$/u.test(context.remainder)
}

/**
 * @brief 生成测试文件后缀违规 / Validate the mutually exclusive test-project suffix.
 * @param {SourceFile} file 待校验源码 / Source to validate.
 * @param {Violation[]} violations 输出违规列表 / Output violations.
 * @return {string | undefined} 合法测试的 project 名称 / Project name for a valid test.
 */
function checkTestSuffix(file, violations) {
  /** @brief 当前文件名 / Current basename. */
  const basename = path.posix.basename(file.relativePath)
  if (!/\.(?:test|spec)\.[^.]+$/u.test(basename)) return undefined

  /** @brief 文件名中出现的运行时分类标记 / Runtime-category markers found in the filename. */
  const categoryMarkers = [...basename.matchAll(/\.(node|dom|browser)(?=\.)/gu)].map(
    (match) => match[1]
  )
  /** @brief 合法互斥测试后缀 / Valid mutually exclusive test suffix. */
  const validSuffix = /\.(node|dom|browser)\.test\.(?:[cm]?[jt]sx?)$/u.exec(basename)

  if (validSuffix === null || categoryMarkers.length !== 1) {
    violations.push({
      column: 1,
      file: file.relativePath,
      line: 1,
      message:
        'Test files must end in exactly one of .node.test.*, .dom.test.*, or .browser.test.*; legacy .test.* and .spec.* names are forbidden.',
      rule: 'test-project-suffix'
    })
    return undefined
  }

  return validSuffix[1]
}

/**
 * @brief 验证合法后缀的测试恰好命中一个实际 Vitest project / Verify a suffixed test matches exactly one real Vitest project.
 * @param {SourceFile} file 待校验测试 / Test source to validate.
 * @param {string} projectName 文件后缀声明的 project / Project declared by the filename suffix.
 * @param {Record<string, TestProjectDefinition[]>} definitions 唯一 project 清单 / Canonical project manifest.
 * @param {Violation[]} violations 输出违规列表 / Output violations.
 * @return {void} 无返回值 / No return value.
 */
function checkTestProjectAssignment(file, projectName, definitions, violations) {
  /** @brief 当前测试文件名 / Current test basename. */
  const basename = path.posix.basename(file.relativePath)
  /** @brief 当前文件扩展名 / Current filename extension. */
  const extension = path.posix.extname(basename).slice(1)
  /** @brief 当前 project 中命中的定义数 / Number of matching definitions in the current project. */
  const matchingDefinitions = (definitions[projectName] ?? []).filter(
    (definition) =>
      definition.extensions.includes(extension) &&
      definition.roots.some((root) => isWithin(file.relativePath, root))
  )

  if (matchingDefinitions.length === 0) {
    violations.push({
      column: 1,
      file: file.relativePath,
      line: 1,
      message: `Test suffix declares project ${projectName}, but ${TEST_PROJECTS_MANIFEST} does not include this path and extension.`,
      rule: 'test-project-assignment'
    })
  }
}

/**
 * @brief 验证测试运行时与宿主目录一致 / Validate that a test runtime matches its host directory.
 * @param {SourceFile} file 待校验测试 / Test source to validate.
 * @param {string} projectName 文件后缀声明的 project / Project declared by the filename suffix.
 * @param {Record<string, TestProjectDefinition[]>} definitions 唯一 project 清单 / Canonical project manifest.
 * @param {Violation[]} violations 输出违规列表 / Output violations.
 * @return {void} 无返回值 / No return value.
 */
function checkTestRuntimeLocation(file, projectName, definitions, violations) {
  /** @brief Electron Node 宿主源码目录标记 / Electron Node-host source-directory marker. */
  const isDesktopNodeHost =
    isWithin(file.relativePath, 'apps/desktop/src/main') ||
    isWithin(file.relativePath, 'apps/desktop/src/preload')

  if (isDesktopNodeHost && projectName !== 'node') {
    violations.push({
      column: 1,
      file: file.relativePath,
      line: 1,
      message: 'Electron main/preload tests must use the Node project and the .node.test.* suffix.',
      rule: 'test-runtime-location'
    })
    return
  }

  if (projectName !== 'browser') return

  /** @brief Browser project 明确声明的目录 / Explicit directories declared by the Browser project. */
  const browserRoots = (definitions.browser ?? []).flatMap((definition) => definition.roots)
  if (browserRoots.some((root) => isWithin(file.relativePath, root))) return

  violations.push({
    column: 1,
    file: file.relativePath,
    line: 1,
    message: `Browser tests must live under an explicit browser root from ${TEST_PROJECTS_MANIFEST}.`,
    rule: 'test-runtime-location'
  })
}

/**
 * @brief 追加单项依赖违规 / Append one dependency violation.
 * @param {Violation[]} violations 输出违规列表 / Output violations.
 * @param {SourceFile} file 违规源码 / Violating source.
 * @param {Dependency} dependency 违规依赖 / Violating dependency.
 * @param {string} rule 规则标识 / Rule identifier.
 * @param {string} message 诊断消息 / Diagnostic message.
 * @return {void} 无返回值 / No return value.
 */
function addDependencyViolation(violations, file, dependency, rule, message) {
  violations.push({
    column: dependency.column,
    file: file.relativePath,
    line: dependency.line,
    message,
    rule
  })
}

/**
 * @brief 判断生产源码是否必须与测试 facade 隔离 / Detect production source that must be isolated from the testing facade.
 * @param {string} relativePath 相对仓库根路径 / Repository-relative path.
 * @return {boolean} 组合范围内为 true / True inside a composition scope.
 */
function isTestingFacadeRestrictedProduction(relativePath) {
  return (
    isProductionSource(relativePath) &&
    (/^apps\/[^/]+\/src\//u.test(relativePath) ||
      isWithin(relativePath, 'packages/app/src/app') ||
      isWithin(relativePath, 'packages/product-runtime/src'))
  )
}

/**
 * @brief 判断依赖是否指向非生产数据 adapter / Detect a dependency on non-production data adapters.
 * @param {string} specifier 模块说明符 / Module specifier.
 * @param {string | undefined} targetRelativePath 已解析目标路径 / Resolved target path.
 * @return {boolean} 测试或演示数据依赖为 true / True for a testing or demo-data dependency.
 */
function isNonProductionDataDependency(specifier, targetRelativePath) {
  return (
    specifier === '@ai-job-workspace/app/testing' ||
    specifier.startsWith('@ai-job-workspace/app/testing/') ||
    specifier === '@ai-job-workspace/app/demo' ||
    specifier.startsWith('@ai-job-workspace/app/demo/') ||
    targetRelativePath === 'packages/app/src/testing.ts' ||
    targetRelativePath?.startsWith('packages/app/src/testing/') === true ||
    targetRelativePath === 'packages/app/src/demo.ts' ||
    targetRelativePath?.startsWith('packages/app/src/demo/') === true ||
    /(?:^|\/)infrastructure\/(?:fake|fakes|memory|mock|mocks)(?:\/|$)/u.test(
      targetRelativePath ?? ''
    )
  )
}

/**
 * @brief 校验单个源码依赖的全部边界 / Validate all boundaries for one source dependency.
 * @param {SourceFile} file 导入方源码 / Importing source.
 * @param {Dependency} dependency 已解析依赖 / Resolved dependency.
 * @param {string} rootDir 仓库绝对根目录 / Absolute repository root.
 * @param {Map<string, {directory: string, exports: unknown}>} workspacePackages 工作区 package / Workspace packages.
 * @param {Violation[]} violations 输出违规列表 / Output violations.
 * @return {void} 无返回值 / No return value.
 */
function checkDependencyBoundaries(file, dependency, rootDir, workspacePackages, violations) {
  /** @brief 已解析目标的相对路径 / Relative path of the resolved target. */
  const targetRelativePath =
    dependency.target === undefined
      ? undefined
      : toPosixPath(path.relative(rootDir, dependency.target))
  /** @brief 目标路径或未解析相对提示 / Target path or unresolved relative hint. */
  const targetPath = targetRelativePath ?? dependencyPathHint(file, dependency.specifier, rootDir)
  /** @brief Node 运行时依赖标记 / Node runtime dependency marker. */
  const nodeDependency = isNodeDependency(dependency.specifier)
  /** @brief Electron 依赖标记 / Electron dependency marker. */
  const electronDependency = isElectronDependency(dependency.specifier)
  /** @brief React 依赖标记 / React dependency marker. */
  const reactDependency = isReactDependency(dependency.specifier)
  /** @brief DOM 测试依赖标记 / DOM-test dependency marker. */
  const domTestDependency = isDomTestDependency(dependency.specifier)
  /** @brief 裸模块中的 package 信息 / Package information from a bare specifier. */
  const packageSpecifier = splitPackageSpecifier(dependency.specifier)
  /** @brief 被导入的工作区 package / Imported workspace package. */
  const workspacePackage =
    packageSpecifier === undefined ? undefined : workspacePackages.get(packageSpecifier.name)

  if (
    /\.dom\.test\.(?:[cm]?[jt]sx?)$/u.test(file.relativePath) &&
    dependency.importedNames.includes('WorkspaceApp') &&
    (dependency.specifier === '@ai-job-workspace/app' ||
      targetRelativePath === 'packages/app/src/app/WorkspaceApp.tsx' ||
      targetRelativePath === 'packages/app/tests/integration/WorkspaceApp.dom-test-harness.tsx') &&
    !isWithin(file.relativePath, 'packages/app/tests/integration')
  ) {
    addDependencyViolation(
      violations,
      file,
      dependency,
      'workspace-app-dom-test-placement',
      'DOM tests that render the complete WorkspaceApp must live under packages/app/tests/integration; keep co-located DOM tests scoped to their local module.'
    )
  }

  if (
    isProductionSource(file.relativePath) &&
    packageSpecifier !== undefined &&
    workspacePackage !== undefined &&
    resolvePackageExport(workspacePackage.exports, packageSpecifier.subpath) === undefined
  ) {
    /** @brief 导入请求对应的 exports 键 / Exports key requested by the import. */
    const exportKey = packageSpecifier.subpath.length === 0 ? '.' : `./${packageSpecifier.subpath}`
    addDependencyViolation(
      violations,
      file,
      dependency,
      'workspace-package-public-export',
      `Production source cannot import ${dependency.specifier}; ${packageSpecifier.name}/package.json does not publicly export ${exportKey}. Add an intentional public export or depend on an existing facade.`
    )
  }

  if (
    isProductionSource(file.relativePath) &&
    (isWithin(file.relativePath, 'apps/web/src') ||
      isWithin(file.relativePath, 'apps/desktop/src/renderer') ||
      isWithin(file.relativePath, 'packages/app/src')) &&
    (nodeDependency || electronDependency)
  ) {
    addDependencyViolation(
      violations,
      file,
      dependency,
      'renderer-shared-runtime',
      `Renderer and shared app code cannot import ${dependency.specifier}; keep Node/Electron capabilities in a host adapter or composition root.`
    )
  }

  if (
    (isWithin(file.relativePath, 'apps/desktop/src/main') ||
      isWithin(file.relativePath, 'apps/desktop/src/preload')) &&
    (reactDependency || domTestDependency)
  ) {
    addDependencyViolation(
      violations,
      file,
      dependency,
      'desktop-main-preload-runtime',
      `Electron main/preload code cannot import React or DOM-test dependency ${dependency.specifier}; test it in the Node project.`
    )
  }

  if (
    isWithin(file.relativePath, 'packages/platform/src') &&
    (nodeDependency || electronDependency || reactDependency)
  ) {
    addDependencyViolation(
      violations,
      file,
      dependency,
      'platform-runtime-neutrality',
      `Platform code must remain React, Electron, and Node neutral; move ${dependency.specifier} to a host adapter.`
    )
  }

  /** @brief 导入方 context 信息 / Context information for the importing source. */
  const sourceContext = classifyContext(file.relativePath)
  /** @brief 导入方 context 层 / Context layer of the importing source. */
  const sourceLayer = sourceContext?.remainder.split('/')[0]
  /** @brief 目标的架构层 / Architectural layer of the target. */
  const targetLayer = targetPath === undefined ? undefined : classifyLayer(targetPath)

  if (
    sourceContext !== undefined &&
    sourceLayer === 'presentation' &&
    targetRelativePath === 'packages/app/src/app/AppData.tsx'
  ) {
    for (const importedName of dependency.importedNames) {
      /** @brief 当前 AppData hook 的语义所有者 / Semantic owner of the current AppData hook. */
      const owner = GATEWAY_HOOK_OWNERS[importedName] ?? APP_QUERY_HOOK_OWNERS[importedName]
      if (importedName !== '*' && importedName !== 'default' && owner === undefined) continue
      if (owner === sourceContext.name) continue

      addDependencyViolation(
        violations,
        file,
        dependency,
        'presentation-cross-context-port',
        importedName === '*' || importedName === 'default'
          ? 'Context presentation must use named AppData hooks so cross-context ownership remains enforceable.'
          : `Context ${sourceContext.name} presentation cannot consume ${importedName}, which belongs to ${owner}; add an explicitly owned application query or anti-corruption projection.`
      )
    }
  }

  if (sourceLayer === 'domain' || sourceLayer === 'application') {
    /** @brief 当前依赖触发的非法运行时类别 / Forbidden runtime categories triggered by this dependency. */
    const runtimeCategories = []
    if (reactDependency) runtimeCategories.push('React')
    if (domTestDependency) runtimeCategories.push('DOM test runtime')
    if (nodeDependency) runtimeCategories.push('Node')
    if (electronDependency) runtimeCategories.push('Electron')
    if (
      runtimeCategories.length > 0 ||
      (targetLayer !== undefined && OUTER_LAYER_NAMES.has(targetLayer))
    ) {
      /** @brief 非法依赖原因 / Reason for the forbidden dependency. */
      const reason =
        runtimeCategories.length > 0 ? runtimeCategories.join(', ') : `outer layer ${targetLayer}`
      addDependencyViolation(
        violations,
        file,
        dependency,
        'context-domain-application-dependency',
        `Context ${sourceLayer} code cannot depend on ${reason} through ${dependency.specifier}.`
      )
    }
  }

  if (
    sourceLayer === 'presentation' &&
    targetLayer !== undefined &&
    ADAPTER_LAYER_NAMES.has(targetLayer)
  ) {
    addDependencyViolation(
      violations,
      file,
      dependency,
      'presentation-adapter-dependency',
      `Presentation code cannot import adapter layer ${targetLayer} through ${dependency.specifier}; depend on an application port.`
    )
  }

  /** @brief 目标 context 信息 / Context information for the target source. */
  const targetContext =
    targetRelativePath === undefined ? undefined : classifyContext(targetRelativePath)
  /** @brief 跨限界上下文的依赖 / Dependency crossing bounded contexts. */
  const crossesContext =
    sourceContext !== undefined &&
    targetContext !== undefined &&
    sourceContext.name !== targetContext.name
  /** @brief 必须只消费 context 公开入口的产品组合代码 / Product composition code that must consume only context public entries. */
  const isContextConsumerComposition =
    targetContext !== undefined &&
    (isWithin(file.relativePath, 'packages/app/src/app') ||
      /^apps\/(?:web|desktop)\/src\//u.test(file.relativePath))
  if (
    targetContext !== undefined &&
    (crossesContext || isContextConsumerComposition) &&
    !isContextPublicIndex(targetContext)
  ) {
    addDependencyViolation(
      violations,
      file,
      dependency,
      'cross-context-deep-import',
      `Code outside context ${targetContext.name} must import its public contexts/${targetContext.name}/index.ts, not ${targetContext.remainder}.`
    )
  }

  if (
    isTestingFacadeRestrictedProduction(file.relativePath) &&
    isNonProductionDataDependency(dependency.specifier, targetRelativePath)
  ) {
    addDependencyViolation(
      violations,
      file,
      dependency,
      'production-testing-composition',
      'Production composition cannot import testing, demo, or in-memory data adapters; compose a contract-backed production adapter instead.'
    )
  }
}

/**
 * @brief 检查生产组合根能否传递抵达非生产数据 adapter / Check whether production composition roots transitively reach non-production data adapters.
 * @param {SourceFile[]} files 全部源码 / All source files.
 * @param {Map<string, Dependency[]>} dependenciesByFile 按文件索引的依赖 / Dependencies indexed by source file.
 * @param {string} rootDir 仓库绝对根目录 / Absolute repository root.
 * @param {Violation[]} violations 输出违规列表 / Output violations.
 * @return {void} 无返回值 / No return value.
 * @note 直接导入由单边界检查报告；本检查阻止通过 context barrel 或 facade 洗白依赖。 / Direct imports are reported by the single-edge check; this check prevents laundering through context barrels or facades.
 */
function checkProductionTestingReachability(files, dependenciesByFile, rootDir, violations) {
  /** @brief 按绝对路径索引源码 / Sources indexed by absolute path. */
  const fileByPath = new Map(files.map((file) => [file.absolutePath, file]))
  /** @brief 生产源码绝对路径集合 / Absolute paths of production sources. */
  const productionPaths = new Set(
    files.filter((file) => isProductionSource(file.relativePath)).map((file) => file.absolutePath)
  )
  /** @brief 已报告泄漏边的稳定签名 / Stable signatures of reported leaking edges. */
  const reportedEdges = new Set()
  /** @brief 必须保持真实数据依赖的生产组合根 / Production composition roots that must retain real-data dependencies. */
  const roots = files
    .filter((file) => isTestingFacadeRestrictedProduction(file.relativePath))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))

  for (const root of roots) {
    /** @brief 当前组合根已访问的生产源码 / Production sources visited from the current composition root. */
    const visited = new Set()

    /**
     * @brief 深度优先检查一条生产依赖路径 / Inspect one production dependency path depth-first.
     * @param {string} sourcePath 当前源码绝对路径 / Current absolute source path.
     * @param {string[]} pathFromRoot 从组合根到当前源码的路径 / Path from the composition root to the current source.
     * @return {void} 无返回值 / No return value.
     */
    function visit(sourcePath, pathFromRoot) {
      if (visited.has(sourcePath)) return
      visited.add(sourcePath)

      /** @brief 当前依赖来源文件 / Current dependency source file. */
      const sourceFile = fileByPath.get(sourcePath)
      if (sourceFile === undefined) return

      for (const dependency of dependenciesByFile.get(sourcePath) ?? []) {
        /** @brief 当前目标的仓库相对路径 / Repository-relative path of the current target. */
        const targetRelativePath =
          dependency.target === undefined
            ? undefined
            : toPosixPath(path.relative(rootDir, dependency.target))
        /** @brief 当前边是否进入非生产数据实现 / Whether this edge enters non-production data code. */
        const reachesNonProductionData = isNonProductionDataDependency(
          dependency.specifier,
          targetRelativePath
        )

        if (reachesNonProductionData) {
          if (!isTestingFacadeRestrictedProduction(sourceFile.relativePath)) {
            /** @brief 依赖泄漏边的去重签名 / Deduplication signature for the leaking edge. */
            const signature = [
              sourceFile.absolutePath,
              dependency.line,
              dependency.column,
              dependency.specifier
            ].join('\u0000')
            if (!reportedEdges.has(signature)) {
              reportedEdges.add(signature)
              /** @brief 依赖链的可读终点 / Human-readable endpoint of the dependency chain. */
              const endpoint = targetRelativePath ?? dependency.specifier
              violations.push({
                column: dependency.column,
                file: sourceFile.relativePath,
                line: dependency.line,
                message: `Production composition transitively reaches testing, demo, or in-memory data through ${[
                  ...pathFromRoot,
                  endpoint
                ].join(' -> ')}; keep non-production adapters behind the testing facade only.`,
                rule: 'production-testing-composition'
              })
            }
          }
          continue
        }

        if (
          dependency.target !== undefined &&
          productionPaths.has(dependency.target) &&
          fileByPath.has(dependency.target)
        ) {
          visit(dependency.target, [...pathFromRoot, targetRelativePath])
        }
      }
    }

    visit(root.absolutePath, [root.relativePath])
  }
}

/**
 * @brief 在完整生产依赖图中发现环 / Find cycles in the complete production dependency graph.
 * @param {SourceFile[]} files 全部源码 / All source files.
 * @param {Map<string, Dependency[]>} dependenciesByFile 按文件索引的依赖 / Dependencies indexed by source file.
 * @param {string} rootDir 仓库绝对根目录 / Absolute repository root.
 * @param {Violation[]} violations 输出违规列表 / Output violations.
 * @return {void} 无返回值 / No return value.
 */
function checkProductionDependencyCycles(files, dependenciesByFile, rootDir, violations) {
  /** @brief 生产文件绝对路径集合 / Absolute paths of production sources. */
  const productionPaths = new Set(
    files.filter((file) => isProductionSource(file.relativePath)).map((file) => file.absolutePath)
  )
  /** @brief 依赖图访问状态：1 visiting，2 done / Graph visit state: 1 visiting, 2 done. */
  const state = new Map()
  /** @brief 当前 DFS 路径 / Current DFS path. */
  const stack = []
  /** @brief 当前路径内文件位置 / Positions of files in the current path. */
  const stackPositions = new Map()
  /** @brief 已报告环的规范签名 / Canonical signatures of reported cycles. */
  const reportedCycles = new Set()
  /** @brief 按绝对路径索引源码 / Sources indexed by absolute path. */
  const fileByPath = new Map(files.map((file) => [file.absolutePath, file]))

  /**
   * @brief 规范化环签名以去重 / Canonicalize a cycle signature for deduplication.
   * @param {string[]} cycle 不重复终点的环节点 / Cycle nodes without a repeated endpoint.
   * @return {string} 规范签名 / Canonical signature.
   */
  function canonicalCycleSignature(cycle) {
    /** @brief 环中的字典序最小旋转位置 / Position of the lexicographically smallest cycle rotation. */
    let minimumIndex = 0
    for (let index = 1; index < cycle.length; index += 1) {
      if (cycle[index] < cycle[minimumIndex]) minimumIndex = index
    }
    return [...cycle.slice(minimumIndex), ...cycle.slice(0, minimumIndex)].join('\u0000')
  }

  /**
   * @brief 深度优先检查一个生产文件 / Depth-first check of one production source.
   * @param {string} sourcePath 当前源码绝对路径 / Current absolute source path.
   * @return {void} 无返回值 / No return value.
   */
  function visit(sourcePath) {
    state.set(sourcePath, 1)
    stackPositions.set(sourcePath, stack.length)
    stack.push(sourcePath)

    /** @brief 当前源码的仓库内生产依赖边 / In-repository production dependency edges of the current source. */
    const dependencies = (dependenciesByFile.get(sourcePath) ?? [])
      .filter(
        (dependency) => dependency.target !== undefined && productionPaths.has(dependency.target)
      )
      .sort((left, right) => left.target.localeCompare(right.target))

    for (const dependency of dependencies) {
      /** @brief 当前边目标绝对路径 / Absolute target path of the current edge. */
      const target = dependency.target
      /** @brief 当前目标访问状态 / Visit state of the current target. */
      const targetState = state.get(target) ?? 0
      if (targetState === 0) {
        visit(target)
        continue
      }
      if (targetState !== 1) continue

      /** @brief 环起点在当前 DFS 路径中的位置 / Cycle start position in the current DFS path. */
      const cycleStart = stackPositions.get(target)
      if (cycleStart === undefined) continue
      /** @brief 不重复终点的环节点 / Cycle nodes without a repeated endpoint. */
      const cycle = stack.slice(cycleStart)
      /** @brief 当前环规范签名 / Canonical signature for the current cycle. */
      const signature = canonicalCycleSignature(cycle)
      if (reportedCycles.has(signature)) continue
      reportedCycles.add(signature)

      /** @brief 用户可读的闭合环路径 / Human-readable closed cycle path. */
      const readableCycle = [...cycle, target].map((absolutePath) =>
        toPosixPath(path.relative(rootDir, absolutePath))
      )
      /** @brief 当前回边来源源码 / Source file of the current back edge. */
      const sourceFile = fileByPath.get(sourcePath)
      violations.push({
        column: dependency.column,
        file: sourceFile.relativePath,
        line: dependency.line,
        message: `Production dependency cycle: ${readableCycle.join(' -> ')}.`,
        rule: 'production-dependency-cycle'
      })
    }

    stack.pop()
    stackPositions.delete(sourcePath)
    state.set(sourcePath, 2)
  }

  for (const sourcePath of [...productionPaths].sort()) {
    if ((state.get(sourcePath) ?? 0) === 0) visit(sourcePath)
  }
}

/**
 * @brief 执行完整架构适应度检查 / Run the complete architecture fitness check.
 * @param {{rootDir?: string}} [options] 门禁选项 / Gate options.
 * @return {Promise<{files: number, violations: Violation[]}>} 检查结果 / Check result.
 */
export async function checkArchitecture(options = {}) {
  /** @brief 规范化仓库根目录 / Normalized repository root. */
  const rootDir = path.resolve(options.rootDir ?? process.cwd())
  /** @brief 扫描到的源码 / Discovered sources. */
  const files = []
  await discoverSourceFiles(rootDir, rootDir, files)
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))

  /** @brief 全部源码绝对路径 / Absolute paths of all sources. */
  const sourcePaths = new Set(files.map((file) => file.absolutePath))
  /** @brief 工作区 package 元数据 / Workspace package metadata. */
  const workspacePackages = await loadWorkspacePackages(rootDir)
  /** @brief Vitest project 唯一模式清单 / Canonical Vitest project-pattern manifest. */
  const testProjectDefinitions = await loadTestProjectDefinitions(rootDir)
  /** @brief 按源码索引的已解析依赖 / Resolved dependencies indexed by source. */
  const dependenciesByFile = new Map()
  /** @brief 全部架构违规 / All architecture violations. */
  const violations = []

  for (const file of files) {
    /** @brief 测试后缀声明的运行时 project / Runtime project declared by the test suffix. */
    const testProjectName = checkTestSuffix(file, violations)
    if (testProjectName !== undefined) {
      checkTestProjectAssignment(file, testProjectName, testProjectDefinitions, violations)
      checkTestRuntimeLocation(file, testProjectName, testProjectDefinitions, violations)
    }
    /** @brief 当前源码已解析依赖 / Resolved dependencies of the current source. */
    const dependencies = parseDependencies(file).map((dependency) => ({
      ...dependency,
      target: resolveSourceDependency(file, dependency.specifier, sourcePaths, workspacePackages)
    }))
    dependenciesByFile.set(file.absolutePath, dependencies)
    for (const dependency of dependencies) {
      checkDependencyBoundaries(file, dependency, rootDir, workspacePackages, violations)
    }
  }

  checkProductionUiCopy(files, violations)
  checkBrowserAmbientGlobals(files, violations)
  checkProductionTestingReachability(files, dependenciesByFile, rootDir, violations)
  checkProductionDependencyCycles(files, dependenciesByFile, rootDir, violations)
  violations.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.column - right.column ||
      left.rule.localeCompare(right.rule)
  )
  return { files: files.length, violations }
}

/**
 * @brief 将违规格式化为稳定单行诊断 / Format a violation as a stable single-line diagnostic.
 * @param {Violation} violation 架构违规 / Architecture violation.
 * @return {string} 格式化诊断 / Formatted diagnostic.
 */
export function formatViolation(violation) {
  return `[${violation.rule}] ${violation.file}:${violation.line}:${violation.column} ${violation.message}`
}

/**
 * @brief 解析 CLI 根目录参数 / Parse the CLI root-directory argument.
 * @param {string[]} arguments_ CLI 参数 / CLI arguments.
 * @return {string} 待扫描根目录 / Root directory to scan.
 */
function parseRootArgument(arguments_) {
  if (arguments_.length === 0) return process.cwd()
  if (arguments_.length === 2 && arguments_[0] === '--root') return arguments_[1]
  if (arguments_.length === 1 && arguments_[0].startsWith('--root=')) {
    return arguments_[0].slice('--root='.length)
  }
  throw new Error('Usage: node scripts/check-architecture.mjs [--root <directory>]')
}

/**
 * @brief 运行命令行门禁并设置稳定退出码 / Run the CLI gate and set a stable exit code.
 * @param {string[]} arguments_ CLI 参数 / CLI arguments.
 * @return {Promise<number>} 0 通过、1 架构违规、2 运行错误 / 0 pass, 1 violations, 2 operational error.
 */
export async function runArchitectureCli(arguments_ = process.argv.slice(2)) {
  try {
    /** @brief 待扫描仓库根目录 / Repository root to scan. */
    const rootDir = parseRootArgument(arguments_)
    /** @brief 架构检查结果 / Architecture check result. */
    const result = await checkArchitecture({ rootDir })
    if (result.violations.length === 0) {
      process.stdout.write(`Architecture check passed (${result.files} source files).\n`)
      return 0
    }

    process.stderr.write(
      `Architecture check failed with ${result.violations.length} violation(s).\n${result.violations
        .map(formatViolation)
        .join('\n')}\n`
    )
    return 1
  } catch (error) {
    /** @brief 可读运行错误 / Human-readable operational error. */
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`Architecture check could not run: ${message}\n`)
    return 2
  }
}

/** @brief 当前脚本绝对路径 / Absolute path of this script. */
const currentScriptPath = fileURLToPath(import.meta.url)
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === currentScriptPath) {
  process.exitCode = await runArchitectureCli()
}
