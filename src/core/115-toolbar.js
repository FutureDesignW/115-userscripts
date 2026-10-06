/* =============================================================================
 * 115 系列油猴脚本 —— 顶部工具栏挂载器
 * -----------------------------------------------------------------------------
 * ⚠️ 这是**源码**，不要直接拖进 Tampermonkey 安装。
 *    正式交付的 scripts/*.user.js 由 `node tools/build.js` 把本文件内联进去生成。
 *
 * 解决什么：影片墙和整理助手原先都在右下角丢一个悬浮球（fixed 到 body）。
 *  问题是 ① 挡住内容；② 115 自己的工具栏就在顶部第一行，用户的手先到的地方
 *  根本看不到它们；③ 两个球上下叠着，越堆越多。
 *
 * 115 的页面骨架没有稳定的 class/id（新版是 Tailwind + SPA，class 每次构建都在变），
 * 所以定位策略是「多路候选 + 失败即降级」：
 *   ① **title 锚点（主路径，抄自 JAV 老司机 v2.8.8 的做法）**
 *      115 顶部操作区有个「更多操作」按钮，它的 parentElement 就是整排动作按钮的容器。
 *      定位方式：找 class 为 `.justify-between.w-full.pl-6.pr-5` 的容器（新版顶栏），
 *      里面若有 `button[title="更多操作"]`，就取它的 parentElement 当插入点，
 *      插在「列表视图」那组按钮之前 —— 也就是用户第一眼会扫到的那一排里。
 *      老版走 `#js_top_panel_box .left-tvf[rel="left_tvf"]`，插在预览切换按钮之后。
 *      ★ 为什么用 title 而不是 class：Tailwind 原子类一改版就废，
 *        而「更多操作 / 列表视图 / 更多操作」这些 title 文案是产品定死的，比 class 稳得多。
 *   ② 选择器候选（覆盖历史几版 115 顶部结构）
 *   ③ 文本锚点：找到「上传 / 解压 / 粘贴 / 全选」这类原生按钮，
 *      再上溯到同时装着 ≥2 个锚点的那一层 —— 那就是工具栏按钮组
 *   ④ 同源 iframe（旧版 115 的文件区在 iframe[rel=wangpan] 里）
 *   ⑤ 全失败 → 返回 null，由调用方回退到自己的悬浮球（宁可位置丑，不能没入口）
 *
 * 挂载后自带「重挂巡逻」：115 是 SPA，切目录会整块重建工具栏，
 *  节点被冲掉时自动补回来；已存在则原地复用，绝不重复插。
 * ========================================================================== */
