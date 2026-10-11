# 个人 Shadowrocket 模块

本目录在 `tailscale` 分支维护。仓库的自动同步只生成根目录的两份 `_tailscale.conf`，不会改写本目录。

| 内容 | 维护位置 |
| --- | --- |
| 小红书（RedNote）修复版 | [`RedNote.sgmodule`](RedNote.sgmodule) |
| 自己的 DNS 模块 | [`DNS.sgmodule`](DNS.sgmodule) |
| MITM Keep Enabled 公开模板 | [`MITM-Keep-Enabled.sgmodule.example`](MITM-Keep-Enabled.sgmodule.example) |
| 含现有证书的完整 MITM 模块 | 本地 `private/MITM-Keep-Enabled.sgmodule`，Git 忽略 |
| Script Hub Beta | 官方仓库，见下方依赖说明 |

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

今天的完整修复包含 `[MITM] enable = true`、现有已信任证书的 `ca-passphrase` 和 `ca-p12`。它用于保留解密开关与证书，处理更新配置后解密失效的问题，和小红书模块的 HTTP/2 修复分别生效。

本仓库为公开仓库。`ca-p12` 是含 CA 私钥的证书容器，完整模块只保存在本地 `private/MITM-Keep-Enabled.sgmodule`；`/private/` 已加入 `.gitignore`。公开模板记录结构，不包含证书和密码。恢复时使用完整私人文件及手机已信任的同一张 CA。只有 `enable = true` 的模板不能恢复丢失的证书。

完整私人模块保持今天已经验证的原内容，没有远程更新头。不要给含私人 CA 的模块设置公开更新地址。

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

因此，其他经 Script Hub 转换的订阅，在重新导入或更新时也会使用对应 Beta 解析器。解析器改变会反映到生成结果；具体功能取决于源模块语法。DNS、完整私人 MITM 模块和这里直接维护的 RedNote 模块均不经过 Script Hub 转换，现有两份配置的 GitHub 自动同步也不调用 Script Hub。

官方模块与上述个人模块的作用不同：转换器负责生成模块；MITM Keep Enabled 保留解密开关与证书；DNS 覆盖通用参数；RedNote 执行小红书重写和脚本规则。
