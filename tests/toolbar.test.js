'use strict';
/** 顶部工具栏挂载器的测试：
 *      node --test tests/
 *
 * 分两层：
 *   ① 定位逻辑 —— 用手搓的假 DOM 跑（115 的真实页面没法在这儿搭出来）
 *   ② 接线回归 —— 跟 core.test.js 同一个思路：入口、菜单项、绑定一根根钉死
 *
 * 定位逻辑之所以值得测：它是纯「猜 DOM」的代码，全靠 if/else 兜底，
 * 改坏了不会报错、只会安静地退到悬浮球 —— 那正是用户看不见的失败。
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const toolbar = require('../src/core/115-toolbar.js');
const ROOT = path.resolve(__dirname, '..');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');

/* ---------------------------------------------------------------------------
 * 极简假 DOM：只需要 querySelectorAll / querySelector / getElementById 这些
 * 挂载器真正用到的东西。用手写解析而不是引 jsdom —— 这套测试要能跟着
 * 脚本一起跑在 Node 里，装个 jsdom 进 vite 依赖树不划算。
 * ------------------------------------------------------------------------ */

/** 把一段 HTML 解析成 { tag, attrs, children, parent, text } 树 */
function parseHTML(html) {
  const stack = [];
  const root = { tag: '#root', attrs: {}, children: [], parent: null, text: '' };
  stack.push(root);
  const re = /<(\/)?([a-zA-Z0-9-]+)((?:\s+[a-zA-Z0-9-_:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/)?>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    const [, closing, tag, attrStr, selfClose, text] = m;
    if (text !== undefined) {
      const top = stack[stack.length - 1];
      top.text += text;
      continue;
    }
    if (closing) { if (stack.length > 1) stack.pop(); continue; }
    const attrs = {};
    const ar = /([a-zA-Z0-9-_:.-]+)\s*=\s*"([^"]*)"/g;
    let a;
    while ((a = ar.exec(attrStr || ''))) attrs[a[1]] = a[2];
    const node = { tag, attrs, children: [], parent: stack[stack.length - 1], text: '' };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root;
}

/** 选择器支持挂载器实际用到的那几种语法：
 *   ① 标签        button
 *   ② #id         #js_top_header
 *   ③ .class      .top-operate
 *   ④ 复合类      .justify-between.w-full.pl-6.pr-5   （115 新版顶栏就长这样）
 *   ⑤ 属性        button[title="更多操作"]
 *   ⑥ 组合        #js_top_panel_box .left-tvf[rel="left_tvf"]（后代，用空格分隔）
 */
function matchSimple(node, sel) {
  // 先摘掉尾部挂着的属性条件，剩下的部分再按 #id / .class / tag 判
  let base = sel, attrs = [];
  const attrRe = /\[([a-zA-Z-]+)="([^"]*)"\]/g;
  let m;
  while ((m = attrRe.exec(sel))) attrs.push([m[1], m[2]]);
  base = sel.replace(attrRe, '');

  if (attrs.length && !attrs.every(([k, v]) => node.attrs[k] === v)) return false;

  if (!base) return true;                      // 纯属性选择器，如 [rel="left_tvf"]
  if (base.startsWith('#')) return node.attrs.id === base.slice(1);
  if (base.startsWith('.')) {
    const cls = String(node.attrs.class || '').split(/\s+/);
    return base.slice(1).split('.').every((c) => cls.includes(c));
  }
  return node.tag === base;
}

/**
 * 后代组合选择器：`#a .b[c="d"]` 拆成 ['#a', '.b[c="d"]']。
 * 末段匹配 node，前面各段只要在祖先链上依次命中即可（不做完整的从右向左回溯，
 * 但对本文件用到的选择器已经等价 —— 挂载器的选择器都不含逗号分组）。
 */
function matches(node, sel) {
  const parts = sel.split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1];
  if (!matchSimple(node, last)) return false;
  let p = node.parent;
  for (let i = parts.length - 2; i >= 0; i--) {
    let found = false;
    while (p) {
      if (matchSimple(p, parts[i])) { found = true; p = p.parent; break; }
      p = p.parent;
    }
    if (!found) return false;
  }
  return true;
}

/** classList 读写要跟 className / attrs.class 同步 ——
 *  挂载器建完按钮后 set 的 className，和选择器匹配时读的 attrs.class，
 *  在真 DOM 里是同一个字段，这里分成两个就必炸。 */
function classListOf(node) {
  const read = () => {
    const raw = (node.className !== undefined && node.className !== null && node.className !== '')
      ? node.className
      : (node.attrs ? (node.attrs.class || '') : '');
    return String(raw).split(/\s+/).filter(Boolean);
  };
  const write = (arr) => {
    const v = arr.join(' ');
    node.className = v;
    if (node.attrs) node.attrs.class = v;
  };
  return {
    add(...cs) { const a = read(); cs.forEach((c) => { if (c && !a.includes(c)) a.push(c); }); write(a); },
    remove(...cs) { write(read().filter((c) => !cs.includes(c))); },
    contains(c) { return read().includes(c); },
    toggle(c, on) { if (on === undefined ? !read().includes(c) : on) this.add(c); else this.remove(c); }
  };
}

