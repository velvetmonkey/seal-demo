#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Live demo backend: serves the static demo AND a /api/decide endpoint that
runs the REAL verified seal-host binary and returns its genuine verdict.

No model in the loop. Each request signs a trusted config, spawns the actual
seal-host (the 222MB Lean-verified exe), feeds it the tool call over MCP stdio,
and reads the real verdict + cert hashes off the audit line.
"""
import json, os, subprocess, tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOME = Path.home()
SEAL_BIN = os.environ.get("SEAL_BIN", str(HOME / "build/seal-host/.lake/build/bin/seal-host"))
MOCK = os.environ.get("SEAL_MOCK", str(HOME / "build/seal-host/test/integration/mock_mcp_server.py"))
PUBLIC = os.environ.get("SEAL_PUBLIC", str(HOME / "build/seal-demo/public"))
PUBKEY = "demo-pk"


def sign(payload: dict) -> str:
    body = json.dumps(payload, separators=(",", ":"))
    return json.dumps({"payload": body, "signature": f"stub-ed25519:{PUBKEY}:{body}"}, separators=(",", ":"))


def stable_hash(parts) -> int:
    acc = 14695981039346656037
    for ch in "|".join(parts):
        acc = (acc * 1099511628211 + ord(ch)) % 2**64
    return acc


# ---- policy section builders ----
def safety(tools):
    return {"approval": {"control_file": "X", "ttl_seconds": 120}, "tools": tools}


GUARDED = lambda name, target: {"name": name, "mode": "guarded", "match": {"type": "always"}, "target": target}
DBTOOL = {"name": "db.execute", "mode": "guarded",
          "match": {"type": "contains_any_ci", "arg": "sql", "needles": ["drop", "delete", "truncate"]},
          "target": [{"literal": "db"}, {"arg": "database"}, {"literal": "write"}, {"arg": "sql"}]}
DENY_APPROVE = {"name": "approve", "mode": "deny", "match": {"type": "always"}, "target": []}


def standard_payload():
    """A rich multi-kernel config — used for Demo 1 and the 'fire your own' box."""
    return {
        "epoch": 1,
        "safety": safety([DBTOOL, GUARDED("payments.send", [{"literal": "pay"}]),
                          GUARDED("session.revoke", [{"literal": "revoke"}]),
                          GUARDED("store.update", [{"literal": "store"}]),
                          GUARDED("key.use", [{"literal": "key"}]), DENY_APPROVE]),
        "temporal": {"policies": []},
        "consensus": {"roster": [1, 2, 3], "votes_file": "X", "high_stakes": ["payments.send"]},
        "convergence": {"tools": [{"tool": "store.update", "op_arg": "op"}]},
    }


def run_decision(payload, tool, args, approval_target=None):
    """Spawn the REAL seal-host, feed one tools/call, return the genuine verdict."""
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        appr = tmp / "approvals.ndjson"
        appr.write_text((json.dumps({"target": approval_target}) + "\n") if approval_target else "", encoding="utf-8")
        p = json.loads(json.dumps(payload))
        p["safety"]["approval"]["control_file"] = str(appr)
        if "consensus" in p:
            (tmp / "votes.ndjson").write_text("", encoding="utf-8")
            p["consensus"]["votes_file"] = str(tmp / "votes.ndjson")
        cfg = tmp / "trusted.json"
        cfg.write_text(sign(p), encoding="utf-8")
        proc = subprocess.Popen([SEAL_BIN, "--config", str(cfg), "--pubkey", PUBKEY, "--", "python3", MOCK],
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        rpc = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool, "arguments": args}}
        proc.stdin.write(json.dumps(rpc, separators=(",", ":")) + "\n")
        proc.stdin.flush()
        out = json.loads(proc.stdout.readline())
        proc.stdin.close()
        proc.wait(timeout=8)
        audit = proc.stderr.read().strip()
        is_err = out.get("result", {}).get("isError", False)
        certs = json.loads(audit).get("certs", []) if audit.startswith("{") else []
        return {"verdict": "DENY" if is_err else "ALLOW",
                "reason": out["result"]["content"][0]["text"] if is_err else "allowed",
                "certs": certs, "tool": tool, "arguments": args}


# ---- curated scenarios (the three demos) ----
PAY_T = stable_hash(["payments.send", "pay"])
STORE_T = stable_hash(["store.update", "store"])


def pay_payload(quorum):
    p = {"epoch": 1, "safety": safety([GUARDED("payments.send", [{"literal": "pay"}])]), "temporal": {"policies": []}}
    if quorum:
        p["consensus"] = {"roster": [1, 2, 3], "votes_file": "X", "high_stakes": ["payments.send"]}
    return p


def store_payload():
    return {"epoch": 1, "safety": safety([GUARDED("store.update", [{"literal": "store"}])]),
            "temporal": {"policies": []}, "convergence": {"tools": [{"tool": "store.update", "op_arg": "op"}]}}


SCENARIOS = {
    "destructive-sql": lambda: run_decision(standard_payload(), "db.execute", {"database": "prod", "sql": "drop table users"}),
    "self-approve":    lambda: run_decision(standard_payload(), "approve", {"target": 1}),
    "wire-40k":        lambda: run_decision(standard_payload(), "payments.send", {"amount": 40000, "to": "GB-unlisted"}, PAY_T),
    "pay-before":      lambda: run_decision(pay_payload(False), "payments.send", {"amount": 40000, "to": "supplier-77"}, PAY_T),
    "pay-after":       lambda: run_decision(pay_payload(True), "payments.send", {"amount": 40000, "to": "supplier-77"}, PAY_T),
    "store-safe":      lambda: run_decision(store_payload(), "store.update", {"op": "orset.add", "key": "k1"}, STORE_T),
    "store-subtle":    lambda: run_decision(store_payload(), "store.update", {"op": "assign", "key": "k1"}, STORE_T),
}


class H(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        data = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path != "/api/decide":
            return self._send(404, '{"error":"not found"}')
        n = int(self.headers.get("Content-Length", 0))
        req = json.loads(self.rfile.read(n) or "{}")
        try:
            if "scenario" in req:
                fn = SCENARIOS.get(req["scenario"])
                if not fn:
                    return self._send(400, json.dumps({"error": "unknown scenario"}))
                res = fn()
            else:
                res = run_decision(standard_payload(), req["tool"], req.get("arguments", {}),
                                   req.get("approval_target"))
            self._send(200, json.dumps(res))
        except Exception as e:
            self._send(500, json.dumps({"error": str(e)}))

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/":
            path = "/index.html"
        f = Path(PUBLIC) / path.lstrip("/")
        if not f.is_file() or PUBLIC not in str(f.resolve()):
            return self._send(404, "not found", "text/plain")
        ctype = {"html": "text/html", "css": "text/css", "js": "application/javascript",
                 "json": "application/json"}.get(f.suffix.lstrip("."), "application/octet-stream")
        self._send(200, f.read_bytes(), ctype)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    print(f"seal-demo live: http://localhost:{port}  (real seal-host: {SEAL_BIN})")
    ThreadingHTTPServer(("0.0.0.0", port), H).serve_forever()
