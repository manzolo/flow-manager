#!/usr/bin/env python3
"""Esporta Flow Manager come sito statico di sola lettura (per GitHub Pages).

Genera home, una pagina per flusso, una pagina per ogni esito e il JSON di ogni flusso,
renderizzando le pagine con il test client di Flask. Il builder, il login e le API di
scrittura non esistono nella versione statica: il visualizzatore legge i nodi dalla pagina.

    python3 export_static.py --flows examples --out _site --base /flow-manager

--base e' il prefisso sotto cui il sito viene servito ('' se alla radice del dominio).
"""
import argparse
import json
import os
import shutil
import sys
from pathlib import Path


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--flows", default="examples", help="cartella dei flussi YAML (default: examples)")
    ap.add_argument("--out", default="_site", help="cartella di uscita (default: _site)")
    ap.add_argument("--base", default="", help="prefisso URL, es. /flow-manager (default: radice)")
    args = ap.parse_args()

    base = "/" + args.base.strip("/") if args.base.strip("/") else ""
    out = Path(args.out).resolve()
    flows_dir = Path(args.flows).resolve()

    # La configurazione si legge all'import di app: va preparata prima
    os.environ["FLOWS_DIRECTORY"] = str(flows_dir)
    os.environ["ADMIN_MODE"] = "True"          # nessun pulsante di modifica per i visitatori
    os.environ.pop("ADMIN_PASSWORD", None)
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from app import app, FlowManager, limiter  # noqa: E402

    app.config["STATIC_EXPORT"] = True
    limiter.enabled = False
    client = app.test_client()

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    def page(url, dest):
        r = client.get(url, base_url=f"http://localhost{base}/")
        if r.status_code != 200:
            raise SystemExit(f"{url}: HTTP {r.status_code}")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(r.data)

    flows = FlowManager.get_all_flows()
    page("/", out / "index.html")
    n_out = 0
    for f in flows:
        fid = f["id"]
        data = FlowManager.load_flow(fid)
        page(f"/flow/{fid}", out / "flow" / fid / "index.html")
        for node_id, node in (data.get("nodes") or {}).items():
            if node.get("type") == "output":
                page(f"/output/{fid}/{node_id}", out / "output" / fid / node_id / "index.html")
                n_out += 1
        api = out / "api" / "flows" / f"{fid}.json"
        api.parent.mkdir(parents=True, exist_ok=True)
        api.write_text(json.dumps({"success": True, "flow": data}, ensure_ascii=False), encoding="utf-8")

    shutil.copytree(Path(app.static_folder), out / "static")
    (out / ".nojekyll").write_text("")
    print(f"export: {len(flows)} flussi, {n_out} esiti -> {out} (base '{base or '/'}')")


if __name__ == "__main__":
    main()