/** 事件：只存 click 这一个类型够用，但要能 preventDefault / stopPropagation。 */
function eventify(node) {
  node._handlers = {};
  node.addEventListener = function (type, fn) {
    (this._handlers[type] = this._handlers[type] || []).push(fn);
  };
  node.removeEventListener = function (type, fn) {
    const arr = this._handlers[type] || [];
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  };
  node.dispatchEvent = function (ev) {
    if (!ev.preventDefault) ev.preventDefault = () => {};
    if (!ev.stopPropagation) ev.stopPropagation = () => {};
    (this._handlers[ev.type] || []).slice().forEach((fn) => fn(ev));
    return true;
  };
  node.click = function () { return this.dispatchEvent({ type: 'click', target: this }); };
}

function walk(node, out) {
  out = out || [];
  out.push(node);
  node.children.forEach((c) => walk(c, out));
  return out;
}

/** 从父节点的孩子数组里摘掉一个（真 DOM 的 removeChild） */
function removeFrom(parent, child) {
  if (!parent || !parent.children) return;
  const i = parent.children.indexOf(child);
  if (i >= 0) parent.children.splice(i, 1);
  if (child.parent === parent) child.parent = null;
}

function makeDoc(html) {
  const root = parseHTML(html);
  const body = walk(root).find((n) => n.tag === 'body') || root;
  const api = {
    body,
    hidden: new Set(),
    querySelectorAll(sel) {
      return walk(body).filter((n) => n !== body && matches(n, sel));
    },
    querySelector(sel) {
      return api.querySelectorAll(sel)[0] || null;
    },
    getElementById(id) {
      return walk(body).find((n) => n.attrs.id === id) || null;
    },
    createElement(tag) {
      return { tag, attrs: {}, children: [], parent: null, text: '', className: '',
        style: {},
        appendChild(c) { if (c.parent) removeFrom(c.parent, c); c.parent = this; this.children.push(c); },
        insertBefore(node, ref) {
          if (node.parent) removeFrom(node.parent, node);
          node.parent = this;
          const i = ref ? this.children.indexOf(ref) : -1;
          if (i < 0) this.children.push(node); else this.children.splice(i, 0, node);
        },
        removeChild(c) { removeFrom(this, c); } };
    },
    createTextNode(t) {
      return { tag: '#text', text: String(t), attrs: {}, children: [], parent: null, textContent: String(t) };
    },
    head: { appendChild() {} }
  };
  // getClientRects / offsetWidth 模拟「可见」。都要写成 getter ——
  // 否则 setHidden() 在建树之后才调用，offsetWidth 那会儿已经算死了，隐藏不生效。
  const decorate = (n) => {
    n.getClientRects = () => (api.hidden.has(n) ? [] : [{}]);
    Object.defineProperty(n, 'offsetWidth', { get: () => (api.hidden.has(n) ? 0 : 100) });
    Object.defineProperty(n, 'offsetHeight', { get: () => (api.hidden.has(n) ? 0 : 30) });
    n.classList = classListOf(n);
    // className / id 与 attrs 在真 DOM 里是同一份数据 ——
    // 核心建按钮时直接写 b.className、slot.id = opts.id，
    // 而选择器匹配和 getElementById 读的都是 attrs 不同步就全都选不中。
    // ⚠️ className 落在 attrs 上叫 class（不是 className），写错字段选择器就静默失配。
    const syncProp = (prop, attrKey) => {
      const key = attrKey || prop;
      let v = n[prop] !== undefined && n[prop] !== null ? n[prop] : n.attrs[key];
      Object.defineProperty(n, prop, {
        get() { return v; },
        set(x) { v = x; n.attrs[key] = x; },
        configurable: true
      });
    };
    syncProp('className', 'class');
    syncProp('id');
    eventify(n);
    // 挂载器会在锚点元素上直接调 root.querySelector(...) / querySelectorAll(...)
    n.querySelectorAll = (sel) => walk(n).filter((x) => x !== n && x.tag !== '#text' && matches(x, sel));
    n.querySelector = (sel) => n.querySelectorAll(sel)[0] || null;
    n.getAttribute = (k) => (k in n.attrs ? n.attrs[k] : null);
    n.setAttribute = (k, v) => { n.attrs[k] = v; };
    n.contains = (x) => walk(n).includes(x);
    n.closest = (sel) => {
      let p = n;
      while (p) { if (p !== body && matches(p, sel)) return p; p = p.parent; }
      return null;
    };
    n.removeChild = (c) => removeFrom(n, c);
    n.insertBefore = (node, ref) => {
      if (node.parent) removeFrom(node.parent, node);
      node.parent = n;
      const i = ref ? n.children.indexOf(ref) : -1;
      if (i < 0) n.children.push(node); else n.children.splice(i, 0, node);
    };
    if (!n.appendChild) {
      n.appendChild = (c) => {
        if (c.parent) removeFrom(c.parent, c);
        c.parent = n; n.children.push(c);
      };
    }
    if (!Object.getOwnPropertyDescriptor(n, 'textContent')) {
      // textContent 可读可写：核心要靠写它来填菜单标题
      Object.defineProperty(n, 'textContent', {
        get() { return n.text + n.children.map((c) => c.textContent || '').join(''); },
        set(v) { n.text = String(v); n.children = []; },
        configurable: true
      });
    }
    // 真实 DOM 里这几个是同一样东西，核心代码三个名字混着用，这里都给上。
    // 必须是 getter —— insertBefore 会改 parent，快照值就过期了。
    Object.defineProperty(n, 'parentElement', { get: () => n.parent, configurable: true });
    Object.defineProperty(n, 'parentNode', { get: () => n.parent, configurable: true });
    // nextSibling 同理：老版顶栏拿它当插入锚点，插完就变了。
    Object.defineProperty(n, 'nextSibling', {
      get() {
        if (!n.parent) return null;
        const i = n.parent.children.indexOf(n);
        return i >= 0 && i + 1 < n.parent.children.length ? n.parent.children[i + 1] : null;
      },
      configurable: true
    });
    Object.defineProperty(n, 'previousElementSibling', {
      get() {
        if (!n.parent) return null;
        const i = n.parent.children.indexOf(n);
        return i > 0 ? n.parent.children[i - 1] : null;
      },
      configurable: true
    });
  };
  walk(body).forEach(decorate);
  // createElement 造出来的节点不在初始树里，得单独装饰一遍
  const origCreate = api.createElement;
  api.createElement = (tag) => { const el = origCreate(tag); decorate(el); return el; };
  const origCreateText = api.createTextNode;
  api.createTextNode = (t) => { const el = origCreateText(t); decorate(el); return el; };
  // nextSibling / parentElement 已在 decorate 里做成 getter（插入后会变）
  api.setHidden = (node) => api.hidden.add(node);
  api.visible = (node) => !api.hidden.has(node);
  // 文档自身也要能挂监听（核心绑「点空白处收起下拉」在 document 上）
  eventify(api);
  api.addEventListener = function (type, fn) {
    (this._handlers[type] = this._handlers[type] || []).push(fn);
  };
  api.dispatchEvent = function (ev) {
    if (!ev.preventDefault) ev.preventDefault = () => {};
    if (!ev.stopPropagation) ev.stopPropagation = () => {};
    (this._handlers[ev.type] || []).slice().forEach((fn) => fn(ev));
  };
  return api;
}

