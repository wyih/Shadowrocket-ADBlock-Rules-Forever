# 2026-10-15 Shadowrocket 转换模块检查

设备为 iPhone Air，iOS 27.0.1，Shadowrocket 2.2.92。检查了手机 iCloud 中的 41 个模块；20 个含脚本，共 108 条脚本规则、36 个独立脚本地址。35 个地址可下载，1 个返回 404。纯规则模块也纳入文件检查；863 条 jq 规则经语法核对，仅发现下述爱奇艺空表达式。私人证书、账号参数和原始流量未保存到仓库。

## 修复

| 模块 | 原因与修改 | 验证范围 |
| --- | --- | --- |
| 哔哩哔哩 | 默认 JSCore 缺少上游依赖的 TextDecoder、TextEncoder；转换后的参数为 `key=value&…`，上游要求 JSON。四条脚本改用 WebView；三条带参规则改为 JSON，布尔值保持布尔类型；补全已在实际流量中出现的 app.bilibili.com gRPC 本地响应匹配。 | 手机新视频的播放器下广告卡片消失；日志确认 WebView、二进制数据和 JSON 参数正常。切换到仓库订阅、更新模块并重连 VPN 后，再次打开新视频，广告卡片仍未出现，播放正常。 |
| 高德地图 | 旧开屏脚本只调整第一条创意的时间，依赖具体响应结构。开屏专用接口改为返回空广告数组；AOCS 响应主动清空 SplashScreenControl、splashscreen、splashview_config，即使服务器本次未返回这些缓存项；保留其余地图数据和上游过滤。重名脚本改用唯一名称。 | jq 检查缓存清除与非广告字段保留通过；手机保存后以及模块更新、VPN 重连后，两次冷启动均直接进入地图，未出现开屏广告；日志确认 AOCS 请求命中响应处理。旧 splash 接口在本次启动中未出现。 |
| Apple 天气增强 | `new URL` 在默认 JSCore 报 ReferenceError；两条规则改用 WebView，兼容 URL 和二进制解码所需接口。 | 手机日志确认通过 WebView 执行、不再报 URL 错误；VPN 开启时天气页面正常显示。测试用代理路由已移除。 |
| 网易云音乐 | 压缩响应依赖 TextDecoder；仅指定 WebView 后仍有缺失错误。六条规则改用仓库兼容脚本，补 UTF-8 解码并规范化参数，修正上游问候栏数组赋值和旧首页路径。 | 作者实际脚本的 AES 加密、gzip 响应测试通过，覆盖推荐块过滤、正常音乐栏目与底栏保留；手机效果待用户更新验证。 |
| 腾讯视频 | 新增 i.video.qq.com 二进制推荐流卡片、顶部轮播广告过滤和对应 MITM；getvinfo 覆盖 svv 域名，独立处理三个广告参数。 | 15:06 手机日志已确认首页脚本执行，旧版漏掉轮播广告。本版合成 Protobuf 与固定上游对照通过，覆盖轮播广告删除、正常内容保留；手机白卡消失待更新验证。 |

| 爱奇艺 | 转换结果含一条空 jq 表达式，Shadowrocket 每次加载均记录 Invalid rule format。删除该无效行，保留紧邻的有效评论过滤规则及其他规则。 | 删除旧条目、重连 VPN 后，日志不再出现 Invalid rule format；未逐项验证客户端广告。 |

## 其他模块

微信外链解锁脚本为 TextDecoder、TextEncoder、atob、btoa 提供了回退，不因这些标识符出现而修改。iOS Location Spoofer 当前未启用；其 Base64 分支有运行环境要求，未改变用户设置。其余已下载脚本未发现相同的浏览器接口缺失问题。本次静态检查不代表所有客户端的所有广告位都经过实测。

手机当前启用 RedNote H2 测试模块，基础 HTTP/2 解密已开启；Bilibili 实际请求也使用 H2。本次哔哩哔哩问题的依据是运行接口缺失与参数解析错误。

## 检查

`node tests/test_module_repairs.cjs`：通过。覆盖高德缓存清理、空开屏列表、其他字段保留、腾讯请求改写，以及引擎和参数回归检查。六个模块的 `#!url` 均指向本仓库，更新时不会再经过原 Script Hub 转换地址。哔哩哔哩 protobuf 和网易云响应脚本通过本仓库兼容层加载作者 GitHub 的固定版本，其余上游脚本仍按模块中的地址加载；腾讯请求脚本由本仓库维护。

