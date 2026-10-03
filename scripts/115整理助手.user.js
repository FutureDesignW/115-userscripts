// ==UserScript==
// @name            115整理助手 (115Rename2026 + 递归整理)
// @namespace       https://github.com/liuchanghuaX1/115Rename2026
// @version         2.8.0
// @description     在 115Rename2026 基础上整合「递归整理」：递归扫描当前目录及全部子目录 → 去掉文件名里的干扰词 → 抽取番号 → 视频汇总到当前目录 → 按所选「重命名方式」改名（本地优先，缺信息的条目才联网） → 清空已空的子目录。重命名方式 7 种可选，并支持**在整理预览面板里就地自定义模板**（`{code}{title}{actress}{date}{rating}{markers}` 变量按钮、实时重算、不联网）。改名后可在菜单里**一键撤销上次改名**。
// @author          sonarlee (原始引擎) + 递归整理整合
// @include         https://115.com/*
// @icon            https://115.com/favicon.ico
// @domain          javbus.com
// @domain          javlibrary.com
// @domain          xslist.org
// @domain          javdb.com
// @domain          fc2ppvdb.com
// @domain          avsox.host
// @domain          avmoo.host
// @connect         javbus.com
// @connect         javlibrary.com
// @connect         xslist.org
// @connect         javdb.com
// @connect         webapi.115.com
// @connect         fc2ppvdb.com
// @connect         client-rapi-missav.recombee.com
// @connect         oneshot-free.www.deepl.com
// @connect         api.mymemory.translated.net
// @connect         avsox.host
// @connect         avmoo.host
// @grant           GM_notification
// @grant           GM_xmlhttpRequest
// @grant           GM_setValue
// @grant           GM_getValue
// @grant           GM_deleteValue
// @grant           GM_setClipboard
// @grant           GM_registerMenuCommand
// @grant           GM_addStyle
// @license         MIT
// @homepageURL     https://github.com/liuchanghuaX1/115Rename2026
// @supportURL      https://github.com/liuchanghuaX1/115Rename2026/issues
// ==/UserScript==

