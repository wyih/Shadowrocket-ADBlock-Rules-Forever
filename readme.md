# Shadowrocket：上游原版与 Tailscale 定制版

上游：[Johnshall/Shadowrocket-ADBlock-Rules-Forever](https://github.com/Johnshall/Shadowrocket-ADBlock-Rules-Forever)。

- **[release 分支](https://github.com/wyih/Shadowrocket-ADBlock-Rules-Forever/tree/release)**：通过 GitHub 官方 `gh repo sync` 同步整个上游 `release` 分支，所有原版配置保持原名和原内容。
- **tailscale 分支**：保存生成脚本与下面两份另取名称的个人配置。它是默认分支，以便 GitHub Actions 定时运行。

## 导入地址

| 上游原版（release） | Tailscale 定制版（tailscale） |
| --- | --- |
| `sr_top500_whitelist_ad.conf` | [sr_top500_whitelist_ad_tailscale.conf](https://raw.githubusercontent.com/wyih/Shadowrocket-ADBlock-Rules-Forever/tailscale/sr_top500_whitelist_ad_tailscale.conf) |
| `sr_direct_banad.conf` | [sr_direct_banad_tailscale.conf](https://raw.githubusercontent.com/wyih/Shadowrocket-ADBlock-Rules-Forever/tailscale/sr_direct_banad_tailscale.conf) |

两份定制版的 `update-url` 指向各自的新地址。白名单版保持上游的默认代理策略；直连版保持上游的默认直连策略。手机现有 Rule 场景应引用对应的定制版，并启用 Shadowrocket 的 Tailscale 模块及「使用 Tailscale 子网」。

## 自动同步

[Sync fork and generate Tailscale configs](https://github.com/wyih/Shadowrocket-ADBlock-Rules-Forever/actions/workflows/tailscale.yml) 在每小时第 17 分钟运行，也支持手动运行：

1. 用 `gh repo sync --branch release --force` 将本仓库的 `release` 同步到上游。
2. 从同步后的同一个提交读取两份原版配置，生成两个 `_tailscale.conf` 文件。
3. 有内容变化时，提交到 `tailscale` 分支。

上游每天通过 orphan commit 重建 `release` 历史，所以同步使用 `--force`，作用范围仅为保存原版的 `release` 分支。个人文件保存在 `tailscale` 分支。网页手动使用 **Sync fork** 时，选择 `release` 分支。

GitHub 定时任务可能延迟。仓库发布更新后，手机仍需在 Shadowrocket 中更新已导入的配置。

## 个人规则

生成脚本将以下网段的 `TAILSCALE` 规则加入 `[Rule]` 最前面：

- `100.64.0.0/10`
- `192.168.2.0/24`
- `192.168.55.0/24`

同时移除与这些网段重叠的 `skip-proxy`、TUN 旁路条目，并把旧的 `bypass-tun` 写法改为 `tun-excluded-routes`。其余上游规则保留。认证密钥只保存在手机中。

本地重新生成与验证：

```sh
git fetch origin +refs/heads/release:refs/remotes/origin/release
python3 scripts/sync_rules.py
python3 -m unittest discover -s tests -v
```
