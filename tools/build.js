#!/usr/bin/env node
/**
 * 构建：把 src/core/*.js 内联进 scripts/*.user.js 对应的标记区。
 *
 *   node tools/build.js          # 生成，直接改写 scripts/*.user.js
 *   node tools/build.js --check  # 只对比差异，不改文件（提交前 / CI 用）
 *
 * 为什么不直接 @require：
 *   这三个脚本都是「拖进 Tampermonkey 就能用」的单文件形态。一旦依赖远端 URL，
 *   离线就废了，而且 CDN 挂掉等于整个脚本挂掉。源码分家、产物合并，两头的好处都要。
 *
 * ⚠️ 内联之后必须同时把导出名字绑到本地变量（下面生成的 bindLine）——
 *    否则 MW115Core 挂在 window 上，闭包里的 escHtml() 全是 ReferenceError，
 *    而 node tools/check.js 的语法检查还照样通过（这类问题只有真跑起来才炸）。
 *
 * 标记区名与 src/core 的文件名一一对应：
 *   src/core/115-core.js     → /* ==== MW115_CORE:BEGIN ==== *…
 *   src/core/115-toolbar.js  → /* ==== MW115_TOOLBAR:BEGIN ==== *…
 * 增删核心只要在 CORES 里加一行，脚本侧摆一对同名标记即可，不用改本文件。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CORE_DIR = path.join(ROOT, 'src', 'core');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');

/** 每个核心：源码文件名 → 标记区名（= 去掉 .js 的大写化标识）
    bind:false 表示不生成「导出名 → 本地变量」那行，调用方直接用 MW115Toolbar.xxx。
    115-toolbar 就关掉了：它导出的 mount / normText / isDisplayed 这类名字太通用，
    塞进脚本作用域等于跟脚本自己的变量抢同名（function 声明还会被 var 静默覆盖）。 */
const CORES = [
  { file: '115-core.js', bind: true },
  { file: '115-toolbar.js', bind: false }
];

function markerRe(name) {
  return {
    begin: new RegExp('^([ \\t]*)/\\* ==== ' + name + ':BEGIN ==== \\*/[ \\t]*$', 'm'),
    end: new RegExp('^[ \\t]*/\\* ==== ' + name + ':END ==== \\*/[ \\t]*$', 'm'),
  };
}

/** 标记区名：115-core.js → MW115_CORE（脚本里的标记必须跟这个一致）
    文件名开头那段数字是产品代号（115），跟标记前缀重复，要去掉 ——
    否则会拼出 MW115_115_CORE，标记一个都匹配不上，然后「已是最新」地静默过去。 */
function markerName(file) {
  const parts = path.basename(file, '.js').split('-').map((s) => s.toUpperCase());
  if (parts.length > 1 && /^\d+$/.test(parts[0])) parts.shift();
  return 'MW115_' + parts.join('_');
}

/** 源文件里那个真正的全局名。必须从源码里读出来，不能拿标记名去拼 ——
    标记叫 MW115_TOOLBAR，可变量叫 MW115Toolbar，猜错了整段脚本全是 ReferenceError，
    而 node tools/check.js 的语法检查照样通过（只有真跑起来才炸）。 */
function declaredGlobal(src) {
  const m = src.match(/^\s*var\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\(function|function)/m);
  if (!m) {
    console.error('核心源码里找不到 `var X = (function` 形式的顶层声明');
    process.exit(1);
  }
  return m[1];
}

function loadCore(file, bind) {
  const full = path.join(CORE_DIR, file);
  if (!fs.existsSync(full)) {
    console.error('缺少核心源码：' + full);
    process.exit(1);
  }
  const raw = fs.readFileSync(full, 'utf8');
  // 源文件里那句 module.exports 是给 Node 测试用的，内联时要去掉
  const body = raw
    .replace(/^\s*if\s*\(typeof module[\s\S]*$/m, '')
    .replace(/\s*$/, '\n');

  // 导出名列表从真实导出对象里取，避免手抄漏一个
  const exported = Object.keys(require(full));
  if (!exported.length) {
    console.error(file + ' 没有导出任何东西');
    process.exit(1);
  }
  const globalName = declaredGlobal(raw);
  const bindLine = bind
    ? 'var ' + exported.map((k) => k + ' = ' + globalName + '.' + k).join(', ') + ';'
    : '';
  return { body, bindLine, exported, globalName };
}

function build() {
  const cores = CORES.map((c) => Object.assign({ name: markerName(c.file) }, loadCore(c.file, c.bind)));
  const files = fs.readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith('.user.js'));
  let changed = 0;

  files.forEach((f) => {
    const file = path.join(SCRIPTS_DIR, f);
    let src = fs.readFileSync(file, 'utf8');
    const touched = [];
    // 这个脚本到底接不接核心？之前 markerName 拼错（「115_CORE」而非「MW115_CORE」）
    // 导致标记全部匹配不上，脚本里却「已是最新」地过去了 —— 静默失效最难查。
    // 用「文件里有没有出现 MW115_ 字样」判定：没有就说明它本来就不接核心，跳过是对的。
    const usesCores = /\/\* ==== MW115_[A-Z_]+:BEGIN ==== \*\//.test(src);
    if (!usesCores) { console.log(`· ${f} 未使用核心标记，跳过`); return; }

    cores.forEach((core) => {
      const { begin, end } = markerRe(core.name);
      const b = src.match(begin);
      const e = src.match(end);
      if (!b || !e) return;                 // 没标记的脚本（如上游 115Master 打包版）跳过
      if (b.index > e.index) {
        console.error(`${f}：${core.name} 标记顺序反了`);
        process.exit(1);
      }
      const indent = ' '.repeat(4);
      const body = core.body.replace(/^(?!$)/gm, indent).replace(/[ \t]+$/gm, '');
      const tail = core.bindLine ? `${body}\n${indent}${core.bindLine}\n` : `${body}\n`;
      const next = src.slice(0, b.index) +
        `${indent}/* ==== ${core.name}:BEGIN ==== */\n` +
        tail +
        `${indent}/* ==== ${core.name}:END ==== */` +
        src.slice(e.index + e[0].length);

      if (next !== src) { src = next; touched.push(core.name); }
    });

    if (!touched.length) { console.log(`· ${f} 已是最新`); return; }
    if (process.argv.includes('--check')) {
      console.error(`✗ ${f} 与核心源码不同步（${touched.join(', ')}），先跑 node tools/build.js`);
      process.exit(1);
    }
    fs.writeFileSync(file, src);
    changed++;
    console.log(`✓ ${f} 已内联 ${touched.join(' + ')}`);
  });

  // 反向核对：脚本里摆的每个标记区都得有对应核心，否则就是「标记写了但永远不会被填充」，
  // 属于静默失效 —— 直接报错，别让它混过去。
  files.forEach((f) => {
    const src = fs.readFileSync(path.join(SCRIPTS_DIR, f), 'utf8');
    const declared = [...src.matchAll(/\/\* ==== (MW115_[A-Z_]+):BEGIN ==== \*\//g)].map((m) => m[1]);
    declared.forEach((name) => {
      if (!cores.some((c) => c.name === name)) {
        console.error(`✗ ${f} 摆了 ${name} 标记区，但 src/core 里没有对应核心`);
        process.exit(1);
      }
    });
  });

  console.log(changed ? `\n完成，${changed} 个脚本已更新` : '\n没有需要更新的脚本');
}

build();