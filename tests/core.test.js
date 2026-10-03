'use strict';
/** 公共核心的单元测试：
 *      node --test tests/
 *
 * 之所以要有这层：这些脚本跑在别人的浏览器里，我们既没有 115 的测试账号，
 * 也模拟不了 GM_* —— 只有纯函数是能在提交前被真正验证的部分。
 * 抽出来的核心价值也正在这里：把不敢测的逻辑，变成敢测的逻辑。
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const core = require('../src/core/115-core.js');
const ROOT = path.resolve(__dirname, '..');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');

test('escHtml：五个字符都要转义，含单引号', () => {
  assert.strictEqual(core.escHtml('<script>"a"&\'b\''),
    '&lt;script&gt;&quot;a&quot;&amp;&#39;b&#39;');
});

test('escHtml：空值不炸', () => {
  assert.strictEqual(core.escHtml(null), '');
  assert.strictEqual(core.escHtml(undefined), '');
  assert.strictEqual(core.escHtml(0), '0');
});

test('escHtml：原来的整理助手版本漏了单引号 —— 这里锁死不能退化', () => {
  const oldBuggy = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  assert.notStrictEqual(oldBuggy("it's"), core.escHtml("it's"));
  assert.ok(core.escHtml("it's").includes('&#39;'));
});

test('fmtBytes：单位边界', () => {
  assert.strictEqual(core.fmtBytes(0), '0 B');
  assert.strictEqual(core.fmtBytes(999), '999 B');
  assert.strictEqual(core.fmtBytes(1023), '1023 B');
  assert.strictEqual(core.fmtBytes(1024), '1.0 KB');
  assert.strictEqual(core.fmtBytes(1048575), '1024.0 KB');
  assert.strictEqual(core.fmtBytes(1048576), '1.00 MB');
});

test('fmtVideoSize：过 GB 才切单位', () => {
  assert.strictEqual(core.fmtVideoSize(0), '');
  assert.strictEqual(core.fmtVideoSize(null), '');
  assert.strictEqual(core.fmtVideoSize(1024 * 1024 * 800), '800 MB');
  assert.strictEqual(core.fmtVideoSize(1073741824), '1.00 GB');
  assert.strictEqual(core.fmtVideoSize(3221225472), '3.00 GB');   // 3GB
});

test('pickcodeOf：挡住历史遗留的标记位 o:1', () => {
  assert.strictEqual(core.pickcodeOf(1), '');
  assert.strictEqual(core.pickcodeOf('1'), '');
  assert.strictEqual(core.pickcodeOf(undefined), '');
  assert.strictEqual(core.pickcodeOf(null), '');
  assert.strictEqual(core.pickcodeOf({}), '');
  assert.strictEqual(core.pickcodeOf('abc'), '');          // 短得像标记位
  assert.strictEqual(core.pickcodeOf('abc12345'), 'abc12345');
  assert.strictEqual(core.pickcodeOf('A1b2C3d4E5'), 'A1b2C3d4E5');
  assert.strictEqual(core.pickcodeOf('abc_def-123'), 'abc_def-123');
  assert.strictEqual(core.pickcodeOf('含有中文的pickcode'), '');
});

test('每个自带 CORE 标记的脚本都是最新内联，且语法正确', () => {
  const files = fs.readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith('.user.js'));
  let checked = 0;
  files.forEach((f) => {
    const src = fs.readFileSync(path.join(SCRIPTS_DIR, f), 'utf8');
    if (!src.includes('MW115_CORE:BEGIN')) return;
    checked++;
    // ① 语法要能编译（这条挡住过一次「重复声明 posterObserver」）
    new vm.Script(src, { filename: f });
    // ② 必须同时存在 BEGIN / END
    assert.ok(src.includes('MW115_CORE:END'), `${f} 缺少 END 标记`);
    // ③ 老 UMD 形态会把函数挂到 window 上、闭包里拿不到名字 —— 编译能过、运行才炸
    assert.ok(!src.includes('var api = factory'), `${f} 残留旧的 UMD 注入形态`);
    // ④ 导出名必须绑到本地变量，否则调用点全是 ReferenceError
    ['escHtml', 'fmtBytes', 'fmtVideoSize', 'pickcodeOf'].forEach((name) => {
      const ok = new RegExp('\\b' + name + ' = MW115Core\\.' + name + '\\b').test(src);
      assert.ok(ok, `${f} 缺少 ${name} 的本地绑定`);
    });
  });
  assert.strictEqual(checked, 2, '应当有 2 个脚本接入了公共核心');
});

/* ----------------------------------------------------------------------------
 * 结构性回归：这两个功能都是「接线型」的 —— 少一根线（菜单没绑、类名没加、
 * 默认值没写进 CFG_DEF）在代码里看不出来，只有用户点了没反应才知道。
 * 这里把线一根根钉住。
 * ------------------------------------------------------------------------- */