/** 把假文档装到全局 document/window 上，让核心里的 eachDocument(document, …) 能跑。
 *  跑完务必调返回的 restore() —— 核心模块是 require 进来的单例，
 *  全局 document 被换掉会影响后面所有测试。
 *  intervalFns 收集到 setInterval 注册的回调，测试里手动触发（等价于等 1.5s）。 */
function installGlobals(api) {
  const saved = { document: global.document, window: global.window, setInterval: global.setInterval };
  const fakeWin = {
    getComputedStyle: null,
    addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {},
    requestAnimationFrame: (fn) => { fn(); return 0; },
    // 默认列表页；测试要测播放页就改 restore.window.location.href
    location: { href: 'https://115.com/#/' }
  };
  const intervalFns = [];
  global.window = fakeWin;
  global.document = api;
  api.window = fakeWin;
  // 核心用 setInterval 做重挂巡逻。这里收下回调而不是真起定时器：
  // Node 里不接住会挂着进程不放，而测试需要手动推进时间。
  global.setInterval = (fn, ms) => { intervalFns.push({ fn, ms }); return intervalFns.length; };
  global.clearInterval = () => {};
  const restore = () => {
    global.document = saved.document;
    global.window = saved.window;
    global.setInterval = saved.setInterval;
  };
  restore.window = fakeWin;          // 测试要改 location 就走 restore.window.location.href
  restore.doc = api;
  restore.tick = (n) => {
    for (let i = 0; i < (n || intervalFns.length); i++) {
      intervalFns.forEach((x) => { try { x.fn(); } catch (e) { /* 单次巡逻出错不该中断测试 */ } });
    }
  };
  restore.intervals = intervalFns;
  return restore;
}

/* ===========================================================================
 * ① 定位逻辑
 * ======================================================================== */

/* 115 新版顶栏的真实形状（照参考实现扒的）：
   顶栏容器 → 动作组；「列表视图」裹着自己的小分组，「更多操作」是动作组的直接子节点。
   所以挂载器取「更多操作」的 parentElement 当容器，插到「列表视图」那一组之前。 */
const NEW_HEADER_HTML = `
<body>
  <div class="justify-between w-full pl-6 pr-5">
    <div class="act-group">
      <div class="view-group"><button title="列表视图">☰</button></div>
      <button title="更多操作">⋯</button>
    </div>
  </div>
</body>`;

test('新版顶栏：从「更多操作」反查，插在「列表视图」那一组之前', () => {
  const doc = makeDoc(NEW_HEADER_HTML);
  const hit = toolbar.locateByTitle(doc);
  assert.ok(hit, '新版顶栏应该定位得到');
  assert.strictEqual(hit.host.attrs.class, 'act-group', '插入容器应是「更多操作」的父元素');
  assert.strictEqual(hit.before.attrs.class, 'view-group',
    '应插在列表视图按钮组之前，也就是动作区最左端');
});

test('新版顶栏：没有列表视图按钮时，追加到动作组末尾', () => {
  const doc = makeDoc(`
    <body><div class="justify-between w-full pl-6 pr-5">
      <div class="acts"><button title="更多操作">⋯</button></div>
    </div></body>`);
  const hit = toolbar.locateByTitle(doc);
  assert.ok(hit);
  assert.strictEqual(hit.before, null, '没有列表视图锚点时 before 应为 null（追加末尾）');
});