## 手机更新来源确认

六个修复版均已在手机启用。执行“更新模块”后，四个原位修改模块保留仓库来源与修复内容；哔哩哔哩、爱奇艺从仓库 raw URL 重新导入，删除原 Script Hub 条目及旧 iCloud 副本。六份当前文件各只有一份，除 Shadowrocket 自动补充的更新头外，内容与本仓库一致；没有本地调试脚本地址。VPN 重连后的日志未见上述解析或运行错误。

验证完成后已关闭诊断页“允许访问”和临时启用的日志记录；本地调试服务已停止。网易云、腾讯视频和爱奇艺的验证仍限于所列依赖、规则与运行环境，未逐项实测客户端广告位。

## 哔哩哔哩启动广告修复记录

用户反馈视频页广告已消失，开屏仍会出现。`PacketTunnel-20261015105706.log` 记录了 `splash/list`、`splash/show`、`splash/event/list2` 和 `splash/brand/list` 请求。旧版通过本地映射返回 `list:[{}]`，另有独立 jq 规则处理 show/event，未统一覆盖这四条路径。

2026-10-15 版本将四条开屏路径改为请求脚本 `scripts/bilibili-splash.js`，返回完整的成功 JSON 响应，显式清空 list、show、event_list 和 keep_ids，并设置 max_time 为 0。移除会先行截获该请求的旧本地映射和重复 jq 规则。脚本不依赖 URL、TextDecoder 或模块参数，模块仍使用 WebView；视频页规则保持原样。

该版本地检查覆盖四条路径有无查询参数、响应 JSON、空列表、Content-Length 和其他请求放行。此请求空响应已由下节的真实响应过滤取代；旧脚本地址保留原行为。

### 回前台全屏广告（2026-10-16，版本 20261016.2 待用户实测）

用户新截图明确为回前台时的全屏倒计时广告，且确认冷启动广告已经去掉。此前把此现象与播放器暂停接口混在一起，现按回前台全屏链路处理。

`PacketTunnel-20261016152203.log` 的第二份附件覆盖 15:22:03–15:37:42。15 次开屏脚本日志均为 `20261016.1`；69 次 `cm.bilibili.com` 策略判断全部 REJECT。12 次 `splash/list` 的 `open_event` 分为 hot 4 次、background 7 次、cold 1 次。每次均上报相同的 27 个缓存 ID、66 个已加载创意 ID。旧空响应没有让这些客户端上报列表发生变化，支持缓存留存解释；日志未记录本次屏幕使用的具体素材。

