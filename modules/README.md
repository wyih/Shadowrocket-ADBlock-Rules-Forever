# 个人 Shadowrocket 模块

本目录在 `tailscale` 分支维护。仓库的自动同步只生成根目录的两份 `_tailscale.conf`，不会改写本目录。

| 内容 | 维护位置 |
| --- | --- |
| 小红书（RedNote）修复版 | [`RedNote.sgmodule`](RedNote.sgmodule) |
| 去广告传输兼容（QUIC 回退） | [`AdBlock-Transport.sgmodule`](AdBlock-Transport.sgmodule) |
| HTTPDNS 拦截器 | [`HTTPDNS.sgmodule`](HTTPDNS.sgmodule) |
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

## 导入与更新

模块地址为 `https://raw.githubusercontent.com/wyih/Shadowrocket-ADBlock-Rules-Forever/tailscale/modules/<文件名>`。已订阅的模块沿原地址更新；脚本由模块自动加载。相同 App 的旧 Script Hub 模块与本仓库版本只启用一个。

将 HTTPDNS 模块置于模块列表顶部，原有独立广告平台模块继续按需启用。去广告传输兼容模块设置 `block-quic = all` 并拦截 UDP 443，使 QUIC 回退到 TCP；若语音等功能受影响，可停用该模块。

## DNS 与场景配置

[白名单配置](../sr_top500_whitelist_ad_tailscale.conf)已内置经代理的加密 DNS，并使用 AliDNS 解析代理节点。[直连配置](../sr_direct_banad_tailscale.conf)使用系统 DNS。通过场景切换这两份配置时，独立 DNS 模块保持关闭。

## 小红书

[`RedNote.sgmodule`](RedNote.sgmodule) 设置 `h2=false`，影响全部 MITM 连接。[`experimental/RedNote-H2.sgmodule`](experimental/RedNote-H2.sgmodule) 通过脚本处理并保留 H2。两版只启用一个。

## MITM Keep Enabled

导入 [`MITM-Keep-Enabled.sgmodule`](MITM-Keep-Enabled.sgmodule) 后，先填写以下参数，再将“启用”设为 `true`：

- **证书内容**：当前配置“HTTPS 解密”中复制的 Base64 PKCS#12 证书。
- **证书密码**：该证书的实际密码。
- **启用**：默认为 `false`。

参数保存在同名 `.meta` 文件中，其中包含证书私密信息。一个模块使用一份 CA，并覆盖当前配置的 CA；不会随场景自动选择证书。Apple Watch 需要信任手机实际使用的同一份 CA。

## Script Hub Beta

使用[官方模块](https://raw.githubusercontent.com/Script-Hub-Org/Script-Hub/main/modules/script-hub.beta.rocket.module)，负责前端以及模块、重写、规则集和脚本转换。本仓库直接托管的模块及配置同步不依赖转换服务。转换用法见[官方说明](https://github.com/Script-Hub-Org/Script-Hub#loon-script-v2-跨端转换beta)。

## 来源与许可

各模块的作者和来源保留在文件头。以下为本地脚本所用的主要上游：

- 小红书：RuCu6、fmz200；[固定版本源码](https://github.com/fmz200/wool_scripts/blob/5d5f63fcf98bc69d5f8f1b1bae6f86a01ee4bb97/Scripts/xiaohongshu/xiaohongshu.js)。
- 大众点评：[zirawell/R-Store](https://github.com/zirawell/R-Store/blob/cb61657d11df96473c8cf6188e695fe867357349/Res/Scripts/AntiAd/dianping.js)，许可见 [`dianping-splash-request.LICENSE`](../scripts/dianping-splash-request.LICENSE)。
- 哔哩哔哩：[kokoryh/Sparkle](https://github.com/kokoryh/Sparkle/blob/290bcbdd2f158cdd8f7db9c996e90fe63490e16f/src/script/bilibili/json/handler.ts)，许可见 [`bilibili-splash-response.LICENSE`](../scripts/bilibili-splash-response.LICENSE)。
- 米家：[luoxmc/loon](https://github.com/luoxmc/loon/blob/main/surge/Plugins/MiJia.sgmoudle)。
- 微信：可莉、RuCu6 的[模块存档](https://github.com/mihoyo-typ/KeleeOne/blob/ab6c3182fb2b09bcc34456f496282ec0b8e9217b/Plugin/WexinMiniPrograms_Remove_ads.lpx)、[NobyDa](https://github.com/NobyDa/Script/blob/0b8d083d444f4476700cb9d5d059c07b42da85eb/QuantumultX/File/Wechat.js) 与 [qDonl 丰巢插件](https://github.com/qDonl/loon-plugin/blob/c8d3a63653fb2163e6b811eb2f262eb08d071ec4/fengchao/fengchao.plugin)。
- HTTPDNS：[VirgilClyne/GetSomeFries](https://github.com/VirgilClyne/GetSomeFries/blob/b4aa767bcbc4d39bea5b549a3277a00517891d1e/sgmodule/HTTPDNS.Block.sgmodule) 与 [blackmatrix7/ios_rule_script](https://github.com/blackmatrix7/ios_rule_script/blob/master/rewrite/Shadowrocket/BlockHTTPDNS/BlockHTTPDNS.sgmodule)。
- Apple 天气：iRingo WeatherKit v3.3.2。
