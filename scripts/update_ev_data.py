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

def get_headers():
    app = os.environ.get("RIVIAN_APP_SESSION_TOKEN")
    user = os.environ.get("RIVIAN_USER_SESSION_TOKEN")
    csrf = os.environ.get("RIVIAN_CSRF_TOKEN")
    if not all([app, user, csrf]):
        return None
    return {
        "A-Sess": app,
        "U-Sess": user,
        "Csrf-Token": csrf,
        "User-Agent": "RivianApp/2.0.0 (iOS)",
        "Apollographql-Client-Name": "com.rivian.ios.consumer-apollo-ios",
        "Content-Type": "application/json",
    }

def fetch_rivian():
    headers = get_headers()
    if not headers:
        print("Rivian tokens missing; skipping fetch")
        return []
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

def fetch_detailed_session(transaction_id):
    """Fetch detailed session info including charger address/name. Returns dict or None."""
    headers = get_headers()
    if not headers or not transaction_id:
        return None
    query = {
        "operationName": "GetDetailedSessionInfoByTxnId",
        "variables": {"transactionId": transaction_id},
        "query": """query GetDetailedSessionInfoByTxnId($transactionId: ID!) {
            getDetailedSessionInfoByTxnId(transactionId: $transactionId) {
                charger {
                    address { city state country line1 line2 postalCode }
                    name
                    vendor
                    isHomeCharger
                }
                summary { startInstant endInstant totalEnergyKwh transactionId }
            }
        }"""
    }
    try:
        r = requests.post(
            "https://rivian.com/api/gql/chrg/user/graphql",
            headers=headers,
            json=query,
            timeout=20,
        )
        if r.status_code != 200:
            print(f"Detailed fetch failed {r.status_code} for {transaction_id}")
            return None
        data = r.json().get("data", {}).get("getDetailedSessionInfoByTxnId")
        return data
    except Exception as e:
        print(f"Detailed fetch error for {transaction_id}: {e}")
        return None

def fetch_odometer(vehicle_id):
    """Fetch current odometer in miles from vehicle state. Returns None on failure."""
    headers = get_headers()
    if not headers or not vehicle_id:
        return None
    query = {
        "operationName": "GetVehicleState",
        "variables": {"vehicleID": vehicle_id},
        "query": """query GetVehicleState($vehicleID: String!) {
            vehicleState(id: $vehicleID) {
                vehicleMileage { value timeStamp }
            }
        }"""
    }
    try:
        r = requests.post(
            "https://rivian.com/api/gql/gateway/graphql",
            headers=headers,
            json=query,
            timeout=30,
        )
        if r.status_code != 200:
            print(f"Odometer fetch failed {r.status_code}")
            return None
        mileage = r.json().get("data", {}).get("vehicleState", {}).get("vehicleMileage", {})
        meters = mileage.get("value")
        if meters is None:
            print("No vehicleMileage in response")
            return None
        miles = round(meters / 1609.344, 1)
        print(f"Odometer: {miles} mi")
        return miles
    except Exception as e:
        print(f"Odometer fetch error: {e}")
        return None

def fetch_vin(vehicle_id):
    """Fetch VIN from getUserInfo. Returns None on failure."""
    headers = get_headers()
    if not headers:
        return None
    query = {
        "operationName": "getUserInfo",
        "variables": {},
        "query": """query getUserInfo {
            currentUser {
                vehicles {
                    id
                    vin
                    name
                }
            }
        }"""
    }
    try:
        r = requests.post(
            "https://rivian.com/api/gql/gateway/graphql",
            headers=headers,
            json=query,
            timeout=30,
        )
        if r.status_code != 200:
            print(f"VIN fetch failed {r.status_code}")
            return None
        vehicles = r.json().get("data", {}).get("currentUser", {}).get("vehicles") or []
        for v in vehicles:
            if vehicle_id is None or v.get("id") == vehicle_id:
                vin = v.get("vin")
                if vin:
                    print(f"VIN: {vin}")
                    return vin
        if vehicles and vehicles[0].get("vin"):
            vin = vehicles[0]["vin"]
            print(f"VIN (first vehicle): {vin}")
            return vin
        print("No VIN found")
        return None
    except Exception as e:
        print(f"VIN fetch error: {e}")
        return None

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
    vehicle_id = None
    SUPERCHARGER_RATE = 0.50  # assumed $/kWh when paidTotal missing for Tesla Supercharger
    city_samples = []
    for r in rivian_rows:
        if not vehicle_id and r.get("vehicleId"):
            vehicle_id = r["vehicleId"]
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
            city = (r.get("city") or "").strip()
            txn = r.get("transactionId")

            # Diagnostic: log city for non-public sessions (sample)
            if not is_public and len(city_samples) < 15:
                city_samples.append((city or "(empty)", round(kw,1), is_home, txn[:8] if txn else None))

            # Enrich missing city via detailed session (especially Superchargers)
            detailed_name = None
            detailed_city = None
            if not city and txn and (not is_public and not is_home):
                detail = fetch_detailed_session(txn)
                if detail and detail.get("charger"):
                    ch = detail["charger"]
                    detailed_name = (ch.get("name") or "").strip()
                    addr = ch.get("address") or {}
                    detailed_city = (addr.get("city") or "").strip()
                    if detailed_name or detailed_city:
                        print(f"Enriched {txn}: name={detailed_name!r} city={detailed_city!r}")

            if is_public:
                net = "Rivian Adventure Network"
                site = (city or detailed_city or "Unknown") + " RAN"
            elif is_home:
                net, site = "Home", "Home"
            elif kw > 30:
                net = "Tesla Supercharger"
                site = detailed_name or detailed_city or city or "Unknown Supercharger"
            elif 8 <= kw <= 11:
                net, site = "Workplace – Qualtrics", "Qualtrics Provo"
            else:
                net, site = "Workplace – Weave", "Weave Lehi"

            # Assume $0.50/kWh for Tesla Superchargers when Rivian does not report a paidTotal
            if net == "Tesla Supercharger" and cost is None and kwh > 0:
                cost = round(SUPERCHARGER_RATE * kwh, 2)

            add(out, VNAME.get("R", "Reba"), st, en, site, net, kwh, cost, "rivian")
        except Exception as e:
            print(f"Skip Rivian row: {e}")
            continue

    if city_samples:
        print("Non-public city samples (city, kw, is_home, txn):")
        for s in city_samples:
            print(" ", s)

    out.sort(key=lambda x: x["s"])
    odometer = fetch_odometer(vehicle_id) if vehicle_id else None
    vin = fetch_vin(vehicle_id)
    result = {
        "generated": datetime.now(timezone.utc).isoformat()[:19] + "Z",
        "odometer": odometer,
        "vin": vin,
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