test('新版顶栏：隐藏的那一套顶栏（移动版）要被跳过', () => {
  const doc = makeDoc(`
    <body>
      <div class="justify-between w-full pl-6 pr-5" id="mobile">
        <div class="act-group"><button title="列表视图">☰</button><button title="更多操作">⋯</button></div>
      </div>
      <div class="justify-between w-full pl-6 pr-5" id="desktop">
        <div class="act-group"><button title="列表视图">☰</button><button title="更多操作">⋯</button></div>
      </div>
    </body>`);
  doc.setHidden(doc.getElementById('mobile'));
  const hit = toolbar.locateByTitle(doc);
  assert.ok(hit);
  assert.strictEqual(hit.host.parentElement.attrs.id, 'desktop',
    '必须跳过隐藏的移动版顶栏，命中可见那套');
});

test('老版顶栏：走 #js_top_panel_box .left-tvf，落在预览切换按钮之后', () => {
  const doc = makeDoc(`
    <body>
      <div id="js_top_panel_box">
        <div class="left-tvf" rel="left_tvf">
          <button class="master-preview-switch-btn">预览</button>
          <button class="other-btn">别的</button>
        </div>
      </div>
    </body>`);
  const hit = toolbar.locateByTitle(doc);
  assert.ok(hit, '老版顶栏应该定位得到');
  assert.strictEqual(hit.host.attrs.class, 'left-tvf');
  assert.strictEqual(hit.host.attrs.rel, 'left_tvf');
  // 插到预览切换按钮「之后」= 它的 nextSibling；没有 nextSibling 就追加末尾，效果一样
  assert.ok(hit.before, '应以预览切换按钮的下一个兄弟作为插入锚点');
  assert.strictEqual(hit.before.attrs.class, 'other-btn');
});

test('老版顶栏：预览切换按钮是最后一个时，退化成追加末尾（仍在它之后）', () => {
  const doc = makeDoc(`
    <body><div id="js_top_panel_box">
      <div class="left-tvf" rel="left_tvf"><button class="master-preview-switch-btn">预览</button></div>
    </div></body>`);
  const hit = toolbar.locateByTitle(doc);
  assert.ok(hit);
  assert.strictEqual(hit.before, null, '没有下一个兄弟时 before 应为 null');
});

test('顶栏文案常量跟 115 实际 UI 对得上（改错了要在这里炸）', () => {
  // 这几个 title 是定位的全部依据 —— 115 一改文案，这里就该提醒你更新定位策略
  assert.strictEqual(toolbar.TITLE_MORE, '更多操作');
  assert.strictEqual(toolbar.TITLE_LIST_VIEW, '列表视图');
  assert.ok(toolbar.NEW_HEADER_CLASS.includes('justify-between'));
});

test('两套顶栏都没有时，locateByTitle 返回 null（交由上层降级）', () => {
  const doc = makeDoc('<body><div class="whatever"><button>上传</button></div></body>');
  assert.strictEqual(toolbar.locateByTitle(doc), null);
});

test('空文档 / 没有 body 都不炸', () => {
  assert.strictEqual(toolbar.locateByTitle(null), null);
  assert.strictEqual(toolbar.locateByTitle({}), null);
  assert.strictEqual(toolbar.findToolbar(null), null);
});

test('normText：去空白，115 按钮里混着 svg 产生的空白也要认', () => {
  assert.strictEqual(toolbar.normText(' 上 传 '), '上传');
  assert.strictEqual(toolbar.normText(null), '');
  assert.strictEqual(toolbar.normText(undefined), '');
});

test('findToolbar 的降级链：title → class 选择器 → 文本锚点', () => {
  // ① title 路径
  const withTitle = makeDoc(NEW_HEADER_HTML);
  assert.ok(toolbar.findToolbar(withTitle).host, 'title 路径应命中');

  // ② class 路径（模拟老一点的结构：没有「更多操作」按钮）
  const withClass = makeDoc('<body><div class="top-operate"><button>上传</button></div></body>');
  const hit2 = toolbar.findToolbar(withClass);
  assert.ok(hit2 && hit2.host, 'class 选择器路径应命中');
  assert.ok(hit2.host.attrs.class.includes('top-operate'));
});

/* ===========================================================================
 * ② 交互：真的点一次
 * ======================================================================== */

test('「只有下拉、没有 onClick」的按钮点主区也能开菜单（回归：曾写成 if (opt.onClick) 导致下拉永远打不开）', () => {
  const doc = makeDoc(NEW_HEADER_HTML);
  const restore = installGlobals(doc);
  try {
    const fired = [];
    // 刻意不给 onClick —— 影片墙、整理助手的动作全在菜单项里，自身没有 onClick
    const slot = toolbar.mount({
      id: 'tb-test',
      buttons: [{
        label: '影片墙', caret: true, menuTitle: '影片墙',
        items: [{ label: '打开影片墙', onClick: () => fired.push('open') }]
      }]
    });
    assert.ok(slot, '应挂载成功');
    assert.strictEqual(slot.classList.contains('open'), false, '初始不该是展开态');

    const btn = slot.querySelector('.mw115-tb-btn');
    assert.ok(btn, '按钮没造出来');
    btn.click();
    assert.strictEqual(slot.classList.contains('open'), true,
      '点主按钮必须开菜单 —— 这条曾因 if (opt.onClick) 判断而静默失效');
    assert.deepStrictEqual(fired, [], '有菜单时点主区不该直接执行动作');

    // 再点一次收起（toggle）
    btn.click();
    assert.strictEqual(slot.classList.contains('open'), false, '再点一次应收起');

    // 菜单项可点，且点完自动收起
    btn.click();
    const item = slot.querySelector('.mw115-tb-menu a');
    assert.ok(item, '菜单项没造出来');
    item.click();
    assert.deepStrictEqual(fired, ['open'], '菜单项的 onClick 该被调用');
    assert.strictEqual(slot.classList.contains('open'), false, '点完菜单项应收起');
  } finally {
    restore();
  }
});

