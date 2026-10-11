#!/usr/bin/env python3
"""Build data/winter2027_complete.json — the Winter 2026/27 dataset.

Sources:
  data/summer2026_complete.json  handbook metadata + professor roster (PO 2023)
  data/winter2027_basis_raw.json  live BASIS scrape of Wintersemester 2026/27
  data/enrich_*.json              researched metadata for 11 newly-listed modules
  data/profweb_*.json             verified professor websites + teaching listings
"""

import json
import re
from glob import glob

ROOT = __file__.rsplit("/", 2)[0]


def load(p):
    with open(f"{ROOT}/{p}") as f:
        return json.load(f)


old = load("data/summer2026_complete.json")
basis = load("data/winter2027_basis_raw.json")

CODE_RE = re.compile(r"(MA-INF)\s?(\d{3,4})")

def norm_code(c):
    code = c.get("code")
    if not code:
        m = CODE_RE.search(c.get("nodeText") or "")
        code = f"MA-INF {m.group(2)}" if m else None
    return code

# BASIS course lookup, normalized codes
winter_by_code = {}
for c in basis["courses"]:
    code = norm_code(c)
    if code and code.startswith("MA-INF"):
        winter_by_code[code] = c

# Enrichment lookups
enrich = {}
for p in glob(f"{ROOT}/data/enrich_*.json"):
    for e in json.load(open(p))["courses"]:
        enrich[e["code"]] = e

# Professor website updates + teaching listings
prof_updates = {}
teaching_by_code = {}
for p in glob(f"{ROOT}/data/profweb_*.json"):
    rec = json.load(open(p))
    prof_updates[rec["key"]] = rec
    for t in rec.get("teaching") or []:
        if t.get("code") and t.get("url"):
            teaching_by_code[t["code"]] = t["url"]


def norm_time(t):
    return re.sub(r"\s*-\s*", "-", t).replace(" c.t.", "").replace(" s.t.", "")


def winter_schedule(wc, course_type):
    """Normalize BASIS events; derive event type via unit ordering
    (first unit = the module's own lecture-type unit, rest are exercises)."""
    seen = set()
    out = []
    primary_unit = (wc.get("unitIds") or [None])[0]
    for ev in wc.get("events") or []:
        day, room = ev.get("day"), ev.get("room") or ""
        time = norm_time(ev.get("time") or "")
        if not day or not time:
            continue
        if course_type in ("Seminar", "Lab"):
            etype = course_type
        else:
            etype = "Lecture" if ev.get("unitId") == primary_unit else "Exercise"
        key = (day, time, etype, room)
        if key in seen:
            continue
        seen.add(key)
        out.append({"day": day, "time": time, "type": etype, "room": room})
    return out


def slug(code):
    return code.lower().replace("ma-inf ", "ma-inf-")


winter_codes = set(winter_by_code.keys())
courses = []

for oc in old["courses"]:
    c = dict(oc)
    code = c["code"]
    c["offeredCurrent"] = code in winter_codes
    c.pop("offeredSummer2026", None)
    if c["offeredCurrent"]:
        wc = winter_by_code[code]
        c["schedule"] = winter_schedule(wc, c["type"])
        if wc.get("instructors"):
            c["professor"] = ", ".join(wc["instructors"])
        if code in teaching_by_code:
            c["website"] = teaching_by_code[code]
    else:
        # Historical schedule would mislead under a Winter heading — drop it
        c["schedule"] = []
        c.pop("website", None)
    courses.append(c)

# Newly listed modules not in the handbook dataset
have = {c["code"] for c in courses}
new_codes = sorted(winter_codes - have)
for code in new_codes:
    wc = winter_by_code[code]
    e = enrich.get(code, {})
    ctype = e.get("type")
    if not ctype:
        t = (wc.get("title") or "").lower()
        ctype = "Seminar" if t.startswith("seminar") else ("Lab" if t.startswith("lab") or "praktikum" in t else "Lecture")
    courses.append({
        "id": slug(code),
        "code": code,
        "name": (e.get("name") or wc.get("title") or "").strip(),
        "track": e.get("track"),
        "type": ctype,
        "ects": e.get("ects"),
        "workload": (e.get("ects") or 0) * 30 or None,
        "frequency": "Winter semester",
        "professor": e.get("professor") or ", ".join(wc.get("instructors") or []) or None,
        "coordinator": e.get("professor"),
        "semester": None,
        "language": e.get("language") or "English",
        "learningGoals": None,
        "contents": e.get("contents") or "",
        "prerequisites": None,
        "examType": None,
        "literature": [],
        "schedule": winter_schedule(wc, ctype),
        "basisId": wc.get("detailUrlOrId"),
        "website": e.get("website") or teaching_by_code.get(code),
        "offeredCurrent": True,
        "newModule": True,
    })

# Professors: verified website updates; add new ones from enrichment
professors = dict(old["professors"])
for key, rec in prof_updates.items():
    if key in professors and rec.get("website"):
        professors[key]["website"] = rec["website"]
        if rec.get("groupSite"):
            professors[key].setdefault("groupSite", rec["groupSite"])

# Name correction verified from his Uni Bonn staff page + ORCID:
# the roster's "Benjamin Marian Kolbe" is Dr. Benedikt Kolbe.
if "benjamin-kolbe" in professors:
    professors["benjamin-kolbe"]["name"] = "Dr. Benedikt Kolbe"

# Linked courses per professor from the fresh schedule data
for key, p in professors.items():
    last = p["name"].split()[-1].lower()
    p["courses"] = [c["id"] for c in courses
                    if c.get("professor") and last in c["professor"].lower()]

# Attach course websites discovered on teaching pages
for c in courses:
    if not c.get("website") and c["code"] in teaching_by_code:
        c["website"] = teaching_by_code[c["code"]]

out = {
    "semester": "Wintersemester 2026/27",
    "semesterLabel": "Winter 2026/27",
    "scrapedAt": basis.get("scrapedAt"),
    "tracks": old["tracks"],
    "courses": courses,
    "professors": professors,
}

out_path = f"{ROOT}/data/winter2027_complete.json"
with open(out_path, "w") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

offered = [c for c in courses if c.get("offeredCurrent")]
n_sched = [c for c in offered if c["schedule"]]
print(f"total courses: {len(courses)} | offered WiSe 2026/27: {len(offered)} "
      f"| with winter schedule: {len(n_sched)} | new modules added: {len(new_codes)}")
print("new codes:", ", ".join(new_codes))
