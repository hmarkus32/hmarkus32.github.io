"""Update EV charging dashboard data from Tesla and Rivian.
Adapted for GitHub Actions. Paths relative. Secrets via env.
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
    "5YJ3E1EB6RF793480": "Ethel",
    "5YJ3E1EA8PF501560": "Appa",
    "R": "Reba",
}
if os.environ.get("VEHICLE_NAMES"):
    try:
        VNAME.update(json.loads(os.environ["VEHICLE_NAMES"]))
    except Exception:
        pass

TOKEN_URL = "https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token"
API = "https://fleet-api.prd.na.vn.cloud.tesla.com"

def refresh_tesla():
    cid = os.environ["TESLA_CLIENT_ID"]
    rt = os.environ["TESLA_REFRESH_TOKEN"]
    r = requests.post(TOKEN_URL, data={
        "grant_type": "refresh_token",
        "client_id": cid,
        "refresh_token": rt,
    }, timeout=30)
    r.raise_for_status()
    tok = r.json()
    new_rt = tok.get("refresh_token")
    if new_rt:
        with open("new_tesla_refresh_token.txt", "w") as f:
            f.write(new_rt)
        print("Tesla token refreshed; new refresh token written")
    return tok["access_token"]

def fetch_tesla_history(access):
    rows = []
    page = 1
    while True:
        r = requests.get(
            f"{API}/api/1/dx/charging/history",
            params={"pageNo": page, "pageSize": 50},
            headers={"Authorization": f"Bearer {access}"},
            timeout=30,
        )
        if r.status_code != 200:
            sys.exit(f"Tesla history failed {r.status_code} {r.text[:200]}")
        j = r.json()
        d = j.get("data") or j.get("response", {}).get("data") or []
        rows.extend(d)
        if len(d) < 50:
            break
        page += 1
    print(f"{len(rows)} Tesla sessions")
    return rows

def fetch_rivian():
    app = os.environ.get("RIVIAN_APP_SESSION_TOKEN")
    user = os.environ.get("RIVIAN_USER_SESSION_TOKEN")
    csrf = os.environ.get("RIVIAN_CSRF_TOKEN")
    if not all([app, user, csrf]):
        print("Rivian tokens missing; skipping Rivian fetch")
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
        print(f"Rivian fetch failed {r.status_code}; continuing with Tesla only")
        return []
    data = r.json().get("data", {}).get("getCompletedSessionSummaries") or []
    print(f"{len(data)} Rivian sessions")
    return data

def iso(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))

def add(out, veh, st, en, site, net, kwh, cost, src):
    dur = max((en - st).total_seconds() / 60, 0.1)
    loc = st if (st.utcoffset() and src == "tesla") else st.astimezone(MT)
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

def normalize(tesla_rows, rivian_rows):
    out = []
    ntsla = []
    for x in tesla_rows:
        st, en = iso(x["chargeStartDateTime"]), iso(x["chargeStopDateTime"])
        kwh = sum((f.get(k) or 0) for f in x.get("fees", []) if f.get("feeType") == "CHARGING" for k in ("usageBase", "usageTier1", "usageTier2", "usageTier3", "usageTier4"))
        cost = sum(f.get("totalDue") or 0 for f in x.get("fees", []))
        veh = VNAME.get(x.get("vin"), "Tesla …" + x.get("vin", "")[-6:]) if x.get("vehicleMakeType") == "TSLA" else VNAME["R"]
        if veh == VNAME["R"]:
            ntsla.append((st, en))
        add(out, veh, st, en, x.get("siteLocationName") or "Unknown Supercharger", "Tesla Supercharger", kwh, cost, "tesla")

    dupes = 0
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
            if is_public:
                net, site = "Rivian Adventure Network", (r.get("city") or "Unknown") + " RAN"
            elif kw > 30:
                if any(st < b + timedelta(minutes=30) and en > a - timedelta(minutes=30) for a, b in ntsla):
                    dupes += 1
                    continue
                net, site = "Tesla Supercharger", r.get("city") or "Unknown Supercharger"
            elif 8 <= kw <= 11:
                net, site = "Workplace – Qualtrics", "Qualtrics Provo"
            else:
                net, site = "Workplace – Weave", "Weave Lehi"
            add(out, VNAME["R"], st, en, site, net, kwh, cost, "rivian")
        except Exception as e:
            print(f"Skip Rivian row: {e}")
            continue

    out.sort(key=lambda x: x["s"])
    result = {
        "generated": datetime.now(timezone.utc).isoformat()[:19] + "Z",
        "sessions": out,
    }
    print(len(out), "sessions;", dupes, "Rivian dupes of Tesla-billed sessions dropped")
    return result

def main():
    print("Refreshing Tesla token...")
    access = refresh_tesla()
    print("Fetching Tesla history...")
    tesla = fetch_tesla_history(access)
    print("Fetching Rivian...")
    rivian = fetch_rivian()
    print("Normalizing...")
    data = normalize(tesla, rivian)
    os.makedirs(os.path.dirname(DATA_PATH), exist_ok=True)
    with open(DATA_PATH, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"Wrote {DATA_PATH}")

if __name__ == "__main__":
    main()