test('挂载位置与幂等：同一个 id 重复挂载不会堆出两个 slot', () => {
  const doc = makeDoc(NEW_HEADER_HTML);
  const restore = installGlobals(doc);
  try {
    const opts = { id: 'tb-idem', buttons: [{ label: 'A', onClick() {} }] };
    const first = toolbar.mount(opts);
    const second = toolbar.mount(opts);
    assert.strictEqual(first, second, '重复挂载应复用同一个 slot');
    const slots = doc.querySelectorAll('.mw115-tb-slot');
    assert.strictEqual(slots.length, 1, '页面上只该有一个 slot，实际 ' + slots.length);
  } finally {
    restore();
  }
});

test('降级路径：挂不上工具栏时退回悬浮球（inToolbar 为 false）', () => {
  // 空页面 —— 没有任何顶栏结构
  const doc = makeDoc('<body><div>什么都没有</div></body>');
  const restore = installGlobals(doc);
  try {
    let fbCalled = 0;
    const res = toolbar.mountOrFallback({
      id: 'tb-fb',
      buttons: [{ label: 'A', onClick() {} }],
      fallback: function () {
        fbCalled++;
        const d = doc.createElement('div');
        d.className = 'mw115-tb-fallback';
        return d;
      }
    });
    assert.strictEqual(res.inToolbar, false, '挂不上工具栏时 inToolbar 应为 false');
    assert.strictEqual(fbCalled, 1, 'fallback 该被调用一次');
    assert.ok(res.el, '降级球元素要还给调用方');
    assert.ok(res.el.parentElement === doc.body, '降级球应挂到 body 上');
  } finally {
    restore();
  }
});

test('回归：降级球和工具栏按钮不得同时在场（用户实机报「下面多了一条」）', () => {
  // 真实时序：页面加载初期顶栏还没渲染好 → 首次 mount 失败、出降级球；
  // 1.5s 后顶栏渲染出来，巡逻挂上工具栏按钮 —— 这时必须把球清掉。
  // 全程同一个 document：核心的巡逻读的是全局 document，换文档就测不到真实行为。
  const doc = makeDoc('<body><div id="placeholder">还没有顶栏</div></body>');
  const restore = installGlobals(doc);
  try {
    let fbBuilt = 0;
    const opts = {
      id: 'tb-dup',
      fallbackId: 'tb-dup-fab',
      legacyFallbackIds: ['tb-dup-fab-old'],
      buttons: [{ label: '影片墙', caret: true, items: [{ label: 'x', onClick() {} }] }],
      fallback: function () {
        fbBuilt++;
        const d = doc.createElement('div');
        d.id = 'tb-dup-fab';
        d.className = 'mw115-tb-fallback';
        return d;
      }
    };
    const first = toolbar.mountOrFallback(opts);
    assert.strictEqual(first.inToolbar, false, '首次就该走降级（顶栏还没渲染）');
    assert.ok(doc.getElementById('tb-dup-fab'), '降级球应在页面上');

    // 顶栏渲染出来了：把真实结构塞进 body
    const hdr = makeDoc(NEW_HEADER_HTML);
    const header = hdr.querySelector('.justify-between.w-full.pl-6.pr-5');
    header.parent = doc.body;
    doc.body.children.push(header);

    // 手动推进 1.5s 巡逻
    restore.intervals.forEach((x) => { try { x.fn(); } catch (e) { /* 巡逻出错不该中断测试 */ } });

    const slot = doc.getElementById('tb-dup');
    const fb = doc.getElementById('tb-dup-fab');
    assert.ok(slot, '巡逻应把按钮挂上工具栏');
    assert.ok(slot.parentElement && slot.parentElement.attrs.class === 'act-group',
      'slot 该挂在动作区里');
    assert.strictEqual(fb, null,
      '挂上工具栏后降级球必须清掉 —— 两者同时在场就是用户看到的「下面多了一条」');
    assert.strictEqual(fbBuilt, 1, '清掉之后不该再新建球（新建就是又一条）');
  } finally {
    restore();
  }
});

