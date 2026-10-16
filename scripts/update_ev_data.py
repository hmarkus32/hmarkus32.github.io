"""Update EV charging dashboard data — Rivian only.
Tesla credentials are kept for potential future historical non-Supercharger endpoint.
"""
import json
import os
import sys
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import requests

MT = ZoneInfo("America/Denver")
DATA_PATH = "ev/data.json"

VNAME = {
    "R": "Reba",
}
if os.environ.get("VEHICLE_NAMES"):
    try:
        VNAME.update(json.loads(os.environ["VEHICLE_NAMES"]))
    except Exception:
        pass

def fetch_rivian():
    app = os.environ.get("RIVIAN_APP_SESSION_TOKEN")
    user = os.environ.get("RIVIAN_USER_SESSION_TOKEN")
    csrf = os.environ.get("RIVIAN_CSRF_TOKEN")
    if not all([app, user, csrf]):
        print("Rivian tokens missing; skipping fetch")
        return []
    headers = {
        "A-Sess": app,
        "U-Sess": user,
        "Csrf-Token": csrf,
        "User-Agent": "RivianApp/2.0.0 (iOS)",
        "Apollographql-Client-Name": "com.rivian.ios.consumer-apollo-ios",
        "Content-Type": "application/json",
    }
    query = {
        "operationName": "getCompletedSessionSummaries",
        "variables": {},
        "query": """query getCompletedSessionSummaries {
            getCompletedSessionSummaries {
                chargerType currencyCode paidTotal startInstant endInstant totalEnergyKwh
                rangeAddedKm city transactionId vehicleId vendor isPublic isHomeCharger
            }
        }"""
    }
    r = requests.post(
        "https://rivian.com/api/gql/chrg/user/graphql",
        headers=headers,
        json=query,
        timeout=30,
    )
    if r.status_code != 200:
        print(f"Rivian fetch failed {r.status_code}")
        return []
    data = r.json().get("data", {}).get("getCompletedSessionSummaries") or []
    print(f"{len(data)} Rivian sessions")
    return data

def iso(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))

def add(out, veh, st, en, site, net, kwh, cost, src):
    dur = max((en - st).total_seconds() / 60, 0.1)
    loc = st.astimezone(MT)
    out.append({
        "v": veh,
        "s": st.astimezone(timezone.utc).isoformat()[:19] + "Z",
        "e": en.astimezone(timezone.utc).isoformat()[:19] + "Z",
        "d": round(dur, 1),
        "site": site,
        "net": net,
        "kwh": round(kwh, 2),
        "cost": None if cost is None else round(cost, 2),
        "ppk": round(cost / kwh, 3) if cost is not None and kwh > 0 else None,
        "kw": round(kwh / (dur / 60), 1),
        "h": loc.hour,
        "dow": loc.isoweekday() % 7,
        "day": loc.date().isoformat(),
        "src": src,
    })

def normalize(rivian_rows):
    out = []
    for r in rivian_rows:
        try:
            st = iso(r["startInstant"])
            en = iso(r["endInstant"])
            kwh = float(r.get("totalEnergyKwh") or 0)
            if kwh <= 0:
                continue
            kw = kwh / max((en - st).total_seconds() / 3600, 1e-3)
            cost = float(r["paidTotal"]) if r.get("paidTotal") else None
            is_public = r.get("isPublic") is True or str(r.get("isPublic")).lower() == "true"
            is_home = r.get("isHomeCharger") is True or str(r.get("isHomeCharger")).lower() == "true"

            if is_public:
                net, site = "Rivian Adventure Network", (r.get("city") or "Unknown") + " RAN"
            elif is_home:
                net, site = "Home", "Home"
            elif kw > 30:
                net, site = "Tesla Supercharger", r.get("city") or "Unknown Supercharger"
            elif 8 <= kw <= 11:
                net, site = "Workplace – Qualtrics", "Qualtrics Provo"
            else:
                net, site = "Workplace – Weave", "Weave Lehi"

            add(out, VNAME.get("R", "Reba"), st, en, site, net, kwh, cost, "rivian")
        except Exception as e:
            print(f"Skip Rivian row: {e}")
            continue

    out.sort(key=lambda x: x["s"])
    result = {
        "generated": datetime.now(timezone.utc).isoformat()[:19] + "Z",
        "sessions": out,
    }
    print(len(out), "Rivian sessions")
    return result

def main():
    print("Fetching Rivian...")
    rivian = fetch_rivian()
    print("Normalizing...")
    data = normalize(rivian)
    os.makedirs(os.path.dirname(DATA_PATH), exist_ok=True)
    with open(DATA_PATH, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"Wrote {DATA_PATH}")

if __name__ == "__main__":
    main()
