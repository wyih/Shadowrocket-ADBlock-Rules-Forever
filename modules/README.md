# 个人 Shadowrocket 模块

本目录在 `tailscale` 分支维护。仓库的自动同步只生成根目录的两份 `_tailscale.conf`，不会改写本目录。

| 内容 | 维护位置 |
| --- | --- |
| 小红书（RedNote）修复版 | [`RedNote.sgmodule`](RedNote.sgmodule) |
| 去广告传输兼容（QUIC 回退） | [`AdBlock-Transport.sgmodule`](AdBlock-Transport.sgmodule) |
| HTTPDNS 拦截器（已恢复合并前规则） | [`HTTPDNS.sgmodule`](HTTPDNS.sgmodule) |
| 闲鱼修复版 | [`FleaMarket.sgmodule`](FleaMarket.sgmodule) |
| 米家去广告 | [`MiHome.sgmodule`](MiHome.sgmodule) |
| 大众点评开屏去广告 | [`Dianping.sgmodule`](Dianping.sgmodule) |
| 百度网盘去广告修复版 | [`BaiduNetDisk.sgmodule`](BaiduNetDisk.sgmodule) |
| 哔哩哔哩修复版 | [`Bilibili.sgmodule`](Bilibili.sgmodule) |
| 高德地图修复版 | [`Amap.sgmodule`](Amap.sgmodule) |
| Apple 天气增强修复版 | [`AppleWeather.sgmodule`](AppleWeather.sgmodule) |
| 网易云音乐修复版 | [`NeteaseCloudMusic.sgmodule`](NeteaseCloudMusic.sgmodule) |
| 爱奇艺规则修复版 | [`Iqiyi.sgmodule`](Iqiyi.sgmodule) |
| 腾讯视频首页广告修复版 | [`TencentVideo.sgmodule`](TencentVideo.sgmodule) |
| 微信公众号文章广告修复版 | [`WeChatOfficialAccounts.sgmodule`](WeChatOfficialAccounts.sgmodule) |
| 微信小程序规则与依赖修复版 | [`WeChatMiniPrograms.sgmodule`](WeChatMiniPrograms.sgmodule) |
| DNS 旧模块（已并入白名单，无需启用） | [`DNS.sgmodule`](DNS.sgmodule) |
| MITM Keep Enabled 通用参数模板 | [`MITM-Keep-Enabled.sgmodule`](MITM-Keep-Enabled.sgmodule) |
| Script Hub Beta | 官方仓库，见下方依赖说明 |

## 大众点评与百度网盘