test('回归：历史遗留的旧 id 降级球也会被清掉', () => {  const doc = makeDoc(NEW_HEADER_HTML);
  const restore = installGlobals(doc);
  try {
    // 升级前就在页面上的旧球（id 是上一版核心生成的）
    const stale = doc.createElement('div');
    stale.id = 'tb-legacy-fallback';
    stale.className = 'mw115-tb-fallback';
    doc.body.appendChild(stale);

    toolbar.mountOrFallback({
      id: 'tb-legacy',
      fallbackId: 'tb-legacy-fab',
      legacyFallbackIds: ['tb-legacy-fallback'],
      buttons: [{ label: 'A', onClick() {} }],
      fallback: function () {
        const d = doc.createElement('div');
        d.id = 'tb-legacy-fab';
        return d;
      }
    });
    // 连跑两轮：第一轮挂上工具栏按钮（顺带清掉旧球），第二轮验证
    // 「已在工具栏上」这条分支也真的会清球 —— 早先这里漏传了 opts，
    // clearFallbacks(undefined) 清的是空列表，残留球永远清不掉。
    restore.intervals.forEach((x) => { try { x.fn(); } catch (e) { /* ignore */ } });
    assert.ok(doc.getElementById('tb-legacy'), '工具栏按钮应挂上');
    assert.strictEqual(doc.getElementById('tb-legacy-fallback'), null, '旧 id 的残留球要清掉');

    // 再塞一个残留球，只触发「已挂上工具栏」这一条分支
    const again = doc.createElement('div');
    again.id = 'tb-legacy-fab';
    again.className = 'mw115-tb-fallback';
    doc.body.appendChild(again);
    assert.ok(doc.getElementById('tb-legacy-fab'), '前置条件：新残留球已插入');
    restore.intervals.forEach((x) => { try { x.fn(); } catch (e) { /* ignore */ } });
    assert.strictEqual(doc.getElementById('tb-legacy-fab'), null,
      '已在工具栏上时也要清降级球（这条分支曾漏传 opts，等于没清）');
    assert.ok(doc.getElementById('tb-legacy'), '清球不能把工具栏 slot 一起清掉');
  } finally {
    restore();
  }
});

/* ===========================================================================
 * ② 之二：路由门禁 —— 播放页不该有入口（用户实机报「播放页面还是显示悬浮按钮」）
 * ======================================================================== */

test('isListPage：播放页/接收页返回 false，列表页返回 true', () => {
  const L = (href) => toolbar.isListPage({ href });
  // 文件列表（115 的 hash 路由，列表页就是根或 /index）
  assert.strictEqual(L('https://115.com/'), true, '根路径是列表页');
  assert.strictEqual(L('https://115.com/#/'), true);
  assert.strictEqual(L('https://115.com/#/index'), true);
  // 播放页
  assert.strictEqual(L('https://115.com/#/video'), false, '播放页不该挂入口');
  assert.strictEqual(L('https://115.com/#/video/abc123'), false);
  assert.strictEqual(L('https://115.com/video/abc123'), false, '老版播放页路径');
  // 其它无文件列表的页面
  assert.strictEqual(L('https://115.com/#/receive'), false);
  assert.strictEqual(L('https://115.com/#/login'), false);
  // 拿不到 href 时保守放行，别把入口误杀
  assert.strictEqual(toolbar.isListPage(null), true, '拿不到 location 时应放行');
  assert.strictEqual(toolbar.isListPage({}), true);
});

test('回归：出生在播放页时不挂任何入口，连降级球都不出（用户实机反馈）', () => {
  const doc = makeDoc('<body><div class="player">播放器</div></body>');
  const restore = installGlobals(doc);
  restore.window.location.href = 'https://115.com/#/video/abc123';
  try {
    let fbBuilt = 0;
    const res = toolbar.mountOrFallback({
      id: 'tb-video',
      fallbackId: 'tb-video-fab',
      buttons: [{ label: '影片墙', onClick() {} }],
      fallback: function () {
        fbBuilt++;
        const d = doc.createElement('div');
        d.id = 'tb-video-fab';
        d.className = 'mw115-tb-fallback';
        return d;
      }
    });
    assert.strictEqual(res.skipped, 'not-list-page', '播放页应被跳过');
    assert.strictEqual(res.el, null, '不该返回入口元素');
    assert.strictEqual(fbBuilt, 0, '播放页不该造降级球');
    assert.strictEqual(doc.getElementById('tb-video'), null, '不该有工具栏 slot');
    assert.strictEqual(doc.getElementById('tb-video-fab'), null,
      '播放页不该出现悬浮球 —— 它会挡住播放器控制条');
  } finally {
    restore();
  }
});

test('回归：SPA 在播放页↔列表页之间切，入口跟着撤/补', () => {
  // 115 切路由不重载页面。出生在列表页，切到播放页要撤，切回来要补。
  const doc = makeDoc(NEW_HEADER_HTML);
  const restore = installGlobals(doc);
  const loc = restore.window.location;
  loc.href = 'https://115.com/#/';
  try {
    const opts = {
      id: 'tb-spa',
      fallbackId: 'tb-spa-fab',
      buttons: [{ label: '影片墙', onClick() {} }],
      fallback: function () {
        const d = doc.createElement('div');
        d.id = 'tb-spa-fab';
        return d;
      }
    };
    toolbar.mountOrFallback(opts);
    assert.ok(doc.getElementById('tb-spa'), '列表页应挂上入口');

    // 切到播放页
    loc.href = 'https://115.com/#/video/abc';
    restore.intervals.forEach((x) => { try { x.fn(); } catch (e) { /* ignore */ } });
    assert.strictEqual(doc.getElementById('tb-spa'), null, '切到播放页应撤掉入口');

    // 切回列表页
    loc.href = 'https://115.com/#/';
    restore.intervals.forEach((x) => { try { x.fn(); } catch (e) { /* ignore */ } });
    assert.ok(doc.getElementById('tb-spa'), '切回列表页应补上入口');
  } finally {
    restore();
  }
});

