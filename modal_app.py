"""MomentoBooth sur Modal — serveur Node.js hébergé dans le cloud (gratuit).

Déploiement :
    modal deploy modal_app.py

v87 — réveil par visage, interface tablette paysage et base Lens progressive, avec récupération PWA réseau-first.
"""

import subprocess

import modal

APP_NAME = "momentobooth"
PHOTOS_MOUNT = "/app/photos"

# Image Node 20 + npm, avec le code du projet copié dans /app.
# ⚠️ add_local_dir doit être le DERNIER pas du build (les build steps après
# l'ajout de fichiers locaux forceraient une reconstruction à chaque change).
image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("curl")
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
        "apt-get install -y nodejs",
    )
    .workdir("/app")
    .add_local_file("server/package.json", "/app/server/package.json", copy=True)
    .add_local_file("server/package-lock.json", "/app/server/package-lock.json", copy=True)
    .run_commands(
        "cd /app/server && npm ci --omit=dev --no-audit --no-fund",
    )
    .add_local_dir(".", "/app", ignore=[".git", "node_modules", "photos", "__pycache__", ".venv", "server/node_modules"])
)

volume = modal.Volume.from_name(f"{APP_NAME}-photos", create_if_missing=True)

app = modal.App(APP_NAME)


@app.function(
    image=image,
    volumes={PHOTOS_MOUNT: volume},
    timeout=10 * 60,
    # Les sessions de pairage et leur code court sont un état éphémère
    # partagé par fichiers ; un seul conteneur évite les lectures stale entre
    # réplicas Modal tout en gardant quatre requêtes HTTP concurrentes.
    max_containers=1,
)
# Plusieurs téléphones peuvent déclencher un pack (rendu) en même temps :
# laisser 4 requêtes concurrentes par conteneur au lieu de 1 (sérialisées).
@modal.concurrent(max_inputs=4)
@modal.web_server(port=8787, startup_timeout=120)
def serve():
    """Lance le serveur Express (doit écouter sur 0.0.0.0:8787)."""
    return subprocess.Popen(["node", "server/server.js"], cwd="/app")
