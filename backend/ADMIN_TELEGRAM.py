def send_admin_telegram(msg):
    if not ADMIN_TELEGRAM_BOT_TOKEN or not ADMIN_TELEGRAM_CHAT_ID:
        return

    try:
        requests.post(
            f"https://api.telegram.org/bot{ADMIN_TELEGRAM_BOT_TOKEN}/sendMessage",
            json={
                "chat_id": ADMIN_TELEGRAM_CHAT_ID,
                "text": msg
            },
            timeout=5
        )
    except:
        pass