test('核心不改降级球的 id（否则会废掉脚本的幂等短路）', () => {
  // 脚本的 buildFallbackFab 靠 `if ($('#mw-fab')) return $('#mw-fab')[0]` 复用旧节点。
  // 核心一旦覆写 id，短路永久失效 —— 每次巡逻都新建一个球，页面上堆出一排。
  const doc = makeDoc('<body><div>没有顶栏</div></body>');
  const restore = installGlobals(doc);
  try {
    const made = [];
    const res = toolbar.mountOrFallback({
      id: 'tb-id',
      buttons: [{ label: 'A', onClick() {} }],
      fallback: function () {
        const d = doc.createElement('div');
        d.id = 'my-own-id';           // 脚本自己的 id
        made.push(d);
        return d;
      }
    });
    assert.strictEqual(res.el.id, 'my-own-id', '核心不该改调用方的 id');
    assert.strictEqual(made.length, 1);
  } finally {
    restore();
  }
});

/* ===========================================================================
 * ③ 接线回归：工具栏入口这块全是「少一根线就静默失效」的地方
 * ======================================================================== */

const readScript = (name) => fs.readFileSync(path.join(SCRIPTS_DIR, name), 'utf8');

test('两个脚本都声明了降级球 id（否则球清不掉，用户看到「下面多了一条」）', () => {
  const cases = [
    ['115影片墙.user.js', 'mw-fab'],
    ['115整理助手.user.js', 'av-organize-fab']
  ];
  cases.forEach(([name, fabId]) => {
    const src = readScript(name);
    assert.ok(src.includes(`fallbackId: '${fabId}'`),
      name + ` 缺 fallbackId: '${fabId}' —— 巡逻认不出该清哪个球`);
    assert.ok(new RegExp(`legacyFallbackIds: \\['${name.startsWith('115影片墙') ? 'mw-tb-moviewall' : 'av-tb-organize'}-fallback'\\]`).test(src),
      name + ' 缺 legacyFallbackIds（旧版残留的球 id）');
    // 降级球自己的 id 必须跟 fallbackId 一致，否则核心和脚本说的不是同一个球
    assert.ok(src.includes(`id = '${fabId}'`) || src.includes(`id: '${fabId}'`),
      name + ` 里球的 id 应为 ${fabId}`);
  });
});

test('公共核心已内联进两个脚本，且 toolbar 不污染脚本作用域', () => {  ['115影片墙.user.js', '115整理助手.user.js'].forEach((name) => {
    const src = readScript(name);
    assert.ok(src.includes('/* ==== MW115_TOOLBAR:BEGIN ==== */'), name + ' 缺少 TOOLBAR 标记区');
    assert.ok(src.includes('var MW115Toolbar = (function ()'), name + ' 未内联 toolbar 核心');
    assert.ok(/var escHtml = MW115Core\.escHtml/.test(src), name + ' core 的 bind 行丢了');
    // toolbar 的导出名太通用，不能 bind 成局部变量跟脚本自己的变量抢同名
    assert.ok(!/var mount = MW115Toolbar\.mount/.test(src),
      name + ' 不该把 mount/normText 这些通用名 bind 进作用域');
  });
});

