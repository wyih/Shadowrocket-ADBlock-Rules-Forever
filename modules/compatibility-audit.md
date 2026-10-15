# 2026-10-15 Shadowrocket 转换模块检查

设备为 iPhone Air，iOS 27.0.1，Shadowrocket 2.2.92。检查了手机 iCloud 中的 41 个模块；20 个含脚本，共 108 条脚本规则、36 个独立脚本地址。35 个地址可下载，1 个返回 404。纯规则模块也纳入文件检查；863 条 jq 规则经语法核对，仅发现下述爱奇艺空表达式。私人证书、账号参数和原始流量未保存到仓库。

## 修复

| 模块 | 原因与修改 | 验证范围 |
| --- | --- | --- |
| 哔哩哔哩 | 默认 JSCore 缺少上游依赖的 TextDecoder、TextEncoder；转换后的参数为 `key=value&…`，上游要求 JSON。四条脚本改用 WebView；三条带参规则改为 JSON，布尔值保持布尔类型；补全已在实际流量中出现的 app.bilibili.com gRPC 本地响应匹配。 | 手机新视频的播放器下广告卡片消失；日志确认 WebView、二进制数据和 JSON 参数正常。切换到仓库订阅、更新模块并重连 VPN 后，再次打开新视频，广告卡片仍未出现，播放正常。 |
| 高德地图 | 旧开屏脚本只调整第一条创意的时间，依赖具体响应结构。开屏专用接口改为返回空广告数组；AOCS 响应主动清空 SplashScreenControl、splashscreen、splashview_config，即使服务器本次未返回这些缓存项；保留其余地图数据和上游过滤。重名脚本改用唯一名称。 | jq 检查缓存清除与非广告字段保留通过；手机保存后以及模块更新、VPN 重连后，两次冷启动均直接进入地图，未出现开屏广告；日志确认 AOCS 请求命中响应处理。旧 splash 接口在本次启动中未出现。 |
| Apple 天气增强 | `new URL` 在默认 JSCore 报 ReferenceError；两条规则改用 WebView，兼容 URL 和二进制解码所需接口。 | 手机日志确认通过 WebView 执行、不再报 URL 错误；VPN 开启时天气页面正常显示。测试用代理路由已移除。 |
| 网易云音乐 | 压缩响应解密分支直接使用 TextDecoder；六条脚本规则改用 WebView。 | 已核对实际上游代码与模块配置；尚未逐项验证客户端去广告。 |
| 腾讯视频 | 通用 replace-body.js 地址返回 404。使用本仓库的 tencent-video-request.js 保留原 getvinfo 表单替换。 | 检查了参数替换、中间及尾部字段保留、无匹配和无正文；尚未验证客户端广告。原上游已声明较新客户端可能失效。 |

| 爱奇艺 | 转换结果含一条空 jq 表达式，Shadowrocket 每次加载均记录 Invalid rule format。删除该无效行，保留紧邻的有效评论过滤规则及其他规则。 | 删除旧条目、重连 VPN 后，日志不再出现 Invalid rule format；未逐项验证客户端广告。 |

## 其他模块

微信外链解锁脚本为 TextDecoder、TextEncoder、atob、btoa 提供了回退，不因这些标识符出现而修改。iOS Location Spoofer 当前未启用；其 Base64 分支有运行环境要求，未改变用户设置。其余已下载脚本未发现相同的浏览器接口缺失问题。本次静态检查不代表所有客户端的所有广告位都经过实测。

手机当前启用 RedNote H2 测试模块，基础 HTTP/2 解密已开启；Bilibili 实际请求也使用 H2。本次哔哩哔哩问题的依据是运行接口缺失与参数解析错误。

## 检查

`node tests/test_module_repairs.cjs`：通过。覆盖高德缓存清理、空开屏列表、其他字段保留、腾讯请求改写，以及引擎和参数回归检查。六个模块的 `#!url` 均指向本仓库，更新时不会再经过原 Script Hub 转换地址。上游脚本仍从各模块中的原地址加载；腾讯请求脚本由本仓库维护。

## 手机更新来源确认

六个修复版均已在手机启用。执行“更新模块”后，四个原位修改模块保留仓库来源与修复内容；哔哩哔哩、爱奇艺从仓库 raw URL 重新导入，删除原 Script Hub 条目及旧 iCloud 副本。六份当前文件各只有一份，除 Shadowrocket 自动补充的更新头外，内容与本仓库一致；没有本地调试脚本地址。VPN 重连后的日志未见上述解析或运行错误。

验证完成后已关闭诊断页“允许访问”和临时启用的日志记录；本地调试服务已停止。网易云、腾讯视频和爱奇艺的验证仍限于所列依赖、规则与运行环境，未逐项实测客户端广告位。

## 哔哩哔哩开屏后续修复（待用户复测）

用户反馈视频页广告已消失，开屏仍会出现。`PacketTunnel-20261015105706.log` 记录了 `splash/list`、`splash/show`、`splash/event/list2` 和 `splash/brand/list` 请求。旧版通过本地映射返回 `list:[{}]`，另有独立 jq 规则处理 show/event，未统一覆盖这四条路径。

本轮将四条开屏路径改为请求脚本 `scripts/bilibili-splash.js`，返回完整的成功 JSON 响应，显式清空 list、show、event_list 和 keep_ids，并设置 max_time 为 0。移除会先行截获该请求的旧本地映射和重复 jq 规则。脚本不依赖 URL、TextDecoder 或模块参数，模块仍使用 WebView；视频页规则保持原样。

本地检查覆盖四条路径有无查询参数、响应 JSON、空列表、Content-Length 和其他请求放行。尚待用户更新仓库模块后验证开屏。本轮未修改微信模块；日志 11:53 的 purifyComment 参数解析错误也尚未单独解决。
