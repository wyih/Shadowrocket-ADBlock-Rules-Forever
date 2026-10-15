# 2026-10-15 Shadowrocket 转换模块检查

设备为 iPhone Air，iOS 27.0.1，Shadowrocket 2.2.92。检查了手机 iCloud 中的 41 个模块；20 个含脚本，共 108 条脚本规则、36 个独立脚本地址。35 个地址可下载，1 个返回 404。纯规则模块也纳入文件检查；863 条 jq 规则经语法核对，仅发现下述爱奇艺空表达式。私人证书、账号参数和原始流量未保存到仓库。

## 修复

| 模块 | 原因与修改 | 验证范围 |
| --- | --- | --- |
| 哔哩哔哩 | 默认 JSCore 缺少上游依赖的 TextDecoder、TextEncoder；转换后的参数为 `key=value&…`，上游要求 JSON。四条脚本改用 WebView；三条带参规则改为 JSON，布尔值保持布尔类型；补全已在实际流量中出现的 app.bilibili.com gRPC 本地响应匹配。 | 手机新视频的播放器下广告卡片消失；日志确认 WebView、二进制数据和 JSON 参数正常。切换到仓库订阅、更新模块并重连 VPN 后，再次打开新视频，广告卡片仍未出现，播放正常。 |
| 高德地图 | 旧开屏脚本只调整第一条创意的时间，依赖具体响应结构。开屏专用接口改为返回空广告数组；AOCS 响应主动清空 SplashScreenControl、splashscreen、splashview_config，即使服务器本次未返回这些缓存项；保留其余地图数据和上游过滤。重名脚本改用唯一名称。 | jq 检查缓存清除与非广告字段保留通过；手机保存后以及模块更新、VPN 重连后，两次冷启动均直接进入地图，未出现开屏广告；日志确认 AOCS 请求命中响应处理。旧 splash 接口在本次启动中未出现。 |
| Apple 天气增强 | `new URL` 在默认 JSCore 报 ReferenceError；两条规则改用 WebView，兼容 URL 和二进制解码所需接口。 | 手机日志确认通过 WebView 执行、不再报 URL 错误；VPN 开启时天气页面正常显示。测试用代理路由已移除。 |
| 网易云音乐 | 压缩响应依赖 TextDecoder；仅指定 WebView 后仍有缺失错误。六条规则改用仓库兼容脚本，补 UTF-8 解码并规范化参数，修正上游问候栏数组赋值和旧首页路径。 | 作者实际脚本的 AES 加密、gzip 响应测试通过，覆盖推荐块过滤、正常音乐栏目与底栏保留；手机效果待用户更新验证。 |
| 腾讯视频 | 通用 replace-body.js 地址返回 404。使用本仓库的 tencent-video-request.js 保留原 getvinfo 表单替换。 | 检查了参数替换、中间及尾部字段保留、无匹配和无正文；尚未验证客户端广告。原上游已声明较新客户端可能失效。 |

| 爱奇艺 | 转换结果含一条空 jq 表达式，Shadowrocket 每次加载均记录 Invalid rule format。删除该无效行，保留紧邻的有效评论过滤规则及其他规则。 | 删除旧条目、重连 VPN 后，日志不再出现 Invalid rule format；未逐项验证客户端广告。 |

## 其他模块

微信外链解锁脚本为 TextDecoder、TextEncoder、atob、btoa 提供了回退，不因这些标识符出现而修改。iOS Location Spoofer 当前未启用；其 Base64 分支有运行环境要求，未改变用户设置。其余已下载脚本未发现相同的浏览器接口缺失问题。本次静态检查不代表所有客户端的所有广告位都经过实测。

手机当前启用 RedNote H2 测试模块，基础 HTTP/2 解密已开启；Bilibili 实际请求也使用 H2。本次哔哩哔哩问题的依据是运行接口缺失与参数解析错误。

## 检查

`node tests/test_module_repairs.cjs`：通过。覆盖高德缓存清理、空开屏列表、其他字段保留、腾讯请求改写，以及引擎和参数回归检查。六个模块的 `#!url` 均指向本仓库，更新时不会再经过原 Script Hub 转换地址。哔哩哔哩 protobuf 和网易云响应脚本通过本仓库兼容层加载作者 GitHub 的固定版本，其余上游脚本仍按模块中的地址加载；腾讯请求脚本由本仓库维护。

## 手机更新来源确认

六个修复版均已在手机启用。执行“更新模块”后，四个原位修改模块保留仓库来源与修复内容；哔哩哔哩、爱奇艺从仓库 raw URL 重新导入，删除原 Script Hub 条目及旧 iCloud 副本。六份当前文件各只有一份，除 Shadowrocket 自动补充的更新头外，内容与本仓库一致；没有本地调试脚本地址。VPN 重连后的日志未见上述解析或运行错误。

