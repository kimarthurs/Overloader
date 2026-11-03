import os
import requests

ADMIN_DISCORD_WEBHOOK = os.getenv("ADMIN_DISCORD_WEBHOOK")

def send_admin_discord(msg):
    if not ADMIN_DISCORD_WEBHOOK:
        return

    try:
        requests.post(
            ADMIN_DISCORD_WEBHOOK,
            json={"content": msg},
            timeout=5
        )
    except:
        pass