(function () {
    'use strict';

    // ========================================================================
    // 1. 常量与映射（可独立维护）
    // ========================================================================

    /** 女优别名映射表 */
    const ACTRESS_ALIAS_MAP = {
        '三上悠亜': '三上悠亚', 'Mikami Yua': '三上悠亚',
        '深田えいみ': '深田咏美', 'Fukada Eimi': '深田咏美',
        '天使もえ': '天使萌', 'Amatsuka Moe': '天使萌',
        '桃乃木かな': '桃乃木香奈', 'Momonogi Kana': '桃乃木香奈',
        '凪ひかる': '凪光', 'Nagi Hikaru': '凪光',
        '坂道みる': '坂道美琉', 'Sakamichi Miru': '坂道美琉',
        '高橋しょう子': '高桥圣子', 'Takahashi Shoko': '高桥圣子',
        '河北彩花': '河北彩花', 'Kawakita Saika': '河北彩花',
        '松本いちか': '松本一香', 'Matsumoto Ichika': '松本一香',
        '桜空もも': '樱空桃', 'Sakura Momo': '樱空桃',
        '涼森れむ': '凉森玲梦', 'Suzumori Remu': '凉森玲梦',
        '北野未奈': '北野未奈', 'Kitano Mina': '北野未奈',
        '美谷朱里': '美谷朱里', 'Mitani Akari': '美谷朱里',
        '七沢みあ': '七泽米亚', 'Nanasawa Mia': '七泽米亚',
        '宮下玲奈': '宫下玲奈', 'Miyashita Rena': '宫下玲奈',
        '紗倉まな': '纱仓真菜', 'Sakura Mana': '纱仓真菜',
        '本庄鈴': '本庄铃', 'Honjou Suzu': '本庄铃',
        '西宮ゆめ': '西宫梦', 'Nishimiya Yume': '西宫梦',
        '鈴木真夕': '铃木真夕', 'Suzuki Mayu': '铃木真夕',
        '古川いおり': '古川伊织', 'Furukawa Iori': '古川伊织',
        '葵司': '葵司', 'Aoi Tsukasa': '葵司',
        '波多野結衣': '波多野结衣', 'Hatano Yui': '波多野结衣',
        '小倉奈々': '小仓奈奈', 'Ogura Nana': '小仓奈奈',
        '鈴木心春': '铃木心春', 'Suzuki Koharu': '铃木心春',
        '八掛うみ': '八挂海', 'Yakeno Umi': '八挂海',
        '横宮七海': '横宫七海', 'Yokomiya Nanami': '横宫七海',
        '八木奈々': '八木奈奈', 'Yagi Nana': '八木奈奈',
        '安齋らら': '安斋拉拉', 'Anzai Rara': '安斋拉拉',
        '橋本ありな': '桥本有菜', 'Hashimoto Arina': '桥本有菜',
        '三宮つばき': '三宫椿', 'Sannomiya Tsubaki': '三宫椿',
        '山手梨愛': '山手梨爱', 'Yamamate Ria': '山手梨爱',
        '神宮寺ナオ': '神宫寺奈绪', 'Jinguji Nao': '神宫寺奈绪',
        '小倉由菜': '小仓由菜', 'Ogura Yuna': '小仓由菜',
        '七瀬アリス': '七濑爱丽丝', 'Nanase Alice': '七濑爱丽丝',
        '沖田杏梨': '冲田杏梨', 'Okita Anri': '冲田杏梨',
        '白石茉莉奈': '白石茉莉奈', 'Shiraishi Marina': '白石茉莉奈',
        '大槻ひびき': '大槻响', 'Otsuki Hibiki': '大槻响',
        '友田彩也香': '友田彩也香', 'Tomoda Ayaka': '友田彩也香',
        '希崎ジェシカ': '希崎杰西卡', 'Kizaki Jessica': '希崎杰西卡',
        '希岛あいり': '希岛爱理', 'Kijima Airi': '希岛爱理',
        '小湊よつ葉': '小凑四叶', 'Kominato Yotsuha': '小凑四叶',
        '奥田咲': '奥田咲', 'Okuda Saki': '奥田咲',
        '推川ゆうり': '推川悠里', 'Oshikawa Yuuri': '推川悠里',
        '伊藤舞雪': '伊藤舞雪', 'Ito Miyuki': '伊藤舞雪',
        '美谷朱音': '美谷朱音', 'Mitani Akane': '美谷朱音',
        '天海つばさ': '天海翼', 'Amami Tsubasa': '天海翼',
        '初川みなみ': '初川南', 'Hatsukawa Minami': '初川南',
        '浜崎真緒': '滨崎真绪', 'Hamasaki Mao': '滨崎真绪',
        '上原亜衣': '上原亚衣', 'Uehara Ai': '上原亚衣',
        '彩美旬果': '彩美旬果', 'Ayami Shunka': '彩美旬果',
        '大橋未久': '大桥未久', 'Ohashi Mihuku': '大桥未久',
        '吉沢明歩': '吉泽明步', 'Yoshizawa Akiho': '吉泽明步',
        '蒼井そら': '苍井空', 'Sora Aoi': '苍井空',
        '小澤マリア': '小泽玛利亚', 'Ozawa Maria': '小泽玛利亚',
        'JULIA': 'JULIA', 'AIKA': 'AIKA', 'RION': 'RION',
        'Rio': 'Rio', 'Momo': 'Momo',
    };

    /** 番号前缀库（手动维护长前缀，后续自动生成双字母和单字母） */
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

    /** 垃圾词列表（用于过滤文件命名中的无用字符串） */
    const GARBAGE_WORDS = [
        'WWW', 'FHD', 'HD', 'SD', 'X264', 'X265', 'H264', 'H265', 'HEVC', 'AVC',
        'AAC', 'AC3', 'DTS', 'FLAC', 'MP3', 'MP4', 'MKV', 'AVI', 'WMV', 'M4V', 'RMVB', 'ISO', 'TS',
        'WATERMARK', 'RARBG', 'WEB-DL', 'WEBRIP', 'BLURAY', 'BDREMUX',
        '1440P', '1080P', '720P', '480P'
    ];

    /** 标记关键词及转换映射 */
    const MARKER_MAP = {
        leak: '流出', leaked: '流出', 流出: '流出',
        uncensored: '无码', 無修正: '无码', 无码: '无码',
        chs: '中文字幕', cht: '中文字幕', gb: '中文字幕', big5: '中文字幕', sc: '中文字幕', chinese: '中文字幕',
        中字: '中文字幕', 字幕: '中文字幕', 中文: '中文字幕', 中文字幕: '中文字幕',
        '4k': '4K', '8k': '8K', '60fps': '60fps', '120fps': '120fps',
        破解: '破解', '2160p': '4K', vr: 'VR'
    };
    const MARKER_PATTERN = /(4K|8K|60fps|120fps|破解|流出|leak(?:ed)?|無修正|无码|uncensored|中字|字幕|chinese|chs|cht|big5|gb|sc|中文字幕|2160p|VR)/gi;
    const AD_BADGES = /\[3Q\]|\(原\)|\[BT\]|【广告】|\[廣告\]/gi;

    // ========================================================================
    // 1.5 干扰词词典（可自学习）
    //     文件名里的站点标签 / 画质词 / 编码词都是「噪声」：留着会让番号难认，
    //     拼进新名字又长又乱。这里维护一份「可学习」的词典，整理时统一去掉。
    //
    //     ⚠️ 语义标记不算干扰词：中字 / 无码 / 破解 / 流出 / 4K / 8K / VR…
    //        它们会被整理成【中文字幕】这类正式标记，剥掉就丢信息了。
    //     ⚠️ 判据宁严勿宽：学错一个词的代价是整库名字被擦坏。
    // ========================================================================

    /** 种子词：见到就去掉（**不含**语义标记，也不含单字母 'C'/'AV' 这类可能是番号一部分的） */
    const NOISE_SEEDS = [
        // 站点 / 发布组 / 网盘分享标记
        'BBS2048', 'BBS2048.TV', 'HHD800.COM', 'HHD800', '98T.LA', 'GG5.CO', 'AVGLE', 'SEX8',
        'SIS001', 'T66Y', 'JAVBUS', 'JAVDB', 'JAVLIBRARY', 'JAV321', 'DMM', 'FANZA', 'R18',
        'MAGNET', 'TORRENT', 'BT', 'MRBIG', 'NICEHASH', 'AVMOO', 'AVSOX', 'XSLIST',
        // 画质 / 编码 / 容器 / 来源
        'FHD', 'UHD', 'SD', 'HD', 'X264', 'X265', 'H264', 'H265', 'HEVC', 'AVC', 'VP9', 'AV1',
        'AAC', 'AC3', 'DTS', 'FLAC', 'MP3', 'MP4', 'MKV', 'AVI', 'WMV', 'M4V', 'RMVB', 'ISO', 'TS',
        'WEB-DL', 'WEBRIP', 'WEB', 'BLURAY', 'BDRIP', 'BDREMUX', 'REMUX', 'HDR',
        '1440P', '1080P', '720P', '480P', '2160P', '60FPS', '30FPS',
        'WATERMARK', 'NOWATER', 'RARBG', 'YIFY',
        // 中文常见填充词（「高清」这种形容词）
        '高清', '未删减', '无删减', '完整版'
    ];

    /** 哪些纯字母词再短也确实是噪声（其余纯字母一律不学） */
    const SAFE_LETTER_WORDS = [
        'HD', 'FHD', 'UHD', 'SD', 'SUB', 'SUBS', 'LEAK', 'BD', 'WEB', 'TS', 'ISO',
        'MP4', 'MKV', 'AVI', 'HDR', 'HEVC', 'AVC', 'AAC', 'DTS', 'RARBG', 'YIFY'
    ];

    /** 像番号、或像哈希碎片 → 一律不学（学错就把番号擦了） */
    const CODE_LIKE_RES = [
        /^[A-Z]{1,10}\d{1,6}$/,        // SSIS001 / T28123 / BBS2048
        /^\d{1,6}[A-Z]{1,10}$/,        // 259LUXU
        /^\d{1,8}$/,                   // 12345
        /^\d{2,4}[A-Z]{2,8}\d{2,4}$/,  // 259LUXU593
        /^[A-Z]{2,12}$/                // 纯字母：SSIS / MURIKURI
    ];

    /** 方括号 / 圆括号 / 书名号等成对包裹的内容（括号里几乎不可能是番号） */
    const BRACKET_BLOB_RE = /\[([^\]]*)\]|【([^】]*)】|\(([^)]*)\)|（([^）]*)）|\{([^}]*)\}|《([^》]*)》|「([^」]*)」|『([^』]*)』/g;
    const NOISE_TOKEN_SRC = "[A-Za-z0-9][A-Za-z0-9.\\-']*";

    /** 语义标记归一化：'中字' → '中文字幕'，'uncensored' → '无码'，'4k' → '4K' */
    const markerOf = (word) => {
        const w = String(word || '').trim();
        if (!w) return '';
        return MARKER_MAP[w] || MARKER_MAP[w.toLowerCase()] || '';
    };

    const NOISE_STORE_KEY = 'organizeNoiseLearned';
    let noiseLearned = {};
    try {
        const rawNoise = GM_getValue(NOISE_STORE_KEY, '');
        if (rawNoise) noiseLearned = JSON.parse(rawNoise) || {};
    } catch (e) { noiseLearned = {}; }
    const saveNoiseDict = () => {
        try { GM_setValue(NOISE_STORE_KEY, JSON.stringify(noiseLearned)); } catch (e) { /* ignore */ }
    };
    const noiseTokens = () => Object.keys(noiseLearned);
    const noiseSet = () => {
        const set = Object.create(null);
        NOISE_SEEDS.forEach(w => { set[String(w).toUpperCase()] = 1; });
        noiseTokens().forEach(w => { set[String(w).toUpperCase()] = 1; });
        return set;
    };

    /** 这个词能不能学成干扰词 */
    const isSafeNoiseToken = (token) => {
        const t = String(token || '').trim().toUpperCase();
        if (t.length < 2 || t.length > 32) return false;
        if (noiseSet()[t]) return true;                       // 已在词典（种子/人工加的）→ 认可
        if (SAFE_LETTER_WORDS.indexOf(t) >= 0) return true;
        if (/[぀-ヿ㐀-鿿]/.test(t)) return false;              // 含假名/汉字 → 可能是片名或演员，不学
        if (/^[0-9A-F]{8,}$/.test(t) && /[0-9]/.test(t)) return false;   // 纯十六进制长串 = 哈希碎片
        for (let i = 0; i < CODE_LIKE_RES.length; i++) {
            if (CODE_LIKE_RES[i].test(t)) return false;
        }
        return true;    // 含点/撇（PSK.LA / HHD800.COM）这类可以学
    };

    /** 从一对 (文件名, 已知番号) 里挖干扰词。tags 是方括号标签（见到就学），tokens 需要更多证据 */
    const learnNoisePair = (fileName, code) => {
        const name = String(fileName || '');
        const codeKey = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const tags = [], tokens = [];
        const likeCode = (word) => {
            const flat = String(word || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (!flat || flat.length < 3) return false;
            if (!codeKey) return false;
            return codeKey === flat || codeKey.indexOf(flat) >= 0 || flat.indexOf(codeKey) >= 0;
        };
        // ① 方括号标签
        const bracketRe = new RegExp(BRACKET_BLOB_RE.source, 'g');
        let m;
        while ((m = bracketRe.exec(name))) {
            const inner = String(m.slice(1).find(x => x !== undefined) || '').trim();
            if (!inner || inner.length > 40) continue;
            if (markerOf(inner) || likeCode(inner)) continue;
            tags.push(inner.toUpperCase());
        }
        // ② 番号之外的残留词
        const dict = noiseSet();
        const tokenRe = new RegExp(NOISE_TOKEN_SRC, 'g');
        let t;
        while ((t = tokenRe.exec(name))) {
            let tok = t[0];
            while (tok.length > 1 && /[.\-']$/.test(tok)) tok = tok.slice(0, -1);
            const key = tok.toUpperCase();
            if (key.length < 3 || dict[key] || markerOf(key) || likeCode(key)) continue;
            tokens.push(key);
        }
        return { tags, tokens };
    };

    /** 学一批。minHits 是「非方括号词」的晋级门槛，默认 2 次 —— 只出现一次的词不学 */
    const learnNoise = (pairs, minHits) => {
        const need = Math.max(1, Number(minHits) || 2);
        const list = pairs || [];
        const counts = {}, tags = {};
        list.forEach(p => {
            const name = Array.isArray(p) ? p[0] : (p && p.name);
            const code = Array.isArray(p) ? p[1] : (p && p.code);
            const hit = learnNoisePair(name, code);
            hit.tags.forEach(k => { tags[k] = (tags[k] || 0) + 1; });
            hit.tokens.forEach(k => { counts[k] = (counts[k] || 0) + 1; });
        });
        const added = [];
        const put = (key, hits) => {
            if (!noiseLearned[key]) added.push(key);
            const meta = noiseLearned[key] || { hits: 0 };
            meta.hits = (meta.hits || 0) + hits;
            meta.ts = Date.now();
            noiseLearned[key] = meta;
        };
        // 方括号标签：见到就学（站点标签几乎只出现在括号里）
        Object.keys(tags).forEach(k => { if (k) put(k, tags[k]); });
        // 普通词：达到门槛才学
        Object.keys(counts).forEach(k => {
            if (counts[k] < need) return;
            if (!isSafeNoiseToken(k)) return;
            put(k, counts[k]);
        });
        if (added.length) saveNoiseDict();
        return { scanned: list.length, added: added, learned: noiseTokens().length, counts: counts, tags: tags };
    };

    /** 人工加 / 删一个词 */
    const teachNoise = (token, action) => {
        const key = String(token || '').trim().toUpperCase();
        if (!key) return { ok: false, msg: '空词' };
        if (action === 'remove') {
            delete noiseLearned[key];
            saveNoiseDict();
            return { ok: true, removed: key, learned: noiseTokens().length };
        }
        if (!isSafeNoiseToken(key)) return { ok: false, msg: '这个词像番号/哈希，拒绝学习：' + key };
        const meta = noiseLearned[key] || { hits: 0 };
        meta.hits = (meta.hits || 0) + 1;
        meta.manual = true;
        meta.ts = Date.now();
        noiseLearned[key] = meta;
        saveNoiseDict();
        return { ok: true, added: key, learned: noiseTokens().length };
    };

    /** 单轮摘词：按「词典里的词」做最长匹配，命中就按字符区间删掉。
        用词边界而不是先分词 —— 否则 'SSIS-001-4K-x265' 会被当成一个整词，
        里面的 4K/x265 就漏掉了。不重排、不改大小写、不动两侧分隔符。 */
    const stripNoiseOnce = (text, dict, removed) => {
        const keys = Object.keys(dict).filter(k => String(k).length >= 2);
        if (!keys.length) return text;
        keys.sort((a, b) => b.length - a.length);                 // 长的优先：WEB-DL 先于 WEB
        const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(keys.map(esc).join('|'), 'gi');
        const isWordChar = (c) => /[A-Za-z0-9]/.test(c);
        const spans = [];
        let m;
        while ((m = re.exec(text))) {
            const start = m.index;
            const end = start + m[0].length;
            re.lastIndex = end;                                   // 不重叠匹配
            if (isWordChar(text.charAt(start - 1)) || isWordChar(text.charAt(end))) continue;
            if (markerOf(m[0])) continue;                         // 语义标记不动
            // 别把番号拆坏：'TS-123' / '123-TS' 这种贴着数字的不动
            if (text.charAt(end) === '-' && /[0-9]/.test(text.charAt(end + 1))) continue;
            if (text.charAt(start - 1) === '-' && /[0-9]/.test(text.charAt(start - 2))) continue;
            spans.push([start, end, m[0].toUpperCase()]);
        }
        if (!spans.length) return text;
        let out = '', cursor = 0;
        spans.forEach(s => { out += text.slice(cursor, s[0]); removed.push(s[2]); cursor = s[1]; });
        return out + text.slice(cursor);
    };

    /** 去掉干扰词：返回 { name, removed }。扩展名原样保留，只处理主名 */
    const stripNoiseWords = (input) => {
        const raw = String(input || '');
        if (!raw) return { name: '', removed: [] };
        const removed = [];
        const extMatch = raw.match(/\.[A-Za-z0-9]{2,5}$/);
        const ext = extMatch ? extMatch[0] : '';
        let text = ext ? raw.slice(0, raw.length - ext.length) : raw;

        // ① 成对括号的内容整体剥掉；里面若是语义标记就转成【标记】留下来
        const bracketRe = new RegExp(BRACKET_BLOB_RE.source, 'g');
        text = text.replace(bracketRe, function () {
            const inner = String(Array.prototype.slice.call(arguments, 1, 10)
                .find(x => x !== undefined) || '').trim();
            if (!inner) return ' ';
            const marks = [];
            inner.split(/[\s._\-+/|]+/).forEach(p => {
                const mk = markerOf(p);
                if (mk && marks.indexOf(mk) < 0) marks.push(mk);
            });
            if (marks.length) {
                // 括号里有语义标记：保留标记，其余当作标签记录
                const rest = inner.split(/[\s._\-+/|]+/)
                    .filter(p => p && !markerOf(p)).join(' ').trim();
                if (rest.length > 1) removed.push(rest.toUpperCase());
                return ' ' + marks.map(mk => '【' + mk + '】').join('') + ' ';
            }
            if (inner.length > 1) removed.push(inner.toUpperCase());
            return ' ';
        });

        // ② 词典里的词
        text = stripNoiseOnce(text, noiseSet(), removed);

        // ③ 收尾：摘词会留下叠起来的分隔符（'heyzo__0371_'），收敛掉；
        //    一个词都没摘的就原样返回，别把本来干净的名字动坏了
        if (removed.length) {
            text = text.replace(/[._\-\s]{2,}/g, ' ');
        }
        text = text.replace(/\s{2,}/g, ' ')
            .replace(/\s+([·、,，.])/g, '$1')
            .replace(/^[\s._\-]+/, '')
            .replace(/[\s._\-]+$/, '');
        return { name: text + ext, removed: removed.filter(Boolean) };
    };

    /** 词典概览（给界面显示） */
    const noiseDictSummary = () => {
        const tokens = noiseTokens();
        return {
            seed: NOISE_SEEDS.length,
            learned: tokens.length,
            tokens: tokens.sort(),
            manual: tokens.filter(k => noiseLearned[k] && noiseLearned[k].manual)
        };
    };

    // ========================================================================
    // 2. 工具函数（纯函数，无副作用）
    // ========================================================================

    /** 去除文件扩展名 */
    const stripFileExt = (name) => {
        const s = String(name || '');
        const idx = s.lastIndexOf('.');
        return idx > 0 ? s.slice(0, idx) : s;
    };

    /** 正则转义 */
    const escapeRegExp = (str) => String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    /** 分段序号规范化（001 → 1） */
    const normalizePartToken = (p) => {
        const s = String(p == null ? '' : p);
        if (/^\d+$/.test(s)) {
            const v = parseInt(s, 10);
            if (v >= 1 && v <= 999) return String(v);
        }
        return s;
    };

    /** 115文件名规范化（NFKC、去零宽、标点统一、非法字符转空格） */
    const normalize115Name = (n) => {
        if (!n) return '';
        let s = String(n);
        try { s = s.normalize('NFKC'); } catch (_) { /* ignore */ }
        s = s.replace(/[\u200B-\u200D\uFEFF\u00AD\u2060-\u2064\u180E\u2028\u2029]/g, '');
        s = s.replace(/[\u2018\u2019\u2032]/g, "'").replace(/[\u201C\u201D\u2033]/g, '"');
        s = s.replace(/[\u2010-\u2015\u2212\u30FC]+/g, '-');
        s = s.replace(/[\u30FB\u00B7\u2022]/g, '·');
        s = s.replace(/[\uFF0C\u3001]/g, '，').replace(/[\uFF0E\u3002]/g, '。');
        s = s.replace(/[\uFF08]/g, '（').replace(/[\uFF09]/g, '）');
        s = s.replace(/[\u3010]/g, '【').replace(/[\u3011]/g, '】');
        s = s.replace(/[\u300C]/g, '「').replace(/[\u300D]/g, '」');
        s = s.replace(/[\u300E]/g, '『').replace(/[\u300F]/g, '』');
        s = s.replace(/[\\\/:?"<>|*]/g, ' ');
        return s.replace(/\s+/g, ' ').trim();
    };

    /** 文件夹名称标准化（半角全角转换） */
    const normalizeFolderName = (name) => {
        if (!name) return '';
        let s = normalize115Name(String(name));
        s = s.replace(/[\u200B-\u200D\uFEFF\u00AD\u2060-\u2064\u180E\u2028\u2029]/g, '');
        s = s.replace(/[\uFF21-\uFF3A]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        s = s.replace(/[\uFF41-\uFF5A]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        s = s.replace(/[\uFF10-\uFF19]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        s = s.replace(/\uFF0C/g, ',').replace(/\u3001/g, ',');
        s = s.replace(/\uFF0E/g, '.').replace(/\u3002/g, '.');
        s = s.replace(/\uFF1A/g, ':').replace(/\uFF1B/g, ';');
        s = s.replace(/\uFF01/g, '!').replace(/\uFF1F/g, '?');
        s = s.replace(/\uFF08/g, '(').replace(/\uFF09/g, ')');
        s = s.replace(/\u3010/g, '[').replace(/\u3011/g, ']');
        s = s.replace(/\u300C/g, '「').replace(/\u300D/g, '」');
        s = s.replace(/\u2018/g, "'").replace(/\u2019/g, "'");
        s = s.replace(/\u201C/g, '"').replace(/\u201D/g, '"');
        s = s.replace(/\u2014/g, '-').replace(/\u2013/g, '-');
        s = s.replace(/\u30FB/g, '·');
        return s.replace(/\s+/g, ' ').trim();
    };

    /** 生成用于去重的折叠键（忽略大小写、分隔符、括号） */
    const folderNameKey = (n) => {
        if (!n) return '';
        return normalize115Name(n)
            .toLowerCase()
            .replace(/[\s\-_·・.,，。()（）\[\]【】「」『』]+/g, '')
            .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]/g, '');
    };

    /** 番号查询变体（去横杠、去补零等） */
    const getCodeQueryVariants = (code) => {
        const variants = [String(code || '')];
        const noDash = String(code || '').replace(/-/g, '');
        if (noDash !== code) variants.push(noDash);
        const m = String(code || '').match(/^([A-Z]+)-(\d+)$/);
        if (m) {
            const prefix = m[1], numRaw = m[2];
            const num = String(parseInt(numRaw, 10));
            if (num !== numRaw) variants.push(prefix + '-' + num);
            variants.push(prefix + num, prefix + ' ' + num, prefix + '_' + num);
        }
        return [...new Set(variants)];
    };

    /** 获取标准女优名（查别名表） */
    const getStandardActressName = (name) => {
        if (!name) return name;
        const n = normalizeFolderName(String(name));
        if (!n) return n;
        return ACTRESS_ALIAS_MAP[n] || n;
    };

    /** 女优名合理性校验（避免标题词混入） */
    const isPlausibleActressToken = (name) => {
        if (!name) return false;
        let n = normalizeFolderName(String(name));
        n = n.replace(/[\[\]【】()（）{}<>《》「」『』]/g, '').trim();
        if (!n) return false;
        const key = folderNameKey(n);
        if (key.length < 2 || key.length > 24) return false;
        if (/^(有码|有碼|无码|無碼|欧美|歐美|动漫|動漫|系列|片商|演員|演员|女优|女優|中文字幕|字幕|高清|無修正|无修正|合集|整理|未整理|已整理)$/.test(n)) return false;
        if (/^(女优归档|女優归档|女優歸檔|女优歸檔)[-_]?\d*$/i.test(n)) return false;
        if (/^(番号归档|番號归档|番号歸檔|番號歸檔)(?:[-_][A-Z0-9]+)?$/i.test(n)) return false;
        if (/[!！?？~〜～]/.test(n)) return false;
        if (/(AV女優|AV女优|新人AV|新人|中出し|中出|生中出|無修正|无码|高清|中文字幕|素人|人妻|限定|企画|シリーズ|NTR)/i.test(n)) return false;
        return true;
    };

    /** 移除标记关键词（用于标题清理） */
    const removeMarkers = (str) => {
        return str.replace(MARKER_PATTERN, (match, p1, offset, full) => {
            const lower = match.toLowerCase();
            if (offset > 0 && /[a-z0-9]/i.test(full[offset - 1])) return match;
            if (offset + match.length < full.length && /[a-z0-9]/i.test(full[offset + match.length])) return match;
            return ' ';
        });
    };

    /** 域名前缀剥离（@前部分） */
    const stripDomainPrefix = (filename) => {
        const idx = filename.lastIndexOf('@');
        return idx === -1 ? filename : filename.substring(idx + 1).trim();
    };

    /** 获取安全后缀（扩展名） */
    const getSafeSuffix = (filename) => {
        const m = filename.match(/\.([a-z0-9]{2,5})$/i);
        if (m && !/^\d+$/.test(m[1])) return m[0];
        return '';
    };

    /** 日期标准化 */
    const normDate = (d) => {
        if (!d) return '';
        const m = d.trim().match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
        if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
        const m2 = d.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
        return d;
    };

    /** 判断是否为“未找到”标题 */
    const isNotFoundTitle = (t) => /404|not\s*found|page\s*not\s*found|no\s*result|找不到|页面不存在|查無|查无|無此|无此/i.test(String(t || ''));

    /** 将GM_xmlhttpRequest转为Promise */
    const gmRequest = (options) => {
        return new Promise((resolve, reject) => {
            const timeout = options.timeout || 15000;
            const timer = setTimeout(() => reject(new Error('Request timeout')), timeout);
            GM_xmlhttpRequest({
                ...options,
                onload: (res) => { clearTimeout(timer); resolve(res); },
                onerror: (err) => { clearTimeout(timer); reject(err); },
                ontimeout: () => { clearTimeout(timer); reject(new Error('Timeout')); }
            });
        });
    };

    /** HTML解析辅助 */
    const parseHTML = (html) => new DOMParser().parseFromString(html, 'text/html');

    // ========================================================================
    // 3. 缓存管理（GM存储）
    // ========================================================================
    const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
    const NEGATIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

    /** 读缓存。⚠️ 必须吞掉解析异常：这份数据在 IIFE 初始化阶段就要读（jb_infoCache 等），
        GM 存储里一旦存进了半截/坏掉的 JSON（存储配额满、跨版本残留），
        JSON.parse 一抛就是「整个脚本再也起不来」——入口按钮直接消失，用户只会以为脚本坏了。 */
    const getCache = (key) => {
        try {
            const raw = GM_getValue(key, '{}');
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            // 不是对象就当没数据（比如旧版本存过字符串），别让下游崩在 Object.keys 上
            return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch (e) {
            console.warn('[整理助手] 缓存损坏已忽略，from scratch：' + key, e && e.message);
            try { GM_setValue(key, '{}'); } catch (e2) { /* ignore */ }
            return {};
        }
    };
    const setCache = (key, data) => GM_setValue(key, JSON.stringify(data));

    let infoCache = getCache('jb_infoCache');
    let actressCache = getCache('jb_actressCache');
    let ratingCache = getCache('jb_ratingCache');
    let negativeCache = getCache('jb_negativeCache');

    const isInfoCacheValid = (code) => {
        const e = infoCache[code];
        if (!e) return false;
        if (!e.cachedAt) return true;
        return (Date.now() - Number(e.cachedAt)) < CACHE_TTL_MS;
    };
    const storeInfo = (key, info) => {
        if (info) info.cachedAt = Date.now();
        infoCache[key] = info;
        setCache('jb_infoCache', infoCache);
    };
    const isNegativeCached = (code) => {
        const e = negativeCache[code];
        if (!e || !e.cachedAt) return false;
        return (Date.now() - Number(e.cachedAt)) < NEGATIVE_CACHE_TTL_MS;
    };
    const markNegativeCached = (code) => {
        negativeCache[code] = { cachedAt: Date.now() };
        setCache('jb_negativeCache', negativeCache);
    };

    // ========================================================================
    // 4. 番号提取相关（FC2、无码、常规）
    // ========================================================================

    /** 生成完整前缀列表（手动 + 自动双字母 + 单字母） */
    function buildPrefixList() {
        const prefixes = [...MANUAL_PREFIXES];
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        // 双字母
        for (let i = 0; i < 26; i++) {
            for (let j = 0; j < 26; j++) {
                const p = letters[i] + letters[j];
                if (!GARBAGE_WORDS.includes(p) && !prefixes.includes(p)) {
                    prefixes.push(p);
                }
            }
        }
        // 单字母
        for (let i = 0; i < 26; i++) {
            const p = letters[i];
            if (!GARBAGE_WORDS.includes(p) && !prefixes.includes(p)) {
                prefixes.push(p);
            }
        }
        prefixes.sort((a, b) => b.length - a.length);
        return prefixes;
    }

    const CODE_PREFIXES = buildPrefixList();
    const CODE_PREFIX_PATTERNS = CODE_PREFIXES.map(p => ({
        prefix: p,
        regex: new RegExp(`\\b${p}[-_ ]?0*(\\d{1,5})(?![0-9])`, 'i'),
        looseRegex: new RegExp(`\\b${p}[-_ ]?0*(\\d{1,5})(?![0-9])`, 'i')
    }));

    /** 通过前缀匹配番号 */
    const matchCodeByPrefix = (str) => {
        if (!str) return null;
        for (const item of CODE_PREFIX_PATTERNS) {
            const m = str.match(item.regex);
            if (m) return `${item.prefix}-${(m[1] === '0' ? '0' : m[1]).padStart(3, '0')}`;
        }
        for (const item of CODE_PREFIX_PATTERNS) {
            const m = str.match(item.looseRegex);
            if (m) return `${item.prefix}-${(m[1] === '0' ? '0' : m[1]).padStart(3, '0')}`;
        }
        const loose = str.match(/\b([A-Z]{2,8})\s*0*(\d{2,5})(?![0-9])/);
        if (loose) {
            const prefix = loose[1];
            if (!GARBAGE_WORDS.includes(prefix) && prefix.length > 1) {
                let num = Number(loose[2]).toString();
                if (num === '0') num = '0';
                return `${prefix}-${num.padStart(3, '0')}`;
            }
        }
        return null;
    };

    /** FC2番号提取（支持多种变体） */
    const extractFC2Code = (str) => {
        const patterns = [
            /\bfc2ppv[-_\s]*(\d{5,8})\b/i,
            /\bfc\s*(\d{5,8})(?=[-_\s]?\d{1,3})?/i,
            /\bfc2?[-_\s]*(\d{5,8})\b/i,
            /\bFC2[\s_-]*PPV[\s_-]*(\d{5,8})\b/i,
            /\bFC2PPV[\s_-]*(\d{5,8})\b/i,
            /\bFC2[\s_-]+(\d{5,8})\b/i,
            /\bFC2(\d{5,8})\b/i,
            /\bPPV[\s_-]*(\d{5,8})\b/i,
            /\bF[\s_-]*(\d{5,8})\b(?!\d)/i,
        ];
        for (const regex of patterns) {
            const m = str.match(regex);
            if (m && m[1] && !GARBAGE_WORDS.includes(m[1].toUpperCase())) {
                return 'FC2-PPV-' + m[1];
            }
        }
        return null;
    };

    /** 无码检测（基于番号前缀或关键词） */
    const checkUncensored = (fh, title) => {
        if (/无码|無修正|uncensored/i.test(title)) return true;
        const uncensoredPatterns = [
            /^Tokyo-Hot-/i, /^TOKYO-HOT-/i, /^1PONDO-/i, /^CARIB-/i,
            /^HEYZO-/i, /^10MU-/i, /^MURA-/i, /^H4610-/i, /^NAMA-/i
        ];
        for (let pat of uncensoredPatterns) {
            if (pat.test(fh)) return true;
        }
        const reg = new RegExp(fh.replace(/-/g, '[-_]?') + "[_-](UC|U)");
        return reg.test(title.toUpperCase());
    };

    /** 从标题中移除番号本身（避免重复） */
    const removeCodeFromTitle = (str, baseCode) => {
        if (!baseCode) return str;
        const stdMatch = baseCode.match(/^([A-Za-z]+)[-_\s]?(\d+)$/);
        if (stdMatch) {
            const prefix = stdMatch[1];
            const rawNum = parseInt(stdMatch[2], 10).toString();
            str = str.replace(new RegExp(`\\b${prefix}[-_\\s.]*0*${rawNum}(?![_\\s.-]*[a-zA-Z]\\d)`, 'gi'), ' ');
        }
        if (/^FC2[-_\s]?PPV[-_\s]?\d+$/i.test(baseCode)) {
            const num = baseCode.match(/\d+$/)[0];
            const rawNum = parseInt(num, 10).toString();
            str = str.replace(new RegExp(`\\b(?:FC2[-_\\s.]?(?:PPV[-_\\s.]?)?0*${rawNum}|PPV[-_\\s.]?0*${rawNum})(?![_\\s.-]*[a-zA-Z]\\d)`, 'gi'), ' ');
        }
        const thMatch = baseCode.match(/^Tokyo[-_\s]*Hot[-_\s]*[nN](\d{3,4})$/i);
        if (thMatch) {
            const num = thMatch[1].padStart(4, '0');
            const rawNum = parseInt(num, 10).toString();
            str = str.replace(new RegExp(
                `\\b(?:Tokyo\\s*[-_\\s]*Hot\\s*[-_\\s]*[nN]?\\s*0*${rawNum}|` +
                `TokyoHotn?${rawNum}|` +
                `Hotn?${rawNum})` +
                `(?![_\\s.-]*[a-zA-Z]\\d)`,
                'gi'
            ), ' ');
        }
        return str.replace(/\s+/g, ' ').trim();
    };

    /** 分段信息提取（CD/PART/SP等） */
    const extractPartInfoFromFileName = (fileName, code) => {
        if (!fileName) return '';
        const base = stripDomainPrefix(stripFileExt(fileName)).replace(/^h[_\-. ]*\d{2,5}[_\-. ]*/i, '');
        let U = base.toUpperCase();
        U = U.replace(/[\uFF21-\uFF3A]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        U = U.replace(/[\uFF41-\uFF5A]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).toUpperCase();
        U = U.replace(/[\uFF10-\uFF19]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        U = U.replace(/[\u2013\u2014\u2212\uFF0D]/g, '-').replace(/[\uFF3F]/g, '_').replace(/[\u3000]/g, ' ');

        const numLabel = n => { const v = parseInt(n, 10); return (v >= 1 && v <= 99) ? String(v) : ''; };
        const letterLabel = ch => { ch = String(ch || '').toUpperCase(); return /^[A-D]$/.test(ch) ? ch : ''; };

        // 上/下/前/后
        const zhTail = base.match(/(?:^|[\s._\-\[\(【（])((?:上|下|前|後|后)(?:集|部|篇|編|编|段)?)(?:$|[\s._\-\]\)】）])/);
        if (zhTail) {
            const v = zhTail[1];
            if (/上|前/.test(v)) return '1';
            if (/下|後|后/.test(v)) return '2';
        }

        // 下载站后缀
        let m = U.match(/(?:^|[\s._\-])(?:HHB|HHC|HHD|HHH)0*([1-9]\d?)(?:$|[\s._\-])/);
        if (m) return numLabel(m[1]);
        m = U.match(/(?:4K|8K|HD|FHD|1080P|720P)[\s._\-]*S0*([1-9]\d?)(?:$|[\s._\-])/);
        if (m) return numLabel(m[1]);
        m = U.match(/(?:4K|8K|UHD|HD|FHD|1080P|720P)?[\s._\-]*(?:60|30)FPS0*([1-9]\d?)(?:$|[\s._\-])/);
        if (m) return numLabel(m[1]);

        // 明确分段词
        const tailZone = U.slice(Math.max(0, U.length - 96));
        m = tailZone.match(/(?:^|[\s._\-\[\(【（])(?:CD|DISC|DISK|DVD|PART|PT|P|VOL|VOLUME|EP|EPISODE)[\s._\-]*0*([1-9]\d?)[\s._\-\]\)】）]*$/);
        if (m) return numLabel(m[1]);

        // SP/SPECIAL
        let spMatch = U.match(/(?:^|[\s._\-\[\(【（])(SP|SPECIAL)[\s._-]*(\d{1,3})?(?=$|[\s._\-\)】）])/i);
        if (spMatch) {
            if (spMatch[2]) return numLabel(spMatch[2]);
            else return 'SP';
        }

        // 1of2
        m = tailZone.match(/(?:^|[\s._\-])0*([1-9]\d?)\s*(?:OF|\/|／|-)\s*0*([1-9]\d?)(?:$|[\s._\-])/);
        if (m && parseInt(m[2], 10) > 1) return numLabel(m[1]);

        // 番号后紧贴分段
        if (code) {
            const codeStr = String(code).toUpperCase();
            const parts = codeStr.split('-');
            const prefix = parts[0] || '', numRaw = parts[1] || '';
            const num = numRaw.replace(/^0+/, '') || numRaw;
            if (prefix && num) {
                const codeRe = new RegExp('(?:^|[^A-Z0-9])' + escapeRegExp(prefix) + '[\\s._-]*0*' + escapeRegExp(num) + '(?=$|[^A-Z0-9])', 'i');
                const cm = U.match(codeRe);
                if (cm && typeof cm.index === 'number') {
                    const after = U.slice(cm.index + cm[0].length);
                    let mm = after.match(/^[\s._-]*([A-D])(?=$|[\s._\-\]\)】）])/);
                    if (mm) return letterLabel(mm[1]);
                    mm = after.match(/^[\s._-]+(?:CD|DISC|DISK|DVD|PART|PT|P|VOL|VOLUME|EP|EPISODE)[\s._-]*0*([1-9]\d?)(?=$|[\s._\-\]\)】）])/);
                    if (mm) return numLabel(mm[1]);
                    mm = after.match(/^[\s._-]+(\d{1,3})(?=$|[\s._\-\]\)】）])/);
                    if (mm) { const v = parseInt(mm[1], 10); if (v >= 1 && v <= 999) return mm[1]; }
                }
            }
        }
        return '';
    };

    // ========================================================================
    // 5. 核心解析 parseVideoInfo
    // ========================================================================
    const parseVideoInfoCore = (origTitle, safeSuffix, skipNoise) => {
        try {
            if (!origTitle) return null;
            let raw = String(origTitle);
            raw = stripDomainPrefix(raw);
            let rawForCode = safeSuffix ? raw.slice(0, raw.lastIndexOf(safeSuffix)) : raw;

            let markers = [];
            rawForCode.replace(MARKER_PATTERN, (match, p1, offset, full) => {
                const lower = match.toLowerCase();
                if (offset > 0 && /[a-z0-9]/i.test(full[offset - 1])) return match;
                if (offset + match.length < full.length && /[a-z0-9]/i.test(full[offset + match.length])) return match;
                const nm = MARKER_MAP[lower];
                if (nm && !markers.includes(nm)) markers.push(nm);
                return match;
            });

            let dateStr = '';
            const dm = rawForCode.match(/(?:\b|_|^|@|】|\[|【)((?:19|20)\d{2}[-_\/\.\s]+\d{1,2}[-_\/\.\s]+\d{1,2})(?:\b|_|$|(?=[A-Za-z\u4e00-\u9fa5【\[\]】]))/i);
            if (dm) {
                const parts = dm[1].trim().split(/[-_\/\.\s]+/);
                if (parts.length === 3) {
                    const year = parts[0].length === 2 ? '20' + parts[0] : parts[0];
                    dateStr = `${year}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                }
                rawForCode = rawForCode.replace(dm[0], ' ');
            }

            // 去掉干扰词后再抽番号：站点标签/画质词会把番号挤得认不出来，
            // 也容易混进 localTitle。语义标记上一步已经收集完，不受影响。
            let noiseRemoved = [];
            if (!skipNoise) {
                const denoise = stripNoiseWords(rawForCode);
                if (denoise.name && denoise.name !== rawForCode) {
                    noiseRemoved = denoise.removed;
                    rawForCode = denoise.name;
                }
            }

            let t = removeMarkers(rawForCode).toUpperCase();
            t = t.replace(/(?:\b|_|^|@|】|\[|【)(?:19|20)\d{2}[-_\/\.\s]+\d{1,2}[-_\/\.\s]+\d{1,2}(?:\b|_|$|(?=[A-Z]))/ig, ' ');
            const garbageRegex = new RegExp('\\b(' + GARBAGE_WORDS.join('|') + ')\\b', 'gi');
            t = t.replace(garbageRegex, ' ').replace(/[\[\]\{\}（）【】]/g, ' ').replace(/[_\.\-\/\\]+/g, ' ');
            t = t.replace(/\b[01]+(?=[A-Z])/g, '').replace(/\b([A-Z])\s(?=[A-Z]\b)/g, '$1');

            let queryCode = null, displayCode = null, part = '';

            // 东京热
            const thMatch = rawForCode.match(/Tokyo[\s_-]*Hot[\s_-]*[nN]?(\d{3,4})/i);
            if (thMatch) {
                const num = thMatch[1].padStart(4, '0');
                queryCode = `Tokyo-Hot-n${num}`;
                displayCode = queryCode;
                if (!markers.includes('无码')) markers.push('无码');
            } else {
                const fc2Code = extractFC2Code(rawForCode) || extractFC2Code(t);
                if (fc2Code) {
                    queryCode = fc2Code;
                    displayCode = fc2Code;
                    const fc2Num = fc2Code.match(/\d+$/)[0];
                    rawForCode = rawForCode.replace(
                        new RegExp(`(?:^|\\s)fc2?ppv?[\\s_-]*(?:ppv[\\s_-]*)?0*${fc2Num}(?:[-_\\s]?\\d{1,3})?`, 'i'),
                        ' '
                    ).trim();
                    const partMatch = rawForCode.match(/[-_](\d{1,3})(?:\s|$)/);
                    if (partMatch) {
                        part = normalizePartToken(partMatch[1]);
                        rawForCode = rawForCode.replace(partMatch[0], ' ').trim();
                    }
                } else {
                    // 无码系列
                    const uncensoredMatch = t.match(/\b(1PONDO|CARIB|HEYZO|10MU|MURA|H4610|NAMA)[-_]?(\d+)/i);
                    if (uncensoredMatch) {
                        let prefix = uncensoredMatch[1].toUpperCase();
                        let num = uncensoredMatch[2];
                        if (prefix === 'CARIB') prefix = 'Caribbean';
                        queryCode = prefix + '-' + num;
                        displayCode = queryCode;
                        if (!markers.includes('无码')) markers.push('无码');
                        rawForCode = rawForCode.replace(new RegExp(uncensoredMatch[0], 'i'), ' ').trim();
                    } else {
                        // 常规番号
                        const numM = t.match(/\b(\d{4,6})[-_ ](\d{3,4})\b/);
                        if (numM) {
                            queryCode = `${numM[1]}-${numM[2]}`;
                            const lowerRaw = rawForCode.toLowerCase();
                            if (/1pon/i.test(lowerRaw)) displayCode = `1pondo-${numM[1]}-${numM[2]}`;
                            else if (/carib/i.test(lowerRaw)) displayCode = `Caribbean-${numM[1]}-${numM[2]}`;
                            else if (/paco/i.test(lowerRaw)) displayCode = `Pacopacomama-${numM[1]}-${numM[2]}`;
                            else if (/heydouga/i.test(lowerRaw)) displayCode = `Heydouga-${numM[1]}-${numM[2]}`;
                            else if (/tokyo/i.test(lowerRaw)) displayCode = `TokyoHot-${numM[1]}-${numM[2]}`;
                            else { queryCode = `${numM[1]}-${numM[2]}`; displayCode = queryCode; }
                        } else {
                            queryCode = matchCodeByPrefix(t);
                            if (queryCode) displayCode = queryCode;
                        }
                        if (queryCode && !/^FC2-PPV/.test(queryCode)) {
                            const codeForPattern = queryCode.replace(/-/g, '[-_\\s.]?');
                            const rawMatch = rawForCode.match(new RegExp(`\\b${codeForPattern}(?![0-9])`, 'i'));
                            if (rawMatch) rawForCode = rawForCode.replace(rawMatch[0], ' ');
                        }
                    }
                }
            }

            if (!queryCode) return null;
            const baseCode = displayCode || queryCode;

            if (checkUncensored(baseCode, raw)) {
                if (!markers.includes('无码')) markers.push('无码');
            }

            const safeB = queryCode.replace(/_/g, '-').replace(/-/g, '[-_ ]?');
            if (raw.indexOf('中文') !== -1 || new RegExp(safeB + '[_-](UC|C)\\b', 'i').test(raw)) {
                if (!markers.includes('中文字幕')) markers.push('中文字幕');
            }
            if (raw.indexOf('无码') !== -1 || new RegExp(safeB + '[_-](UC|U)\\b', 'i').test(raw)) {
                if (!markers.includes('无码')) markers.push('无码');
            }

            if (/^FC2-PPV-\d{5,8}$/i.test(queryCode) && !part) {
                const partMatch = rawForCode.match(/[-_](\d{1,3})(?:\s|$)/);
                if (partMatch) {
                    part = normalizePartToken(partMatch[1]);
                    rawForCode = rawForCode.replace(partMatch[0], ' ').trim();
                }
            }

            const escapedBase = baseCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const keywordRegex = new RegExp(
                `${escapedBase}[\\s._-]*(?:part|pt|cd|disc|ep|sp|vol|no|volume)[\\s._-]*(\\d{1,3}|[a-dA-D])(?![a-zA-Z0-9])`,
                'i'
            );
            const kwMatch = rawForCode.match(keywordRegex);
            if (kwMatch) {
                part = kwMatch[1].toUpperCase();
                rawForCode = rawForCode.replace(kwMatch[0], ' ').trim();
            } else if (!part) {
                const numRegex = new RegExp(
                    `${escapedBase}[_\\-](\\d{1,3})(?![a-zA-Z])` +
                    `|${escapedBase}\\.(\\d{1,3})(?![a-zA-Z0-9])`,
                    'i'
                );
                const nm = rawForCode.match(numRegex);
                if (nm) {
                    part = (nm[1] || nm[2]).toUpperCase();
                    rawForCode = rawForCode.replace(nm[0], ' ').trim();
                }
            }
            if (!part) {
                const detectedPart = extractPartInfoFromFileName(origTitle, queryCode);
                if (detectedPart) {
                    part = normalizePartToken(detectedPart);
                    rawForCode = rawForCode
                        .replace(new RegExp(`(?:CD|DISC|DISK|DVD|PART|PT|P|VOL|VOLUME|EP|EPISODE|SP|SPECIAL)[\\s._-]*0*${escapeRegExp(detectedPart)}`, 'i'), ' ')
                        .replace(new RegExp(`(?:上|下|前|後|后)(?:集|部|篇|編|编|段)?(?=[\\s._\\-]|$)`, 'g'), ' ');
                    if (/^\d+$/.test(detectedPart)) {
                        rawForCode = rawForCode.replace(new RegExp(`[\\s._-]${escapeRegExp(detectedPart)}(?=[\\s._\\-]|$)`, 'g'), ' ');
                    }
                    rawForCode = rawForCode.trim();
                }
            }
            const fullCode = part ? `${baseCode}-${part}` : baseCode;

            let cleanTitle = removeMarkers(rawForCode);
            cleanTitle = cleanTitle.replace(/(?:\b|_|^|@|】|\[|【)(?:19|20)\d{2}[-_\/\.\s]+\d{1,2}[-_\/\.\s]+\d{1,2}(?:\b|_|$|(?=[A-Z]))/ig, ' ');
            cleanTitle = cleanTitle.replace(/\[.*?\]|\(.*?\)|【.*?】|\{.*?\}|（.*?）/g, ' ');
            cleanTitle = cleanTitle.replace(AD_BADGES, ' ');
            cleanTitle = cleanTitle.replace(garbageRegex, ' ');
            cleanTitle = cleanTitle.replace(/\s+/g, ' ').trim();
            cleanTitle = removeCodeFromTitle(cleanTitle, baseCode);

            return { queryCode, baseCode, fullCode, markers, date: dateStr, localTitle: cleanTitle, noise: noiseRemoved };
        } catch (e) {
            console.error('parseVideoInfo error:', e);
            return null;
        }
    };

    /** 对外入口：先按「去干扰词」后的名字解析，解析不出再拿原文兜底试一次
        （极少数番号本身长得像干扰词，去噪反而会擦坏它）。 */
    const parseVideoInfo = (origTitle, safeSuffix) => {
        const cleaned = parseVideoInfoCore(origTitle, safeSuffix, false);
        if (cleaned) return cleaned;
        const rawTry = parseVideoInfoCore(origTitle, safeSuffix, true);
        if (rawTry) return rawTry;
        return null;
    };

    // ========================================================================
    // 6. 构建新名称（支持多种「重命名方式」）
    // ========================================================================
    /** 可选的重命名方式。默认 code-title-actress-date 与改造前完全一致，
        免得老用户只点一次改名就发现命名风格变了。 */
    const NAMING_MODES = [
        { key: 'code-title-actress-date', label: '番号 + 标题 + 演员 + 发行日期', title: true, actress: true, date: true },
        { key: 'code-title-actress', label: '番号 + 标题 + 演员', title: true, actress: true },
        { key: 'code-title', label: '番号 + 标题', title: true },
        { key: 'code-actress', label: '番号 + 演员', actress: true },
        { key: 'code', label: '仅番号' },
        { key: 'full', label: '番号 + 标题 + 演员 + 日期 + 评分', title: true, actress: true, date: true, rating: true },
        { key: 'custom', label: '自定义模板', custom: true }
    ];
    const DEFAULT_NAMING_TEMPLATE = '{code} {title} {actress} -{date}';
    const namingModeOf = (key) => NAMING_MODES.filter(m => m.key === key)[0] || NAMING_MODES[0];

    /** 当前重命名方式（持久化，改了下次还在） */
    let namingCfg = { mode: NAMING_MODES[0].key, template: DEFAULT_NAMING_TEMPLATE };
    try {
        const rawNaming = GM_getValue('namingCfg', '');
        if (rawNaming) namingCfg = Object.assign(namingCfg, JSON.parse(rawNaming) || {});
    } catch (e) { /* ignore */ }
    if (!namingModeOf(namingCfg.mode)) namingCfg.mode = NAMING_MODES[0].key;
    const saveNamingCfg = () => {
        try { GM_setValue('namingCfg', JSON.stringify(namingCfg)); } catch (e) { /* ignore */ }
    };

    /** javdb 评分文本（只读本地缓存，不联网） */
    const ratingText = (queryCode) => {
        const key = String(queryCode || '').toUpperCase();
        const star = key ? ratingCache[key] : '';
        if (!star) return '';
        const t = String(star).trim();
        if (!t) return '';
        return /分$/.test(t) ? t : t + '分';
    };

    /** 演员名归一化 + 去重 + 过滤（抽出来给两种命名方式共用） */
    const normalizeActresses = (actresses) => {
        const list = [];
        const seen = new Set();
        (actresses || []).forEach(a => {
            const std = getStandardActressName(a);
            if (!std || !isPlausibleActressToken(std)) return;
            const key = folderNameKey(std);
            if (!key || seen.has(key)) return;
            seen.add(key);
            list.push(std);
        });
        return list;
    };

    /** 收尾：空格归一、下划线转横线、去掉文件系统非法字符 */
    const sanitizeName = (name) => {
        let s = String(name || '').replace(/\s+/g, ' ').trim();
        s = s.replace(/\s+\./g, '.');
        s = s.replace(/_/g, '-');
        return s.replace(/[\\/:*?"<>|]/g, (c) => ({ '\\': '', '/': ' ', ':': ' ', '?': ' ', '"': ' ', '<': ' ', '>': ' ', '|': '' })[c] || '');
    };

    /** 任意括号包裹的内容（标题里一律不要，语义标记会由 markers 单独补） */
    const BRACKETS_ONLY_RE = /\[[^\]]*\]|【[^】]*】|\([^)]*\)|（[^）]*）|\{[^}]*\}|《[^》]*》|「[^」]*」|『[^』]*』/g;

    /** 自定义模板：{code} {title} {actress} {date} {rating} {markers} */
    const buildFromTemplate = (vInfo, title, actresses, dateStr, suffix, extra, rating) => {
        const tpl = String(extra.template || namingCfg.template || DEFAULT_NAMING_TEMPLATE);
        const cleanTitle = stripNoiseWords(
            String(title || '').replace(BRACKETS_ONLY_RE, ' ')
        ).name.replace(/\s+/g, ' ').trim();
        const markers = (vInfo.markers || []).filter(Boolean).map(m => '【' + m + '】').join('');
        let name = tpl
            .replace(/\{code\}/gi, vInfo.fullCode || '')
            .replace(/\{title\}/gi, cleanTitle)
            .replace(/\{actress\}/gi, normalizeActresses(actresses).join('・'))
            .replace(/\{date\}/gi, dateStr || '')
            .replace(/\{rating\}/gi, rating || '')
            .replace(/\{markers\}/gi, markers);
        // 变量为空时会把分隔符留成孤儿（'ABF-208  -'），这里收拾干净
        name = name.replace(/\s*[-_・]+\s*(?=\s|$)/g, ' ').replace(/\s{2,}/g, ' ').trim();
        if (suffix) name += suffix;
        return sanitizeName(name);
    };

    const buildNewName = (vInfo, title, actresses, dateStr, suffix, extras) => {
        const extra = extras || {};
        const mode = namingModeOf(extra.mode || namingCfg.mode);
        const rating = extra.rating || ratingText(vInfo.queryCode);
        if (mode.custom) return buildFromTemplate(vInfo, title, actresses, dateStr, suffix, extra, rating);

        let cleanTitle = removeCodeFromTitle(String(title || ''), vInfo.baseCode);
        cleanTitle = cleanTitle.replace(BRACKETS_ONLY_RE, ' ');      // 标题里的括号内容一律不要
        cleanTitle = stripNoiseWords(cleanTitle).name;               // 标题里残留的干扰词也去掉
        cleanTitle = cleanTitle.replace(/\s+/g, ' ').trim();

        let name = vInfo.fullCode;
        if (mode.title && cleanTitle) name += ' ' + cleanTitle;
        if (mode.actress) {
            const actressStr = normalizeActresses(actresses).join('・');
            if (actressStr && name.indexOf(actressStr) < 0) name += ' ' + actressStr;
        }
        if (mode.date && dateStr) name += '-' + dateStr;
        if (mode.rating && rating) name += '-' + rating;
        if (vInfo.markers && vInfo.markers.length) {
            const uniq = [...new Set(vInfo.markers)].filter(Boolean);
            const existingMarkers = name.match(/【[^】]*】/g) || [];
            const toAdd = uniq.filter(m => !existingMarkers.includes(`【${m}】`));
            if (toAdd.length) name += toAdd.map(m => `【${m}】`).join('');
        }
        if (suffix) name += suffix;
        return sanitizeName(name);
    };

    /** 当前命名方式「会不会带上标题」。
        自定义模板按模板里有没有 {title} 判 —— 否则自定义模式（mode.title 未定义）会被当成
        「不含标题」，把 manualNameProtected 整个短路掉，手工命名的文件反而被覆盖。
        （见下方 manualNameProtected 的说明） */
    const namingHasTitle = (modeKey) => {
        const mode = namingModeOf(modeKey || namingCfg.mode);
        if (mode.custom) {
            const tpl = String(namingCfg.template || DEFAULT_NAMING_TEMPLATE);
            return /\{title\}/i.test(tpl);
        }
        return !!mode.title;
    };

    /** 「手动命名保护」是否成立：文件里带着手工写的标题，但新名字没把它带上。
        ⚠️ 只在当前重命名方式**包含标题**时才判 —— 否则「仅番号」这种模式下
        新名字天然等于 bareName，会把整个目录都误判成需要保护、一条都不改。 */
    const manualNameProtected = (fileName, vInfo, newName, bareName, modeKey) => {
        if (!namingHasTitle(modeKey)) return false;
        if (!fileName || !vInfo) return false;
        return hasManualNamePayload(fileName, vInfo.queryCode) && newName === bareName;
    };

    // ========================================================================
    // 7. 手动命名保护
    // ========================================================================
    const isRawDownloadSiteName = (fileName) => {
        const base = stripFileExt(String(fileName || '')).replace(/\s+/g, '').toLowerCase();
        if (!base) return false;
        if (/^(?:[a-z0-9.-]+@)?h_\d+[a-z]{2,10}\d{2,6}(?:ex)?(?:hh[bcdh])?\d*(?:[_-]?(?:4k|4ks|4k60fps|60fps|1080p|720p|fhd|hd))?\d*$/.test(base)) return true;
        if (/^(?:[a-z0-9.-]+@)?[a-z]{2,10}\d{2,6}(?:ex)?hh[bcdh]\d*(?:[_-]?(?:4k|4ks|4k60fps|60fps|1080p|720p|fhd|hd))?\d*$/.test(base)) return true;
        if (/^(?:[a-z0-9.-]+@)?\d{1,4}[a-z]{2,10}\d{2,8}v(?:[_-]?(?:4k|4ks|4k60fps|60fps|1080p|720p|fhd|hd))?\d*$/.test(base)) return true;
        if (/^(?:hhd800\.com@|www\.98t\.la@)/i.test(String(fileName))) return true;
        return false;
    };

    const hasManualNamePayload = (fileName, code) => {
        if (!fileName || !code) return false;
        if (isRawDownloadSiteName(fileName)) return false;
        let base = normalizeFolderName(stripFileExt(fileName));
        if (!base) return false;

        const codeStr = String(code).toUpperCase();
        const prefix = codeStr.split('-')[0] || '';
        const numPadded = codeStr.split('-')[1] || '';
        const num = numPadded.replace(/^0+/, '') || numPadded;
        const variants = [codeStr, codeStr.replace(/-/g, '')];
        if (prefix && num) variants.push(prefix + '-' + num, prefix + '_' + num, prefix + ' ' + num, prefix + num);
        if (prefix && numPadded) variants.push(prefix + '-' + numPadded, prefix + '_' + numPadded, prefix + ' ' + numPadded, prefix + numPadded);
        variants.forEach(v => {
            if (!v) return;
            base = base.replace(new RegExp(escapeRegExp(v).replace(/[-_\s]+/g, '[-_\\s]*'), 'ig'), ' ');
        });

        base = base.replace(/https?:\/\/\S+/ig, ' ');
        base = base.replace(/\b(?:www|com|net|org|cc|tv|xyz|me|la|to|info)\b/ig, ' ');
        base = base.replace(/\b(?:javdb|javbus|javlibrary|dmm|fanza|r18|torrent|magnet|bt|rarbg|thz|u3c3|sis001|sex8|98t|gg5|avsox|avmoo)\b/ig, ' ');
        base = base.replace(/\b(?:4k|8k|2160p|1440p|1080p|720p|480p|fhd|hd|sd|x264|x265|h264|h265|hevc|avc|aac|ac3|flac|mp3|web-?dl|webrip|bluray|bdremux|60fps|30fps)\b/ig, ' ');
        base = base.replace(/\b(?:chinese|subtitle|subbed|sub|chs|cht|big5|gb|unc|censored|uncensored|leak|leaked|no[-_ ]?watermark|watermark)\b/ig, ' ');
        base = base.replace(/\b(?:hhb|hhc|hhd|hhh)\d*\b/ig, ' ');
        base = base.replace(/\b(?:cd|part|disc|disk)[-_ ]?\d+\b/ig, ' ');
        base = base.replace(/\b(?:mp4|mkv|avi|rmvb|wmv|flv|mov|mpeg|mpg|ts|m4v|webm)\b/ig, ' ');
        base = base.replace(/[\[\]【】()（）{}<>《》「」『』._,，。+~!@#$%^&;:=、\/\|]+/g, ' ');
        base = base.replace(/[-\s]+/g, ' ').trim();

        if (!base) return false;
        base = base.replace(/中文字幕|無修正|无码|流出|破解|中字|字幕|高清|無碼/g, ' ').replace(/\s+/g, ' ').trim();
        if (!base) return false;
        if (/[぀-ヿ㐀-鿿]/.test(base)) return true;
        const asciiWords = (base.match(/[A-Za-z]{3,}/g) || []).filter(w => !/^(the|and|for|with|you|your|her|his|new|hot|sex|jav|av)$/i.test(w));
        const asciiLen = asciiWords.join('').length;
        return asciiWords.length >= 2 || asciiLen >= 10;
    };

    // ========================================================================
    // 8. 远程刮削（Promise化，并发控制）
    // ========================================================================

    const javbusBase = "https://www.javbus.com/";
    const javbusDirectAccess = javbusBase;
    const javbusUncensoredBase = javbusBase + "uncensored/";
    const javlibSearchBase = "https://www.javlibrary.com/cn/vl_searchbyid.php?keyword=";
    const javlibBase = "https://www.javlibrary.com/";
    const xslistBase = "https://xslist.org/tw/";
    const javdbBase = "https://javdb.com";
    const javdbSearchBase = javdbBase + "/search?q=";
    const fc2ppvdbBase = "https://fc2ppvdb.com/articles/";

    /** 通用搜索变体尝试 */
    const trySearchVariants = (code, onQuery, onAllFail) => {
        const variants = getCodeQueryVariants(code);
        let idx = 0;
        const next = () => {
            if (idx >= variants.length) return onAllFail && onAllFail(variants.join('/'));
            const q = variants[idx++];
            onQuery(q, next);
        };
        next();
    };

    /** javlibrary */
    const fetchJavlib = (code) => {
        return new Promise((resolve, reject) => {
            trySearchVariants(code, (q, next) => {
                gmRequest({
                    method: 'GET',
                    url: javlibSearchBase + encodeURIComponent(q),
                    anonymous: true,
                    timeout: 15000
                }).then(res => {
                    const doc = parseHTML(res.responseText);
                    let link = doc.querySelector('#video_title a')?.getAttribute('href') ||
                        doc.querySelector('div.video a[href*="?v="]')?.getAttribute('href');
                    if (!link) { next(); return; }
                    if (link.startsWith('/')) link = javlibBase.replace(/\/+$/, '') + link;
                    return gmRequest({ method: 'GET', url: link, anonymous: true, timeout: 15000 });
                }).then(res2 => {
                    const ddoc = parseHTML(res2.responseText);
                    let ttl = ddoc.querySelector('#video_title a')?.textContent.trim() ||
                        ddoc.querySelector('#video_title')?.textContent.trim() || '';
                    if (ttl.toUpperCase().startsWith(code.toUpperCase())) ttl = ttl.slice(code.length).trim();
                    if (isNotFoundTitle(ttl)) ttl = '';
                    const dateText = ddoc.querySelector('#video_date td.text')?.textContent.trim() || '';
                    const isoDate = normDate(dateText);
                    const actresses = [];
                    ddoc.querySelectorAll('#video_cast td.text a').forEach(a => {
                        const n = a.textContent.trim();
                        if (n) actresses.push(n);
                    });
                    if (!ttl) { next(); return; }
                    const info = { title: ttl, date: isoDate, actresses };
                    resolve(info);
                }).catch(() => { next(); });
            }, () => { reject(new Error('JavLibrary 搜索无结果')); });
        });
    };

    /** javbus（支持无码回退） */
    const fetchJavbus = (code) => {
        return new Promise((resolve, reject) => {
            const variants = getCodeQueryVariants(code).filter(v => !/[\s_]/.test(v));
            let vi = 0;
            const tryOne = (q) => {
                const tryBase = (u) => {
                    return gmRequest({
                        method: 'GET',
                        url: u + q,
                        anonymous: true,
                        timeout: 15000
                    }).then(res => {
                        const doc = parseHTML(res.responseText);
                        let ttl = null;
                        const h3 = doc.querySelector('h3');
                        if (h3) { ttl = h3.textContent.trim(); if (ttl.toUpperCase().startsWith(code.toUpperCase())) ttl = ttl.slice(code.length).trim(); }
                        if (!ttl) ttl = doc.querySelector('div.photo-frame img')?.getAttribute('title') || '';
                        if (!ttl) {
                            ttl = doc.querySelector('title')?.textContent.trim() || '';
                            if (ttl.includes(' - JavBus')) ttl = ttl.split(' - JavBus')[0].trim();
                            if (ttl.toUpperCase().startsWith(code.toUpperCase())) ttl = ttl.slice(code.length).trim();
                        }
                        if (isNotFoundTitle(ttl)) ttl = null;
                        if (!ttl) return Promise.reject();
                        let isoDate = '';
                        doc.querySelectorAll('p').forEach(p => {
                            const t = p.textContent.trim();
                            if (/發行日期|发行日期/.test(t)) {
                                const m = t.match(/(\d{4}-\d{2}-\d{2})/);
                                if (m) isoDate = normDate(m[1]);
                            }
                        });
                        if (!isoDate) {
                            const p = doc.querySelector('.info p:nth-of-type(2)');
                            if (p) isoDate = normDate(p.textContent.replace(/.*?[:：]/, '').trim());
                        }
                        const actresses = [];
                        doc.querySelectorAll('span.genre a[href*="/star/"]').forEach(a => {
                            const n = a.textContent.trim();
                            if (n) actresses.push(n);
                        });
                        const info = { title: ttl, date: isoDate, actresses };
                        if (u.includes('uncensored')) info.uncensored = true;
                        return info;
                    }).catch(() => { throw new Error('fail'); });
                };
                tryBase(javbusDirectAccess).catch(() => tryBase(javbusUncensoredBase))
                    .then(info => resolve(info))
                    .catch(() => {
                        vi++;
                        if (vi < variants.length) tryOne(variants[vi]);
                        else reject(new Error('JavBus 搜索无结果'));
                    });
            };
            tryOne(variants[0]);
        });
    };

    /** xslist */
    const fetchXslist = (code) => {
        return new Promise((resolve, reject) => {
            trySearchVariants(code, (q, next) => {
                gmRequest({
                    method: 'GET',
                    url: xslistBase + 'search?query=' + encodeURIComponent(q),
                    anonymous: true,
                    timeout: 15000
                }).then(res => {
                    const sdoc = parseHTML(res.responseText);
                    const parsePage = (doc) => {
                        const uc = code.toUpperCase().replace(/[-_\s]/g, '');
                        let tr = null;
                        doc.querySelectorAll('#movices tbody tr').forEach(row => {
                            const c = (row.querySelector('td strong')?.textContent || '').trim().toUpperCase().replace(/[-_\s]/g, '');
                            if (c === uc) tr = row;
                        });
                        if (!tr) return null;
                        const tds = tr.querySelectorAll('td');
                        const ttl = tds[1]?.textContent.trim() || '';
                        const dt = tds[2]?.textContent.trim() || '';
                        let isoDate = '';
                        if (dt && !/n\/a/i.test(dt)) isoDate = normDate(dt);
                        const aname = doc.querySelector('h1 span[itemprop="name"]')?.textContent.trim() || '';
                        const actresses = aname ? [aname] : [];
                        if (!ttl) return null;
                        return { title: ttl, date: isoDate, actresses };
                    };
                    let info = null;
                    if (sdoc.querySelector('#movices') && sdoc.querySelector('h1 span[itemprop="name"]')) {
                        info = parsePage(sdoc);
                        if (info) { resolve(info); return; }
                    }
                    let link = sdoc.querySelector('a[href*="/model/"]')?.getAttribute('href');
                    if (!link) { next(); return; }
                    if (link.startsWith('/')) link = xslistBase.replace(/\/+$/, '') + link;
                    gmRequest({ method: 'GET', url: link, anonymous: true, timeout: 15000 }).then(res2 => {
                        const info2 = parsePage(parseHTML(res2.responseText));
                        if (info2) resolve(info2);
                        else next();
                    }).catch(() => next());
                }).catch(() => next());
            }, () => { reject(new Error('xslist 搜索无结果')); });
        });
    };

    /** javdb（含性别检测） */
    const detectJavdbActorGender = (linkElement) => {
        if (!linkElement) return 'unknown';
        const link = $(linkElement);
        const ownText = [link.text(), link.attr('data-gender'), link.attr('title'), link.attr('aria-label')].filter(Boolean).join(' ');
        if (/♀|female|woman|女(?:優|优|演员|演員)?/i.test(ownText)) return 'female';
        if (/♂|male|man|男(?:優|优|演员|演員)?/i.test(ownText)) return 'male';
        let sibling = linkElement.nextSibling;
        let checked = 0;
        while (sibling && checked < 4) {
            if (sibling.nodeType === 1 && String(sibling.tagName || '').toLowerCase() === 'a') break;
            const text = String(sibling.textContent || '').trim();
            if (/♀/.test(text)) return 'female';
            if (/♂/.test(text)) return 'male';
            sibling = sibling.nextSibling;
            checked++;
        }
        return 'unknown';
    };

    const fetchJavdb = (code) => {
        return new Promise((resolve, reject) => {
            trySearchVariants(code, (q, next) => {
                gmRequest({
                    method: 'GET',
                    url: javdbSearchBase + encodeURIComponent(q) + '&f=all',
                    anonymous: true,
                    timeout: 15000
                }).then(res => {
                    const hdoc = parseHTML(res.responseText);
                    let link = hdoc.querySelector('a[href*="/v/"]')?.getAttribute('href') ||
                        hdoc.querySelector('.movie-list .item a')?.getAttribute('href');
                    if (!link) { next(); return; }
                    if (link.startsWith('/')) link = javdbBase + link;
                    return gmRequest({ method: 'GET', url: link, anonymous: true, timeout: 15000 });
                }).then(res2 => {
                    const ddoc = parseHTML(res2.responseText);
                    let ttl = ddoc.querySelector('h2.title')?.textContent.trim() ||
                        ddoc.querySelector('strong.current-title')?.textContent.trim() || '';
                    if (ttl.toUpperCase().startsWith(code.toUpperCase())) ttl = ttl.slice(code.length).trim();
                    if (isNotFoundTitle(ttl)) ttl = '';
                    let dateText = '';
                    ddoc.querySelectorAll('.panel-block').forEach(block => {
                        const t = block.textContent.trim();
                        if (/日期:|發行日期:|发行日期:/.test(t)) {
                            dateText = t.replace(/.*?[:：]/, '').trim();
                        }
                    });
                    const isoDate = normDate(dateText);
                    const actorEntries = [];
                    ddoc.querySelectorAll('a[href*="/actors/"]').forEach(a => {
                        const name = a.textContent.trim();
                        if (!name) return;
                        const gender = detectJavdbActorGender(a);
                        actorEntries.push({ name, gender });
                    });
                    const actresses = actorEntries.map(e => e.name);
                    if (!ttl) { next(); return; }
                    const info = { title: ttl, date: isoDate, actresses, actorEntries };
                    resolve(info);
                }).catch(() => next());
            }, () => { reject(new Error('JavDB 搜索无结果')); });
        });
    };

    /** fc2ppvdb */
    const fetchFC2PPVDB = (code) => {
        const fc2Number = code.match(/\d+$/)[0];
        return gmRequest({
            method: 'GET',
            url: fc2ppvdbBase + fc2Number,
            anonymous: true,
            timeout: 15000
        }).then(res => {
            const doc = parseHTML(res.responseText);
            let title = null;
            const link = doc.querySelector('a[href*="adult.contents.fc2.com"]');
            if (link) title = link.textContent.trim();
            if (!title) {
                title = doc.querySelector('title')?.textContent.trim() || '';
                if (title.includes(' - FC2PPVDB')) title = title.replace(' - FC2PPVDB', '').trim();
            }
            if (!title) throw new Error('无标题');
            return { title, date: '', actresses: [] };
        });
    };

    /** missav fc2 */
    const fetchMissavFC2 = (code) => {
        const standardFC2 = code;
        const expectedId = standardFC2.toLowerCase();
        return new Promise((resolve, reject) => {
            const sign = (path) => {
                const databaseId = 'missav-default';
                const publicToken = 'Ikkg568nlM51RHvldlPvc2GzZPE9R4XGzaH9Qj4zK9npbbbTly1gj9K4mgRn0QlV';
                const timestamp = Math.floor(Date.now() / 1000);
                const unsignedPath = `/${databaseId}${path}?frontend_timestamp=${timestamp}`;
                if (!globalThis.crypto || !globalThis.crypto.subtle || typeof TextEncoder === 'undefined') {
                    return Promise.reject(new Error('Web Crypto not supported'));
                }
                const encoder = new TextEncoder();
                return globalThis.crypto.subtle.importKey(
                    'raw',
                    encoder.encode(publicToken),
                    { name: 'HMAC', hash: 'SHA-1' },
                    false,
                    ['sign']
                ).then(key => globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(unsignedPath)))
                    .then(signature => {
                        const sig = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
                        return unsignedPath + '&frontend_sign=' + sig;
                    });
            };
            sign('/search/users/anonymous/items/').then(signedPath => {
                return gmRequest({
                    method: 'POST',
                    url: 'https://client-rapi-missav.recombee.com' + signedPath,
                    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                    data: JSON.stringify({
                        searchQuery: standardFC2,
                        count: 10,
                        cascadeCreate: true,
                        returnProperties: true
                    }),
                    anonymous: true,
                    timeout: 15000
                });
            }).then(res => {
                const data = JSON.parse(res.responseText);
                const results = Array.isArray(data && data.recomms) ? data.recomms : [];
                const exact = results.find(item => String(item && item.id || '').toLowerCase() === expectedId);
                if (!exact || !exact.values) throw new Error('No exact match');
                const values = exact.values;
                const title = String(values.title || '').trim();
                if (!title) throw new Error('No title');
                const actors = [].concat(
                    Array.isArray(values.actresses) ? values.actresses : [],
                    Array.isArray(values.actors) ? values.actors : []
                );
                let date = null;
                const releasedAt = Number(values.released_at);
                if (Number.isFinite(releasedAt) && releasedAt > 0) {
                    date = new Date(releasedAt * 1000).toISOString().slice(0, 10);
                }
                return { title, date, actresses: actors };
            }).then(resolve).catch(reject);
        });
    };

    /** avsox（无码站） */
    const fetchAvsox = (code) => {
        const url = 'https://avsox.host/cn/search/' + encodeURIComponent(code);
        return gmRequest({
            method: 'GET',
            url,
            anonymous: true,
            timeout: 15000
        }).then(res => {
            const doc = parseHTML(res.responseText);
            const item = doc.querySelector('.movie-box');
            if (!item) throw new Error('No movie found');
            const titleEl = item.querySelector('.title') || item.querySelector('.name');
            if (!titleEl) throw new Error('No title element');
            const title = titleEl.textContent.trim();
            const dateEl = doc.querySelector('.date') || doc.querySelector('.info .date');
            const date = dateEl ? dateEl.textContent.trim() : '';
            const actresses = [];
            doc.querySelectorAll('.star a, .actress a').forEach(a => {
                const n = a.textContent.trim();
                if (n) actresses.push(n);
            });
            if (!title) throw new Error('No title content');
            return { title, date, actresses, uncensored: true };
        });
    };

    // ========================================================================
    // 9. 远程信息获取（并发 + 超时控制）
    // ========================================================================
    const fetchRemoteInfo = (code, isUncensored = false) => {
        const key = code.toUpperCase();
        if (isInfoCacheValid(key)) return Promise.resolve(infoCache[key]);
        if (isNegativeCached(key)) return Promise.reject(new Error('Negative cache'));

        const sources = [];
        // FC2 特殊处理
        if (/^FC2-PPV-\d{5,8}$/i.test(code)) {
            sources.push(fetchJavdb, fetchMissavFC2, fetchFC2PPVDB);
            if (isUncensored) sources.push(fetchAvsox);
        } else {
            if (isUncensored) {
                sources.push(fetchAvsox);
            } else {
                sources.push(fetchJavdb, fetchJavbus, fetchXslist);
            }
        }

        // 使用 Promise.race 并发，但需要每个请求都包装超时
        const promises = sources.map(fn => fn(code).then(info => {
            storeInfo(key, info);
            return info;
        }).catch(() => null));

        return new Promise((resolve, reject) => {
            let settled = false;
            const checkDone = () => {
                if (settled) return;
                Promise.allSettled(promises).then(results => {
                    const firstFulfilled = results.find(r => r.status === 'fulfilled' && r.value !== null);
                    if (firstFulfilled) {
                        settled = true;
                        resolve(firstFulfilled.value);
                    } else {
                        settled = true;
                        markNegativeCached(key);
                        reject(new Error('All sources failed'));
                    }
                });
            };
            let remaining = promises.length;
            promises.forEach(p => p.finally(() => {
                remaining--;
                if (remaining === 0) checkDone();
            }));
            setTimeout(checkDone, 30000); // 30秒总超时
        });
    };

    // ========================================================================
    // 10. 翻译（DeepL + MyMemory）
    // ========================================================================
    const translateTitleToChinese = (title, enabled, fh) => {
        return new Promise((resolve) => {
            let originalTitle = String(title || '').trim();
            if (!enabled || !originalTitle) { resolve(originalTitle); return; }

            const deepL = () => {
                return gmRequest({
                    method: 'POST',
                    url: 'https://oneshot-free.www.deepl.com/v1/translate',
                    headers: { 'Authorization': 'None', 'Content-Type': 'application/json' },
                    data: JSON.stringify({ text: [originalTitle], source_lang: 'ja', target_lang: 'zh-Hans' }),
                    anonymous: true,
                    timeout: 15000
                }).then(res => {
                    const data = JSON.parse(res.responseText);
                    const translated = data?.translations?.[0]?.text?.trim() || '';
                    if (translated && translated !== originalTitle) return translated;
                    throw new Error('DeepL empty');
                });
            };
            const myMemory = () => {
                const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(originalTitle) + '&langpair=ja%7Czh-CN';
                return gmRequest({
                    method: 'GET',
                    url,
                    anonymous: true,
                    timeout: 15000
                }).then(res => {
                    const data = JSON.parse(res.responseText);
                    if (data.responseStatus !== 200) throw new Error('MyMemory status ' + data.responseStatus);
                    const translated = data?.responseData?.translatedText?.trim() || '';
                    if (translated && translated !== originalTitle && !/MYMEMORY WARNING|DAILY LIMIT/i.test(translated)) {
                        return translated;
                    }
                    throw new Error('MyMemory invalid');
                });
            };
            deepL().catch(() => myMemory()).then(trans => resolve(trans)).catch(() => resolve(originalTitle));
        });
    };

    // ========================================================================
    // 11. 改名主流程（async/await）
    // ========================================================================
    const getTargetName = async (vInfo, suffix, addDate, translateChinese) => {
        const code = vInfo.queryCode;
        const key = code.toUpperCase();
        if (isInfoCacheValid(key)) {
            const info = infoCache[key];
            return buildNameFromInfo(vInfo, info, suffix, addDate, translateChinese);
        }
        try {
            const isUncensored = vInfo.markers && vInfo.markers.includes('无码');
            const info = await fetchRemoteInfo(code, isUncensored);
            if (info) {
                storeInfo(key, info);
                return await buildNameFromInfo(vInfo, info, suffix, addDate, translateChinese);
            }
            return null;
        } catch (e) {
            return null;
        }
    };

    const buildNameFromInfo = async (vInfo, info, suffix, addDate, translateChinese) => {
        if (info.uncensored && !vInfo.markers.includes('无码')) {
            vInfo.markers.push('无码');
        }
        let finalTitle = info.title;
        if (translateChinese) {
            finalTitle = await translateTitleToChinese(info.title, true, vInfo.queryCode);
            if (finalTitle && finalTitle !== info.title) {
                finalTitle = `${info.title} ${finalTitle}`;
            }
        }
        return buildNewName(vInfo, finalTitle, info.actresses, (addDate && info.date) ? info.date : (addDate ? vInfo.date : ''), suffix);
    };

    // 对外接口
    window.rename_multi = (fid, vInfo, suffix, addDate, callback, origFilename, translateChinese = false) => {
        getTargetName(vInfo, suffix, addDate, translateChinese).then(newName => {
            if (newName) {
                send_115(fid, newName, vInfo.fullCode, origFilename, callback);
            } else {
                if (origFilename && hasManualNamePayload(origFilename, vInfo.queryCode)) {
                    showPageNotification(`${vInfo.fullCode} 已保护手动命名，跳过`, 'info', 3000);
                } else {
                    showPageNotification(`所有信息源未找到 ${vInfo.queryCode}`, 'error', 4000);
                }
                if (typeof callback === 'function') callback();
            }
        }).catch(() => { if (typeof callback === 'function') callback(); });
    };

    const local_rename = (fid, vInfo, suffix, addDate, callback, origFilename) => {
        const newName = buildNewName(vInfo, vInfo.localTitle, [], vInfo.date, suffix);
        const bareName = buildNewName(vInfo, '', [], vInfo.date, suffix);
        if (manualNameProtected(origFilename, vInfo, newName, bareName)) {
            showPageNotification(`${vInfo.fullCode} 已保护手动命名，跳过`, 'info', 3000);
            if (typeof callback === 'function') callback();
            return;
        }
        send_115(fid, newName, vInfo.fullCode, origFilename, callback);
    };

    // ========================================================================
    // 12. 发送修改请求
    // ========================================================================
    let renameCompareList = [];

    // ---- 改名回滚日志 ----
    // 只留「最近一批」改名（每个新批次开始时会重置），所以菜单叫「撤销上次改名」而不是「改名历史」。
    // 存 fid + 原名 + 新名；回滚 = 拿 fid 把文件名改回去。落 GM 存储，刷新页面也还在。
    const ROLLBACK_KEY = 'jb_renameJournal';
    const ROLLBACK_MAX = 800;
    let renameJournal = loadRenameJournal();
    let journalDirty = false;
    let journalTimer = null;

    function loadRenameJournal() {
        try {
            const raw = GM_getValue(ROLLBACK_KEY, '[]');
            const arr = raw ? JSON.parse(raw) : [];
            // 过滤残条目：缺 fid/from/to 的记回去也没用（改不了名）
            return Array.isArray(arr) ? arr.filter(e => e && e.fid && e.from && e.to) : [];
        } catch (e) {
            console.warn('[整理助手] 回滚日志损坏，已重置', e && e.message);
            try { GM_setValue(ROLLBACK_KEY, '[]'); } catch (e2) { /* ignore */ }
            return [];
        }
    }
    function saveRenameJournalNow() {
        if (!journalDirty) return;
        journalDirty = false;
        try { GM_setValue(ROLLBACK_KEY, JSON.stringify(renameJournal)); }
        catch (e) { console.warn('[整理助手] 回滚日志写入失败', e && e.message); }
    }
    // 一次改名动辄几百个文件，别每成功一个就写一次 GM 存储
    function markRenameJournalDirty() {
        journalDirty = true;
        if (journalTimer) return;
        journalTimer = setTimeout(() => { journalTimer = null; saveRenameJournalNow(); }, 1200);
    }
    function resetRenameJournal() {
        renameJournal = [];
        journalDirty = true;
        saveRenameJournalNow();
    }

    const send_115 = (id, name, fh, origFilename, callback, opts) => {
        const fn = name.replace(/[\\/:*?"<>|]/g, (c) => ({ '\\': '', '/': ' ', ':': ' ', '?': ' ', '"': ' ', '<': ' ', '>': ' ', '|': '' })[c] || '');
        // ⚠️ 必须保证 callback **一定被调用且只调用一次**：
        // 原来这里裸 JSON.parse(data) —— 115 偶发返回登录页/风控页 HTML 或空串，一抛异常
        // callback 就永远不触发，runTasksWithLimit 停在原地等回调，
        // renameInProgress 跟着永久锁死（表现为进度条卡住、只能刷新页面）。
        let settled = false;
        // callback 收一个布尔：这次改名到底成没成（回滚要用它决定哪些条目能被反向记录）
        const finish = (ok) => { if (settled) return; settled = true; if (typeof callback === 'function') callback(ok); };
        $.post('https://webapi.115.com/files/edit', { fid: id, file_name: fn }, data => {
            let success = false;
            try {
                let r = null;
                try {
                    r = (typeof data === 'string') ? JSON.parse(data) : data;
                } catch (e) {
                    r = { state: false, error: '响应不是 JSON（可能已被风控拦截）' };
                }
                if (!r || !r.state) showPageNotification(`${fh} 修改失败: ${(r && r.error) || '未知错误'}`, 'error', 3000);
                else {
                    success = true;
                    showPageNotification(`${fh} 修改成功`, 'success', 2000);
                    if (origFilename) renameCompareList.push({ original: origFilename, new: name });
                    if (origFilename && id && !(opts && opts.noJournal)) {
                        renameJournal.push({ fid: String(id), from: origFilename, to: name, ts: Date.now() });
                        if (renameJournal.length > ROLLBACK_MAX) renameJournal = renameJournal.slice(-ROLLBACK_MAX);
                        markRenameJournalDirty();
                    }
                }
            } finally {
                finish(success);
            }
        }).fail(() => { showPageNotification(`${fh} 请求失败`, 'error', 3000); finish(false); });
    };

    // ========================================================================
    // 13. 进度条与通知（UI）
    // ========================================================================
    window.renameInProgress = false;

    function runTasksWithLimit(tasks, limit, intervalMs, doneAll) {
        if (!tasks.length) { doneAll && doneAll(); return; }
        let index = 0, running = 0;
        let doneAllCalled = false;
        const callDoneAllOnce = () => {
            if (!doneAllCalled) {
                doneAllCalled = true;
                doneAll && doneAll();
            }
        };
        const next = () => {
            if (index >= tasks.length && running === 0) {
                callDoneAllOnce();
                return;
            }
            while (running < limit && index < tasks.length) {
                if (window.progressBox && window.progressBox.paused) { setTimeout(next, 500); return; }
                const task = tasks[index++];
                running++;
                const runTask = () => {
                    task(() => {
                        running--;
                        setTimeout(next, intervalMs || 0);
                    });
                };
                setTimeout(runTask, 0);
            }
        };
        next();
    }

    window.progressBox = {
        init(title, total) {
            this.total = total || 0; this.current = 0; this.title = title || '任务进度'; this.paused = false;
            let $box = $('#task-progress-box');
            if ($box.length === 0) {
                $('body').append(`<div id="task-progress-box" style="display:none;"><div style="display:flex;align-items:center;gap:8px;"><button id="tp-pause-btn" style="width:22px;height:22px;line-height:1;border:none;border-radius:3px;background:#1890ff;color:#fff;cursor:pointer;font-size:11px;padding:0;">⏸</button><div class="tp-title"></div></div><div class="tp-bar-outer"><div class="tp-bar-inner"></div></div><div class="tp-text"></div></div>`);
                $box = $('#task-progress-box');
                $('#tp-pause-btn').on('click', function () {
                    window.progressBox.paused = !window.progressBox.paused;
                    $(this).text(window.progressBox.paused ? '▶️' : '⏸');
                    window.showPageNotification(window.progressBox.paused ? '任务已暂停' : '任务已继续', 'info', 2000);
                });
            }
            $box.find('.tp-title').text(this.title);
            this.update(0); $box.show();
        },
        update(doneCount) {
            this.current = doneCount;
            const pct = Math.min(100, Math.round(doneCount * 100 / (this.total || 1)));
            const $box = $('#task-progress-box');
            $box.find('.tp-bar-inner').css('width', pct + '%');
            $box.find('.tp-text').text(`${doneCount}/${this.total} (${pct}%)`);
        },
        finish() { this.paused = false; this.update(this.total); setTimeout(() => $('#task-progress-box').fadeOut(300), 800); }
    };

    // ========================================================================
    // 14. Toast 通知
    // ========================================================================
    const toastQueue = [];
    let toastActive = 0;
    const TOAST_MAX = 3;
    const flushToastQueue = () => { if (toastQueue.length && toastActive < TOAST_MAX) toastQueue.shift()(); };
    window.showPageNotification = (message, type = 'info', duration) => {
        if (!duration) duration = type === 'error' ? 5000 : 3000;
        const show = () => {
            toastActive++;
            const id = 'cn-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
            $('body').append(`<div id="${id}" class="custom-notification ${type}">${message}</div>`);
            const $el = $(`#${id}`);
            setTimeout(() => $el.addClass('show'), 10);
            setTimeout(() => {
                $el.removeClass('show');
                setTimeout(() => { $el.remove(); toastActive--; flushToastQueue(); }, 300);
            }, duration);
        };
        if (toastActive >= TOAST_MAX) { toastQueue.push(show); return; }
        show();
    };

    // ========================================================================
    // 15. 预览模板与事件委托
    // ========================================================================
    const showRenamePreview = (rows, onConfirm, onCancel) => {
        const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const old = document.getElementById('rename-preview-overlay');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.id = 'rename-preview-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.45);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
        overlay.innerHTML = `
            <div style="width:min(980px,calc(100vw - 32px));max-height:88vh;background:#fff;border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,0.35);display:flex;flex-direction:column;overflow:hidden;">
                <div style="padding:16px 20px;background:linear-gradient(135deg,#1a6dff,#1890ff);color:#fff;display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="margin:0;font-size:16px;font-weight:600;">改名预览</h3>
                    <span id="rename-preview-close" style="cursor:pointer;font-size:22px;line-height:1;">×</span>
                </div>
                <div style="padding:10px 16px;border-bottom:1px solid #eee;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                    <button id="rp-select-all" style="padding:5px 12px;border:1px solid #d9d9d9;border-radius:4px;background:#fff;cursor:pointer;font-size:13px;">全选</button>
                    <button id="rp-invert" style="padding:5px 12px;border:1px solid #d9d9d9;border-radius:4px;background:#fff;cursor:pointer;font-size:13px;">反选</button>
                    <span id="rp-summary" style="font-size:13px;color:#666;margin-left:auto;"></span>
                </div>
                <div id="rp-body" style="flex:1;overflow:auto;padding:8px 0;"></div>
                <div style="padding:12px 20px;border-top:1px solid #eee;text-align:right;background:#fafafa;">
                    <button id="rp-cancel" style="padding:8px 18px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;margin-right:10px;">取消</button>
                    <button id="rp-confirm" style="padding:8px 20px;border:none;border-radius:6px;background:#1a6dff;color:#fff;cursor:pointer;font-size:14px;font-weight:600;">确认改名</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const body = document.getElementById('rp-body');
        const updateSummary = () => {
            const checked = document.querySelectorAll('.rp-chk:checked').length;
            document.getElementById('rp-summary').textContent = `共 ${rows.length} 个，已选 ${checked} 个`;
        };
        const renderList = () => {
            body.innerHTML = '';
            rows.forEach((row, idx) => {
                const tr = document.createElement('div');
                tr.style.cssText = 'display:flex;align-items:flex-start;gap:10px;padding:7px 16px;border-bottom:1px solid #f5f5f5;font-size:13px;';
                const statusColor = row.status === '手动命名保护' ? '#fa8c16' : (row.status === '未找到' ? '#cf1322' : '#52c41a');
                tr.innerHTML = `
                    <input type="checkbox" class="rp-chk" data-idx="${idx}" ${row.checked ? 'checked' : ''} style="margin-top:2px;flex-shrink:0;width:16px;height:16px;">
                    <div style="flex-shrink:0;width:150px;font-family:monospace;color:#1890ff;font-weight:600;">${esc(row.item.vi.fullCode)}</div>
                    <div style="flex:1;min-width:0;word-break:break-all;color:#333;">${esc(row.item.fn)}</div>
                    <div style="flex:1.2;min-width:0;word-break:break-all;color:#1890ff;">${esc(row.newName || '—')}</div>
                    <div style="flex-shrink:0;width:96px;text-align:center;color:${statusColor};font-weight:500;">${esc(row.status)}</div>`;
                body.appendChild(tr);
            });
            updateSummary();
        };

        // 事件委托方式
        body.addEventListener('change', (e) => {
            if (e.target.classList.contains('rp-chk')) updateSummary();
        });
        document.getElementById('rp-select-all').addEventListener('click', () => {
            document.querySelectorAll('.rp-chk').forEach(c => c.checked = true);
            updateSummary();
        });
        document.getElementById('rp-invert').addEventListener('click', () => {
            document.querySelectorAll('.rp-chk').forEach(c => c.checked = !c.checked);
            updateSummary();
        });
        document.getElementById('rename-preview-close').addEventListener('click', () => { overlay.remove(); onCancel(); });
        document.getElementById('rp-cancel').addEventListener('click', () => { overlay.remove(); onCancel(); });
        document.getElementById('rp-confirm').addEventListener('click', () => {
            const selected = [];
            document.querySelectorAll('.rp-chk:checked').forEach(c => selected.push(rows[Number(c.dataset.idx)]));
            overlay.remove();
            onConfirm(selected);
        });
        renderList();
    };

    // ========================================================================
    // 16. 批量预览与执行
    // ========================================================================
    const buildPreviewRows = (parsedItems, isLocal, addDate, translateChinese, done) => {
        const rows = [];
        if (isLocal) {
            parsedItems.forEach(item => {
                const newName = buildNewName(item.vi, item.vi.localTitle, [], item.vi.date, item.safeSuffix);
                const bareName = buildNewName(item.vi, '', [], item.vi.date, item.safeSuffix);
                const protectedName = manualNameProtected(item.fn, item.vi, newName, bareName);
                rows.push({ item, newName: protectedName ? null : newName, status: protectedName ? '手动命名保护' : '本地', checked: !protectedName });
            });
            done(rows);
            return;
        }
        const uniqueCodes = [...new Set(parsedItems.map(i => i.vi.queryCode.toUpperCase()))];
        const missingCodes = uniqueCodes.filter(c => !isInfoCacheValid(c));
        const afterPrefetch = () => {
            let remaining = parsedItems.length;
            const results = new Array(parsedItems.length);
            parsedItems.forEach((item, idx) => {
                getTargetName(item.vi, item.safeSuffix, addDate, translateChinese).then(newName => {
                    let status = '网络', checked = true;
                    if (!newName) {
                        status = hasManualNamePayload(item.fn, item.vi.queryCode) ? '手动命名保护' : '未找到';
                        checked = false;
                    }
                    results[idx] = { item, newName, status, checked };
                    if (--remaining === 0) done(results.filter(Boolean));
                }).catch(() => {
                    results[idx] = { item, newName: null, status: '错误', checked: false };
                    if (--remaining === 0) done(results.filter(Boolean));
                });
            });
        };
        if (!missingCodes.length) { afterPrefetch(); return; }
        let prefetched = 0;
        const prefetchNext = () => {
            if (prefetched >= missingCodes.length) { afterPrefetch(); return; }
            const code = missingCodes[prefetched++];
            fetchRemoteInfo(code).catch(() => { }).finally(() => setTimeout(prefetchNext, 200));
        };
        const concurrency = Math.min(3, missingCodes.length);
        for (let i = 0; i < concurrency; i++) prefetchNext();
    };

    const rename = (call, addDate, translateChinese = false) => {
        if (window.renameInProgress) {
            showPageNotification('已有任务正在进行中，请等待完成', 'info', 2000);
            return;
        }
        window.renameInProgress = true;

        const $items = $("iframe[rel='wangpan']").contents().find("li.selected");
        const cnt = $items.length;
        if (!cnt) {
            showPageNotification("请先选择文件或文件夹", 'info', 3000);
            window.renameInProgress = false;
            return;
        }

        const parsedItems = [];
        $items.each(function () {
            const $it = $(this);
            const fn = $it.attr("title");
            const ft = $it.attr("file_type");
            const fid = ft === "0" ? $it.attr("cate_id") : $it.attr("file_id");
            if (!fid || !fn) return;
            const safeSuffix = getSafeSuffix(fn);
            const vi = parseVideoInfo(fn, safeSuffix);
            if (vi) parsedItems.push({ fid, fn, safeSuffix, vi });
        });

        if (!parsedItems.length) {
            showPageNotification("未识别到有效番号", 'info', 3000);
            window.renameInProgress = false;
            return;
        }

        const isLocal = (call === local_rename);
        let finishCalled = false;
        const finishRename = () => {
            if (finishCalled) return;
            finishCalled = true;
            progressBox.finish();
            saveRenameJournalNow();   // 批次结束立刻落盘，别等那个 1.2s 的防抖定时器
            showPageNotification(`所有文件处理完成`, 'success', 5000);
            persistCaches();
            offerCompareExport();
            window.renameInProgress = false;
        };

        const cancelRename = () => {
            persistCaches();
            showPageNotification('已取消改名', 'info', 2000);
            window.renameInProgress = false;
        };

        const executeRename = (rows) => {
            if (!rows.length) { cancelRename(); return; }
            progressBox.init(isLocal ? '本地番号加工' : '联网改名', rows.length);
            renameCompareList = [];
            resetRenameJournal();   // 新批次开始：回滚日志只认「最近一批」
            let processed = 0;
            const tasks = rows.map(row => done => {
                send_115(row.item.fid, row.newName, row.item.vi.fullCode, row.item.fn, () => {
                    processed++;
                    progressBox.update(processed);
                    done();
                });
            });
            runTasksWithLimit(tasks, isLocal ? 5 : 3, 200, finishRename);
        };

        if (isLocal) {
            buildPreviewRows(parsedItems, true, addDate, false, rows => {
                showRenamePreview(rows, executeRename, cancelRename);
            });
        } else {
            showPageNotification('正在联网生成改名预览...', 'info', 4000);
            buildPreviewRows(parsedItems, false, addDate, translateChinese, rows => {
                showRenamePreview(rows, executeRename, cancelRename);
            });
        }

        function persistCaches() {
            setCache('jb_infoCache', infoCache);
            setCache('jb_actressCache', actressCache);
            setCache('jb_ratingCache', ratingCache);
            setCache('jb_negativeCache', negativeCache);
        }

        function offerCompareExport() {
            if (renameCompareList.length > 0) {
                if (confirm('改名已完成，是否导出对比？')) {
                    if (confirm('导出为 TXT 文件？\n（确定 = TXT，取消 = 复制到剪贴板）')) {
                        exportCompareToFile(renameCompareList);
                    } else {
                        copyCompareToClipboard(renameCompareList);
                    }
                }
            }
        }
    };

    // ========================================================================
    // 17. 备份与剪贴板
    // ========================================================================
    function exportCompareToFile(list) {
        const text = list.map(item => `${item.original}\t${item.new}`).join('\n');
        const header = '【旧文件名】\t【新文件名】\n';
        downloadTxt('Rename_Compare.txt', header + text);
    }
    function copyCompareToClipboard(list) {
        const text = list.map(item => `${item.original}\t${item.new}`).join('\n');
        const header = '【旧文件名】\t【新文件名】\n';
        copyToClipboard(header + text);
    }

    function backupFileNames() {
        const $items = $("iframe[rel='wangpan']").contents().find("li.selected");
        if ($items.length === 0) { showPageNotification("请先选中要备份的文件", 'info', 3000); return; }
        const names = [];
        $items.each(function () { const title = $(this).attr("title"); if (title) names.push(title); });
        if (names.length === 0) return;
        const text = names.join('\n');
        if (confirm('导出为 TXT 文件？\n（确定 = TXT，取消 = 复制到剪贴板）')) {
            downloadTxt('115_File_Backup.txt', text);
        } else { copyToClipboard(text); }
    }

    function downloadTxt(filename, text) {
        const blob = new Blob([text], { type: 'text/plain' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        showPageNotification('TXT 文件已下载', 'success', 3000);
    }
    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => showPageNotification('已复制到剪贴板', 'success', 3000))
                .catch(() => { GM_setClipboard(text); showPageNotification('已复制到剪贴板', 'success', 3000); });
        } else { GM_setClipboard(text); showPageNotification('已复制到剪贴板', 'success', 3000); }
    }

    // ========================================================================
    // 18. 归档功能（含演员性别优先）
    // ========================================================================
    const getSeriesFromCode = code => {
        const c = (typeof code === 'object' ? code.queryCode : String(code)).toUpperCase();
        if (/^FC2-PPV/.test(c) || /^\d{6}_\d{3}$/.test(c) || /^1PONDO[-_]/.test(c) || /^CARIB[-_]/.test(c)) return null;
        const m = c.match(/^([A-Z]+)-\d+/);
        return m ? m[1] : null;
    };

    const findOrCreateFolderAndMove = (fid, folderName, successCallback, failCallback) => {
        const cid = archiveRootCid || ROOT_DIR_CID;
        const cleanName = folderName.replace(/[\\/:*?"<>|]/g, ' ');
        if (folderCidCache[cleanName]) { moveFileToFolder(fid, folderCidCache[cleanName], cleanName, successCallback, failCallback); return; }
        $.get("https://webapi.115.com/files/search", { search_value: cleanName, format: "json", aid: "1", cid: cid, file_type: "0", limit: 1000 }, data => {
            const result = typeof data === 'string' ? JSON.parse(data) : data;
            if (result.state && result.data && result.data.count > 0) {
                const found = result.data.list.find(item => item.name === cleanName && item.file_type === "0");
                if (found) { folderCidCache[cleanName] = found.cid; moveFileToFolder(fid, found.cid, cleanName, successCallback, failCallback); return; }
            }
            $.post("https://webapi.115.com/files/add", { pid: cid, cname: cleanName }, createData => {
                const createResult = typeof createData === 'string' ? JSON.parse(createData) : createData;
                if (createResult.state) { folderCidCache[cleanName] = createResult.cid; moveFileToFolder(fid, createResult.cid, cleanName, successCallback, failCallback); }
                else if (createResult.errno === 20004) {
                    $.get("https://webapi.115.com/files/search", { search_value: cleanName, format: "json", aid: "1", cid: cid, file_type: "0", limit: 1000 }, data2 => {
                        const res2 = JSON.parse(data2);
                        const found2 = res2.data && res2.data.list.find(item => item.name === cleanName && item.file_type === "0");
                        if (found2) { folderCidCache[cleanName] = found2.cid; moveFileToFolder(fid, found2.cid, cleanName, successCallback, failCallback); }
                        else { showPageNotification(`创建文件夹失败，且未找到同名文件夹`, 'error', 3000); if (typeof failCallback === 'function') failCallback('重名冲突'); }
                    });
                } else { showPageNotification(`创建文件夹失败: ${createResult.error || '未知错误'}`, 'error', 3000); if (typeof failCallback === 'function') failCallback(createResult.error); }
            }).fail(() => { showPageNotification('创建文件夹请求失败', 'error', 3000); if (typeof failCallback === 'function') failCallback('网络错误'); });
        }).fail(() => { showPageNotification('搜索文件夹请求失败', 'error', 3000); if (typeof failCallback === 'function') failCallback('网络错误'); });
    };

    const moveFileToFolder = (fid, targetCid, folderName, successCallback, failCallback) => {
        $.post("https://webapi.115.com/files/move", { pid: targetCid, fid: fid }, data => {
            const result = typeof data === 'string' ? JSON.parse(data) : data;
            if (result.state) { showPageNotification(`已归档到 ${folderName}`, 'success', 2000); if (typeof successCallback === 'function') successCallback(); }
            else {
                const errorMsg = result.error || '未知错误';
                if (errorMsg.includes('尚未完成') || errorMsg.includes('请稍后再试')) { showPageNotification(`归档到 ${folderName} 暂时失败，请稍后重试`, 'error', 5000); }
                else { showPageNotification(`归档到 ${folderName} 失败: ${errorMsg}`, 'error', 5000); }
                if (typeof failCallback === 'function') failCallback(errorMsg);
            }
        }).fail(err => { showPageNotification(`移动文件请求失败: ${err.statusText || '网络错误'}`, 'error', 5000); if (typeof failCallback === 'function') failCallback(err.statusText); });
    };

    const archiveToActorFolder = () => {
        const $items = $("iframe[rel='wangpan']").contents().find("li.selected");
        const cnt = $items.length;
        if (!cnt) { showPageNotification("请先选择文件或文件夹", 'info', 3000); return; }
        if (!archiveRootCid) { showPageNotification("请先设置归档根目录（右键文件夹 → 设为归档根目录）", 'error', 5000); return; }

        const parsedItems = [];
        $items.each(function () {
            const $it = $(this);
            const fn = $it.attr("title");
            const ft = $it.attr("file_type");
            const fid = ft === "0" ? $it.attr("cate_id") : $it.attr("file_id");
            if (!fid || !fn) return;
            const safeSuffix = getSafeSuffix(fn);
            const vi = parseVideoInfo(fn, safeSuffix);
            if (vi) parsedItems.push({ fid, fn, vi });
        });
        if (!parsedItems.length) { showPageNotification("未识别到有效番号", 'info', 3000); return; }

        const uniqueCodes = [...new Set(parsedItems.map(item => item.vi.queryCode.toUpperCase()))];
        const missingCodes = uniqueCodes.filter(code => {
            if (actressCache[code] && actressCache[code].length) return false;
            if (isInfoCacheValid(code) && infoCache[code].actresses && infoCache[code].actresses.length) {
                actressCache[code] = infoCache[code].actresses;
                return false;
            }
            return true;
        });

        const startArchive = () => {
            progressBox.init('归档', parsedItems.length);
            let processed = 0, success = 0;
            const tasks = parsedItems.map(item => done => {
                const code = item.vi.queryCode;
                if (/^FC2-PPV-\d{5,8}$/i.test(code)) {
                    findOrCreateFolderAndMove(item.fid, "FC2", () => {
                        processed++; success++; progressBox.update(processed); done();
                    }, () => { processed++; progressBox.update(processed); done(); });
                } else {
                    let actorEntries = [];
                    const key = code.toUpperCase();
                    if (isInfoCacheValid(key) && infoCache[key].actorEntries) {
                        actorEntries = infoCache[key].actorEntries;
                    }
                    let rawActress = actressCache[key]?.[0] || '';
                    let folderName = '';
                    if (actorEntries.length > 0) {
                        const preferred = actorEntries.find(e => e.gender === 'female') || actorEntries.find(e => e.gender === 'unknown') || actorEntries[0];
                        folderName = preferred ? getStandardActressName(preferred.name) : '';
                    } else if (rawActress) {
                        folderName = getStandardActressName(rawActress);
                    }
                    if (!folderName) {
                        folderName = getSeriesFromCode(code) || '其他';
                    }
                    findOrCreateFolderAndMove(item.fid, folderName, () => {
                        processed++; success++; progressBox.update(processed); done();
                    }, () => { processed++; progressBox.update(processed); done(); });
                }
            });
            runTasksWithLimit(tasks, 3, 500, () => {
                progressBox.finish();
                showPageNotification(`归档完成：成功 ${success}/${parsedItems.length}`, 'success', 5000);
                persistArchiveCaches();
            });
        };

        const persistArchiveCaches = () => {
            setCache('jb_actressCache', actressCache);
            setCache('jb_infoCache', infoCache);
            setCache('jb_negativeCache', negativeCache);
        };

        if (missingCodes.length) {
            progressBox.init('预取演员信息', missingCodes.length);
            let prefetchIndex = 0;
            const prefetchNext = () => {
                if (prefetchIndex >= missingCodes.length) {
                    progressBox.finish();
                    startArchive();
                    return;
                }
                const code = missingCodes[prefetchIndex++];
                progressBox.update(prefetchIndex);
                fetchRemoteInfo(code).then(info => {
                    if (info) {
                        infoCache[code.toUpperCase()] = info;
                        if (info.actresses && info.actresses.length) actressCache[code.toUpperCase()] = info.actresses;
                    }
                }).finally(() => setTimeout(prefetchNext, 500));
            };
            const prefetchConcurrency = Math.min(2, missingCodes.length);
            for (let i = 0; i < prefetchConcurrency; i++) prefetchNext();
        } else {
            startArchive();
        }
    };

    // ========================================================================
    // 19. 分桶归档
    // ========================================================================
    const getBucketFolderName = (code) => {
        const c = String(code).toUpperCase();
        if (/^FC2-PPV/.test(c)) return 'FC2';
        const m = c.match(/^([A-Z]+)-(\d+)$/);
        if (m) {
            const prefix = m[1];
            const num = parseInt(m[2], 10);
            const start = Math.floor(num / 1000) * 1000;
            const end = start + 999;
            return `${prefix}-${String(start).padStart(4, '0')}-${String(end).padStart(4, '0')}`;
        }
        return '其他';
    };

    const archiveToBucketFolder = () => {
        const $items = $("iframe[rel='wangpan']").contents().find("li.selected");
        const cnt = $items.length;
        if (!cnt) { showPageNotification("请先选择文件或文件夹", 'info', 3000); return; }
        if (!archiveRootCid) { showPageNotification("请先设置归档根目录（右键文件夹 → 设为归档根目录）", 'error', 5000); return; }

        const parsedItems = [];
        $items.each(function () {
            const $it = $(this);
            const fn = $it.attr("title");
            const ft = $it.attr("file_type");
            const fid = ft === "0" ? $it.attr("cate_id") : $it.attr("file_id");
            if (!fid || !fn) return;
            const safeSuffix = getSafeSuffix(fn);
            const vi = parseVideoInfo(fn, safeSuffix);
            if (vi) parsedItems.push({ fid, fn, vi });
        });
        if (!parsedItems.length) { showPageNotification("未识别到有效番号", 'info', 3000); return; }

        progressBox.init('分桶归档', parsedItems.length);
        let processed = 0, success = 0;
        const tasks = parsedItems.map(item => done => {
            const bucket = getBucketFolderName(item.vi.queryCode);
            findOrCreateFolderAndMove(item.fid, bucket, () => {
                processed++; success++; progressBox.update(processed); done();
            }, () => { processed++; progressBox.update(processed); done(); });
        });
        runTasksWithLimit(tasks, 3, 500, () => {
            progressBox.finish();
            showPageNotification(`分桶归档完成：成功 ${success}/${parsedItems.length}`, 'success', 5000);
            setCache('jb_negativeCache', negativeCache);
        });
    };

    // ========================================================================
    // 20. JavDB 评分
    // ========================================================================
    const getJavdbRating = () => {
        const $items = $("iframe[rel='wangpan']").contents().find("li.selected");
        const cnt = $items.length;
        if (!cnt) { showPageNotification("请先选择文件或文件夹", 'info', 3000); return; }

        const parsedItems = [];
        $items.each(function () {
            const $it = $(this);
            const fn = $it.attr("title");
            const ft = $it.attr("file_type");
            const fid = ft === "0" ? $it.attr("cate_id") : $it.attr("file_id");
            if (!fid || !fn) return;
            const safeSuffix = getSafeSuffix(fn);
            const vi = parseVideoInfo(fn, safeSuffix);
            if (vi && vi.queryCode) parsedItems.push({ fid, fn, vi });
        });
        if (!parsedItems.length) { showPageNotification("未识别到有效番号", 'info', 3000); return; }

        const uniqueCodes = [...new Set(parsedItems.map(item => item.vi.queryCode.toUpperCase()))];
        const missingCodes = uniqueCodes.filter(code => !ratingCache[code]);

        const startUpdate = () => {
            progressBox.init('更新评分', parsedItems.length);
            let processed = 0, success = 0;
            const tasks = parsedItems.map(item => done => {
                const code = item.vi.queryCode.toUpperCase();
                const star = ratingCache[code];
                if (star) {
                    update115Rating(item.fid, star, item.vi.queryCode, item.fn, ok => {
                        processed++;
                        if (ok) success++;
                        progressBox.update(processed);
                        done();
                    });
                } else {
                    processed++;
                    progressBox.update(processed);
                    done();
                }
            });
            runTasksWithLimit(tasks, 2, 300, () => {
                progressBox.finish();
                showPageNotification(`评分更新完成：成功 ${success}/${parsedItems.length}`, 'success', 5000);
                setCache('jb_ratingCache', ratingCache);
            });
        };

        if (missingCodes.length) {
            progressBox.init('获取评分', missingCodes.length);
            let prefetchIndex = 0;
            const prefetchNext = () => {
                if (prefetchIndex >= missingCodes.length) {
                    progressBox.finish();
                    startUpdate();
                    return;
                }
                const code = missingCodes[prefetchIndex++];
                progressBox.update(prefetchIndex);
                fetchRatingForCode(code).then(star => {
                    if (star) ratingCache[code] = star;
                }).finally(() => setTimeout(prefetchNext, 300));
            };
            const prefetchConcurrency = Math.min(2, missingCodes.length);
            for (let i = 0; i < prefetchConcurrency; i++) prefetchNext();
        } else {
            startUpdate();
        }
    };

    const fetchRatingForCode = (code) => {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: javdbSearchBase + encodeURIComponent(code) + "&f=all",
                timeout: 15000,
                anonymous: true,
                onload: xhr => {
                    if (xhr.status !== 200) { resolve(null); return; }
                    try {
                        const doc = parseHTML(xhr.responseText);
                        const item = doc.querySelector('.movie-list .item');
                        if (item) {
                            let rating = parseFloat(item.getAttribute('score'));
                            if (isNaN(rating)) {
                                const rel = item.querySelector('.score .value');
                                if (rel) {
                                    const m = rel.textContent.trim().match(/(\d+\.\d+)分/);
                                    if (m) rating = parseFloat(m[1]);
                                }
                            }
                            if (!isNaN(rating)) { resolve(Math.round(rating)); return; }
                            const link = item.querySelector('a.box');
                            if (link) {
                                const href = link.getAttribute('href');
                                if (href) {
                                    const detailUrl = javdbBase + (href.startsWith('/') ? href : '/' + href);
                                    GM_xmlhttpRequest({
                                        method: "GET",
                                        url: detailUrl,
                                        timeout: 15000,
                                        anonymous: true,
                                        onload: dx => {
                                            try {
                                                const dd = parseHTML(dx.responseText);
                                                const rEl = dd.querySelector('.panel-block .value');
                                                if (rEl) {
                                                    const rating = parseFloat(rEl.textContent.trim().match(/(\d+\.\d+)/)?.[1]);
                                                    if (!isNaN(rating)) { resolve(Math.round(rating)); return; }
                                                }
                                                resolve(null);
                                            } catch (e) { resolve(null); }
                                        },
                                        onerror: () => resolve(null),
                                        ontimeout: () => resolve(null)
                                    });
                                    return;
                                }
                            }
                        }
                        resolve(null);
                    } catch (e) { resolve(null); }
                },
                onerror: () => resolve(null),
                ontimeout: () => resolve(null)
            });
        });
    };

    const update115Rating = (fid, star, fh, fname, callback) => {
        star = Math.max(1, Math.min(5, star));
        const finish = (ok) => { showPageNotification(`"${fh}"评分${ok ? `更新为 ${star} 星` : '更新失败'}`, ok ? 'success' : 'error', 2000); callback(ok); };
        $.ajax({
            url: "https://webapi.115.com/files/score", type: "POST", data: { file_id: fid, score: star }, dataType: "json",
            success: r => { if (r && r.state) finish(true); else backupScore(); },
            error: backupScore
        });
        function backupScore() {
            $.ajax({
                url: "https://webapi.115.com/files/edit_property", type: "POST", data: { file_id: fid, property: "score", value: star }, dataType: "json",
                success: r => finish(r && r.state),
                error: () => finish(false)
            });
        }
    };

    // ========================================================================
    // 21. UI 初始化与菜单
    // ========================================================================
    const rootInfoId = 'archive-root-info-' + Date.now();
    function cleanupExistingRootInfo() {
        try {
            document.querySelectorAll('[id^="archive-root-info"]').forEach(el => el.remove());
            document.querySelectorAll('iframe').forEach(iframe => {
                try { if (iframe.contentDocument) iframe.contentDocument.querySelectorAll('[id^="archive-root-info"]').forEach(el => el.remove()); } catch (e) { }
            });
        } catch (e) { }
    }
    cleanupExistingRootInfo();

    const uiStyle = `<style>
        [id^="archive-root-info"] { position: fixed; top: 20px; right: 20px; max-width: 300px; background: rgba(0,0,0,.8); color: #fff; padding: 12px 20px; border-radius: 4px; z-index: 9998; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,.15); border-left: 4px solid #1890ff; }
        .custom-notification { position: fixed; top: 80px; right: 20px; max-width: 300px; background: rgba(0,0,0,.8); color: #fff; padding: 12px 20px; border-radius: 4px; z-index: 9999; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,.15); transition: all .3s ease; opacity: 0; transform: translateY(-10px); }
        .custom-notification.success { border-left: 4px solid #52c41a; }
        .custom-notification.error { border-left: 4px solid #f5222d; }
        .custom-notification.info { border-left: 4px solid #1890ff; }
        .custom-notification.show { opacity: 1; transform: translateY(0); }
        #task-progress-box { position: fixed; bottom: 20px; right: 20px; min-width: 260px; background: rgba(0,0,0,.8); color: #fff; padding: 10px 14px; border-radius: 4px; z-index: 9999; font-size: 12px; box-shadow: 0 4px 12px rgba(0,0,0,.15); }
        #task-progress-box .tp-title { font-size: 12px; margin-bottom: 6px; }
        #task-progress-box .tp-bar-outer { width: 100%; height: 6px; background: rgba(255,255,255,.15); border-radius: 3px; overflow: hidden; }
        #task-progress-box .tp-bar-inner { height: 100%; width: 0%; background: #1890ff; transition: width .2s ease; }
        #task-progress-box .tp-text { margin-top: 4px; text-align: right; font-size: 11px; opacity: .9; }
    </style>`;
    $('head').append(uiStyle);

    const ROOT_DIR_CID = "0";
    let archiveRootCid = GM_getValue("archiveRootCid", null);
    let archiveRootName = GM_getValue("archiveRootName", null);
    const folderCidCache = {};

    const showArchiveRootInfo = () => {
        cleanupExistingRootInfo();
        let msg = (archiveRootCid && archiveRootName) ? `当前归档根目录: "${archiveRootName}"` : "当前无归档根目录，将使用115网盘根目录";
        if (window.self === window.top) $('body').append(`<div id="${rootInfoId}" class="archive-root-info">${msg}</div>`);
    };

    let rootInfoTimer = null;
    const initializeRootInfo = () => {
        if (window.self !== window.top) return;
        if (rootInfoTimer) clearTimeout(rootInfoTimer);
        rootInfoTimer = setTimeout(() => { showArchiveRootInfo(); rootInfoTimer = null; }, 2000);
    };
    $(window).on('load', initializeRootInfo);
    if (document.readyState === 'complete') initializeRootInfo();

    // ========================================================================
    // 23. 递归整理模块
    //     流程：递归扫描当前目录及全部子目录 → 抽取番号 → 视频汇总到当前目录
    //           → 复用本脚本引擎刮削改名 → 清空已空的子目录
    //     目录/移动/删除接口整合自「115不大助手」，改名复用本脚本引擎
    // ========================================================================
    const API_BASE = 'https://webapi.115.com';
    const VIDEO_EXT_RE = /\.(mp4|mkv|avi|rmvb|rm|wmv|flv|mov|ts|m2ts|m4v|webm|iso|mpg|mpeg|vob|3gp|asf|f4v|divx|mts|tp|trp)$/i;
    const SCAN_MAX_DEPTH = 12;
    const SCAN_MAX_DIRS = 1500;
    const SCAN_MAX_FILES = 8000;
    const API_CHUNK = 50;

    /** GET 115 Web API */
    const apiGet115 = async (path, params) => {
        const qs = params ? '?' + Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&') : '';
        const res = await gmRequest({
            method: 'GET', url: API_BASE + path + qs,
            headers: { 'Cookie': document.cookie, 'Referer': 'https://115.com/', 'Origin': 'https://115.com' },
            timeout: 30000
        });
        try { return JSON.parse(res.responseText); } catch (e) { return { state: false, error: '响应解析失败(' + res.status + ')' }; }
    };

    /** POST 115 Web API（body 已是编码好的表单串） */
    const apiPost115 = async (path, body) => {
        const res = await gmRequest({
            method: 'POST', url: API_BASE + path,
            headers: {
                'Cookie': document.cookie, 'Referer': 'https://115.com/', 'Origin': 'https://115.com',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: body, timeout: 120000
        });
        try { return JSON.parse(res.responseText); } catch (e) { return { state: false, error: '响应解析失败(' + res.status + ')' }; }
    };

    /** 115 的 fid[i] 数组式表单体 */
    const buildIdsBody = (extras, key, ids) => {
        const parts = [];
        Object.keys(extras).forEach(k => parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(extras[k])));
        ids.forEach((id, i) => parts.push(encodeURIComponent(key + '[' + i + ']') + '=' + encodeURIComponent(id)));
        return parts.join('&');
    };

    /** 当前所在目录 cid */
    const getCurrentCid = () => {
        try {
            const cid = new URLSearchParams(location.search).get('cid');
            if (cid) return String(cid);
        } catch (e) { /* ignore */ }
        try {
            const fr = $("iframe[rel='wangpan']")[0];
            if (fr) {
                const m = String(fr.getAttribute('src') || '').match(/[?&]cid=(\d+)/);
                if (m) return m[1];
            }
        } catch (e) { /* ignore */ }
        // 取不到就如实返回 null —— 原来静默兜成 '0'（根目录），一旦页面 URL 结构变了，
        // 整理会把整个网盘当成「当前目录」去汇总文件、删空目录，代价太大。
        return null;
    };

    /** 列出一个目录的全部条目（自动翻页） */
    const listDirAll = async (cid) => {
        const all = [];
        let offset = 0;
        for (let page = 0; page < 20; page++) {
            const json = await apiGet115('/files', {
                aid: 1, cid: cid, offset: offset, limit: 1150, show_dir: 1,
                format: 'json', o: 'file_name', asc: 1, natsort: 1, cur: 1
            });
            if (!json || !json.state) throw new Error((json && json.error) || '读取目录失败');
            const list = Array.isArray(json.data) ? json.data : [];
            all.push(...list);
            const total = Number(json.count || all.length);
            if (list.length < 1150 || all.length >= total) break;
            offset += 1150;
        }
        return all;
    };

    /** 递归扫描目录树（有 fid = 文件；无 fid = 子目录）
        ⚠️ listed 记录「真正成功列过的目录 cid」—— 后面判空目录时全靠它兜命：
        请求失败 / 超深度 / 撞上限而没被列过的目录，里面有什么是**未知的**，绝不能当空目录删掉。 */
    const scanTree = async (rootCid, onTick) => {
        const files = [];
        const dirs = [];
        const listed = new Set();
        const queue = [{ cid: String(rootCid), path: '', depth: 0 }];
        let visited = 0;
        while (queue.length) {
            if (dirs.length >= SCAN_MAX_DIRS || files.length >= SCAN_MAX_FILES) {
                showPageNotification('目录数量超过上限，已提前停止扫描', 'info', 4000);
                break;
            }
            const cur = queue.shift();
            if (cur.depth > SCAN_MAX_DEPTH) continue;
            let list = [];
            try { list = await listDirAll(cur.cid); }
            catch (e) { showPageNotification(`读取「${cur.path || '当前目录'}」失败：${e.message}`, 'error', 4000); continue; }
            listed.add(cur.cid);         // 只有走到这里才算「看过内容」
            list.forEach(it => {
                const name = String(it.n || it.name || '');
                if (!name) return;
                const fid = it.fid;
                if (fid !== undefined && fid !== null && String(fid) !== '') {
                    files.push({ fid: String(fid), name: name, cid: String(it.cid || cur.cid), path: cur.path });
                } else {
                    const childCid = String(it.cid || '');
                    if (!childCid || childCid === cur.cid) return;
                    const childPath = cur.path ? cur.path + '/' + name : name;
                    dirs.push({ cid: childCid, name: name, path: childPath, parentCid: cur.cid, depth: cur.depth + 1 });
                    queue.push({ cid: childCid, path: childPath, depth: cur.depth + 1 });
                }
            });
            visited++;
            if (onTick) onTick(visited);
        }
        return { files: files, dirs: dirs, listed: listed };
    };

    /** 批量移动到目标目录 */
    const moveFidsTo = async (fids, targetCid) => {
        let ok = 0;
        for (let i = 0; i < fids.length; i += API_CHUNK) {
            const part = fids.slice(i, i + API_CHUNK);
            const json = await apiPost115('/files/move', buildIdsBody({ pid: targetCid, ignore_warn: 1 }, 'fid', part));
            if (json && json.state) ok += part.length;
            else showPageNotification('移动失败：' + ((json && json.error) || '未知错误'), 'error', 4000);
            await new Promise(r => setTimeout(r, 220));
        }
        return ok;
    };

    /** 批量删除（pid = 被删项的父目录 cid） */
    const deleteItems = async (parentCid, ids) => {
        let ok = 0;
        for (let i = 0; i < ids.length; i += API_CHUNK) {
            const part = ids.slice(i, i + API_CHUNK);
            const json = await apiPost115('/rb/delete', buildIdsBody({ pid: parentCid, ignore_warn: 1 }, 'fid', part));
            if (json && json.state) ok += part.length;
            else showPageNotification('删除失败：' + ((json && json.error) || '未知错误'), 'error', 4000);
            await new Promise(r => setTimeout(r, 220));
        }
        return ok;
    };

    /**
     * 找出空目录（自底向上）
     * onlyNoVideo=true 时，把「只剩非视频文件」的目录也算空
     * 返回最顶层空目录（父目录也在集合中时不重复返回）
     */
    const findEmptyDirs = (tree, onlyNoVideo) => {
        const fileCount = new Map();
        const videoCount = new Map();
        tree.files.forEach(f => {
            fileCount.set(f.cid, (fileCount.get(f.cid) || 0) + 1);
            if (VIDEO_EXT_RE.test(f.name)) videoCount.set(f.cid, (videoCount.get(f.cid) || 0) + 1);
        });
        const children = new Map();
        tree.dirs.forEach(d => {
            if (!children.has(d.parentCid)) children.set(d.parentCid, []);
            children.get(d.parentCid).push(d.cid);
        });
        const memo = new Map();
        const isEmpty = (cid) => {
            if (memo.has(cid)) return memo.get(cid);
            memo.set(cid, false);
            // 没成功列过 → 内容未知。宁可不删，也不能把一整个子树判成「空」删掉。
            // （父目录同理会被拖成非空，因为 kids.every(isEmpty) 必然为 false）
            if (tree.listed && !tree.listed.has(cid)) return false;
            const hasContent = onlyNoVideo ? (videoCount.get(cid) || 0) > 0 : (fileCount.get(cid) || 0) > 0;
            if (hasContent) return false;
            const kids = children.get(cid) || [];
            const res = kids.every(k => isEmpty(k));
            memo.set(cid, res);
            return res;
        };
        const all = tree.dirs.filter(d => isEmpty(d.cid));
        const set = new Set(all.map(d => d.cid));
        return all.filter(d => !set.has(d.parentCid));
    };

    /* ---------------- 整理用的行构造（本地优先） ----------------
       行里带着「字段」而不是最终名字：这样用户在预览面板里换「重命名方式」时
       只要重算名字就行（纯本地、零请求），不用重新扫描也不用重新联网。 */
    const recomputeRow = (row) => {
        const it = row.item;
        const f = row.fields || {};
        const name = buildNewName(it.vi, f.title, f.actresses, f.date, it.safeSuffix, { rating: f.rating });
        // 「只要番号」这类不含标题的方式下，不做手动命名保护（见 manualNameProtected 的说明）
        if (!namingHasTitle()) return name;
        const bare = buildNewName(it.vi, '', [], it.vi.date, it.safeSuffix, {});
        if (manualNameProtected(it.fn, it.vi, name, bare)) return null;
        return name;
    };

    /** 顺序重算所有行（换重命名方式后调用） */
    const recomputeAllRows = (rows) => {
        rows.forEach(row => {
            const wasProtected = row.status === '手动命名保护';
            const name = recomputeRow(row);
            row.newName = name;
            if (!name) { row.status = '手动命名保护'; row.checked = false; }
            else if (wasProtected && !name) { /* 保持 */ }
            else if (row.status === '手动命名保护' && name) { row.status = row.remote ? '联网补全' : '本地'; row.checked = true; }
        });
        return rows;
    };

    /** 本地优先的行：先用文件名里的信息算名字，只有「本地没标题」的才需要联网 */
    const buildOrganizeRows = (parsedItems, opts) => parsedItems.map(item => {
        const row = {
            item: item,
            fields: {
                title: item.vi.localTitle || '',
                actresses: [],
                date: item.vi.date || '',
                rating: ratingText(item.vi.queryCode)
            },
            remote: false,
            status: '本地',
            checked: true
        };
        row.newName = recomputeRow(row);
        if (!row.newName) { row.status = '手动命名保护'; row.checked = false; }
        return row;
    });

    /** 缺信息的条目列表（本地已经给出标题的就不用联网了） */
    const rowsNeedingRemote = (rows) => rows.filter(r => !r.remote && !(r.fields && r.fields.title));

    /** 只给「缺信息」的那些条目联网补全，补到就重算名字。并发 3，不抓已够用的条目。 */
    const fillMissingRows = (rows, opts, done) => {
        const targets = rowsNeedingRemote(rows);
        if (!targets.length) { if (done) done(0); return; }
        const codes = [...new Set(targets.map(r => String(r.item.vi.queryCode || '').toUpperCase()).filter(Boolean))];
        const uncensored = {};
        targets.forEach(r => {
            const key = String(r.item.vi.queryCode || '').toUpperCase();
            if (r.item.vi.markers && r.item.vi.markers.indexOf('无码') >= 0) uncensored[key] = true;
        });
        let started = 0, finished = 0, filled = 0;
        const total = codes.length;
        const apply = (code, info) => {
            if (!info) { finished++; return Promise.resolve(); }
            return (opts && opts.translateChinese
                ? translateTitleToChinese(info.title, true, code).then(zh => {
                    if (zh && zh !== info.title) return { title: info.title + ' ' + zh, actresses: info.actresses, date: info.date };
                    return { title: info.title, actresses: info.actresses, date: info.date };
                }).catch(() => ({ title: info.title, actresses: info.actresses, date: info.date }))
                : Promise.resolve({ title: info.title, actresses: info.actresses, date: info.date })
            ).then(fields => {
                rows.forEach(r => {
                    if (String(r.item.vi.queryCode || '').toUpperCase() !== code) return;
                    r.remote = true;
                    if (fields.title) r.fields.title = fields.title;
                    r.fields.actresses = fields.actresses || [];
                    if (opts && opts.addDate && fields.date) r.fields.date = fields.date;
                    r.fields.rating = ratingText(code) || r.fields.rating;
                    r.newName = recomputeRow(r);
                    if (!r.newName) { r.status = '手动命名保护'; r.checked = false; }
                    else { r.status = '联网补全'; if (r.checked !== false) r.checked = true; }
                });
                filled++;
                finished++;
            });
        };
        showPageNotification(`本地信息不足 ${targets.length} 条，正在联网补全（其余条目不受影响）…`, 'info', 4000);
        const pump = () => {
            while (started < total && (started - finished) < 3) {
                const code = codes[started++];
                Promise.resolve()
                    .then(() => fetchRemoteInfo(code, !!uncensored[code]))
                    .then(info => apply(code, info))
                    .catch(() => apply(code, null))
                    .then(() => { if (finished >= total) { if (done) done(filled); } else pump(); });
            }
        };
        pump();
    };

    /** 整理预览面板 */
    const showOrganizePreview = (rows, ctx, onConfirm, onCancel) => {
        const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const old = document.getElementById('org-preview-overlay');
        if (old) old.remove();
        const moveCount = rows.filter(r => String(r.item.srcCid) !== String(ctx.rootCid)).length;

        const overlay = document.createElement('div');
        overlay.id = 'org-preview-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.45);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
        overlay.innerHTML = `
            <div style="width:min(1100px,calc(100vw - 32px));max-height:90vh;background:#fff;border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,0.35);display:flex;flex-direction:column;overflow:hidden;">
                <div style="padding:16px 20px;background:linear-gradient(135deg,#1a6dff,#1890ff);color:#fff;display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="margin:0;font-size:16px;font-weight:600;">递归整理预览</h3>
                    <span id="org-close" style="cursor:pointer;font-size:22px;line-height:1;">×</span>
                </div>
                <div style="padding:10px 16px;border-bottom:1px solid #eee;display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:13px;color:#333;">
                    <span>扫描到 ${ctx.dirCount} 个子目录 / ${ctx.videoTotal} 个视频，识别番号 ${rows.length} 个，其中需移动到当前目录 ${moveCount} 个${ctx.skipped ? `，未识别番号跳过 ${ctx.skipped} 个` : ''}</span>
                    <span style="margin-left:auto;display:flex;gap:14px;">
                        <label style="cursor:pointer;"><input type="checkbox" id="org-remove-empty" checked style="vertical-align:-2px;"> 删除已清空的子目录</label>
                        <label style="cursor:pointer;color:#cf1322;"><input type="checkbox" id="org-remove-novideo" style="vertical-align:-2px;"> 同时删除只剩非视频文件的子目录（文件会被一并删除）</label>
                    </span>
                </div>
                <div style="padding:8px 16px;border-bottom:1px solid #eee;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                    <button id="org-all" style="padding:5px 12px;border:1px solid #d9d9d9;border-radius:4px;background:#fff;cursor:pointer;font-size:13px;">全选</button>
                    <button id="org-invert" style="padding:5px 12px;border:1px solid #d9d9d9;border-radius:4px;background:#fff;cursor:pointer;font-size:13px;">反选</button>
                    <span style="margin-left:auto;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                        <label style="font-size:13px;color:#333;">重命名方式
                            <select id="org-naming-mode" style="margin-left:6px;padding:4px 8px;border:1px solid #d9d9d9;border-radius:4px;background:#fff;font-size:13px;">
                                ${NAMING_MODES.map(m => `<option value="${m.key}"${m.key === namingCfg.mode ? ' selected' : ''}>${m.label}</option>`).join('')}
                            </select>
                        </label>
                        <button id="org-naming-edit" title="打开命名方式设置：变量说明、实时示例、恢复默认模板" style="padding:4px 10px;border:1px solid #d9d9d9;border-radius:4px;background:#fff;cursor:pointer;font-size:12px;">自定义…</button>
                        <label style="font-size:13px;cursor:pointer;" title="本地文件名里已经有片名的条目不会联网；只有缺片名的才去补">
                            <input type="checkbox" id="org-fill-missing"${ctx.opts && ctx.opts.network ? ' checked' : ''} style="vertical-align:-2px;"> 缺信息的联网补全
                        </label>
                        <span id="org-summary" style="font-size:13px;color:#666;"></span>
                    </span>
                </div>
                <div id="org-naming-custom-row" style="display:none;padding:8px 16px;border-bottom:1px solid #eee;background:#fcfdff;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px;color:#333;">
                    <span>名称模板</span>
                    <input id="org-naming-tpl" placeholder="{code} {title} {actress} -{date}" style="flex:1;min-width:220px;padding:5px 10px;border:1px solid #d9d9d9;border-radius:4px;font-family:monospace;font-size:12px;">
                    <span id="org-naming-vars" style="display:flex;gap:4px;flex-wrap:wrap;">
                        ${NAMING_VARS.map(v => `<a data-var="${v.key}" title="${esc(v.label)}" style="display:inline-block;padding:2px 8px;background:#eef4ff;border:1px solid #cfe0ff;border-radius:10px;font-family:monospace;font-size:11px;color:#1a6dff;cursor:pointer;">${v.key}</a>`).join('')}
                    </span>
                    <span style="color:#8c8c8c;font-size:12px;">改完立刻重算新文件名（纯本地，不联网）</span>
                </div>
                <div style="display:flex;padding:6px 16px;background:#fafafa;font-size:12px;color:#888;font-weight:600;border-bottom:1px solid #eee;">
                    <div style="flex-shrink:0;width:36px;"></div>
                    <div style="flex-shrink:0;width:130px;">番号</div>
                    <div style="flex-shrink:0;width:180px;">来源目录</div>
                    <div style="flex:1;">原文件名</div>
                    <div style="flex:1.2;">新文件名</div>
                    <div style="flex-shrink:0;width:96px;text-align:center;">状态</div>
                </div>
                <div id="org-body" style="flex:1;overflow:auto;"></div>
                <div style="padding:12px 20px;border-top:1px solid #eee;text-align:right;background:#fafafa;">
                    <button id="org-cancel" style="padding:8px 18px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;margin-right:10px;">取消</button>
                    <button id="org-confirm" style="padding:8px 20px;border:none;border-radius:6px;background:#1a6dff;color:#fff;cursor:pointer;font-size:14px;font-weight:600;">确认整理</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const body = document.getElementById('org-body');
        const updateSummary = () => {
            const checked = document.querySelectorAll('.org-chk:checked').length;
            document.getElementById('org-summary').textContent = `共 ${rows.length} 个，已选 ${checked} 个`;
        };
        const rowRefs = [];
        const statusColorOf = (row) => row.status === '手动命名保护' ? '#fa8c16'
            : ((row.status === '未找到' || row.status === '错误') ? '#cf1322' : '#52c41a');
        rows.forEach((row, idx) => {
            const tr = document.createElement('div');
            tr.style.cssText = 'display:flex;align-items:flex-start;padding:7px 16px;border-bottom:1px solid #f5f5f5;font-size:13px;';
            const fromCur = String(row.item.srcCid) === String(ctx.rootCid);
            const noise = (row.item.vi && row.item.vi.noise) || [];
            tr.innerHTML = `
                <div style="flex-shrink:0;width:36px;"><input type="checkbox" class="org-chk" data-idx="${idx}" ${row.checked ? 'checked' : ''} style="width:16px;height:16px;"></div>
                <div style="flex-shrink:0;width:130px;font-family:monospace;color:#1890ff;font-weight:600;word-break:break-all;">${esc(row.item.vi.fullCode)}</div>
                <div style="flex-shrink:0;width:180px;color:${fromCur ? '#52c41a' : '#8c8c8c'};word-break:break-all;">${fromCur ? '（当前目录）' : esc(row.item.srcPath)}</div>
                <div style="flex:1;min-width:0;word-break:break-all;color:#333;">${esc(row.item.fn)}
                    ${noise.length ? `<div title="去掉的干扰词：${esc(noise.join('、'))}" style="margin-top:2px;font-size:11px;color:#8c8c8c;word-break:break-all;">去词：${esc(noise.join(' · '))}</div>` : ''}
                </div>
                <div class="org-name" data-idx="${idx}" style="flex:1.2;min-width:0;word-break:break-all;color:#1890ff;">${esc(row.newName || '—')}</div>
                <div class="org-status" data-idx="${idx}" style="flex-shrink:0;width:96px;text-align:center;color:${statusColorOf(row)};font-weight:500;">${esc(row.status)}</div>`;
            body.appendChild(tr);
            rowRefs.push(tr);
        });
        updateSummary();

        // 换重命名方式 / 改联网开关后，只更新表格里变化的两列，不重建整个面板
        const refreshRows = () => {
            rows.forEach((row, idx) => {
                const nameEl = body.querySelector('.org-name[data-idx="' + idx + '"]');
                const stEl = body.querySelector('.org-status[data-idx="' + idx + '"]');
                const chk = body.querySelector('.org-chk[data-idx="' + idx + '"]');
                if (nameEl) nameEl.textContent = row.newName || '—';
                if (stEl) { stEl.textContent = row.status; stEl.style.color = statusColorOf(row); }
                if (chk) chk.checked = !!row.checked;
            });
            updateSummary();
        };

        // ---- 重命名方式：面板里直接切 / 直接改模板（只重算名字，零请求） ----
        const modeSel = document.getElementById('org-naming-mode');
        const customRow = document.getElementById('org-naming-custom-row');
        const tplInput = document.getElementById('org-naming-tpl');
        const varsBox = document.getElementById('org-naming-vars');
        let tplTimer = null;
        const syncNamingUi = () => {
            const mode = namingModeOf(namingCfg.mode);
            if (modeSel) modeSel.value = namingCfg.mode;
            if (customRow) customRow.style.display = mode.custom ? 'flex' : 'none';
            // 正在打字时别回填，否则光标会被拽到末尾
            if (tplInput && document.activeElement !== tplInput) {
                tplInput.value = namingCfg.template || DEFAULT_NAMING_TEMPLATE;
            }
        };
        const applyNaming = () => { recomputeAllRows(rows); refreshRows(); };
        if (modeSel) {
            modeSel.addEventListener('change', () => {
                namingCfg.mode = modeSel.value;
                saveNamingCfg();
                syncNamingUi();
                applyNaming();
                showPageNotification('重命名方式：' + namingModeOf(namingCfg.mode).label, 'info', 2400);
            });
        }
        if (tplInput) {
            tplInput.addEventListener('input', () => {
                namingCfg.template = tplInput.value || DEFAULT_NAMING_TEMPLATE;
                saveNamingCfg();
                if (tplTimer) clearTimeout(tplTimer);
                tplTimer = setTimeout(applyNaming, 220);      // 边打字边重算，防抖一下
            });
        }
        if (varsBox) {
            varsBox.addEventListener('click', (e) => {
                const v = e.target && e.target.getAttribute ? e.target.getAttribute('data-var') : null;
                if (!v) return;
                insertAtCursor(tplInput, v, () => {
                    namingCfg.template = tplInput.value || DEFAULT_NAMING_TEMPLATE;
                    saveNamingCfg();
                    applyNaming();
                });
            });
        }
        // 「自定义…」：拿面板里的真实条目当示例，保存后立刻回填并重算
        const editBtn = document.getElementById('org-naming-edit');
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                const r0 = rows.filter(r => r && r.item && r.item.vi)[0];
                showNamingModeDialog({
                    sample: r0 ? {
                        vi: r0.item.vi,
                        title: (r0.fields && r0.fields.title) || r0.item.vi.localTitle || '',
                        actresses: (r0.fields && r0.fields.actresses) || [],
                        date: (r0.fields && r0.fields.date) || r0.item.vi.date || '',
                        suffix: r0.item.safeSuffix || ''
                    } : null,
                    onSaved: () => { syncNamingUi(); applyNaming(); }
                });
            });
        }
        syncNamingUi();

        const fillBox = document.getElementById('org-fill-missing');
        if (fillBox) {
            fillBox.addEventListener('change', () => {
                if (!fillBox.checked) return;
                fillBox.disabled = true;
                fillMissingRows(rows, ctx.opts || {}, (n) => {
                    fillBox.disabled = false;
                    refreshRows();
                    showPageNotification(n ? `联网补全了 ${n} 条` : '本地信息已经够用，没有需要联网的条目', 'info', 3200);
                });
            });
        }

        body.addEventListener('change', (e) => {
            if (e.target.classList.contains('org-chk')) updateSummary();
        });
        document.getElementById('org-all').addEventListener('click', () => {
            document.querySelectorAll('.org-chk').forEach(c => c.checked = true);
            updateSummary();
        });
        document.getElementById('org-invert').addEventListener('click', () => {
            document.querySelectorAll('.org-chk').forEach(c => c.checked = !c.checked);
            updateSummary();
        });
        document.getElementById('org-close').addEventListener('click', () => { overlay.remove(); onCancel(); });
        document.getElementById('org-cancel').addEventListener('click', () => { overlay.remove(); onCancel(); });
        document.getElementById('org-confirm').addEventListener('click', () => {
            const selected = [];
            document.querySelectorAll('.org-chk:checked').forEach(c => selected.push(rows[Number(c.dataset.idx)]));
            const opts = {
                removeEmpty: document.getElementById('org-remove-empty').checked,
                removeNoVideo: document.getElementById('org-remove-novideo').checked
            };
            overlay.remove();
            onConfirm(selected, opts);
        });
    };

    /** 执行整理：移动 → 改名 → 清空子目录 */
    const executeOrganize = async (rows, rootCid, opts) => {
        const todo = rows.filter(r => r.newName);
        if (!todo.length) { showPageNotification('没有需要处理的文件', 'info', 3000); window.renameInProgress = false; return; }
        if (opts.removeNoVideo && !confirm('「同时删除只剩非视频文件的子目录」会连带删除子目录里剩下的非视频文件（如广告图、说明文本），且不可撤销。\n\n确定继续？')) {
            opts.removeNoVideo = false;
        }
        progressBox.init('整理中', todo.length);
        renameCompareList = [];
        resetRenameJournal();   // 整理也算一次改名批次
        let processed = 0, renamed = 0, moved = 0;

        const needMove = todo.filter(r => String(r.item.srcCid) !== String(rootCid));
        if (needMove.length) {
            showPageNotification(`正在把 ${needMove.length} 个文件移动到当前目录…`, 'info', 3000);
            moved = await moveFidsTo(needMove.map(r => r.item.fid), rootCid);
            await new Promise(r => setTimeout(r, 600));
        }

        const tasks = todo.map(row => done => {
            send_115(row.item.fid, row.newName, row.item.vi.fullCode, row.item.fn, () => {
                processed++; renamed++;
                progressBox.update(processed);
                done();
            });
        });
        runTasksWithLimit(tasks, 3, 200, async () => {
            let deleted = 0, keptDirs = 0;
            try {
                if (opts.removeEmpty || opts.removeNoVideo) {
                    const fresh = await scanTree(rootCid);
                    const empties = findEmptyDirs(fresh, !!opts.removeNoVideo);
                    if (empties.length) {
                        // 删除不可逆 —— 先把待删清单摆出来让用户过一眼，别默默删
                        const preview = empties.slice(0, 12).map(d => '· ' + (d.path || d.name)).join('\n') +
                            (empties.length > 12 ? `\n· …共 ${empties.length} 个` : '');
                        const go = confirm(
                            `准备删除 ${empties.length} 个子目录（均已重新列目录确认过里面没有文件）：\n\n${preview}\n\n确定删除？`
                        );
                        if (go) {
                            const byParent = new Map();
                            empties.forEach(d => {
                                if (!byParent.has(d.parentCid)) byParent.set(d.parentCid, []);
                                byParent.get(d.parentCid).push(d.cid);
                            });
                            for (const [pid, cids] of byParent) deleted += await deleteItems(pid, cids);
                        } else {
                            showPageNotification('已跳过删除子目录（改名/移动已完成）', 'info', 4000);
                        }
                    }
                    keptDirs = Math.max(0, fresh.dirs.length - deleted);
                }
            } catch (e) {
                showPageNotification('清理子目录时出错：' + e.message, 'error', 4000);
            }
            try {
                setCache('jb_infoCache', infoCache);
                setCache('jb_actressCache', actressCache);
                setCache('jb_ratingCache', ratingCache);
                setCache('jb_negativeCache', negativeCache);
            } catch (e) { /* ignore */ }
            progressBox.finish();
            saveRenameJournalNow();
            showPageNotification(`整理完成：改名 ${renamed} 个，移动 ${moved} 个，删除空目录 ${deleted} 个${keptDirs ? `，保留 ${keptDirs} 个非空子目录` : ''}`, 'success', 8000);
            window.renameInProgress = false;
        });
    };

    /** 撤销上次改名（回滚）
        - 只认「最近一批」，逐条把文件名改回去；不改位置（文件不会自己回到原子目录）
        - 回滚本身也能再撤销一次（成功后把反向映射写回日志，等于一个来回切换的开关）
        - 这是不可逆操作，先弹清单让用户过目再动手 */
    const undoLastRename = () => {
        if (window.renameInProgress) { showPageNotification('有任务正在进行中，稍后再试', 'info', 2000); return; }
        const list = loadRenameJournal();   // 以存储为准，避免内存与落盘不一致
        if (!list.length) { showPageNotification('没有可回滚的改名记录（只有「最近一批」会被记住）', 'info', 3500); return; }

        const preview = list.slice(-10).map(e => `· ${e.to}\n   → ${e.from}`).join('\n') +
            (list.length > 10 ? `\n· …共 ${list.length} 个` : '');
        if (!confirm(
            `将把最近一批改名的 ${list.length} 个文件改回原名：\n\n${preview}\n\n` +
            '注意：\n' +
            '· 只改文件名，不会把文件移回原来的子目录\n' +
            '· 若其中某个文件在这之后又被改名过，回滚会覆盖那次改动\n' +
            '· 本次回滚结束后，再点一次可「反悔」把名字改回来\n\n' +
            '确定回滚？'
        )) return;

        window.renameInProgress = true;
        renameCompareList = [];
        progressBox.init('回滚改名', list.length);
        let processed = 0, okCount = 0;
        const inverse = [];   // 成功的条目反向记录，供「再撤销一次」用
        const tasks = list.map(e => done => {
            // origFilename 传 e.to：回滚对比也能导出；noJournal 防止回滚把日志再覆盖一遍
            send_115(e.fid, e.from, e.fid, e.to, (ok) => {
                processed++;
                if (ok) { okCount++; inverse.push({ fid: e.fid, from: e.to, to: e.from, ts: Date.now() }); }
                progressBox.update(processed);
                done();
            }, { noJournal: true });
        });
        runTasksWithLimit(tasks, 3, 200, () => {
            renameJournal = inverse;
            journalDirty = true;
            saveRenameJournalNow();
            progressBox.finish();
            showPageNotification(
                okCount === list.length
                    ? `回滚完成：${okCount} 个文件已改回原名`
                    : `回滚结束：成功 ${okCount} / ${list.length} 个（失败的多半是被 115 风控拦了，稍后可重试）`,
                okCount ? 'success' : 'error', 5000
            );
            window.renameInProgress = false;
        });
    };

    /** 递归整理入口
        opts 可以是布尔（老写法：true=联网 / false=纯本地），也可以是对象：
          { network: 缺信息的条目是否联网补全（默认 true）, addDate, translateChinese }
        流程「本地优先」：先用文件名里的信息算出全部新名字，只有本地缺片名的
        那几条才走联网补全 —— 既快，也不会因为站点挂掉就整批失败。 */
    const organizeRecursive = async (opts) => {
        const opt = (typeof opts === 'object' && opts) ? opts : { network: !!opts };
        const cfg = Object.assign({ network: true, addDate: true, translateChinese: false }, opt);
        if (window.renameInProgress) { showPageNotification('已有任务正在进行中，请等待完成', 'info', 2000); return; }
        if (!getCurrentCid()) {
            showPageNotification('读不到当前目录（cid 解析失败），已中止 —— 这样整理才不会落到整个网盘根目录下', 'error', 6000);
            return;
        }
        window.renameInProgress = true;
        const rootCid = getCurrentCid();
        progressBox.init('扫描子目录', 60);
        let tree = null;
        try {
            tree = await scanTree(rootCid, (n) => progressBox.update(Math.min(n, 60)));
        } catch (e) {
            progressBox.finish();
            showPageNotification('扫描失败：' + e.message, 'error', 5000);
            window.renameInProgress = false;
            return;
        }
        progressBox.finish();

        const videos = tree.files.filter(f => VIDEO_EXT_RE.test(f.name));
        const skippedFiles = tree.files.length - videos.length;
        if (!videos.length) {
            showPageNotification('当前目录及子目录中没有视频文件', 'info', 4000);
            window.renameInProgress = false;
            return;
        }
        const parsedItems = [];
        let skipped = 0;
        videos.forEach(v => {
            const safeSuffix = getSafeSuffix(v.name);
            const vi = parseVideoInfo(v.name, safeSuffix);
            if (!vi) { skipped++; return; }
            parsedItems.push({
                fid: v.fid, fn: v.name, safeSuffix: safeSuffix, vi: vi,
                srcCid: v.cid, srcPath: v.path || ''
            });
        });
        if (!parsedItems.length) {
            showPageNotification(`发现 ${videos.length} 个视频，但没有解析出有效番号`, 'info', 5000);
            window.renameInProgress = false;
            return;
        }

        // 本地优先：先把全部新名字算出来，再决定谁需要联网
        const rows = buildOrganizeRows(parsedItems, cfg);
        const needRemote = rowsNeedingRemote(rows).length;
        const noiseHits = parsedItems.filter(i => i.vi.noise && i.vi.noise.length).length;
        const summary = `扫描完成：${tree.dirs.length} 个子目录 / ${videos.length} 个视频（跳过非视频 ${skippedFiles} 个）｜本地认出片名 ${rows.length - needRemote} 条｜去干扰词 ${noiseHits} 条`;
        const panel = () => showOrganizePreview(rows, {
            rootCid: rootCid,
            dirCount: tree.dirs.length,
            videoTotal: videos.length,
            skipped: skipped,
            opts: cfg
        }, (selected, opts2) => {
            executeOrganize(selected, rootCid, opts2);
        }, () => {
            showPageNotification('已取消整理', 'info', 2000);
            window.renameInProgress = false;
        });

        if (needRemote && cfg.network) {
            showPageNotification(summary + `｜正在联网补全 ${needRemote} 条缺片名的…`, 'info', 6000);
            fillMissingRows(rows, cfg, () => panel());
        } else {
            showPageNotification(summary + (needRemote ? `｜勾「缺信息的联网补全」可再补 ${needRemote} 条` : ''), 'info', 6000);
            panel();
        }
    };

    /** 右下角悬浮入口 */
    const injectAvFab = () => {
        if (document.getElementById('av-organize-fab') || !document.body) return;
        const btn = document.createElement('div');
        btn.id = 'av-organize-fab';
        btn.textContent = '整理';
        btn.title = '递归扫描当前目录及子目录 → 去掉文件名干扰词 → 视频汇总到当前目录 → 按所选重命名方式改名（本地优先，缺信息的才联网） → 清空空的子目录';
        btn.style.cssText = 'position:fixed;right:18px;bottom:88px;z-index:9998;background:linear-gradient(135deg,#1a6dff,#1890ff);color:#fff;padding:10px 14px;border-radius:22px;box-shadow:0 6px 18px rgba(26,109,255,.45);font-size:13px;font-weight:600;cursor:pointer;user-select:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
        btn.addEventListener('click', () => organizeRecursive({ network: true }));
        document.body.appendChild(btn);
    };
    (function waitBody() {
        if (document.body) { injectAvFab(); return; }
        let n = 0;
        const t = setInterval(() => {
            if (document.body) { clearInterval(t); injectAvFab(); }
            else if (++n > 100) clearInterval(t);
        }, 300);
    })();

    // ========================================================================
    // 24. 重命名方式 / 干扰词词典 的小面板
    // ========================================================================
    const closeDialog = (id) => {
        const el = document.getElementById(id);
        if (el) el.remove();
    };

    /** 通用小面板：居中白底、点遮罩或 × 关闭 */
    const buildDialog = (id, title, bodyHtml, wire) => {
        closeDialog(id);
        const overlay = document.createElement('div');
        overlay.id = id;
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.45);z-index:100000;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
        overlay.innerHTML = `
            <div style="width:min(640px,calc(100vw - 32px));max-height:86vh;overflow:auto;background:#fff;border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,0.35);">
                <div style="padding:14px 18px;background:linear-gradient(135deg,#1a6dff,#1890ff);color:#fff;display:flex;justify-content:space-between;align-items:center;">
                    <h3 style="margin:0;font-size:15px;font-weight:600;">${title}</h3>
                    <span data-dlg-close="1" style="cursor:pointer;font-size:22px;line-height:1;">×</span>
                </div>
                <div style="padding:16px 18px;font-size:13px;color:#333;">${bodyHtml}</div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => {
            const t = e.target;
            if (t === overlay || (t.getAttribute && t.getAttribute('data-dlg-close'))) overlay.remove();
        });
        if (wire) wire(overlay);
    };

    /* ==== MW115_CORE:BEGIN ==== */
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

    var escHtml = MW115Core.escHtml, fmtBytes = MW115Core.fmtBytes, fmtVideoSize = MW115Core.fmtVideoSize, pickcodeOf = MW115Core.pickcodeOf;

    /* ==== MW115_CORE:END ==== */

    /** 模板变量表（设置对话框与整理面板共用：按钮上的文字 / 提示） */
    const NAMING_VARS = [
        { key: '{code}', label: '番号' },
        { key: '{title}', label: '标题' },
        { key: '{actress}', label: '演员' },
        { key: '{date}', label: '发行日期' },
        { key: '{rating}', label: 'javdb 评分' },
        { key: '{markers}', label: '语义标记（【中文字幕】这类）' }
    ];

    /** 往输入框里插入一段文本（在光标处），插完把光标挪到文本之后 */
    const insertAtCursor = (el, text, after) => {
        if (!el) return;
        const s = (el.selectionStart == null) ? el.value.length : el.selectionStart;
        const e2 = (el.selectionEnd == null) ? s : el.selectionEnd;
        el.value = el.value.slice(0, s) + text + el.value.slice(e2);
        try { el.setSelectionRange(s + text.length, s + text.length); } catch (err) { /* ignore */ }
        el.focus();
        if (typeof after === 'function') after();
    };

    /** 重命名方式设置。菜单和整理预览面板都能打开。
        opts.sample 传真实条目就能拿到「贴近实际」的预览；opts.onSaved 用于保存后回调重算表格。 */
    const showNamingModeDialog = (opts) => {
        const o = opts || {};
        const sample = o.sample || {
            vi: { fullCode: 'ABF-208', baseCode: 'ABF-208', queryCode: 'ABF-208', markers: ['中文字幕'] },
            title: '禁欲の果てに…巨乳女教師',
            actresses: ['涼森れむ'],
            date: '2025-03-13',
            suffix: '.mp4'
        };
        const optHtml = NAMING_MODES.map(m =>
            `<option value="${m.key}"${m.key === namingCfg.mode ? ' selected' : ''}>${m.label}</option>`).join('');
        const varHtml = NAMING_VARS.map(v =>
            `<a data-var="${v.key}" title="${escHtml(v.label)}" style="display:inline-block;margin:0 5px 5px 0;padding:2px 9px;background:#eef4ff;border:1px solid #cfe0ff;border-radius:10px;font-family:monospace;font-size:12px;color:#1a6dff;cursor:pointer;">${v.key}</a>`).join('');
        const body = `
            <div style="margin-bottom:12px;line-height:1.8;">
                整理与改名时用哪种命名方式？改完立刻生效，也会记在本地（下次打开还是它）。<br>
                整理预览面板里也能直接切；在那边选「自定义模板」会就地出现模板输入框，不用来回开这个对话框。
            </div>
            <label style="display:block;margin-bottom:12px;">方式
                <select id="nm-mode" style="margin-left:8px;padding:5px 10px;border:1px solid #d9d9d9;border-radius:4px;min-width:300px;">${optHtml}</select>
            </label>
            <div id="nm-tpl-wrap">
                <label style="display:block;margin-bottom:6px;">自定义模板（仅选「自定义模板」时生效）</label>
                <input id="nm-tpl" value="${String(namingCfg.template || DEFAULT_NAMING_TEMPLATE).replace(/"/g, '&quot;')}" style="width:100%;padding:6px 10px;border:1px solid #d9d9d9;border-radius:4px;font-family:monospace;box-sizing:border-box;">
                <div style="margin-top:8px;line-height:1.9;">点一下插入到光标处：<span id="nm-vars">${varHtml}</span></div>
                <div style="margin-top:6px;color:#888;font-size:12px;line-height:1.8;">
                    空变量留下的多余分隔符会被自动收拾掉（<code>ABF-208  -</code> → <code>ABF-208</code>）。
                </div>
            </div>
            <div id="nm-preview" style="margin-top:12px;padding:10px 12px;background:#f6f8fb;border:1px dashed #cfd8e3;border-radius:8px;font-family:monospace;word-break:break-all;"></div>
            <div style="margin-top:14px;text-align:right;">
                <button id="nm-reset" style="padding:7px 16px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;margin-right:8px;">恢复默认模板</button>
                <button id="nm-save" style="padding:7px 18px;border:none;border-radius:6px;background:#1a6dff;color:#fff;cursor:pointer;font-size:13px;font-weight:600;">保存</button>
            </div>`;
        buildDialog('nm-dialog', '重命名方式', body, (overlay) => {
            const modeEl = overlay.querySelector('#nm-mode');
            const tplEl = overlay.querySelector('#nm-tpl');
            const wrap = overlay.querySelector('#nm-tpl-wrap');
            const prev = overlay.querySelector('#nm-preview');
            const syncTplRow = () => {
                const isCustom = !!(namingModeOf(modeEl.value).custom);
                wrap.style.opacity = isCustom ? '1' : '.5';
                tplEl.disabled = !isCustom;
            };
            const demo = () => {
                let name = '';
                try {
                    name = buildNewName(sample.vi, sample.title, sample.actresses, sample.date, sample.suffix,
                        { mode: modeEl.value, template: tplEl.value });
                } catch (e) { name = '（模板有误：' + e.message + '）'; }
                const code = (sample.vi && sample.vi.fullCode) || '';
                prev.textContent = (code ? code + ' · ' : '') + '示例：' + name;
            };
            modeEl.addEventListener('change', () => { syncTplRow(); demo(); });
            tplEl.addEventListener('input', demo);
            overlay.querySelector('#nm-vars').addEventListener('click', (e) => {
                const v = e.target && e.target.getAttribute ? e.target.getAttribute('data-var') : null;
                if (!v) return;
                insertAtCursor(tplEl, v, demo);
            });
            overlay.querySelector('#nm-reset').addEventListener('click', () => {
                tplEl.value = DEFAULT_NAMING_TEMPLATE;
                demo();
            });
            syncTplRow();
            demo();
            overlay.querySelector('#nm-save').addEventListener('click', () => {
                namingCfg.mode = modeEl.value;
                namingCfg.template = tplEl.value || DEFAULT_NAMING_TEMPLATE;
                saveNamingCfg();
                showPageNotification('已保存重命名方式：' + namingModeOf(namingCfg.mode).label, 'success', 3200);
                overlay.remove();
                if (typeof o.onSaved === 'function') o.onSaved();
            });
        });
    };

    /** 干扰词词典（菜单入口）：看 / 加 / 删 / 立即从当前目录学一遍 */
    const showNoiseDictDialog = () => {
        const listHtml = () => {
            const s = noiseDictSummary();
            if (!s.tokens.length) {
                return '<div style="color:#888;line-height:1.8;">还没有学到任何词（代码里另有 ' + s.seed +
                    ' 个种子词，不用管）。<br>整理一个带站点标签的目录后就会自动长出来。</div>';
            }
            return s.tokens.map(t => {
                const manual = noiseLearned[t] && noiseLearned[t].manual ? ' ·人工' : '';
                const hits = noiseLearned[t] && noiseLearned[t].hits ? ' ×' + noiseLearned[t].hits : '';
                return '<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 8px;background:#eef4ff;border:1px solid #cfe0ff;border-radius:12px;font-family:monospace;">' +
                    t + manual + hits +
                    '<span data-del="' + t + '" style="margin-left:6px;cursor:pointer;color:#cf1322;">×</span></span>';
            }).join('');
        };
        const body = `
            <div style="margin-bottom:10px;line-height:1.8;">
                整理/改名时会把这些词从文件名里去掉；语义标记（中字 / 无码 / 破解 / 4K…）不算干扰词，会保留成【标记】。<br>
                词典会自学习：<b>方括号里的标签</b>见到就学，其余词要出现 2 次以上才收，像番号的词一律不学。
            </div>
            <div id="nd-list" style="min-height:40px;margin-bottom:12px;line-height:2;">${listHtml()}</div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <input id="nd-new" placeholder="手动加一个词，例如 PSK.LA" style="flex:1;min-width:180px;padding:6px 10px;border:1px solid #d9d9d9;border-radius:4px;font-family:monospace;">
                <button id="nd-add" style="padding:6px 14px;border:none;border-radius:6px;background:#1a6dff;color:#fff;cursor:pointer;">加入词典</button>
                <button id="nd-learn" style="padding:6px 14px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;cursor:pointer;">从当前目录学习</button>
            </div>
            <div id="nd-msg" style="margin-top:8px;color:#888;line-height:1.7;"></div>`;
        buildDialog('nd-dialog', '干扰词词典', body, (overlay) => {
            const listEl = overlay.querySelector('#nd-list');
            const msg = overlay.querySelector('#nd-msg');
            const refresh = () => { listEl.innerHTML = listHtml(); };
            listEl.addEventListener('click', (e) => {
                const t = e.target && e.target.getAttribute ? e.target.getAttribute('data-del') : null;
                if (!t) return;
                const res = teachNoise(t, 'remove');
                msg.textContent = res.ok ? '已删除：' + t : (res.msg || '删除失败');
                refresh();
            });
            overlay.querySelector('#nd-add').addEventListener('click', () => {
                const el = overlay.querySelector('#nd-new');
                const res = teachNoise(el.value, 'add');
                msg.textContent = res.ok ? '已加入：' + res.added : (res.msg || '加入失败');
                if (res.ok) el.value = '';
                refresh();
            });
            overlay.querySelector('#nd-learn').addEventListener('click', () => {
                const cid = getCurrentCid();
                if (!cid) { msg.textContent = '读不到当前目录，无法学习'; return; }
                msg.textContent = '正在读取当前目录…';
                apiGet115('/files', {
                    aid: 1, cid: cid, limit: 1150, show_dir: 1,
                    format: 'json', o: 'file_name', asc: 1, natsort: 1, cur: 1
                }).then(json => {
                    const arr = (json && Array.isArray(json.data)) ? json.data : [];
                    const pairs = [];
                    arr.forEach(it => {
                        const name = String(it.n || '');
                        if (!VIDEO_EXT_RE.test(name)) return;
                        const vi = parseVideoInfo(name, getSafeSuffix(name));
                        if (vi && vi.queryCode) pairs.push({ name: name, code: vi.queryCode });
                    });
                    const res = learnNoise(pairs, 2);
                    msg.textContent = `扫了 ${res.scanned} 个视频，新学 ${res.added.length} 个词：` +
                        (res.added.join('、') || '（没有新的）');
                    refresh();
                }).catch(err => { msg.textContent = '读取失败：' + ((err && err.message) || err); });
            });
        });
    };

    // ========================================================================
    // 22. 菜单定义与绑定
    // ========================================================================
    const rename_list = `
        <li id="rename_list">
            <a id="local_code_process" class="mark" href="javascript:;">本地番号加工</a>
            <a id="rename_all_multi_date" class="mark" href="javascript:;">改名(多网站轮询)</a>
            <a id="rename_all_multi_zh" class="mark" href="javascript:;">改名(中文翻译)</a>
            <a id="archive_to_folder" class="mark" href="javascript:;">归档至文件夹</a>
            <a id="archive_to_bucket" class="mark" href="javascript:;">分桶归档(番号前缀数字段)</a>
            <a id="set_archive_root" class="mark" href="javascript:;">设为归档根目录</a>
            <a id="get_javdb_rating" class="mark" href="javascript:;">获取javdb评分</a>
            <a id="backup_file_names" class="mark" href="javascript:;">备份文件名</a>
            <a id="undo_last_rename" class="mark" href="javascript:;">撤销上次改名(回滚)</a>
            <a id="organize_recursive" class="mark" href="javascript:;">整理并重命名(含子目录)</a>
            <a id="organize_recursive_pure" class="mark" href="javascript:;">整理并重命名(含子目录·纯本地)</a>
            <a id="organize_naming_mode" class="mark" href="javascript:;">重命名方式设置</a>
            <a id="organize_noise_dict" class="mark" href="javascript:;">干扰词词典</a>
        </li>`;

    let interval = setInterval(buttonInterval, 1000);

    function buttonInterval() {
        const $menu = $("div#js_float_content");
        if ($menu.length === 0) return;
        const openDir = $menu.find("li[val='open_dir'], li[data-val='open_dir'], li[menu='open_dir']");
        if (openDir.length !== 0 && $("li#rename_list").length === 0) {
            openDir.before(rename_list);
            $("a#local_code_process").off("click").on("click", () => rename(local_rename, false));
            $("a#rename_all_multi_date").off("click").on("click", () => rename(rename_multi, true, false));
            $("a#rename_all_multi_zh").off("click").on("click", () => rename(rename_multi, true, true));
            $("a#archive_to_folder").off("click").on("click", archiveToActorFolder);
            $("a#archive_to_bucket").off("click").on("click", archiveToBucketFolder);
            $("a#set_archive_root").off("click").on("click", setArchiveRoot);
            $("a#get_javdb_rating").off("click").on("click", getJavdbRating);
            $("a#backup_file_names").off("click").on("click", backupFileNames);
            $("a#undo_last_rename").off("click").on("click", undoLastRename);
            $("a#organize_recursive").off("click").on("click", () => organizeRecursive({ network: true }));
            $("a#organize_recursive_pure").off("click").on("click", () => organizeRecursive({ network: false }));
            $("a#organize_naming_mode").off("click").on("click", () => showNamingModeDialog());
            $("a#organize_noise_dict").off("click").on("click", () => showNoiseDictDialog());
            clearInterval(interval);
        }
    }

    function setArchiveRoot() {
        const sf = $("iframe[rel='wangpan']").contents().find("li.selected");
        if (sf.length !== 1) { showPageNotification("请只选择一个文件夹", 'error', 3000); return; }
        const $it = $(sf[0]);
        if ($it.attr("file_type") !== "0") { showPageNotification("请选择文件夹类型", 'error', 3000); return; }
        const cid = $it.attr("cate_id"), name = $it.attr("title");
        if (cid) {
            GM_setValue("archiveRootCid", cid); GM_setValue("archiveRootName", name);
            archiveRootCid = cid; archiveRootName = name;
            cleanupExistingRootInfo(); showArchiveRootInfo();
            showPageNotification(`归档根目录设置成功: "${name}"`, 'success', 5000);
        }
    }

    // 调试出口：Console 里可直接调（window.__av），方便排查识别/去噪问题
    try {
        window.__av = {
            parseVideoInfo, parseVideoInfoCore, buildNewName, buildFromTemplate,
            stripNoiseWords, learnNoise, learnNoisePair, teachNoise, isSafeNoiseToken,
            noiseDictSummary, noiseTokens, NOISE_SEEDS, MARKER_MAP, markerOf,
            NAMING_MODES, DEFAULT_NAMING_TEMPLATE, namingModeOf, namingHasTitle, NAMING_VARS, insertAtCursor,
            manualNameProtected,
            undoLastRename, getRenameJournal: () => loadRenameJournal(),
            buildOrganizeRows, recomputeRow, recomputeAllRows, rowsNeedingRemote, fillMissingRows,
            organizeRecursive, showNamingModeDialog, showNoiseDictDialog, showOrganizePreview,
            getNamingCfg: () => namingCfg, setNamingCfg: (o) => { namingCfg = Object.assign(namingCfg, o); saveNamingCfg(); },
            getRatingCache: () => ratingCache
        };
    } catch (e) { /* ignore */ }

    console.log('115整理助手 v2.8.0 加载完成（115Rename2026 引擎 + 本地优先整理 + 干扰词自学习 + 自定义命名模板 + 改名回滚）');
})();