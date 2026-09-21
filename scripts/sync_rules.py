#!/usr/bin/env python3
"""Generate separately named Tailscale configs from the synced release branch."""

import ipaddress
import re
import subprocess
from pathlib import Path


CONFIGS = {
    "sr_top500_whitelist_ad.conf": "sr_top500_whitelist_ad_tailscale.conf",
    "sr_direct_banad.conf": "sr_direct_banad_tailscale.conf",
}
UPDATE_BASE = (
    "https://raw.githubusercontent.com/wyih/"
    "Shadowrocket-ADBlock-Rules-Forever/tailscale"
)
TAILSCALE_ROUTES = ("100.64.0.0/10", "192.168.2.0/24", "192.168.55.0/24")
NETWORKS = tuple(ipaddress.ip_network(route) for route in TAILSCALE_ROUTES)
RULES = tuple(f"IP-CIDR,{route},TAILSCALE,no-resolve" for route in TAILSCALE_ROUTES)


def keep_bypass_entry(entry: str) -> bool:
    try:
        network = ipaddress.ip_network(entry, strict=False)
    except ValueError:
        return True  # Hostnames and wildcard domains in skip-proxy.
    return not any(
        network.version == route.version and network.overlaps(route)
        for route in NETWORKS
    )


def customize(source: str, filename: str) -> str:
    lines = source.splitlines(keepends=True)
    sections = [line.strip() for line in lines if line.strip().startswith("[")]
    if sections.count("[General]") != 1 or sections.count("[Rule]") != 1:
        raise ValueError("Upstream must contain one [General] and one [Rule] section")
    rules_section = source.split("[Rule]", 1)[1].split("\n[", 1)[0]
    if not any(line.strip().startswith("FINAL,") for line in rules_section.splitlines()):
        raise ValueError("Upstream is missing its final routing policy")

    output = []
    section = ""
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            section = stripped
            output.append(line)
            if section == "[General]":
                output.append(f"update-url = {UPDATE_BASE}/{filename}\n")
            elif section == "[Rule]":
                output.extend(rule + "\n" for rule in RULES)
            continue

        if section == "[General]":
            match = re.match(r"\s*([\w-]+)\s*=\s*(.*)", line)
            if match:
                key, value = match.groups()
                if key == "update-url":
                    continue
                if key in ("skip-proxy", "bypass-tun", "tun-excluded-routes"):
                    entries = [entry.strip() for entry in value.split(",")]
                    entries = [entry for entry in entries if keep_bypass_entry(entry)]
                    if key == "bypass-tun":
                        key = "tun-excluded-routes"
                    line = f"{key} = {', '.join(entries)}\n"

        if section == "[Rule]" and stripped in RULES:
            continue
        output.append(line)

    return "".join(output)


def generate(root: Path) -> None:
    # Pin both reads to the same synced commit; validate before publishing either.
    revision = subprocess.check_output(
        ["git", "rev-parse", "origin/release"], cwd=root, text=True
    ).strip()
    results = {}
    for source_name, filename in CONFIGS.items():
        source = subprocess.check_output(
            ["git", "show", f"{revision}:{source_name}"], cwd=root
        ).decode("utf-8")
        results[filename] = customize(source, filename)
    for filename, result in results.items():
        destination = root / filename
        if destination.exists() and destination.read_text(encoding="utf-8") == result:
            print(f"{filename}: already up to date")
            continue
        destination.write_text(result, encoding="utf-8")
        print(f"{filename}: synced upstream with Tailscale routes")


if __name__ == "__main__":
    generate(Path(__file__).resolve().parent.parent)
