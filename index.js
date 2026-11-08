/**
 * 考研政治刷题台 — Host 半边。
 *
 * 路由（exact，和本机既有插件同一套 webServer API）：
 *   GET    /plugin/kaoyan-quiz/ui.js    面板脚本（Client 动态注入）
 *   GET    /plugin/kaoyan-quiz/bank     题库（内置 + 用户导入，按 id 去重合并）
 *   POST   /plugin/kaoyan-quiz/bank     导入/追加题库           { questions: [...] }
 *   DELETE /plugin/kaoyan-quiz/bank     删除导入的题库（回到内置题库）
 *   GET    /plugin/kaoyan-quiz/state    刷题进度（含错题本、收藏、随机队列）
 *   POST   /plugin/kaoyan-quiz/state    覆盖保存进度           { state: {...} }
 *   DELETE /plugin/kaoyan-quiz/state    清空进度
 *
 * 进度为什么放 Host 而不是 localStorage：DSH Web 每次启动监听的端口由系统随机分配，
 * 页面 origin 随之改变，localStorage 会整块作废。Host 侧写在
 * `$DSH_HOME/kaoyan-quiz/state.json`，换端口、重启、换页面都还在。
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ROUTE_BASE = '/plugin/kaoyan-quiz'
const MAX_BODY_BYTES = 16 * 1024 * 1024
const LETTERS = 'ABCDEFGH'

function dshHome() {
  const configured = typeof process.env.DSH_HOME === 'string' ? process.env.DSH_HOME.trim() : ''
  return configured.length > 0 ? configured : join(homedir(), '.dsh')
}

const workDir = join(dshHome(), 'kaoyan-quiz')
const stateFile = join(workDir, 'state.json')
const customBankFile = join(workDir, 'bank-custom.json')

/* ------------------------------------------------------------------ 题库 */

function toLetters(value) {
  if (typeof value === 'string') {
    return value
      .toUpperCase()
      .replace(/[^A-H]/g, '')
      .split('')
  }
  if (Array.isArray(value)) {
    const out = []
    for (const item of value) {
      if (typeof item === 'number' && Number.isInteger(item) && item >= 0 && item < 8) {
        out.push(LETTERS[item])
      } else if (typeof item === 'string') {
        const letter = item.trim().toUpperCase()
        if (/^[A-H]$/.test(letter)) out.push(letter)
      }
    }
    return out
  }
  return []
}

/**
 * 把一条原始题目规范成 UI 与统计都认的形状。不合法就返回 null（导入时跳过并报告）。
 * @param {unknown} raw
 * @param {number} index 在题库中的序号，用于兜底 id
 */
function normalizeQuestion(raw, index) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = /** @type {Record<string, unknown>} */ (raw)

  const stem = typeof source.stem === 'string' ? source.stem.trim() : ''
  if (stem.length === 0) return null

  let options = []
  if (Array.isArray(source.options)) {
    options = source.options.map((option) => (option === null || option === undefined ? '' : String(option).trim()))
  } else if (source.options !== null && typeof source.options === 'object') {
    options = Object.keys(source.options)
      .sort()
      .map((key) => String(/** @type {Record<string, unknown>} */ (source.options)[key] ?? '').trim())
  }
  options = options.filter((option) => option.length > 0)
  if (options.length < 2 || options.length > LETTERS.length) return null

  const answers = toLetters(source.answer).filter((letter) => LETTERS.indexOf(letter) >= 0 && LETTERS.indexOf(letter) < options.length)
  if (answers.length === 0) return null

  const unique = []
  for (const letter of answers) if (!unique.includes(letter)) unique.push(letter)
  unique.sort()

  const declaredType = source.type === 'multi' || source.type === 'single' ? source.type : undefined
  const type = declaredType === 'multi' ? 'multi' : declaredType === 'single' && unique.length === 1 ? 'single' : unique.length > 1 ? 'multi' : 'single'

  const rawId = typeof source.id === 'string' ? source.id.trim() : ''
  const id = rawId.length > 0 ? rawId : 'q-' + String(index + 1).padStart(4, '0')

  const text = (value) => (typeof value === 'string' ? value.trim() : '')

  return {
    id,
    subject: text(source.subject) || '未分类',
    chapter: text(source.chapter),
    type,
    stem,
    options,
    answer: unique,
    explain: text(source.explain),
    source: text(source.source),
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return null
    console.error('[kaoyan-quiz] 读取失败 ' + file + ':', error)
    return null
  }
}

