/* =============================================================================
 * 115 系列油猴脚本 —— 公共核心
 * -----------------------------------------------------------------------------
 * ⚠️ 这是**源码**，不要直接拖进 Tampermonkey 安装。
 *    正式交付的 scripts/*.user.js 由 `node tools/build.js` 把本文件内联进去生成。
 *
 * 只放「纯函数」：不吃 GM_*、不碰 DOM、不联网 —— 这样
 *   ① 三个脚本不会因为各自手写一份而悄悄走偏（之前最常出问题就在这种地方）
 *   ② 能用 `node --test tests/` 在 Node 里直接跑用例
 *   ③ 内联后就是同一闭包里的几个普通变量，零运行时开销
 *
 * 内联形态（build.js 生成）：本文件原样贴进去得到 `var MW115Core`，
 * 随后紧跟一行把导出名字绑到本地变量 —— 脚本里的调用点一个字都不用改。
 * 注意：别把它改成 UMD 那套（挂到 root.XxxCore 上），那样闭包里拿不到名字，
 * 编译检查也照样通过，只有真正跑到页面上才发现 ReferenceError。
 * ========================================================================== */
var MW115Core = (function () {
    'use strict';

    /** HTML 转义。
        两个脚本原来各写一份：整理助手那份**漏了单引号**，拼进 `title="${...}"` 时
        遇到带撇号的片名就能把属性提前闭合。统一按最严的一份来。 */
    var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    function escHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; });
    }

    /** 字节数 → 人类可读。 */
    function fmtBytes(n) {
        if (!n) return '0 B';
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
        return (n / 1048576).toFixed(2) + ' MB';
    }

    /** 视频文件大小：动辄几个 GB，用 MB 读起来费劲，所以 1GB 起改用 GB。 */
    function fmtVideoSize(n) {
        var v = Number(n) || 0;
        if (!v) return '';
        if (v >= 1073741824) return (v / 1073741824).toFixed(2) + ' GB';
        if (v >= 1048576) return Math.round(v / 1048576) + ' MB';
        return fmtBytes(v);
    }

    /** 原图 pickcode 的取值守卫。
        历史包袱：hub 与「文件夹缓存」两条路径都把**标记位**写进了 o 字段（`o: 1`，
        注释原意是「这张图的原图要走 hub 代理」）。但 o 在所有消费点都只当作 pickcode 用 ——
        拿 `1` 去签下载直链必然失败，还会把「缓存失败数」「联网次数」的统计带偏。
        这里统一收口：只有长得像 pickcode 的字符串才算数。 */
    function pickcodeOf(o) {
        return (typeof o === 'string' && /^[A-Za-z0-9_-]{8,}$/.test(o)) ? o : '';
    }

    return {
        escHtml: escHtml,
        fmtBytes: fmtBytes,
        fmtVideoSize: fmtVideoSize,
        pickcodeOf: pickcodeOf
    };
})();

if (typeof module === 'object' && module.exports) module.exports = MW115Core;
