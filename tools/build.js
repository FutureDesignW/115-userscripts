#!/usr/bin/env node
/**
 * 构建：把 src/core/115-core.js 内联进 scripts/*.user.js 的 CORE 标记区。
 *
 *   node tools/build.js          # 生成，直接改写 scripts/*.user.js
 *   node tools/build.js --check  # 只对比差异，不改文件（提交前 / CI 用）
 *
 * 为什么不直接 @require：
 *   这三个脚本都是「拖进 Tampermonkey 就能用」的单文件形态。一旦依赖远端 URL，
 *   离线就废了，而且 CDN 挂掉等于整个脚本挂掉。源码分家、产物合并，两头的好处都要。
 *
 * ⚠️ 内联之后必须同时把导出名字绑到本地变量（BUILD_APPEND 生成那行）——
 *    否则 MW115Core 挂在 window 上，闭包里的 escHtml() 全是 ReferenceError，
 *    而 node tools/check.js 的语法检查还照样通过（这类问题只有真跑起来才炸）。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CORE_FILE = path.join(ROOT, 'src', 'core', '115-core.js');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');

const BEGIN = /^([ \t]*)\/\* ==== MW115_CORE:BEGIN ==== \*\/[ \t]*$/m;
const END = /^[ \t]*\/\* ==== MW115_CORE:END ==== \*\/[ \t]*$/m;

function build() {
  if (!fs.existsSync(CORE_FILE)) {
    console.error('缺少核心源码：' + CORE_FILE);
    process.exit(1);
  }

  // 源文件里那句 module.exports 是给 Node 测试用的，内联时要去掉
  const core = fs.readFileSync(CORE_FILE, 'utf8')
    .replace(/^\s*if\s*\(typeof module[\s\S]*$/m, '')
    .replace(/\s*$/, '\n');

  // 导出名列表从真实导出对象里取，避免手抄漏一个
  const exported = Object.keys(require(CORE_FILE));
  if (!exported.length) {
    console.error('核心源码没有导出任何东西');
    process.exit(1);
  }
  const bindLine = 'var ' + exported.map((k) => k + ' = MW115Core.' + k).join(', ') + ';';

  const files = fs.readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith('.user.js'));
  let changed = 0;

  files.forEach((f) => {
    const file = path.join(SCRIPTS_DIR, f);
    const src = fs.readFileSync(file, 'utf8');
    const b = src.match(BEGIN);
    const e = src.match(END);
    if (!b || !e) return;                       // 没标记的脚本（如上游 115Master 打包版）跳过
    if (b.index > e.index) {
      console.error(`${f}：CORE 标记顺序反了`);
      process.exit(1);
    }
    const indent = ' '.repeat(4);
    const body = core.replace(/^(?!$)/gm, indent).replace(/[ \t]+$/gm, '');
    const next = src.slice(0, b.index) +
      `${indent}/* ==== MW115_CORE:BEGIN ==== */\n` +
      `${body}\n${indent}${bindLine}\n\n` +
      `${indent}/* ==== MW115_CORE:END ==== */` +
      src.slice(e.index + e[0].length);

    if (next === src) { console.log(`· ${f} 已是最新`); return; }
    if (process.argv.includes('--check')) {
      console.error(`✗ ${f} 与核心源码不同步，先跑 node tools/build.js`);
      process.exit(1);
    }
    fs.writeFileSync(file, next);
    changed++;
    console.log(`✓ ${f} 已内联核心（${core.length} 字节，导出 ${exported.join(' / ')}）`);
  });

  console.log(changed ? `\n完成，${changed} 个脚本已更新` : '\n没有需要更新的脚本');
}

build();