当前版本均为 `20261024.1`。在 Shadowrocket 导入[大众点评模块](https://raw.githubusercontent.com/wyih/Shadowrocket-ADBlock-Rules-Forever/tailscale/modules/Dianping.sgmodule)和[百度网盘模块](https://raw.githubusercontent.com/wyih/Shadowrocket-ADBlock-Rules-Forever/tailscale/modules/BaiduNetDisk.sgmodule)。百度网盘替换原 Script Hub 模块，保留原来的七条空响应和首页入口过滤；补充 `/buy/ad/conf?type=splashMode`、`/buy/ad/get` 的成功空结果。原模块来自用户提供的[可莉模块转换地址](http://script.hub/file/_start_/https://kelee.one/Tool/Loon/Lpx/BaiduNetDisk_remove_ads.lpx/_end_/BaiduNetDisk_remove_ads.sgmodule?type=loon-plugin&target=shadowrocket-module&del=true&jqEnabled=true)，本次经手机 HTTP 代理取回，源日期为 `2026-10-02 13:57:49`。

2026-10-24 18:53 的日志记录了网盘 `13.34.0` 的开屏配置请求、广告 SDK 竞价和 `iOS_key_splash_ad_show_iphone` 展示上报。旧 `/rest/2.0/pcs/adv` 已命中 Map Local，新增两个接口继续连接上游。本次 `/buy/ad/get` 的 `pathname=/8001/homeHeaderIOS` 对应首页横幅。匿名请求确认两个新接口均使用 `errno:0,data:{...}` 结构，新规则返回空 `data`。文件、上传、下载、会员和传输接口保留原处理。

[`Dianping.sgmodule`](Dianping.sgmodule) 拦截点评的 `loadsplashconfig`，素材脚本按 [zirawell 原脚本的固定版本](https://github.com/zirawell/R-Store/blob/cb61657d11df96473c8cf6188e695fe867357349/Res/Scripts/AntiAd/dianping.js) 识别 `/dpmobile/` 请求：广告跟踪头存在且无业务图片头时返回 404，GIF 或 `lossless=1` 素材返回透明图片；其余请求继续访问上游。脚本改在请求阶段执行，无须读取图片正文。许可证见 [`dianping-splash-request.LICENSE`](../scripts/dianping-splash-request.LICENSE)。18:50 和 18:52 的手机日志确认访问了点评及其素材域名，当时没有这些域名的解密路径；具体素材命中需启用后核对。

本地验证：`node tests/test_dianping_baidu.cjs`，检查开屏匹配、素材响应、原过滤保留及正常文件接口边界。手机效果待导入后验证。点评素材脚本由模块自动加载。回滚时停用点评模块；网盘停用仓库版并恢复原订阅，避免两份同时启用。

## 米家去广告

导入[米家模块](https://raw.githubusercontent.com/wyih/Shadowrocket-ADBlock-Rules-Forever/tailscale/modules/MiHome.sgmodule)，版本 `20261017.1`。使用手机已有的 HTTPS 解密证书，模块只追加 `home.mi.com`。

2026-10-17 17:28:56、17:28:57 的手机日志中，`/cgi-op/api/v1/recommendation/openingBanner` 两次完成 H2 解密后走 `FINAL,DIRECT` 并连接上游，没有广告响应处理；现有主配置的小米广告域名规则未覆盖这个业务接口。参考 [luoxx 的米家模块](https://github.com/luoxmc/loon/blob/main/surge/Plugins/MiJia.sgmoudle)，清空两个开屏接口、设备页顶部及轮播接口的 `data.list`，我的页面只清空 `data.banners`，保留其他响应字段。

本地 `node tests/test_mihome.cjs` 验证五个广告接口、路径边界、空列表及其他 JSON 字段保留。手机更新后的广告展示效果待实测。回滚只需停用或删除米家模块。

## 更新哔哩哔哩与闲鱼，配套共用模块

- **共用拦截**：沿[原 HTTPDNS 订阅地址](https://raw.githubusercontent.com/wyih/Shadowrocket-ADBlock-Rules-Forever/tailscale/modules/HTTPDNS.sgmodule)更新至 `20261018.2`，显示名称恢复“HTTPDNS拦截器”，规则恢复为合并前 `83e5a8c` 的版本。重新启用原“广告平台拦截器”和“可莉广告过滤器”，恢复原有 Map Local 处理。本模块继续置顶，保留解析拦截、闲鱼 AMDC 规则及两个阿里 HTTPS 解析 IP。
- **哔哩哔哩**：当前模块及开屏 helper 均为 `20261020.6`。撤掉虚构开屏素材、改回空清单后，用户首轮反馈未再闪退、未见开屏；15:07 日志确认 `.6` 的 show/list/event/brand 均执行，首页请求持续约 30 秒，未复现此前清单回调后约一秒整组断连。当前保留此版。DNS 设置已并入白名单主配置，直连版改用网络自动提供的系统 DNS；路由器未修改。此前失败及本轮验证范围见兼容性记录。
- **闲鱼**：先启用上述共用拦截器 `20261018.2`，再沿[现有仓库订阅地址](https://raw.githubusercontent.com/wyih/Shadowrocket-ADBlock-Rules-Forever/tailscale/modules/FleaMarket.sgmodule)更新至 `20261017.3`。已在手机验证的 AMDC 原生拒绝规则原样迁入共用模块，闲鱼模块移除重复条目，保留两个广告域名拦截、17 条 jq、10 条请求脚本及备用网关解密。不要同时启用两份闲鱼模块。
- **共用传输层**：另外导入并启用[去广告传输兼容](https://raw.githubusercontent.com/wyih/Shadowrocket-ADBlock-Rules-Forever/tailscale/modules/AdBlock-Transport.sgmodule)。只需一份，可供现有各 App 模块共用。它设置 `block-quic = all`，阻止 UDP/443 绕过 HTTPS 改写；不修改 DNS、证书或其他 UDP 端口。

传输模块会影响所有 UDP/443 连接，包括日志中豆包输入法使用的 QUIC 连接。支持回退的功能改走 TCP；只支持该传输的功能可能不可用。若语音等功能异常，关闭**去广告传输兼容**即可恢复，保留各 App 模块。

这一共用层解决的是传输绕过。广告响应结构仍由各 App 的专用模块处理；它不能直接清理 App 沙盒内已有的素材文件。两个修复版均已做本地检查，手机上的冷启动、切回前台和闲鱼正常浏览效果待用户更新后复测。

本地检查：`node tests/test_bilibili_splash_expire.cjs`、`node tests/test_startup_ads.cjs`、`node tests/test_module_repairs.cjs`、`node tests/test_bilibili_startup_trace.cjs`。新排期脚本检查五个精确接口、请求/响应两阶段、大整数编号、隐私和响应头。旧响应脚本最初参考 [kokoryh/Sparkle 的固定版本](https://github.com/kokoryh/Sparkle/blob/290bcbdd2f158cdd8f7db9c996e90fe63490e16f/src/script/bilibili/json/handler.ts)，按 GPL-3.0 发布，许可证见 [`bilibili-splash-response.LICENSE`](../scripts/bilibili-splash-response.LICENSE)。两个旧开屏脚本地址保留原行为，供尚未更新模块的订阅使用。

HTTPDNS 检查：`node tests/test_httpdns.cjs`。覆盖 IPv4/IPv6、端口、轮换解析地址、不同账户、AMDC 调度、原有嘀嗒例外及正常业务请求。详情见下方 HTTPDNS 说明。

评论与动态检查：`node tests/test_bilibili_comments.cjs` 下载原作者固定版本的请求和响应包，验证评论的两种处理路径，以及动态商品卡、商品链接、多层转发、压缩响应、正常内容和未知字段保留。也可把两个包的本地路径依次作为参数传入，避免重复下载。兼容层地址为 `v=20261017.4`；动态过滤命中输出 `Bilibili dynamic: version=20261017.4 removed-commerce=1`。当前开屏空清单脚本为 `20261020.6`，资源脚本仍为 `20261017.3`，素材请求脚本为 `20261017.5`。动态过滤已由手机两次各删除 3 条的日志确认。沿用原订阅入口更新模块，无须另装脚本；回滚素材处理可恢复提交 `654ddcf` 的 B 站模块和共享响应脚本。

## Apple 天气

`AppleWeather.sgmodule` 版本 `20261017.2` 固定使用 iRingo WeatherKit `v3.3.2` 的请求与响应脚本，保留 WebView 引擎及原有参数。修复彩云令牌留空时的默认值回退，并补齐空气质量标尺请求处理，将旧的 `EU.EAQI.2414` 等地址转换为 Apple 使用的无版本标识。`.2` 将标尺地址转换同时加入原生 URL 重写，覆盖旧天气缓存及使用上游 Rewrite 时没有请求脚本的情况。处理范围保持为空气质量、当前天气、每日预报、每小时预报和未来一小时降水，其余数据保持原样。

本地已用发布包检查空令牌回退、标尺 URL 改写、可用性列表保留及天气/AQ 二进制响应写回；彩云实时、逐小时、逐日和分钟降水四类接口均返回正常数据。2026-10-17 手机日志中，12:02:35 的宝山小组件请求已调用彩云并在约 2 秒内完成；12:09:44 的天气 App 请求已改走上游 Rewrite，同时仍请求旧标尺地址。`node tests/test_module_repairs.cjs` 检查原生标尺重写、脚本入口与现有模块兼容要求。`.2` 的手机卡片及手表效果需实际确认。回滚本次原生重写可恢复 `49f3923` 的模块；回滚整个升级可恢复 `fd7838f`。

Apple Watch 需安装当前生效配置所用的同一张解密证书；若两套配置各用一张 CA，手表也需分别安装两张。已信任 CA 页面可从“导出 CA 证书”选择公钥证书格式（当前截图按钮显示 `CTR`），将该证书包装为 `.mobileconfig`：根证书负载为 `com.apple.security.root`，顶层 `TargetDeviceType = 2` 明确指定 Apple Watch，再通过配对 iPhone 下载并完成安装。描述文件只需现有 CA 的公钥证书，勿用 PKCS12 私钥包，也无需生成新 CA。当前尚未取得用户导出的公钥证书，安装文件及手表实机验收待完成。`http://ce.rt` 实测 DNS 失败，且经手机 HTTP 代理复测返回 503，不能作为当前可用的证书下载入口。[上游证书要求](https://nsringo.github.io/guide/Weather/weather-kit)、[Apple 根证书负载](https://developer.apple.com/documentation/devicemanagement/certificateroot)、[Apple 目标设备类型](https://developer.apple.com/documentation/devicemanagement/toplevel)。

## 2026-10-15 转换兼容修复

上述六个修复版保留原作者署名与现有规则，只修复本次调试发现的问题。它们的 `#!url` 更新头指向本仓库的 raw URL，正常更新会拉取本仓库版本。下载地址为 `https://raw.githubusercontent.com/wyih/Shadowrocket-ADBlock-Rules-Forever/tailscale/modules/<文件名>`。

具体原因、检查范围和手机验证记录见 [`compatibility-audit.md`](compatibility-audit.md)。本地检查：`node tests/test_module_repairs.cjs` 和 `node tests/test_netease_response.cjs`，需要 Node.js 和 jq。网易云兼容脚本补充缺失的 UTF-8 解码、规范化界面参数，再执行作者 GitHub 固定版本的响应过滤；加密响应检查方法见检查记录。

腾讯视频另有 `node tests/test_tencent_video.cjs`，覆盖首页二进制广告卡片、顶部轮播广告过滤与正常内容保留。版本 `20261015.3` 补齐轮播广告项识别；此前手机日志已确认首页脚本执行，本版轮播过滤效果待更新复测。

## 微信模块修复

`WeChatOfficialAccounts.sgmodule` 和 `WeChatMiniPrograms.sgmodule` 以手机原有模块为基础，统一维护现有适配。公众号文章广告接口改为清空广告数量与列表，保留其他字段；小程序修复同一接口被拆开的删除规则，将原来依赖 12 个外部脚本的 JSON 过滤内置到模块。茶颜悦色的广告图片替换、M Stand 的广告跳转链接删除改为删除对应广告配置。

两模块原有 114 条本地映射由同一请求脚本返回完整响应，保持原有状态码与空结果，避开已发现的 Shadowrocket HTTP/2 本地映射正文丢失路径。另补丰巢广告位列表的空数组响应，以及其 DSP 接口的服务端无广告格式。模块保留原来的域名规则、解密域名和用户 HTTPS 设置。

在 Shadowrocket 导入或更新以下两个仓库地址；旧 Script Hub 地址仍会下载原模块，需要先替换来源。无须另装每个小程序的补丁或单独导入脚本：

- [微信公众号模块](https://raw.githubusercontent.com/wyih/Shadowrocket-ADBlock-Rules-Forever/tailscale/modules/WeChatOfficialAccounts.sgmodule)
- [微信小程序模块](https://raw.githubusercontent.com/wyih/Shadowrocket-ADBlock-Rules-Forever/tailscale/modules/WeChatMiniPrograms.sgmodule)

本地验证：`node tests/test_wechat_modules.cjs`。覆盖广告列表与组件配置删除、非广告字段保留、嵌套 JSON 异常保留、URL 匹配以及响应字节长度。手机效果待更新后验证；这些改写覆盖可读取的 HTTP 接口，尚未解决微信原生信息流卡片和微信自身小程序开屏的完整移除。

### 微信规则来源

- 原模块由可莉、RuCu6 维护；本次对照 [Loon 原文件存档](https://github.com/mihoyo-typ/KeleeOne/blob/ab6c3182fb2b09bcc34456f496282ec0b8e9217b/Plugin/WexinMiniPrograms_Remove_ads.lpx) 核对转换语义。当前本机访问其 12 个 kelee.one 脚本地址均返回 HTTP 403，不据此推断手机缓存状态。
- 内置过滤对应存档中的 [`Script` 目录](https://github.com/mihoyo-typ/KeleeOne/tree/ab6c3182fb2b09bcc34456f496282ec0b8e9217b/Script) 的 kff、ems、xiaotucc、FamilyMart、lawson、chayanyuese_remove_ads、coco、qingju、alittle-tea、M_Stand、T3、ming。另对照 [fmz200/wool_scripts 固定版本](https://github.com/fmz200/wool_scripts/tree/5d5f63fcf98bc69d5f8f1b1bae6f86a01ee4bb97/Scripts)；罗森使用原模块存档的字段过滤，不引入另一版本的预购/推荐接口处理。
- 公众号列表清空来自 [NobyDa/Wechat.js](https://github.com/NobyDa/Script/blob/0b8d083d444f4476700cb9d5d059c07b42da85eb/QuantumultX/File/Wechat.js)。丰巢空结果结构来自 [qDonl 的抓包与实测记录](https://github.com/qDonl/loon-plugin/blob/c8d3a63653fb2163e6b811eb2f262eb08d071ec4/fengchao/fengchao.plugin)；其中 `wxAdsFlag` 的回退开关含义为作者推测，未验证微信开屏受其控制。本仓库未加入换入口方案。

## 小红书

- [`RedNote.sgmodule`](RedNote.sgmodule)：2026-10-12 在手机上验证通过的模块，保留当时生效的全部规则和脚本地址。
- [`assets/rednote-watermark.png`](assets/rednote-watermark.png)：模块已内嵌的替代 PNG，138 × 72 像素、RGBA、每个像素 alpha 为 1/255，不含 logo 图形。保留文件便于后续修改；导入模块无需另行导入图片。

### 来源与依赖

原模块来自 [Script Hub](https://hub.kelee.one)，署名 RuCu6、fmz200。评论实况以及普通视频的两条规则使用 [fmz200/wool_scripts 的固定版本](https://github.com/fmz200/wool_scripts/blob/5d5f63fcf98bc69d5f8f1b1bae6f86a01ee4bb97/Scripts/xiaohongshu/xiaohongshu.js)。其余十条脚本规则仍引用原模块的 `https://kelee.one/Resource/JavaScript/RedPaper/RedPaper_remove_ads.js`；该地址的上游内容可能更新。

模块目前保持已验证文件的原内容，没有 `#!url` 更新头。仓库发布后，模块文件的下载地址为：

```text
https://raw.githubusercontent.com/wyih/Shadowrocket-ADBlock-Rules-Forever/tailscale/modules/RedNote.sgmodule
```

### 修复原因

静态 logo 使用 `/system_config/watermark/tiny3_100.jpg` 返回的素材。Shadowrocket build 3445 的 HTTP/2 本地映射路径会丢失替代图片的响应正文，导致普通静态图保存失败。模块在 `[MITM]` 中设置 `h2 = false`，改走 HTTP/1.1，并内嵌有效的替代 PNG。此设置作用于全部 HTTPS 解密连接。

评论实况和普通视频的规则使用上述固定版本的作者脚本，处理实况视频缓存及下载地址。模块只追加解密域名；证书和 HTTPS 解密开关由手机现有配置管理。

### 已验证结果

用户于 2026-10-12 确认：普通静态图、实况图的静态画面和播放画面均无水印，保存正常；更新模块、更新配置及开关 VPN 后，再次保存也正常。

后续修改以本文件为基线，改动后复测上述保存与更新流程。保留作者署名，并同步记录依赖版本和验证结果。

### 保留 HTTP/2 的修复

[`experimental/RedNote-H2.sgmodule`](experimental/RedNote-H2.sgmodule) 保留 `h2 = true`，将静态水印素材从 `[Map Local]` 改为一个精确匹配的请求脚本。[`scripts/rednote-watermark-response.js`](../scripts/rednote-watermark-response.js) 通过 `engine=webview` 返回 PNG 的 Base64 字符串，并设置响应的 `body-base64 = true`，让 Shadowrocket 解码为二进制响应。它内嵌同一张已验证的 PNG，无需请求其他图片服务器。

同 build 3445 的本机引擎静态核对显示：WebView 响应桥的 `setWebResponse:` 识别 `body-base64`；脚本提前响应的 `earlyResponseForRequest:scriptResult:` 复制 `bodyData`；HTTP/2 的脚本回调调用 `sendResponseToClient:`，发送图片 DATA 帧。它绕开了出错的 Map Local 状态码响应路径。

2026-10-12 00:49 用户确认此 H2 版本的静态图与实况保存均可去水印，00:46 日志确认静态素材请求协商为 H2。手机目前使用此版本；保留原路径和名称，避免重复安装。静态图片素材的 WebView 请求脚本与评论实况的默认 JSCore 响应脚本各自处理不同请求。

2026-10-18 09:36 评论实况样本中，脚本成功匹配缓存，App 保存时实际请求了替换后的 URL；该 URL 也在保存前被请求过。直接下载的视频文件自身含有水印，不能将脚本的“匹配到无水印链接”日志作为画面无水印的验证。本次尚未取得该评论的完整候选流列表，未改变已正常的静态图规则或实况选流逻辑。

H2 模块 `20261018.1` 为候选链接记录版：仅将评论规则接入 [`rednote-comment-diagnostics.js`](../scripts/rednote-comment-diagnostics.js)，加载并缓存同一固定版本的 fmz200 脚本，在读取 `picture.video_info` 时记录视频 ID、字段名、各编码流及原始媒体相关字段。记录留在手机日志中，不发送给分析服务；不记录评论正文、用户对象或请求头。原脚本的缓存、选流和下载地址替换保持原样，脚本规则数量仍为 13。这是用于查清水印来源的诊断更新，尚未改变选流策略；手机更新后需重新进入对应评论并保存一次，已有缓存不会补出候选链接。

本地检查：`node tests/test_rednote_watermark.cjs` 与 `node tests/test_rednote_comments.cjs [固定上游脚本本地路径]`。前者检查 PNG、Base64、URL 匹配及 H2/WebView；后者与实际固定上游逐项对比评论响应、缓存和下载替换结果，验证主评论、子评论的两种编码候选均被记录，静态图行为不变，缓存命中不重复下载脚本。回退诊断版可恢复提交 `1fb1140` 的 H2 模块。

## MITM Keep Enabled

导入 [MITM Keep Enabled 通用参数模板](https://raw.githubusercontent.com/wyih/Shadowrocket-ADBlock-Rules-Forever/tailscale/modules/MITM-Keep-Enabled.sgmodule)，版本 `20261016.3`。先保持模块停用，在 Shadowrocket 的“配置 → 模块 → MITM Keep Enabled → 编辑参数”填写：

- **证书内容**：对应配置的“HTTPS 解密 → 证书 ⓘ → 复制”得到的 Base64 编码 PKCS12。
- **证书密码**：这份 PKCS12 的实际密码。
- **启用**：前两项填写完整后设为 `true`，保存后再启用模块。默认值为 `false`；未配置好的模板应保持停用，避免覆盖正在使用的解密设置。

模板中的设置为：

```ini
[MITM]
enable = {{{启用}}}
ca-passphrase = {{{证书密码}}}
ca-p12 = {{{证书内容}}}
```

公共文件只包含参数占位符，没有任何人的真实证书、私钥或密码。Shadowrocket 将填写的参数保存在模块同名的 `.meta` 文件中；参数不因模块更新而丢失，开启 iCloud 时也会同步。公开分享模板即可，含真实参数的 `.meta` 文件留在自己的设备或 iCloud 中。参数用法见 [Shadowrocket 的编辑参数说明](https://github.com/LOWERTOP/Shadowrocket/wiki#编辑参数)。

两张证书可以同时在系统中保持信任，无须切换系统的信任开关。一份模块只有一套证书参数；它会覆盖当前运行配置的 CA。把两份带不同 CA 的模块同时启用，不会形成“每个配置各取自己的证书”的映射。本模板没有实现按配置自动选择 CA。

版本 `20261016.3` 恢复显式提供 CA 与密码的方式，将真实值改为用户参数。此前只保留 `enable = true` 的版本在 2026-10-11 实机更新配置后出现过 `mitm no ca-p12`，已撤回将其作为完整修复的建议。本次参数化模板已做本地展开检查，尚未进行设备上的更新配置、更新模块和 VPN 重连验证。

[旧 `.example` 地址](MITM-Keep-Enabled.sgmodule.example) 保留为同内容的参数模板。旧私人模块没有更新地址，发布新模板不会自动替换设备上没有更新源的旧版。

## DNS

原 [`DNS.sgmodule`](DNS.sgmodule) 的全部 `[General]` 设置已并入外出场景使用的 [`sr_top500_whitelist_ad_tailscale.conf`](../sr_top500_whitelist_ad_tailscale.conf)：三个主 DoH 与备用 `https://1.0.0.1/dns-query#proxy` 继续经代理，节点域名单独通过 `https://223.5.5.5/dns-query` 加密解析。`dns-direct-system=false`、DNS 劫持和其他原模块设置一并保留。生成脚本会在每次同步上游时保留这些个人设置。

家中、办公室 Wi-Fi 使用的 [`sr_direct_banad_tailscale.conf`](../sr_direct_banad_tailscale.conf) 保持原有 AliDNS/DNSPod 加密直连解析，未合入代理 DNS 设置。手机先更新白名单主配置，再停用原独立 DNS 模块并重连 VPN；之后随场景自动使用对应 DNS。旧模块文件仅作历史副本，无需导入或保持开启。

此前独立模块覆盖直连场景，强制 DNS 查询经手机节点，Wi-Fi 下又被家中透明代理再次转发。用户明确要求保留两份场景配置、禁止修改路由器；本次在主配置内解决覆盖问题。直连 DNS 通路已通过同手机 HTTPS 证书及有效应答验证，用户停用模块后确认 B 站信息流恢复；仍有闪退，另查启动改写。回滚本轮合并可恢复白名单配置和生成脚本至 `2f9b736`。

## HTTPDNS 拦截器：通用合并回退

[`HTTPDNS.sgmodule`](HTTPDNS.sgmodule) `20261018.2` 恢复合并前 `83e5a8c` 的全部规则，仅日期和版本标记更新。撤下合并增加的 86 条广告请求脚本（其中 84 条来自 Map Local）、广告平台规则、两条正文改写及追加解密主机；保留原 13 条 HTTPDNS 请求脚本。共享响应脚本保持兼容旧订阅，其他 App 模块不变。

更新现有“通用广告拦截器”后，名称恢复为“HTTPDNS拦截器”。保持置顶，重新启用原“广告平台拦截器”和“可莉广告过滤器”，使用其中原有的 Map Local。原始入口分别为 [BlockAdvertisers.lpx](https://kelee.one/Tool/Loon/Lpx/BlockAdvertisers.lpx) 和 [Remove_ads_by_keli.lpx](https://kelee.one/Tool/Loon/Lpx/Remove_ads_by_keli.lpx)。B 站另按上方 `20261018.3` 更新开屏 JSON 引擎，其余模块和顺序保持现状。

2.4 手机 08:24–08:25 日志确认 B 站 `.2` 已执行并清空开屏列表，本窗口没有内存 critical 或开屏脚本取消。新增的 86 条广告脚本未匹配日志中已解密请求；用户仍报告开屏广告，因此本次回退用于检验通用模块合并的影响。合并历史及核查结果见 [兼容性记录](compatibility-audit.md)。需要恢复合并版时，可取 `15a2fd7` 的 `modules/HTTPDNS.sgmodule`。

本地检查：`node tests/test_httpdns.cjs`、`node tests/test_startup_ads.cjs`、`node tests/test_module_repairs.cjs`。恢复后的模块除日期和版本外应逐字节等同旧版；手机实际效果由更新后复测确认。

### HTTPDNS 基础能力与历史

[`HTTPDNS.sgmodule`](HTTPDNS.sgmodule) 版本 `20261017.3` 以用户提供的「HTTPDNS拦截器」为基线。作者为 `wyih`，更新地址、项目主页和请求脚本地址均指向本仓库。原模块末尾的截断文字 `DOM` 未采入；其余 85 条域名、IP、客户端及嘀嗒直连规则均保留，去掉转换文件在规则值外附加的引号。10 条 URL 拒绝规则合并为 6 类请求脚本，再补齐 7 类解析入口。

通用 IPv4/IPv6 解析、带数字账户或版本的 `resolve`、`sign_d`、`ss4` 等接口，以及 AMDC 调度均按路径返回空 404。它覆盖日志中的五个 `203.119.*` B 站解析地址，地址轮换后仍按接口匹配；嘀嗒出行对两台指定解析服务器的例外在脚本中保留。`.2` 将闲鱼已验证的应用专属 AMDC 原生拒绝规则原样迁入本模块，通用脚本继续覆盖其他地址和客户端；闲鱼模块不再维护这条解析规则。脚本代码及地址未变，日志标记仍为 `HTTPDNS: version=20261017.1 action=block`，不输出解析参数和用户标识。

对照 [VirgilClyne 的固定版本](https://github.com/VirgilClyne/GetSomeFries/blob/b4aa767bcbc4d39bea5b549a3277a00517891d1e/sgmodule/HTTPDNS.Block.sgmodule) 与 [blackmatrix7 的模块](https://github.com/blackmatrix7/ios_rule_script/blob/master/rewrite/Shadowrocket/BlockHTTPDNS/BlockHTTPDNS.sgmodule)，补充专用解析地址及京东、微博、爱奇艺等域名，共 40 条原生规则；补充美团、知乎、微博配置、字节配置、微信 CDN 解析及支付宝 IPv4/IPv6 解析六类入口，另将原 AMDC 的固定地址合并为接口匹配。上游出现的 `182.256.116.116` 是无效 IPv4，未复制；IPv6 URL 使用方括号。基线来自用户提供的可莉、VirgilClyne 模块，原入口为 `kelee.one/Tool/Loon/Lpx/Block_HTTPDNS.lpx`。

共用模块的脚本处理明文 HTTP 解析接口，专用解析域名与 IP 的原生拒绝也覆盖加密连接；共享业务域名上的 HTTPS 路径仍取决于是否已解密。本模块不增加解密域名。`DNS.sgmodule` 继续配置系统 DoH，Google、Cloudflare 的现有 DoH 地址保持原样。

`.3` 为 `203.119.238.194`、`203.119.238.240` 增加精确 `/32` 原生拒绝。更新前，经 2.4 手机代理访问这两个 IP 的 HTTPS `/191607/resolve`，均通过证书校验并返回 HTTP 200、B 站真实地址；相同 HTTP 接口已返回本地 404。两台服务器的有效阿里证书均包含其 IP 和 HTTPDNS 服务域名，故在解析服务连接入口阻断，覆盖未解密的 HTTPS。这两条规则属于共用解析拦截，不封 B 站 API 或视频 CDN 的 IP。B 站模块仍为 `.7`，响应脚本版本不变；手机需沿原地址更新共用模块至 `.3`。回滚此次增补只恢复提交 `0f86599` 的 `modules/HTTPDNS.sgmodule`。

`.1` 已由手机原生 22 次提前响应及经手机代理复测的 HTTP 404、零正文确认生效。`.2` 只迁移闲鱼 AMDC 原生规则，本地检查覆盖原七种调度 URL、路径边界及通用脚本，迁移后的手机加载由用户更新确认。回滚本次迁移可只恢复提交 `c4dfd31` 的 `HTTPDNS.sgmodule` 与 `FleaMarket.sgmodule`。

## Script Hub Beta：官方依赖

直接使用 [Script-Hub-Org/Script-Hub 官方 Beta 模块](https://raw.githubusercontent.com/Script-Hub-Org/Script-Hub/main/modules/script-hub.beta.rocket.module)。本仓库只记录依赖；转换器及官方模块由上游维护。

[官方说明](https://github.com/Script-Hub-Org/Script-Hub#loon-script-v2-跨端转换beta)列出 Beta 对 Loon 3.5.1+ Script v2 和 Rewrite Action 的支持。这些新语法需要相应转换能力，否则脚本或重写可能无法完整转换。今天修复模块更新失效时，需要保留的是官方 Beta 模块的订阅地址，而不只是把稳定版模块中的脚本路径手动改成 Beta。

根据官方 Beta 模块的四条请求规则，影响范围是：

- `script.hub` 前端页面使用 Beta 前端。
- `script.hub/file/_start_/...` 的模块、重写转换使用 Beta 重写解析器。
- 同一路径下的 `type=rule-set` 使用 Beta 规则集解析器。
- `script.hub/convert/` 使用 Beta 脚本转换器。

因此，其他经 Script Hub 转换的订阅，在重新导入或更新时也会使用对应 Beta 解析器。解析器改变会反映到生成结果；具体功能取决于源模块语法。DNS、MITM Keep Enabled 通用模块和这里直接维护的 RedNote 模块均不经过 Script Hub 转换，现有两份配置的 GitHub 自动同步也不调用 Script Hub。

官方模块与上述个人模块的作用不同：转换器负责生成模块；MITM Keep Enabled 按参数设置解密开关及 CA；DNS 覆盖通用参数；RedNote 执行小红书重写和脚本规则。