const readScript = (name) => fs.readFileSync(path.join(SCRIPTS_DIR, name), 'utf8');

test('影片墙：视图切换接线完整（海报墙 ⇄ 紧凑列表）', () => {
  const src = readScript('115影片墙.user.js');

  // ① 默认值必须在 CFG_DEF 里，否则老用户配置里没这个键 → applyLayout 读到 undefined
  assert.ok(/listView:\s*'wall'/.test(src), 'CFG_DEF 缺少 listView 默认值');
  // ② CSS 里得真有这套版式
  assert.ok(src.includes('.mw-grid.mw-list'), '缺少 .mw-grid.mw-list 样式');
  // ③ 工具栏按钮 + 点击处理
  assert.ok(src.includes('data-act="toggle-view"'), '工具栏缺少视图切换按钮');
  assert.ok(/act === 'toggle-view'/.test(src), '缺少 toggle-view 的点击处理');
  // ④ applyLayout 负责把类名贴上去（两条路径：按钮切换 / 设置面板改）
  assert.ok(/classList\.toggle\('mw-list'/.test(src), 'applyLayout 没有切换 mw-list 类');
  // ⑤ 设置面板里也要能改
  assert.ok(/k:\s*'listView'/.test(src), '设置面板缺少视图选项');
  // ⑥ 切换后要持久化
  assert.ok(/saveCfg\(\);\s*\n\s*\/\/ 版式本身是纯 CSS/.test(src), '切换视图后没有 saveCfg');
});

test('整理助手：改名回滚接线完整', () => {
  const src = readScript('115整理助手.user.js');

  // ① 日志要有独立的存储键与读容错（坏 JSON 不能让脚本起不来）
  assert.ok(/ROLLBACK_KEY\s*=\s*'jb_renameJournal'/.test(src), '缺少回滚日志存储键');
  assert.ok(/function loadRenameJournal\(\)/.test(src), '缺少回滚日志读取函数');
  assert.ok(/Array\.isArray\(arr\)\s*\?\s*arr\.filter/.test(src), '回滚日志读取没有过滤残条目');
  // ② 只有「改成功了」才记（失败也记 = 回滚时去改名一个本来就没改的文件）
  assert.ok(/if \(origFilename && id && !\(opts && opts\.noJournal\)\)/.test(src),
    'send_115 没有「成功才记 + 可跳过记录」的判断');
  // ③ finish 必须带成功标志，回滚要靠它筛出真正改成的条目
  assert.ok(/const finish = \(ok\) =>/.test(src), 'send_115 的 finish 没有回传成功标志');
  // ④ 每个新批次开始都要重置，否则日志会跨批次累积、回滚对象不明确
  assert.ok((src.match(/resetRenameJournal\(\);/g) || []).length >= 2,
    '改名批次开始处没有重置回滚日志');
  // ⑤ 菜单项 + 绑定
  assert.ok(src.includes('id="undo_last_rename"'), '菜单里没有「撤销上次改名」项');
  assert.ok(/\$\("a#undo_last_rename"\)\.off\("click"\)\.on\("click", undoLastRename\)/.test(src),
    '菜单项没有绑定 undoLastRename');
  // ⑥ 回滚前必须弹确认（不可逆操作）
  assert.ok(/确定回滚？/.test(src), '回滚前没有确认框');
  // ⑦ 回滚本身要能再撤销一次
  assert.ok(/renameJournal = inverse;/.test(src), '回滚后没有写回反向映射');
});

