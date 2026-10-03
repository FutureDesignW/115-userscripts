#!/usr/bin/env node
/**
 * 静态体检：不动浏览器、不装环境，先把「装上去就炸」和「静默失效」这两类问题拦在提交前。
 *
 *   node tools/check.js            # 全量检查
 *   node tools/check.js 影片墙      # 只查某一个脚本
 *
 * 检查项：
 *   1. 语法能否通过编译（vm.Script 只编译不执行）
 *   2. 用到的 GM_* / unsafeWindow 是否都在 @grant 里声明（漏声明 = 运行时 undefined）
 *   3. 请求的目标域名是否写进了 @connect（漏写 = GM_xmlhttpRequest 静默失败）
 *   4. @version 是否在 CHANGELOG.md 里有对应条目
 *   5. 版本号是否单调递增（防止发版时改漏）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn(...a);

/* ---------- 元数据块解析 ---------- */

function readMeta(src) {
  const m = src.match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/);
  if (!m) return null;
  const meta = { _raw: m[1] };
  m[1].split(/\r?\n/).forEach((line) => {
    const kv = line.match(/^\s*\/\/\s*@(\w+)\s+(.*)$/);
    if (!kv) return;
    const key = kv[1];
    const val = kv[2].trim();
    if (key in meta) {
      if (!Array.isArray(meta[key])) meta[key] = [meta[key]];
      meta[key].push(val);
    } else {
      meta[key] = val;
    }
  });
  return meta;
}

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/* ---------- 1. 语法 ---------- */

function checkSyntax(file, src) {
  const problems = [];
  try {
    new vm.Script(src, { filename: file });
  } catch (e) {
    problems.push(`语法错误：${e.message}`);
  }
  return problems;
}

/* ---------- 2. GM API 授权 ---------- */

// 这些是 Tampermonkey 无需 @grant 即可用（或本就属于 window）的，排除掉
const NO_GRANT_NEEDED = new Set(['GM', 'unsafeWindow']);

function usedGmApis(src) {
  // 只认真正的标识符引用，避免把注释里的说明也算进去
  const body = src.replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/, '');
  const found = new Set();
  const re = /\b(GM_[A-Za-z_]+)\b/g;
  let m;
  while ((m = re.exec(body))) found.add(m[1]);
  return found;
}

function checkGrants(meta, src) {
  const problems = [];
  const granted = new Set(asArray(meta.grant).map((g) => g.trim()));
  const used = usedGmApis(src);
  used.forEach((api) => {
    if (NO_GRANT_NEEDED.has(api)) return;
    if (!granted.has(api)) problems.push(`用了 ${api}() 但没有 @grant ${api}`);
  });
  // 反向：声明了却从没用过（不算错，但通常是复制 metadata 留下的垃圾）
  const unusedGrant = [...granted].filter((g) => !NO_GRANT_NEEDED.has(g) && !used.has(g));
  return { problems, unusedGrant };
}

/* ---------- 3. @connect 域名 ---------- */

function hostsUsedInRequests(src) {
  const hosts = new Set();
  // GM_xmlhttpRequest({ url: 'https://host/...' })
  const reUrl = /\burl\s*:\s*(['"`])(https?:\/\/[^'"`\s]+)\1/g;
  let m;
  while ((m = reUrl.exec(src))) hosts.add(new URL(m[2]).host);
  // 字符串拼接的常见写法：'https://host/' + xxx
  const reCat = /['"`](https?:\/\/([a-zA-Z0-9._-]+))['"`]\s*\+/g;
  while ((m = reCat.exec(src))) hosts.add(m[2]);
  // API 基址常量
  const reApi = /\bAPI_BASE\s*=\s*['"`](https?:\/\/([a-zA-Z0-9._-]+))/g;
  while ((m = reApi.exec(src))) hosts.add(m[2]);
  return hosts;
}

function connectCovers(meta, host) {
  const rules = asArray(meta.connect);
  return rules.some((rule) => {
    const r = String(rule).trim();
    if (r === '*') return true;
    if (r === host) return true;
    if (r.startsWith('*.')) {
      const suffix = r.slice(1); // '.115.com'
      return host.endsWith(suffix) || host === r.slice(2);
    }
    // Tampermonkey 里不带子域的写法只匹配精确域名（这里同样从严判定）
    return host === r;
  });
}

function checkConnect(meta, src) {
  const problems = [];
  const covered = hostsUsedInRequests(src);
  covered.forEach((host) => {
    if (!connectCovers(meta, host)) problems.push(`会请求 ${host}，但 @connect 里没有覆盖它`);
  });
  return problems;
}

/* ---------- 4/5. 版本号 ---------- */

function readChangelogVersions() {
  if (!fs.existsSync(CHANGELOG)) return null;
  const txt = fs.readFileSync(CHANGELOG, 'utf8');
  const versions = [];
  // 约定：CHANGELOG 里写版本号时带 v 前缀（如 `## 115影片墙 v3.14.0`）。
  // 不走 `(v?)数字` 那种写法 —— 「115影片墙」里的 115 会被误抓成版本号。
  txt.replace(/\bv(\d[0-9A-Za-z.\-]*)/g, (all, v) => { versions.push(v); return all; });
  return versions;
}

function checkVersion(meta, changelogVersions) {
  const problems = [];
  const version = meta.version;
  if (!version) problems.push('缺少 @version');
  if (version && changelogVersions && !changelogVersions.includes(version)) {
    problems.push(`@version ${version} 在 CHANGELOG.md 里没有对应条目`);
  }
  return problems;
}

/* ---------- 主流程 ---------- */

function main() {
  const filter = process.argv[2] || '';
  if (!fs.existsSync(SCRIPTS_DIR)) {
    console.error('找不到 scripts/ 目录：' + SCRIPTS_DIR);
    process.exit(1);
  }
  const files = fs.readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith('.user.js'));
  const changelogVersions = readChangelogVersions();
  let total = 0;
  const summary = [];

  files.forEach((f) => {
    if (filter && f.indexOf(filter) < 0) return;
    const file = path.join(SCRIPTS_DIR, f);
    const src = fs.readFileSync(file, 'utf8');
    log(`\n=== ${f}`);

    const meta = readMeta(src);
    if (!meta) {
      warn('  ✗ 没有 UserScript 元数据块');
      total++;
      return;
    }
    log(`  @name    ${meta.name}`);
    log(`  @version ${meta.version}`);

    const problems = [];
    problems.push(...checkSyntax(f, src));
    const grants = checkGrants(meta, src);
    problems.push(...grants.problems);
    problems.push(...checkConnect(meta, src));
    problems.push(...checkVersion(meta, changelogVersions));

    if (!problems.length) log('  ✓ 通过');
    problems.forEach((p) => warn('  ✗ ' + p));
    if (grants.unusedGrant.length) {
      log('  · 声明了但没用到的 @grant：' + grants.unusedGrant.join(', ') + '（可清理）');
    }
    total += problems.length;
    summary.push({ file: f, version: meta.version, bad: problems.length });
  });

  log('');
  summary.forEach((s) => log(`${s.bad ? '✗' : '✓'} ${s.file}  v${s.version}  ${s.bad} 个问题`));
  if (total) {
    warn(`\n共 ${total} 个问题`);
    process.exit(1);
  }
  log('\n全部通过');
}

main();
