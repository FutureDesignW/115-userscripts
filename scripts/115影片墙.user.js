// ==UserScript==
// @name            115影片墙
// @namespace       cloud115.moviewall
// @version         3.13.2
// @description     115 网盘影片墙（Emby 式）：直接读视频同目录下的海报/NFO（由本机 115 Media Hub 的「导出媒体文件」生成）；**素材实时存到本地**——NFO 原文/解析结果/海报原图自动落盘，缓存位置可选「浏览器本地」或「你自选的本机文件夹」（写成磁盘真实文件，可备份可复用），重开零请求秒出；卡片显示文件大小与码率；**新增「详情」面板**——剧情简介/标签/原名/厂牌/发行/系列/导演/时长/分级/国家/评分/数据来源 + 文件信息一屏看全（对齐 hub 的详情抽屉），卡片一行放不下的都在这里；排序支持 番号/文件名/目录/演员/类型/评分/观看日期/随机；勾选卡片可批量移动/删除并连带海报与 NFO，**做完原地摘卡片——不刷新页面、图不重下、滚动不跳**；**横版卡片默认用「横版高清」（-thumb/-fanart 里挑体积最大的那张：实测中位 776KB，是竖海报的 2.9 倍），可在设置里改成竖版海报或剧照；海报只有 147×200 时（约占 24%）会自动跳过糊图改用清晰图**
// @author          cloud115.moviewall
// @license         MIT
// @icon            https://115.com/favicon.ico
// @include         https://115.com/*
// @exclude         https://q.115.com/*
// @connect         webapi.115.com
// @connect         proapi.115.com
// @connect         uplb.115.com
// 115 下载 CDN（读 NFO / 取海报原图都走它）
// 域名会变，所以三种写法都写上：精确域名 + 子域通配 + 全通配兜底。
// 少一条的表现是「请求被拦但代码静默失败」——读不到 NFO、没有片名，很难查。
// @connect         cdnfhnfile.115.com
// @connect         *.115.com
// @connect         *.115cdn.com
// @connect         *.anxia.com
// @connect         *
// @connect         *.aliyuncs.com
// @connect         pics.dmm.co.jp
// @connect         javdb.com
// @connect         jdbstatic.com
// @connect         translate-pa.googleapis.com
// @connect         oneshot-free.www.deepl.com
// @connect         api.mymemory.translated.net
// @connect         127.0.0.1
// @connect         localhost
// @grant           GM_xmlhttpRequest
// @grant           GM_addStyle
// @grant           GM_getValue
// @grant           GM_setValue
// @grant           GM_deleteValue
// @grant           GM_registerMenuCommand
// @grant           GM_notification
// @grant           GM_setClipboard
// @grant           unsafeWindow
// @run-at          document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ========================================================================
    // 0. 常量
    // ========================================================================
    const API_BASE = 'https://webapi.115.com';
    const PRO_API = 'https://proapi.115.com';
    const UPLB_API = 'https://uplb.115.com';
    const DMM_PS = (id) => `https://pics.dmm.co.jp/mono/movie/adult/${id}/${id}ps.jpg`;
    const DMM_PL = (id) => `https://pics.dmm.co.jp/mono/movie/adult/${id}/${id}pl.jpg`;
    const JAVDB_SEARCH = (code) => 'https://javdb.com/search?f=all&q=' + encodeURIComponent(code);
    const PLAYER_URL = (pc) => 'https://115.com/web/lixian/master/video/?pick_code=' + encodeURIComponent(pc);

    const VIDEO_EXT_RE = /\.(mp4|mkv|avi|rmvb|rm|wmv|flv|mov|ts|m2ts|m4v|webm|iso|mpg|mpeg|vob|3gp|asf|f4v|divx|mts|tp|trp)$/i;
    const PS_REAL_MIN_BYTES = 6000;
    const SCAN_MAX_DEPTH = 12;
    const SCAN_MAX_DIRS = 2000;
    const SCAN_MAX_FILES = 20000;
    const API_CHUNK = 1150;
    const MISS_TTL_MS = 7 * 24 * 3600 * 1000;
    // （原来的 LIB_TTL_MS 固定 30 分钟已取消 —— v3.9 起改成 CFG.libCacheMin：
    //   本地索引先用后校验，见 loadLibMode）
    // 库索引缓存的结构版本：v3.7 起条目多了「时长 / 播放时间」等字段，
    // 老缓存里没有这些字段 → 直接作废重扫一次，免得大小/码率/观看日期读不到
    const LIB_SCHEMA = 37;
    const RENDER_BATCH = 48;
    // 依赖元数据（演员/类型/评分）的排序 —— 这些字段随卡片读到才出现，所以要支持「读一批就重排一次」
    const META_SORTS = { actor: 1, type: 1, rating: 1 };

    const STORE_POSTER = 'mw_poster_cache';
    const STORE_TRANS = 'mw_translate_cache';
    const STORE_LIB = 'mw_lib_cache_';
    const STORE_ROOT = 'mw_root_cid';
    const STORE_ROOT_NAME = 'mw_root_name';
    const STORE_CFG = 'mw_cfg';
    const STORE_FOLDER_STAT = 'mw_folder_cache_stat';
    // v3.9「本地缓存秒开」：把原来只存在内存里的东西落盘，重开影片墙零网络往返
    const STORE_NFO = 'mw_nfo_cache';          // NFO 解析结果（原来只活在内存里，每次重开都要重读网盘）
    const STORE_DIR = 'mw_dir_cache_';         // 目录列目录结果（当前文件夹模式）
    const STORE_IMG_META = 'mw_img_bank_meta'; // 图片缓存的索引（真实图片在 IndexedDB 里）
    const DAY_MS = 24 * 3600 * 1000;
    const NFO_SCHEMA = 1;
    const NFO_MISS_TTL = 30 * 60 * 1000;       // NFO 读失败只记 30 分钟，别把偶发故障当常态
    const NFO_MAX_ENTRIES = 5000;              // 缓存条目上限（超出按最久未用淘汰）
    const DIR_TTL_MS = 10 * 60 * 1000;         // 目录缓存的「直接可信」窗口，超了就后台刷新
    // 115 缩略图直链失效时会回一张约 1.6KB 的「图片已过期」占位图（正常 100 尺寸约 6.7KB，
    // _200 约 19KB）—— 自检按体积判断是否已过期
    const THUMB_MIN_BYTES = 2600;
    // sidecar 图片的「低清线」：实测（骑兵目录 200 条）24% 的 -poster.jpg 只有 147×200、13~19KB，
    // 而同名的 -thumb.jpg 有 170KB+。低于这条线的图当卡片封面会糊，挑图时跳过它。
    const TINY_SIDECAR_BYTES = 24 * 1024;
    const IMG_DB_NAME = 'mw_poster_bank';      // IndexedDB：海报原图（二进制直接存，不做 base64 膨胀）

    // ========================================================================
    // 1. 设置
    // ========================================================================
    const CFG_DEF = {
        // 常用
        titleTranslate: true,        // 翻译标题
        listPreviewQuick: true,      // 首页快捷功能（卡片悬浮操作）
        listOpenNewTab: true,        // 新标签打开页面
        cardFx: true,                // 卡片动画
        coverHoverPreview: true,     // 封面悬浮大图
        // 界面相关
        portraitCards: false,        // 竖图模式
        wideCardImage: 'auto',       // 横版卡片的图：auto（横版高清，谁清晰用谁）| fanart（横版剧照）| poster（竖海报）
        avoidTinyImg: true,          // 低清守卫：海报只有 147×200 时改用它同名的清晰图
        columns: 0,                  // 卡片列数，0 = 自适应
        pageWidth: 100,              // 内容宽度 %
        masonry: false,              // 瀑布流
        showPath: true,              // 显示所在目录
        showFileName: true,          // 显示原始文件名
        showSize: true,              // 显示文件大小
        showBitrate: true,           // 显示视频码率（115 不直接给，用「大小 ÷ 时长」算）
        showWatch: false,            // 显示观看时间（配合「按观看日期排序」看更方便）
        batchWithSidecars: true,     // 批量移动/删除时连带同目录的海报/NFO（否则会留孤儿产物）
        hideNoCode: false,           // 隐藏未识别番号的影片
        // 刮削与翻译
        preferSidecar: true,         // 优先读网盘目录里的海报/NFO（Emby 式 sidecar）
        hiResPoster: true,           // 海报取网盘原图（缩略图只有 200px，会糊）
        translateTarget: 'zh-CN',    // 翻译目标语言
        posterSource: 'dmm-first',   // dmm-first | javdb-first | cache-only
        concurrency: 4,              // 刮削并发
        autoScrape: true,            // 自动刮削（关掉则只用缓存）
        fetchMeta: true,             // 需要标题时补抓 JavDB 元数据
        // 缓存与高级
        folderCache: false,          // 写缓存到网盘目录：**已停用**（115 封了脚本直传，改由 hub 导出 poster/NFO）
        cacheFileName: '影片墙缓存.json',
        cacheDays: 30,               // 本地缓存天数
        saveOnClose: false,          // 关闭时保存缓存（同上，已停用）
        // 本地缓存优先（v3.9）—— 打开先用本地数据渲染，再后台校验，避免每次都去网盘重读
        localFirst: true,            // 本地缓存优先（秒开）
        autoCacheLocal: true,        // 打开后自动把 NFO（含原文）与海报原图实时存到本地
        cacheBackend: 'idb',         // 缓存位置：idb（浏览器本地）| folder（你自选的本机文件夹）
        nfoCache: true,              // NFO 解析结果存本地（重开不用再读网盘）
        imgCache: true,              // 海报原图存本地（IndexedDB），重开不再重新下载
        imgCacheMB: 64,              // 图片缓存上限（MB），超出按最久未用淘汰
        libCacheMin: 30,             // 全库索引超过多少分钟就后台刷新（0 = 每次打开都刷新）
        // 本机 115 Media Hub（刮削主力）
        hubEnabled: true,             // 用本机 hub 刮削
        hubBase: 'http://127.0.0.1:18080',
        hubUser: 'admin',
        hubPass: '',
        hubCookie: '',                // 可选：手动粘贴 session cookie
        hubImageProxy: true,          // 海报走 hub 代理（解决防盗链）
        hubAutoTranslate: true,       // 用 hub 翻译标题
        hubAutoScan: false,           // 打开时让 hub 扫描当前目录
        hubRetryMin: 10               // hub 结果缓存分钟数
    };
    let CFG = Object.assign({}, CFG_DEF, loadJson(STORE_CFG, {}));
    const saveCfg = () => saveJson(STORE_CFG, CFG);

    // 一次性迁移（v3.4）：网盘缓存写入已停用（115 封了脚本直传），
    // 把老配置里残留的开关强制关掉 —— 否则设置里显示的「已停用」和实际配置对不上。
    try {
        if (GM_getValue('mw_cachewrite_off_v34', '') !== '1') {
            if (CFG.folderCache || CFG.saveOnClose) {
                CFG.folderCache = false;
                CFG.saveOnClose = false;
                saveCfg();
            }
            GM_setValue('mw_cachewrite_off_v34', '1');
        }
    } catch (e) { /* ignore */ }

    // ========================================================================
    // 2. 番号解析（移植自 115Rename2026 2.3.0）
    // ========================================================================
    const MANUAL_PREFIXES = [
        'LEGSJAPAN', 'AYAKISAKI', 'SPERMMANIA', 'FELLATIOJAPAN',
        'S2MCR', 'MXVR', 'SIVR',
        'T28', 'S2M', '300MAAN', '200GANA', '259LUXU', '277DCV', '230GANA', '261ADA',
        'DASS', 'REBD', 'REBDB', 'MIDV', 'SSIS', 'PRED', 'PRTD', 'FSDSS', 'SAMA',
        'MIDE', 'MIAD', 'MIAA', 'MIAE', 'MIAS', 'MIGD', 'MIRD', 'MIFD', 'MIID', 'MIZD', 'MDYD', 'MBYD', 'MEYD',
        'WANZ', 'NWF', 'BMW', 'JBD', 'RBD', 'ATAD', 'SHKD', 'SSPD', 'ATID', 'ADN',
        'IPTD', 'IPZ', 'IPX', 'IPZZ', 'IPIT', 'IPITD', 'IDBD', 'SUPD', 'IPSD', 'DAN', 'AND',
        'KAWD', 'KWBD', 'KAPD', 'JUC', 'JUX', 'JUY', 'JUSD', 'JUKD', 'OBA', 'URE',
        'JUFE', 'FINH', 'EBOD', 'MKCK', 'EYAN', 'KIRD', 'KIBD', 'BLK', 'KISD',
        'ONED', 'SOE', 'SNIS', 'SSNI', 'OFJE', 'SPS', 'SRXV', 'TMSD', 'NEXD',
        'PGD', 'PBD', 'PJD', 'TEK', 'PPPD', 'HND', 'TYOD', 'TPPN', 'BF', 'ZUKO',
        'BID', 'BBI', 'CJOD', 'CLUB', 'MMND', 'TEAM', 'HHK', 'ALB', 'MUKD', 'MUDR', 'MUM',
        'ANND', 'BBAN', 'MOND', 'SPRD', 'VENU', 'VEMA', 'VAGU',
        'STARS', 'STAR', 'SACE', 'SDMS', 'SDDE', 'SDMT', 'SDDM', 'SDNM', 'SDAB', 'SDSI', 'SDMU',
        'DVDPS', 'DVDES', 'NHDT', 'NHDTA', 'RNHDT', 'IESP', 'IDOL', 'IENE', 'OPEN',
        'SVND', 'HBAD', 'HAVD', 'NTR', 'VSPDS', 'VSPDR', 'MV', 'FSET', 'DANDY', 'LADY',
        'HUNTA', 'HUNTB', 'HUNT', 'GAR', 'SVDVD', 'RCT', 'RCTD', 'NGKS', 'RD', 'KUF', 'NSS', 'UPSM', 'SERO',
        'DVAJ', 'DV', 'XVSR', 'XVSE', 'XV', 'PXV',
        'MADA', 'MDS', 'RMLD', 'MILD', 'MDB', 'RMDBB', 'RMDS', 'REAL', 'NATR', 'SCOP', 'SAMA', 'BOKD',
        'ABS', 'ABP', 'KBH', 'EZD', 'MAS', 'INU', 'JOB', 'EDD', 'ESK', 'MEK', 'DOM', 'YRZ',
        'PPP', 'EVO', 'SAD', 'GYD', 'HYK', 'FST', 'TBL', 'LOO', 'TOR', 'TD', 'RBS', 'MAN', 'ZZR', 'WPC', 'BNDV', 'CRS',
        'HODV', 'HRDV', 'YMDD', 'TMD', 'DSD', 'RJMD', 'ALD', 'DBE', 'DOJ', 'OFCD', 'SEND', 'ULJM', 'DSS', 'MOED', 'DER',
        'OPD', 'GRYD', 'MSBD', 'SS', 'HD', 'DVH', 'REID', 'GEN', 'DBUD', 'IBW', 'MMO', 'ADZ',
        'AKB', 'HITMA', 'RAY', '24ID', 'COSQ',
        'GRET', 'GATE', 'GEXP', 'GGFH', 'GGTB', 'GMMD', 'GODS', 'GPTM', 'GSAD', 'GXXD', 'GDGA', 'GOMK', 'GTRL',
        'GOMD', 'GDSC', 'TBW', 'TBB', 'TDP', 'TDLN', 'TGGP', 'THP', 'THZ', 'TMS', 'TZZ', 'TRE', 'TSGS', 'TSDL',
        'TSWN', 'TSW', 'TTRE', 'ATHB', 'AKBD', 'DMG', 'MGJH', 'ANIX', 'CYCD', 'YNO', 'AZGB', 'SKOT', 'SHP', 'JMSZ',
        'JHZD', 'NFDM', 'CGAD', 'CGBD', 'CHSD', 'CUSD', 'CHSH', 'CMV', 'PAED', 'RGI', 'ZARD', 'ZATS', 'ZDAD', 'ZKV',
        'COSETT', 'MXGS', 'MX3DS', 'IPBZ', 'FSDSS', 'SVMGM', 'MIDA',
        'DSAM', 'RED', 'BT', 'MX', 'SI', 'VOL', 'CR', 'N',
        'SONE', 'START', 'ABF', 'HMN', 'JUQ', 'JUR', 'WAAA', 'DLDSS', 'CAWD', 'MKMP',
        'MISM', 'MVSD', 'NNPJ', 'PPPE', 'SDAM', 'SDJS', 'SDMF', 'SDMM', 'TYSF', 'UMD',
        'VENX', 'YUJ', 'FERA', 'BKD', 'BIJN', 'AARM', 'NHDTB', 'JUFD', 'JUTN', 'JRZE',
        'KSBJ', 'MIMK', 'MDBK', 'SAME', 'SDHS', 'STSK', 'MIAB', 'MDON', 'MKON', 'BONY',
        'FNEO', 'OFKU', 'MUKC', 'SUKE', 'NIMA', 'AMBI', 'ARAN', 'EBWH', 'FPRE', 'GVH',
        'HJMO', 'HOKS', 'IENF', 'JUNY', 'KANO', 'KBMS', 'KIT', 'KMHR', 'KTRA', 'LULU',
        'MCT', 'MMUS', 'MRSS', 'NACR', 'NKKD', 'OKS', 'ONEX', 'PED', 'ROE', 'RKI',
        'SILK', 'SPLY', 'SQTE', 'SUPA', 'VEC', 'VENZ', 'YOCH',
        '3DSVR', 'DSVR', 'MDVR', 'IPVR', 'KMVR', 'ATVR', 'PRVR', 'SAVR', 'CAVR', 'VRKM', 'SLVR',
        'GOPJ', 'HEYZO', '1PONDO', 'CARIB', 'CARIBBEAN', 'PACO', 'PACOPACOMAMA',
        'TOKYO-HOT', 'TOKYOHOT', '10MU', '10MUSUME', '1000GIRI', 'MURA', 'H4610', 'NAMA',
        'STZY', 'KIDM', 'ACHJ'
    ];
    const GARBAGE_WORDS = [
        'WWW', 'FHD', 'HD', 'SD', 'X264', 'X265', 'H264', 'H265', 'HEVC', 'AVC',
        'AAC', 'AC3', 'DTS', 'FLAC', 'MP3', 'MP4', 'MKV', 'AVI', 'WMV', 'M4V', 'RMVB', 'ISO', 'TS',
        'WATERMARK', 'RARBG', 'WEB-DL', 'WEBRIP', 'BLURAY', 'BDREMUX',
        '1440P', '1080P', '720P', '480P'
    ];
    const LOOSE_BLACKLIST = [
        'VIDEO', 'MOVIE', 'SAMPLE', 'PART', 'SCENE', 'TRAILER', 'FULL', 'CLIP', 'EPISODE',
        'VLOG', 'IMG', 'MVI', 'MOV', 'SNAP', 'SHOT', 'PIC', 'DSC', 'REC', 'CAM', 'DIVX', 'XVID',
        'BD', 'REMUX', 'UNCENSORED', 'LEAK', 'HEVC', 'THE', 'AND', 'FOR', 'SEX'
    ];
    const UNCENSORED_RE = /^(Tokyo-Hot|1PONDO|CARIB|HEYZO|10MU|MURA|H4610|NAMA)/i;

    function buildPrefixList() {
        const prefixes = MANUAL_PREFIXES.slice();
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const push = (p) => { if (!GARBAGE_WORDS.includes(p) && !prefixes.includes(p)) prefixes.push(p); };
        for (let i = 0; i < 26; i++) for (let j = 0; j < 26; j++) push(letters[i] + letters[j]);
        for (let i = 0; i < 26; i++) push(letters[i]);
        return prefixes.sort((a, b) => b.length - a.length);
    }
    const CODE_PREFIXES = buildPrefixList();

    function stripExt(name) {
        return String(name).replace(/\.(mp4|mkv|avi|rmvb|rm|wmv|flv|mov|ts|m2ts|m4v|webm|iso|mpg|mpeg|vob|3gp|asf|f4v|divx|mts|tp|trp)$/i, '');
    }
    /** 图片的「资产名」：去掉图片扩展名（如 ABF-208-poster.jpg → ABF-208-poster）。
        不能复用 stripExt —— 它只剥**视频**扩展名，.jpg 是剥不掉的。 */
    function assetNameOf(name) {
        return String(name || '').replace(/\.(jpe?g|png|webp|gif|bmp|avif)$/i, '');
    }
    function normalizeNum(raw) {
        const s = String(raw);
        const stripped = s.replace(/^0+/, '') || '0';
        if (stripped.length >= 5) return s;
        return stripped.padStart(3, '0');
    }
    function extractCode(name) {
        if (!name) return null;
        const s = stripExt(String(name).replace(/^.*[\\/]/, ''));
        const fc2 = s.match(/\bfc2[\s_-]*(?:ppv)?[\s_-]*(\d{5,8})\b/i) || s.match(/\bppv[\s_-]*(\d{5,8})\b/i);
        if (fc2) return 'FC2-PPV-' + fc2[1];
        const up = s.toUpperCase();
        for (const p of CODE_PREFIXES) {
            const re = new RegExp('\\b' + p.replace(/-/g, '[-_ ]?') + '[-_ ]?(\\d{1,6})(?![0-9])', 'i');
            const m = up.match(re);
            if (m) return p + '-' + normalizeNum(m[1]);
        }
        const loose = up.match(/\b([A-Z]{2,8})[-_ ]?(\d{2,6})(?![0-9A-Z])/);
        if (loose) {
            const prefix = loose[1];
            if (prefix.length > 1 && !GARBAGE_WORDS.includes(prefix) && !LOOSE_BLACKLIST.includes(prefix)) {
                return prefix + '-' + normalizeNum(loose[2]);
            }
        }
        return null;
    }
    const codeToDmmId = (code) => String(code).toLowerCase().replace(/[^a-z0-9]/g, '');
    const isUncensored = (code) => UNCENSORED_RE.test(String(code));

    // ========================================================================
    // 3. 基础工具
    // ========================================================================
    const $ = (sel, root) => (root || document).querySelector(sel);
    const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

    function gm(opts) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('请求超时')), opts.timeout || 20000);
            try {
                GM_xmlhttpRequest(Object.assign({}, opts, {
                    onload: (res) => { clearTimeout(timer); resolve(res); },
                    onerror: () => { clearTimeout(timer); reject(new Error('网络错误')); },
                    ontimeout: () => { clearTimeout(timer); reject(new Error('请求超时')); }
                }));
            } catch (e) { clearTimeout(timer); reject(e); }
        });
    }

    function toast(msg, type, ms) {
        let host = document.getElementById('mw-toast-host');
        if (!host || !host.isConnected) {
            host = document.createElement('div');
            host.id = 'mw-toast-host';
            host.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:104px;z-index:2147483646;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;';
            (document.body || document.documentElement).appendChild(host);
        }
        const el = document.createElement('div');
        const bg = type === 'error' ? 'rgba(220,38,38,.95)' : (type === 'success' ? 'rgba(21,128,61,.95)' : 'rgba(17,24,39,.92)');
        el.style.cssText = `background:${bg};color:#fff;padding:9px 16px;border-radius:9px;font-size:13px;line-height:1.5;max-width:72vw;box-shadow:0 8px 28px rgba(0,0,0,.4);word-break:break-all;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;`;
        el.textContent = msg;
        host.appendChild(el);
        setTimeout(() => {
            el.style.transition = 'opacity .3s';
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 360);
        }, ms || 3000);
    }

    function loadJson(key, dft) {
        try {
            const raw = GM_getValue(key, '');
            if (!raw) return dft;
            return JSON.parse(raw);
        } catch (e) { return dft; }
    }
    function saveJson(key, val) {
        try {
            const s = JSON.stringify(val);
            if (s.length > 4.2 * 1024 * 1024) { console.warn('[影片墙] 缓存过大，跳过写入', key, s.length); return false; }
            GM_setValue(key, s);
            return true;
        } catch (e) { return false; }
    }
    /** 插进 innerHTML 前先转义（文件夹名之类的可能是任意字符） */
    function escHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }
    function fmtBytes(n) {
        if (!n) return '0 B';
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
        return (n / 1048576).toFixed(2) + ' MB';
    }
    /** 视频文件大小：动辄几个 GB，用 MB 读起来费劲，所以 1GB 起改用 GB */
    function fmtVideoSize(n) {
        const v = Number(n) || 0;
        if (!v) return '';
        if (v >= 1073741824) return (v / 1073741824).toFixed(2) + ' GB';
        if (v >= 1048576) return Math.round(v / 1048576) + ' MB';
        return fmtBytes(v);
    }
    function fmtTime(ts) {
        if (!ts) return '—';
        const d = new Date(ts);
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    /** 时长：秒 → 1:56:11 / 56:11（0 或缺失返回空串，交给调用方决定要不要显示） */
    function fmtDuration(sec) {
        const total = Math.round(Number(sec) || 0);
        if (total <= 0) return '';
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        const p = (n) => String(n).padStart(2, '0');
        return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
    }
    /** 码率：115 不直接给码率，但列目录时会带上视频时长（play_long），
        所以用「文件大小 ÷ 时长」算 —— 实测 86/86 个视频都有 play_long，
        也就是说这个值一直可用，且不额外发任何请求。 */
    function bitrateOf(item) {
        const size = Number(item && item.size) || 0;
        const dur = Number(item && item.dur) || 0;
        if (!size || !dur) return 0;
        return size * 8 / dur;                 // bps
    }
    function fmtBitrate(bps) {
        const v = Number(bps) || 0;
        if (!v) return '';
        if (v >= 1e6) return (v / 1e6).toFixed(1) + ' Mbps';
        return Math.max(1, Math.round(v / 1e3)) + ' Kbps';
    }
    /** 观看时间：近一周给「今天/昨天/N 天前」，更早给日期 —— 卡片宽度有限，这样最省地方 */
    function watchText(ms) {
        const ts = Number(ms) || 0;
        if (!ts) return '';
        const d = new Date(ts);
        const now = new Date();
        const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const dayAt = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const diff = Math.round((day0 - dayAt) / 86400000);
        if (diff <= 0) return '今天看过';
        if (diff === 1) return '昨天看过';
        if (diff < 7) return diff + ' 天前看过';
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} 看过`;
    }

    // ========================================================================
    // 4. 115 接口（列目录 / 上传 / 下载）
    // ========================================================================
    function apiReq(method, url, body) {
        const headers = { 'Cookie': document.cookie, 'Referer': 'https://115.com/', 'Origin': 'https://115.com' };
        const opts = { method: method, url: url, headers: headers, timeout: 60000 };
        if (body) {
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
            opts.data = body;
        }
        return gm(opts).then((res) => {
            let json = null;
            try { json = JSON.parse(res.responseText); } catch (e) { throw new Error('响应解析失败(' + res.status + ')'); }
            if (json && json.errNo === 990001) throw new Error('115 登录已过期，请重新登录');
            return json;
        });
    }
    function apiGet(path, params) {
        const qs = params ? '?' + Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&') : '';
        return apiReq('GET', API_BASE + path + qs);
    }
    const buildIdsBody = (extras, ids) => {
        const parts = [];
        Object.keys(extras).forEach(k => parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(extras[k])));
        ids.forEach((id, i) => parts.push(encodeURIComponent('fid[' + i + ']') + '=' + encodeURIComponent(id)));
        return parts.join('&');
    };

    /* ---------------- 批量移动 / 删除（连带 sidecar 产物） ----------------
       视频和它的刮削产物（<视频名>-poster.jpg / -thumb.jpg / -fanart.jpg / <视频名>.nfo）
       必须一起走：只搬视频会让海报和 NFO 变成孤儿文件（影片墙与播放器都读不到），
       只删视频则会留下一堆没人认领的图片。 */
    const OP_CHUNK = 50;

    /** 把列目录的原始响应里属于 sidecar 的文件挑出来（normalize 过，带 fid / pc） */
    function sidecarItemsOf(rawList) {
        const out = [];
        (rawList || []).forEach((it) => {
            const n = normalizeItem(it, '', '');
            if (n && n.kind === 'file' && sidecarOf(n.name)) out.push(n);
        });
        return out;
    }

    /** 算出这次操作要动哪些文件。
        ⚠️ 每次都**现列一次目录**，不信缓存 —— 目录刚被整理/移动过的话，缓存里的 fid 可能已经不在原处了。 */
    async function planOps(entries) {
        const groups = new Map();
        (entries || []).forEach((e) => {
            const cid = String((e.item && e.item.cid) || state.curCid || '');
            if (!groups.has(cid)) groups.set(cid, []);
            groups.get(cid).push(e);
        });
        const videos = [];
        const sidecars = [];
        const failed = [];
        const videoSeen = Object.create(null);
        const sidecarSeen = Object.create(null);   // 同番号多版本会匹配到同一份产物 → 只带一次
        for (const pair of groups) {
            const cid = pair[0];
            const list = pair[1];
            let map = Object.create(null);
            try {
                map = buildSidecarMap(sidecarItemsOf(await listDirAll(cid)));
            } catch (err) {
                failed.push(cid);      // 列不出就当这目录没有产物，别因此整批失败
            }
            list.forEach((e) => {
                const fid = String(e.item.fid);
                if (!videoSeen[fid]) {
                    videoSeen[fid] = 1;
                    videos.push({ fid: fid, name: e.item.name, cid: cid, uid: pickIdOf(e) });
                }
                const sc = map[stripExt(e.item.name)];
                if (!sc) return;
                ['poster', 'thumb', 'fanart', 'nfo'].forEach((role) => {
                    const f = sc[role];
                    if (!f || !f.fid) return;
                    const sfid = String(f.fid);
                    if (sidecarSeen[sfid]) return;
                    sidecarSeen[sfid] = 1;
                    sidecars.push({ fid: sfid, name: f.name, cid: cid });
                });
            });
        }
        return { videos: videos, sidecars: sidecars, failed: failed, dirs: groups.size };
    }

    /** 批量移动（分片；115 一次别塞太多） */
    async function moveFidsTo(fids, targetCid) {
        let ok = 0;
        for (let i = 0; i < fids.length; i += OP_CHUNK) {
            const part = fids.slice(i, i + OP_CHUNK);
            const json = await apiReq('POST', API_BASE + '/files/move',
                buildIdsBody({ pid: targetCid, ignore_warn: 1 }, part));
            if (json && json.state) ok += part.length;
            else throw new Error((json && (json.error || json.msg)) || '移动失败');
        }
        return ok;
    }

    /** 批量删除（pid = 父目录；115 侧是进回收站，可以还原） */
    async function deleteFidsFrom(parentCid, fids) {
        let ok = 0;
        for (let i = 0; i < fids.length; i += OP_CHUNK) {
            const part = fids.slice(i, i + OP_CHUNK);
            const json = await apiReq('POST', API_BASE + '/rb/delete',
                buildIdsBody({ pid: parentCid, ignore_warn: 1 }, part));
            if (json && json.state) ok += part.length;
            else throw new Error((json && (json.error || json.msg)) || '删除失败');
        }
        return ok;
    }

    function currentCid() {
        try {
            const cid = new URLSearchParams(location.search).get('cid');
            if (cid) return String(cid);
        } catch (e) { /* ignore */ }
        try {
            const fr = $("iframe[rel='wangpan']");
            if (fr) {
                const m = String(fr.getAttribute('src') || '').match(/[?&]cid=(\d+)/);
                if (m) return m[1];
            }
        } catch (e) { /* ignore */ }
        return '0';
    }

    async function listDirAll(cid) {
        const all = [];
        let offset = 0;
        for (let page = 0; page < 30; page++) {
            const json = await apiGet('/files', {
                aid: 1, cid: cid, offset: offset, limit: API_CHUNK, show_dir: 1,
                format: 'json', o: 'file_name', asc: 1, natsort: 1, cur: 1
            });
            if (!json || !json.state) throw new Error((json && json.error) || '读取目录失败');
            const list = Array.isArray(json.data) ? json.data : [];
            all.push.apply(all, list);
            const total = Number(json.count || all.length);
            if (list.length < API_CHUNK || all.length >= total) break;
            offset += API_CHUNK;
        }
        return all;
    }

    function normalizeItem(it, parentCid, pathStr) {
        const name = String(it.n || it.name || '');
        if (!name) return null;
        const fid = it.fid;
        if (fid !== undefined && fid !== null && String(fid) !== '') {
            return {
                kind: 'file', fid: String(fid), pc: String(it.pc || it.pick_code || ''),
                name: name, cid: String(it.cid || parentCid), path: pathStr, size: Number(it.s || it.size || 0),
                // 115 会给图片生成带签名的缩略图直链，匿名可访问 —— 海报墙靠它零请求出图
                thumb: String(it.u || it.thumb || ''),
                // 视频额外带回播放信息（实测 play_long 86/86、last_time 59/86 有值）：
                //   play_long    时长（秒）→ 码率 = 大小 ÷ 时长
                //   last_time    上次播放时间（unix 秒）→ 「按观看日期排序」
                //   current_time 播放进度（秒），顺便留着，看过的位置一目了然
                dur: Math.max(0, Number(it.play_long || it.playLong || 0) || 0),
                watchedAt: Math.max(0, Number(it.last_time || 0) || 0) * 1000,
                progress: Math.max(0, Number(it.current_time || 0) || 0)
            };
        }
        const cid = String(it.cid || '');
        if (!cid) return null;
        return { kind: 'dir', cid: cid, name: name, parentCid: parentCid, path: pathStr ? pathStr + '/' + name : name };
    }

    /* ---------------- 媒体目录里的 sidecar（Emby/Jellyfin 约定） ----------------
       由本机 hub 的「导出媒体文件」功能写入，命名规则：
           <视频名>-poster.jpg / -thumb.jpg / -fanart.jpg / <视频名>.nfo
       影片墙直接读这些文件，不依赖任何后端接口。 */
    const SIDECAR_IMG_RE = /^(.+?)-(poster|thumb|fanart)\.(jpe?g|png|webp)$/i;
    const SIDECAR_NFO_RE = /^(.+)\.nfo$/i;

    function sidecarOf(name) {
        const img = SIDECAR_IMG_RE.exec(String(name || ''));
        if (img) return { stem: img[1], role: img[2].toLowerCase(), type: 'image' };
        const nfo = SIDECAR_NFO_RE.exec(String(name || ''));
        if (nfo) return { stem: nfo[1], role: 'nfo', type: 'nfo' };
        return null;
    }

    /** 把一批文件按「视频基名 → 各角色 sidecar」归堆 */
    function buildSidecarMap(files) {
        const map = Object.create(null);
        for (const f of files || []) {
            const sc = sidecarOf(f && f.name);
            if (!sc) continue;
            const bucket = map[sc.stem] || (map[sc.stem] = Object.create(null));
            if (!bucket[sc.role]) bucket[sc.role] = f;
        }
        return map;
    }

    /* ⚠️ 115 的缩略图直链（文件对象的 `u` 字段）是**短时签名**：
       实测同一个文件两次列目录拿到的 `s` / `t` 都不一样（`t` 就是签发时间），
       签名失效后 115 依然回 HTTP 200 + image/jpeg，但内容换成了只有 1.6KB 的
       「图片已过期」占位图 —— `onerror` 不会触发，所以只能从源头避开：
       **任何持久缓存里都不留它**，只保留 pickcode（`pc`）。
       渲染时靠「本地已缓存的原图（IndexedDB）」或「按 pickcode 现取」出图。 */
    function stripThumbUrls(list) {
        return (list || []).map((it) => {
            if (!it || (!it.u && !it.thumb)) return it;
            const copy = Object.assign({}, it);
            delete copy.u;
            delete copy.thumb;
            return copy;
        });
    }

    /** 取该条目的海报 sidecar 文件（按角色优先级 poster → thumb → fanart） */
    function sidecarFile(entry, roles) {
        const sc = entry && entry.sc;
        if (!sc) return null;
        for (const role of roles) {
            const file = sc[role];
            if (file && file.thumb) return file;
        }
        // 没有缩略图直链时也认（还能靠 pickcode 取原图）
        for (const role of roles) {
            const file = sc[role];
            if (file && file.pc) return file;
        }
        return null;
    }

    /** 取海报图地址：网盘里的 sidecar 缩略图直链（115 签发，匿名可访问、零请求） */
    function sidecarImage(entry, roles) {
        const file = sidecarFile(entry, roles);
        return (file && file.thumb) ? upgradeThumbUrl(file.thumb) : '';
    }

    /* 卡片该用哪一类 sidecar 图 ——「竖图模式」管卡片比例，「横版卡片的图」管用哪张：
         · 竖图模式（开）：优先竖版海报 -poster.jpg（1032×1468，卡片比例 2/3）
         · 横版卡片（默认）＝ `auto`（横版高清）：在 -thumb.jpg / -fanart.jpg 里挑**体积最大**的
           —— 实测（骑兵目录 327 个视频）选中的图中位 **776KB**，而竖海报模式 271KB、剧照模式 90KB；
           `-thumb.jpg` 其实是 hub 导出的 **cover（封面）**，常见 2184×1468、约 800KB，
           名字里的 "thumb" 是误导（不是缩略图）。
       这几张图都是 hub 导出到网盘的实体文件，所以换偏好只是换个角色取值 ——
       不用重新刮削、也不用重新下载。 */
    function widePref() {
        return CFG.portraitCards ? 'poster' : (CFG.wideCardImage || 'auto');
    }
    function cardImageRoles() {
        if (CFG.portraitCards) return ['poster', 'thumb', 'fanart'];
        const pref = widePref();
        if (pref === 'poster') return ['poster', 'thumb', 'fanart'];
        if (pref === 'fanart') return ['fanart', 'thumb', 'poster'];
        return ['thumb', 'fanart', 'poster'];   // auto：横版图优先，横版都没有才退回竖海报
    }

    /** 按当前偏好在一组 sidecar 里挑文件。只有「自动」才在横版图里按体积排 ——
        实测同一部片的 -thumb.jpg 可能是 2184×1468（约 1MB），比 -fanart.jpg（800×534，90KB）清晰得多。

        `minBytes` = **低清守卫**：低于这个体积的候选先跳过。
        实测（骑兵目录 200 条）**24% 的 `-poster.jpg` 只有 147×200、13~19KB**
        （hub 里那段注释写明了：DMM 竖版等高清源都拿不到时，才退回刮削站存的小图），
        而同名的 `-thumb.jpg` 有 170KB+（约 11 倍）。卡片宽 320px 时 147px 的海报会糊成一片，
        还不如用清晰的横版图。**所有候选都小时不拦**（至少得有张图）。 */
    function pickSidecarFile(sc, roles, needThumb, minBytes) {
        const ok = (f) => !!(f && (needThumb ? f.thumb : f.pc));
        const lim = Number(minBytes) || 0;
        // size 未知（老缓存记录）时不拦，免得把能用的图判死
        const big = (f) => !lim || !Number(f.size) || Number(f.size) >= lim;
        if (!CFG.portraitCards && widePref() === 'auto') {
            const wide = ['fanart', 'thumb'].map((r) => sc[r]).filter(ok).filter(big);
            if (wide.length) {
                wide.sort((a, b) => (Number(b.size) || 0) - (Number(a.size) || 0));
                return wide[0];
            }
        }
        for (const role of roles) {
            if (ok(sc[role]) && big(sc[role])) return sc[role];
        }
        return null;
    }

    /** 卡片要用的 sidecar 图（模式相关）。先要有缩略图直链的（可秒出图），
        没有则接受只有 pickcode 的（还能取原图）。
        两轮：先按低清守卫挑「够清晰的」，都不够就退回原顺序（至少有个图）。 */
    function cardImageFile(entry) {
        const sc = entry && entry.sc;
        if (!sc) return null;
        const roles = cardImageRoles();
        const lim = CFG.avoidTinyImg === false ? 0 : TINY_SIDECAR_BYTES;
        return pickSidecarFile(sc, roles, true, lim) ||
            pickSidecarFile(sc, roles, false, lim) ||
            pickSidecarFile(sc, roles, true, 0) ||
            pickSidecarFile(sc, roles, false, 0);
    }

    /** 按当前模式给条目贴一条「只有图」的 sidecar 记录；标题/演员等文本由 NFO 与 hub 后补 */
    function sidecarRec(entry) {
        const file = cardImageFile(entry);
        const img = (file && file.thumb) ? upgradeThumbUrl(file.thumb) : '';
        if (!img && !(file && file.pc)) return null;
        const rec = { src: 'sidecar', sc: true, ts: Date.now() };
        if (img) rec.c = img;
        if (file && file.pc) rec.o = file.pc;
        // 原图的「资产名」（如 DASS-764-poster）—— 存到自选文件夹时就用它当文件名
        if (file && file.name) rec.on = assetNameOf(file.name);
        return rec;
    }

    /** 115 给的缩略图直链带尺寸后缀（见过 _100 / _200）。实测 _200 是上限、_500 以上全 404，
        所以统一升到 _200 —— 卡片上清晰一大截，而体积仍然很小（约 19KB）。 */
    function upgradeThumbUrl(url) {
        const text = String(url || '');
        if (!text) return '';
        return text.replace(/_(\d{2,4})(\?|$)/, '_200$2');
    }

    async function scanVideos(rootCid, onTick) {
        const files = [];
        const dirs = [];
        const sidecars = [];
        const queue = [{ cid: String(rootCid), path: '', depth: 0 }];
        let visited = 0;
        while (queue.length) {
            if (files.length >= SCAN_MAX_FILES || dirs.length >= SCAN_MAX_DIRS) break;
            const cur = queue.shift();
            if (cur.depth > SCAN_MAX_DEPTH) continue;
            let list = [];
            try { list = await listDirAll(cur.cid); }
            catch (e) { console.warn('[影片墙] 读取目录失败', cur.path, e.message); continue; }
            for (const it of list) {
                const n = normalizeItem(it, cur.cid, cur.path);
                if (!n) continue;
                if (n.kind === 'file') {
                    if (VIDEO_EXT_RE.test(n.name)) files.push(n);
                    else if (sidecarOf(n.name)) sidecars.push(n);
                } else {
                    dirs.push(n);
                    queue.push({ cid: n.cid, path: n.path, depth: cur.depth + 1 });
                }
            }
            visited++;
            if (onTick) onTick(visited, files.length);
        }
        return { files: files, dirs: dirs, sidecars: sidecars, truncated: queue.length > 0 };
    }

    /* ---------------- 115 上传协议（把缓存文件写回网盘） ---------------- */
    function bufToHex(buf) {
        const b = new Uint8Array(buf);
        let s = '';
        for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
        return s;
    }
    async function sha1Upper(data) {
        const buf = (typeof data === 'string') ? new TextEncoder().encode(data) : data;
        return bufToHex(await crypto.subtle.digest('SHA-1', buf)).toUpperCase();
    }
    async function sha1Lower(data) {
        const buf = (typeof data === 'string') ? new TextEncoder().encode(data) : data;
        return bufToHex(await crypto.subtle.digest('SHA-1', buf));
    }
    async function hmacSha1Base64(secret, message) {
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
        const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
        const bytes = new Uint8Array(sig);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }
    function md5Hex(input) {
        function rl(n, c) { return (n << c) | (n >>> (32 - c)); }
        function au(x, y) { const l = (x & 0xFFFF) + (y & 0xFFFF); return (((x >> 16) + (y >> 16) + (l >> 16)) << 16) | (l & 0xFFFF); }
        function cmn(q, a, b, x, s, t) { return au(rl(au(au(a, q), au(x, t)), s), b); }
        function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
        function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
        function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
        function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
        const bytes = (typeof input === 'string') ? Array.from(new TextEncoder().encode(input)) : Array.from(input);
        const nblk = ((bytes.length + 8) >> 6) + 1;
        const x = new Array(nblk * 16).fill(0);
        for (let i = 0; i < bytes.length; i++) x[i >> 2] |= bytes[i] << ((i % 4) * 8);
        x[bytes.length >> 2] |= 0x80 << ((bytes.length % 4) * 8);
        x[nblk * 16 - 2] = bytes.length * 8;
        let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
        for (let k = 0; k < x.length; k += 16) {
            const oa = a, ob = b, oc = c, od = d;
            a = ff(a, b, c, d, x[k], 7, -680876936); d = ff(d, a, b, c, x[k + 1], 12, -389564586);
            c = ff(c, d, a, b, x[k + 2], 17, 606105819); b = ff(b, c, d, a, x[k + 3], 22, -1044525330);
            a = ff(a, b, c, d, x[k + 4], 7, -176418897); d = ff(d, a, b, c, x[k + 5], 12, 1200080426);
            c = ff(c, d, a, b, x[k + 6], 17, -1473231341); b = ff(b, c, d, a, x[k + 7], 22, -45705983);
            a = ff(a, b, c, d, x[k + 8], 7, 1770035416); d = ff(d, a, b, c, x[k + 9], 12, -1958414417);
            c = ff(c, d, a, b, x[k + 10], 17, -42063); b = ff(b, c, d, a, x[k + 11], 22, -1990404162);
            a = ff(a, b, c, d, x[k + 12], 7, 1804603682); d = ff(d, a, b, c, x[k + 13], 12, -40341101);
            c = ff(c, d, a, b, x[k + 14], 17, -1502002290); b = ff(b, c, d, a, x[k + 15], 22, 1236535329);
            a = gg(a, b, c, d, x[k + 1], 5, -165796510); d = gg(d, a, b, c, x[k + 6], 9, -1069501632);
            c = gg(c, d, a, b, x[k + 11], 14, 643717713); b = gg(b, c, d, a, x[k], 20, -373897302);
            a = gg(a, b, c, d, x[k + 5], 5, -701558691); d = gg(d, a, b, c, x[k + 10], 9, 38016083);
            c = gg(c, d, a, b, x[k + 15], 14, -660478335); b = gg(b, c, d, a, x[k + 4], 20, -405537848);
            a = gg(a, b, c, d, x[k + 9], 5, 568446438); d = gg(d, a, b, c, x[k + 14], 9, -1019803690);
            c = gg(c, d, a, b, x[k + 3], 14, -187363961); b = gg(b, c, d, a, x[k + 8], 20, 1163531501);
            a = gg(a, b, c, d, x[k + 13], 5, -1444681467); d = gg(d, a, b, c, x[k + 2], 9, -51403784);
            c = gg(c, d, a, b, x[k + 7], 14, 1735328473); b = gg(b, c, d, a, x[k + 12], 20, -1926607734);
            a = hh(a, b, c, d, x[k + 5], 4, -378558); d = hh(d, a, b, c, x[k + 8], 11, -2022574463);
            c = hh(c, d, a, b, x[k + 11], 16, 1839030562); b = hh(b, c, d, a, x[k + 14], 23, -35309556);
            a = hh(a, b, c, d, x[k + 1], 4, -1530992060); d = hh(d, a, b, c, x[k + 4], 11, 1272893353);
            c = hh(c, d, a, b, x[k + 7], 16, -155497632); b = hh(b, c, d, a, x[k + 10], 23, -1094730640);
            a = hh(a, b, c, d, x[k + 13], 4, 681279174); d = hh(d, a, b, c, x[k], 11, -358537222);
            c = hh(c, d, a, b, x[k + 3], 16, -722521979); b = hh(b, c, d, a, x[k + 6], 23, 76029189);
            a = hh(a, b, c, d, x[k + 9], 4, -640364487); d = hh(d, a, b, c, x[k + 12], 11, -421815835);
            c = hh(c, d, a, b, x[k + 15], 16, 530742520); b = hh(b, c, d, a, x[k + 2], 23, -995338651);
            a = ii(a, b, c, d, x[k], 6, -198630844); d = ii(d, a, b, c, x[k + 7], 10, 1126891415);
            c = ii(c, d, a, b, x[k + 14], 15, -1416354905); b = ii(b, c, d, a, x[k + 5], 21, -57434055);
            a = ii(a, b, c, d, x[k + 12], 6, 1700485571); d = ii(d, a, b, c, x[k + 3], 10, -1894986606);
            c = ii(c, d, a, b, x[k + 10], 15, -1051523); b = ii(b, c, d, a, x[k + 1], 21, -2054922799);
            a = ii(a, b, c, d, x[k + 8], 6, 1873313359); d = ii(d, a, b, c, x[k + 15], 10, -30611744);
            c = ii(c, d, a, b, x[k + 6], 15, -1560198380); b = ii(b, c, d, a, x[k + 13], 21, 1309151649);
            a = ii(a, b, c, d, x[k + 4], 6, -145523070); d = ii(d, a, b, c, x[k + 11], 10, -1120210379);
            c = ii(c, d, a, b, x[k + 2], 15, 718787259); b = ii(b, c, d, a, x[k + 9], 21, -343485551);
            a = au(a, oa); b = au(b, ob); c = au(c, oc); d = au(d, od);
        }
        const hexc = '0123456789abcdef';
        return [a, b, c, d].map((n) => {
            let s = '';
            for (let j = 0; j < 4; j++) {
                const byte = (n >> (j * 8)) & 0xFF;
                s += hexc.charAt((byte >> 4) & 0x0F) + hexc.charAt(byte & 0x0F);
            }
            return s;
        }).join('');
    }

    const UPLOAD_MD5_SALT = 'Qclm8MGWUv59TnrR0XPg';
    const UPLOAD_APP_VER = '99.99.99.99';
    const APP_VER_CANDIDATES = ['', '2.0.3.4', '2.0.1.7', '2.0.1.9', '2.0.2.3', '2.0.2.6', '2.0.3.0',
        '11.2.0', '23.9.0', '25.2.2', '27.0.0', '30.5.0', '35.6.0', '99.99.99.99'];

    function calcToken(fileid, filesize, signKey, signVal, userid, ts, appVer) {
        return md5Hex(UPLOAD_MD5_SALT + fileid + String(filesize) + String(signKey || '') + String(signVal || '') +
            String(userid) + String(ts) + String(appVer === undefined ? UPLOAD_APP_VER : appVer) + '0');
    }
    function buildSigVariants(userid, userkey, fileid, target) {
        const idU = String(fileid).toUpperCase(), idL = String(fileid).toLowerCase();
        const keyU = String(userkey).toUpperCase(), keyL = String(userkey).toLowerCase();
        const inputs = [
            userid + idU + idU + target + '0', userid + idU + target + '0',
            userid + idL + idL + target + '0', userid + idL + target + '0'
        ];
        const list = [];
        inputs.forEach((s) => {
            ['lower', 'upper'].forEach((h1Case) => {
                [keyU, keyL].forEach((k) => {
                    list.push(async () => {
                        const h1raw = await sha1Lower(s);
                        const h1 = (h1Case === 'upper') ? h1raw.toUpperCase() : h1raw;
                        return await sha1Upper(k + h1 + '000000');
                    });
                });
            });
        });
        return list;
    }
    let uploadInfoCache = null;
    function getUploadInfo() {
        if (uploadInfoCache) return Promise.resolve(uploadInfoCache);
        return apiReq('GET', PRO_API + '/app/uploadinfo').then((json) => {
            if (!json || !json.state || !json.userkey) throw new Error('获取上传凭据失败');
            uploadInfoCache = { userid: String(json.user_id), userkey: String(json.userkey) };
            return uploadInfoCache;
        });
    }
    let sigHit = null;
    function makePostInit(userid, filename, filesize, fileid, preid, target, st) {
        return function (ep, sig, ts, token, appVer, appId) {
            const ver = (appVer === undefined) ? UPLOAD_APP_VER : appVer;
            const aid = (appId === undefined) ? '0' : String(appId);
            const verQ = ver === '' ? '' : ('&appversion=' + encodeURIComponent(ver));
            const url = UPLB_API + '/' + ep + '/initupload.php?appid=' + aid + verQ + '&format=json&sig=' + sig + '&t=' + ts + '&token=' + token;
            const parts = ['appid=' + aid];
            if (ver !== '') parts.push('appversion=' + encodeURIComponent(ver));
            parts.push('userid=' + encodeURIComponent(userid));
            parts.push('filename=' + encodeURIComponent(filename));
            parts.push('filesize=' + filesize);
            parts.push('fileid=' + fileid);
            parts.push('target=' + encodeURIComponent(target));
            parts.push('sig=' + sig);
            if (preid) parts.push('preid=' + preid);
            if (st.signKey) parts.push('sign_key=' + st.signKey);
            if (st.signVal) parts.push('sign_val=' + st.signVal);
            return apiReq('POST', url, parts.join('&')).then((json) => ({ data: json, raw: JSON.stringify(json) }),
                (e) => ({ data: null, raw: '请求失败: ' + e.message }));
        };
    }
    const isSigInvalid = (d, raw) => /sig\s*invalid/i.test(String((d && d.statusmsg) || '') + ' ' + raw);
    const isVerRejected = (d, raw) => (d && Number(d.statuscode) === 403) || /升级|version/i.test(String((d && d.statusmsg) || '')) || /升级到最新版本/.test(raw);

    async function initUpload(userid, userkey, filename, filesize, fileid, preid, target, buf) {
        const st = { signKey: '', signVal: '' };
        const postInit = makePostInit(userid, filename, filesize, fileid, preid, target, st);
        const variants = buildSigVariants(userid, userkey, fileid, target);

        async function handle(data, raw) {
            if (!data) throw new Error('initupload 响应异常');
            if (Number(data.status) === 7 && data.sign_key && data.sign_check) {
                st.signKey = data.sign_key;
                const rg = String(data.sign_check).split('-');
                st.signVal = await sha1Upper(buf.slice(parseInt(rg[0], 10), parseInt(rg[1], 10) + 1));
                const hit = sigHit || { ep: '3.0', idx: 0, appVer: UPLOAD_APP_VER, appId: '0' };
                const ts2 = Math.floor(Date.now() / 1000);
                const sig2 = await variants[hit.idx]();
                const tok2 = calcToken(fileid, filesize, st.signKey, st.signVal, userid, ts2, hit.appVer);
                const r2 = await postInit(hit.ep, sig2, ts2, tok2, hit.appVer, hit.appId);
                if (!r2.data || Number(r2.data.status) === 7) throw new Error('二次校验未通过');
                return r2.data;
            }
            if (data.statuscode !== undefined && Number(data.statuscode) !== 0 && Number(data.status) !== 2) {
                throw new Error('initupload 返回错误: ' + (data.statusmsg || String(raw).slice(0, 120)));
            }
            return data;
        }

        if (!sigHit) {
            let lastRaw = '';
            const eps = ['3.0', '4.0'];
            for (let e = 0; e < eps.length; e++) {
                for (let v = 0; v < variants.length; v++) {
                    const ts = Math.floor(Date.now() / 1000);
                    const sig = await variants[v]();
                    const tok = calcToken(fileid, filesize, st.signKey, st.signVal, userid, ts, UPLOAD_APP_VER);
                    const probe = await postInit(eps[e], sig, ts, tok, UPLOAD_APP_VER, '0');
                    lastRaw = probe.raw;
                    if (isSigInvalid(probe.data, probe.raw)) continue;
                    if (!isVerRejected(probe.data, probe.raw)) {
                        sigHit = { ep: eps[e], idx: v, appVer: UPLOAD_APP_VER, appId: '0' };
                        return await handle(probe.data, probe.raw);
                    }
                    const aids = ['0', '100', '1'];
                    for (let a = 0; a < aids.length; a++) {
                        for (let c = 0; c < APP_VER_CANDIDATES.length; c++) {
                            const ver = APP_VER_CANDIDATES[c];
                            if (ver === UPLOAD_APP_VER && aids[a] === '0') continue;
                            const ts3 = Math.floor(Date.now() / 1000);
                            const sig3 = await variants[v]();
                            const tok3 = calcToken(fileid, filesize, st.signKey, st.signVal, userid, ts3, ver);
                            const r3 = await postInit(eps[e], sig3, ts3, tok3, ver, aids[a]);
                            lastRaw = r3.raw;
                            if (isSigInvalid(r3.data, r3.raw) || isVerRejected(r3.data, r3.raw)) continue;
                            sigHit = { ep: eps[e], idx: v, appVer: ver, appId: aids[a] };
                            return await handle(r3.data, r3.raw);
                        }
                    }
                }
            }
            throw new Error('initupload 探测失败: ' + String(lastRaw).slice(0, 120));
        }

        for (let attempt = 0; attempt < 4; attempt++) {
            const t = Math.floor(Date.now() / 1000);
            const s = await variants[sigHit.idx]();
            const tk = calcToken(fileid, filesize, st.signKey, st.signVal, userid, t, sigHit.appVer);
            const r = await postInit(sigHit.ep, s, t, tk, sigHit.appVer, sigHit.appId);
            try { return await handle(r.data, r.raw); }
            catch (err) { if (attempt === 3) throw err; }
        }
        throw new Error('initupload 二次校验次数超限');
    }

    function getOssToken() {
        return apiReq('GET', UPLB_API + '/3.0/gettoken.php').then((json) => {
            if (!json || !json.AccessKeyId || !json.AccessKeySecret || !json.SecurityToken) throw new Error('OSS 令牌不完整');
            return json;
        });
    }
    async function ossPut(opts) {
        const endpoint = (opts.endpoint || 'oss-cn-shenzhen.aliyuncs.com').replace(/^https?:\/\//, '');
        const host = opts.bucket + '.' + endpoint;
        const url = 'https://' + host + '/' + opts.object;
        const dateStr = new Date().toUTCString();
        const contentType = 'application/octet-stream';
        const ossHeaders = {
            'x-oss-callback': opts.callback,
            'x-oss-callback-var': opts.callbackVar || '',
            'x-oss-security-token': opts.token.SecurityToken
        };
        const canon = Object.keys(ossHeaders).filter(k => ossHeaders[k]).sort()
            .map(k => k + ':' + ossHeaders[k] + '\n').join('');
        const stringToSign = 'PUT\n\n' + contentType + '\n' + dateStr + '\n' + canon + '/' + opts.bucket + '/' + opts.object;
        const signature = await hmacSha1Base64(opts.token.AccessKeySecret, stringToSign);
        const headers = {
            'Authorization': 'OSS ' + opts.token.AccessKeyId + ':' + signature,
            'Date': dateStr, 'Content-Type': contentType
        };
        Object.keys(ossHeaders).forEach(k => { if (ossHeaders[k]) headers[k] = ossHeaders[k]; });
        const res = await gm({ method: 'PUT', url: url, headers: headers, data: opts.buf, binary: true, timeout: 120000 });
        if (res.status < 200 || res.status >= 300) throw new Error('OSS 上传失败 HTTP ' + res.status);
        const body = String(res.responseText || '').trim();
        if (body.charAt(0) === '{') {
            const cb = JSON.parse(body);
            if (cb.state === false) throw new Error('115 登记失败: ' + (cb.error || ''));
        }
        return true;
    }

    /** 把文本文件上传到指定 115 目录 */
    async function uploadTextToCid(filename, text, cid) {
        const buf = new TextEncoder().encode(text).buffer;
        const fileid = await sha1Upper(buf);
        const info = await getUploadInfo();
        const target = 'U_1_' + cid;
        const init = await initUpload(info.userid, info.userkey, filename, buf.byteLength, fileid, fileid, target, buf);
        if (Number(init.status) === 2) return true;   // 秒传
        const token = await getOssToken();
        const bucket = init.bucket || 'fhnfile';
        const object = init.object || fileid;
        const ts = Math.floor(Date.now() / 1000);
        const cbSign = await sha1Lower(info.userkey + fileid + buf.byteLength + target + info.userid + ts + md5Hex(fileid) + '1');
        const callbackBody = 'sha1=' + fileid + '&cid=' + bucket + '&fileid=' + object +
            '&size=' + buf.byteLength + '&pick_code=&target=' + encodeURIComponent(target) +
            '&userid=' + info.userid + '&version=&stamp=' + ts + '&sign=' + cbSign +
            '&filename=' + encodeURIComponent(filename);
        const callbackJson = JSON.stringify({
            callbackUrl: 'http://uplb.115.com/3.0/samplecallback.php',
            callbackBody: callbackBody,
            callbackBodyType: 'application/x-www-form-urlencoded'
        });
        return await ossPut({
            token: token, bucket: bucket, object: object, buf: buf,
            callback: btoa(callbackJson), callbackVar: '', endpoint: init.endpoint || 'oss-cn-shenzhen.aliyuncs.com'
        });
    }

    /* ---------------- 网盘原文件读取（NFO 文本 / 海报原图） ----------------
       两步走：webapi 签发带签名的直链 → GM 请求取回内容。都在 115 页面上下文里跑，
       cookie 比服务端齐全，所以这里能取到的比 hub 侧多（hub 侧取 CDN 一律 403）。
       ⚠️ 直链域名是 cdnfhnfile.115.com 这类，必须写进 @connect，
       否则 GM_xmlhttpRequest 会按域拦截 —— 表现就是「NFO 静默读不到、没有片名」。 */

    /** 拿文件的带签名下载直链 */
    async function signedFileUrl(pc) {
        if (!pc) throw new Error('缺少 pickcode');
        const json = await apiGet('/files/download', { pickcode: pc });
        if (!json) throw new Error('下载地址接口无响应');
        if (!json.state || !json.file_url) {
            throw new Error('取下载地址失败：' + (json.error || json.msg || ('state=' + json.state)));
        }
        return json.file_url;
    }

    /** 字节 → 文本：先 UTF-8，出现替换字符再试 GBK（老字幕/NFO 常是 GBK） */
    function decodeBytes(bytes) {
        if (!bytes || !bytes.length) return '';
        const tryDecode = (enc) => {
            try { return new TextDecoder(enc, { fatal: false }).decode(bytes); }
            catch (e) { return null; }
        };
        let text = tryDecode('utf-8') || '';
        if (text.indexOf('\uFFFD') >= 0) {
            const gbk = tryDecode('gbk');
            if (gbk && gbk.indexOf('\uFFFD') < 0) text = gbk;
        }
        return text;
    }

    /** 用 pickcode 取文件文本（NFO / json）
        ⚠️ 必须按 arraybuffer 取、自己解码，不能只靠 responseText：
        115 的 CDN 把 .nfo 以 `application/octet-stream` 返回，这时某些 GM 实现
        不给 responseText（**HTTP 200 但拿到 0 字符**），而代码又会当成「NFO 是空的」
        静默跳过 —— 表现就是「读了 NFO 但没片名」。这里两条路都走，返回哪条成功。 */
    async function readFileText(pc) {
        const url = await signedFileUrl(pc);
        let firstErr = null;
        try {
            const res = await gm({ method: 'GET', url: url, responseType: 'arraybuffer', timeout: 45000 });
            if (res.status !== 200) {
                throw new Error('HTTP ' + res.status + (res.status === 403
                    ? '（CDN 拒绝：@connect 未放行该域名，或代理地区被拦）' : ''));
            }
            const buf = res.response;
            if (buf) {
                // 正常是 ArrayBuffer；个别实现（或网络层）可能给 Blob，一并兼容
                let bytes;
                if (typeof Blob !== 'undefined' && buf instanceof Blob) {
                    bytes = new Uint8Array(await buf.arrayBuffer());
                } else if (buf instanceof ArrayBuffer) {
                    bytes = new Uint8Array(buf);
                } else {
                    bytes = new Uint8Array(buf.buffer || buf);
                }
                return { text: decodeBytes(bytes), via: 'arraybuffer/' + bytes.length + 'B' };
            }
            if (res.responseText) return { text: res.responseText, via: 'arraybuffer→text/' + res.responseText.length + 'B' };
            firstErr = new Error('arraybuffer 响应为空');
        } catch (e) { firstErr = e; }

        // 第二策略：默认（文本）方式再试一次
        const res2 = await gm({ method: 'GET', url: url, timeout: 45000 });
        if (res2.status !== 200) throw firstErr || new Error('HTTP ' + res2.status);
        const text = res2.responseText || '';
        if (!text && firstErr) throw firstErr;
        return { text: text, via: 'text/' + text.length + 'B' };
    }

    /** 兼容旧调用：只要文本 */
    async function downloadTextByPickcode(pc) {
        const got = await readFileText(pc);
        return got.text;
    }

    /* 海报原图：sidecar 里的图在网盘上其实是大图（实测 167~700KB），而 115 的缩略图直链
       最大只到 _200（约 19KB）—— 卡片一大就明显糊。所以缩略图先贴出来占位，
       再取原图换成 blob URL。
       v3.9：原图改成**存本地 IndexedDB**。以前只存内存，重开影片墙要把整批重新下载
       （94 部 ≈ 28MB），这是「重开还是慢」的第二大来源。 */
    const POSTER_BLOB_MAX = 80;                 // 内存里的对象 URL 上限（要手动 revoke）
    const IMG_MEM_MAX = 200;                    // 内存里的 Blob 上限（本地库读出来的）
    const blobCache = new Map();
    const imgMem = new Map();                   // pickcode → Blob

    /* ---- 图片本地缓存（IndexedDB：二进制直接存，不做 base64 膨胀） ---- */
    let imgDBPromise = null;
    let imgMeta = loadJson(STORE_IMG_META, {});
    let imgMetaDirty = false;
    let imgMetaTimer = null;

    function imgStoreAvailable() {
        return !!CFG.imgCache && CFG.localFirst && typeof indexedDB !== 'undefined' && !!indexedDB;
    }
    function openImgDB() {
        if (imgDBPromise) return imgDBPromise;
        imgDBPromise = new Promise((resolve) => {
            let req;
            // v2：加 texts（NFO 原文）；v3：加 meta（存「自选缓存文件夹」的目录句柄）
            try { req = indexedDB.open(IMG_DB_NAME, 3); } catch (e) { resolve(null); return; }
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('imgs')) db.createObjectStore('imgs');
                if (!db.objectStoreNames.contains('texts')) db.createObjectStore('texts');
                if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
            req.onblocked = () => resolve(null);
        }).catch(() => null);
        return imgDBPromise;
    }
    /** 跑一个 IDB 请求。优先用 request.onsuccess（标准实现保证它在 tx.oncomplete 之前触发），
        只在拿不到 onsuccess 时才退到 tx.oncomplete —— 两种时序都能正确拿到结果。 */
    function idbReq(db, store, mode, fn) {
        return new Promise((resolve) => {
            let done = false;
            const finish = (v) => { if (!done) { done = true; resolve(v); } };
            let tx;
            try { tx = db.transaction(store, mode); } catch (e) { finish(null); return; }
            let out = null;
            try { out = fn(tx.objectStore(store)); } catch (e) { finish(null); return; }
            if (out && typeof out === 'object') {
                out.onsuccess = () => finish(out.result === undefined ? null : out.result);
                out.onerror = () => finish(null);
            }
            tx.oncomplete = () => finish(out && typeof out === 'object' && 'result' in out ? out.result : out);
            tx.onerror = () => finish(null);
            tx.onabort = () => finish(null);
        });
    }
    /* ---------------- 缓存位置：浏览器 IndexedDB 或「你自选的本机文件夹」 ----------------
       v3.10：缓存目录可以自选。选「本机文件夹」时用 File System Access API 把素材直接写成
       磁盘上的真实文件（NFO 原文 + 海报原图），你随时能在资源管理器里看到、备份、给别的
       播放器复用。目录句柄存在 IndexedDB 的 meta 库里；浏览器重启后再用需要**点一次
       「重新授权」**（浏览器规定必须由用户手势触发）。两种后端对上层是同一套接口。 */
    const CACHE_FOLDER_INDEX = '_index.json';
    let dirHandle = null;                    // FileSystemDirectoryHandle
    let dirFiles = { img: {}, nfo: {} };     // 键 → 磁盘上的文件名
    let dirIndexDirty = false;
    let dirIndexTimer = null;
    let dirNeedPermission = false;           // 句柄还在，但要用户点一下才能用

    const folderMode = () => CFG.cacheBackend === 'folder';
    function folderSupported() {
        try { return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'; } catch (e) { return false; }
    }
    /** 当前**真正生效**的后端；选了文件夹但不可用 → 自动回退 IndexedDB（并会提示） */
    function activeBackend() {
        return (folderMode() && dirHandle && !dirNeedPermission) ? 'folder' : 'idb';
    }
    /** 选了文件夹但没能用上时的说明（设置面板 / 状态栏用） */
    function folderBlockReason() {
        if (!folderMode()) return '';
        const support = folderSupported() ? '' : '（这个浏览器也不支持选择文件夹，需要 Chrome / Edge 86 以上）';
        if (!dirHandle) return '还没选择缓存文件夹' + support;
        if (dirNeedPermission) return '文件夹还在，但需要点一次「重新授权」（浏览器要求用户手势）';
        if (!folderSupported()) return '这个浏览器不支持选择文件夹，需要 Chrome / Edge 86 以上';
        return '';
    }

    function safeFilePart(s) {
        return String(s || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'x';
    }
    function extOfBlob(blob, nameHint) {
        const t = String((blob && blob.type) || '').toLowerCase();
        if (t.indexOf('png') >= 0) return 'png';
        if (t.indexOf('webp') >= 0) return 'webp';
        if (t.indexOf('gif') >= 0) return 'gif';
        const m = String(nameHint || '').match(/\.([a-z0-9]{2,4})$/i);
        return m ? m[1].toLowerCase() : 'jpg';
    }

    async function idbMetaPut(key, val) {
        const db = await openImgDB();
        if (!db) return;
        await idbReq(db, 'meta', 'readwrite', (s) => s.put(val, key));
    }
    async function idbMetaGet(key) {
        const db = await openImgDB();
        if (!db) return null;
        return idbReq(db, 'meta', 'readonly', (s) => s.get(key));
    }

    function markDirIndexDirty() {
        dirIndexDirty = true;
        if (dirIndexTimer) return;
        dirIndexTimer = setTimeout(() => { dirIndexTimer = null; writeDirIndex(); }, 2000);
    }
    async function loadDirIndex() {
        dirFiles = { img: {}, nfo: {} };
        if (!dirHandle) return;
        try {
            const fh = await dirHandle.getFileHandle(CACHE_FOLDER_INDEX, { create: false });
            const f = await fh.getFile();
            const j = JSON.parse(await f.text());
            dirFiles = { img: (j && j.img) || {}, nfo: (j && j.nfo) || {} };
        } catch (e) { /* 首次用或索引丢了：下面的「按名字直接找」会兜住 */ }
    }
    /** 写索引文件。`force` 用于「刚批量改过」的场景（防抖还没到点也得立刻落盘） */
    async function writeDirIndex(force) {
        if (!dirHandle) return;
        if (!force && !dirIndexDirty) return;
        dirIndexDirty = false;
        try {
            const fh = await dirHandle.getFileHandle(CACHE_FOLDER_INDEX, { create: true });
            const w = await fh.createWritable();
            await w.write(JSON.stringify({ v: 1, ts: Date.now(), img: dirFiles.img, nfo: dirFiles.nfo }, null, 1));
            await w.close();
        } catch (e) { /* ignore */ }
    }

    /** 启动时把上次选的目录恢复回来（有句柄但没授权 → 标成「待授权」） */
    async function restoreCacheFolder() {
        if (!folderMode()) return false;
        try {
            const h = await idbMetaGet('dirHandle');
            if (!h) return false;
            const perm = h.queryPermission ? await h.queryPermission({ mode: 'readwrite' }) : 'granted';
            dirHandle = h;
            if (perm === 'granted') {
                dirNeedPermission = false;
                await loadDirIndex();
                return true;
            }
            dirNeedPermission = true;
            return false;
        } catch (e) {
            dirHandle = null;
            dirNeedPermission = false;
            return false;
        }
    }
    /** 让用户挑一个本地文件夹当缓存目录 */
    async function pickCacheFolder() {
        if (!folderSupported()) { toast('这个浏览器不支持「选择文件夹」（需要 Chrome / Edge 86 以上）', 'error', 5200); return false; }
        try {
            const h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'mw-cache' });
            const perm = h.requestPermission ? await h.requestPermission({ mode: 'readwrite' }) : 'granted';
            if (perm !== 'granted') { toast('没拿到写入权限，浏览器会记住你的选择，下次可直接用', 'error', 4600); return false; }
            dirHandle = h;
            dirNeedPermission = false;
            await idbMetaPut('dirHandle', h);
            await loadDirIndex();
            CFG.cacheBackend = 'folder';
            saveCfg();
            toast('缓存目录已设为：' + (h.name || '（已选择）'), 'success', 3600);
            refreshSettings();
            return true;
        } catch (e) {
            if (e && (e.name === 'AbortError' || /aborted/i.test(String(e.message)))) return false;  // 用户取消
            toast('选择文件夹失败：' + ((e && e.message) || e), 'error', 4800);
            return false;
        }
    }
    async function reauthorizeCacheFolder() {
        if (!dirHandle) { toast('请先点「选择缓存文件夹」', 'info', 3000); return false; }
        try {
            const perm = dirHandle.requestPermission ? await dirHandle.requestPermission({ mode: 'readwrite' }) : 'granted';
            if (perm === 'granted') {
                dirNeedPermission = false;
                await loadDirIndex();
                toast('缓存文件夹已重新授权：' + (dirHandle.name || ''), 'success', 3200);
                refreshSettings();
                return true;
            }
        } catch (e) { /* ignore */ }
        toast('授权没成功 —— 可以点地址栏左侧的站点权限，把「文件编辑」允许后再试', 'error', 5600);
        return false;
    }
    async function forgetCacheFolder() {
        dirHandle = null;
        dirNeedPermission = false;
        dirFiles = { img: {}, nfo: {} };
        await idbMetaPut('dirHandle', null);
    }

    /* ---- 文件夹后端的读写（键 → 磁盘文件）---- */
    async function folderPutImg(key, blob, nameHint) {
        const ext = extOfBlob(blob, nameHint);
        let base = safeFilePart(nameHint || key);
        if (new RegExp('\\.' + ext + '$', 'i').test(base)) base = base.slice(0, -(ext.length + 1));
        const fname = base + '.' + ext;
        const fh = await dirHandle.getFileHandle(fname, { create: true });
        const w = await fh.createWritable();
        await w.write(blob);
        await w.close();
        dirFiles.img[key] = fname;
        markDirIndexDirty();
        return fname;
    }
    async function folderFindImg(key, nameHint) {
        if (dirFiles.img[key]) return dirFiles.img[key];
        if (!nameHint) return '';
        // 索引丢了也能按名字找回来（扩展名挨个试一遍）
        const base = safeFilePart(nameHint).replace(/\.[a-z0-9]{2,4}$/i, '');
        for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
            const cand = base + '.' + ext;
            try {
                await dirHandle.getFileHandle(cand, { create: false });
                dirFiles.img[key] = cand;
                markDirIndexDirty();
                return cand;
            } catch (e) { /* 试下一个 */ }
        }
        return '';
    }
    async function folderGetImg(key, nameHint) {
        const fname = await folderFindImg(key, nameHint);
        if (!fname) return null;
        try {
            const fh = await dirHandle.getFileHandle(fname, { create: false });
            const f = await fh.getFile();
            return (f && f.size) ? f : null;
        } catch (e) { delete dirFiles.img[key]; markDirIndexDirty(); return null; }
    }
    async function folderDelImg(key) {
        const fname = dirFiles.img[key];
        delete dirFiles.img[key];
        markDirIndexDirty();
        if (!fname) return;
        try { await dirHandle.removeEntry(fname); } catch (e) { /* ignore */ }
    }
    async function folderPutNfo(key, text) {
        const fname = safeFilePart(key) + '.nfo';
        const fh = await dirHandle.getFileHandle(fname, { create: true });
        const w = await fh.createWritable();
        await w.write(String(text));
        await w.close();
        dirFiles.nfo[key] = fname;
        markDirIndexDirty();
        return fname;
    }
    async function folderGetNfo(key) {
        const fname = dirFiles.nfo[key];
        if (!fname) return '';
        try {
            const fh = await dirHandle.getFileHandle(fname, { create: false });
            const f = await fh.getFile();
            return await f.text();
        } catch (e) { delete dirFiles.nfo[key]; markDirIndexDirty(); return ''; }
    }

    function trimImgMem() {
        while (imgMem.size > IMG_MEM_MAX) imgMem.delete(imgMem.keys().next().value);
    }
    async function imgCacheGet(pc, nameHint) {
        if (!imgStoreAvailable() || !pc) return null;
        if (imgMem.has(pc)) {
            const hit = imgMem.get(pc);
            imgMem.delete(pc); imgMem.set(pc, hit);        // 触碰一下
            return hit;
        }
        let blob = null;
        if (activeBackend() === 'folder') {
            try { blob = await folderGetImg(pc, nameHint); } catch (e) { blob = null; }
        } else {
            const db = await openImgDB();
            if (db) blob = await idbReq(db, 'imgs', 'readonly', (s) => s.get(pc));
        }
        if (!blob || !blob.size) return null;
        imgMem.set(pc, blob);
        trimImgMem();
        const meta = imgMeta[pc];
        if (meta) { meta.at = Date.now(); markImgMetaDirty(); }
        return blob;
    }
    async function imgCachePut(pc, blob, nameHint) {
        if (!imgStoreAvailable() || !blob || !pc) return;
        imgMem.set(pc, blob);
        trimImgMem();
        if (activeBackend() === 'folder') {
            try {
                await folderPutImg(pc, blob, nameHint);
            } catch (e) {
                console.warn('[影片墙] 写入缓存文件夹失败（会退回浏览器本地）：', e && e.message);
                const db = await openImgDB();
                if (db) await idbReq(db, 'imgs', 'readwrite', (s) => s.put(blob, pc));
            }
        } else {
            const db = await openImgDB();
            if (db) await idbReq(db, 'imgs', 'readwrite', (s) => s.put(blob, pc));
        }
        imgMeta[pc] = { sz: Number(blob.size || 0), at: Date.now(), n: nameHint || '' };
        markImgMetaDirty();
        pruneImgCache();
    }
    function markImgMetaDirty() {
        imgMetaDirty = true;
        if (imgMetaTimer) return;
        imgMetaTimer = setTimeout(() => {
            imgMetaTimer = null;
            if (!imgMetaDirty) return;
            imgMetaDirty = false;
            saveJson(STORE_IMG_META, imgMeta);
        }, 2000);
    }
    function imgCacheBytes() {
        let n = 0;
        Object.keys(imgMeta).forEach((k) => { n += Number(imgMeta[k].sz || 0); });
        return n;
    }
    const imgCacheCount = () => Object.keys(imgMeta).length;
    /** 超预算就按「最久未用」淘汰，一次砍到 80%，免得每张图都触发一轮 */
    function pruneImgCache() {
        const budget = Math.max(4, Number(CFG.imgCacheMB) || 64) * 1024 * 1024;
        let total = imgCacheBytes();
        if (total <= budget) return;
        const target = budget * 0.8;
        const drop = [];
        Object.keys(imgMeta).sort((a, b) => (imgMeta[a].at || 0) - (imgMeta[b].at || 0)).forEach((k) => {
            if (total <= target) return;
            total -= Number(imgMeta[k].sz || 0);
            drop.push(k);
        });
        if (!drop.length) return;
        drop.forEach((k) => { delete imgMeta[k]; imgMem.delete(k); });
        markImgMetaDirty();
        if (activeBackend() === 'folder') {
            drop.forEach((k) => { folderDelImg(k); });
        } else {
            openImgDB().then((db) => {
                if (!db) return;
                drop.forEach((k) => { idbReq(db, 'imgs', 'readwrite', (s) => s.delete(k)); });
            });
        }
        console.log('[影片墙] 图片缓存超出上限，已淘汰 ' + drop.length + ' 张（剩余约 ' + fmtBytes(imgCacheBytes()) + '）');
    }
    /** 只删「本脚本自己写进去的那些」：文件夹后端靠 dirFiles.img 索引定位，
        绝不去动缓存目录里的其它文件。 */
    async function clearImgCache() {
        imgMem.clear();
        blobCache.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } });
        blobCache.clear();
        imgMeta = {};
        saveJson(STORE_IMG_META, {});
        if (activeBackend() === 'folder') {
            for (const k of Object.keys(dirFiles.img)) await folderDelImg(k);
            await writeDirIndex(true);
        } else {
            const db = await openImgDB();
            if (db) await idbReq(db, 'imgs', 'readwrite', (s) => s.clear());
        }
    }

    /* ---- NFO 原文也存本地（IndexedDB 的 texts 库）----
       不只把 NFO 解析成字段，原文一起留着 —— 这样本地就是一份**完整镜像**：
       能直接导出、能给别的工具复用，NFO 里那些我们没解析的标签也不会丢。 ---- */
    let rawNfoCount = 0;
    async function rawNfoPut(key, text) {
        if (!imgStoreAvailable() || !text || !key) return false;
        if (activeBackend() === 'folder') {
            try { await folderPutNfo(key, text); return true; } catch (e) { /* 落到下面走 IndexedDB */ }
        }
        const db = await openImgDB();
        if (!db) return false;
        await idbReq(db, 'texts', 'readwrite', (s) => s.put(String(text), key));
        return true;
    }
    async function rawNfoGet(key) {
        if (!imgStoreAvailable() || !key) return '';
        if (activeBackend() === 'folder') {
            try { return await folderGetNfo(key); } catch (e) { return ''; }
        }
        const db = await openImgDB();
        if (!db) return '';
        const t = await idbReq(db, 'texts', 'readonly', (s) => s.get(key));
        return typeof t === 'string' ? t : '';
    }
    /** 本地存着的全部 NFO 原文（导出用） */
    async function rawNfoAll() {
        const out = {};
        if (activeBackend() === 'folder') {
            for (const k of Object.keys(dirFiles.nfo)) {
                const v = await rawNfoGet(k);
                if (v) out[k] = v;
            }
            return out;
        }
        const db = await openImgDB();
        if (!db) return out;
        const keys = await idbReq(db, 'texts', 'readonly', (s) => s.getAllKeys());
        for (const k of (keys || [])) {
            const v = await idbReq(db, 'texts', 'readonly', (s) => s.get(k));
            if (typeof v === 'string') out[k] = v;
        }
        return out;
    }
    /** 真实的条数（同步的 rawNfoCount 只是给统计栏用的缓存值） */
    async function rawNfoCountReal() {
        if (activeBackend() === 'folder') return Object.keys(dirFiles.nfo).length;
        const db = await openImgDB();
        if (!db) return 0;
        const keys = await idbReq(db, 'texts', 'readonly', (s) => s.getAllKeys());
        return (keys || []).length;
    }
    async function refreshRawNfoCount() {
        try { rawNfoCount = await rawNfoCountReal(); } catch (e) { /* ignore */ }
        return rawNfoCount;
    }
    async function clearRawNfo() {
        if (activeBackend() === 'folder') {
            for (const k of Object.keys(dirFiles.nfo)) {
                try { await dirHandle.removeEntry(dirFiles.nfo[k]); } catch (e) { /* ignore */ }
                delete dirFiles.nfo[k];
            }
            await writeDirIndex(true);
        } else {
            const db = await openImgDB();
            if (db) await idbReq(db, 'texts', 'readwrite', (s) => s.clear());
        }
        rawNfoCount = 0;
    }

    /** 本次会话从本地命中的次数 —— 自检用（能直观看出「省了多少请求」） */
    let imgHitLocal = 0;
    let imgHitNet = 0;

    function trimBlobCache() {
        while (blobCache.size > POSTER_BLOB_MAX) {
            const oldest = blobCache.keys().next().value;
            const gone = blobCache.get(oldest);
            blobCache.delete(oldest);
            try { URL.revokeObjectURL(gone); } catch (e) { /* ignore */ }
        }
    }

    /** 只查本地（内存 + IndexedDB）要一份海报原图的 blob URL；没命中就返回 ''（**绝不联网**）。
        卡片渲染走这条：原图按 pickcode 存在本地，跟会过期的签名 URL 完全无关。 */
    async function localImageUrl(pc, nameHint) {
        if (!pc) return '';
        if (blobCache.has(pc)) {
            const hit = blobCache.get(pc);
            blobCache.delete(pc); blobCache.set(pc, hit);   // 触碰一下，LRU 顺序后移
            imgHitLocal++;
            return hit;
        }
        try {
            const blob = await imgCacheGet(pc, nameHint);
            if (!blob) return '';
            const obj = URL.createObjectURL(blob);
            blobCache.set(pc, obj);
            trimBlobCache();
            imgHitLocal++;
            return obj;
        } catch (e) { return ''; }
    }

    /** 只走网络取原图：下载 → 落盘（IndexedDB 或你自选的文件夹）→ 返回 blob URL。
        这里**等落盘完成**再返回 —— 用户要的就是「实时存到本地」，
        写一次只有几毫秒，不至于拖慢首屏。 */
    async function fetchOriginalToLocal(pc, nameHint) {
        imgHitNet++;
        const url = await signedFileUrl(pc);
        const res = await gm({ method: 'GET', url: url, responseType: 'blob', timeout: 45000 });
        if (res.status !== 200 || !res.response) throw new Error('原图下载失败 HTTP ' + res.status);
        const raw = res.response;
        const obj = URL.createObjectURL(raw);
        blobCache.set(pc, obj);
        trimBlobCache();
        await imgCachePut(pc, raw, nameHint);
        return obj;
    }

    const imgPending = new Map();       // pickcode → Promise（同一张图别下两次）
    async function hiResImage(pc, nameHint) {
        if (!pc) return '';
        // 1) 本地缓存命中 → 完全不联网（重开影片墙走的就是这条）
        const local = await localImageUrl(pc, nameHint);
        if (local) return local;
        // 2) 网络取原图 → 顺手落盘（并发去重：批量本地化和卡片渲染可能同时要同一张）
        if (imgPending.has(pc)) return imgPending.get(pc);
        const task = fetchOriginalToLocal(pc, nameHint).finally(() => imgPending.delete(pc));
        imgPending.set(pc, task);
        return task;
    }

    /* ---------------- NFO 读取与解析（网盘里的 sidecar） ----------------
       读法：webapi 拿带签名的直链 → GM 请求取文本。都在 115 页面上下文里跑，
       浏览器会带上完整 cookie，所以比在容器里抓更稳。失败一律静默返回 null，
       让调用方退回原来的刮削链路。 */
    /* v3.9：解析结果落盘（GM 本地存储）。
       原来 nfoCache 只活在内存里 —— 每关一次影片墙就全丢，重开时几十份 NFO 要从网盘
       重读一遍（每份 2 个往返：签直链 + 取内容），这才是「重开还是慢」的最大来源。
       失效判定：pickcode 或文件大小变了（hub 重写过 NFO）就重读。 */
    const nfoPending = Object.create(null);
    let nfoStore = loadJson(STORE_NFO, {});
    let nfoDirty = false;
    let nfoTimer = null;

    function markNfoDirty() {
        nfoDirty = true;
        if (nfoTimer) return;
        nfoTimer = setTimeout(() => {
            nfoTimer = null;
            if (!nfoDirty) return;
            nfoDirty = false;
            pruneNfoStore();
            saveJson(STORE_NFO, nfoStore);
        }, 1500);
    }
    function pruneNfoStore() {
        const keys = Object.keys(nfoStore);
        if (keys.length <= NFO_MAX_ENTRIES) return;
        keys.sort((a, b) => (nfoStore[a].at || 0) - (nfoStore[b].at || 0));
        keys.slice(0, keys.length - NFO_MAX_ENTRIES).forEach((k) => { delete nfoStore[k]; });
    }
    /** 命中返回「解析结果对象」（可能是 null = 之前读失败了），未命中返回 undefined */
    function nfoCacheGet(key, file) {
        if (!CFG.nfoCache || !CFG.localFirst) return undefined;
        const rec = nfoStore[key];
        if (!rec) return undefined;
        if (file) {
            if (rec.pc && file.pc && rec.pc !== String(file.pc)) return undefined;
            if (rec.sz && file.size && rec.sz !== Number(file.size)) return undefined;
        }
        const ttl = rec.p ? Math.max(1, CFG.cacheDays) * DAY_MS : NFO_MISS_TTL;
        if (Date.now() - (rec.ts || 0) > ttl) return undefined;
        rec.at = Date.now();
        return rec.p || null;
    }
    function nfoCachePut(key, file, parsed, err) {
        if (!CFG.nfoCache) return;
        nfoStore[key] = {
            ts: Date.now(), at: Date.now(),
            pc: (file && file.pc) ? String(file.pc) : '',
            sz: (file && file.size) ? Number(file.size) : 0,
            p: parsed || null,
            e: err ? String(err).slice(0, 160) : ''
        };
        markNfoDirty();
    }
    const flushNfoStore = () => {
        if (!nfoDirty) return;
        nfoDirty = false;
        pruneNfoStore();
        saveJson(STORE_NFO, nfoStore);
    };
    function nfoCacheStats() {
        const keys = Object.keys(nfoStore);
        let hit = 0;
        keys.forEach((k) => { if (nfoStore[k] && nfoStore[k].p) hit++; });
        return { total: keys.length, hit: hit, bytes: JSON.stringify(nfoStore).length };
    }
    function clearNfoCache() { nfoStore = {}; saveJson(STORE_NFO, {}); }

    function decodeXmlEntities(text) {
        return String(text == null ? '' : text)
            .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
            .replace(/&amp;/g, '&');
    }

    function xmlText(xml, tag) {
        const m = new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>', 'i').exec(String(xml || ''));
        if (!m) return '';
        return decodeXmlEntities(m[1]).trim();
    }

    /** 解析 Emby/Jellyfin 的 movie.nfo */
    function parseNfo(xml) {
        const text = String(xml || '');
        if (text.indexOf('<movie') < 0) return null;
        const actors = [];
        const re = /<actor>([\s\S]*?)<\/actor>/gi;
        let m;
        while ((m = re.exec(text))) {
            const name = xmlText(m[1], 'name');
            if (name) actors.push(name);
        }
        const tags = [];
        const tagRe = /<tag>([\s\S]*?)<\/tag>/gi;
        while ((m = tagRe.exec(text))) {
            const v = decodeXmlEntities(m[1]).trim();
            if (v) tags.push(v);
        }
        return {
            t: xmlText(text, 'title'),
            ot: xmlText(text, 'originaltitle'),
            plot: xmlText(text, 'plot') || xmlText(text, 'outline'),
            actors: actors,
            actorsText: actors.join(' '),
            release: xmlText(text, 'release') || xmlText(text, 'releasedate') || xmlText(text, 'premiered'),
            rating: xmlText(text, 'rating'),
            runtime: xmlText(text, 'runtime'),
            studio: xmlText(text, 'studio'),
            genre: xmlText(text, 'genre'),
            director: xmlText(text, 'director'),
            number: xmlText(text, 'num'),
            tags: tags,
            // hub 导出的 NFO 还会写这些（Emby 约定）。以前解析了 plot/tags 却没地方显示，
            // 这几个更是直接丢掉 —— 详情面板要按 hub 的字段铺开，所以一并读出来。
            publisher: xmlText(text, 'publisher'),
            // 系列：hub 写 <label>，Emby 惯例是 <set><name>（嵌套，不能直接用 xmlText）
            series: xmlText(text, 'label') || xmlText(text, 'series') || setSeriesOf(text),
            year: xmlText(text, 'year'),
            mpaa: xmlText(text, 'mpaa') || xmlText(text, 'customrating'),
            tagline: xmlText(text, 'tagline'),
            trailer: xmlText(text, 'trailer'),
            country: xmlText(text, 'country'),
            sorttitle: xmlText(text, 'sorttitle')
        };
    }

    /** 取 <set><name>系列名</name></set> 里的系列名（Emby 的写法，嵌套标签） */
    function setSeriesOf(xml) {
        const m = /<set>([\s\S]*?)<\/set>/i.exec(String(xml || ''));
        if (!m) return '';
        const inner = /<name>([\s\S]*?)<\/name>/i.exec(m[1]);
        return inner ? decodeXmlEntities(inner[1]).trim() : '';
    }

    /** 本次会话的缓存命中统计 —— 自检里直接显示「省掉了多少次网络往返」 */
    let nfoHitLocal = 0;
    let nfoHitNet = 0;

    /** 读一条 entry 对应的 NFO（本地落盘缓存 → 网络，并发去重）。
        `force` = true 时无视解析缓存强制读一次（用于「把素材存到本地」补齐 NFO 原文）。 */
    async function readEntryNfo(entry, force) {
        const file = entry && entry.sc && entry.sc.nfo;
        if (!file || !file.pc) return null;
        const key = entry.item ? stripExt(entry.item.name) : file.name;
        if (!force) {
            const local = nfoCacheGet(key, file);
            if (local !== undefined) { nfoHitLocal++; return local; }
        }
        if (nfoPending[key]) return nfoPending[key];
        const task = (async () => {
            nfoHitNet++;
            try {
                const got = await readFileText(file.pc);
                lastReadVia = got.via;
                const parsed = parseNfo(got.text);
                if (!parsed) {
                    console.warn('[影片墙] NFO 取到了内容但解析失败（' + got.via + '）：' +
                        String(got.text).slice(0, 120));
                }
                nfoCachePut(key, file, parsed, parsed ? '' : 'parse-failed');
                // 实时把 **NFO 原文**也存到本地（IndexedDB）：本地就是一份完整镜像，
                // 我们没解析的标签也不会丢，还能直接导出
                try { await rawNfoPut(key, got.text); } catch (e) { /* 原文存不下不影响主流程 */ }
                return parsed;
            } catch (e) {
                lastReadError = (e && e.message) || String(e);
                console.warn('[影片墙] 读取 NFO 失败', file.name, lastReadError);
                nfoCachePut(key, file, null, lastReadError);
                return null;
            } finally { delete nfoPending[key]; }
        })();
        nfoPending[key] = task;
        return task;
    }
    /** 供自检显示：最后一次 NFO/原图读取走的那条路与失败原因 */
    let lastReadVia = '';
    let lastReadError = '';

    /** 番号归一化（只留字母数字），用来判断「标题其实就是番号」 */
    function normCode(text) {
        return String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    /** 是不是一个「真片名」。NFO 里只有番号（hub 没刮到元数据时就是这样）不算，
        这种占位标题必须让位给 hub / 自刮的结果，否则会把真片名盖掉。 */
    function isRealTitle(title, code, fileName) {
        const text = String(title || '').trim();
        if (!text) return false;
        // 含假名或汉字 —— 番号不会是这种形态，直接当片名
        // （必须先判这个：normCode 会把纯中文清成空串，走下面会误判成「不是片名」）
        if (/[\u3040-\u30ff\u4e00-\u9fff]/.test(text)) return true;
        const n = normCode(text);
        if (!n) return false;
        if (code && n === normCode(code)) return false;
        if (fileName && n === normCode(stripExt(fileName))) return false;
        return text.length >= 10;
    }

    /** 把 src 里有、dst 里没有的文本字段补进来；海报始终以 dst（sidecar）为准 */
    function mergeMeta(dst, src) {
        if (!src) return dst;
        ['t', 'ot', 'tr', 'tg', 'ac', 'st', 'cat', 'rt', 'r', 'd', 'plot', 'tags',
            'pub', 'ser', 'dir', 'yr', 'mpa', 'tagl', 'trl', 'cty'].forEach((k) => {
            const has = dst[k] !== undefined && dst[k] !== '' && dst[k] !== null;
            const add = src[k] !== undefined && src[k] !== '' && src[k] !== null;
            if (!has && add) dst[k] = src[k];
        });
        if (!dst.c && src.c) dst.c = src.c;
        if (!dst.o && src.o) dst.o = src.o;
        if (!dst.nfo && src.nfo) dst.nfo = src.nfo;
        return dst;
    }

    /** 用 sidecar 拼一条记录：海报取 115 缩略图直链（并留 pickcode 以便换原图），元数据读 NFO */
    /** 把一份 NFO 解析结果写进 rec（同步）。抽出来是为了让「首屏同步填标题」与
        「卡片进视口后异步补」走完全相同的字段映射，免得两条路出来的结果不一致。 */
    function applyNfoToRec(rec, nfo, code, fileName) {
        if (!rec || !nfo) return rec;
        rec.nfo = true;
        const rawTitle = nfo.t || nfo.ot || '';
        // 已经有标题就不覆盖（多半是 hub 给的更完整）—— 本地化任务会在 hub 补水**之后**跑，
        // 这里若无条件写就会把 hub 的标题盖成 NFO 里的同一份
        if (!rec.t && isRealTitle(rawTitle, code, fileName)) {
            rec.t = rawTitle;
            if (nfo.ot && nfo.ot !== rawTitle) rec.ot = nfo.ot;
        } else if (!rec.t && nfo.number) {
            rec.nnum = nfo.number;                 // 只读到番号，先记着，不算片名
        }
        if (nfo.actorsText && !rec.ac) rec.ac = nfo.actorsText;
        if (nfo.rating) rec.r = nfo.rating;
        if (nfo.release) rec.d = nfo.release;
        if (nfo.runtime) rec.rt = nfo.runtime;
        if (nfo.studio) rec.st = nfo.studio;
        if (nfo.genre) rec.cat = nfo.genre;
        if (nfo.plot) rec.plot = nfo.plot;
        if (nfo.tags && nfo.tags.length) rec.tags = nfo.tags;
        // 详情面板要用的其余字段（以前解析出来就丢掉了）
        if (nfo.publisher) rec.pub = nfo.publisher;
        if (nfo.series) rec.ser = nfo.series;
        if (nfo.director) rec.dir = nfo.director;
        if (nfo.year) rec.yr = nfo.year;
        if (nfo.mpaa) rec.mpa = nfo.mpaa;
        if (nfo.tagline) rec.tagl = nfo.tagline;
        if (nfo.trailer) rec.trl = nfo.trailer;
        if (nfo.country) rec.cty = nfo.country;
        return rec;
    }

    async function resolveFromSidecar(entry) {
        if (!entry || !entry.sc) return null;
        const file = cardImageFile(entry);
        const img = (file && file.thumb) ? upgradeThumbUrl(file.thumb) : '';
        const nfo = entry.sc.nfo ? await readEntryNfo(entry) : null;
        if (!img && !(file && file.pc) && !nfo) return null;
        const rec = { src: 'sidecar', ts: Date.now(), sc: true };
        if (img) rec.c = img;
        if (file && file.pc) rec.o = file.pc;          // 卡片原图（竖版 1032×1468 / 横版御照）的 pickcode
        if (file && file.name) rec.on = assetNameOf(file.name);   // 存到自选文件夹时的文件名
        if (nfo) applyNfoToRec(rec, nfo, entry.code, entry.item && entry.item.name);
        if (!rec.c && !rec.t && !rec.nnum) return null;
        return rec;
    }

    // ========================================================================
    // 5. 翻译（DeepL → Google → MyMemory 三级兜底）
    // ========================================================================
    let transCache = loadJson(STORE_TRANS, {});
    let transDirty = false;
    let transTimer = null;
    function markTransDirty() {
        transDirty = true;
        if (transTimer) return;
        transTimer = setTimeout(() => {
            transTimer = null;
            if (transDirty) { transDirty = false; saveJson(STORE_TRANS, transCache); }
        }, 2000);
    }
    const langOf = (t) => (String(t || '').toLowerCase() === 'zh-tw') ? 'zh-TW' : 'zh-CN';

    async function translateViaDeepL(text, target) {
        const res = await gm({
            method: 'POST', url: 'https://oneshot-free.www.deepl.com/v1/translate',
            headers: { 'Authorization': 'None', 'Content-Type': 'application/json' },
            data: JSON.stringify({ text: [text], source_lang: 'ja', target_lang: target === 'zh-TW' ? 'zh-Hant' : 'zh-Hans' }),
            timeout: 15000
        });
        const j = JSON.parse(res.responseText);
        const t = j && j.translations && j.translations[0] && j.translations[0].text;
        return t ? String(t).trim() : '';
    }
    async function translateViaGoogle(text, target) {
        const url = 'https://translate-pa.googleapis.com/v1/translate?' + new URLSearchParams({
            'params.client': 'gtx',
            dataTypes: 'TRANSLATION',
            key: 'AIzaSyDLEeFI5OtFBwYBIoK_jj5m32rZK5CkCXA',
            'query.sourceLanguage': 'ja',
            'query.targetLanguage': target,
            'query.text': text
        }).toString();
        const res = await gm({ method: 'GET', url: url, timeout: 15000 });
        if (res.status !== 200) throw new Error('google ' + res.status);
        const j = JSON.parse(res.responseText);
        return String((j && j.translation) || '').trim();
    }
    async function translateViaMyMemory(text, target) {
        const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text.slice(0, 480)) +
            '&langpair=' + encodeURIComponent('ja|' + target);
        const res = await gm({ method: 'GET', url: url, timeout: 15000 });
        const j = JSON.parse(res.responseText);
        if (j && j.responseStatus && Number(j.responseStatus) !== 200) throw new Error('mymemory ' + j.responseStatus);
        const t = j && j.responseData && j.responseData.translatedText;
        return t ? String(t).trim() : '';
    }

    /** 翻译并缓存；返回译文或空串 */
    async function translateText(text, target) {
        const src = String(text || '').trim();
        if (!src) return '';
        // 纯中文的标题没必要翻
        if (!/[\u3040-\u30ff]/.test(src) && /[\u4e00-\u9fa5]/.test(src)) return '';
        const key = target + '|' + src;
        if (transCache[key]) return transCache[key];
        const chain = [translateViaDeepL, translateViaGoogle, translateViaMyMemory];
        for (let i = 0; i < chain.length; i++) {
            try {
                const t = await chain[i](src, target);
                if (t && t !== src && !/MYMEMORY WARNING|DAILY LIMIT|QUERY LENGTH/i.test(t)) {
                    transCache[key] = t;
                    markTransDirty();
                    return t;
                }
            } catch (e) { /* 换下一个源 */ }
        }
        transCache[key] = '';
        markTransDirty();
        return '';
    }

    // ========================================================================
    // 6. 海报 + 元数据
    // ========================================================================
    let posterCache = loadJson(STORE_POSTER, {});
    let posterDirty = false;
    let posterTimer = null;
    /* ⚠️ 落盘前把「会过期的 115 缩略图直链」剥掉。
       实测：同一个文件两次列目录拿到的 `u` URL 的 `s`/`t` 都不一样（`t`=签发时间），
       签名失效后 115 依然回 HTTP 200 + image/jpeg，但内容换成 1.6KB 的「图片已过期」
       占位图 —— `onerror` 抓不到，所以只能保证**它不进任何持久缓存**。
       缓存里只留 pickcode（`o`），出图交给「本地原图 / 按 pickcode 现取」。 */
    const VOLATILE_IMG_RE = /^https?:\/\/thumb\.115\.com\//i;
    function stripVolatileImgFromRec(rec) {
        if (!rec) return 0;
        let n = 0;
        ['c', 'img', 'cover', 'poster', 'thumb'].forEach((k) => {
            if (typeof rec[k] === 'string' && VOLATILE_IMG_RE.test(rec[k])) { delete rec[k]; n++; }
        });
        return n;
    }
    function stripVolatileFromPosterCache() {
        let n = 0;
        Object.keys(posterCache || {}).forEach((k) => { n += stripVolatileImgFromRec(posterCache[k]); });
        return n;
    }

    function markPosterDirty() {
        posterDirty = true;
        if (posterTimer) return;
        posterTimer = setTimeout(() => {
            posterTimer = null;
            if (posterDirty) {
                posterDirty = false;
                stripVolatileFromPosterCache();
                saveJson(STORE_POSTER, posterCache);
            }
        }, 1500);
    }

    /* 缓存格式迁移
       v3.1：刮削链路变了（多了一层 sidecar），沿用旧版留下的「负缓存」（miss 记录，TTL 7 天）
             会让用户以为新功能没生效 —— 所以升级时把 miss 记录清一次，强制重新解析。
       v4（2026-09-24）：清掉缓存里**会过期的 115 缩略图直链**。它们以前被存了进来（TTL 30 天），
             重开影片墙时贴出来就是满屏「图片已过期」。清掉后走 pickcode 取原图。 */
    const CACHE_SCHEMA = 4;
    (function migratePosterCache() {
        let seen = 0;
        try { seen = Number(loadJson('mw_cache_schema', 0)) || 0; } catch (e) { seen = 0; }
        if (seen === CACHE_SCHEMA) return;
        let dropped = 0;
        let stripped = 0;
        Object.keys(posterCache || {}).forEach((key) => {
            const rec = posterCache[key];
            if (rec && rec.miss) { delete posterCache[key]; dropped++; return; }
            stripped += stripVolatileImgFromRec(rec);
        });
        saveJson('mw_cache_schema', CACHE_SCHEMA);
        if (dropped || stripped) {
            markPosterDirty();
            console.log('[115影片墙] 缓存升级到 v' + CACHE_SCHEMA + '：清掉 ' + dropped +
                ' 条失败记录、' + stripped + ' 条会过期的 115 缩略图直链（改用 pickcode 取原图）');
        }
    })();
    function posterTTL(rec) { return ((rec && rec.miss) ? MISS_TTL_MS : Math.max(1, CFG.cacheDays) * 24 * 3600 * 1000); }
    function cacheGet(code) {
        const rec = posterCache[code];
        if (!rec) return null;
        if (Date.now() - (rec.ts || 0) > posterTTL(rec)) return null;
        if (rec.miss && CFG.posterSource === 'cache-only') return rec;
        return rec;
    }

    async function probeDmm(code) {
        const id = codeToDmmId(code);
        if (!/^[a-z0-9]{3,24}$/.test(id)) return null;
        try {
            const res = await gm({ method: 'GET', url: DMM_PS(id), responseType: 'blob', timeout: 12000 });
            if (res.status !== 200) return null;
            const body = res.response;
            const size = body ? (body.size || body.byteLength || 0) : 0;
            if (size >= PS_REAL_MIN_BYTES) return { cover: DMM_PL(id), src: 'dmm' };
        } catch (e) { /* ignore */ }
        return null;
    }

    async function fetchJavdb(code) {
        try {
            const res = await gm({ method: 'GET', url: JAVDB_SEARCH(code), timeout: 15000, headers: { 'Referer': 'https://javdb.com/' } });
            if (res.status !== 200) return null;
            const doc = new DOMParser().parseFromString(res.responseText, 'text/html');
            const want = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
            let found = null;
            $$('.movie-list .item', doc).forEach((item) => {
                if (found) return;
                const codeEl = $('.video-title strong', item);
                const got = codeEl ? codeEl.textContent.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
                if (got !== want) return;
                const img = $('.cover img', item);
                let title = '';
                const vt = $('.video-title', item);
                if (vt) {
                    const clone = vt.cloneNode(true);
                    $$('strong', clone).forEach(s => s.remove());
                    title = clone.textContent.trim();
                }
                const scoreEl = $('.score .value', item);
                const rm = (scoreEl ? scoreEl.textContent : '').match(/([\d.]+)\s*分/);
                const metaEl = $('.meta', item);
                found = {
                    cover: img ? img.getAttribute('src') : '',
                    title: title,
                    rating: rm ? rm[1] : '',
                    date: metaEl ? metaEl.textContent.trim() : '',
                    src: 'javdb'
                };
            });
            return found;
        } catch (e) { return null; }
    }

    const META_RETRY_MS = 24 * 3600 * 1000;

    /** 解析番号的海报 + 标题（+译文），带缓存 */
    async function resolvePoster(code, updater, entry) {
        const key = (entry && entry.key) || code;
        // 0) 网盘目录里的 sidecar 优先（本机 hub 的「导出媒体文件」写入）：
        //    一次列目录就够，海报走 115 自己的缩略图直链、元数据读 NFO，零抓取零鉴权。
        if (CFG.preferSidecar && entry && entry.sc) {
            const scRec = await resolveFromSidecar(entry);
            if (scRec) {
                // hub 已经挂上来的信息先合并进来 —— NFO 里只有番号时，别把真片名/演员丢了
                mergeMeta(scRec, entry.rec);
                if (code) mergeMeta(scRec, cacheGet(code));
                // NFO 没有真片名时继续找片名（hub 已在装载阶段试过，这里补 JavDB），海报仍用 sidecar
                if (!isRealTitle(scRec.t, code, entry.item && entry.item.name) && code && CFG.fetchMeta) {
                    try {
                        const jd = await fetchJavdb(code);
                        if (jd && isRealTitle(jd.title, code)) scRec.t = jd.title;
                        if (jd) {
                            if (jd.rating) scRec.r = scRec.r || jd.rating;
                            if (jd.date) scRec.d = scRec.d || jd.date;
                        }
                    } catch (e) { /* ignore */ }
                }
                // 只翻译「真片名」——番号本身翻译没意义
                if (CFG.titleTranslate && isRealTitle(scRec.t, code, entry.item && entry.item.name) && !scRec.tr) {
                    const tr = await translateText(scRec.t, langOf(CFG.translateTarget));
                    if (tr) { scRec.tr = tr; scRec.tg = langOf(CFG.translateTarget); }
                }
                posterCache[key] = scRec;
                markPosterDirty();
                if (updater) updater(scRec);
                return scRec;
            }
        }
        const hit = cacheGet(code);
        const needMeta = !!(hit && CFG.titleTranslate && CFG.fetchMeta && !hit.miss && !hit.t &&
            (!hit.mt || Date.now() - hit.mt > META_RETRY_MS));
        const needTrans = !!(hit && CFG.titleTranslate && hit.t && !hit.tr &&
            (!hit.tt || Date.now() - hit.tt > META_RETRY_MS));

        // 已有封面/负缓存，且不缺东西 → 直接返回
        if (hit && (hit.c || hit.miss) && !needMeta && !needTrans) return hit;

        // 已有记录、只是缺元数据/译文 → 只补缺的部分，不重新探测封面（避免反复请求站点）
        if (hit && (hit.c || hit.miss)) {
            if (needMeta) {
                hit.mt = Date.now();
                const jd = await fetchJavdb(code);
                if (jd && jd.title) {
                    hit.t = jd.title;
                    if (jd.rating) hit.r = jd.rating;
                    if (jd.date) hit.d = jd.date;
                }
            }
            if (CFG.titleTranslate && hit.t && !hit.tr) {
                hit.tt = Date.now();
                const tr = await translateText(hit.t, langOf(CFG.translateTarget));
                if (tr) { hit.tr = tr; hit.tg = langOf(CFG.translateTarget); }
            }
            posterCache[code] = hit;
            markPosterDirty();
            if (updater) updater(hit);
            return hit;
        }

        if (!CFG.autoScrape && CFG.posterSource === 'cache-only') return hit || { miss: true, src: 'none', ts: Date.now() };

        // 已有的记录先继承下来（尤其是 hub 来的标题/演员/发行日期），只补缺的
        let rec = hit ? {
            c: hit.c, o: hit.o, t: hit.t, r: hit.r, d: hit.d, ac: hit.ac, st: hit.st,
            cat: hit.cat, rt: hit.rt, ms: hit.ms, src: hit.src, mt: hit.mt, tt: hit.tt, ts: hit.ts
        } : null;

        // 1) 封面（已经有就不重复探测站点）
        if (rec && rec.c) {
            /* 保留 */
        } else if (CFG.posterSource === 'dmm-first' && !isUncensored(code)) {
            const dmm = await probeDmm(code);
            if (dmm) rec = Object.assign(rec || {}, { c: dmm.cover, src: 'dmm', ts: Date.now() });
        }
        if (!rec || !rec.c) {
            const jd = await fetchJavdb(code);
            if (jd && jd.cover) {
                rec = Object.assign(rec || {}, {
                    c: jd.cover, t: (rec && rec.t) || jd.title, r: jd.rating, d: (rec && rec.d) || jd.date,
                    src: 'javdb', ts: Date.now()
                });
            }
            if (jd && !rec.mt) rec = Object.assign(rec || {}, { mt: Date.now() });
        }
        if ((!rec || !rec.c) && CFG.posterSource === 'javdb-first' && !isUncensored(code)) {
            const dmm = await probeDmm(code);
            if (dmm) rec = Object.assign(rec || {}, { c: dmm.cover, src: 'dmm', ts: Date.now() });
        }
        if (!rec) rec = { miss: true, src: 'none', ts: Date.now() };
        if (!rec.c && !rec.miss && !rec.t) rec = Object.assign(rec, { miss: true });

        // 2) 需要标题/翻译时补抓 JavDB 元数据（每 24h 最多重试一次）
        if (CFG.titleTranslate && CFG.fetchMeta && !rec.miss && !rec.t && !rec.mt) {
            rec.mt = Date.now();
            const jd = await fetchJavdb(code);
            if (jd) {
                if (jd.title) rec.t = jd.title;
                if (jd.rating) rec.r = jd.rating;
                if (jd.date) rec.d = jd.date;
            }
        }
        // 3) 翻译
        if (CFG.titleTranslate && rec.t && !rec.tr) {
            rec.tt = Date.now();
            const tr = await translateText(rec.t, langOf(CFG.translateTarget));
            if (tr) { rec.tr = tr; rec.tg = langOf(CFG.translateTarget); }
        }

        posterCache[code] = rec;
        markPosterDirty();
        if (updater) updater(rec);
        return rec;
    }

    // ========================================================================
    // 7. 文件夹缓存（把刮削结果写回当前目录）
    // ========================================================================
    const folderStat = loadJson(STORE_FOLDER_STAT, {});
    let folderSaveTimer = null;

    function collectCacheEntries() {
        const out = {};
        const now = Date.now();
        Object.keys(posterCache).forEach((k) => {
            const r = posterCache[k];
            if (!r) return;
            if (r.miss && now - (r.ts || 0) > MISS_TTL_MS) return;
            const o = { ts: r.ts || now };
            if (r.c) o.c = r.c;
            if (r.o) o.o = 1;
            if (r.t) o.t = r.t;
            if (r.tr) o.tr = r.tr;
            if (r.tg) o.tg = r.tg;
            if (r.r) o.r = r.r;
            if (r.d) o.d = r.d;
            if (r.ac) o.ac = r.ac;
            if (r.st) o.st = r.st;
            if (r.cat) o.cat = r.cat;
            if (r.rt) o.rt = r.rt;
            if (r.ms) o.ms = r.ms;
            if (r.mt) o.mt = r.mt;
            if (r.tt) o.tt = r.tt;
            if (r.src) o.src = r.src;
            if (r.miss) o.miss = 1;
            out[k] = o;
        });
        // 顺便把翻译缓存也带上，换机器/换浏览器也能直接用
        const trans = {};
        Object.keys(transCache).forEach((k) => { if (transCache[k]) trans[k] = transCache[k]; });
        return { entries: out, trans: trans };
    }

    function mergeCachePayload(payload) {
        if (!payload || typeof payload !== 'object') return 0;
        let n = 0;
        const entries = payload.entries || {};
        Object.keys(entries).forEach((code) => {
            const remote = entries[code];
            if (!remote) return;
            const local = posterCache[code];
            if (!local || (remote.ts || 0) > (local.ts || 0)) { posterCache[code] = remote; n++; }
        });
        const trans = payload.trans || {};
        Object.keys(trans).forEach((k) => {
            if (trans[k] && !transCache[k]) { transCache[k] = trans[k]; n++; }
        });
        if (n) { markPosterDirty(); markTransDirty(); }
        return n;
    }

    async function findFolderCacheFile(cid) {
        try {
            const list = await listDirAll(cid);
            const hit = list.map(it => normalizeItem(it, cid, ''))
                .filter(n => n && n.kind === 'file' && n.name === CFG.cacheFileName)[0];
            return hit || null;
        } catch (e) { return null; }
    }

    async function readFolderCache(cid, silent) {
        if (!CFG.folderCache) return 0;
        try {
            const f = await findFolderCacheFile(cid);
            if (!f || !f.pc) {
                if (!silent) toast('当前文件夹里没有缓存文件', 'info', 2500);
                return 0;
            }
            const txt = await downloadTextByPickcode(f.pc);
            const payload = JSON.parse(txt);
            const n = mergeCachePayload(payload);
            folderStat[cid] = { loadedAt: Date.now(), entries: Object.keys(payload.entries || {}).length };
            saveJson(STORE_FOLDER_STAT, folderStat);
            if (n) toast(`已载入文件夹缓存，补齐 ${n} 条刮削结果`, 'success', 3000);
            return n;
        } catch (e) {
            if (!silent) toast('读取文件夹缓存失败：' + e.message, 'error', 4000);
            return 0;
        }
    }

    /* ⚠️ 写入已停用（v3.4）：115 封掉了脚本直传 —— 老 3.0 协议现在一律回
       `{"statuscode":400,"statusmsg":"sig invalid"}`（要 4.0 + ECDH 才能传，成本不值得）。
       好在**已经不需要它了**：持久化改由本机 hub 写成网盘里的实体文件
       （`<视频名>.nfo` + `<视频名>-poster.jpg`），影片墙列一次目录就能读到，
       比读一个 json 缓存还快、还能被 Emby/Jellyfin 复用。
       读取与删除旧缓存文件的能力保留，方便清理历史遗留。 */
    async function writeFolderCache(cid, manual) {
        const msg = '写入已停用：115 封禁了脚本直传（sig invalid）。' +
            '刮削结果现在由 hub 写成 <视频名>.nfo 与 -poster.jpg，列目录即可读取，不再需要这个缓存文件';
        try { console.info('[影片墙] ' + msg); } catch (e) { /* ignore */ }
        if (manual) toast(msg, 'info', 5600);
        return false;
    }

    function scheduleFolderSave() {
        if (!CFG.folderCache) return;
        if (folderSaveTimer) clearTimeout(folderSaveTimer);
        folderSaveTimer = setTimeout(() => {
            folderSaveTimer = null;
            if (!state.overlayOpen) return;
            writeFolderCache(state.curCid, false);
        }, 12000);
    }

    async function deleteFolderCache() {
        const cid = state.curCid;
        const f = await findFolderCacheFile(cid);
        if (!f) { toast('当前文件夹里没有缓存文件', 'info', 2500); return; }
        const j = await apiReq('POST', API_BASE + '/rb/delete', buildIdsBody({ pid: cid, ignore_warn: 1 }, [f.fid]));
        if (j && j.state) {
            delete folderStat[cid];
            saveJson(STORE_FOLDER_STAT, folderStat);
            toast('已删除网盘上的缓存文件', 'success', 3000);
        } else {
            toast('删除失败：' + ((j && j.error) || '未知错误'), 'error', 4000);
        }
    }

    // ========================================================================
    // 8. 本机 115 Media Hub 集成（刮削主力）
    //    用户目标：刮削交给本机 hub（30+ 源 + 数据库缓存 + 图片代理 + 标题翻译），
    //    影片墙优先读刮削结果，并把结果写回目录，下次打开不重复刮。
    //    - GET  /api/avwall/items?only_scraped=1   已刮削元数据（标题/演员/海报/发行日期…）
    //    - GET  /api/avwall/image?url=             海报代理（白名单 + 补 Referer + hub 落盘缓存）
    //    - POST /api/avwall/translate              批量标题翻译（hub 侧有译文缓存）
    //    - POST /api/avwall/scan                   让 hub 扫当前目录
    //    - POST /api/avwall/scrape-missing         让 hub 补刮「有番号但没元数据」的条目
    // ========================================================================
    let hubSession = String(CFG.hubCookie || '');
    let hubItemsCache = { ts: 0, map: null, total: 0, withPoster: 0 };

    const hubBase = () => String(CFG.hubBase || '').replace(/\/+$/, '');
    const hubConfigured = () => !!(CFG.hubEnabled && /^https?:\/\/.+/.test(hubBase()));

    function hubFetch(path, opts) {
        opts = opts || {};
        const headers = Object.assign({ 'Accept': 'application/json' }, opts.headers || {});
        if (hubSession && hubSession !== '__jar__') headers['Cookie'] = hubSession;
        const req = { method: opts.method || 'GET', url: hubBase() + path, headers: headers, timeout: opts.timeout || 25000 };
        if (opts.body !== undefined) {
            headers['Content-Type'] = 'application/json';
            req.data = JSON.stringify(opts.body);
        }
        return gm(req).then((res) => ({
            status: res.status,
            json: (function () { try { return JSON.parse(res.responseText || '{}'); } catch (e) { return null; } })(),
            headers: String(res.responseHeaders || ''),
            text: String(res.responseText || '')
        }));
    }

    /** 登录 hub 拿 session cookie；读不到 Set-Cookie 时退化为「靠浏览器 jar」 */
    async function hubLogin(force) {
        if (hubSession && hubSession !== '__jar__' && !force) return hubSession;
        if (CFG.hubCookie && !force) { hubSession = String(CFG.hubCookie).trim(); return hubSession; }
        if (!CFG.hubPass) return '';
        const r = await hubFetch('/login', {
            method: 'POST',
            body: { username: CFG.hubUser || 'admin', password: CFG.hubPass }
        });
        if (r.status !== 200 || !r.json || r.json.ok !== true) {
            throw new Error('hub 登录失败(' + r.status + ')：' + ((r.json && r.json.msg) || r.text.slice(0, 60)));
        }
        const m = r.headers.match(/set-cookie:\s*([^\r\n]+)/i);
        const sm = m && m[1].match(/(session=[^;]+)/);
        hubSession = sm ? sm[1] : '__jar__';
        return hubSession;
    }

    /** 带自动登录 + 401 重试 */
    async function hubApi(path, opts) {
        if (!hubConfigured()) throw new Error('未启用本机 hub');
        if (!hubSession) { try { await hubLogin(false); } catch (e) { /* 下面用 401 兜底 */ } }
        let r = await hubFetch(path, opts);
        if (r.status === 401) {
            hubItemsCache.ts = 0;
            hubSession = '';
            await hubLogin(true);
            r = await hubFetch(path, opts);
        }
        if (r.status === 401) {
            throw new Error('hub 需要登录：请在「本机 Hub」设置里填用户名/密码，或先在本机浏览器登录一次 hub');
        }
        if (!r.json) throw new Error('hub 返回非 JSON(' + r.status + ')：' + r.text.slice(0, 60));
        return r.json;
    }

    /** 取「已刮削」条目 → file_id / 文件名 双索引（带 TTL 缓存） */
    async function hubScrapedMap(force) {
        const ttl = Math.max(1, Number(CFG.hubRetryMin) || 10) * 60000;
        if (!force && hubItemsCache.map && Date.now() - hubItemsCache.ts < ttl) return hubItemsCache.map;
        const byId = {}, byName = {};
        let total = 0, poster = 0, offset = 0;
        for (let page = 0; page < 12; page++) {
            const j = await hubApi('/api/avwall/items?only_scraped=1&limit=300&offset=' + offset);
            const items = (j && j.items) || [];
            total = Number(j && j.total || items.length);
            poster += Number(j && j.with_poster || 0);
            items.forEach((it) => {
                const id = String(it.file_id || '');
                const nm = String(it.name || '');
                if (id) byId[id] = it;
                if (nm) byName[nm] = it;
            });
            offset += items.length;
            if (!items.length || !(j && j.has_more)) break;
        }
        hubItemsCache = { ts: Date.now(), map: { byId: byId, byName: byName }, total: total, withPoster: poster };
        return hubItemsCache.map;
    }

    /** hub item → 内部 rec（o=1 表示原图需要走 hub 代理） */
    function hubItemToRec(it) {
        const rec = {
            c: String(it.poster_url || it.cover_url || ''),
            o: 1,
            t: String(it.title || ''),
            d: String(it.release || it.year || ''),
            ac: (it.actors || []).join('・'),
            st: String(it.studio || ''),
            cat: String(it.category || ''),
            src: 'hub',
            mt: Date.now(),      // hub 已有元数据，别再触发 JavDB 补抓
            ts: Date.now()
        };
        if (it.runtime) rec.rt = String(it.runtime);
        if (it.meta_source) rec.ms = String(it.meta_source);
        // hub 的 items 接口本来就带这些，以前没接 —— 详情面板里的厂牌/系列/导演/简介/标签全靠它
        if (it.publisher) rec.pub = String(it.publisher);
        if (it.series) rec.ser = String(it.series);
        if (it.director) rec.dir = String(it.director);
        if (it.plot) rec.plot = String(it.plot);
        if (it.tags && it.tags.length) rec.tags = it.tags.slice(0, 30);
        if (it.year) rec.yr = String(it.year);
        // 背景大图与剧照：只有 hub 侧有；旁挂 NFO 里只有文件名引用，派不上用场
        if (it.fanart_url) rec.fan = String(it.fanart_url);
        if (it.extra_fanart && it.extra_fanart.length) rec.fans = it.extra_fanart.slice(0, 12);
        return rec;
    }

    /** 把 hub 已刮削数据贴到条目上（file_id 优先，文件名兜底） */
    async function attachHubData(entries, silent) {
        if (!hubConfigured() || !entries.length) return 0;
        let map = null;
        try { map = await hubScrapedMap(false); }
        catch (e) { if (!silent) toast('读取 hub 刮削结果失败：' + e.message, 'error', 5200); return 0; }
        let n = 0;
        entries.forEach((e) => {
            const it = map.byId[e.item.fid] || map.byName[e.item.name];
            if (!it) return;
            const code = String(it.number || e.code || '');
            if (!e.code && code) e.code = code;
            if (!code) return;
            const rec = hubItemToRec(it);
            const prev = posterCache[code];
            if (prev) {
                if (prev.tr) { rec.tr = prev.tr; rec.tg = prev.tg; }
                if (!rec.c && prev.c) { rec.c = prev.c; delete rec.o; }
                if (!rec.t && prev.t) rec.t = prev.t;
                if (!rec.d && prev.d) rec.d = prev.d;
            }
            posterCache[code] = rec;
            e.rec = rec;
            e.hub = true;
            n++;
        });
        if (n) {
            markPosterDirty();
            entries.forEach((e) => {
                const card = e._card;
                if (card && card.isConnected && e.rec) { applyPoster(card, e.rec); fillCard(card, e); }
            });
            scheduleResort();   // hub 一次补一批元数据，顺序可能马上要变
        }
        return n;
    }

    /** hub 批量翻译（它侧有译文缓存），返回 番号 → 译文 */
    async function hubTranslate(numbers) {
        const out = {};
        const list = Array.from(new Set((numbers || []).filter(Boolean)));
        if (!hubConfigured() || !list.length) return out;
        for (let i = 0; i < list.length; i += 120) {
            const part = list.slice(i, i + 120);
            let j = null;
            try {
                j = await hubApi('/api/avwall/translate', {
                    method: 'POST', timeout: 60000,
                    body: { numbers: part, lang: langOf(CFG.translateTarget), mode: 'fill' }
                });
            } catch (e) { break; }
            ((j && j.items) || []).forEach((it) => {
                if (it && it.number && it.text && it.status !== 'failed') out[String(it.number)] = String(it.text);
            });
        }
        return out;
    }

    /** 给缺译文的条目补翻译：hub 优先 → 脚本三级兜底 */
    async function translateEntries(entries) {
        if (!CFG.titleTranslate) return 0;
        const need = entries.filter((e) => e.code && e.rec && e.rec.t && !e.rec.tr);
        if (!need.length) return 0;
        let n = 0;
        const apply = (e, tr) => {
            e.rec.tr = tr;
            e.rec.tg = langOf(CFG.translateTarget);
            posterCache[e.code] = e.rec;
            n++;
            const card = e._card;
            if (card && card.isConnected) { applyPoster(card, e.rec); fillCard(card, e); }
        };
        if (CFG.hubEnabled && CFG.hubAutoTranslate && hubConfigured()) {
            const map = await hubTranslate(need.map((e) => e.code));
            need.forEach((e) => { if (map[e.code]) apply(e, map[e.code]); });
            markPosterDirty();
        }
        const rest = need.filter((e) => !e.rec.tr);
        for (let i = 0; i < rest.length; i += 2) {
            await Promise.all(rest.slice(i, i + 2).map(async (e) => {
                const tr = await translateText(e.rec.t, langOf(CFG.translateTarget));
                if (tr) apply(e, tr);
            }));
            markPosterDirty();
        }
        return n;
    }

    /** 请求 hub 时该带的头（含手工 session cookie） */
    function hubHeaders() {
        const headers = { 'Accept': '*/*', 'Referer': hubBase() + '/' };
        if (hubSession && hubSession !== '__jar__') headers['Cookie'] = hubSession;
        return headers;
    }

    /**
     * 海报地址：hub 开着就走 hub 代理。
     * 注意：不能用 <img src="http://127.0.0.1:18080/..."> 直连 ——
     * 从 115.com 发起到 127.0.0.1 属跨站，SameSite=lax 的 session cookie 不会被带上，
     * 图片接口会返回 401。所以这里用 GM 取图转 blob URL（带 cookie），失败再退回直连原图。
     */
    const coverBlobCache = new Map();
    const coverBlobOrder = [];
    const COVER_BLOB_MAX = 100;

    async function coverSrc(rec) {
        if (!rec || !rec.c) return '';
        const raw = rec.c;
        // sidecar 海报就是 115 自己的缩略图直链，匿名可访问，不必再绕 hub 取图
        if (rec.sc) return raw;
        if (!(hubConfigured() && CFG.hubImageProxy)) return raw;
        if (coverBlobCache.has(raw)) return coverBlobCache.get(raw);
        try {
            const res = await gm({
                method: 'GET',
                url: hubBase() + '/api/avwall/image?url=' + encodeURIComponent(raw),
                headers: hubHeaders(),
                responseType: 'blob',
                timeout: 20000
            });
            if (res.status !== 200 || !res.response) throw new Error('HTTP ' + res.status);
            const blob = res.response;
            if (!(blob.size > 0)) throw new Error('空响应');
            const url = URL.createObjectURL(blob);
            coverBlobCache.set(raw, url);
            coverBlobOrder.push(raw);
            while (coverBlobOrder.length > COVER_BLOB_MAX) {
                const key = coverBlobOrder.shift();
                const old = coverBlobCache.get(key);
                if (old) URL.revokeObjectURL(old);
                coverBlobCache.delete(key);
            }
            return url;
        } catch (e) {
            return raw;   // 退回直连原图（DMM / jdbstatic 允许外站 referer）
        }
    }
    function clearCoverBlobs() {
        coverBlobCache.forEach((url) => { try { URL.revokeObjectURL(url); } catch (e) { } });
        coverBlobCache.clear();
        coverBlobOrder.length = 0;
    }

    /** 同步版：只用于「现在就能拿到地址」的场景（如日志/调试） */
    function posterURL(rec) {
        if (!rec || !rec.c) return '';
        if (hubConfigured() && CFG.hubImageProxy) {
            return hubBase() + '/api/avwall/image?url=' + encodeURIComponent(rec.c);
        }
        return rec.c;
    }

    /** hub 侧动作 */
    async function hubStats(scanRoot) {
        const q = scanRoot ? ('?scan_root=' + encodeURIComponent(scanRoot)) : '';
        return await hubApi('/api/avwall/stats' + q);
    }
    async function hubFacets() {
        return await hubApi('/api/avwall/facets');
    }
    async function hubScan(cid, recursive) {
        return await hubApi('/api/avwall/scan', {
            method: 'POST', timeout: 240000,
            body: {
                provider: '115', root_cid: String(cid), recursive: recursive !== false,
                max_dirs: 400, max_files: 20000
            }
        });
    }
    async function hubScrapeMissing(limit) {
        return await hubApi('/api/avwall/scrape-missing', {
            method: 'POST', timeout: 60000,
            body: { provider: '115', scan_root: '', limit: Number(limit) || 40 }
        });
    }


    // ========================================================================
    // 状态
    // ========================================================================
    const state = {
        mode: 'dir',
        items: [],
        filtered: [],
        rendered: 0,
        rootCid: GM_getValue(STORE_ROOT, ''),
        rootName: GM_getValue(STORE_ROOT_NAME, ''),
        sort: 'code',
        shuffleSeed: Math.floor(Math.random() * 1e9),   // 「随机排序」的会话种子，换一批就换它
        keyword: '',
        cardW: 320,
        loading: false,
        truncated: false,
        curCid: '',
        overlayOpen: false,
        folderSaving: false,
        posterQueue: [],
        posterRunning: 0,
        hoverPreview: null,
        // 批量操作（勾选 → 移动/删除，连带 sidecar 产物）
        selected: Object.create(null),   // entry.uid → true（每个文件一个，别用 key：同番号会撞）
        opsRunning: false,
        moveTarget: null,                // { cid, name }
        // 本地缓存（v3.9）：后台校验索引进行中 / 本次渲染是否来自本地缓存
        bgRefreshing: false,
        usedCache: false,
        caching: null                    // 「把素材实时存到本地」任务的进度
    };
    let posterObserver = null;

    // ========================================================================
    // 9. 样式
    // ========================================================================
    GM_addStyle(`
    #mw-overlay{position:fixed;inset:0;z-index:2147483500;background:#0b0e14;color:#e6e8ee;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;
      display:flex;flex-direction:column;}
    #mw-overlay *,#mw-set-overlay *{box-sizing:border-box;}
    .mw-head{display:flex;align-items:center;gap:10px;padding:11px 18px;border-bottom:1px solid #1e2532;background:#0e131b;flex-wrap:wrap;}
    .mw-logo{font-size:16px;font-weight:700;letter-spacing:.5px;background:linear-gradient(135deg,#7c5cff,#22d3ee);
      -webkit-background-clip:text;background-clip:text;color:transparent;}
    .mw-modes{display:flex;background:#161c26;border-radius:8px;padding:3px;gap:2px;}
    .mw-modes button{border:0;background:transparent;color:#9aa4b6;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;}
    .mw-modes button.on{background:#2b3547;color:#fff;font-weight:600;}
    .mw-input{background:#161c26;border:1px solid #232b39;color:#e6e8ee;border-radius:8px;padding:7px 12px;font-size:13px;outline:none;}
    .mw-input:focus{border-color:#4b6bff;}
    .mw-search{width:200px;}
    .mw-btn{background:#1b2330;border:1px solid #2a3446;color:#c8d0de;border-radius:8px;padding:7px 12px;font-size:13px;cursor:pointer;}
    .mw-btn:hover{background:#243044;color:#fff;}
    .mw-btn.primary{background:linear-gradient(135deg,#5b4bff,#7c5cff);border:0;color:#fff;}
    .mw-spacer{flex:1;}
    .mw-stats{padding:7px 18px;font-size:12px;color:#7c8798;border-bottom:1px solid #161c26;display:flex;gap:16px;flex-wrap:wrap;align-items:center;}
    .mw-body{flex:1;overflow:auto;padding:18px;}
    .mw-grid{display:grid;gap:16px;grid-template-columns:repeat(var(--mw-cols,auto-fill),minmax(var(--mw-card-w,320px),1fr));
      max-width:var(--mw-maxw,100%);margin:0 auto;}
    .mw-grid.mw-masonry{display:block;column-count:var(--mw-cols-n,5);column-gap:16px;}
    .mw-grid.mw-masonry .mw-card{break-inside:avoid;margin-bottom:16px;display:inline-block;width:100%;}
    .mw-grid.mw-auto{grid-template-columns:repeat(auto-fill,minmax(var(--mw-card-w,320px),1fr));}
    .mw-card{background:#111722;border:1px solid #1d2634;border-radius:12px;overflow:hidden;cursor:pointer;
      transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease;position:relative;}
    .mw-fx .mw-card:hover{transform:translateY(-3px);border-color:#4b6bff;box-shadow:0 12px 30px rgba(0,0,0,.5);}
    .mw-pick{position:absolute;top:8px;left:8px;z-index:6;width:24px;height:24px;border-radius:7px;
      background:rgba(8,12,20,.75);border:1px solid #38455c;display:flex;align-items:center;justify-content:center;cursor:pointer;}
    .mw-pick:hover{border-color:#8fe3ff;}
    .mw-pick input{margin:0;width:15px;height:15px;cursor:pointer;accent-color:#4b6bff;}
    .mw-card.is-picked{border-color:#4b6bff;box-shadow:0 0 0 1px rgba(75,107,255,.65);}
    .mw-ops{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 18px;
      border-bottom:1px solid #161c26;background:#0d1219;font-size:12.5px;color:#9aa4b6;}
    .mw-ops b{color:#8fe3ff;}
    .mw-ops-tgt{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#c8d0de;
      max-width:24vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .mw-ops-tgl{display:flex;align-items:center;gap:5px;cursor:pointer;user-select:none;}
    .mw-btn.danger{border-color:#5b2a33;background:#231418;color:#ffb4b4;}
    .mw-btn:disabled{opacity:.45;cursor:not-allowed;}
    .mw-poster{position:relative;width:100%;aspect-ratio:800/538;background:#0b0e14;overflow:hidden;}
    .mw-portrait .mw-poster{aspect-ratio:2/3;}
    .mw-poster img{width:100%;height:100%;object-fit:cover;object-position:center;display:block;opacity:0;transition:opacity .35s ease;}
    .mw-portrait .mw-poster img{object-position:center 12%;}
    .mw-poster img.ready{opacity:1;}
    /* 横版卡片里放竖版海报：别把海报裁成一条 —— 整张完整显示，底下垫一层同图的模糊铺底，
       免得左右留两条生硬的黑边（.has-vert 由 applyCardArtFit 按图片自身宽高判定后挂上） */
    .mw-blur{display:none;}
    .mw-poster.has-vert .mw-blur{display:block;position:absolute;inset:0;background-size:cover;
      background-position:center;filter:blur(26px) saturate(1.25) brightness(.55);transform:scale(1.25);}
    .mw-poster.has-vert img{position:relative;object-fit:contain;}
    .mw-portrait .mw-poster.has-vert .mw-blur{display:none;}
    .mw-portrait .mw-poster.has-vert img{position:static;object-fit:cover;}
    .mw-ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
      font-size:22px;font-weight:800;color:rgba(255,255,255,.92);letter-spacing:1px;text-shadow:0 2px 10px rgba(0,0,0,.5);}
    .mw-skel{position:absolute;inset:0;background:linear-gradient(90deg,#141b26 25%,#1b2330 37%,#141b26 63%);
      background-size:400% 100%;animation:mw-shimmer 1.3s ease infinite;}
    @keyframes mw-shimmer{0%{background-position:100% 50%}100%{background-position:0 50%}}
    .mw-badge{position:absolute;left:8px;top:8px;background:rgba(0,0,0,.66);color:#8fe3ff;
      font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;font-weight:700;
      padding:3px 8px;border-radius:6px;border:1px solid rgba(143,227,255,.25);}
    .mw-src{position:absolute;right:8px;top:8px;background:rgba(0,0,0,.6);color:#9aa4b6;font-size:10px;padding:2px 6px;border-radius:5px;}
    .mw-tr{position:absolute;left:8px;bottom:8px;background:rgba(34,211,238,.16);border:1px solid rgba(34,211,238,.35);
      color:#8fe3ff;font-size:10px;padding:2px 6px;border-radius:5px;}
    .mw-meta{padding:10px 12px 12px;}
    .mw-title{font-size:13px;line-height:1.45;color:#dfe4ee;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:37px;}
    .mw-sub{margin-top:6px;font-size:11.5px;color:#7c8798;display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
    .mw-path{font-size:11px;color:#5b6577;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .mw-acts{position:absolute;right:8px;bottom:8px;display:none;gap:6px;}
    .mw-card:hover .mw-acts{display:flex;}
    .mw-acts button{border:0;background:rgba(20,26,36,.92);color:#c8d0de;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;}
    .mw-acts button:hover{background:#4b6bff;color:#fff;}
    .mw-empty{padding:60px 20px;text-align:center;color:#5d6878;font-size:14px;line-height:1.9;}
    .mw-loadmore{text-align:center;padding:24px;color:#7c8798;font-size:13px;}
    #mw-hover{position:fixed;z-index:2147483550;pointer-events:none;display:none;
      border:2px solid #4b6bff;border-radius:10px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.65);background:#0b0e14;}
    #mw-hover img{display:block;max-width:560px;height:auto;}
    .mw-fab{position:fixed;right:18px;bottom:148px;z-index:9998;background:linear-gradient(135deg,#7c5cff,#22d3ee);
      color:#fff;padding:10px 14px;border-radius:22px;box-shadow:0 6px 18px rgba(124,92,255,.45);
      font-size:13px;font-weight:600;cursor:pointer;user-select:none;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}
    .mw-fab:hover{filter:brightness(1.08);}
    /* ---- 设置面板 ---- */
    #mw-set-overlay{position:fixed;inset:0;z-index:2147483620;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;}
    .mw-set-panel{width:min(880px,calc(100vw - 40px));height:min(660px,calc(100vh - 60px));background:#0e131b;color:#e6e8ee;
      border:1px solid #232b39;border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.6);}
    .mw-set-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #1e2532;
      background:linear-gradient(135deg,#171f2c,#131a24);}
    .mw-set-head b{font-size:15px;}
    .mw-set-close{border:0;background:transparent;color:#9aa4b6;font-size:20px;cursor:pointer;line-height:1;}
    .mw-set-close:hover{color:#fff;}
    .mw-set-body{flex:1;display:flex;min-height:0;}
    .mw-set-nav{width:132px;flex-shrink:0;border-right:1px solid #1a2130;padding:10px 8px;overflow:auto;}
    .mw-set-nav button{display:block;width:100%;text-align:left;border:0;background:transparent;color:#9aa4b6;
      padding:9px 12px;border-radius:8px;font-size:13px;cursor:pointer;margin-bottom:4px;}
    .mw-set-nav button.on{background:#243044;color:#fff;font-weight:600;}
    .mw-set-content{flex:1;overflow:auto;padding:16px 20px 28px;}
    .mw-set-sec-title{font-size:13px;color:#7c8798;margin:4px 0 12px;letter-spacing:.5px;}
    .mw-set-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px;}
    .mw-row{display:flex;align-items:center;gap:12px;padding:11px 13px;background:#131a24;border:1px solid #1d2634;border-radius:10px;}
    .mw-row-copy{flex:1;min-width:0;}
    .mw-row-copy strong{display:block;font-size:13px;font-weight:600;color:#dfe4ee;}
    .mw-row-copy small{display:block;margin-top:3px;font-size:11.5px;color:#7c8798;line-height:1.5;}
    .mw-switch{position:relative;width:44px;height:24px;flex-shrink:0;cursor:pointer;}
    .mw-switch input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer;z-index:2;}
    .mw-switch i{position:absolute;inset:0;background:#2a3446;border-radius:12px;transition:background .18s;}
    .mw-switch i:before{content:'';position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:50%;background:#8b97a8;transition:transform .18s,background .18s;}
    .mw-switch input:checked + i{background:#1f8a4c;}
    .mw-switch input:checked + i:before{transform:translateX(20px);background:#fff;}
    .mw-row-range,.mw-row-sel,.mw-row-text{display:flex;align-items:center;gap:10px;padding:11px 13px;background:#131a24;border:1px solid #1d2634;border-radius:10px;flex-wrap:wrap;}
    .mw-row-range input[type=range]{flex:1;min-width:110px;accent-color:#7c5cff;}
    .mw-row-range b{min-width:52px;text-align:right;color:#8fe3ff;font-size:12.5px;}
    .mw-row-sel select,.mw-row-text input{background:#0e131b;border:1px solid #2a3446;color:#dfe4ee;border-radius:6px;padding:5px 8px;font-size:12.5px;outline:none;}
    .mw-row-text input{flex:1;min-width:120px;}
    .mw-row-act{display:flex;align-items:center;gap:10px;padding:11px 13px;background:#131a24;border:1px solid #1d2634;border-radius:10px;}
    .mw-row-act button{flex-shrink:0;}
    .mw-row-info{grid-column:1/-1;padding:11px 13px;background:#101720;border:1px dashed #26303f;border-radius:10px;font-size:12px;color:#8b97a8;line-height:1.8;}
    .mw-row-info b{color:#8fe3ff;font-weight:600;}
    .mw-set-foot{display:flex;align-items:center;gap:10px;padding:12px 18px;border-top:1px solid #1e2532;background:#0e131b;}
    .mw-set-foot .mw-stat{flex:1;font-size:12px;color:#7c8798;}
    /* ---- 影片详情面板（点卡片上的「详情」或双击卡片打开） ---- */
    #mw-detail-ov{position:fixed;inset:0;z-index:2147483610;background:rgba(0,0,0,.62);
      display:flex;align-items:center;justify-content:center;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;}
    .mw-detail-panel{position:relative;width:min(980px,calc(100vw - 36px));max-height:min(88vh,900px);
      background:#0e131b;color:#e6e8ee;border:1px solid #232b39;border-radius:14px;overflow:auto;
      box-shadow:0 24px 70px rgba(0,0,0,.65);}
    .mw-detail-hero{position:relative;height:200px;background:#0b0e14;overflow:hidden;}
    .mw-detail-hero img{width:100%;height:100%;object-fit:cover;display:block;opacity:.7;}
    .mw-detail-hero:after{content:'';position:absolute;inset:0;
      background:linear-gradient(180deg,rgba(14,19,27,.12) 45%,#0e131b);}
    .mw-detail-close{position:absolute;top:10px;right:12px;z-index:4;border:0;background:rgba(10,14,20,.7);
      color:#cdd5e2;width:32px;height:32px;border-radius:9px;font-size:19px;line-height:1;cursor:pointer;}
    .mw-detail-close:hover{background:rgba(35,48,69,.95);color:#fff;}
    .mw-detail-body{display:flex;gap:18px;padding:0 20px;margin-top:-92px;position:relative;z-index:2;}
    .mw-detail-poster{width:186px;flex-shrink:0;aspect-ratio:2/3;border-radius:10px;overflow:hidden;
      background:#151c27;border:1px solid #26303f;box-shadow:0 12px 30px rgba(0,0,0,.5);}
    .mw-detail-poster img{width:100%;height:100%;object-fit:cover;display:block;}
    .mw-detail-ph-empty{width:100%;height:100%;display:flex;align-items:center;justify-content:center;
      color:#5d6878;font-size:12px;text-align:center;padding:8px;line-height:1.7;}
    .mw-detail-main{flex:1;min-width:0;padding-top:96px;}
    .mw-detail-code{font-size:12.5px;letter-spacing:1px;color:#8fe3ff;font-weight:600;}
    .mw-detail-title{font-size:19px;font-weight:700;line-height:1.45;margin:6px 0 3px;color:#f2f5fa;word-break:break-word;}
    .mw-detail-ot{font-size:12.5px;color:#8b97a8;line-height:1.6;margin-bottom:10px;word-break:break-word;}
    .mw-detail-meta{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:4px 18px;
      font-size:12.5px;color:#c3cbd8;line-height:1.75;word-break:break-word;}
    .mw-detail-meta i{color:#7c8798;font-style:normal;}
    .mw-detail-h{margin:16px 20px 0;font-size:12.5px;color:#7c8798;letter-spacing:.5px;}
    .mw-detail-plot{margin:7px 20px 0;font-size:13px;line-height:1.85;color:#c9d2df;white-space:pre-wrap;word-break:break-word;}
    .mw-detail-tags{display:flex;flex-wrap:wrap;gap:6px;margin:10px 20px 0;}
    .mw-detail-tags span{background:#1a2432;border:1px solid #26303f;color:#a9b5c6;font-size:11.5px;
      padding:3px 9px;border-radius:999px;}
    .mw-detail-art{display:inline-block;width:150px;height:90px;overflow:hidden;border-radius:8px;border:1px solid #26303f;}
    .mw-detail-art img{width:100%;height:100%;object-fit:cover;display:block;}
    .mw-detail-acts{display:flex;flex-wrap:wrap;gap:8px;padding:16px 20px 18px;}
    .mw-more{display:inline-block;margin-top:7px;background:transparent;border:1px solid #2a3446;color:#8fa0b8;
      font-size:11.5px;padding:3px 9px;border-radius:7px;cursor:pointer;}
    .mw-more:hover{background:#1d2735;color:#dfe4ee;border-color:#3a4a63;}
    `);

    // ========================================================================
    // 10. 影片墙界面
    // ========================================================================
    function makePlaceholder(card, code) {
        let h = 0;
        for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) % 360;
        const wrap = document.createElement('div');
        wrap.className = 'mw-ph';
        wrap.style.background = `linear-gradient(135deg,hsl(${h},45%,26%),hsl(${(h + 55) % 360},50%,15%))`;
        wrap.textContent = code;
        $('.mw-poster', card).appendChild(wrap);
    }

    /** 卡片标题：优先译文 → 原标题 → 文件名 */
    function titleText(entry) {
        const rec = entry.rec;
        if (rec && CFG.titleTranslate && rec.tr) return rec.tr;
        if (rec && rec.t) return rec.t;
        return entry.item.name;
    }
    /** 文件自身的信息（大小 / 码率 / 观看时间）—— 全部来自 115 的列目录响应，零额外请求，
        所以即使这条还没刮到元数据也照样能显示。 */
    function fileInfoParts(entry) {
        const it = entry.item || {};
        const parts = [];
        if (CFG.showSize) {
            const sz = fmtVideoSize(it.size);
            if (sz) parts.push(sz);
        }
        if (CFG.showBitrate) {
            const br = fmtBitrate(bitrateOf(it));
            if (br) parts.push(br);
        }
        if (CFG.showWatch && it.watchedAt) parts.push(watchText(it.watchedAt));
        return parts;
    }

    /** 悬浮提示里的细节行：给全量信息（卡片一行放不下） */
    function fileDetailText(entry) {
        const it = entry.item || {};
        const bits = [];
        const sz = fmtVideoSize(it.size);
        if (sz) bits.push('大小 ' + sz);
        const dur = fmtDuration(it.dur);
        if (dur) bits.push('时长 ' + dur);
        const br = fmtBitrate(bitrateOf(it));
        if (br) bits.push('码率 ' + br);
        if (it.watchedAt) {
            bits.push('观看 ' + fmtTime(it.watchedAt));
            if (it.progress && it.dur) {
                bits.push('进度 ' + Math.min(100, Math.round(it.progress / it.dur * 100)) + '%');
            }
        }
        return bits.join(' · ');
    }

    function subText(entry) {
        const rec = entry.rec;
        const parts = [];
        if (rec && rec.r) parts.push('★ ' + rec.r);
        if (rec && rec.ac) parts.push(rec.ac);
        if (rec && rec.d) parts.push(rec.d);
        if (rec && rec.cat) parts.push(rec.cat);
        if (rec && rec.tr) parts.push('已翻译');
        // 大小/码率/观看时间是文件自带的，和刮削无关 —— 没刮到元数据时至少也把它们显示出来
        Array.prototype.push.apply(parts, fileInfoParts(entry));
        if (entry.code) parts.push(entry.code);
        if (!parts.length) parts.push(entry.code ? '等待刮削…' : '未识别番号');
        return parts.join(' · ');
    }
    /** 文件名行：开启翻译时原文标题也放进来，避免信息丢失 */
    function pathText(entry) {
        const bits = [];
        if (CFG.showPath && entry.item.path) bits.push(entry.item.path);
        if (CFG.showFileName) {
            const showRaw = !(CFG.titleTranslate && entry.rec && (entry.rec.tr || entry.rec.t));
            if (showRaw || entry.item.name !== titleText(entry)) bits.push(entry.item.name);
        }
        return bits.join(' · ');
    }

    /** 把已在显示的缩略图换成网盘原图。失败就保留缩略图，不影响可用性。 */
    async function upgradePosterToOriginal(img, pc, nameHint) {
        try {
            const obj = await hiResImage(pc, nameHint);
            if (!obj || !img.isConnected) return;
            const probe = new Image();
            probe.onload = () => { if (img.isConnected) img.setAttribute('src', obj); };
            probe.onerror = () => { console.warn('[影片墙] 海报原图解码失败，保留缩略图', pc); };
            probe.src = obj;
        } catch (e) {
            console.warn('[影片墙] 取海报原图失败（保留缩略图）：', pc, e && e.message);
        }
    }

    /** 卡片图「适配」：横版卡片里遇到竖图（竖版海报）时不裁切 —— 整张完整显示 + 同图模糊铺底。
        判定靠图片自身的宽高（naturalWidth / naturalHeight），跟图片来自哪条链路无关
        （115 缩略图直链 / 本地原图 / hub 代理 / DMM 都准），也不需要读任何元数据。 */
    function applyCardArtFit(box, img) {
        if (!box || !img) return;
        const w = img.naturalWidth || 0;
        const h = img.naturalHeight || 0;
        const vert = w > 0 && h > 0 && h > w * 1.06;   // 留 6% 容差：接近正方形的不算竖图
        if (!vert) { clearCardArtFit(box); return; }
        box.classList.add('has-vert');
        let back = $('.mw-blur', box);
        if (!back) {
            back = document.createElement('div');
            back.className = 'mw-blur';
            box.insertBefore(back, img);      // 必须垫在图片**下面**（DOM 更靠前）
        }
        const url = img.getAttribute('src') || '';
        if (url) back.style.backgroundImage = 'url("' + url.replace(/["\\]/g, '') + '")';
    }

    /** 恢复成普通「填满裁切」——占位图 / 取图失败 / 换成横图时用 */
    function clearCardArtFit(box) {
        if (!box) return;
        box.classList.remove('has-vert');
        const back = $('.mw-blur', box);
        if (back) back.remove();
    }

    async function applyPoster(card, rec) {
        const box = $('.mw-poster', card);
        const skel = $('.mw-skel', box);
        const giveUp = () => {
            if (skel) skel.remove();
            clearCardArtFit(box);
            const badge = $('.mw-badge', box);
            makePlaceholder(card, badge ? badge.textContent : '?');
        };
        // 有 pickcode 就还有救（能按 pickcode 现取原图），别急着判死
        if (!rec || (!rec.c && !rec.o)) { giveUp(); return; }
        let img = $('img', box);
        if (!img) {
            img = document.createElement('img');
            img.loading = 'lazy';
            img.onload = () => {
                const s = $('.mw-skel', box);
                if (s) s.remove();
                applyCardArtFit(box, img);   // 竖版海报 → 完整显示 + 模糊铺底（横版卡片专用）
                img.classList.add('ready');
            };
            img.onerror = () => {
                const raw = img.dataset.raw || '';
                // hub 取图失败 → 退回直连原图（DMM / jdbstatic 允许外站 referer）
                if (raw && img.getAttribute('src') !== raw) { img.setAttribute('src', raw); return; }
                const s = $('.mw-skel', box);
                if (s) s.remove();
                clearCardArtFit(box);
                img.remove();
                const badge = $('.mw-badge', box);
                makePlaceholder(card, badge ? badge.textContent : '?');
            };
            img.dataset.raw = rec.c || '';
            box.insertBefore(img, box.firstChild);
            const srcTag = document.createElement('div');
            srcTag.className = 'mw-src';
            srcTag.textContent = rec.src === 'sidecar' ? '网盘'
                : (rec.src === 'hub' ? 'Hub'
                    : (rec.src === 'dmm' ? 'DMM' : (rec.src === 'javdb' ? 'JavDB' : '')));
            if (srcTag.textContent) box.appendChild(srcTag);
        }
        if (!img.getAttribute('src')) {
            let src = '';
            let isLocalOriginal = false;
            // ① **本地已缓存的原图**（IndexedDB）—— 秒出，而且跟会过期的签名直链无关。
            //    重开影片墙走的常态就是这条。
            if (rec.o && CFG.hiResPoster) {
                src = await localImageUrl(rec.o, rec.on);
                isLocalOriginal = !!src;
            }
            // ② sidecar 缩略图（115 签名直链，只有**刚从网盘列回来的**那批才有）
            //    → hub 代理 / DMM 直链
            if (!src) src = await coverSrc(rec);
            if (!src) src = rec.c || '';
            if (src) {
                img.setAttribute('src', src);
                if (isLocalOriginal) img.dataset.hiRes = '1';    // 已经是原图了，不用再升级
            } else if (!rec.o || !CFG.hiResPoster) {
                // 既没有现成图、也没有原图这条路可走 → 直接占位，别让骨架一直转
                img.remove();
                giveUp();
                return;
            }
        }
        // 换成网盘里的海报原图 —— 115 的缩略图直链最大只到 200px，卡片一大就糊
        if (rec.o && CFG.hiResPoster && !img.dataset.hiRes) {
            img.dataset.hiRes = '1';
            upgradePosterToOriginal(img, rec.o, rec.on);
        }
        if (rec.tr && CFG.titleTranslate && !$('.mw-tr', box)) {
            const tag = document.createElement('span');
            tag.className = 'mw-tr';
            tag.textContent = rec.tg === 'zh-TW' ? '繁' : '译';
            box.appendChild(tag);
        }
    }

    function fillCard(card, entry) {
        const t = $('.mw-title', card);
        const s = $('.mw-sub', card);
        const p = $('.mw-path', card);
        if (t) t.textContent = titleText(entry);
        if (s) s.textContent = subText(entry);
        if (p) {
            const txt = pathText(entry);
            p.textContent = txt;
            p.style.display = txt ? '' : 'none';
        }
        card.title = [entry.code, entry.item.name, entry.rec && entry.rec.t, fileDetailText(entry)]
            .filter(Boolean).join('\n') + '\n（点「详情」看完整刮削信息）';
    }

    // ========================================================================
    // 10b. 影片详情面板
    //   以前卡片只把「评分/演员/日期/分类」塞进一行的副标题里，NFO 里解析出来的
    //   剧情简介、标签、原名、厂牌、系列、导演、时长、分级全都没有地方显示 ——
    //   所以这里按 hub 详情抽屉的字段铺开一份。只读，不改任何数据。
    // ========================================================================

    /** 详情面板的信息行。**只放有值的** —— 缺的字段不占位，免得一片「—」。 */
    function detailMetaRows(entry) {
        const rec = entry.rec || {};
        const it = entry.item || {};
        const rows = [];
        const add = (label, val) => {
            const v = String(val == null ? '' : val).trim();
            if (v) rows.push([label, v]);
        };
        add('演员', rec.ac);
        add('厂牌', rec.st);
        if (String(rec.pub || '').trim() && rec.pub !== rec.st) add('发行', rec.pub);
        add('系列', rec.ser);
        add('导演', rec.dir);
        add('发行日期', rec.d);
        add('年份', rec.yr);
        add('分类', rec.cat);
        if (rec.rt) {
            const t = String(rec.rt).trim();
            add('时长', /分|min/i.test(t) ? t : t + ' 分钟');
        }
        add('分级', rec.mpa);
        add('国家', rec.cty);
        if (rec.r) add('评分', rec.r);
        add('数据来源', rec.ms || (rec.src === 'hub' ? 'hub 数据库'
            : (rec.src === 'sidecar' ? '网盘产物（NFO）' : '')));
        // 下面这些来自 115 的列目录响应（零额外请求）—— 就算没刮到元数据也照样有值
        add('文件大小', fmtVideoSize(it.size));
        add('视频时长', fmtDuration(it.dur));
        add('码率', fmtBitrate(bitrateOf(it)));
        if (it.watchedAt) {
            add('观看时间', fmtTime(it.watchedAt));
            if (it.progress && it.dur) add('观看进度', Math.min(100, Math.round(it.progress / it.dur * 100)) + '%');
        }
        add('文件名', it.name);
        add('所在路径', it.path);
        return rows;
    }

    /** 详情面板的 HTML。字段与 hub 的详情抽屉对齐（那是参照物）。 */
    function renderDetailHtml(entry) {
        const rec = entry.rec || {};
        const it = entry.item || {};
        const code = entry.code || rec.nnum || '';
        const title = titleText(entry);
        // 海报优先取竖版（详情面板是 2:3 的框，横版会被裁得很难看）
        const poster = sidecarImage(entry, ['poster', 'thumb', 'fanart']) || rec.c || '';
        // 背景大图：hub 的 fanart（要异步走代理）→ sidecar 的 fanart → 退回海报
        const heroRaw = rec.fan || sidecarImage(entry, ['fanart', 'thumb', 'poster']) || poster;
        const rows = detailMetaRows(entry);
        const tags = Array.isArray(rec.tags) ? rec.tags.slice(0, 30) : [];
        const art = Array.isArray(rec.fans) ? rec.fans.slice(0, 12) : [];

        let html = '';
        if (heroRaw) {
            html += '<div class="mw-detail-hero"><img data-art="' + escHtml(heroRaw) + '" src="' +
                escHtml(heroRaw) + '" alt="" referrerpolicy="no-referrer"></div>';
        }
        html += '<div class="mw-detail-body">';
        html += '<div class="mw-detail-poster">' + (poster
            ? '<img src="' + escHtml(poster) + '" alt="" referrerpolicy="no-referrer">'
            : '<div class="mw-detail-ph-empty">' + (code ? escHtml(code) + '<br>无海报' : '无海报') + '</div>') + '</div>';
        html += '<div class="mw-detail-main">';
        if (code) html += '<div class="mw-detail-code">' + escHtml(code) + '</div>';
        html += '<div class="mw-detail-title">' + escHtml(title || '(未命名)') + '</div>';
        if (rec.ot && rec.ot !== title) html += '<div class="mw-detail-ot">原名：' + escHtml(rec.ot) + '</div>';
        if (rec.tagl) html += '<div class="mw-detail-ot">' + escHtml(rec.tagl) + '</div>';
        if (rows.length) {
            html += '<div class="mw-detail-meta">' + rows.map((r) =>
                '<div><i>' + escHtml(r[0]) + '：</i>' + escHtml(r[1]) + '</div>').join('') + '</div>';
        }
        html += '</div></div>';

        if (rec.plot) {
            html += '<div class="mw-detail-h">剧情简介</div><div class="mw-detail-plot">' + escHtml(rec.plot) + '</div>';
        }
        if (tags.length) {
            html += '<div class="mw-detail-h">标签</div><div class="mw-detail-tags">' +
                tags.map((t) => '<span>' + escHtml(t) + '</span>').join('') + '</div>';
        }
        if (art.length) {
            html += '<div class="mw-detail-h">剧照</div><div class="mw-detail-tags">' + art.map((u) =>
                '<a href="' + escHtml(u) + '" target="_blank" rel="noreferrer" class="mw-detail-art">' +
                '<img data-art="' + escHtml(u) + '" src="' + escHtml(u) + '" alt="" referrerpolicy="no-referrer"></a>'
            ).join('') + '</div>';
        }
        if (rec.trl) {
            html += '<div class="mw-detail-h">预告片</div><div class="mw-detail-plot">' +
                '<a href="' + escHtml(rec.trl) + '" target="_blank" rel="noreferrer" style="color:#8fe3ff;">' +
                escHtml(rec.trl) + '</a></div>';
        }
        html += '<div class="mw-detail-acts">' +
            (it.pc ? '<button class="mw-btn primary" data-mwdetail="play">播放</button>' : '') +
            (code ? '<button class="mw-btn" data-mwdetail="code">复制番号</button>' : '') +
            '<button class="mw-btn" data-mwdetail="title">复制标题</button>' +
            '<button class="mw-btn" data-mwdetail="name">复制文件名</button>' +
            (it.path ? '<button class="mw-btn" data-mwdetail="path">复制路径</button>' : '') +
            (it.cid ? '<button class="mw-btn" data-mwdetail="folder" title="在 115 文件列表里打开所在目录">打开所在目录</button>' : '') +
            '</div>';
        return html;
    }

    /** hub 侧的图片地址（DMM / jdbstatic）在浏览器里直连多半 403，
        得走 hub 的 /api/avwall/image 代理（带鉴权头，所以只能异步取 blob）。
        拿不到就保留原地址 —— 直连能成就算赚到，失败也只是这张图不显示。 */
    async function hydrateDetailArt(ov) {
        if (!(hubConfigured() && CFG.hubImageProxy)) return;
        const imgs = $$('img[data-art]', ov);
        for (const img of imgs) {
            const raw = img.getAttribute('data-art');
            if (!raw || /^https?:\/\/([^/]*\.)?115\.com/.test(raw)) continue;
            try {
                const url = await coverURL({ c: raw });
                if (url && url !== raw && img.isConnected) img.setAttribute('src', url);
            } catch (e) { /* 这张图显示不出来而已，不影响面板 */ }
        }
    }

    let detailEntry = null;

    function closeDetail() {
        const ov = document.getElementById('mw-detail-ov');
        if (ov) ov.remove();
        detailEntry = null;
    }

    /** 打开详情面板。只读：不改 rec、不写缓存。 */
    function openDetail(entry) {
        if (!entry) return;
        closeDetail();
        const ov = document.createElement('div');
        ov.id = 'mw-detail-ov';
        ov.innerHTML = '<div class="mw-detail-panel">' +
            '<button class="mw-detail-close" title="关闭（Esc）">×</button>' +
            renderDetailHtml(entry) + '</div>';
        ov.addEventListener('click', (ev) => { if (ev.target === ov) closeDetail(); });
        $('.mw-detail-close', ov).addEventListener('click', closeDetail);
        $$('[data-mwdetail]', ov).forEach((btn) => {
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const act = btn.getAttribute('data-mwdetail');
                const it = entry.item || {};
                const code = entry.code || (entry.rec && entry.rec.nnum) || '';
                if (act === 'play') {
                    if (!it.pc) { toast('这个文件没有 pickcode，无法直接播放', 'error', 3200); return; }
                    if (CFG.listOpenNewTab) window.open(PLAYER_URL(it.pc), '_blank');
                    else location.href = PLAYER_URL(it.pc);
                    return;
                }
                if (act === 'folder') {
                    window.open('https://115.com/?cid=' + encodeURIComponent(it.cid || '') + '&offset=0&tab=file', '_blank');
                    return;
                }
                let text = '';
                if (act === 'code') text = code;
                else if (act === 'title') text = (entry.rec && (entry.rec.tr || entry.rec.t)) || titleText(entry);
                else if (act === 'name') text = String(it.name || '');
                else if (act === 'path') text = String(it.path || '');
                if (!text) { toast('这一项没有内容可复制', 'error', 2400); return; }
                try { GM_setClipboard(text); toast('已复制', 'success', 1500); }
                catch (e) { toast('复制失败：' + (e && e.message), 'error', 3200); }
            });
        });
        document.body.appendChild(ov);
        detailEntry = entry;
        void hydrateDetailArt(ov);
    }

    /** Esc 关详情（挂在 document 上，只注册一次） */
    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && document.getElementById('mw-detail-ov')) closeDetail();
    });

    function enqueuePoster(entry, card) {
        state.posterQueue.push({ entry: entry, card: card });
        pumpPosterQueue();
    }
    function pumpPosterQueue() {
        const limit = Math.max(1, Math.min(8, Number(CFG.concurrency) || 4));
        while (state.posterRunning < limit && state.posterQueue.length) {
            const job = state.posterQueue.shift();
            state.posterRunning++;
            resolvePoster(job.entry.code, null, job.entry)
                .then((rec) => {
                    job.entry.rec = rec;
                    if (job.card.isConnected) { applyPoster(job.card, rec); fillCard(job.card, job.entry); }
                    scheduleResort();   // 按演员/类型/评分排序时，新元数据到手就收敛一次顺序
                })
                .catch(() => { })
                .finally(() => {
                    state.posterRunning--;
                    setTimeout(pumpPosterQueue, 100);
                });
        }
    }

    function ensureObserver() {
        if (posterObserver) return posterObserver;
        if (typeof IntersectionObserver === 'undefined') return null;
        posterObserver = new IntersectionObserver((entries) => {
            entries.forEach((en) => {
                if (!en.isIntersecting) return;
                const card = en.target;
                posterObserver.unobserve(card);
                const entry = state.filtered[Number(card.dataset.idx)];
                const hasSc = !!(CFG.preferSidecar && entry && entry.sc);
                // 没番号但有 sidecar（NFO 里有片名/演员）也要读，不能因为没番号就跳过
                if (!entry || (!entry.code && !hasSc)) return;
                const cached = entry.code ? cacheGet(entry.code) : null;
                // 有 sidecar 时即使缓存里有旧结果也要重跑：sidecar 是网盘文件，零抓取且更新
                if (cached && !hasSc) {
                    entry.rec = cached;
                    applyPoster(card, cached);
                    fillCard(card, entry);
                    if (CFG.autoScrape && (!cached.c || (CFG.titleTranslate && !cached.t && CFG.fetchMeta && !cached.miss))) {
                        enqueuePoster(entry, card);
                    }
                } else if (CFG.autoScrape || hasSc) {
                    enqueuePoster(entry, card);
                }
            });
        }, { rootMargin: '400px 0px' });
        return posterObserver;
    }

    function buildCard(entry, idx) {
        const card = document.createElement('article');
        card.className = 'mw-card';
        card.dataset.code = entry.code || '';
        card.dataset.idx = String(idx);

        // 勾选框：点它只切换选中状态，不打开播放器
        const pick = document.createElement('label');
        pick.className = 'mw-pick';
        pick.title = '选中（可批量移动 / 删除，连带海报与 NFO）';
        const pickBox = document.createElement('input');
        pickBox.type = 'checkbox';
        pickBox.className = 'mw-pick-box';
        pickBox.checked = !!state.selected[entry.uid];
        pickBox.addEventListener('click', (ev) => ev.stopPropagation());
        pickBox.addEventListener('change', (ev) => {
            ev.stopPropagation();
            togglePick(entry.uid, pickBox.checked);
        });
        pick.appendChild(pickBox);
        card.appendChild(pick);
        if (state.selected[entry.uid]) card.classList.add('is-picked');

        const poster = document.createElement('div');
        poster.className = 'mw-poster';
        const skel = document.createElement('div');
        skel.className = 'mw-skel';
        poster.appendChild(skel);
        if (entry.code) {
            const badge = document.createElement('span');
            badge.className = 'mw-badge';
            badge.textContent = entry.code;
            poster.appendChild(badge);
        }
        card.appendChild(poster);

        const meta = document.createElement('div');
        meta.className = 'mw-meta';
        const title = document.createElement('div');
        title.className = 'mw-title';
        title.textContent = titleText(entry);
        const sub = document.createElement('div');
        sub.className = 'mw-sub';
        sub.textContent = subText(entry);
        meta.appendChild(title);
        meta.appendChild(sub);
        const path = document.createElement('div');
        path.className = 'mw-path';
        path.textContent = pathText(entry);
        if (!path.textContent) path.style.display = 'none';
        meta.appendChild(path);
        // 详情入口：卡片一行放不下剧情/标签/厂牌/系列/导演这些东西，
        // 点这里看全部（双击卡片同样有效，单击仍然是直接播放）。
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'mw-more';
        more.textContent = '详情 ›';
        more.title = '查看全部刮削信息（也可双击卡片）';
        more.addEventListener('click', (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            openDetail(entry);
        });
        meta.appendChild(more);
        card.appendChild(meta);

        if (CFG.listPreviewQuick) {
            const acts = document.createElement('div');
            acts.className = 'mw-acts';
            const mkBtn = (label, fn) => {
                const b = document.createElement('button');
                b.textContent = label;
                b.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); fn(); });
                return b;
            };
            acts.appendChild(mkBtn('详情', () => openDetail(entry)));
            if (entry.code) {
                acts.appendChild(mkBtn('复制番号', () => { try { GM_setClipboard(entry.code); toast('已复制 ' + entry.code, 'success', 1500); } catch (e) { } }));
                acts.appendChild(mkBtn('重抓', () => {
                    delete posterCache[entry.code];
                    markPosterDirty();
                    hubItemsCache.ts = 0;
                    entry.rec = null;
                    entry.hub = false;
                    const box = $('.mw-poster', card);
                    const old = $('img', box);
                    if (old) old.remove();
                    clearCardArtFit(box);
                    $$('.mw-ph', box).forEach(n => n.remove());
                    $$('.mw-src', box).forEach(n => n.remove());
                    $$('.mw-tr', box).forEach(n => n.remove());
                    if (!$('.mw-skel', box)) {
                        const s = document.createElement('div');
                        s.className = 'mw-skel';
                        box.insertBefore(s, box.firstChild);
                    }
                    enqueuePoster(entry, card);
                }));
            }
            acts.appendChild(mkBtn('复制文件名', () => { try { GM_setClipboard(entry.item.name); toast('已复制文件名', 'success', 1500); } catch (e) { } }));
            acts.appendChild(mkBtn('复制译名', () => {
                const rec = entry.rec;
                const txt = (rec && (rec.tr || rec.t)) || titleText(entry);
                try { GM_setClipboard(txt); toast('已复制标题', 'success', 1500); } catch (e) { }
            }));
            card.appendChild(acts);
        }

        // 封面悬浮大图
        if (CFG.coverHoverPreview) {
            card.addEventListener('mouseenter', () => showHover(entry, card));
            card.addEventListener('mouseleave', hideHover);
        }

        card.addEventListener('click', (ev) => {
            // 勾选框 / 悬浮操作按钮 / 「详情」按钮的点击不当作「打开播放」
            if (ev.target && ev.target.closest && ev.target.closest('.mw-pick, .mw-acts, .mw-more')) return;
            if (!entry.item.pc) { toast('这个文件没有 pickcode，无法直接播放，请在文件列表里打开', 'error', 3500); return; }
            if (CFG.listOpenNewTab) window.open(PLAYER_URL(entry.item.pc), '_blank');
            else location.href = PLAYER_URL(entry.item.pc);
        });

        const scPoster = !!(CFG.preferSidecar && entry.sc && entry.rec && entry.rec.c);
        if (!entry.code && !scPoster) {
            skel.remove();
            makePlaceholder(card, '无番号');
        } else {
            const obs = ensureObserver();
            if (obs) obs.observe(card);
            else {
                // 没有 IntersectionObserver（老浏览器 / 测试环境）时全量加载
                const hasSc = !!(CFG.preferSidecar && entry.sc);
                const cached = entry.rec || (entry.code ? cacheGet(entry.code) : null);
                if (cached && cached.c) { entry.rec = cached; applyPoster(card, cached); fillCard(card, entry); }
                // 有 sidecar 时也要走一次解析：海报虽然已经贴上了，但标题/演员在 NFO 里
                if (hasSc || (!cached && CFG.autoScrape)) enqueuePoster(entry, card);
            }
        }
        return card;
    }

    function showHover(entry, card) {
        if (!CFG.coverHoverPreview) return;
        const rec = entry.rec || (entry.code ? cacheGet(entry.code) : null);
        if (!rec || !rec.c) return;
        let box = document.getElementById('mw-hover');
        if (!box) {
            box = document.createElement('div');
            box.id = 'mw-hover';
            box.innerHTML = '<img alt="">';
            document.body.appendChild(box);
        }
        const img = $('img', box);
        img.src = rec.c;
        box.style.display = 'block';
        positionHover(box, card);
    }
    function positionHover(box, card) {
        const r = card.getBoundingClientRect();
        const w = box.offsetWidth || 380;
        const h = box.offsetHeight || 260;
        let left = r.right + 14;
        if (left + w > window.innerWidth - 10) left = Math.max(10, r.left - w - 14);
        let top = r.top + r.height / 2 - h / 2;
        top = Math.max(10, Math.min(top, window.innerHeight - h - 10));
        box.style.left = left + 'px';
        box.style.top = top + 'px';
    }
    function hideHover() {
        const box = document.getElementById('mw-hover');
        if (box) box.style.display = 'none';
    }

    /* ---------------- 排序 ----------------
       元数据字段（演员 ac / 类型 cat / 评分 r）来自 sidecar 的 NFO 或本机 hub，
       两者都是异步补上的，所以「取不到值」是常态而不是异常 —— 一律排到末尾 */
    function entryMeta(entry, field) {
        const rec = entry.rec || (entry.code ? cacheGet(entry.code) : null) || {};
        if (field === 'actor') return String(rec.ac || '').trim();
        if (field === 'type') return String(rec.cat || '').trim();
        if (field === 'rating') return Number(rec.r) || 0;
        return '';
    }

    function codeAsc(a, b) {
        return String(a.code || 'zzz').localeCompare(String(b.code || 'zzz'));
    }

    /** 演员 / 类型：组内按名称升序（中文按本地序），名字相同的再按番号；没有值的沉到末尾 */
    function sortByMetaText(list, field) {
        return list.slice().sort((a, b) => {
            const va = entryMeta(a, field);
            const vb = entryMeta(b, field);
            if (!!va !== !!vb) return va ? -1 : 1;
            if (!va) return codeAsc(a, b);
            return String(va).localeCompare(String(vb), 'zh-Hans-CN') || codeAsc(a, b);
        });
    }

    /** 评分：高分在前；没有评分的沉到末尾（再按番号） */
    function sortByRating(list) {
        return list.slice().sort((a, b) => {
            const va = entryMeta(a, 'rating');
            const vb = entryMeta(b, 'rating');
            if (!!va !== !!vb) return va ? -1 : 1;
            return (vb - va) || codeAsc(a, b);
        });
    }

    /** 观看日期：最近看过的排前面；115 没记录播放时间的沉到末尾（组内按番号） */
    function sortByWatch(list) {
        return list.slice().sort((a, b) => {
            const va = Number(a.item.watchedAt) || 0;
            const vb = Number(b.item.watchedAt) || 0;
            if (!!va !== !!vb) return va ? -1 : 1;
            return (vb - va) || codeAsc(a, b);
        });
    }

    /** 洗牌用的散列（FNV-1a 变体，带种子） */
    function hashSeed(str, seed) {
        let h = (2166136261 ^ (Number(seed) || 0)) >>> 0;
        const s = String(str || '');
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    /** 随机排序：按「会话种子 + 条目 key」散列，好处是
        ① 同一次洗牌结果稳定 —— 切换排序再切回来、卡片原地重排都不会变顺序；
        ② 换一个种子就是全新一次洗牌，「换一批」按钮做的就是改 state.shuffleSeed。 */
    function sortByRandom(list) {
        const seed = state.shuffleSeed;
        // 种子输入带上番号：只用 fid 的话，同一批文件的 id 常常只差最后一位
        //（同一目录连续生成的 id、或测试里的 f1/f2…），hashSeed 出来的相对顺序会很集中，
        // 换一批几乎看不出变化。混进 key（番号）后每个文件都有足够区分度。
        const rk = (e) => (e.uid || e.key) + '|' + (e.code || '');
        return list.slice().sort((a, b) =>
            (hashSeed(rk(a), seed) - hashSeed(rk(b), seed)) || codeAsc(a, b));
    }

    function sortList(list, key) {
        if (key === 'name') return list.slice().sort((a, b) => a.item.name.localeCompare(b.item.name));
        if (key === 'path') {
            return list.slice().sort((a, b) =>
                (a.item.path || '').localeCompare(b.item.path || '') || a.item.name.localeCompare(b.item.name));
        }
        if (key === 'actor' || key === 'type') return sortByMetaText(list, key);
        if (key === 'rating') return sortByRating(list);
        if (key === 'watch') return sortByWatch(list);
        if (key === 'random') return sortByRandom(list);
        return list.slice().sort(codeAsc);
    }

    function currentList() {
        let list = state.items.filter((e) => !(CFG.hideNoCode && !e.code));
        if (state.keyword) {
            const kw = state.keyword.toLowerCase();
            list = list.filter((e) => {
                const rec = e.rec || {};
                return (e.code && e.code.toLowerCase().indexOf(kw) >= 0) ||
                    e.item.name.toLowerCase().indexOf(kw) >= 0 ||
                    (rec.tr && rec.tr.toLowerCase().indexOf(kw) >= 0) ||
                    (rec.t && rec.t.toLowerCase().indexOf(kw) >= 0);
            });
        }
        return sortList(list, state.sort);
    }

    /** 让网格里的卡片顺序与 state.filtered 一致，并回写 data-idx。
        appendChild 是移动已有节点（不重建），所以已加载的图不会重下、不会闪。 */
    function orderCardsInGrid() {
        const grid = $('#mw-grid');
        if (!grid) return 0;
        let n = 0;
        (state.filtered || []).forEach((e, i) => {
            const card = e._card;
            if (!card || !card.isConnected) return;
            card.dataset.idx = String(i);
            grid.appendChild(card);
            n++;
        });
        return n;
    }

    /** 补建卡片。max 是「本次最多新建几张」，默认一批 RENDER_BATCH；
        批量操作后摘掉 N 张时会传 N，好让一屏的卡片数量保持不变（不然会把剩下的全铺出来）。 */
    function renderMore(max) {
        const grid = $('#mw-grid');
        if (!grid) return;
        const list = state.filtered;
        const quota = Math.max(1, Number(max) || RENDER_BATCH);
        const frag = document.createDocumentFragment();
        let built = 0;
        // 不按「索引区间」而是按「还缺多少张卡」来建：重排之后索引会变，
        // 但已建好的卡片始终跟着条目走，不会漏卡片。
        for (let i = 0; i < list.length && built < quota; i++) {
            const e = list[i];
            if (e._card && e._card.isConnected) continue;
            const card = buildCard(e, i);
            e._card = card;
            frag.appendChild(card);
            built++;
        }
        grid.appendChild(frag);
        state.rendered = orderCardsInGrid();
        const more = $('#mw-loadmore');
        if (more) more.textContent = state.rendered < list.length ? `滚动加载更多…（${state.rendered}/${list.length}）` : (list.length ? `共 ${list.length} 部` : '');
    }

    /* 按演员/类型/评分排序时，元数据是随卡片读到才补上的 —— 所以排序要能「边读边收敛」。
       做法：每次有新的元数据落地就排一次队，防抖 1 秒后把**已经渲染出来的卡片原地重排**
       （appendChild 移动节点，不重建、不重下图），而不是整页重渲染（那会把滚动位置打回去）。 */
    let resortTimer = null;
    function scheduleResort() {
        if (!META_SORTS[state.sort]) return;
        if (resortTimer) return;
        resortTimer = setTimeout(() => {
            resortTimer = null;
            resortInPlace();
        }, 1000);
    }

    /** 原地重排：按当前排序键重算顺序，并把已渲染的卡片按新顺序挂回容器。
        与 renderAll 的区别是**不重建节点**（图不重下、滚动位置不跳），所以可以随时调用。 */
    function resortInPlace() {
        const grid = $('#mw-grid');
        if (!grid || !state.overlayOpen) return false;
        const before = (state.filtered || []).map((e) => e.uid || e.key).join('|');
        state.filtered = currentList();
        if (state.filtered.map((e) => e.uid || e.key).join('|') === before) return false;   // 顺序没变就不动 DOM
        state.rendered = orderCardsInGrid();
        updateStats();
        return true;
    }

    /* 按元数据排序需要「所有条目都有演员/类型/评分」，而卡片是懒加载的 ——
       选中这类排序时补一轮**只读 NFO** 的预取：读的是视频同目录的 sidecar，
       不抓任何外部站点；命中内存缓存的条目零请求。 */
    let metaPrefetching = false;
    function hasMeta(e) {
        const rec = e.rec || {};
        return !!(rec.ac || rec.cat || rec.r);
    }
    async function prefetchMetaForSort() {
        if (metaPrefetching) return 0;
        const todo = (state.items || []).filter((e) => e.sc && e.sc.nfo && !hasMeta(e));
        if (!todo.length) return 0;
        metaPrefetching = true;
        let filled = 0;
        try {
            for (let i = 0; i < todo.length; i += 6) {
                if (!state.overlayOpen || !META_SORTS[state.sort]) break;
                setBusy(true, `正在读取 NFO 元数据以便排序…（${Math.min(i + 6, todo.length)}/${todo.length}）`);
                await Promise.all(todo.slice(i, i + 6).map(async (e) => {
                    const parsed = await readEntryNfo(e);
                    if (!parsed) return;
                    const rec = Object.assign({}, e.rec || { src: 'sidecar', sc: true, ts: Date.now() });
                    rec.nfo = true;
                    if (!rec.t && isRealTitle(parsed.t, e.code, e.item && e.item.name)) rec.t = parsed.t;
                    if (!rec.ac && parsed.actorsText) rec.ac = parsed.actorsText;
                    if (!rec.cat && parsed.genre) rec.cat = parsed.genre;
                    if (!rec.r && parsed.rating) rec.r = parsed.rating;
                    if (!rec.d && parsed.release) rec.d = parsed.release;
                    e.rec = rec;
                    filled++;
                }));
                await new Promise((r) => setTimeout(r, 60));
            }
        } finally {
            metaPrefetching = false;
            setBusy(false);
        }
        resortInPlace();
        return filled;
    }

    /* ---------------- 把素材**实时存到本地** ----------------
       目标：本地是一份完整镜像 —— NFO 原文 + 解析结果 + 海报原图，全部落盘。
       好处：① 重开纯本地、零请求；② 数据在手边可以直接导出/给别的工具用；
             ③ 完全不依赖会过期的 115 签名直链（只靠 pickcode 取回一次，之后都走本地）。
       默认在列表装载后自动开跑（设置里可关），也可以手动触发/随时停止。
       只读视频同目录的 sidecar，不抓任何外部站点。 */

    const cacheSt = () => (state.caching || (state.caching = {
        running: false, stop: false, phase: '', nfoDone: 0, nfoTotal: 0,
        imgDone: 0, imgTotal: 0, failed: 0, startedAt: 0
    }));

    function cacheLocalProgress() {
        const st = cacheSt();
        const parts = [];
        if (st.nfoTotal) parts.push('片名 ' + (st.phase === 'nfo' ? st.nfoDone : st.nfoTotal) + '/' + st.nfoTotal);
        if (st.imgTotal) parts.push('海报 ' + st.imgDone + '/' + st.imgTotal);
        return '正在把素材实时存到本地…（' + (parts.join(' · ') || '准备中') + '）　点我停止';
    }

    /** 缓存任务的进度条：只写 #mw-busy，**不动 state.loading**，
        这样本地化跑着的时候用户照样能切目录 / 刷新 */
    function setCacheBar(text) {
        const el = $('#mw-busy');
        if (!el) return;
        if (text) {
            el.textContent = text;
            el.style.display = 'block';
            el.dataset.cache = '1';
        } else if (el.dataset.cache) {
            delete el.dataset.cache;
            el.textContent = '';
            el.style.display = 'none';
        }
    }

    function stopCacheLocal(silent) {
        const st = cacheSt();
        if (!st.running) return;
        st.stop = true;
        if (!silent) toast('已停止本地化（已经存下的都会保留）', 'info', 2600);
    }

    /** 把（本地已有的）NFO 字段合进 entry.rec，并刷新已经在屏幕上的卡片 */
    function applyCachedNfoToEntry(entry, parsed) {
        let nfo = parsed;
        if (!nfo) {
            const f = entry.sc && entry.sc.nfo;
            if (!f || !entry.item) return;
            nfo = nfoCacheGet(stripExt(entry.item.name), f);
        }
        if (!nfo) return;
        const rec = Object.assign({}, entry.rec || { src: 'sidecar', sc: true, ts: Date.now() });
        applyNfoToRec(rec, nfo, entry.code, entry.item && entry.item.name);
        entry.rec = rec;
        if (entry._card && entry._card.isConnected) {
            applyPoster(entry._card, rec);
            fillCard(entry._card, entry);
        }
    }

    /** 把一条 NFO 完整存到本地：解析结果（GM）+ **原文**（IndexedDB）。
        两样都已在本地时返回 false 且**零请求**。 */
    async function cacheNfoLocally(entry) {
        const file = entry && entry.sc && entry.sc.nfo;
        if (!file || !file.pc || !entry.item) return false;
        const key = stripExt(entry.item.name);
        const parsedOk = nfoCacheGet(key, file) !== undefined;
        const rawOk = !!(await rawNfoGet(key));
        if (parsedOk && rawOk) { applyCachedNfoToEntry(entry); return false; }
        const parsed = await readEntryNfo(entry, true);      // force：顺带把原文也落了
        if (parsed) applyCachedNfoToEntry(entry, parsed);
        return true;
    }

    /** NFO 阶段：列表里所有 NFO 读一遍并落本地（并发 4）。返回本次新存的条数 */
    async function warmNfoCache() {
        const st = cacheSt();
        const todo = (state.items || []).filter((e) => e.sc && e.sc.nfo && e.sc.nfo.pc && e.item);
        st.nfoTotal = todo.length;
        st.nfoDone = 0;
        st.phase = 'nfo';
        let stored = 0;
        for (let i = 0; i < todo.length; i += 4) {
            if (st.stop) break;
            await Promise.all(todo.slice(i, i + 4).map(async (e) => {
                try { if (await cacheNfoLocally(e)) stored++; } catch (err) { st.failed++; }
            }));
            st.nfoDone = Math.min(i + 4, todo.length);
            setCacheBar(cacheLocalProgress());
            updateStats();
            await new Promise((r) => setTimeout(r, 40));
        }
        flushNfoStore();
        await refreshRawNfoCount();
        return stored;
    }

    /** 海报阶段：列表里所有海报原图取回并落本地（并发 3）。已在本地的一张都不重下 */
    async function warmImgCache() {
        const st = cacheSt();
        const todo = (state.items || []).filter((e) => e.rec && e.rec.o);
        st.imgTotal = todo.length;
        st.imgDone = 0;
        st.phase = 'img';
        let stored = 0;
        for (let i = 0; i < todo.length; i += 3) {
            if (st.stop) break;
            await Promise.all(todo.slice(i, i + 3).map(async (e) => {
                const pc = e.rec.o;
                const hint = e.rec.on;
                try {
                    if (await imgCacheGet(pc, hint)) return;   // 已在本地 → 零请求
                    await hiResImage(pc, hint);
                    stored++;
                } catch (err) { st.failed++; }
            }));
            st.imgDone = Math.min(i + 3, todo.length);
            setCacheBar(cacheLocalProgress());
            updateStats();
            await new Promise((r) => setTimeout(r, 40));
        }
        if (imgMetaDirty) { imgMetaDirty = false; saveJson(STORE_IMG_META, imgMeta); }
        return stored;
    }

    /** 全量本地化：NFO（含原文）+ 海报原图 */
    async function cacheAllLocal(opts) {
        const o = opts || {};
        const st = cacheSt();
        if (st.running) return { nfo: 0, img: 0, skipped: true };
        if (!(state.items || []).length) return { nfo: 0, img: 0, skipped: true };
        if (!CFG.imgCache || !CFG.localFirst) {
            if (!o.silent) toast('需要先打开「本地缓存优先」和「海报原图缓存到本地」', 'info', 3400);
            return { nfo: 0, img: 0, skipped: true };
        }
        st.running = true;
        st.stop = false;
        st.failed = 0;
        st.startedAt = Date.now();
        let nfo = 0;
        let img = 0;
        try {
            nfo = await warmNfoCache();
            img = await warmImgCache();
            const nf = nfoCacheStats();
            if (!o.silent) {
                toast('已存到本地：片名 ' + nf.hit + ' 条 · NFO 原文 ' + rawNfoCount + ' 份 · 海报 ' +
                    imgCacheCount() + ' 张（' + fmtBytes(imgCacheBytes()) + '）' +
                    (st.failed ? ' · ' + st.failed + ' 项失败' : '') +
                    (st.stop ? '（已停止，已存下的都保留）' : ''), 'success', 4600);
            }
        } catch (e) {
            if (!o.silent) toast('本地化中断：' + e.message, 'error', 4000);
        } finally {
            st.running = false;
            st.phase = '';
            setCacheBar('');
            updateStats();
        }
        return { nfo: nfo, img: img };
    }

    /** 列表装载完之后自动开跑（默认开；设置里可关） */
    function maybeAutoCacheLocal() {
        if (!CFG.autoCacheLocal || !CFG.localFirst || !CFG.imgCache) return;
        if (!state.overlayOpen) return;
        const st = cacheSt();
        if (st.running) return;
        st.stop = false;
        setTimeout(() => {
            if (!state.overlayOpen) return;
            if (cacheSt().running) return;
            cacheAllLocal({ silent: true });
        }, 900);        // 让首屏先渲染完，别抢带宽
    }

    function renderAll() {
        const grid = $('#mw-grid');
        if (!grid) return;
        hideHover();
        grid.innerHTML = '';
        (state.items || []).forEach((e) => { e._card = null; });   // 旧卡片节点已丢弃，别留引用
        // 列表换过（切目录 / 筛选 / 刷新 / 批量操作后）→ 把已经不在列表里的勾选清掉
        const alive = Object.create(null);
        (state.items || []).forEach((e) => { if (state.selected[e.uid]) alive[e.uid] = true; });
        state.selected = alive;
        state.filtered = currentList();
        state.rendered = 0;
        applyLayout();
        if (!state.filtered.length) {
            grid.innerHTML = '<div class="mw-empty">没有可展示的影片<br>换个目录，或检查「库根目录」设置</div>';
            const more0 = $('#mw-loadmore');
            if (more0) more0.textContent = '';
            updateStats();
            renderOpsBar();
            return;
        }
        renderMore();
        updateStats();
        renderOpsBar();
    }

    function applyLayout() {
        const grid = $('#mw-grid');
        if (!grid) return;
        const cols = Number(CFG.columns) || 0;
        grid.classList.toggle('mw-auto', cols === 0);
        grid.classList.toggle('mw-masonry', !!CFG.masonry);
        grid.style.setProperty('--mw-card-w', (Number(CFG.cardW) || 320) + 'px');
        if (cols > 0) {
            grid.style.setProperty('--mw-cols', String(cols));
            grid.style.setProperty('--mw-cols-n', String(cols));
        } else {
            grid.style.removeProperty('--mw-cols');
            grid.style.setProperty('--mw-cols-n', '5');
        }
        grid.style.setProperty('--mw-maxw', (Number(CFG.pageWidth) || 100) + '%');
        const ov = $('#mw-overlay');
        if (ov) {
            ov.classList.toggle('mw-portrait', !!CFG.portraitCards);
            ov.classList.toggle('mw-fx', !!CFG.cardFx);
        }
    }

    function updateStats() {
        const el = $('#mw-stats');
        if (!el) return;
        const total = state.items.length;
        const coded = state.items.filter(e => e.code).length;
        const translated = state.items.filter(e => e.rec && e.rec.tr).length;
        const scHit = sidecarHitCount(state.items);
        const scNfo = state.items.filter(e => e.sc && e.sc.nfo).length;
        const nfoRead = state.items.filter(e => e.rec && e.rec.nfo).length;
        const modeText = state.mode === 'dir' ? '当前文件夹' : ('全库：' + (state.rootName || state.rootCid || '未设置'));
        const nstat = nfoCacheStats();
        const localHits = nfoHitLocal + imgHitLocal;
        const netHits = nfoHitNet + imgHitNet;
        const cst = cacheSt();
        // 本地缓存栏：位置 + 存量 + 本次省掉了多少往返 —— v3.9/v3.10 的核心卖点
        const cacheBits = [];
        cacheBits.push(state.usedCache
            ? '<b style="color:#4ade80">本地秒开</b>'
            : '<b style="color:#f59e0b">联网读取</b>');
        cacheBits.push('片名 ' + nstat.hit + ' · NFO  ' + rawNfoCount + ' · 海报 ' + imgCacheCount() +
            '（' + fmtBytes(imgCacheBytes()) + '）');
        if (localHits || netHits) cacheBits.push('本次 本地命中 ' + localHits + ' · 联网 ' + netHits);
        if (cst.running) {
            cacheBits.push('<b style="color:#8fe3ff">正在存到本地 ' +
                (cst.phase === 'nfo'
                    ? '片名 ' + cst.nfoDone + '/' + cst.nfoTotal
                    : '海报 ' + cst.imgDone + '/' + cst.imgTotal) + '</b>');
        }
        const whereTip = activeBackend() === 'folder'
            ? ('本机文件夹「' + ((dirHandle && dirHandle.name) || '') + '」（磁盘上的真实文件）')
            : (folderMode()
                ? ('本机文件夹当前用不上：' + folderBlockReason() + '，临时用浏览器本地')
                : '浏览器本地 IndexedDB');
        const cacheSpan = '<span title="素材存在 ' + whereTip +
            '。这是重开秒开的关键：片名 / NFO 原文 / 海报原图都在本地，打开时不再去网盘重读">' +
            '本地缓存（' + (activeBackend() === 'folder' ? '文件夹' : '浏览器') + '）：' + cacheBits.join(' · ') + '</span>';
        // 注：原来这里显示「文件夹缓存 已写入/未写入」—— 该功能已停用（115 封禁脚本直传），
        // 持久化改看「网盘素材 / NFO」两个计数即可，故这一栏整块去掉。
        el.innerHTML = `<span>模式：<b style="color:#c8d0de">${modeText}</b></span>` +
            `<span>影片：<b style="color:#c8d0de">${total}</b></span>` +
            `<span>番号：<b style="color:#8fe3ff">${coded}</b></span>` +
            `<span>译文：<b style="color:#8fe3ff">${translated}</b></span>` +
            `<span title="视频同目录里已找到海报/NFO 的条数（由 hub 的「导出媒体文件」生成）">网盘素材：<b style="color:${scHit ? '#4ade80' : '#7c8798'}">${scHit}/${total}</b></span>` +
            `<span title="NFO 已成功读取并解析的条数（读不到片名时看这里；为 0 说明 NFO 读取链路被挡住了）">NFO：<b style="color:${nfoRead ? '#4ade80' : (scNfo ? '#f59e0b' : '#7c8798')}">${nfoRead}/${scNfo || 0}</b></span>` +
            cacheSpan +
            `<span>显示：<b style="color:#c8d0de">${state.filtered.length}</b></span>` +
            (state.truncated ? '<span style="color:#f59e0b">已达扫描上限，结果可能不完整</span>' : '');
    }

    // ========================================================================
    // 11. 数据装载
    // ========================================================================
    function toEntries(files, sidecarMap) {
        const map = sidecarMap || Object.create(null);
        return files.map((f) => {
            const code = extractCode(f.name);
            const sc = map[stripExt(f.name)] || null;
            // key：缓存键，语义上「这是哪部片子」→ 有番号用番号，没有就用 fid。
            //   它**不唯一**：同番号的多个版本（`ABF-208.mp4` 与 `ABF-208【中文字幕】.mp4`）、
            //   或全库模式下不同目录里的同番号影片，都会算出同一个 key。海报缓存按它查，必须保持这样。
            const key = code || ('f' + f.fid);
            // uid：**唯一标识**，只给「勾选 / 摘除 / 定位卡片」这些必须区分到具体文件的地方用。
            //   115 的 fid 唯一且稳定（改名、搬家都不变）。
            //   ⚠️ 曾经这里只有 key，于是勾选一部等于把同番号的所有版本一起勾上 —— 删除时连坐，
            //   用户看到的现象就是「删一个版本，另一个版本也没了」。
            const uid = String(f.fid);
            let rec = null;
            if (CFG.preferSidecar && sc) rec = sidecarRec({ sc: sc });
            // 网盘里有 sidecar 就先把海报贴上（115 缩略图直链，零请求）。
            // v3.9：片名/演员/评分如果**本地已有缓存**，这里同步就填上 —— 首屏直接出标题，
            //       连「卡片进视口 → 读 NFO」那次异步往返都省了（那正是重开慢的老路子）。
            //       注意 sidecarRec() 在「只有 NFO、没有海报」时返回 null，所以这里要能补建 rec。
            if (sc && sc.nfo && CFG.nfoCache && CFG.localFirst) {
                const cached = nfoCacheGet(stripExt(f.name), sc.nfo);
                if (cached) {
                    if (!rec) rec = { src: 'sidecar', sc: true, ts: Date.now() };
                    applyNfoToRec(rec, cached, code, f.name);
                    nfoHitLocal++;
                }
            }
            return { key: key, uid: uid, code: code, item: f, rec: rec, sc: sc };
        });
    }

    /** 从本机 hub 补数据；命中后再补译文 */
    async function hydrateFromHub(entries) {
        if (!CFG.hubEnabled || !hubConfigured() || !entries.length) return 0;
        setBusy(true, '正在读取本机 hub 的刮削结果…');
        let hit = 0;
        try { hit = await attachHubData(entries, true); } catch (e) { /* ignore */ }
        if (hit) {
            setBusy(true, `hub 命中 ${hit} 条，正在补标题译文…`);
            try { await translateEntries(entries); } catch (e) { /* ignore */ }
        }
        return hit;
    }

    /* 一个目录里一条 sidecar 都没有时提示一次 —— 否则用户会以为是功能坏了，
       实际是 hub 还没把海报/NFO 导出到这个目录。 */
    const sidecarHintDone = Object.create(null);
    function hintNoSidecar(cid, items) {
        if (!CFG.preferSidecar || !items || !items.length) return;
        if (items.some((e) => e.sc)) return;
        const key = String(cid || 'lib');
        if (sidecarHintDone[key]) return;
        sidecarHintDone[key] = true;
        toast('本目录没有网盘 sidecar（海报/NFO），正在用在线刮削兜底。想要秒出图：去 hub 影片墙页点一次「导出媒体文件」', 'info', 7000);
    }
    function sidecarHitCount(items) {
        return (items || []).filter((e) => e.sc).length;
    }

    /** 列表指纹：判断后台刷新拿到的数据跟缓存是不是同一批（相同就不动 DOM，免得白闪一下） */
    function listSignature(list) {
        let h = 2166136261;
        const arr = list || [];
        for (let i = 0; i < arr.length; i++) {
            const it = arr[i] || {};
            const s = String(it.fid || it.cid || '') + '|' + String(it.n || it.name || '') + '|' +
                String(it.s || it.size || '');
            for (let j = 0; j < s.length; j++) { h ^= s.charCodeAt(j); h = Math.imul(h, 16777619) >>> 0; }
        }
        return arr.length + ':' + h.toString(36);
    }

    /** 用一份「列目录原始响应」把墙渲染出来 —— 本地缓存与联网结果走同一条路 */
    async function applyDirList(cid, list, fromCache) {
        const norms = list.map(it => normalizeItem(it, cid, '')).filter(Boolean);
        const allFiles = norms.filter(n => n.kind === 'file');
        const files = allFiles.filter(n => VIDEO_EXT_RE.test(n.name));
        const scMap = CFG.preferSidecar ? buildSidecarMap(allFiles) : null;
        state.items = toEntries(files, scMap);
        state.truncated = false;
        state.usedCache = !!fromCache;
        hintNoSidecar(cid, state.items);
        renderAll();                                         // 先把墙铺出来，不等 hub
        const hit = await hydrateFromHub(state.items);
        if (hit) renderAll();
        maybeAutoCacheLocal();                               // 自动把素材实时存到本地
        if (fromCache) return;                               // 后台校验那条路不做 hub 扫描
        // hub 完全没这个目录的数据时，按需让 hub 扫一遍
        if (!hit && CFG.hubAutoScan && CFG.hubEnabled && hubConfigured() && state.items.some(e => e.code)) {
            setBusy(true, '正在让 hub 扫描当前目录…');
            try {
                const r = await hubScan(cid, false);
                if (r && r.ok !== false) {
                    hubItemsCache.ts = 0;
                    await hydrateFromHub(state.items);
                    renderAll();
                    toast(`hub 扫描完成：发现 ${r.found || 0} 个视频，识别出 ${r.parsed || 0} 个番号`, 'success', 4000);
                }
            } catch (e) { toast('hub 扫描失败：' + e.message, 'error', 5000); }
        }
    }

    /* v3.9：目录模式也走本地缓存。以前每进一个文件夹都要重新列一次目录（列目录是网络请求，
       115 偶尔还要几秒），来回切两次就明显卡。现在先用缓存铺墙，再后台校验。 */
    async function loadDirMode(force) {
        const cid = currentCid();
        state.curCid = cid;
        const key = STORE_DIR + cid;
        const cached = (force || !CFG.localFirst) ? null : loadJson(key, null);
        if (cached && cached.ts && cached.files) {
            await applyDirList(cid, cached.files, true);
            if (Date.now() - cached.ts < DIR_TTL_MS) {
                toast('已用本地缓存秒开（' + state.items.length + ' 部）', 'success', 2200);
                return;
            }
            toast('已用本地缓存秒开，正在后台校验目录…', 'info', 2400);
            refreshDirInBackground(cid, cached);
            return;
        }
        setBusy(true, '正在读取当前文件夹…');
        try {
            // 历史遗留的缓存 json（老的「写入当前文件夹」功能，已停用）读得到就当补充数据
            if (CFG.folderCache) await readFolderCache(cid, true);
            const list = await listDirAll(cid);
            // ⚠️ 存缓存前必须剥掉缩略图直链 —— 它是短时签名，过期后会变成「图片已过期」占位图
            saveDirCache(cid, {
                ts: Date.now(), cid: cid, sig: listSignature(list), files: stripThumbUrls(list)
            });
            await applyDirList(cid, list, false);
        } catch (e) {
            toast('读取失败：' + e.message, 'error', 4000);
        } finally { setBusy(false); }
    }

    /** 后台重新列一次目录：内容有变才重渲染 */
    async function refreshDirInBackground(cid, old) {
        if (state.bgRefreshing) return;
        state.bgRefreshing = true;
        try {
            const list = await listDirAll(cid);
            const sig = listSignature(list);
            // 不管变没变都先存回本地（列表可能有增删）；同样剥掉会过期的缩略图直链
            saveDirCache(cid, { ts: Date.now(), cid: cid, sig: sig, files: stripThumbUrls(list) });
            if (state.mode !== 'dir' || currentCid() !== cid) return;   // 用户已经切走了
            if (old && old.sig === sig) return;                        // 列表没变 → 不动 DOM
            await applyDirList(cid, list, false);
            toast('目录已在后台更新', 'success', 2200);
        } catch (e) {
            console.warn('[影片墙] 后台校验目录失败：', e && e.message);
        } finally { state.bgRefreshing = false; }
    }

    /* v3.9：全库模式改成「本地索引先出图，再后台重扫」。
       以前本地索引只有 30 分钟有效期，一过就**必须**把整个库重新递归扫一遍（每个目录一次请求），
       这才是「重开影片墙要等很久」的主因。现在不管索引多旧都先拿来铺墙，再在后台悄悄校验。 */
    async function loadLibMode(force) {
        const root = state.rootCid || currentCid();
        if (!root) { toast('未设置库根目录', 'error', 3000); return; }
        state.rootCid = root;
        const key = STORE_LIB + root;
        const cached = (force || !CFG.localFirst) ? null : loadJson(key, null);
        if (cached && cached.ts && cached.v === LIB_SCHEMA && cached.files) {
            // ① 先用本地索引把墙铺出来 —— 不管这份索引多旧
            state.items = toEntries(cached.files,
                CFG.preferSidecar ? buildSidecarMap(cached.sidecars || []) : null);
            state.truncated = !!cached.truncated;
            state.usedCache = true;
            hintNoSidecar('lib', state.items);
            renderAll();
            const hit = await hydrateFromHub(state.items);
            if (hit) renderAll();
            const ageMin = Math.round((Date.now() - cached.ts) / 60000);
            const ttl = Math.max(0, Number(CFG.libCacheMin) || 0) * 60000;
            if (Date.now() - cached.ts < ttl) {
                toast('已用本地索引秒开（' + ageMin + ' 分钟前 · ' + state.items.length +
                    ' 部），需要最新数据点「刷新」', 'success', 2600);
                return;
            }
            // ② 本地数据能用但可能过期 → 后台重扫，内容没变就完全不动 DOM
            toast('已用本地索引秒开' + (ageMin ? '（' + ageMin + ' 分钟前）' : '') + '，正在后台重扫…', 'info', 2600);
            refreshLibInBackground(key, root, cached);
            return;
        }
        await scanLibAndSave(key, root);
    }

    /** 全量重扫库索引（首次打开 / 用户点刷新 / 后台校验都走它） */
    async function scanLibAndSave(key, root) {
        setBusy(true, '正在递归扫描全库…');
        try {
            const r = await scanVideos(root, (dirs, files) => setBusy(true, `正在递归扫描…目录 ${dirs}·影片 ${files}`));
            state.items = toEntries(r.files, CFG.preferSidecar ? buildSidecarMap(r.sidecars) : null);
            state.truncated = r.truncated;
            state.usedCache = false;
            hintNoSidecar('lib', state.items);
            saveJson(key, {
                ts: Date.now(), v: LIB_SCHEMA, root: root, truncated: r.truncated,
                sig: listSignature(r.files),
                files: stripThumbUrls(r.files), sidecars: stripThumbUrls(r.sidecars)
            });
            renderAll();
            const hit = await hydrateFromHub(state.items);
            if (hit) renderAll();
            if (!hit && CFG.hubAutoScan && CFG.hubEnabled && hubConfigured() && state.items.some(e => e.code)) {
                setBusy(true, '正在让 hub 递归扫描库根目录（较慢）…');
                try { await hubScan(root, true); hubItemsCache.ts = 0; await hydrateFromHub(state.items); renderAll(); }
                catch (e) { toast('hub 扫描失败：' + e.message, 'error', 5000); }
            }
            toast(`扫描完成：${r.files.length} 部影片，${r.dirs.length} 个子目录`, 'success', 3500);
        } catch (e) {
            toast('扫描失败：' + e.message, 'error', 4000);
        } finally { setBusy(false); }
    }

    /** 后台重扫：索引没变就什么都不做（不重渲染、不打扰） */
    async function refreshLibInBackground(key, root, old) {
        if (state.bgRefreshing) return;
        state.bgRefreshing = true;
        try {
            const r = await scanVideos(root, null);
            const sig = listSignature(r.files);
            saveJson(key, {
                ts: Date.now(), v: LIB_SCHEMA, root: root, truncated: r.truncated,
                sig: sig, files: stripThumbUrls(r.files), sidecars: stripThumbUrls(r.sidecars)
            });
            if (state.mode !== 'lib' || state.rootCid !== root) return;   // 用户已经切走了
            const oldSig = (old && old.sig) || listSignature(old && old.files);
            if (oldSig === sig) return;                                   // 索引没变 → 不动 DOM
            state.items = toEntries(r.files, CFG.preferSidecar ? buildSidecarMap(r.sidecars) : null);
            state.truncated = r.truncated;
            state.usedCache = false;
            renderAll();
            const hit = await hydrateFromHub(state.items);
            if (hit) renderAll();
            toast('本地索引已在后台更新（' + r.files.length + ' 部）', 'success', 2600);
        } catch (e) {
            console.warn('[影片墙] 后台重扫库索引失败：', e && e.message);
        } finally { state.bgRefreshing = false; }
    }

    function setBusy(busy, text) {
        state.loading = busy;
        const el = $('#mw-busy');
        if (!el) return;
        el.textContent = busy ? (text || '加载中…') : '';
        el.style.display = busy ? 'block' : 'none';
    }

    async function reload(force) {
        if (state.loading && !force) { toast('正在处理中，请稍候', 'info', 2000); return; }
        if (state.mode === 'lib') await loadLibMode(force !== false);
        else await loadDirMode(force !== false);
    }

    // ========================================================================
    // 12. 设置面板
    // ========================================================================
    const PANEL_SECTIONS = [
        {
            id: 'common', label: '常用', items: [
                { t: 'toggle', k: 'titleTranslate', name: '翻译标题', hint: '把日文标题译成中文；开启后会自动补抓 JavDB 元数据以取得标题' },
                { t: 'toggle', k: 'listPreviewQuick', name: '首页快捷功能', hint: '卡片悬浮时显示复制番号 / 重抓 / 复制标题等操作' },
                { t: 'toggle', k: 'listOpenNewTab', name: '新标签打开页面', hint: '点卡片在新标签页打开播放器' },
                { t: 'toggle', k: 'cardFx', name: '卡片动画', hint: '启用卡片悬浮上浮动效' },
                { t: 'toggle', k: 'coverHoverPreview', name: '封面悬浮大图', hint: '鼠标悬停时在卡片旁预览高清封面' }
            ]
        },
        {
            id: 'layout', label: '界面相关', items: [
                { t: 'toggle', k: 'portraitCards', name: '竖图模式', hint: '开 = 纵向卡片 + 竖版海报（1032×1468）；关 = 横向卡片（卡片比例 800/538）。两种图 hub 都已导出到网盘，切换即时生效，不用重新刮削' },
                { t: 'select', k: 'wideCardImage', name: '横版卡片用哪张图', options: [['auto', '横版高清（推荐）'], ['fanart', '横版剧照（800×538）'], ['poster', '竖版海报（1032×1468）']], hint: '仅「竖图模式」关闭时生效。默认「横版高清」＝在 -thumb.jpg / -fanart.jpg 里挑**体积最大**的那张：实测（327 个视频的目录）选中的图中位 776KB，是竖版海报（271KB）的 2.9 倍、横版剧照（90KB）的 8.7 倍。⚠️ `-thumb.jpg` 其实是 hub 导出的**封面**（常见 2184×1468、约 800KB），名字里的 thumb 不是「缩略图」的意思。选「竖版海报」时它放进横版卡片里会整张完整显示（不裁切）并在两侧垫一层同图的模糊底' },
                { t: 'toggle', k: 'avoidTinyImg', name: '海报太小就换清晰图', hint: '实测约 24% 的 -poster.jpg 只有 147×200（13~19KB，DMM 等高清源都拿不到时才退回刮削站存的小图），而同名的 -thumb.jpg 常有 170KB+（约 11 倍）。开着时挑图会跳过这类看不清的图（改用同名的清晰图）；关掉就是严格按上面的偏好选，糊也照用' },
                { t: 'range', k: 'columns', name: '卡片列数', min: 0, max: 10, step: 1, fmt: (v) => (Number(v) === 0 ? '自动' : v + ' 列'), hint: '0 = 按卡片宽度自适应' },
                { t: 'range', k: 'cardW', name: '卡片宽度', min: 200, max: 520, step: 20, fmt: (v) => v + 'px', hint: '自适应模式下由它决定一行放几张' },
                { t: 'range', k: 'pageWidth', name: '内容宽度', min: 60, max: 100, step: 1, fmt: (v) => v + '%', hint: '海报墙整体宽度占页面的比例' },
                { t: 'toggle', k: 'masonry', name: '瀑布流', hint: '按列排布、卡片高度各自撑开' },
                { t: 'toggle', k: 'showPath', name: '显示所在目录', hint: '在全库模式下标注影片来自哪个子目录' },
                { t: 'toggle', k: 'showFileName', name: '显示原始文件名', hint: '在标题下方补一行原始文件名' },
                { t: 'toggle', k: 'showSize', name: '显示文件大小', hint: '115 列目录时就会带回大小，零额外请求' },
                { t: 'toggle', k: 'showBitrate', name: '显示视频码率', hint: '115 不直接给码率，用「文件大小 ÷ 时长」算（时长来自文件自带的 play_long，实测每个视频都有）。数值是平均码率' },
                { t: 'toggle', k: 'showWatch', name: '显示观看时间', hint: '115 只记录播放过的文件，没看过的不会显示。配合排序里的「按观看日期」看更直观' },
                { t: 'toggle', k: 'hideNoCode', name: '隐藏未识别番号的影片', hint: '只保留能刮削到海报的影片' }
            ]
        },
        {
            id: 'scrape', label: '刮削与翻译', items: [
                { t: 'toggle', k: 'preferSidecar', name: '优先读网盘里的海报/NFO', hint: '读视频同目录的 <视频名>-poster.jpg 与 <视频名>.nfo（由本机 hub 的「导出媒体文件」生成），零抓取、零鉴权，打开即出图。读不到再走下面的刮削链路' },
                { t: 'toggle', k: 'hiResPoster', name: '海报用网盘原图', hint: '115 的缩略图直链最大只有 200px（约 19KB），大卡片上会糊；打开后自动换成网盘上的原图（实测 100~180KB）。原图取失败会自动保留缩略图' },
                { t: 'action', name: '自检读取链路', hint: '逐关报告「列目录 → 签发直链 → 取回内容 → 解析 NFO → 取原图」，排查看不到片名/海报糊的原因', onClick: runReadDiag },
                { t: 'info', render: () => diagInfoHtml() },
                { t: 'select', k: 'translateTarget', name: '翻译目标语言', options: [['zh-CN', '简体中文'], ['zh-TW', '繁體中文']], hint: '翻译结果会随缓存一起保存' },
                { t: 'select', k: 'posterSource', name: '海报来源优先级', options: [['dmm-first', 'DMM 优先（推荐）'], ['javdb-first', 'JavDB 优先'], ['cache-only', '只用缓存，不联网刮削']], hint: 'DMM 是官方图床，竖版/横版清晰度最好' },
                { t: 'range', k: 'concurrency', name: '刮削并发', min: 1, max: 8, step: 1, fmt: (v) => v + ' 个', hint: '并发越高越快，但更容易被站点限流' },
                { t: 'toggle', k: 'autoScrape', name: '自动刮削', hint: '关闭后只显示缓存里已有的结果（网盘 sidecar 不受影响，仍会读取）' },
                { t: 'toggle', k: 'fetchMeta', name: '补抓元数据', hint: '需要标题/评分时额外查询 JavDB（每部片一次请求）' }
            ]
        },
        {
            id: 'hub', label: '本机 Hub', items: [
                { t: 'toggle', k: 'hubEnabled', name: '用本机 115 Media Hub 刮削', hint: '刮削交给本机 hub（30+ 源 + 数据库缓存 + 图片代理 + 标题翻译），影片墙优先读它的结果' },
                { t: 'text', k: 'hubBase', name: 'Hub 地址', hint: '默认 http://127.0.0.1:18080' },
                { t: 'text', k: 'hubUser', name: 'Hub 用户名', hint: '默认 admin' },
                { t: 'text', k: 'hubPass', name: 'Hub 密码', hint: '用于自动登录；留空则靠浏览器里已登录的 hub 会话' },
                { t: 'text', k: 'hubCookie', name: '手动 Cookie（可选）', hint: '形如 session=xxx；填了就优先用它，绕过登录' },
                { t: 'toggle', k: 'hubImageProxy', name: '海报走 hub 代理', hint: 'hub 代抓图片并落盘缓存，彻底解决防盗链（走 GM 取图以带上登录态）；失败自动退回直连原图' },
                { t: 'toggle', k: 'hubAutoTranslate', name: '用 hub 翻译标题', hint: 'hub 侧有译文缓存，比自己逐条翻更快' },
                { t: 'toggle', k: 'hubAutoScan', name: '自动让 hub 扫描目录', hint: '打开影片墙时若 hub 没有该目录的数据，先让它扫一遍' },
                { t: 'range', k: 'hubRetryMin', name: 'hub 结果缓存', min: 1, max: 120, step: 1, fmt: (v) => v + ' 分钟', hint: '多久重新向 hub 拉一次刮削结果' },
                { t: 'action', name: '测试连接', hint: '登录 hub 并读取 /api/avwall/stats', onClick: hubTest },
                {
                    t: 'action', name: '让 hub 扫描当前目录', hint: '扫描当前 115 目录并落库（非递归）', onClick: async () => {
                        const r = await hubScan(state.curCid || currentCid(), false);
                        hubItemsCache.ts = 0;
                        toast(`hub 扫描完成：${r.found || 0} 个视频 · 识别出 ${r.parsed || 0} 个番号 · 落库 ${r.stored || 0}`, 'success', 5000);
                    }
                },
                {
                    t: 'action', name: '让 hub 补齐缺失元数据', hint: '给「有番号但没刮到元数据」的条目起识别任务，跑在 hub 侧、耗时较长', onClick: async () => {
                        const r = await hubScrapeMissing(40);
                        toast(r.count ? `已提交 ${r.count} 条给 hub 补刮，完成后回来刷新即可` : (r.msg || '没有需要补齐的条目'), 'success', 5000);
                    }
                },
                {
                    t: 'action', name: '重新拉取 hub 结果并刷新', hint: '清掉 hub 结果缓存后重新拉一次', onClick: async () => {
                        hubItemsCache.ts = 0;
                        await reload(false);
                    }
                },
                { t: 'info', render: () => hubInfoHtml() }
            ]
        },
        {
            id: 'advanced', label: '缓存与高级', items: [
                { t: 'toggle', k: 'localFirst', name: '本地缓存优先（秒开）', hint: '打开时先用浏览器本地的缓存把墙铺出来，再在后台校验。关掉则每次都重新扫描网盘（会明显变慢）' },
                { t: 'toggle', k: 'autoCacheLocal', name: '自动把素材实时存到本地', hint: '打开影片墙后自动把 NFO（含原文）与海报原图抓到本地，不用手点。想省流量可关掉（关掉后只有滚到的卡片会被缓存）' },
                { t: 'select', k: 'cacheBackend', name: '缓存位置', options: [['idb', '浏览器本地（IndexedDB）· 默认'], ['folder', '我自选的本机文件夹（真实文件）']], hint: '选「本机文件夹」会把 NFO 原文与海报写成磁盘上的真实文件 —— 能直接看、能备份、能给别的播放器复用，换浏览器或清数据也不丢' },
                { t: 'info', render: () => folderInfoHtml() },
                { t: 'action', name: '选择 / 更换缓存文件夹', hint: '弹出系统的目录选择框（需要 Chrome / Edge 86 以上）', onClick: () => pickCacheFolder() },
                { t: 'action', name: '重新授权缓存文件夹', hint: '浏览器重启后需要点一次 —— 浏览器规定必须由用户手势授权，脚本不能自己续', onClick: () => reauthorizeCacheFolder() },
                { t: 'action', name: '把已缓存的素材搬到当前位置', hint: '换了缓存位置后，把另一种后端里已经存好的搬过来，避免重新下载', onClick: () => migrateLocalCache() },
                { t: 'toggle', k: 'nfoCache', name: 'NFO 片名/演员缓存到本地', hint: '把网盘里 NFO 的解析结果 + **原文**存到本地。这是重开变快的关键 —— 关掉每次重开都要把几十份 NFO 从网盘重读一遍' },
                { t: 'toggle', k: 'imgCache', name: '海报原图缓存到本地', hint: '把网盘上的海报原图（每张 170~700KB）存到本地。重开时不再重新下载整批图' },
                { t: 'range', k: 'imgCacheMB', name: '图片缓存上限', min: 8, max: 2048, step: 8, fmt: (v) => v + ' MB', hint: '超过就按「最久没看的」自动淘汰。94 部影片约需 30MB' },
                { t: 'range', k: 'libCacheMin', name: '全库索引刷新间隔', min: 0, max: 720, step: 10, fmt: (v) => (v ? v + ' 分钟' : '每次打开都刷新'), hint: '本地索引先出图，超过这个时长就在后台重扫一次；内容没变不会重画' },
                { t: 'action', name: '把素材全部缓存到本地（NFO + 海报）', hint: '手动跑一次全量本地化：NFO 原文 + 解析结果 + 海报原图。只读视频同目录的 NFO，不抓任何外部站点', onClick: () => cacheAllLocal() },
                { t: 'action', name: '停止本地化', hint: '中断正在跑的本地化（已存下的都会保留）', onClick: () => stopCacheLocal() },
                { t: 'range', k: 'cacheDays', name: '本地缓存天数', min: 1, max: 180, step: 1, fmt: (v) => v + ' 天', hint: '本地 GM 存储里刮削结果的有效期' },
                { t: 'info', render: () => '网盘目录写入：<b style="color:#f59e0b">已停用</b>。115 封禁了脚本直传（老协议一律回 <code>sig invalid</code>，新协议要 4.0 + ECDH，不值得移植）。' +
                    '<br>持久化改由本机 hub 写成网盘里的实体文件 <b>&lt;视频名&gt;.nfo</b> + <b>&lt;视频名&gt;-poster.jpg</b>：列一次目录就能读到，比 json 缓存还快，还能被 Emby/Jellyfin 直接复用。' },
                { t: 'action', name: '从文件夹读取缓存', hint: '仅用于读取历史遗留的缓存 json（新目录不会有）', onClick: async () => { const n = await readFolderCache(state.curCid, false); if (n) { state.items = toEntries(state.items.map(e => e.item)); renderAll(); toast(`已载入 ${n} 条历史缓存`, 'success', 2600); } else { toast('当前文件夹没有缓存 json', 'info', 2600); } } },
                { t: 'action', name: '删除网盘上的缓存文件', hint: '清理历史遗留的缓存 json（只删这一个文件）', onClick: deleteFolderCache },
                { t: 'action', name: '导出缓存到本机', hint: '下载一份缓存 json，便于备份', onClick: exportCache },
                { t: 'info', render: () => cacheInfoHtml() },
                { t: 'action', name: '清理本地片名缓存', hint: '把已缓存的 NFO 解析结果清空（下次重开要重新读一遍网盘）', onClick: () => { clearNfoCache(); toast('本地片名缓存已清空', 'success', 2500); refreshSettings(); } },
                { t: 'action', name: '清理本地图片缓存', hint: '清掉本地存着的海报原图（选的是文件夹时，只删脚本写进去的那几个文件）', onClick: async () => { await clearImgCache(); toast('本地图片缓存已清空', 'success', 2500); refreshSettings(); } },
                { t: 'action', name: '清理本地 NFO 原文', hint: '只删 NFO 原文（.nfo 文件）；解析出来的片名/演员仍在，不影响浏览', onClick: async () => { await clearRawNfo(); toast('本地 NFO 原文已清空', 'success', 2500); refreshSettings(); } },
                { t: 'action', name: '导出本地 NFO 原文', hint: '把已存在本地的 NFO 原文打包成一个 json 下载（备份 / 给别的工具用）', onClick: () => exportRawNfo() },
                { t: 'action', name: '清理目录/全库索引', hint: '下次打开会重新扫描网盘', onClick: () => { clearDirCaches(); toast('目录与全库索引已清空', 'success', 2500); refreshSettings(); } },
                { t: 'action', name: '清理海报缓存', hint: '清空 GM 本地存储里的刮削结果', onClick: () => { posterCache = {}; saveJson(STORE_POSTER, {}); toast('海报缓存已清空', 'success', 2500); refreshSettings(); } },
                { t: 'action', name: '清理翻译缓存', hint: '清空已翻译的标题', onClick: () => { transCache = {}; saveJson(STORE_TRANS, {}); toast('翻译缓存已清空', 'success', 2500); refreshSettings(); } },
                { t: 'action', name: '全部清理', hint: '海报 + 翻译 + 片名 + 图片 + NFO 原文 + 全库索引一起清（下次打开会慢一次）', onClick: async () => {
                    stopCacheLocal(true);
                    posterCache = {}; transCache = {}; saveJson(STORE_POSTER, {}); saveJson(STORE_TRANS, {});
                    clearNfoCache();
                    await clearImgCache();
                    await clearRawNfo();
                    clearDirCaches();
                    toast('已清理全部本地缓存', 'success', 2600);
                    refreshSettings();
                } }
            ]
        }
    ];

    /* 目录缓存的键是按 cid 生成的，而 GM 存储没有枚举 API —— 所以额外记一份「用过的 cid」，
       清理时才能逐个删掉（老版本的库索引也靠 loadJsonCacheKeys 猜，这里一起覆盖）。 */
    const STORE_DIR_INDEX = 'mw_dir_index';
    let dirKeys = loadJson(STORE_DIR_INDEX, []);
    function saveDirCache(cid, payload) {
        if (!cid) return;
        saveJson(STORE_DIR + cid, payload);
        if (dirKeys.indexOf(String(cid)) < 0) {
            dirKeys.push(String(cid));
            if (dirKeys.length > 400) dirKeys = dirKeys.slice(-400);
            saveJson(STORE_DIR_INDEX, dirKeys);
        }
    }
    function clearDirCaches() {
        const keys = Object.assign({}, loadJsonCacheKeys());
        dirKeys.forEach((cid) => { keys[STORE_DIR + cid] = 1; });
        Object.keys(keys).forEach((k) => { try { GM_deleteValue(k); } catch (e) { /* ignore */ } });
        dirKeys = [];
        saveJson(STORE_DIR_INDEX, []);
    }

    function loadJsonCacheKeys() {
        const out = {};
        try {
            // GM 存储没有枚举 API，用固定前缀记录；这里用约定：库索引按 root cid 存
            Object.keys(folderStat).forEach((cid) => { out[STORE_LIB + cid] = 1; });
        } catch (e) { /* ignore */ }
        // 兜底：至少清掉当前能看到的所有 root
        const roots = [state.rootCid, currentCid(), '0'].filter(Boolean);
        const keys = {};
        Object.keys(out).forEach(k => keys[k] = 1);
        roots.forEach(cid => keys[STORE_LIB + cid] = 1);
        return keys;
    }

    /* ---------------- 读取链路自检 ----------------
       影片墙读 NFO / 海报原图要连过三关：列目录拿到 pickcode → webapi 签发直链
       → GM 取回内容。任何一关被挡住（最常见的是 CDN 域名没进 @connect），
       表面症状都是「没有片名、海报糊」，很难猜。所以把每一步的真实结果摊出来。 */
    let diagLines = [];
    let diagRunning = false;

    async function runReadDiag() {
        if (diagRunning) { toast('自检正在跑，稍等一下…', 'info', 2000); return; }
        diagRunning = true;
        const lines = [];
        const push = (s) => lines.push(s);
        const t0 = Date.now();
        try {
            const items = state.items || [];
            const withSc = items.filter((e) => e.sc);
            const withNfo = items.filter((e) => e.sc && e.sc.nfo);
            const withImg = items.filter((e) => e.sc && cardImageFile(e));
            push('① 目录：' + items.length + ' 个影片；带 sidecar ' + withSc.length +
                ' 个（NFO ' + withNfo.length + '、卡片图 ' + withImg.length + '）。' +
                '当前模式 = ' + (CFG.portraitCards ? '竖图（用竖版海报）'
                    : '横图（' + (widePref() === 'fanart' ? '用横版剧照'
                        : (widePref() === 'auto' ? '自动选图' : '用竖版海报')) + '）'));
            if (!withSc.length) push('   ✗ 本目录没有 sidecar —— 先在本机 hub 的影片墙页点「导出媒体文件」');

            const cid = state.curCid || currentCid();
            let diagRawList = null;
            if (cid) {
                const raw = await listDirAll(cid);
                diagRawList = raw;
                const nameOf = (it) => String(it.n || it.name || '');
                const rawNfo = raw.filter((it) => /\.nfo$/i.test(nameOf(it)));
                const rawImg = raw.filter((it) => /-(poster|thumb|fanart)\.(jpe?g|png|webp)$/i.test(nameOf(it)));
                push('② 列目录原始响应：' + raw.length + ' 条；NFO ' + rawNfo.length +
                    ' 个（带 pickcode ' + rawNfo.filter((it) => it.pc).length + '）；图片 sidecar ' + rawImg.length + ' 个');
            }

            const scNfo = withNfo[0];
            if (scNfo) {
                const f = scNfo.sc.nfo;
                push('③ 样本 NFO：' + f.name + '（pickcode ' + (f.pc || '无') + '）');
                try {
                    const url = await signedFileUrl(f.pc);
                    push('④ 签发直链：OK（域名 ' + String(url).split('/')[2] + '）');
                    const got = await readFileText(f.pc);
                    push('⑤ 取回内容：' + got.via + '（' + got.text.length + ' 字符）');
                    const parsed = parseNfo(got.text);
                    push('⑥ 解析：title=' + ((parsed && parsed.t) || '(空)') +
                        ' | actors=' + (((parsed && parsed.actors) || []).join('、') || '(空)'));
                    if (!parsed) {
                        push('   ✗ 文本取到了但解析不出 <movie>，开头是：' + JSON.stringify(String(got.text).slice(0, 90)));
                    } else if (!isRealTitle(parsed.t, scNfo.code, scNfo.item && scNfo.item.name)) {
                        push('   ⚠ 这个 NFO 里只有番号、没有片名 —— 是 hub 还没刮到元数据，不是脚本的问题');
                    }
                } catch (e) { push('④/⑤ 失败：' + (e && e.message)); }
            } else {
                push('③ 没有可测的 NFO');
            }

            const scImg = withImg[0];
            if (scImg) {
                const f = cardImageFile(scImg);
                push('⑦ 样本卡片图：' + f.name + '（' + Math.round(Number(f.size || 0) / 1024) +
                    'KB，pickcode ' + (f.pc || '无') + '）');
                try {
                    const obj = await hiResImage(f.pc);
                    push('⑧ 原图取回：' + (obj ? 'OK（已生成 blob）' : '空'));
                } catch (e) { push('⑧ 原图取回失败：' + (e && e.message) + '（卡片会退回缩略图）'); }
            }

            // ⑧b 缩略图直链体检：115 的 `u` 是**短时签名**，失效后它照样回 HTTP 200 + image/jpeg，
            //     但内容换成约 1.6KB 的「图片已过期」占位图（浏览器 onerror 抓不到）。
            //     本版起不会把这种 URL 写进任何缓存，这里只是把真实情况摊出来。
            const rawThumbFile = (diagRawList || []).find(
                (it) => /-(poster|thumb|fanart)\./i.test(String(it.n || '')) && it.u);
            if (rawThumbFile) {
                const tu = upgradeThumbUrl(String(rawThumbFile.u));
                try {
                    const res = await gm({ method: 'GET', url: tu, responseType: 'blob', timeout: 15000 });
                    const size = (res.response && (res.response.size || res.response.byteLength)) || 0;
                    if (res.status !== 200) {
                        push('⑧b 缩略图直链：HTTP ' + res.status + '（异常）');
                    } else if (size && size < THUMB_MIN_BYTES) {
                        push('⑧b 缩略图直链：' + size + ' 字节 → 只有正常的 1/4，**签名已过期**' +
                            '（115 回的是「图片已过期」占位图）。脚本已不再把这类 URL 存进缓存');
                    } else {
                        push('⑧b 缩略图直链：OK（' + size + ' 字节）');
                    }
                } catch (e) { push('⑧b 缩略图直链取回失败：' + (e && e.message)); }
            } else {
                push('⑧b 本次列表里没有带缩略图直链的图片（走本地缓存渲染时就是这种情况，属正常）');
            }

            // ⑧c 本地缓存落点：让用户一眼看到素材到底存在哪
            push('⑧c 缓存位置：' + (activeBackend() === 'folder'
                ? ('本机文件夹「' + (dirHandle && dirHandle.name || '') + '」（NFO 原文 ' +
                    Object.keys(dirFiles.nfo).length + ' 份 · 海报 ' + Object.keys(dirFiles.img).length + ' 张）')
                : '浏览器本地 IndexedDB（片名 ' + nfoCacheStats().hit + ' 条 · NFO 原文 ' + rawNfoCount +
                  ' 份 · 海报 ' + imgCacheCount() + ' 张 / ' + fmtBytes(imgCacheBytes()) + '）'));
            if (folderMode() && activeBackend() !== 'folder') push('   ⚠ ' + folderBlockReason() + ' → 现在临时用浏览器本地');

            push('⑨ 统计：NFO 已解析 ' + items.filter((e) => e.rec && e.rec.nfo).length +
                ' 个；有译文 ' + items.filter((e) => e.rec && e.rec.tr).length + ' 个');
            if (lastReadError) push('⑩ 最近一次读取失败：' + lastReadError);
            if (/\b40[13]\b/.test(String(lastReadError)) || /403/.test(String(lastReadError))) {
                push('   → 403 的两个常见原因：① 油猴未放行 cdnfhnfile.115.com（本版已加 @connect *，重装即可）；' +
                    '② 浏览器走了代理，115 的 CDN 拒绝异地 IP —— 把 *.115.com 加进代理直连规则试试');
            }
        } catch (e) {
            push('自检异常：' + (e && e.message));
        }
        push('耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒');
        diagLines = lines;
        diagRunning = false;
        try { console.log('[影片墙自检]\n' + lines.join('\n')); } catch (e) { /* ignore */ }
        refreshSettings();
        toast('自检完成，结果见「读取链路自检」下方（同时也打到 Console）', 'success', 4500);
    }

    function diagInfoHtml() {
        const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if (diagRunning) return '正在自检…';
        if (!diagLines.length) {
            return '点上面的「自检读取链路」：会逐关报告「列目录 → 签发直链 → 取回内容 → 解析」，' +
                '<br>NFO 读不到、海报糊的时候，先看这里的哪一关 ✗ 了。';
        }
        return '<pre style="margin:0;white-space:pre-wrap;font-size:11.5px;line-height:1.65;' +
            'font-family:ui-monospace,Consolas,Menlo,monospace;">' + esc(diagLines.join('\n')) + '</pre>';
    }

    function hubInfoHtml() {
        if (!hubConfigured()) {
            return '未启用本机 hub。<br>启用后：刮削（30+ 源）交给 hub，影片墙只负责展示与把结果写回目录。';
        }
        const c = hubItemsCache;
        const seen = c.ts
            ? `上次拉取：<b>${fmtTime(c.ts)}</b> · hub 已刮削 <b>${c.total}</b> 条 · 其中有海报 <b>${c.withPoster}</b> 条`
            : '尚未拉取 hub 结果';
        const sess = !hubSession ? '未登录' : (hubSession === '__jar__' ? '用浏览器已有会话' : '已登录');
        return `地址：<b>${hubBase()}</b> · 会话：<b>${sess}</b><br>${seen}<br>` +
            '刮削优先级：<b>目录里的缓存文件</b> → <b>本机 hub</b> → 脚本自刮（DMM/JavDB）';
    }

    async function hubTest() {
        const j = await hubStats();
        hubItemsCache.ts = 0;
        toast(`hub 正常：文件 ${j.files || 0} · 已识别番号 ${j.parsed || 0} · 已刮削 ${j.matched || 0} · 待补齐 ${j.missing || 0}`, 'success', 6000);
    }

    function folderInfoHtml() {
        if (!folderMode()) {
            return '缓存位置：<b>浏览器本地</b>（IndexedDB）—— 零配置。' +
                '缺点：清了浏览器数据就没了，也不方便直接拿去给别的播放器用；想那样就换成「我自选的本机文件夹」。';
        }
        const reason = folderBlockReason();
        if (reason) {
            return '缓存位置：<b style="color:#f59e0b">本机文件夹</b> · ' + escHtml(reason) +
                '<br>现在<b>临时用浏览器本地兜底</b>，重新授权后会继续往文件夹里写。';
        }
        return '缓存位置：<b style="color:#4ade80">本机文件夹</b>「' + escHtml(dirHandle.name || '') + '」<br>' +
            '里面已存：NFO 原文 <b>' + Object.keys(dirFiles.nfo).length + '</b> 份 · 海报 <b>' +
            Object.keys(dirFiles.img).length + '</b> 张 · 另有索引文件 <code>' + CACHE_FOLDER_INDEX + '</code><br>' +
            '「清理」只会删除<b>本脚本写进去的这些文件</b>（按索引定位），目录里其它文件不会动。';
    }

    /** 把「另一种后端」里已经存好的素材搬到当前缓存位置，省得重新下载一遍。
        只搬本脚本自己记录过的条目（imgMeta 的图片键 + nfoStore 的 NFO 键）。 */
    async function migrateLocalCache() {
        const target = activeBackend();
        if (target === 'folder') {
            // 目标：文件夹；来源：IndexedDB
            const db = await openImgDB();
            if (!db) { toast('浏览器本地存储不可用', 'error', 3600); return { img: 0, nfo: 0 }; }
            let img = 0;
            let nfo = 0;
            setCacheBar('正在把已缓存的素材搬到文件夹…');
            try {
                for (const pc of Object.keys(imgMeta)) {
                    if (dirFiles.img[pc]) continue;
                    const blob = await idbReq(db, 'imgs', 'readonly', (s) => s.get(pc));
                    if (blob && blob.size) { await folderPutImg(pc, blob, (imgMeta[pc] || {}).n || pc); img++; }
                }
                for (const key of Object.keys(nfoStore)) {
                    if (dirFiles.nfo[key]) continue;
                    const t = await idbReq(db, 'texts', 'readonly', (s) => s.get(key));
                    if (typeof t === 'string' && t) { await folderPutNfo(key, t); nfo++; }
                }
                await writeDirIndex(true);
                toast('已搬到文件夹：海报 ' + img + ' 张 · NFO 原文 ' + nfo + ' 份', 'success', 4200);
            } catch (e) {
                toast('搬迁中断：' + ((e && e.message) || e), 'error', 4200);
            } finally { setCacheBar(''); }
            refreshSettings();
            return { img: img, nfo: nfo };
        }
        // 目标：IndexedDB；来源：文件夹
        if (!dirHandle) { toast('还没有选过缓存文件夹，没有可搬的来源', 'info', 3600); return { img: 0, nfo: 0 }; }
        if (dirNeedPermission) { toast('请先点「重新授权缓存文件夹」，才读得到文件夹里的东西', 'info', 4400); return { img: 0, nfo: 0 }; }
        const db = await openImgDB();
        if (!db) { toast('浏览器本地存储不可用', 'error', 3600); return { img: 0, nfo: 0 }; }
        let img = 0;
        let nfo = 0;
        setCacheBar('正在把文件夹里的素材搬到浏览器本地…');
        try {
            for (const pc of Object.keys(dirFiles.img)) {
                const has = await idbReq(db, 'imgs', 'readonly', (s) => s.get(pc));
                if (has) continue;
                const blob = await folderGetImg(pc);
                if (blob && blob.size) {
                    await idbReq(db, 'imgs', 'readwrite', (s) => s.put(blob, pc));
                    if (!imgMeta[pc]) { imgMeta[pc] = { sz: blob.size, at: Date.now(), n: '' }; img++; }
                }
            }
            for (const key of Object.keys(dirFiles.nfo)) {
                const has = await idbReq(db, 'texts', 'readonly', (s) => s.get(key));
                if (typeof has === 'string' && has) continue;
                const t = await folderGetNfo(key);
                if (t) { await idbReq(db, 'texts', 'readwrite', (s) => s.put(t, key)); nfo++; }
            }
            markImgMetaDirty();
            await refreshRawNfoCount();
            toast('已搬到浏览器本地：海报 ' + img + ' 张 · NFO 原文 ' + nfo + ' 份', 'success', 4200);
        } catch (e) {
            toast('搬迁中断：' + ((e && e.message) || e), 'error', 4200);
        } finally { setCacheBar(''); }
        refreshSettings();
        return { img: img, nfo: nfo };
    }

    /** 设置面板底部状态栏用的紧凑一行（cacheInfoHtml 是分项的详细版） */
    function cacheSummaryText() {
        const nst = nfoCacheStats();
        const where = activeBackend() === 'folder'
            ? ('文件夹「' + (dirHandle.name || '') + '」')
            : (folderMode() ? '浏览器本地（文件夹待授权）' : '浏览器本地');
        return '缓存位置 ' + where + '：片名 ' + nst.hit + ' 条 · NFO 原文 ' + rawNfoCount + ' 份 · 图片 ' +
            imgCacheCount() + ' 张（' + fmtBytes(imgCacheBytes()) + '）· 本次命中 本地 ' +
            (nfoHitLocal + imgHitLocal) + ' / 联网 ' + (nfoHitNet + imgHitNet) +
            (cacheSt().running ? ' · 正在本地化…' : '');
    }

    function cacheInfoHtml() {
        const entries = Object.keys(posterCache).length;
        const trans = Object.keys(transCache).filter(k => transCache[k]).length;
        const bytes = JSON.stringify(posterCache).length + JSON.stringify(transCache).length;
        const nst = nfoCacheStats();
        const imgN = imgCacheCount();
        const imgB = imgCacheBytes();
        const budgetMB = Math.max(4, Number(CFG.imgCacheMB) || 64);
        const where = activeBackend() === 'folder'
            ? ('<b style="color:#4ade80">本机文件夹</b>「' + escHtml(dirHandle.name || '') + '」' +
                (CFG.cacheBackend === 'folder' && dirNeedPermission ? ' <b style="color:#f59e0b">(待重新授权)</b>' : ''))
            : ('<b>浏览器本地</b>（IndexedDB）' + (folderMode() ? ' <b style="color:#f59e0b">—— 已选文件夹但当前用不上，见上方说明</b>' : ''));
        return `<b>缓存位置</b>：${where}<br>` +
            `<b>素材</b>：片名 <b>${nst.hit}</b> 条 / 共 ${nst.total} 条 · **NFO 原文 <b>${rawNfoCount}</b> 份** · 海报原图 <b>${imgN}</b> 张 · <b>${fmtBytes(imgB)}</b> / 上限 ${budgetMB}MB` +
            (imgStoreAvailable() ? '' : ' <b style="color:#f59e0b">（本地缓存当前不可用：开关已关或浏览器未开放 IndexedDB）</b>') + '<br>' +
            `<b>另存</b>：刮削结果 <b>${entries}</b> 条 · 译文 <b>${trans}</b> 条 · 约 <b>${fmtBytes(bytes)}</b>；目录 / 全库索引 <b>${dirKeys.length}</b> 个目录` +
            (state.usedCache ? ' · 本次是<b style="color:#4ade80">用本地缓存</b>渲染的' : '') + '<br>' +
            `<b>本次打开</b>：本地命中 <b style="color:#4ade80">${nfoHitLocal + imgHitLocal}</b> 次 · 联网 <b>${nfoHitNet + imgHitNet}</b> 次` +
            (cacheSt().running ? ' · <b style="color:#8fe3ff">正在本地化…</b>' : '') + '<br>' +
            `历史遗留的网盘缓存 json：${folderStat[state.curCid] && folderStat[state.curCid].savedAt ? '有（已停用）' : '无'}`;
    }

    /** 把本地存着的 NFO 原文打包下载（备份 / 给别的工具用） */
    async function exportRawNfo() {
        const all = await rawNfoAll();
        const keys = Object.keys(all);
        if (!keys.length) {
            toast('本地还没有 NFO 原文 —— 先点「把素材全部缓存到本地（NFO + 海报）」', 'info', 4600);
            return 0;
        }
        try {
            const text = JSON.stringify({ v: 1, ts: Date.now(), count: keys.length, nfo: all }, null, 1);
            const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = '影片墙-NFO原文-' + keys.length + '份-' + Date.now() + '.json';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 15000);
            toast('已导出 ' + keys.length + ' 份 NFO 原文（' + fmtBytes(text.length) + '）', 'success', 3800);
            return keys.length;
        } catch (e) {
            toast('导出失败：' + e.message, 'error', 4200);
            return 0;
        }
    }

    function exportCache() {
        try {
            const payload = collectCacheEntries();
            const text = JSON.stringify({ v: 2, ts: Date.now(), cid: state.curCid, count: Object.keys(payload.entries).length, entries: payload.entries, trans: payload.trans }, null, 1);
            const blob = new Blob([text], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = CFG.cacheFileName.replace(/\.json$/i, '') + '-' + Date.now() + '.json';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 15000);
            toast('已导出 ' + fmtBytes(text.length) + ' 的缓存', 'success', 3000);
        } catch (e) { toast('导出失败：' + e.message, 'error', 4000); }
    }

    function renderSettingItem(it) {
        const wrap = document.createElement('div');
        if (it.t === 'info') {
            wrap.className = 'mw-row-info';
            wrap.dataset.info = '1';
            wrap.__render = it.render;
            wrap.innerHTML = it.render ? it.render() : '';
            return wrap;
        }
        if (it.t === 'toggle') {
            wrap.className = 'mw-row';
            wrap.innerHTML = `<span class="mw-row-copy"><strong>${it.name}</strong><small>${it.hint || ''}</small></span>
                <span class="mw-switch"><input type="checkbox" ${CFG[it.k] ? 'checked' : ''}><i></i></span>`;
            const input = $('input', wrap);
            input.addEventListener('change', () => {
                CFG[it.k] = input.checked;
                saveCfg();
                applySettings(it.k);
            });
            return wrap;
        }
        if (it.t === 'range') {
            wrap.className = 'mw-row-range';
            wrap.innerHTML = `<span class="mw-row-copy"><strong>${it.name}</strong><small>${it.hint || ''}</small></span>
                <input type="range" min="${it.min}" max="${it.max}" step="${it.step || 1}" value="${CFG[it.k]}">
                <b>${it.fmt ? it.fmt(CFG[it.k]) : CFG[it.k]}</b>`;
            const input = $('input', wrap);
            const val = $('b', wrap);
            input.addEventListener('input', () => {
                CFG[it.k] = Number(input.value);
                val.textContent = it.fmt ? it.fmt(CFG[it.k]) : CFG[it.k];
                saveCfg();
                applySettings(it.k);
            });
            return wrap;
        }
        if (it.t === 'select') {
            wrap.className = 'mw-row-sel';
            wrap.innerHTML = `<span class="mw-row-copy"><strong>${it.name}</strong><small>${it.hint || ''}</small></span>
                <select>${it.options.map(o => `<option value="${o[0]}" ${CFG[it.k] === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>`;
            const sel = $('select', wrap);
            sel.addEventListener('change', () => { CFG[it.k] = sel.value; saveCfg(); applySettings(it.k); });
            return wrap;
        }
        if (it.t === 'text') {
            wrap.className = 'mw-row-text';
            wrap.innerHTML = `<span class="mw-row-copy"><strong>${it.name}</strong><small>${it.hint || ''}</small></span>
                <input type="text" value="${String(CFG[it.k] || '').replace(/"/g, '&quot;')}">`;
            const input = $('input', wrap);
            input.addEventListener('change', () => { CFG[it.k] = input.value.trim() || CFG_DEF[it.k]; saveCfg(); });
            return wrap;
        }
        // action
        wrap.className = 'mw-row-act';
        wrap.innerHTML = `<span class="mw-row-copy"><strong>${it.name}</strong><small>${it.hint || ''}</small></span>
            <button class="mw-btn primary">执行</button>`;
        $('button', wrap).addEventListener('click', async (ev) => {
            const btn = ev.currentTarget;
            btn.disabled = true;
            btn.textContent = '处理中…';
            try { await it.onClick(); } catch (e) { toast('操作失败：' + e.message, 'error', 4000); }
            btn.disabled = false;
            btn.textContent = '执行';
            refreshSettings();
        });
        return wrap;
    }

    function refreshSettings() {
        const content = $('#mw-set-content');
        if (!content) return;
        $$('.mw-row-info', content).forEach((el) => {
            if (typeof el.__render === 'function') el.innerHTML = el.__render();
        });
        const stat = $('#mw-set-stat');
        if (stat) stat.textContent = cacheSummaryText();
    }

    function buildSettingsPanel(section) {
        const old = document.getElementById('mw-set-overlay');
        if (old) old.remove();
        const ov = document.createElement('div');
        ov.id = 'mw-set-overlay';
        ov.innerHTML = `
            <div class="mw-set-panel">
                <div class="mw-set-head"><b>影片墙设置</b><button class="mw-set-close" title="关闭">×</button></div>
                <div class="mw-set-body">
                    <nav class="mw-set-nav">${PANEL_SECTIONS.map((s, i) => `<button data-sec="${s.id}" class="${i === 0 ? 'on' : ''}">${s.label}</button>`).join('')}</nav>
                    <div class="mw-set-content" id="mw-set-content"></div>
                </div>
                <div class="mw-set-foot">
                    <span class="mw-stat" id="mw-set-stat"></span>
                    <button class="mw-btn" id="mw-set-reset">恢复默认</button>
                    <button class="mw-btn primary" id="mw-set-done">完成</button>
                </div>
            </div>`;
        document.body.appendChild(ov);

        let cur = (section && PANEL_SECTIONS.filter(s => s.id === section).length) ? section : PANEL_SECTIONS[0].id;
        function renderSection(id) {
            cur = id;
            $$('.mw-set-nav button', ov).forEach(b => b.classList.toggle('on', b.dataset.sec === id));
            const content = $('#mw-set-content', ov);
            content.innerHTML = '';
            const sec = PANEL_SECTIONS.filter(s => s.id === id)[0];
            const title = document.createElement('div');
            title.className = 'mw-set-sec-title';
            title.textContent = sec.label;
            content.appendChild(title);
            const grid = document.createElement('div');
            grid.className = 'mw-set-grid';
            sec.items.forEach(it => grid.appendChild(renderSettingItem(it)));
            content.appendChild(grid);
            content.scrollTop = 0;
        }
        $$('.mw-set-nav button', ov).forEach((b) => {
            b.addEventListener('click', () => renderSection(b.dataset.sec));
        });
        $('.mw-set-close', ov).addEventListener('click', () => ov.remove());
        ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
        $('#mw-set-done', ov).addEventListener('click', () => ov.remove());
        $('#mw-set-reset', ov).addEventListener('click', () => {
            if (!confirm('恢复所有设置为默认值？')) return;
            CFG = Object.assign({}, CFG_DEF);
            saveCfg();
            renderSection(cur);
            applySettings();
            toast('已恢复默认设置', 'success', 2500);
        });
        renderSection(cur);
        const stat = $('#mw-set-stat', ov);
        if (stat) stat.textContent = cacheSummaryText();
    }

    function applySettings(changed) {
        applyLayout();
        if (changed === 'showSize' || changed === 'showBitrate' || changed === 'showWatch') {
            // 卡片信息行是渲染时拼出来的，改开关只要重渲染（不用重新读目录、不用重新刮削）
            renderAll();
            return;
        }
        if (changed === 'imgCacheMB') {
            // 调小上限就立刻回收空间（不用重渲染卡片）
            pruneImgCache();
            updateStats();
            return;
        }
        if (changed === 'localFirst' || changed === 'nfoCache' || changed === 'imgCache' ||
            changed === 'libCacheMin') {
            // 这几个只影响「数据从哪读」，卡片本身不用重画；刷新一下面板让用量/提示立刻更新
            updateStats();
            refreshSettings();
            return;
        }
        if (changed === 'portraitCards' || changed === 'wideCardImage' || changed === 'avoidTinyImg') {
            // 这几项换的都是「卡片用哪张图」（竖版海报 ↔ 横版图 / 跳过糊图），旧选择要作废后重贴。
            // 只换图、保留文本字段，避免标题闪一下；NFO 有内存缓存，不会重读。
            (state.items || []).forEach((e) => {
                if (!e.sc || !CFG.preferSidecar) return;
                const patch = sidecarRec(e);
                if (!patch) return;
                const merged = Object.assign({}, e.rec || {}, patch);
                // 新图没有的字段（例如换成 poster 后没有缩略图直链）要清掉，否则会残留旧图
                ['c', 'o', 'on'].forEach((k) => { if (!patch[k]) delete merged[k]; });
                e.rec = merged;
            });
            markPosterDirty();
            renderAll();
            return;
        }
        if (changed === 'preferSidecar') {
            // 开关只影响「装载时怎么归堆」，改了得重新读一次目录
            reload(true);
            return;
        }
        if (changed === 'hideNoCode' || changed === 'titleTranslate' || changed === 'translateTarget' ||
            changed === 'showPath' || changed === 'showFileName' || changed === 'posterSource' ||
            changed === 'autoScrape' || changed === 'fetchMeta' || changed === 'hubEnabled' ||
            changed === 'hubAutoTranslate' || changed === 'hubImageProxy' || changed === 'hiResPoster') {
            if (changed === 'hubEnabled' || changed === 'hubAutoTranslate') hubItemsCache.ts = 0;
            renderAll();
        } else if (changed === 'listPreviewQuick' || changed === 'coverHoverPreview' || changed === 'listOpenNewTab') {
            renderAll();
        }
    }

    // ========================================================================
    // 13. 影片墙外壳
    // ========================================================================
    /* ---------------- 批量操作：勾选 → 移动 / 删除 ---------------- */
    /** 选中 / 摘除用的唯一键。
        ⚠️ 必须用 uid（每个文件一个），**不能用 entry.key** —— key 是「这是哪部片子」的缓存键，
        同番号的多个版本（`ABF-208.mp4` / `ABF-208【中文字幕】.mp4`）、或全库模式下不同目录的同番号影片
        会共用一个 key → 勾一个等于勾全部，删除时连坐。 */
    function pickIdOf(e) {
        return (e && (e.uid || e.key)) || '';
    }

    function selectedEntries() {
        return (state.items || []).filter((e) => state.selected[pickIdOf(e)]);
    }

    /** 用 uid 定位已渲染的卡片（同番号多版本时不会找错人） */
    function cardOf(id) {
        const grid = $('#mw-grid');
        if (!grid) return null;
        const idx = (state.filtered || []).findIndex((e) => pickIdOf(e) === id);
        if (idx < 0) return null;
        return grid.querySelector('.mw-card[data-idx="' + idx + '"]');
    }

    /** 切换一条的选中状态（顺手同步卡片外观，不重建卡片） */
    function togglePick(id, on) {
        if (!id) return;
        if (on) state.selected[id] = true;
        else delete state.selected[id];
        const card = cardOf(id);
        if (card) card.classList.toggle('is-picked', !!on);
        renderOpsBar();
    }

    /** 把已有卡片的勾选外观与 state.selected 对齐（全选/清空用，避免整片重建导致图片重下） */
    function syncPickUi() {
        const grid = $('#mw-grid');
        if (grid) {
            Array.prototype.forEach.call(grid.querySelectorAll('.mw-card'), (c) => {
                const e = (state.filtered || [])[Number(c.dataset.idx)];
                const on = !!(e && state.selected[pickIdOf(e)]);
                c.classList.toggle('is-picked', on);
                const box = c.querySelector('.mw-pick-box');
                if (box) box.checked = on;
            });
        }
        renderOpsBar();
    }

    function pickAllVisible() {
        (state.filtered || []).forEach((e) => { state.selected[pickIdOf(e)] = true; });
        syncPickUi();
    }

    function clearSelection() {
        state.selected = Object.create(null);
        syncPickUi();
    }

    function renderOpsBar() {
        const bar = $('#mw-ops');
        if (!bar) return;
        const n = selectedEntries().length;
        const total = (state.filtered || []).length;
        const cnt = $('#mw-ops-count');
        if (cnt) {
            cnt.innerHTML = n
                ? '已选 <b>' + n + '</b> 部' + (CFG.batchWithSidecars ? '（连带海报/NFO）' : '（只动视频）')
                : '勾选卡片可批量移动 / 删除';
        }
        const busy = state.opsRunning;
        const hasTarget = !!(state.moveTarget && state.moveTarget.cid);
        const dis = { 'pick-all': busy || !total, 'pick-none': busy || !n, 'pick-target': busy, 'move-sel': busy || !n || !hasTarget, 'delete-sel': busy || !n };
        Object.keys(dis).forEach((act) => {
            const b = bar.querySelector('[data-act="' + act + '"]');
            if (!b) return;
            b.disabled = dis[act];
            if (act === 'move-sel') b.title = hasTarget ? '移动到已选目录' : '先在右边点「选择目标目录」';
        });
        const box = $('#mw-with-sidecars');
        if (box) { box.checked = !!CFG.batchWithSidecars; box.disabled = busy; }
        const tgt = $('#mw-ops-target');
        if (tgt) tgt.textContent = (state.moveTarget && state.moveTarget.name) || '未选择目标';
    }

    /** 目标目录选择器：从根目录往下走（面包屑能回去，所以不需要「上级」） */
    function pickTargetDir() {
        const old = document.getElementById('mw-dir-pick');
        if (old) old.remove();
        const trail = [{ cid: '0', name: '根目录' }];
        const overlay = document.createElement('div');
        overlay.id = 'mw-dir-pick';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `
            <div style="width:min(680px,calc(100vw - 32px));max-height:82vh;background:#0f141c;border:1px solid #26303f;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;color:#dfe4ee;font-family:inherit;">
                <div style="padding:13px 18px;background:#131a24;border-bottom:1px solid #26303f;display:flex;justify-content:space-between;align-items:center;">
                    <b style="font-size:14px;">选择目标目录</b>
                    <span id="mwd-close" style="cursor:pointer;font-size:20px;line-height:1;color:#9aa4b6;">×</span>
                </div>
                <div id="mwd-crumbs" style="padding:9px 18px;border-bottom:1px solid #1d2634;font-size:12.5px;color:#8fe3ff;font-family:ui-monospace,Menlo,monospace;"></div>
                <div id="mwd-list" style="flex:1;overflow:auto;padding:8px 10px;min-height:180px;"></div>
                <div style="padding:11px 18px;border-top:1px solid #26303f;background:#131a24;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <input id="mwd-new" class="mw-input" placeholder="新建子目录名（可选）" style="flex:1;min-width:140px;">
                    <button class="mw-btn" id="mwd-mkdir">新建</button>
                    <button class="mw-btn primary" id="mwd-use">就选这个目录</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const listEl = overlay.querySelector('#mwd-list');
        const crumbs = overlay.querySelector('#mwd-crumbs');
        const close = () => overlay.remove();
        const paintCrumbs = () => {
            crumbs.textContent = '当前：' + trail.map((t) => t.name).join(' / ');
        };
        const enter = async (dir) => {
            trail.push({ cid: dir.cid, name: dir.name });
            await paint();
        };
        async function paint() {
            const cur = trail[trail.length - 1];
            paintCrumbs();
            listEl.innerHTML = '<div style="padding:16px;color:#7c8798;font-size:13px;">读取中…</div>';
            let dirs = [];
            try {
                const raw = await listDirAll(cur.cid);
                dirs = raw.map((it) => normalizeItem(it, cur.cid, ''))
                    .filter((n) => n && n.kind === 'dir');
            } catch (e) {
                listEl.innerHTML = '<div style="padding:16px;color:#ff9c9c;font-size:13px;">读取失败：' + e.message + '</div>';
                return;
            }
            listEl.innerHTML = '';
            if (trail.length > 1) {
                const back = document.createElement('div');
                back.textContent = '← 回到上一层';
                back.style.cssText = 'padding:8px 10px;border-radius:8px;cursor:pointer;color:#9aa4b6;font-size:13px;';
                back.addEventListener('click', () => { trail.pop(); paint(); });
                listEl.appendChild(back);
            }
            dirs.forEach((d) => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;justify-content:space-between;gap:10px;align-items:center;padding:9px 12px;border:1px solid #1d2634;border-radius:8px;margin:6px 4px;cursor:pointer;background:#111722;';
                row.innerHTML = '<span style="font-size:13px;">📁 ' + String(d.name).replace(/[<>&]/g, '') + '</span><span style="color:#5b6577;font-size:12px;">进入 ›</span>';
                row.addEventListener('click', () => enter(d));
                listEl.appendChild(row);
            });
            if (!dirs.length) {
                const none = document.createElement('div');
                none.textContent = '这里没有子目录（可以直接选当前目录）';
                none.style.cssText = 'padding:12px;color:#5b6577;font-size:13px;';
                listEl.appendChild(none);
            }
        }
        overlay.querySelector('#mwd-close').addEventListener('click', close);
        overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
        overlay.querySelector('#mwd-use').addEventListener('click', () => {
            const cur = trail[trail.length - 1];
            const name = trail.map((t) => t.name).filter((x) => x !== '根目录').join('/') || '根目录';
            state.moveTarget = { cid: cur.cid, name: name };
            close();
            renderOpsBar();
            toast('目标目录：' + name, 'info', 2600);
        });
        overlay.querySelector('#mwd-mkdir').addEventListener('click', async () => {
            const input = overlay.querySelector('#mwd-new');
            const name = String(input.value || '').trim();
            if (!name) { toast('先填目录名', 'info', 2200); return; }
            const cur = trail[trail.length - 1];
            try {
                const json = await apiReq('POST', API_BASE + '/files/add',
                    'pid=' + encodeURIComponent(cur.cid) + '&cname=' + encodeURIComponent(name));
                if (!json || !json.state) throw new Error((json && (json.error || json.msg)) || '创建失败');
                input.value = '';
                toast('已创建：' + name, 'success', 2600);
                await paint();
            } catch (e) { toast('创建目录失败：' + e.message, 'error', 4000); }
        });
        paint();
    }

    /** 操作完成后「原地摘掉」处理过的卡片 —— 不重建网格。
        renderAll() 会把整面墙推倒重来：图片重新下载、滚动位置弹回顶部，勾选 3 部删掉
        却像刷新了一次页面。这里只摘掉受影响的那几张卡，其余节点（以及它们已经加载好的
        海报、可视区位置）全都保持原样。 */
    function dropEntriesInPlace(entries) {
        const grid = $('#mw-grid');
        const list = (entries || []).filter(Boolean);
        if (!list.length) return false;
        const dead = Object.create(null);
        list.forEach((e) => { dead[pickIdOf(e)] = true; });
        const takeOutData = () => {
            state.items = (state.items || []).filter((e) => !dead[pickIdOf(e)]);
            list.forEach((e) => { delete state.selected[pickIdOf(e)]; });
        };
        // 没有网格（外壳没开）→ 数据照摘，退回整页渲染，保证状态一致
        if (!grid || !state.overlayOpen) { takeOutData(); renderAll(); return true; }
        hideHover();
        if (detailEntry && dead[pickIdOf(detailEntry)]) closeDetail();   // 正看着这条详情 → 关掉
        // 先摘 DOM 再从数据里摘：卡片一断连，后面 orderCardsInGrid 就不会再认它
        list.forEach((e) => {
            const card = e._card;
            if (card && card.isConnected) card.remove();
            e._card = null;
        });
        takeOutData();
        state.filtered = currentList();
        state.rendered = orderCardsInGrid();
        if (!state.filtered.length) {
            grid.innerHTML = '<div class="mw-empty">没有可展示的影片<br>换个目录，或检查「库根目录」设置</div>';
            const more0 = $('#mw-loadmore');
            if (more0) more0.textContent = '';
            updateStats();
            renderOpsBar();
            return true;
        }
        renderMore(list.length);   // 摘掉几张就补几张（原本还没渲染的顶上），保持一屏的卡片数量
        updateStats();
        renderOpsBar();
        return true;
    }

    /** 预演 + 执行（移动/删除都走这里） */
    async function runBatchOps(action) {
        if (state.opsRunning) { toast('已有批量操作在进行中', 'info', 2200); return; }
        const entries = selectedEntries();
        if (!entries.length) { toast('先勾选要处理的影片', 'info', 2600); return; }
        if (action === 'move' && !(state.moveTarget && state.moveTarget.cid)) {
            toast('先点「选择目标目录」', 'info', 3000);
            return;
        }
        const target = state.moveTarget;
        const withSidecars = !!CFG.batchWithSidecars;
        state.opsRunning = true;
        renderOpsBar();
        setBusy(true, '正在核对同目录的刮削产物…');
        let plan = null;
        try {
            plan = await planOps(entries);
        } catch (e) {
            setBusy(false);
            state.opsRunning = false;
            renderOpsBar();
            toast('核对失败：' + e.message, 'error', 4200);
            return;
        }
        setBusy(false);
        const vids = plan.videos.length;
        const scs = withSidecars ? plan.sidecars.length : 0;
        const line = (action === 'move' ? '要移动 ' : '要删除 ') + vids + ' 部影片' +
            (scs ? ' + ' + scs + ' 件刮削产物' : '');
        const lines = [
            line,
            '涉及 ' + plan.dirs + ' 个目录',
            withSidecars
                ? '（已开「连带刮削产物」：同目录的海报 / 缩略图 / 背景图 / NFO 一起处理）'
                : '（未连带产物：海报和 NFO 会留在原目录，变成没人认领的孤儿文件）'
        ];
        if (action === 'move') lines.push('目标目录：' + (target.name || target.cid));
        else lines.push('115 侧是删除到回收站，之后可以还原。');
        if (plan.failed.length) lines.push('注意：有 ' + plan.failed.length + ' 个目录读取失败，这些条目按「没有产物」处理。');
        lines.push('', '确定继续？');
        if (!confirm(lines.join('\n'))) {
            state.opsRunning = false;
            renderOpsBar();
            return;
        }
        state.opsRunning = true;
        renderOpsBar();
        let done = 0;
        try {
            if (action === 'move') {
                // 先搬产物再搬视频：中途失败时产物已在新目录等着，不会两头都不在
                if (scs) {
                    setBusy(true, '移动刮削产物 ' + plan.sidecars.length + ' 件…');
                    await moveFidsTo(plan.sidecars.map((s) => s.fid), target.cid);
                }
                setBusy(true, '移动影片 ' + vids + ' 部…');
                done = await moveFidsTo(plan.videos.map((v) => v.fid), target.cid);
            } else {
                // 先删视频再删产物：失败时最多留下孤儿产物，不会出现「产物删了、视频还在」
                setBusy(true, '删除影片 ' + vids + ' 部…');
                const byDir = new Map();
                plan.videos.forEach((v) => {
                    if (!byDir.has(v.cid)) byDir.set(v.cid, []);
                    byDir.get(v.cid).push(v.fid);
                });
                for (const pair of byDir) done += await deleteFidsFrom(pair[0], pair[1]);
                if (scs) {
                    setBusy(true, '删除刮削产物 ' + plan.sidecars.length + ' 件…');
                    const scByDir = new Map();
                    plan.sidecars.forEach((s) => {
                        if (!scByDir.has(s.cid)) scByDir.set(s.cid, []);
                        scByDir.get(s.cid).push(s.fid);
                    });
                    for (const pair of scByDir) await deleteFidsFrom(pair[0], pair[1]);
                }
            }
            // 处理过的条目已经不在这个位置了 → 原地摘掉卡片：不整页重渲染，
            // 图不重下、滚动位置不动，看着就像卡片被「拿走」了而不是刷新了一次
            // 用 uid 圈定「这次真的动过的」条目 —— 用 key 的话，同番号但没勾选的版本会被一起摘掉
            const gone = Object.create(null);
            plan.videos.forEach((v) => { gone[v.uid] = 1; });
            dropEntriesInPlace(entries.filter((e) => gone[pickIdOf(e)]));
            toast(action === 'move'
                ? '已移动 ' + done + ' 部影片' + (scs ? ' + ' + scs + ' 件产物' : '') + ' → ' + (target.name || target.cid)
                : '已删除 ' + done + ' 部影片' + (scs ? ' + ' + scs + ' 件产物' : '') + '（回收站里可还原）',
                'success', 6000);
        } catch (e) {
            toast((action === 'move' ? '移动' : '删除') + '失败：' + e.message, 'error', 6000);
        } finally {
            state.opsRunning = false;
            setBusy(false);
            renderOpsBar();
        }
    }

    function buildOverlay() {
        if ($('#mw-overlay')) return;
        const ov = document.createElement('div');
        ov.id = 'mw-overlay';
        ov.innerHTML = `
            <div class="mw-head">
                <div class="mw-logo">影片墙</div>
                <div class="mw-modes">
                    <button data-mode="dir" class="on">当前文件夹</button>
                    <button data-mode="lib">全库</button>
                </div>
                <input class="mw-input mw-search" placeholder="搜索番号 / 文件名 / 译名">
                <select class="mw-input mw-sort">
                    <option value="code">按番号</option>
                    <option value="name">按文件名</option>
                    <option value="path">按目录</option>
                    <option value="actor">按演员</option>
                    <option value="type">按类型</option>
                    <option value="rating">按评分（高→低）</option>
                    <option value="watch">按观看日期（新→旧）</option>
                    <option value="random">随机排序</option>
                </select>
                <button class="mw-btn" data-act="shuffle" style="display:none" title="重新洗牌（随机排序）">换一批</button>
                <button class="mw-btn" data-act="setroot">设为库根目录</button>
                <button class="mw-btn" data-act="diag">自检</button>
                <button class="mw-btn" data-act="settings">设置</button>
                <button class="mw-btn primary" data-act="refresh">刷新</button>
                <div class="mw-spacer"></div>
                <button class="mw-btn" data-act="close">关闭 (Esc)</button>
            </div>
            <div class="mw-stats" id="mw-stats"></div>
            <div id="mw-busy" style="display:none;padding:9px 18px;font-size:13px;color:#8fe3ff;background:#0e131b;border-bottom:1px solid #161c26;"></div>
            <div class="mw-ops" id="mw-ops">
                <span id="mw-ops-count">勾选卡片可批量移动 / 删除</span>
                <button class="mw-btn" data-act="pick-all">全选本页</button>
                <button class="mw-btn" data-act="pick-none">清空选择</button>
                <label class="mw-ops-tgl" title="移动/删除时把同目录的海报、缩略图、背景图、NFO 一起处理">
                    <input type="checkbox" id="mw-with-sidecars" checked> 连带刮削产物
                </label>
                <button class="mw-btn" data-act="pick-target">选择目标目录</button>
                <span class="mw-ops-tgt" id="mw-ops-target">未选择目标</span>
                <button class="mw-btn" data-act="move-sel">移动</button>
                <button class="mw-btn danger" data-act="delete-sel">删除</button>
            </div>
            <div class="mw-body"><div class="mw-grid" id="mw-grid"></div><div class="mw-loadmore" id="mw-loadmore"></div></div>
        `;
        document.body.appendChild(ov);

        $$('.mw-modes button', ov).forEach((b) => {
            b.addEventListener('click', () => {
                state.mode = b.dataset.mode;
                $$('.mw-modes button', ov).forEach(x => x.classList.toggle('on', x === b));
                renderAll();
                reload(false);
            });
        });
        $('.mw-search', ov).addEventListener('input', (e) => {
            state.keyword = e.target.value.trim();
            renderAll();
        });
        // 重建外壳时把排序下拉同步回当前状态（state.sort 是会话级的，不跟着 DOM 重建）
        const sortSel = $('.mw-sort', ov);
        if (sortSel && Array.from(sortSel.options).some((o) => o.value === state.sort)) sortSel.value = state.sort;
        // 「换一批」只在随机排序时露出来（写成函数声明，会被提升，所以放在使用点之后也安全）
        function updateShuffleBtn() {
            const b = $('[data-act="shuffle"]', ov);
            if (b) b.style.display = state.sort === 'random' ? '' : 'none';
        }
        updateShuffleBtn();
        $('.mw-sort', ov).addEventListener('change', (e) => {
            state.sort = e.target.value;
            updateShuffleBtn();
            renderAll();
            if (META_SORTS[state.sort]) {
                // 卡片是懒加载的，不预取一轮就只有「已经滚出来的那些」参与排序
                prefetchMetaForSort();
                scheduleResort();
                toast('正在补齐演员/类型/评分（读视频同目录的 NFO，不抓站）…', 'info', 3200);
            } else if (state.sort === 'watch') {
                const n = (state.items || []).filter((x) => x.item && x.item.watchedAt).length;
                toast(n
                    ? `按观看日期排序：${n} 条有播放记录，没看过的排在最后`
                    : '这批文件都没有播放记录（115 只记录播放过的文件），顺序会退化为按番号',
                    'info', 3600);
            }
        });

        // 批量操作区的「连带刮削产物」开关（记住选择）
        const withSc = $('#mw-with-sidecars', ov);
        if (withSc) {
            withSc.checked = !!CFG.batchWithSidecars;
            withSc.addEventListener('change', () => {
                CFG.batchWithSidecars = !!withSc.checked;
                saveCfg();
                renderOpsBar();
            });
        }
        renderOpsBar();
        // 缓存任务的进度条点一下就停（v3.10）
        const busyEl = $('#mw-busy', ov);
        if (busyEl) busyEl.addEventListener('click', () => { if (cacheSt().running) stopCacheLocal(); });
        $$('.mw-btn', ov).forEach((b) => {
            b.addEventListener('click', async () => {
                const act = b.dataset.act;
                if (act === 'close') closeOverlay();
                else if (act === 'refresh') await reload(true);
                else if (act === 'settings') buildSettingsPanel();
                else if (act === 'diag') { buildSettingsPanel('scrape'); runReadDiag(); }
                else if (act === 'shuffle') {
                    state.shuffleSeed = Math.floor(Math.random() * 1e9);
                    renderAll();
                    toast('已重新洗牌', 'info', 1600);
                }
                else if (act === 'pick-all') pickAllVisible();
                else if (act === 'pick-none') clearSelection();
                else if (act === 'pick-target') pickTargetDir();
                else if (act === 'move-sel') await runBatchOps('move');
                else if (act === 'delete-sel') await runBatchOps('delete');
                else if (act === 'setroot') {
                    const cid = currentCid();
                    state.rootCid = cid;
                    GM_setValue(STORE_ROOT, cid);
                    GM_setValue(STORE_ROOT_NAME, '');
                    toast('库根目录已设为当前目录 (cid=' + cid + ')', 'success', 3000);
                    updateStats();
                }
            });
        });
        $('.mw-body', ov).addEventListener('scroll', (e) => {
            const el = e.target;
            if (el.scrollTop + el.clientHeight > el.scrollHeight - 500 && state.rendered < state.filtered.length) renderMore();
        });
        document.addEventListener('keydown', (e) => {
            if (!$('#mw-overlay')) return;
            if (e.key === 'Escape') {
                if ($('#mw-set-overlay')) $('#mw-set-overlay').remove();
                else closeOverlay();
            } else if (e.key === '/' && document.activeElement !== $('.mw-search', ov)) {
                e.preventDefault();
                $('.mw-search', ov).focus();
            }
        });
        state.overlayOpen = true;
    }

    async function openOverlay() {
        buildOverlay();
        state.curCid = currentCid();
        await restoreCacheFolder();          // 恢复上次选的缓存文件夹（可能要重新授权）
        await refreshRawNfoCount();
        await reload(false);
        state.overlayOpen = true;
        // 打开时就把「素材存在哪、存了多少」算出来，统计栏立刻有数
        updateStats();
    }
    function closeOverlay() {
        hideHover();
        stopCacheLocal(true);                // 关窗就停掉后台本地化（已存下的都保留）
        const ov = $('#mw-overlay');
        if (ov) ov.remove();
        state.overlayOpen = false;
        clearCoverBlobs();
        if (posterDirty) { posterDirty = false; stripVolatileFromPosterCache(); saveJson(STORE_POSTER, posterCache); }
        if (transDirty) { transDirty = false; saveJson(STORE_TRANS, transCache); }
        flushNfoStore();                                     // NFO 解析结果落盘（下次秒开的关键）
        if (imgMetaDirty) { imgMetaDirty = false; saveJson(STORE_IMG_META, imgMeta); }
        if (dirIndexDirty) writeDirIndex();
        if (CFG.folderCache && CFG.saveOnClose) writeFolderCache(state.curCid, false);
    }

    function injectFab() {
        if ($('#mw-fab') || !document.body) return;
        const b = document.createElement('div');
        b.id = 'mw-fab';
        b.className = 'mw-fab';
        b.textContent = '影片墙';
        b.title = '把当前目录（或全库）的影片渲染成海报墙';
        b.addEventListener('click', openOverlay);
        document.body.appendChild(b);
    }
    (function waitBody() {
        if (document.body) { injectFab(); return; }
        let n = 0;
        const t = setInterval(() => {
            if (document.body) { clearInterval(t); injectFab(); }
            else if (++n > 100) clearInterval(t);
        }, 300);
    })();

    try {
        GM_registerMenuCommand('打开影片墙', openOverlay);
        GM_registerMenuCommand('影片墙设置', buildSettingsPanel);
        GM_registerMenuCommand('把当前目录设为影片库根目录', () => {
            const cid = currentCid();
            state.rootCid = cid;
            GM_setValue(STORE_ROOT, cid);
            toast('已把当前目录设为影片库根目录 (cid=' + cid + ')', 'success', 3000);
        });
        GM_registerMenuCommand('自检读取链路（NFO/海报）', runReadDiag);
    } catch (e) { /* ignore */ }

    // 调试/测试出口（命名空间隔离）
    try {
        window.__mw = {
            extractCode, codeToDmmId, isUncensored, stripExt, normalizeNum,
            scanVideos, normalizeItem, resolvePoster, translateText,
            readFolderCache, writeFolderCache, collectCacheEntries, mergeCachePayload,
            uploadTextToCid, downloadTextByPickcode, buildSigVariants, md5Hex,
            buildSettingsPanel, openOverlay, closeOverlay, renderAll, reload,
            currentList, sortList, sortByMetaText, sortByRating, resortInPlace,
            sortByWatch, sortByRandom, hashSeed,
            fmtDuration, bitrateOf, fmtBitrate, watchText, fmtVideoSize, fileInfoParts, fileDetailText,
            sidecarItemsOf, planOps, moveFidsTo, deleteFidsFrom,
            selectedEntries, pickIdOf, togglePick, pickAllVisible, clearSelection, syncPickUi, renderOpsBar,
            pickTargetDir, runBatchOps, dropEntriesInPlace,
            getShuffleSeed: () => state.shuffleSeed,
            setShuffleSeed: (n) => { state.shuffleSeed = Number(n) || 0; },
            orderCardsInGrid, prefetchMetaForSort, META_SORTS,
            applySettings, buildOverlay, applyPoster, fillCard, buildCard, updateStats, titleText, subText,
            hubConfigured, hubFetch, hubLogin, hubApi, hubScrapedMap, attachHubData,
            hubTranslate, translateEntries, posterURL, coverSrc, clearCoverBlobs, hubHeaders,
            hubStats, hubFacets, hubScan, hubScrapeMissing,
            hubItemToRec, hydrateFromHub, hubInfoHtml, getHubCache: () => hubItemsCache,
            sidecarOf, buildSidecarMap, sidecarImage, sidecarFile, upgradeThumbUrl, sidecarHitCount,
            cardImageFile, cardImageRoles, pickSidecarFile, sidecarRec, widePref,
            parseNfo, xmlText, decodeXmlEntities,
            readEntryNfo, resolveFromSidecar, toEntries,
            signedFileUrl, hiResImage, upgradePosterToOriginal, runReadDiag, diagInfoHtml,
            readFileText, decodeBytes, getLastRead: () => ({ via: lastReadVia, error: lastReadError }),
            normCode, isRealTitle, mergeMeta,             getBlobCache: () => blobCache,
            // 本地缓存（v3.9）
            getNfoStore: () => nfoStore,
            nfoCacheGet, nfoCachePut, nfoCacheStats, clearNfoCache, flushNfoStore,
            getNfoHits: () => ({ local: nfoHitLocal, net: nfoHitNet }),
            getImgHits: () => ({ local: imgHitLocal, net: imgHitNet }),
            imgCacheGet, imgCachePut, imgCacheBytes, imgCacheCount, clearImgCache, pruneImgCache,
            imgStoreAvailable, getImgMeta: () => imgMeta,
            listSignature, applyDirList, refreshDirInBackground, refreshLibInBackground, scanLibAndSave,
            loadDirMode, loadLibMode,
            applyNfoToRec, saveDirCache, clearDirCaches, getDirKeys: () => dirKeys, DIR_TTL_MS, cacheInfoHtml,
            warmNfoCache, cacheSummaryText, escHtml, stripThumbUrls, THUMB_MIN_BYTES, TINY_SIDECAR_BYTES,
            // v3.10 素材实时本地化 + 缓存位置
            cacheNfoLocally, warmImgCache, cacheAllLocal, stopCacheLocal, maybeAutoCacheLocal,
            cacheSt, setCacheBar, applyCachedNfoToEntry,
            rawNfoPut, rawNfoGet, rawNfoAll, rawNfoCountReal, refreshRawNfoCount, clearRawNfo,
            exportRawNfo, idbMetaGet, idbMetaPut,
            folderMode, folderSupported, activeBackend, folderBlockReason, folderInfoHtml,
            pickCacheFolder, reauthorizeCacheFolder, forgetCacheFolder, restoreCacheFolder,
            migrateLocalCache, loadDirIndex, writeDirIndex, safeFilePart, extOfBlob,
            getDirFiles: () => dirFiles, getDirName: () => (dirHandle && dirHandle.name) || '',
            isDirNeedPermission: () => dirNeedPermission,
            stripVolatileFromPosterCache, stripVolatileImgFromRec, VOLATILE_IMG_RE,
            setDirHandle: async (h) => { dirHandle = h; dirNeedPermission = false; await loadDirIndex(); },
            getRawCount: () => rawNfoCount,
            // v3.11 详情面板
            renderDetailHtml, detailMetaRows, openDetail, closeDetail, setSeriesOf,
            getDetailEntry: () => detailEntry,
            // v3.12 批量操作后原地摘卡片（不整页刷新）
            // v3.13 横版卡片也可用竖版海报（整张显示 + 模糊铺底）
            applyCardArtFit, clearCardArtFit,
            state, getCache: () => posterCache, setCache: (o) => { posterCache = o; },
            getTrans: () => transCache, CFG_DEF,
            getCfg: () => CFG, setCfg: (o) => { CFG = Object.assign(CFG, o); },
            saveCfg: saveCfg
        };
    } catch (e) {
        console.error('[115影片墙] 调试出口挂载失败（不影响主功能）:', e && e.message);
    }

    console.log('[115影片墙] v3.13.2 已加载（横版卡片默认用「横版高清」＝ -thumb/-fanart 里挑最大的那张；海报太小会自动换清晰图）');
})();