验证完成后已关闭诊断页“允许访问”和临时启用的日志记录；本地调试服务已停止。网易云、腾讯视频和爱奇艺的验证仍限于所列依赖、规则与运行环境，未逐项实测客户端广告位。

## 哔哩哔哩开屏后续修复（待用户复测）

用户反馈视频页广告已消失，开屏仍会出现。`PacketTunnel-20261015105706.log` 记录了 `splash/list`、`splash/show`、`splash/event/list2` 和 `splash/brand/list` 请求。旧版通过本地映射返回 `list:[{}]`，另有独立 jq 规则处理 show/event，未统一覆盖这四条路径。

本轮将四条开屏路径改为请求脚本 `scripts/bilibili-splash.js`，返回完整的成功 JSON 响应，显式清空 list、show、event_list 和 keep_ids，并设置 max_time 为 0。移除会先行截获该请求的旧本地映射和重复 jq 规则。脚本不依赖 URL、TextDecoder 或模块参数，模块仍使用 WebView；视频页规则保持原样。

本地检查覆盖四条路径有无查询参数、响应 JSON、空列表、Content-Length 和其他请求放行。尚待用户更新仓库模块后验证开屏。本节仅说明开屏修改；参数解析修复见下一节。微信模块目前仅保存现有规则基线。

## 哔哩哔哩参数兼容（待用户复测）

日志 11:53 的报错发生在上游请求脚本的 `JSON.parse($argument)`。增加 `scripts/bilibili-protobuf-compat.js`，在执行原上游 protobuf 请求和响应脚本前，统一读取 JSON、带额外引号的 JSON 及转换模块的 key=value 参数。`purifyComment` 的字符串 true/false 转为布尔值；关闭过滤时不会因非空字符串而被误判为开启。

模块三条 protobuf 规则改用该兼容层，参数改为不含逗号的 key=value 形式。原 kelee.one 脚本地址在本轮检查中返回 HTTP 错误，兼容层改为从作者 GitHub 的固定版本 `290bcbdd2f158cdd8f7db9c996e90fe63490e16f` 读取对应上游脚本，成功下载后按版本缓存；首次读取设 3 秒超时，下载失败则保留原请求或响应。原作者代码与过滤逻辑保持不变，不在仓库复制上游编译包。

本地 VM 检查覆盖实际模块参数替换、过滤开关 true/false、旧引号格式、URL 编码、请求/响应脚本选择、缓存和 404 放行。另以作者实际请求脚本验证规范化参数，并以实际响应脚本处理模拟 gRPC 评论响应，确认布尔值 false 正确传入且无参数解析错误。尚待用户更新模块后验证真实评论过滤和手机运行日志。

## 网易云推荐页后续修复（待用户复测）

截图 `截屏 2026-10-15 下午1.45.51.png` 显示推荐页的“云贝免费领现金红包”推广卡片及空白素材区域。`PacketTunnel-20261015134352.log` 中有 28 次 `Can't find variable: TextDecoder`，推荐页、底栏、batch 和位置资源接口随之解密失败。现有模块已写入 WebView 设置，仍需在脚本中兼容缺失接口的运行环境。

六条响应规则改用 `scripts/netease-response-compat.js`。它为上游所用的完整 UTF-8 字节解码提供回退，将转换后的 key=value 和字符串 true/false 规范化为 JSON 布尔参数。原格式会使上游按字符串的字符索引生成推荐栏目列表，正常推荐栏目也可能被过滤。兼容层另修正固定版本中旧首页路径缺少 `/`、两处把 `forEach` 返回值赋给问候栏数组的问题。

上游逻辑从作者 [Keywos/rule 的固定版本](https://github.com/Keywos/rule/blob/a06d921d370ad6fca9e972a3f76e64d90bc8cfae/script/wy/js/wyres.js) 加载；内容与原 kelee.one 脚本正文一致。成功后按版本缓存，首次下载设 3 秒超时，下载失败保留原响应。仓库不复制上游编译包。

`node tests/test_netease_response.cjs` 验证参数、UTF-8 中文及 emoji、字节视图偏移、原生解码器、缓存与下载失败。将该固定版本保存到本地，再执行 `node tests/test_netease_response.cjs /绝对路径/wyres.js`，可运行作者实际脚本的加密响应检查。本轮已通过 AES-128-ECB、gzip/非压缩和有/无原生 TextDecoder 的组合，验证模拟推广块移除、每日推荐与歌单保留、隐藏开关、两条问候栏路径、默认底栏与显式隐藏、位置广告清空、batch 非广告字段保留及旧首页广告横幅过滤。模拟推广块不代表已取得截图广告的真实响应正文；手机实际效果由用户更新后复测。
