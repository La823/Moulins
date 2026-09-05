import base64
import time
import uuid

from flask import Flask, jsonify, request
import requests
from asgiref.wsgi import WsgiToAsgi

app = Flask(__name__)
asgi_app = WsgiToAsgi(app)

# In-memory session store, keyed by our own sessionId (not the GST portal's
# cookie) — each entry holds the requests.Session (so portal cookies persist
# between the captcha fetch and the details lookup) plus a timestamp so
# stale sessions can be swept instead of growing unbounded forever.
gst_sessions = {}
SESSION_TTL_SECONDS = 10 * 60


def _sweep_expired_sessions():
    cutoff = time.time() - SESSION_TTL_SECONDS
    expired = [sid for sid, entry in gst_sessions.items() if entry["created_at"] < cutoff]
    for sid in expired:
        gst_sessions.pop(sid, None)


@app.route("/api/v1/getCaptcha", methods=["GET"])
def get_captcha():
    _sweep_expired_sessions()
    try:
        session = requests.Session()
        session_id = str(uuid.uuid4())

        # Visiting the search page first is required — it's what sets the
        # cookies the captcha and later the details lookup depend on.
        session.get("https://services.gst.gov.in/services/searchtp", timeout=15)
        captcha_response = session.get("https://services.gst.gov.in/services/captcha", timeout=15)
        captcha_base64 = base64.b64encode(captcha_response.content).decode("utf-8")

        gst_sessions[session_id] = {"session": session, "created_at": time.time()}

        return jsonify({
            "sessionId": session_id,
            "image": "data:image/png;base64," + captcha_base64,
        })
    except Exception as e:
        print(e)
        return jsonify({"error": "Error in fetching captcha"}), 502


@app.route("/api/v1/getGSTDetails", methods=["POST"])
def get_gst_details():
    try:
        body = request.get_json(force=True, silent=True) or {}
        session_id = body.get("sessionId")
        gstin = body.get("GSTIN")
        captcha = body.get("captcha")

        if not session_id or not gstin or not captcha:
            return jsonify({"error": "sessionId, GSTIN and captcha are required"}), 400

        entry = gst_sessions.get(session_id)
        if entry is None:
            return jsonify({"error": "Invalid or expired session id — fetch a new captcha"}), 400

        response = entry["session"].post(
            "https://services.gst.gov.in/services/api/search/taxpayerDetails",
            json={"gstin": gstin, "captcha": captcha},
            timeout=15,
        )

        # The session is single-use against the portal regardless of
        # outcome (a captcha can't be resubmitted), so drop it either way.
        gst_sessions.pop(session_id, None)

        data = response.json()
        if response.status_code != 200 or "error" in data:
            return jsonify(data), 400
        return jsonify(data)
    except Exception as e:
        print(e)
        return jsonify({"error": "Error in fetching GST details"}), 502


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(asgi_app, host="0.0.0.0", port=5001)
