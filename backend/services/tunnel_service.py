"""Tunnel service for ngrok integration.

Detects active ngrok tunnels on port 4040, or manages pyngrok tunnels on port 8000,
allowing local frame images to be served via public https:// URLs.
"""

from pathlib import Path
from typing import Any, Dict, Optional
import json
import logging
import os
import urllib.request

logger = logging.getLogger(__name__)

CONFIG_PATH = Path(__file__).resolve().parent.parent / "data" / "tunnel_config.json"


class TunnelService:
    """Detects or provisions ngrok tunnels to expose local frames via https://."""

    _cached_tunnel_url: Optional[str] = None

    @classmethod
    def get_configured_token(cls) -> Optional[str]:
        """Check environment variable, config file, or user home."""
        env_token = os.environ.get("NGROK_AUTHTOKEN")
        if env_token:
            return env_token.strip()

        if CONFIG_PATH.exists():
            try:
                data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
                token = data.get("authtoken")
                if token:
                    return token.strip()
            except Exception:
                pass

        # Check ngrok.yml in LocalAppData
        user_yml = Path(os.environ.get("LOCALAPPDATA", "")) / "ngrok" / "ngrok.yml"
        if user_yml.exists():
            try:
                content = user_yml.read_text(encoding="utf-8")
                for line in content.splitlines():
                    if line.strip().startswith("authtoken:"):
                        return line.split(":", 1)[1].strip()
            except Exception:
                pass

        return None

    @classmethod
    def save_configured_token(cls, authtoken: str) -> None:
        """Persist authtoken locally."""
        CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        CONFIG_PATH.write_text(json.dumps({"authtoken": authtoken.strip()}), encoding="utf-8")

    @classmethod
    def check_existing_ngrok_agent(cls) -> Optional[str]:
        """Query the local ngrok client web API on http://127.0.0.1:4040/api/tunnels."""
        try:
            req = urllib.request.Request("http://127.0.0.1:4040/api/tunnels", headers={"User-Agent": "SigLIP2-Lab"})
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                tunnels = data.get("tunnels", [])
                for t in tunnels:
                    url = t.get("public_url", "")
                    if url.startswith("https://"):
                        cls._cached_tunnel_url = url
                        return url
                if tunnels:
                    url = tunnels[0].get("public_url", "")
                    cls._cached_tunnel_url = url
                    return url
        except Exception:
            pass
        return None

    @classmethod
    def get_active_tunnel_url(cls) -> Optional[str]:
        """Return currently active https:// tunnel URL, checking local ngrok agent on 4040 first."""
        # 1. Check if external `ngrok http 8000` is currently running
        agent_url = cls.check_existing_ngrok_agent()
        if agent_url:
            return agent_url

        # 2. Return cached or manually set tunnel URL
        return cls._cached_tunnel_url

    @classmethod
    def start_tunnel(cls, authtoken: Optional[str] = None, port: int = 8000) -> Dict[str, Any]:
        """
        Start an ngrok tunnel using pyngrok.
        If authtoken is passed or previously configured, sets it first.
        """
        token = authtoken or cls.get_configured_token()
        if authtoken:
            cls.save_configured_token(authtoken)

        # Check if already running via agent
        existing = cls.check_existing_ngrok_agent()
        if existing:
            return {
                "success": True,
                "url": existing,
                "source": "ngrok_agent_4040",
                "message": f"Connected to existing ngrok session at {existing}",
            }

        try:
            from pyngrok import conf, ngrok

            if token:
                ngrok.set_auth_token(token)

            tunnel = ngrok.connect(port)
            url = tunnel.public_url
            cls._cached_tunnel_url = url
            return {
                "success": True,
                "url": url,
                "source": "pyngrok",
                "message": f"Successfully started ngrok tunnel: {url}",
            }
        except Exception as exc:
            err_msg = str(exc)
            logger.warning("Failed starting ngrok tunnel: %s", err_msg)
            return {
                "success": False,
                "url": None,
                "error": err_msg,
                "needs_auth": "ERR_NGROK_4018" in err_msg or "authentication failed" in err_msg.lower(),
                "message": "ngrok authentication required. Please provide your authtoken or run 'ngrok http 8000'.",
            }

    @classmethod
    def set_public_url(cls, url: str) -> Dict[str, Any]:
        """Manually specify a public HTTPS tunnel URL."""
        clean_url = url.strip()
        if not clean_url.startswith("http://") and not clean_url.startswith("https://"):
            clean_url = f"https://{clean_url}"
        cls._cached_tunnel_url = clean_url
        return {
            "success": True,
            "url": clean_url,
            "message": f"Public tunnel URL set to {clean_url}",
        }

    @classmethod
    def stop_tunnel(cls) -> Dict[str, Any]:
        """Disconnect active pyngrok tunnel."""
        try:
            from pyngrok import ngrok
            ngrok.disconnect(cls._cached_tunnel_url)
            cls._cached_tunnel_url = None
            return {"success": True, "message": "Tunnel stopped."}
        except Exception as exc:
            cls._cached_tunnel_url = None
            return {"success": False, "error": str(exc)}

    @classmethod
    def get_status(cls) -> Dict[str, Any]:
        """Return full tunnel telemetry and status."""
        active_url = cls.get_active_tunnel_url()
        token = cls.get_configured_token()
        return {
            "is_active": active_url is not None,
            "public_url": active_url,
            "has_authtoken": token is not None,
            "token_masked": f"{token[:4]}...{token[-4:]}" if token and len(token) > 8 else ("Set" if token else "None"),
        }
