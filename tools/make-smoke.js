// 生成一个「模拟 115 页面」的冒烟测试页：把真实的 115-toolbar.js 核心内联进去，
// 跑一次 mountOrFallback，然后把结果（挂在哪、有没有报错）写到 window.__RESULT。
// 用法：node tools/make-smoke.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CORE = path.join(ROOT, 'src', 'core', '115-toolbar.js');
const OUT = path.join(ROOT, 'tests', 'fixtures', 'toolbar-smoke.html');

const core = fs.readFileSync(CORE, 'utf8')
  .replace(/^\s*if\s*\(typeof module[\s\S]*$/m, '');

const page = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>工具栏挂载器 · 冒烟测试</title>
<style>
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; margin: 0; background: #fafbfc; }
  .hdr { padding: 16px 24px; font-size: 18px; font-weight: 600; }
  .wrap { padding: 0 24px; }
  /* —— 照 115 新版顶栏的 class 摆一套骨架 —— */
  .justify-between.w-full.pl-6.pr-5 {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 24px; background: #fff; border-bottom: 1px solid #e5e6eb;
  }
  .act-group { display: flex; align-items: center; gap: 6px; }
  .native { height: 32px; padding: 0 12px; border: 1px solid #d1d4d6; border-radius: 4px;
            background: #fff; font-size: 14px; cursor: pointer; }
  .files { padding: 24px; color: #909399; }
  #result { margin: 20px 24px; padding: 14px 16px; background: #fff; border: 1px solid #e5e6eb;
            border-radius: 8px; font: 13px/1.7 ui-monospace, Consolas, monospace; white-space: pre-wrap; }
  .ok { color: #67c23a; } .bad { color: #f56c6c; }
</style></head>
<body>
<div class="hdr">模拟 115 网盘页面</div>

<div class="justify-between w-full pl-6 pr-5">
  <div class="act-group" id="actGroup">
    <div class="view-group"><button class="native" title="列表视图">&#9776; 列表</button></div>
    <button class="native" title="网格视图">&#9638;</button>
    <button class="native" title="更多操作">&#8942; 更多</button>
  </div>
  <div style="margin-left:auto"><button class="native" title="上传">上传</button></div>
</div>

<div class="files">文件列表区域……</div>
<div id="result">运行中…</div>

<script>${core}</script>
<script>
(function () {
  var clicks = [];
  var out = {};
  try {
    // mountOrFallback 返回的是 { el, inToolbar }，不是元素本身
    var res = MW115Toolbar.mountOrFallback({
      id: 'demo-slot',
      buttons: [{
        label: '影片墙', dot: '#22d3ee', caret: true, menuTitle: '影片墙',
        items: [
          { label: '打开影片墙', onClick: function () { clicks.push('open'); } },
          { label: '影片墙设置', onClick: function () { clicks.push('settings'); } }
        ]
      }],
      fallback: function () {
        var d = document.createElement('div');
        d.id = 'demo-fb';
        d.textContent = '影片墙（降级）';
        d.style.cssText = 'position:fixed;right:18px;bottom:88px;padding:10px 14px;background:#7c5cff;color:#fff;border-radius:22px';
        return d;
      }
    });
    var slot = res && res.el;

    out.挂载成功 = !!slot;
    out.进工具栏 = !!(res && res.inToolbar);
    out.插入容器 = slot && slot.parentElement ? (slot.parentElement.className || slot.parentElement.id) : null;
    // 插在「列表视图」之前 = 自己是动作区的第一个子节点（previousElementSibling 为空）
    out.插在动作区最左 = !!(slot && slot.parentElement && !slot.previousElementSibling);
    out.降级球不该出现 = !document.getElementById('demo-fb');

    // 点一下主按钮 → 应该开菜单而不是直接执行动作
    var btn = slot && slot.querySelector('.mw115-tb-btn');
    if (btn) {
      btn.click();
      out.点主按钮开菜单 = slot.classList.contains('open');

      // ⚠️ 再点一次必须收得起。用户实机报「打开后就关不上了」——
      //    「点空白处收起」的监听绑在 document 捕获阶段，比按钮 handler 先跑，
      //    handler 里再读 wasOpen 就永远是 false，于是只走 add('open') 分支。
      //    这条必须在真浏览器里测：假 DOM 的事件模型曾经不跑捕获阶段，测不出来。
      btn.click();
      out.再点收得起 = !slot.classList.contains('open');

      // 点空白处（body）也要收
      btn.click();
      document.body.click();
      out.点空白收得起 = !slot.classList.contains('open');

      var item = slot.querySelector('.mw115-tb-menu a');
      if (item) {
        btn.click();                       // 先展开才能点菜单项
        item.click();
        out.菜单项可点 = true;
      }
    }
    out.点击记录 = clicks.join(',') || '（无）';
  } catch (e) {
    out.错误 = e.message;
    out.位置 = String(e.stack || '').split('\\n').slice(0, 3).join(' | ');
  }
  window.__RESULT = out;

  var EXPECT = {
    '挂载成功': true, '进工具栏': true, '插入容器': 'act-group',
    '插在动作区最左': true, '降级球不该出现': true,
    '点主按钮开菜单': true, '再点收得起': true, '点空白收得起': true,
    '菜单项可点': true, '点击记录': 'open'
  };
  var pass = 0, total = 0;
  var lines = Object.keys(out).map(function (k) {
    var want = Object.prototype.hasOwnProperty.call(EXPECT, k) ? EXPECT[k] : undefined;
    total++;
    var ok = want === undefined ? true : String(want) === String(out[k]);
    if (want !== undefined && ok) pass++;
    return '  ' + (ok ? '<span class="ok">✔</span> ' : '<span class="bad">✘</span> ') + k + ' = ' + String(out[k]);
  });
  var box = document.getElementById('result');
  box.innerHTML = '<b>冒烟测试结果</b>（' + pass + '/' + total + ' 项符合预期）\\n' + lines.join('\\n');
  document.title = (pass === total ? 'PASS ' : 'FAIL ') + pass + '/' + total;
})();
<\/script>
</body></html>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, page, 'utf8');
console.log('已生成：' + OUT);