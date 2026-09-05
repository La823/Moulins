import json
import re

from flask import Flask, jsonify, request
import requests
from asgiref.wsgi import WsgiToAsgi

app = Flask(__name__)
asgi_app = WsgiToAsgi(app)

BASE_URL = "https://www.statedrugs.gov.in/SFDA"
LOGIN_PAGE_URL = f"{BASE_URL}/ondls-login.html"
# The portal's endpoints only respond to XHR-looking requests coming from
# its own page — a bare request without these gets rejected upstream.
COMMON_HEADERS = {
    "Referer": LOGIN_PAGE_URL,
    "X-Requested-With": "XMLHttpRequest",
}
CSRF_RE = re.compile(r'name="_csrf" content="([^"]+)"')


def _new_session():
    # verifyLicense/productDetailsForLicense are plain GETs and work
    # anonymously, but techPersonDtlForThirdPartyLic is a POST guarded by
    # Spring Security CSRF — it 404s without a session-scoped token pulled
    # from the login page's own meta tag.
    session = requests.Session()
    resp = session.get(LOGIN_PAGE_URL, headers=COMMON_HEADERS, timeout=15)
    match = CSRF_RE.search(resp.text)
    csrf_token = match.group(1) if match else None
    return session, csrf_token


def _fetch_products(session, licence_id):
    try:
        resp = session.get(
            f"{BASE_URL}/productDetailsForLicense",
            params={"licId": licence_id},
            headers=COMMON_HEADERS,
            timeout=15,
        )
        data = resp.json()
        return data.get("aaData", [])
    except Exception as e:
        print(e)
        return []


def _fetch_tech_persons(session, csrf_token, licence_id):
    # The portal's own frontend JS does JSON.parse(response) here rather
    # than using it as an object directly (unlike the products endpoint),
    # implying this one can come back as a JSON-encoded string — handle
    # both shapes defensively.
    try:
        headers = dict(COMMON_HEADERS)
        if csrf_token:
            headers["X-CSRF-TOKEN"] = csrf_token
        resp = session.post(
            f"{BASE_URL}/techPersonDtlForThirdPartyLic/{licence_id}",
            data={"status": 1},
            headers=headers,
            timeout=15,
        )
        parsed = resp.json()
        if isinstance(parsed, str):
            parsed = json.loads(parsed)
        return parsed.get("aaData", []) if isinstance(parsed, dict) else []
    except Exception as e:
        print(e)
        return []


# GET /api/v1/getDLDetails?licenseNo=... — no captcha or session needed,
# unlike the GST portal; this is a single-shot lookup. When the license is
# found we also pull its licensed products and (if applicable) technical
# person details, matching what the government page itself shows.
@app.route("/api/v1/getDLDetails", methods=["GET"])
def get_dl_details():
    license_no = request.args.get("licenseNo", "").strip()
    if not license_no:
        return jsonify({"error": "licenseNo is required"}), 400

    try:
        session, csrf_token = _new_session()
        resp = session.get(
            f"{BASE_URL}/verifyLicense",
            params={"licenseNo": license_no},
            headers=COMMON_HEADERS,
            timeout=15,
        )
        data = resp.json()

        if "error" in data:
            return jsonify(data), 404

        licence_id = data.get("num_licence_id")
        if licence_id:
            data["products"] = _fetch_products(session, licence_id)
            if data.get("num_is_tech_person_applicable"):
                data["tech_persons"] = _fetch_tech_persons(session, csrf_token, licence_id)

        return jsonify(data)
    except Exception as e:
        print(e)
        return jsonify({"error": "Error in fetching drug license details"}), 502


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(asgi_app, host="0.0.0.0", port=5002)
