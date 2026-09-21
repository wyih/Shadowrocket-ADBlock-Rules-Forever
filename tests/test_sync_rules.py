import ipaddress
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import sync_rules


PRIMARY = sync_rules.CONFIGS["sr_top500_whitelist_ad.conf"]
UPSTREAM = """# upstream build
[General]
ipv6 = false
skip-proxy = 192.168.0.0/16,10.0.0.0/8,localhost,*.local
bypass-tun = 100.64.0.0/10,192.168.0.0/16,10.0.0.0/8,fe80::/10
dns-server = https://dns.alidns.com/dns-query
[Rule]
DOMAIN-SUFFIX,ads.example,REJECT
IP-CIDR,192.168.0.0/16,DIRECT
FINAL,PROXY
[URL Rewrite]
^https?://example.com https://example.org 302
"""


def ip_policy(config, address):
    rules = config.split("[Rule]\n", 1)[1].split("[URL Rewrite]", 1)[0]
    ip = ipaddress.ip_address(address)
    for line in rules.splitlines():
        parts = line.split(",")
        if parts[0] == "IP-CIDR" and ip in ipaddress.ip_network(parts[1]):
            return parts[2]
        if parts[0] == "FINAL":
            return parts[1]


class SyncRulesTests(unittest.TestCase):
    def test_tailnet_and_lans_use_tailscale_before_upstream_direct_rule(self):
        config = sync_rules.customize(UPSTREAM, PRIMARY)
        for address in ("100.69.118.0", "192.168.2.249", "192.168.55.249"):
            self.assertEqual(ip_policy(config, address), "TAILSCALE")
        self.assertEqual(ip_policy(config, "192.168.99.1"), "DIRECT")
        self.assertEqual(ip_policy(config, "203.0.113.10"), "PROXY")

    def test_capture_targets_and_keep_unrelated_bypass_entries(self):
        config = sync_rules.customize(UPSTREAM, PRIMARY)
        self.assertIn("skip-proxy = 10.0.0.0/8, localhost, *.local", config)
        self.assertIn("tun-excluded-routes = 10.0.0.0/8, fe80::/10", config)
        self.assertNotIn("bypass-tun =", config)
        modern = UPSTREAM.replace("bypass-tun", "tun-excluded-routes")
        self.assertEqual(sync_rules.customize(modern, PRIMARY), config)

    def test_direct_config_keeps_public_traffic_direct(self):
        filename = sync_rules.CONFIGS["sr_direct_banad.conf"]
        source = UPSTREAM.replace("FINAL,PROXY", "FINAL,direct")
        config = sync_rules.customize(source, filename)
        self.assertEqual(ip_policy(config, "192.168.55.249"), "TAILSCALE")
        self.assertEqual(ip_policy(config, "203.0.113.10"), "direct")
        self.assertIn(f"update-url = {sync_rules.UPDATE_BASE}/{filename}\n", config)

    def test_upstream_changes_survive_and_update_url_stays_on_fork(self):
        source = UPSTREAM.replace(
            "DOMAIN-SUFFIX,ads.example,REJECT",
            "DOMAIN-SUFFIX,new-ad.example,REJECT\nDOMAIN,service.example,DIRECT",
        ).replace("ipv6 = false", "ipv6 = false\nupdate-url = https://upstream.example/rules.conf")
        config = sync_rules.customize(source, PRIMARY)
        self.assertIn(f"update-url = {sync_rules.UPDATE_BASE}/{PRIMARY}\n", config)
        self.assertEqual(config.count("update-url ="), 1)
        expected_rules = "\n".join(sync_rules.RULES) + "\n" + source.split("[Rule]\n", 1)[1]
        self.assertEqual(config.split("[Rule]\n", 1)[1], expected_rules)
        self.assertIn("dns-server = https://dns.alidns.com/dns-query", config)
        self.assertEqual(sync_rules.customize(config, PRIMARY), config)

    def test_invalid_source_is_rejected(self):
        for source in (
            "<html>Service unavailable</html>",
            "[General]\nipv6 = false\n",
            "[General]\nipv6 = false\n[Rule]\nDOMAIN,ads.example,REJECT\n",
        ):
            with self.assertRaises(ValueError):
                sync_rules.customize(source, PRIMARY)

    def test_missing_release_keeps_published_file(self):
        error = subprocess.CalledProcessError(128, ["git", "rev-parse"])
        with patch.object(sync_rules.subprocess, "check_output", side_effect=error):
            with patch.object(sync_rules.Path, "write_text") as write:
                with self.assertRaises(subprocess.CalledProcessError):
                    sync_rules.generate(Path("."))
                write.assert_not_called()

    def test_second_source_failure_does_not_publish_first_file(self):
        responses = [
            "abc123\n", UPSTREAM.encode(),
            subprocess.CalledProcessError(128, ["git", "show"]),
        ]
        with patch.object(sync_rules.subprocess, "check_output", side_effect=responses):
            with patch.object(sync_rules.Path, "write_text") as write:
                with self.assertRaises(subprocess.CalledProcessError):
                    sync_rules.generate(Path("."))
                write.assert_not_called()

    def test_generate_uses_new_names_and_leaves_originals_unchanged(self):
        direct = UPSTREAM.replace("FINAL,PROXY", "FINAL,direct")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            originals = dict(zip(sync_rules.CONFIGS, (UPSTREAM, direct)))
            for filename, source in originals.items():
                (root / filename).write_text(source, encoding="utf-8")
            responses = ["abc123\n", UPSTREAM.encode(), direct.encode()]
            with patch.object(sync_rules.subprocess, "check_output", side_effect=responses):
                sync_rules.generate(root)
            for source_name, filename in sync_rules.CONFIGS.items():
                self.assertEqual((root / source_name).read_text(), originals[source_name])
                result = (root / filename).read_text()
                self.assertEqual(result, sync_rules.customize(originals[source_name], filename))


if __name__ == "__main__":
    unittest.main()
