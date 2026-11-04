import subprocess
import sys
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app import app, limiter  # noqa: E402
from utils.flow_validator import FlowValidator  # noqa: E402


@pytest.fixture
def client():
    app.config.update(TESTING=True, ADMIN_MODE=True)
    limiter.enabled = False
    with app.test_client() as c:
        yield c


@pytest.mark.parametrize("path", sorted((ROOT / "examples").glob("*.yaml")), ids=lambda p: p.name)
def test_examples_are_valid(path):
    ok, errors = FlowValidator().validate(yaml.safe_load(path.read_text(encoding="utf-8")))
    assert ok, errors


@pytest.mark.parametrize("pw", ["", "admin123", "password", "corta"])
def test_login_refused_without_a_real_password(client, pw):
    app.config["ADMIN_PASSWORD"] = pw
    r = client.post("/admin/login", json={"password": pw})
    assert r.status_code == 503


def test_login_with_real_password(client):
    app.config["ADMIN_PASSWORD"] = "una-password-vera"
    assert client.post("/admin/login", json={"password": "sbagliata"}).status_code == 401
    assert client.post("/admin/login", json={"password": "una-password-vera"}).status_code == 200


def test_write_api_needs_login(client):
    assert client.delete("/api/flows/qualunque").status_code == 401
    assert client.get("/builder").status_code == 302


def test_static_export(tmp_path):
    out = tmp_path / "site"
    subprocess.run([sys.executable, str(ROOT / "export_static.py"), "--flows", str(ROOT / "examples"),
                    "--out", str(out), "--base", "/flow-manager"], check=True, cwd=ROOT)
    home = (out / "index.html").read_text(encoding="utf-8")
    assert 'href="/flow-manager/flow/scegli-licenza"' in home
    assert (out / "flow" / "scegli-licenza" / "index.html").exists()
    assert (out / "output" / "scegli-licenza" / "out_mit" / "index.html").exists()
    assert (out / "api" / "flows" / "scegli-licenza.json").exists()
    assert "window.STATIC_EXPORT = true" in home
    assert "/admin/login" not in home