版本 `20261016.1` 增加的 cm 域名拦截保留。版本 `20261016.2` 取消四条 splash 接口的固定请求空响应，改为 `scripts/bilibili-splash-response.js` 处理真实成功响应。依据 [kokoryh/Sparkle 固定版本的 handleSplash](https://github.com/kokoryh/Sparkle/blob/290bcbdd2f158cdd8f7db9c996e90fe63490e16f/src/script/bilibili/json/handler.ts)：

- 删除 `account`、`event_list`、`preload`、`show`。
- 已存在的 `max_time` 设为 0，`min_interval`、`pull_interval` 设为 31536000。
- 对实际返回的每条 `list` 素材，已有的 `duration` 设为 0，`begin_time`、`end_time` 改为上游的未来时间值，`enable_pre_download` 设为 false。

保留 ID、keep_ids、其他根字段与未知素材字段；17 位数值 ID 在解析和输出中保留原始整数文字，避免 JS 双精度舍入。失败响应、缺失正文或无有效 data 时保留原响应。脚本不生成新素材，也不读取或删除 App 本地文件。

新脚本地址带 `?v=20261016.2`，日志只记录版本、公共路径、hot/cold/background 枚举及处理素材数量；不记录查询参数、素材 ID 或正文。原 `bilibili-splash.js` 保持旧请求契约，尚未更新模块的订阅仍可使用；新模块没有请求拦截或 Map Local 抢先返回 splash 数据。新响应脚本及所附许可证按 GPL-3.0 发布。

本地检查覆盖四接口、三种 open_event、素材有效期与展示字段修改、未知数据与大整数保留、异常响应放行和旧脚本兼容；含素材的响应处理结果与上述固定版 Sparkle handler 对照一致。手机上回前台广告消失及冷启动仍无广告，待用户更新后验证。

## 闲鱼启动广告与共用传输层（2026-10-16，待用户实测）

`PacketTunnel-20261016154038.log` 覆盖 15:40:38–15:45:37。实际使用 ASUS 场景的 `sr_direct_banad_tailscale.db`，解密名单已包含闲鱼域名。15:45:15、15:45:17、15:45:24 的 UDP TLS 嗅探识别出 `acs.m.goofish.com` 和 `g-acs.m.goofish.com`，随后连接仍以 IP:443 命中 FINAL,DIRECT 并建立 UDP 直连。该段没有进入可改写的闲鱼广告 HTTP 接口。这里有明确的传输绕过证据，不将其归为哔哩哔哩的缓存问题。

`AdBlock-Transport.sgmodule` 作为独立共用层设置 `block-quic = all`，让支持回退的连接走 TCP HTTPS，再由各 App 原有模块处理。参数含义对照 [LOWERTOP 的 Shadowrocket 配置](https://github.com/LOWERTOP/Shadowrocket/blob/main/lazy_group.conf)。该值影响所有 UDP/443，包括直连；不改变其他 UDP 端口、DNS 或证书。日志也记录豆包输入法的 QUIC 语音域名，故导入说明明确告知语音异常时关闭此独立模块，不自动改变用户设备配置。

`FleaMarket.sgmodule` 来自用户现有“闲鱼去广告”（可莉、2026-10-02 转换版），17 条 jq 规则逐字保留。原 7 条 `{}`/200 本地响应改用已有 `wechat-ad-response.js` 的 dict 模式，提供实际正文及准确 Content-Length，避开已知 H2 Map Local 正文丢失路径；复用原脚本地址，不改变现有微信调用。开屏 `idlecommerce.splash.ads` 同时覆盖 goofish 与旧 taobao 主机；旧 `idle.home.welcome` 沿用用户可莉通用模块的 404 行为。MITM 仅补对应 taobao 主机，更新来源指向本仓库。

检查：`node tests/test_startup_ads.cjs`、`node tests/test_module_repairs.cjs`；闲鱼全部 jq 表达式编译通过，首页样例删除广告保留正常商品。原 7 个接口与返回语义已逐项对照，新增匹配不包含商品详情、交易创建或相似前缀接口。手机需验证 QUIC 不再绕过、广告接口实际进入改写，以及首页、搜索和商品浏览正常；这些结果尚未实测。

## 哔哩哔哩参数兼容（待用户复测）

日志 11:53 的报错发生在上游请求脚本的 `JSON.parse($argument)`。增加 `scripts/bilibili-protobuf-compat.js`，在执行原上游 protobuf 请求和响应脚本前，统一读取 JSON、带额外引号的 JSON 及转换模块的 key=value 参数。`purifyComment` 的字符串 true/false 转为布尔值；关闭过滤时不会因非空字符串而被误判为开启。

模块三条 protobuf 规则改用该兼容层，参数改为不含逗号的 key=value 形式。原 kelee.one 脚本地址在本轮检查中返回 HTTP 错误，兼容层改为从作者 GitHub 的固定版本 `290bcbdd2f158cdd8f7db9c996e90fe63490e16f` 读取对应上游脚本，成功下载后按版本缓存；首次读取设 3 秒超时，下载失败则保留原请求或响应。原作者代码与过滤逻辑保持不变，不在仓库复制上游编译包。

本地 VM 检查覆盖实际模块参数替换、过滤开关 true/false、旧引号格式、URL 编码、请求/响应脚本选择、缓存和 404 放行。另以作者实际请求脚本验证规范化参数，并以实际响应脚本处理模拟 gRPC 评论响应，确认布尔值 false 正确传入且无参数解析错误。尚待用户更新模块后验证真实评论过滤和手机运行日志。

## 网易云推荐页后续修复（待用户复测）

截图 `截屏 2026-10-15 下午1.45.51.png` 显示推荐页的“云贝免费领现金红包”推广卡片及空白素材区域。`PacketTunnel-20261015134352.log` 中有 28 次 `Can't find variable: TextDecoder`，推荐页、底栏、batch 和位置资源接口随之解密失败。现有模块已写入 WebView 设置，仍需在脚本中兼容缺失接口的运行环境。

六条响应规则改用 `scripts/netease-response-compat.js`。它为上游所用的完整 UTF-8 字节解码提供回退，将转换后的 key=value 和字符串 true/false 规范化为 JSON 布尔参数。原格式会使上游按字符串的字符索引生成推荐栏目列表，正常推荐栏目也可能被过滤。兼容层另修正固定版本中旧首页路径缺少 `/`、两处把 `forEach` 返回值赋给问候栏数组的问题。

上游逻辑从作者 [Keywos/rule 的固定版本](https://github.com/Keywos/rule/blob/a06d921d370ad6fca9e972a3f76e64d90bc8cfae/script/wy/js/wyres.js) 加载；内容与原 kelee.one 脚本正文一致。成功后按版本缓存，首次下载设 3 秒超时，下载失败保留原响应。仓库不复制上游编译包。

`node tests/test_netease_response.cjs` 验证参数、UTF-8 中文及 emoji、字节视图偏移、原生解码器、缓存与下载失败。将该固定版本保存到本地，再执行 `node tests/test_netease_response.cjs /绝对路径/wyres.js`，可运行作者实际脚本的加密响应检查。本轮已通过 AES-128-ECB、gzip/非压缩和有/无原生 TextDecoder 的组合，验证模拟推广块移除、每日推荐与歌单保留、隐藏开关、两条问候栏路径、默认底栏与显式隐藏、位置广告清空、batch 非广告字段保留及旧首页广告横幅过滤。模拟推广块不代表已取得截图广告的真实响应正文；手机实际效果由用户更新后复测。

## 腾讯视频首页广告卡片（2026-10-15，待用户复测）

手机首页顶部轮播仍有白色广告卡片和摇动上淘宝的提示。模块重新解析后，15:06:59 日志实际输出 `TencentVideo feed: removed=0, adResponses=1`：首页脚本已运行，删除了一条广告扩展，但没有移除卡片。代码核对发现旧版只筛选推荐流广告，遗漏轮播列表内的广告项。

`TencentVideo.sgmodule` 版本 `20261015.3` 补齐 [Feng-Feng1/surge 固定 PageClean 版本](https://github.com/Feng-Feng1/surge/blob/f7463681d65bd57c6bbeeded95cb12b6ded800c0/TencentVideo-PageClean-V1.txt)（MIT）中的轮播广告过滤。除原有推荐流卡片及广告扩展外，识别轮播 `Block` 中的 `AdFeedInfo`、`AdFocusPoster` 和广告追踪标记，从列表删除整个广告项，保留普通轮播及模块元数据。支持旧追踪标记及新版三组追踪地址，协议长度同步重算。沿用上游空轮播保护：过滤后没有任何轮播项时保持原样，避免向客户端返回空列表。

首页脚本地址带本版版本参数，更新模块后使用新脚本缓存。运行日志增加 `focus` 删除数量和 `version=20261015.3`，便于核对实机是否运行新版及是否识别轮播广告；日志不输出响应正文。

MITM 增加首页、`svv.video.qq.com` 以及本次日志与上游配置共同出现的六个直连入口。响应脚本仍仅匹配 `i.video.qq.com/`；IP URL、其他业务和未知结构保持原样。未新增对 `tab.video.qq.com`、`svv.video.qq.com`、`playproxy.video.qq.com` 或视频 CDN 的整域拒绝。原请求脚本改为分别处理 `sppreviewtype`、`spsrt`、`spadseg`，支持参数换序、首项和多位数，保持其他表单内容原样。

验证：`node tests/test_tencent_video.cjs`、`node tests/test_module_repairs.cjs`、脚本语法及 `git diff --check`。新增合成轮播帧在旧代码下复现广告项残留，新版正确移除两种追踪格式的轮播广告，保留普通项、不完整广告标记及未知分组；单独轮播与混合推荐流均通过。固定上游对照结果一致，输入字节不变，输出帧长度正确。原有图片/视频广告、截断帧、非首页响应和错误状态检查仍通过；原始日志、响应及私人证书未加入仓库。

手机复测：在 Shadowrocket 更新腾讯视频模块至 `20261015.3`，重连 VPN，完全退出腾讯视频后重新打开并刷新首页，检查白色轮播广告卡片是否消失、普通轮播和视频是否正常。本版手机结果待用户测试。
