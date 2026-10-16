# 个人 Shadowrocket 模块

本目录在 `tailscale` 分支维护。仓库的自动同步只生成根目录的两份 `_tailscale.conf`，不会改写本目录。

| 内容 | 维护位置 |
| --- | --- |
| 小红书（RedNote）修复版 | [`RedNote.sgmodule`](RedNote.sgmodule) |
| 去广告传输兼容（QUIC 回退） | [`AdBlock-Transport.sgmodule`](AdBlock-Transport.sgmodule) |
| 闲鱼修复版 | [`FleaMarket.sgmodule`](FleaMarket.sgmodule) |
| 哔哩哔哩修复版 | [`Bilibili.sgmodule`](Bilibili.sgmodule) |
| 高德地图修复版 | [`Amap.sgmodule`](Amap.sgmodule) |
| Apple 天气增强修复版 | [`AppleWeather.sgmodule`](AppleWeather.sgmodule) |
| 网易云音乐修复版 | [`NeteaseCloudMusic.sgmodule`](NeteaseCloudMusic.sgmodule) |
| 爱奇艺规则修复版 | [`Iqiyi.sgmodule`](Iqiyi.sgmodule) |
| 腾讯视频首页广告修复版 | [`TencentVideo.sgmodule`](TencentVideo.sgmodule) |
| 微信公众号文章广告修复版 | [`WeChatOfficialAccounts.sgmodule`](WeChatOfficialAccounts.sgmodule) |
| 微信小程序规则与依赖修复版 | [`WeChatMiniPrograms.sgmodule`](WeChatMiniPrograms.sgmodule) |
| 自己的 DNS 模块 | [`DNS.sgmodule`](DNS.sgmodule) |
| MITM Keep Enabled 通用参数模板 | [`MITM-Keep-Enabled.sgmodule`](MITM-Keep-Enabled.sgmodule) |
| Script Hub Beta | 官方仓库，见下方依赖说明 |

## 更新哔哩哔哩与闲鱼，另装一份传输兼容模块

- **哔哩哔哩**：更新现有模块至 `20261017.3`。补上 `peak/download`、`mengqi/v1/resource` 的请求阶段空响应；按广告目录拦截 `sycp`、`sycp_brand` 图片及标记为 `SPLASH`、`SiteTool_1080` 的视频下载，并为对应 CDN 主机增加 HTTPS 解密。正常封面、头像和普通视频路径继续通过。保留原开屏列表、品牌字段处理和来源日志。`20261017.2` 两次冷启动均执行，但第一次仍有广告，新版下载拦截待用户实测。
- **闲鱼**：用[仓库版 FleaMarket.sgmodule](https://raw.githubusercontent.com/wyih/Shadowrocket-ADBlock-Rules-Forever/tailscale/modules/FleaMarket.sgmodule)替换现有 Script Hub 订阅来源。它以用户现有“闲鱼去广告”为基线，完整保留 17 条首页、搜索、商品与个人页 jq 规则，将 7 条本地映射换为完整脚本响应，覆盖旧开屏接口；`20261016.2` 补上新日志实际出现的广告场景恢复接口，并覆盖异步开屏接口。不要同时启用两份闲鱼模块。
- **共用传输层**：另外导入并启用[去广告传输兼容](https://raw.githubusercontent.com/wyih/Shadowrocket-ADBlock-Rules-Forever/tailscale/modules/AdBlock-Transport.sgmodule)。只需一份，可供现有各 App 模块共用。它设置 `block-quic = all`，阻止 UDP/443 绕过 HTTPS 改写；不修改 DNS、证书或其他 UDP 端口。

传输模块会影响所有 UDP/443 连接，包括日志中豆包输入法使用的 QUIC 连接。支持回退的功能改走 TCP；只支持该传输的功能可能不可用。若语音等功能异常，关闭**去广告传输兼容**即可恢复，保留各 App 模块。

这一共用层解决的是传输绕过。广告响应结构仍由各 App 的专用模块处理；它不能直接清理 App 沙盒内已有的素材文件。两个修复版均已做本地检查，手机上的冷启动、切回前台和闲鱼正常浏览效果待用户更新后复测。

本地检查：`node tests/test_startup_ads.cjs`、`node tests/test_module_repairs.cjs`。哔哩哔哩响应脚本最初参考 [kokoryh/Sparkle 的固定版本](https://github.com/kokoryh/Sparkle/blob/290bcbdd2f158cdd8f7db9c996e90fe63490e16f/src/script/bilibili/json/handler.ts)，按 GPL-3.0 发布，许可证见 [`bilibili-splash-response.LICENSE`](../scripts/bilibili-splash-response.LICENSE)。旧请求脚本地址保留原行为，供尚未更新模块的订阅使用。

评论检查：`node tests/test_bilibili_comments.cjs` 下载原作者固定版本的请求和响应包，验证两种处理路径、压缩响应、正常评论保留及关闭过滤。也可把两个包的本地路径依次作为参数传入，避免重复下载。开屏和资源响应脚本地址均带 `v=20261017.3`，未改动的评论兼容层保持 `v=20261017.1`，更新模块即可刷新，无须另装脚本。资源命中输出 `Bilibili resource: version=20261017.3 returning-empty-response`，素材下载命中可在日志中检查 `URL-REGEX` 拒绝记录。回滚本次处理可恢复提交 `1c87c7b` 的模块、开屏脚本和共享响应脚本。

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

### 保留 HTTP/2 的候选修复

[`experimental/RedNote-H2.sgmodule`](experimental/RedNote-H2.sgmodule) 保留 `h2 = true`，将静态水印素材从 `[Map Local]` 改为一个精确匹配的请求脚本。[`scripts/rednote-watermark-response.js`](../scripts/rednote-watermark-response.js) 通过 `engine=webview` 返回 PNG 的 Base64 字符串，并设置响应的 `body-base64 = true`，让 Shadowrocket 解码为二进制响应。它内嵌同一张已验证的 PNG，无需请求其他图片服务器。

同 build 3445 的本机引擎静态核对显示：WebView 响应桥的 `setWebResponse:` 识别 `body-base64`；脚本提前响应的 `earlyResponseForRequest:scriptResult:` 复制 `bodyData`；HTTP/2 的脚本回调调用 `sendResponseToClient:`，发送图片 DATA 帧。它绕开了出错的 Map Local 状态码响应路径。

这是待手机验证的候选版本。脚本地址指向本仓库，发布脚本后才能从手机加载。手机测试时用候选模块替换原 RedNote 模块，复测清缓存后的静态图和实况图保存，以及模块更新、配置更新和 VPN 重连，并确认日志实际协商为 H2。正式版本仍是上面已经验证通过的 HTTP/1.1 模块。

本地检查：`node tests/test_rednote_watermark.cjs`。检查覆盖响应正文与 PNG 一致、Base64 响应标记、仅匹配水印素材地址以及模块使用 H2 和 WebView。该检查不替代手机的 H2 保存验证。

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

[`DNS.sgmodule`](DNS.sgmodule) 保存用户现有模块，全部设置值保持原样。它覆盖 `[General]` 参数，包括三个带 `#proxy` 的 DoH 地址、备用 DNS、DNS 劫持条目，以及 IPv6、ICMP 和重写拒绝选项。

两份 `_tailscale.conf` 的默认 `dns-server` 是 `dns.alidns.com` 和 `doh.pub`，该模块启用后使用模块中的设置。它没有 Script Hub 更新地址，也没有转换脚本；Script Hub Beta 不参与这个模块的加载。

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