var MW115Toolbar = (function () {
    'use strict';

    /* ---- ① title 锚点：115 顶栏的稳定身份证 ---------------------------------
       这些 title 文案来自 115 自身 UI，产品级定死文案，比 Tailwind class 可靠。
       「更多操作」是整排动作按钮的宿主，「列表视图」是它左边的分隔点 ——
       插在它前面 = 插在原生动作区的末尾，不会挤到面包屑或搜索框中间。 */
    var TITLE_MORE = '更多操作';
    var TITLE_LIST_VIEW = '列表视图';
    var NEW_HEADER_CLASS = 'justify-between.w-full.pl-6.pr-5'; // 新版顶栏容器
    var OLD_TOPBAR = '#js_top_panel_box .left-tvf[rel="left_tvf"]'; // 老版顶栏

    /* ---- ② 选择器候选（顺序即优先级）。刻意不含 header/body 这类
           过宽的选择器 —— 命中它们会把按钮插到完全不该在的位置。 */
    var SELECTORS = [
        '#js_top_header .operate-bar',
        '#js_top_header',
        '.top-operate',
        '.list-operate',
        '[class*="operate-bar"]',
        '[class*="operate-bar"] > div',
        '[class*="top-operate"]',
        '[class*="tool-bar"]',
        '[class*="toolbar"]'
    ];

    /* 文本锚点：这几句是 115 顶部工具栏几十年没换过的文案，比 class 靠谱。
       匹配前先做归一（去空白），所以「上 传」这种排版也认。 */
    var ANCHOR_TEXTS = ['上传', '解压', '新建', '排序', '筛选', '粘贴', '复制路径', '复制链接', '全选', '批量'];

    /** 文本归一：去所有空白 + 转字符串（115 的按钮里常带 <svg>，textContent 里会混进空白）。 */
    function normText(s) {
        return String(s == null ? '' : s).replace(/\s+/g, '');
    }

    /** 从候选里挑第一个「真的挂在 DOM 上、且可见」的。 */
    function firstVisible(doc, sels) {
        for (var i = 0; i < sels.length; i++) {
            var nodes;
            try { nodes = doc.querySelectorAll(sels[i]); } catch (e) { continue; }
            for (var j = 0; j < nodes.length; j++) {
                var el = nodes[j];
                // offsetParent 为 null 不代表不可见（fixed 元素就是），
                // 这里只排掉 display:none 和零尺寸，避免把按钮插进隐藏容器。
                var r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
                if (!r || (r.width > 0 && r.height > 0)) return el;
            }
        }
        return null;
    }

    /** 拿 computedStyle。Node 里没有 window（单测直接 require 本文件），别在这炸。 */
    function getStyle(el) {
        try {
            return (typeof window !== 'undefined' && window.getComputedStyle)
                ? window.getComputedStyle(el) : null;
        } catch (e) { return null; }
    }

    /**
     * 判断元素是否真的显示得出。
     * 115 顶栏同时存在「桌面版 / 移动版」两套 DOM，只 display:none 掉一套；
     * 不验可见性就会把按钮插进隐藏那一套 —— 页面上看不见，等于没挂。
     */
    function isDisplayed(el) {
        if (!el) return false;
        var style = getStyle(el);
        if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
        return !!(el.getClientRects && el.getClientRects().length) || !!el.offsetWidth || !!el.offsetHeight;
    }

    /**
     * 主路径：用 title 文案反查顶栏动作组。
     * 返回 { host, before } —— host 是插入容器，before 是插到它前面（可为 null = 追加末尾）。
     *
     * 新版（Tailwind）：`.justify-between.w-full.pl-6.pr-5` 容器里找
     *   `button[title="更多操作"]` → 它的 parentElement 就是整排动作的容器，
     *   插在同容器里 `button[title="列表视图"]` 那一组之前（也就是动作区最左端）。
     *   没有列表视图锚点时直接追加到容器末尾。
     * 老版：`#js_top_panel_box .left-tvf[rel="left_tvf"]`，插在预览切换按钮之后。
     */
    function locateByTitle(doc) {
        if (!doc || !doc.body) return null;

        // —— 新版顶栏 ——
        var headers;
        try { headers = doc.querySelectorAll('.' + NEW_HEADER_CLASS); } catch (e) { headers = []; }
        for (var i = 0; i < headers.length; i++) {
            var root = headers[i];
            if (!isDisplayed(root)) continue;                    // 跳过隐藏的移动版顶栏
            var moreBtn = root.querySelector('button[title="' + TITLE_MORE + '"]');
            if (!moreBtn) continue;

            // 「更多操作」的父元素才是整排动作的容器；万一它就是按钮本身（少一层 div），
            // 就退到它自己所在的那一层。
            var group = moreBtn.parentElement || moreBtn;
            if (!group) continue;

            var listBtn = group.querySelector('button[title="' + TITLE_LIST_VIEW + '"]');
            var before = listBtn ? (listBtn.parentElement || listBtn) : null;
            // before 若已经是 group 本身（只有一层），插到它前面没意义 → 追加末尾
            if (before === group) before = null;
            return { host: group, before: before };
        }

        // —— 老版顶栏 ——
        var oldBar = firstVisible(doc, [OLD_TOPBAR]);
        if (oldBar) {
            var previewBtn = oldBar.querySelector('.master-preview-switch-btn');
            return { host: oldBar, before: previewBtn ? previewBtn.nextSibling : null };
        }
        return null;
    }

    /** 找到「文本正好等于某个锚点、且没有更深的子元素也命中」的最内层元素。 */
    function deepestAnchor(doc) {
        var all = doc.querySelectorAll('a,button,span,div,li,label,i');
        var best = null;
        for (var i = 0; i < all.length; i++) {
            var el = all[i];
            if (ANCHOR_TEXTS.indexOf(normText(el.textContent)) < 0) continue;
            // 若某个子元素也命中，说明当前节点不是最内层 —— 跳过，
            // 否则会把 slot 插到外层容器里，位置飘到面包屑附近。
            var deeper = false;
            for (var k = 0; k < el.children.length; k++) {
                if (ANCHOR_TEXTS.indexOf(normText(el.children[k].textContent)) >= 0) { deeper = true; break; }
            }
            if (deeper) continue;
            if (!best || best.contains === false || el.contains(best)) best = el;
        }
        return best;
    }

    /** 从锚点按钮往上找「同时装着 ≥2 个锚点」的那一层 —— 工具栏按钮组就在它里面。
        一路走到顶都没找到第二个锚点就返回 null（宁可降级，也不乱插）。 */
    function groupByAnchors(doc) {
        var seed = deepestAnchor(doc);
        if (!seed) return null;
        var hits = 0;
        var node = seed;
        while (node && node !== doc.body && node.nodeType === 1) {
            hits = 0;
            for (var i = 0; i < node.children.length; i++) {
                if (ANCHOR_TEXTS.indexOf(normText(node.children[i].textContent)) >= 0) hits++;
            }
            // 至少两个直接子节点就是原生按钮 → 这一层就是按钮组
            if (hits >= 2) return node;
            node = node.parentElement;
        }
        return null;
    }

    /** 定位工具栏容器。返回 null 表示这一份文档里找不到（调用方负责降级）。
        返回 { host, before }；before 为 null 表示追加到 host 末尾。 */
    function findToolbar(doc) {
        if (!doc || !doc.body) return null;

        // ① 主路径：title 锚点（新版 + 老版顶栏）
        var byTitle = locateByTitle(doc);
        if (byTitle) return byTitle;

        // ② 降级：class 选择器候选 —— 命中就追加到该容器末尾
        var bySel = firstVisible(doc, SELECTORS);
        if (bySel) return { host: bySel, before: null };

        // ③ 兜底：文本锚点上溯出的按钮组
        var byAnchor = groupByAnchors(doc);
        if (byAnchor) return { host: byAnchor, before: null };

        return null;
    }

    /** 主页面找不到就翻同源 iframe —— 旧版 115 的文件区整个装在 iframe 里。
        跨域 iframe 会抛安全异常，逐个吞掉（老手都这么写，没别的办法）。 */
    function eachDocument(rootDoc, visit) {
        if (!rootDoc) return false;
        if (visit(rootDoc)) return true;
        var frames;
        try { frames = rootDoc.querySelectorAll('iframe'); } catch (e) { return false; }
        for (var i = 0; i < frames.length; i++) {
            var inner = null;
            try { inner = frames[i].contentDocument; } catch (e) { continue; }
            if (inner && visit(inner)) return true;
        }
        return false;
    }

    /* ------------------------------------------------------------------------
     * 样式
     * ---------------------------------------------------------------------- */
    var STYLE_ID = 'mw115-toolbar-style';

    /* 按钮外观对齐 115 新版顶栏（尺寸/字号/描边都照原生按钮那一档来，
       不然一排 28px 的小按钮夹在 32px 的原生按钮里会明显矮一截）。
       菜单项用 a 标签但去掉下划线色 —— 保持和 115 原生右鍵菜单一致的观感。 */
    function css() {
        return [
            '.mw115-tb-slot{display:inline-flex;align-items:center;gap:8px;margin:0 6px;vertical-align:middle;position:relative;}',
            '.mw115-tb-btn{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 12px;',
            'box-sizing:border-box;border:1px solid #d1d4d6;border-radius:4px;background:#fff;color:#4b5563;',
            'font-size:14px;line-height:1;cursor:pointer;white-space:nowrap;user-select:none;',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;}',
            '.mw115-tb-btn:hover{border-color:#1989fa;color:#1989fa;background:#f2f8ff;}',
            '.mw115-tb-btn:active{background:#e6f2ff;}',
            '.mw115-tb-btn:focus-visible{outline:2px solid rgba(58,71,131,.45);outline-offset:1px;}',
            '.mw115-tb-dot{width:8px;height:8px;border-radius:2px;flex:none;}',
            '.mw115-tb-caret{border:3px solid transparent;border-top-color:currentColor;margin-left:1px;opacity:.55;}',
            '.mw115-tb-menu{position:absolute;top:calc(100% + 6px);left:0;min-width:210px;background:#fff;',
            'border:1px solid #e4e6ed;border-radius:6px;box-shadow:0 8px 28px rgba(0,0,0,.16);',
            'padding:5px;z-index:2147483000;display:none;font-size:13px;color:#303133;}',
            '.mw115-tb-slot.open .mw115-tb-menu{display:block;}',
            '.mw115-tb-menu b{display:block;padding:6px 10px 7px;font-size:12px;font-weight:600;color:#909399;',
            'border-bottom:1px solid #f0f1f5;margin-bottom:4px;}',
            '.mw115-tb-menu a{display:block;padding:7px 10px;border-radius:4px;color:#303133;text-decoration:none;',
            'font-family:inherit;font-size:13px;cursor:pointer;white-space:nowrap;}',
            '.mw115-tb-menu a:hover{background:#f2f8ff;color:#1989fa;}',
            '.mw115-tb-menu a.mw115-tb-sep{color:#c0c4cc;cursor:default;}',
            '.mw115-tb-menu a.mw115-tb-sep:hover{background:transparent;color:#c0c4cc;}',
            '.mw115-tb-menu hr{border:0;border-top:1px solid #f0f1f5;margin:4px 6px;}',
            // 挂在 body 上的降级悬浮球：保持跟工具栏一致的观感，别太扎眼
            '.mw115-tb-fallback{position:fixed;right:18px;bottom:88px;z-index:9998;display:inline-flex;',
            'align-items:center;height:36px;padding:0 14px;border-radius:18px;cursor:pointer;user-select:none;',
            'box-shadow:0 4px 14px rgba(0,0,0,.18);font-size:13px;font-weight:600;color:#fff;',
            'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}'
        ].join('\n');
    }

    function ensureStyle(doc) {
        if (!doc) return;
        // head 偶尔拿不到（文档还没建好），退到 documentElement，再不行就放弃 ——
        // 但绝不能因此把整个挂载流程带崩，样式缺失只是难看，功能还在。
        var host = doc.head || doc.documentElement || doc.body;
        if (!host || typeof host.appendChild !== 'function') return;
        try {
            if (doc.getElementById && doc.getElementById(STYLE_ID)) return;
            var s = doc.createElement('style');
            s.id = STYLE_ID;
            s.textContent = css();
            host.appendChild(s);
        } catch (e) { /* 样式注入失败不该影响入口可用性 */ }
    }

    /** 造一个工具栏按钮。opt = { label, dot, title, caret, menuTitle, items:[{label, onClick, sep}] } */
    function makeButton(doc, opt) {
        var b = doc.createElement('div');
        b.className = 'mw115-tb-btn';
        b.title = opt.title || opt.label;
        if (opt.dot) {
            var d = doc.createElement('i');
            d.className = 'mw115-tb-dot';
            d.style.background = opt.dot;
            b.appendChild(d);
        }
        b.appendChild(doc.createTextNode(opt.label));
        if (opt.caret) {
            var c = doc.createElement('i');
            c.className = 'mw115-tb-caret';
            b.appendChild(c);
        }
        if (opt.menuTitle || (opt.items && opt.items.length)) {
            var menu = doc.createElement('div');
            menu.className = 'mw115-tb-menu';
            if (opt.menuTitle) {
                var h = doc.createElement('b');
                h.textContent = opt.menuTitle;
                menu.appendChild(h);
            }
            (opt.items || []).forEach(function (it) {
                if (it.sep) { menu.appendChild(doc.createElement('hr')); return; }
                var a = doc.createElement('a');
                a.textContent = it.label;
                if (it.title) a.title = it.title;
                a.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    // slot 是外层 mount() 里的变量，这里取不到 —— 从事件目标反查。
                    // （早先直接写 slot.classList 会抛 ReferenceError，菜单项点了没反应。）
                    var owner = b.closest ? b.closest('.mw115-tb-slot') : null;
                    if (owner) owner.classList.remove('open');
                    try { it.onClick && it.onClick(); } catch (err) { /* 菜单项报错不许连累整条工具栏 */ }
                });
                menu.appendChild(a);
            });
            b.appendChild(menu);
        }
        return b;
    }

    /** 关闭页面上所有已展开的下拉（点外部/点别的按钮时用）。 */
    function closeAllSlots() {
        var slots = document.querySelectorAll('.mw115-tb-slot.open');
        for (var i = 0; i < slots.length; i++) slots[i].classList.remove('open');
    }

    /**
     * 把按钮挂到顶部工具栏。
     *   opts = {
     *     id:       'mw-tb-moviewall',   // slot 的 id（幂等键）
     *     buttons:  [{ label, dot, title, onClick, caret, menuTitle, items }]
     *     fallback: () => 元素            // 挂不上时用的降级球
     *     fallbackId: 'mw-fab'            // 降级球的 id，供巡逻清理
     *     legacyFallbackIds: ['旧id']     // 历史版本遗留的降级球 id
     *   }
     * 返回 slot 元素；找不到工具栏返回 null（调用方自行降级到悬浮球）。
     */
    function mount(opts) {
        if (!opts || !opts.id) return null;

        // ⚠️ 样式必须无条件注入，且要在定位之前 ——
        //    定位失败会 return null，而降级球（.mw115-tb-fallback）用的
        //    position:fixed 就来自这份 CSS。早先 ensureStyle 排在 return 之后，
        //    于是挂不上工具栏时降级球是个裸 div：block 布局 + 通栏渐变背景，
        //    直接横一条在页面底部，用户看到的就是「下面多了一条」。
        ensureStyle(document);

        var host = null, before = null, doc = null;
        eachDocument(document, function (d) {
            ensureStyle(d);   // iframe 内的顶栏也要有样式
            var hit = findToolbar(d);
            if (hit) { host = hit.host; before = hit.before; doc = d; return true; }
            return false;
        });

        // 找不到就返回 null —— 调用方负责回退到自己的悬浮入口。
        if (!host) return null;

        var slot = doc.getElementById(opts.id);
        if (!slot || slot.parentElement !== host) {
            if (slot && slot.parentElement) slot.parentElement.removeChild(slot);
            slot = doc.createElement('div');
            slot.id = opts.id;
            slot.className = 'mw115-tb-slot';
            (opts.buttons || []).forEach(function (opt) {
                var b = makeButton(doc, opt);
                // ⚠️ 判断依据是「有没有菜单」，不是「有没有 onClick」——
                //    早先写成 if (opt.onClick)，于是「只有下拉、动作都在菜单项里」的按钮
                //    （影片墙、整理助手都是这种）点主区什么都不发生，下拉永远打不开。
                if (opt.onClick || opt.menuTitle || (opt.items && opt.items.length)) {
                    b.addEventListener('click', function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        var hasMenu = b.querySelector('.mw115-tb-menu');
                        if (hasMenu) {
                            var wasOpen = slot.classList.contains('open');
                            closeAllSlots();
                            if (!wasOpen) slot.classList.add('open');
                            return;
                        }
                        closeAllSlots();
                        try { opt.onClick(); } catch (err) { /* 单个按钮报错不许连累整条工具栏 */ }
                    });
                }
                slot.appendChild(b);
            });
            // before 可能因为 SPA 重建而已经脱离文档了 —— 用 parentNode 复核一次
            if (before && before.parentNode === host) host.insertBefore(slot, before);
            else host.appendChild(slot);
        }

        // 点空白处收起下拉（只绑一次）
        if (!mount._docBound) {
            mount._docBound = true;
            document.addEventListener('click', function () { closeAllSlots(); }, true);
            window.addEventListener('resize', closeAllSlots);
        }
        return slot;
    }

    /**
     * 挂不上就退到右下角悬浮球；并且无论走哪条路都开启重挂巡逻。
     *   opts.fallback() 需返回一个可挂载的元素（调用方自己造，样式自己管）。
     * 返回 { el, inToolbar: Boolean }
     */
    function mountOrFallback(opts) {
        ensureStyle(document);
        var el = mount(opts);
        if (el) {
            startWatch(opts);
            return { el: el, inToolbar: true };
        }
        var fb = opts.fallback ? opts.fallback() : null;
        if (fb) {
            // ⚠️ 不要改 fb.id —— id 是调用方的身份，靠它做幂等短路。
            //    早先在这里覆写成 opts.id + '-fallback'，直接废掉了脚本里的
            //    `if ($('#mw-fab')) return $('#mw-fab')[0]` ——
            //    每次巡逻都新建一个球，页面上就堆出一排「多了一条」。
            //    降级球的定位/尺寸用内联样式钉一遍：CSS 注入万一失败
            //    （CSP 拦 style、head 拿不到），一个没约束的 div 会按 block
            //    铺满整行，表现为「页面底部多了一条横条」。
            if (fb.style) {
                fb.style.position = 'fixed';
                fb.style.right = '18px';
                fb.style.bottom = '88px';
                fb.style.zIndex = '9998';
                fb.style.display = 'inline-flex';
                fb.style.alignItems = 'center';
                fb.style.height = '36px';
                fb.style.padding = '0 14px';
                fb.style.borderRadius = '18px';
                fb.style.width = 'auto';
            }
            if (fb.parentNode !== document.body) document.body.appendChild(fb);
        }
        startWatch(opts);
        return { el: fb, inToolbar: false };
    }

    /**
     * 巡逻：115 是 SPA，切目录/改视图会把顶栏整块重建，节点被冲掉后自动补挂。
     *
     * 判定「被冲掉了」的方式不是比对选择器（那些 class 每次构建都在变），
     * 而是重新定位一次工具栏、看 slot 还在不在那个 host 底下 —— 与 mount() 同一条判定逻辑。
     * 1.5s 一轮足够，又不跟页面抢 CPU。
     */
    function startWatch(opts) {
        if (!opts || opts._watching) return;
        opts._watching = true;

        /**
         * 清掉降级球。
         * 球有各自的 id（影片墙 #mw-fab、整理助手 #av-organize-fab），核心不猜 ——
         * 由调用方通过 opts.fallbackId 声明，另有 opts.legacyFallbackIds 收旧版遗留。
         * ⚠️ 核心绝不能擅自覆写 fb.id：那会废掉脚本里
         *    `if ($('#mw-fab')) return $('#mw-fab')[0]` 的幂等短路，
         *    每次巡逻都新建一个球，页面上就堆出一排「多了一条」。
         */
        function clearFallbacks() {
            var ids = (opts.legacyFallbackIds || []).slice();
            if (opts.fallbackId) ids.unshift(opts.fallbackId);
            for (var i = 0; i < ids.length; i++) {
                var n = document.getElementById(ids[i]);
                while (n) {
                    var parent = n.parentNode;
                    if (!parent) break;
                    parent.removeChild(n);
                    n = document.getElementById(ids[i]);   // 同一 id 可能有多个节点
                }
            }
        }

        setInterval(function () {
            var slot = document.getElementById(opts.id);
            var hit = findToolbar(document);
            var alive = slot && hit && slot.parentElement === hit.host;

            if (!alive) {
                // 还挂在 body 上（降级态）就先撤掉，避免和工具栏按钮同时在场
                if (slot && slot.parentElement === document.body && slot.parentNode) {
                    slot.parentNode.removeChild(slot);
                }
                clearFallbacks();

                // 核心不设 id：让脚本自己的 buildFallbackFab 走幂等短路，
                // 它复用的旧节点会带着正确的 id 回到页面上。
                if (!mount(opts) && opts.fallback && document.body) {
                    var fb = opts.fallback();
                    if (fb) document.body.appendChild(fb);
                }
            } else {
                // 已经在工具栏上了 —— 把还残留的降级球清干净
                clearFallbacks();
            }
        }, 1500);
    }

    return {
        mount: mount,
        mountOrFallback: mountOrFallback,
        findToolbar: findToolbar,
        locateByTitle: locateByTitle,
        isDisplayed: isDisplayed,
        normText: normText,
        ANCHOR_TEXTS: ANCHOR_TEXTS,
        SELECTORS: SELECTORS,
        TITLE_MORE: TITLE_MORE,
        TITLE_LIST_VIEW: TITLE_LIST_VIEW,
        NEW_HEADER_CLASS: NEW_HEADER_CLASS,
        OLD_TOPBAR: OLD_TOPBAR
    };
})();

if (typeof module === 'object' && module.exports) module.exports = MW115Toolbar;