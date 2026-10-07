// 生成「影片墙覆盖层」冒烟测试页。
//
// 用户实机反馈：覆盖层只盖住 115 的文件列表区，顶栏/侧栏那块没盖住。
// 后来又补了关键一句：**重装后第一次是好的、刷新一次就坏** —— 说明跟页面运行期状态有关。
// `#mw-overlay{position:fixed;inset:0}` 挂在 body 上，正常必然铺满视口，会失守只有两条路：
//   ① 115 给 body/某个容器挂了 transform/filter
//      → fixed 的包含块从「视口」变成那个祖先，覆盖层跟着缩水
//   ② 115 顶栏用了 z-index:2147483647（int32 上限），比覆盖层的 2147483500 还高 → 被盖住
// 首选解法是进 top layer（原生 popover）；进不去就按包含块反算坐标（fitViewport）。
// 这个页面把三条都摆出来验。
//
// ⚠️ CSS 和 fitViewport 都是**从脚本里原样抠出来的**（不是手抄一份），脚本改了这里会跟着变。
// 抠不到就直接报错退出 —— 那说明修复被回退了。
//
// 用法：node tools/make-overlay-smoke.js，再用 Edge headless --dump-dom 读 #result
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', '115影片墙.user.js');
const OUT = path.join(ROOT, 'tests', 'fixtures', 'overlay-smoke.html');

const all = fs.readFileSync(SCRIPT, 'utf8');
// 抠出 #mw-overlay 的整组规则（到 `#mw-overlay *` 那条通用规则之前为止）
const hit = all.match(/#mw-overlay\{[\s\S]*?(?=\s*#mw-overlay \*)/);
if (!hit) {
  console.error('抠不出 #mw-overlay 的样式规则 —— 脚本结构变了，改这里的正则');
  process.exit(1);
}
const css = hit[0];
const need = [
  [/position:\s*fixed/, 'position:fixed'],
  [/inset:\s*0/, 'inset:0'],
  [/\[popover\]\{[^}]*width:\s*auto/, '[popover] 的尺寸重置'],
  [/\[popover\]:not\(:popover-open\)\{[^}]*display:\s*none/, '[popover] 关闭态的 display:none'],
  [/\.mw-nolayer\{[^}]*z-index:\s*2147483647/, '兜底的 .mw-nolayer z-index 上限']
];
need.forEach(([re, label]) => {
  if (!re.test(css)) {
    console.error('抠出来的样式里缺「' + label + '」—— 覆盖层的 top layer / 兜底修复被回退了');
    process.exit(1);
  }
});
console.log('抠到 ' + css.split('\n').length + ' 行 #mw-overlay 样式，含 top layer + 兜底那几条 ✓');

/** 从脚本里原样抠一个函数（按大括号配对），保证测的就是跑的那份代码。 */
function grabFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('脚本里找不到函数 ' + name + ' —— 结构变了，改这里的抠法');
  let depth = 0;
  const start = src.indexOf('{', i);
  for (let k = start; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(i, k + 1); }
  }
  throw new Error('函数 ' + name + ' 的括号配不上对');
}
// 兜底路径的整条链，全部原样抠出来（保住函数之间的调用关系，测的就是跑的那份代码）
const LAYER_FNS = ['topLayerState', 'vpSize', 'layerCoversViewport', 'toTopLayer',
  'outTopLayer', 'fitViewport', 'clearFit', 'ensureOverlayTopLayer'];
const fnSrc = 'let layerMode = \'-\';\nlet layerError = \'\';\n' +
  LAYER_FNS.map((n) => grabFn(all, n)).join('\n\n') +
  '\n\nvar layerInfo = function () { return layerMode + (layerError ? \'（\' + layerError + \'）\' : \'\'); };';
console.log('抠到兜底函数链 ' + LAYER_FNS.length + ' 个 ✓');

