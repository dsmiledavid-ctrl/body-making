#!/usr/bin/env python3
"""Convert the AppSheet Google Sheet ("Body Making Class Tracker") into a
backup file the new app can load (Settings -> Restore from backup).

Usage:  python3 tools/sheet2import.py <tracker.xlsx> <out.json>

The output holds customer names, so it must NEVER go into this (public) repo.
Write it to Downloads; .gitignore also blocks *.json at the top level.
"""
import json
import sys
from datetime import date, datetime, timezone

import openpyxl


def rows(wb, name):
    r = list(wb[name].iter_rows(values_only=True))
    head = r[0]
    return [dict(zip(head, x)) for x in r[1:] if any(v not in (None, "") for v in x)]


def d(v):
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    s = str(v).strip()
    # AppSheet sometimes stores M/D/YYYY
    if "/" in s:
        m, dd, y = s.split()[0].split("/")
        return f"{int(y):04d}-{int(m):02d}-{int(dd):02d}"
    return s[:10]


def ts(v):
    if isinstance(v, datetime):
        return v.isoformat()
    return str(v) if v else None


def num(v, default):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


def main(src, out):
    wb = openpyxl.load_workbook(src, data_only=True)
    cfg = rows(wb, "Config")[0]
    config = {
        "singlePrice": num(cfg.get("SinglePriceHUF"), 3500),
        "bundlePrice": num(cfg.get("BundlePriceHUF"), 30000),
        "ticketsTotal": num(cfg.get("TicketsTotal"), 10),
        "maxOpportunities": num(cfg.get("MaxOpportunities"), 12),
    }
    customers = [
        {"id": str(c["CustomerID"]), "name": str(c["Name"] or "").strip(),
         "contact": str(c["Contact"] or "").strip(), "createdAt": None}
        for c in rows(wb, "Customers")
    ]
    bundles = [
        {"id": str(b["BundleID"]), "customerId": str(b["CustomerID"]), "startDate": d(b["StartDate"]),
         "ticketsTotal": num(b["TicketsTotal"], config["ticketsTotal"]),
         "maxOpportunities": num(b["MaxOpportunities"], config["maxOpportunities"]),
         "price": config["bundlePrice"]}
        for b in rows(wb, "Bundles")
    ]
    sessions = sorted(({"date": d(s["Date"]), "notes": str(s["Notes"] or "")} for s in rows(wb, "Sessions")),
                      key=lambda s: s["date"])
    attendance = [
        {"id": str(a["AttendanceID"]), "date": d(a["Date"]), "customerId": str(a["CustomerID"]),
         "type": a["Type"] or "Bundle", "bundleId": str(a["BundleID"]) if a["BundleID"] else None,
         "ts": ts(a["DeviceTimestamp"]), "manual": False,
         "price": config["singlePrice"] if a["Type"] == "Single" else 0}
        for a in rows(wb, "Attendance")
    ]
    data = {
        "schema": 1, "customers": customers, "bundles": bundles, "sessions": sessions,
        "attendance": attendance, "config": config,
        "meta": {"lastBackup": None, "createdAt": datetime.now(timezone.utc).isoformat(),
                 "importedFrom": "AppSheet sheet", "importedAt": datetime.now(timezone.utc).isoformat()},
    }
    payload = {"app": "body-making", "schema": 1, "exportedAt": data["meta"]["importedAt"], "data": data}
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    print(f"customers {len(customers)}  bundles {len(bundles)}  classes {len(sessions)}  check-ins {len(attendance)}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