async function writeJson(file, value) {
  await mkdir(dirname(file), { recursive: true })
  const temporary = file + '.tmp'
  await writeFile(temporary, JSON.stringify(value), 'utf8')
  await rename(temporary, file)
}

/** 内置题库只读一次；用户导入的题库单独存在 DSH_HOME 下，按 id 覆盖内置条目。 */
let builtinCache = null

async function loadBuiltin() {
  if (builtinCache !== null) return builtinCache
  const parsed = await readJson(join(here, 'bank.json'))
  const list = parsed && Array.isArray(parsed.questions) ? parsed.questions : []
  const questions = []
  for (let i = 0; i < list.length; i += 1) {
    const question = normalizeQuestion(list[i], i)
    if (question) questions.push(question)
  }
  builtinCache = { questions, title: typeof parsed?.title === 'string' ? parsed.title : '' }
  return builtinCache
}

async function loadCustom() {
  const parsed = await readJson(customBankFile)
  const list = parsed && Array.isArray(parsed.questions) ? parsed.questions : []
  const questions = []
  for (let i = 0; i < list.length; i += 1) {
    const question = normalizeQuestion(list[i], i)
    if (question) questions.push(question)
  }
  return questions
}

async function buildBank() {
  const builtin = await loadBuiltin()
  const custom = await loadCustom()

  const merged = new Map()
  for (const question of builtin.questions) merged.set(question.id, question)
  let overridden = 0
  let added = 0
  for (const question of custom) {
    if (merged.has(question.id)) overridden += 1
    else added += 1
    merged.set(question.id, question)
  }

  const questions = [...merged.values()]
  return {
    questions,
    meta: {
      title: builtin.title,
      builtin: builtin.questions.length,
      custom: custom.length,
      added,
      overridden,
      total: questions.length,
    },
  }
}

/* ------------------------------------------------------------------ 读写 */

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体超过 16 MiB 上限'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function handleUi(req, res) {
  const body = await readFile(join(here, 'ui.js'))
  res.writeHead(200, {
    'content-type': 'application/javascript; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': body.length,
  })
  res.end(req.method === 'HEAD' ? undefined : body)
}

async function handleBank(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    const bank = await buildBank()
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'cache-control': 'no-store' })
      res.end()
      return
    }
    sendJson(res, 200, { ok: true, ...bank })
    return
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    const raw = await readBody(req)
    let parsed
    try {
      parsed = raw.length === 0 ? null : JSON.parse(raw)
    } catch {
      sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' })
      return
    }
    const list = parsed && Array.isArray(parsed.questions) ? parsed.questions : null
    if (list === null) {
      sendJson(res, 400, { ok: false, error: '缺少 questions 数组' })
      return
    }

    const accepted = []
    const skipped = []
    for (let i = 0; i < list.length; i += 1) {
      const question = normalizeQuestion(list[i], i)
      if (question) accepted.push(question)
      else skipped.push({ index: i, reason: '缺少题干、选项不足 2 个或答案为空' })
    }
    if (accepted.length === 0) {
      sendJson(res, 400, { ok: false, error: '没有一条题目通过校验', skipped })
      return
    }

    // 覆盖式保存：整包替换，避免同一批题目被重复追加。
    await writeJson(customBankFile, { version: 1, savedAt: Date.now(), questions: accepted })
    sendJson(res, 200, { ok: true, accepted: accepted.length, skipped })
    return
  }

  if (req.method === 'DELETE') {
    await rm(customBankFile, { force: true })
    sendJson(res, 200, { ok: true })
    return
  }

  sendJson(res, 405, { ok: false, error: 'method not allowed' })
}