test('影片墙：入口走工具栏，且保留降级悬浮球', () => {
  const src = readScript('115影片墙.user.js');
  assert.ok(src.includes("MW115Toolbar.mountOrFallback({"), '影片墙入口没走 mountOrFallback');
  assert.ok(src.includes("id: 'mw-tb-moviewall'"), '缺少工具栏 slot id');
  // 降级路径：老结构/改版时不能没入口
  assert.ok(/function buildFallbackFab\(\)/.test(src), '缺少降级悬浮球构造函数');
  assert.ok(/fallback: buildFallbackFab/.test(src), '没把降级球交给 mountOrFallback');
  // 旧的 .mw-fab 样式已并入公共核心，脚本里不该再有第二份
  assert.ok(!/\.mw-fab\{/.test(src), '影片墙里还留着已废弃的 .mw-fab 样式');
});

test('影片墙：菜单项跟 GM_registerMenuCommand 一一对应', () => {
  const src = readScript('115影片墙.user.js');
  ['打开影片墙', '影片墙设置', '把当前目录设为影片库根目录', '自检读取链路（NFO/海报）']
    .forEach((label) => {
      assert.ok(src.includes(`label: '${label}'`), `工具栏菜单缺少「${label}」`);
    });
  // 点主按钮不该直接开墙 —— 有 caret 就意味着主区是开菜单，菜单里才有「打开影片墙」
  assert.ok(/caret: true/.test(src), '影片墙按钮缺 caret（有下拉时主区只开菜单）');
});

test('影片墙：拿不到 cid 时不再静默当网盘根目录（搜索页「抓不到内容」的根因）', () => {
  const src = readScript('115影片墙.user.js');
  // currentCid 末尾必须是 return null，不能是 return '0'
  const fn = src.slice(src.indexOf('function currentCid()'));
  const body = fn.slice(0, fn.indexOf('\n    }'));
  assert.ok(/return null;/.test(body),
    'currentCid() 拿不到 cid 时应返回 null —— 早先返回 \'0\'（网盘根目录），' +
    '于是搜索结果页上打开影片墙会去扫整个根目录，墙里内容跟用户眼前的搜索结果完全对不上');
  assert.ok(!/return '0';/.test(body), "不该再回退 '0'");

  // 三处「设为库根目录」都要挡 null —— 把 null 存进 GM，下次读出来还是 null，
  // 全库模式永远起不来，而现场早就没了
  const setroots = src.match(/const cid = currentCid\(\);/g) || [];
  assert.ok(setroots.length >= 3, '三处设根目录入口都该出现，实际 ' + setroots.length);
  const guards = src.match(/if \(!cid\) \{ toast\(noCidHint\(\), 'error'/g) || [];
  assert.ok(guards.length >= 3,
    '三处设根目录都要有 null 保护，实际 ' + guards.length + ' —— 漏一处就可能把 null 写进 GM');

  // 目录/全库两个模式的入口都要给出可照做的提示
  assert.ok(src.includes('noCidHint()'), '缺 noCidHint');
  assert.ok(/function noCidHint\(\)/.test(src));
  assert.ok(src.includes('loadDirMode'), 'loadDirMode 应处理 cid 为空');
});

test('影片墙：有布局自检入口（覆盖层铺不满时能直接查，不用猜）', () => {
  const src = readScript('115影片墙.user.js');
  assert.ok(/diagLayout/.test(src), '缺 diagLayout 调试出口');
  // 覆盖层必须固定挂在 body 下 —— 挂到别处会被 115 的层叠上下文限制
  assert.ok(/document\.body\.appendChild\(ov\)/.test(src), '覆盖层应挂在 document.body 下');
  assert.ok(/#mw-overlay\{position:fixed;inset:0/.test(src), '覆盖层应 fixed + inset:0 铺满视口');
});

test('整理助手：没设归档根目录时不弹常驻状态条（用户实机反馈「一直有悬浮提示」）', () => {
  const src = readScript('115整理助手.user.js');
  const fn = src.slice(src.indexOf('const showArchiveRootInfo'));
  const body = fn.slice(0, fn.indexOf('let rootInfoTimer'));
  assert.ok(/if \(!\(archiveRootCid && archiveRootName\)\) return;/.test(body),
    '没设归档根目录时应直接 return —— 那是默认状态，不值得占着屏幕右上角');
  // 文案本身不能出现在代码体里（注释里可以，那是解释为什么删）
  const codeOnly = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/当前无归档根目录/.test(codeOnly),
    '不该再弹「当前无归档根目录」这条提示（用户实机反馈它一直挂在页面上）');
  // 设根目录成功时改用 toast，不再挂常驻条
  assert.ok(!/cleanupExistingRootInfo\(\); showArchiveRootInfo\(\);/.test(src),
    '设根目录后不该再挂常驻状态条');
  // 兜底：状态条 8s 后自动淡出
  assert.ok(/@keyframes archiveRootFade/.test(src), '状态条应加自动淡出动画');
});

test('整理助手：13 项动作都进了工具栏下拉', () => {
  const src = readScript('115整理助手.user.js');
  const labels = [
    '整理并重命名(含子目录)',
    '整理并重命名(含子目录·纯本地)',
    '本地番号加工',
    '改名(多网站轮询)',
    '改名(中文翻译)',
    '归档至文件夹',
    '分桶归档(番号前缀数字段)',
    '设为归档根目录',
    '获取javdb评分',
    '备份文件名',
    '撤销上次改名(回滚)',
    '重命名方式设置',
    '干扰词词典'
  ];
  labels.forEach((l) => assert.ok(src.includes(`label: '${l}'`), `工具栏菜单缺少「${l}」`));
  assert.ok(src.includes("id: 'av-tb-organize'"), '缺少工具栏 slot id');
  assert.ok(/fallback: buildAvFallbackFab/.test(src), '没把降级球交给 mountOrFallback');
});

test('整理助手：工具栏菜单项都绑到了真实存在的函数', () => {
  const src = readScript('115整理助手.user.js');
  // 逐个核对 onClick 里引用的符号在本文件里确实有定义（防止改名后忘了同步）
  ['organizeRecursive', 'local_rename', 'rename_multi', 'archiveToActorFolder',
    'archiveToBucketFolder', 'setArchiveRoot', 'getJavdbRating', 'backupFileNames',
    'undoLastRename', 'showNamingModeDialog', 'showNoiseDictDialog']
    .forEach((fn) => {
      assert.ok(new RegExp(`(const|function|window\\.)\\s*${fn}\\b`).test(src),
        `${fn} 在菜单里被引用但文件里找不到定义`);
    });
});

test('整理助手：入口代码必须在 MW115Toolbar 绑定之后、IIFE 内部', () => {
  const src = readScript('115整理助手.user.js');
  const tbVar = src.indexOf('var MW115Toolbar = (function ()');
  const entry = src.indexOf('MW115Toolbar.mountOrFallback({');
  const iifeEnd = src.lastIndexOf('})();');
  assert.ok(tbVar > 0 && entry > 0, '缺少工具栏核心或入口');
  assert.ok(tbVar < entry, '入口在 MW115Toolbar 绑定之前 → 运行时 undefined，入口不出现');
  assert.ok(entry < iifeEnd, '入口跑到 IIFE 外面了 → 里面的 const/函数全都取不到');
});

test('整理助手：右键菜单仍保留（工具栏挂不上时的第二条路）', () => {
  const src = readScript('115整理助手.user.js');
  assert.ok(src.includes('id="rename_list"'), '右键菜单被误删');
  assert.ok(/\$\("a#undo_last_rename"\)\.off\("click"\)/.test(src), '右键菜单绑定丢了');
});