const page = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>覆盖层 · 冒烟测试</title>
<style>
  html, body { margin: 0; height: 100%; background: #f0f2f5; font-family: system-ui, sans-serif; }
  /* 模拟 115：顶栏 z-index 顶到 int32 上限，比覆盖层的 2147483500 高 */
  #fake-top { position: fixed; top: 0; left: 0; right: 0; height: 60px; background: #fff;
              border-bottom: 1px solid #ddd; z-index: 2147483647; }
  #fake-side { position: fixed; top: 60px; left: 0; bottom: 0; width: 180px; background: #fafafa;
               border-right: 1px solid #ddd; z-index: 2147483647; }
  #files { margin: 80px 0 0 200px; height: 300px; background: #fff; border: 1px solid #ddd; }

  /* —— 从脚本里抠出来的真实规则 —— */
  ${css}

  /* 覆盖层内部的从属浮层（详情面板那种），随手摆一个够大的占位 */
  #mw-detail-ov { position: fixed; inset: 0; z-index: 2147483610; background: rgba(0,0,0,.6); }

  #result { padding: 14px 18px; font: 13px/1.7 ui-monospace, Consolas, monospace;
            white-space: pre-wrap; background: #fff; position: relative; z-index: 1; }
  .ok { color: #67c23a; } .bad { color: #f56c6c; }
</style></head>
<body>
<div id="fake-top">115 顶栏</div>
<div id="fake-side">目录树</div>
<div id="files">文件列表区……</div>

<div id="mw-overlay"><div id="mw-detail-ov"></div></div>
<div id="result">运行中…</div>

<script>
(function () {
  var out = {};
  var ov = document.getElementById('mw-overlay');

  // —— 从脚本里原样抠出来的兜底逻辑 ——
  ${fnSrc}

  // 1×1 之外还要留 20px 容差：有滚动条时 fixed/popover 的 inset:0 不含滚动条宽度
  var covers = function (el) {
    var r = (el || ov).getBoundingClientRect();
    return r.width >= window.innerWidth - 20 && r.height >= window.innerHeight - 20;
  };
  var size = function (el) {
    var r = (el || ov).getBoundingClientRect();
    return Math.round(r.width) + '×' + Math.round(r.height) +
           ' @ ' + Math.round(r.left) + ',' + Math.round(r.top);
  };
  // 顶栏正中间那点，返回最上层元素 —— 用来判「有没有被顶栏盖住」
  var topAt = function () {
    var e = document.elementFromPoint(20, 30);
    return e ? (e.id || e.tagName) : 'null';
  };
  var inTopLayer = function () {
    try { return ov.matches(':popover-open'); } catch (e) { return false; }
  };

  try {
    out['视口'] = window.innerWidth + '×' + window.innerHeight;

    // —— 走真实脚本那条路：setAttribute('popover','manual') + showPopover() ——
    if (typeof ov.showPopover !== 'function') {
      out['错误'] = '这个内核没有 popover API，脚本会退回普通 fixed（兜底路径见 ⑦）';
      throw new Error('no popover');
    }
    ov.setAttribute('popover', 'manual');
    ov.showPopover();

    out['① 进了 top layer'] = inTopLayer();
    out['② 无 transform 时铺满'] = covers();
    out['② 无 transform 时尺寸'] = size();

    // —— 关键 1：body 挂 transform（115 可能用这招做 GPU 提升）——
    document.body.style.transform = 'translateZ(0)';
    void document.body.offsetHeight;          // 强制重排
    out['③ body 有 transform 后仍铺满'] = covers();
    out['③ body 有 transform 后尺寸'] = size();

    // —— 关键 2：顶栏 z-index 2147483647，谁在最上面 ——
    out['④ 顶栏处最上层'] = topAt();
    out['④ 覆盖层盖住了顶栏'] = ov.contains(document.elementFromPoint(20, 30));

    // —— 从属浮层挂在覆盖层内部，要跟着一起在最上面（不能落在顶栏下面）——
    out['⑤ 内部浮层也在顶栏之上'] = ov.contains(document.elementFromPoint(20, 30)) &&
      document.elementFromPoint(20, 30) === document.getElementById('mw-detail-ov');

    // —— 关掉之后不能还杵在页面上（display:flex 会盖掉 UA 的 :not(:popover-open) 规则）——
    ov.hidePopover();
    out['⑥ 关掉后不占位'] = ov.getBoundingClientRect().width === 0;
    out['⑥ 关掉后 display'] = getComputedStyle(ov).display;
    document.body.style.transform = '';

    // ================= ⑦ 兜底路径：内核没有 popover =================
    // 用户报的就是这条：重新装完第一次好、刷新一次就坏 —— 大概率是 popover 没进去，
    // 退回普通 fixed 后又被祖先的 transform 改了包含块。
    ov.removeAttribute('popover');                    // 老内核上根本不会有这个属性
    ov.showPopover = undefined;                       // 盖掉原型上的方法，模拟没有该 API
    document.body.style.transform = 'translate(40px, 30px) scale(0.8)';
    void ov.offsetHeight;
    out['⑦ 兜底前尺寸（缩水 = 用户看到的）'] = size();
    out['⑦ 兜底前铺满'] = covers();

    ensureOverlayTopLayer(ov);                        // 就是脚本建好覆盖层时走的那一条
    void ov.offsetHeight;
    out['⑦ 兜底后尺寸'] = size();
    out['⑦ 兜底后铺满'] = covers();
    out['⑦ 站位方式'] = layerInfo();
    // popover 属性必须摘掉 —— 留着它而元素又不是 open，会被 :not(:popover-open){display:none} 藏起来
    out['⑦ popover 属性已摘'] = !ov.hasAttribute('popover');

    // 看门人会反复调它，不能越算越偏
    ensureOverlayTopLayer(ov); ensureOverlayTopLayer(ov); ensureOverlayTopLayer(ov);
    void ov.offsetHeight;
    out['⑦ 反复调用不发散'] = covers();
    out['⑦ 反复调用后尺寸'] = size();

    // ================= ⑧ showPopover 抛错：属性设上了、元素却没打开 =================
    // 这是写兜底时真踩到的坑：popover 属性留着而元素不是 open，会命中
    // #mw-overlay[popover]:not(:popover-open){display:none} —— 覆盖层直接隐身，
    // 用户会以为「脚本坏了」。所以走兜底时**必须把 popover 属性摘掉**。
    var ov2 = document.createElement('div');
    ov2.id = 'mw-overlay';                       // 借同一套样式
    ov2.showPopover = function () { throw new Error('boom'); };
    document.body.appendChild(ov2);
    out['⑧ 抛错前 display'] = getComputedStyle(ov2).display;   // 还没设属性，是 flex
    ensureOverlayTopLayer(ov2);
    void ov2.offsetHeight;
    out['⑧ 兜底后不隐身'] = getComputedStyle(ov2).display !== 'none';
    out['⑧ 兜底后铺满'] = covers(ov2);
    out['⑧ 抛错原因带出来了'] = /boom/.test(layerInfo());
    ov2.remove();

    document.body.style.transform = '';
    clearFit(ov);
  } catch (e) {
    if (!out['错误']) out['错误'] = e.message;
  }
  window.__RESULT = out;

  var EXPECT = {
    '① 进了 top layer': true,
    '② 无 transform 时铺满': true,
    '③ body 有 transform 后仍铺满': true,
    '④ 覆盖层盖住了顶栏': true,
    '⑤ 内部浮层也在顶栏之上': true,
    '⑥ 关掉后不占位': true,
    '⑥ 关掉后 display': 'none',
    '⑦ 兜底前铺满': false,
    '⑦ 兜底后铺满': true,
    '⑦ popover 属性已摘': true,
    '⑦ 反复调用不发散': true,
    '⑧ 兜底后不隐身': true,
    '⑧ 兜底后铺满': true,
    '⑧ 抛错原因带出来了': true
  };
  // 分母只算「有期望值」的项 —— 纯展示项（视口、尺寸）不该稀释成功率
  var pass = 0, total = 0;
  var lines = Object.keys(out).map(function (k) {
    var hasWant = Object.prototype.hasOwnProperty.call(EXPECT, k);
    if (hasWant) total++;
    var ok = hasWant ? String(EXPECT[k]) === String(out[k]) : true;
    if (hasWant && ok) pass++;
    return '  ' + (ok ? '<span class="ok">✔</span> ' : '<span class="bad">✘</span> ') + k + ' = ' + String(out[k]);
  });
  var box = document.getElementById('result');
  box.innerHTML = '<b>覆盖层冒烟结果</b>（' + pass + '/' + total + ' 项符合预期）\\n' + lines.join('\\n');
  document.title = (pass === total ? 'PASS ' : 'FAIL ') + pass + '/' + total;
})();
<\/script>
</body></html>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, page, 'utf8');
console.log('已生成：' + OUT);
