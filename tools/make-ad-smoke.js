// 生成「广告拦截」冒烟测试页。
// 把 scripts/115整理助手.user.js 里的广告拦截模块**原样截出来**（不是重写一份，
// 避免测的和跑的不是同一段代码），内联进一个真实页面，用真实 DOM 跑一遍。
//
// 重点验「摘到哪一层」—— 无脑往上摘会把整个侧栏捅掉，这个只能在真 DOM 里看出来。
// 用法：node tools/make-ad-smoke.js  然后用 Edge headless --dump-dom 读 #result
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', '115整理助手.user.js');
const OUT = path.join(ROOT, 'tests', 'fixtures', 'ad-smoke.html');

const all = fs.readFileSync(SCRIPT, 'utf8');
const FROM = 'const AD_SWITCH_KEY =';
const TO = '// 弹窗是延迟注入的';
const a = all.indexOf(FROM);
const b = all.indexOf(TO);
if (a < 0 || b < 0 || b <= a) {
  console.error('截取失败（FROM=' + a + ', TO=' + b + '）—— 脚本结构变了，改这里的锚点');
  process.exit(1);
}
const mod = all.slice(a, b);
// 自检：截出来的必须是完整模块，缺一个函数就跑不起来
['isAdLayer', 'isAdMedia', 'isAdAnchor', 'killAdAnchor', 'killAds'].forEach((fn) => {
  if (mod.indexOf('const ' + fn + ' =') < 0) {
    console.error('截出来的模块缺 ' + fn + ' —— 锚点选错了');
    process.exit(1);
  }
});

const page = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>广告拦截 · 冒烟测试</title>
<style>
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; margin: 0; background: #fafbfc; }
  .hdr { padding: 16px 24px; font-size: 18px; font-weight: 600; }
  .ad-float { position: fixed; right: 16px; bottom: 80px; width: 200px; height: 120px;
              background: #eef; border: 1px solid #ccd; border-radius: 8px; }
  .side { position: fixed; left: 0; top: 80px; width: 160px; background: #fff;
          border-right: 1px solid #e5e6eb; padding: 8px; }
  .side a { display: block; padding: 6px 8px; font-size: 13px; }
  .normal { padding: 12px 24px; }
  .ad-wrap { padding: 10px; border: 1px dashed #ccd; margin: 12px 24px; }
  .ad-inner { padding: 8px; }
  #result { margin: 20px 24px; padding: 14px 16px; background: #fff; border: 1px solid #e5e6eb;
            border-radius: 8px; font: 13px/1.7 ui-monospace, Consolas, monospace; white-space: pre-wrap; }
  .ok { color: #67c23a; } .bad { color: #f56c6c; }
</style></head>
<body>
<div class="hdr">广告拦截冒烟测试</div>

<div class="ad-float" id="case1">
  <a ref="href" href="https://www.115.com/17?f=ad1#&amp;f=ad2#" target="_top"><s ref="text">你的回忆 · 一直都存在</s></a>
</div>

<div class="side" id="case2">
  <a href="https://www.115.com/17?f=ad1">推广位</a>
  <a href="https://115.com/?ct=file">我的文件</a>
</div>

<div class="normal" id="case3">
  <a href="https://115.com/?ct=file&amp;ac=snapshot">正常链接</a>
</div>

<div class="ad-wrap" id="case4">
  <div class="ad-inner">
    <a href="https://www.115.com/17?f=ad2">另一个推广位</a>
  </div>
</div>

<div id="result">运行中…</div>

<script>
  window.GM_getValue = function () { return true; };   // 模块顶层的开关默认值
  window.GM_setValue = function () {};
<\/script>
<script>${mod}<\/script>
<script>
(function () {
  // ⚠️ 不能直接用 body.textContent 判文案 —— 它会把内联的 <script> 源码也算进去，
  //    而断言里写的 '你的回忆' 这几个字就在被测脚本/本段代码里，于是永远「找得到」。
  //    （第一版就是这么挂的：7/8，唯一那条失败是测试自己坑自己。）
  var pageText = function () {
    var txt = '';
    Array.prototype.forEach.call(document.body.children, function (n) {
      if (n.tagName === 'SCRIPT') return;
      txt += n.textContent || '';
    });
    return txt;
  };
  var out = {};
  try {
    killAds();
    // 用例 1：右下角推广位，外层是个「只装它一个」的空壳 div → 整块该没
    out['① 空壳容器被整块摘'] = !document.getElementById('case1');
    out['① 广告文案消失'] = pageText().indexOf('你的回忆') < 0;
    // 用例 2：侧栏里混着一个推广链接 → 只摘链接，侧栏和正常入口必须活着
    out['② 推广链接被摘'] = !document.querySelector('#case2 a[href*="f=ad"]');
    out['② 侧栏还在'] = !!document.getElementById('case2');
    out['② 正常入口还在'] = pageText().indexOf('我的文件') >= 0;
    // 用例 3：普通链接不该被动
    out['③ 普通链接没动'] = !!document.querySelector('#case3 a');
    // 用例 4：套了两层空壳 → 一路往上摘
    out['④ 两层空壳一起摘'] = !document.getElementById('case4');
    // 别把自己人也摘了
    out['⑤ 结果面板还在'] = !!document.getElementById('result');
  } catch (e) {
    out['错误'] = e.message;
  }
  window.__RESULT = out;

  var EXPECT = {
    '① 空壳容器被整块摘': true,
    '① 广告文案消失': true,
    '② 推广链接被摘': true,
    '② 侧栏还在': true,
    '② 正常入口还在': true,
    '③ 普通链接没动': true,
    '④ 两层空壳一起摘': true,
    '⑤ 结果面板还在': true
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
  if (box) box.innerHTML = '<b>广告拦截冒烟结果</b>（' + pass + '/' + total + ' 项符合预期）\\n' + lines.join('\\n');
  document.title = (pass === total ? 'PASS ' : 'FAIL ') + pass + '/' + total;
})();
<\/script>
</body></html>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, page, 'utf8');
console.log('已生成：' + OUT);