async function handleImport(req, res) {
  if (req.method !== 'POST' && req.method !== 'PUT') {
    sendJson(res, 405, { ok: false, error: 'method not allowed' })
    return
  }
  const raw = await readBody(req)
  let parsed
  try {
    parsed = raw.length === 0 ? null : JSON.parse(raw)
  } catch {
    sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' })
    return
  }
  const url = parsed && typeof parsed.url === 'string' ? parsed.url.trim() : ''
  let target
  try {
    target = new URL(url)
  } catch {
    sendJson(res, 400, { ok: false, error: '题库链接格式不对' })
    return
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    sendJson(res, 400, { ok: false, error: '只支持 http/https 链接' })
    return
  }

  let text
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30000)
    const response = await fetch(target, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'dsh-kaoyan-quiz/1.0' },
    })
    clearTimeout(timer)
    if (!response.ok) throw new Error('HTTP ' + response.status)
    const length = Number(response.headers.get('content-length') || 0)
    if (length > MAX_BODY_BYTES) throw new Error('文件超过 16MB')
    text = await response.text()
    if (text.length > MAX_BODY_BYTES) throw new Error('文件超过 16MB')
  } catch (error) {
    sendJson(res, 400, { ok: false, error: '下载题库失败：' + String((error && error.message) || error) })
    return
  }

  let data
  try {
    data = JSON.parse(text)
  } catch {
    sendJson(res, 400, { ok: false, error: '链接内容不是合法 JSON' })
    return
  }
  const list = data && Array.isArray(data.questions) ? data.questions : Array.isArray(data) ? data : null
  if (list === null) {
    sendJson(res, 400, { ok: false, error: '缺少 questions 数组' })
    return
  }

  const accepted = []
  const skipped = []
  for (let i = 0; i < list.length; i += 1) {
    const question = normalizeQuestion(list[i], i)
    if (question) accepted.push(question)
    else skipped.push({ index: i, reason: '缺少题干、选项不足 2 个或答案为空' })
  }
  if (accepted.length === 0) {
    sendJson(res, 400, { ok: false, error: '没有一条题目通过校验', skipped })
    return
  }
  await writeJson(customBankFile, { version: 1, savedAt: Date.now(), questions: accepted })
  sendJson(res, 200, { ok: true, accepted: accepted.length, skipped })
}

async function handleState(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    const state = await readJson(stateFile)
    sendJson(res, 200, { ok: true, state: state && typeof state === 'object' ? state : null })
    return
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    const raw = await readBody(req)
    let parsed
    try {
      parsed = raw.length === 0 ? null : JSON.parse(raw)
    } catch {
      sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' })
      return
    }
    const state = parsed && parsed.state !== undefined ? parsed.state : parsed
    if (state === null || typeof state !== 'object' || Array.isArray(state)) {
      sendJson(res, 400, { ok: false, error: 'state 必须是一个 JSON 对象' })
      return
    }
    await writeJson(stateFile, state)
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'DELETE') {
    await rm(stateFile, { force: true })
    sendJson(res, 200, { ok: true })
    return
  }

  sendJson(res, 405, { ok: false, error: 'method not allowed' })
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  ctx.inject(['webServer'], (webCtx) => {
    const routes = [
      { path: ROUTE_BASE + '/ui.js', handler: handleUi },
      { path: ROUTE_BASE + '/bank', handler: handleBank },
      { path: ROUTE_BASE + '/import', handler: handleImport },
      { path: ROUTE_BASE + '/state', handler: handleState },
    ]
    for (const route of routes) {
      webCtx.effect(
        () =>
          webCtx.webServer.register({
            kind: 'exact',
            path: route.path,
            async handler(req, res) {
              try {
                await route.handler(req, res)
              } catch (error) {
                console.error('[kaoyan-quiz] 路由失败 ' + route.path + ':', error)
                if (!res.headersSent) sendJson(res, 500, { ok: false, error: String((error && error.message) || error) })
                else res.end()
              }
            },
          }),
        'kaoyan-quiz:' + route.path,
      )
    }
  })
}
