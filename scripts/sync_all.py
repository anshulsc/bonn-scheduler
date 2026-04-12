import re
import json
import copy

with open('data/ocr_raw.txt', 'r') as f:
    text = f.read()

# Extract all MA-INF codes mentioned in OCR
codes = set(re.findall(r'MA-INF \d{4}', text))
print(f"Found {len(codes)} unique courses in OCR.")

# Load existing JSONs
with open('data/all_courses_raw.json', 'r') as f:
    raw_courses = json.load(f)

with open('data/courses.json', 'r') as f:
    courses = json.load(f)

with open('data/schedule.json', 'r') as f:
    schedule = json.load(f)

existing_codes = set(c['code'] for c in courses)
raw_code_map = {}
for c in raw_courses:
    if 'code' in c:
        raw_code_map[c['code']] = c
    elif c.get('id'):
        raw_code_map[c['id'].replace('-', ' ')] = c

added_count = 0
for code in codes:
    if code not in existing_codes:
        if code in raw_code_map:
            raw = raw_code_map[code]
            new_course = {
                "id": raw.get("id", code.replace(' ', '-')),
                "name": raw["name"],
                "code": code,
                "area": raw["area"],
                "areaShort": "".join([word[0] for word in raw["area"].split() if word[0].isupper()]),
                "type": "Lab" if "Lab" in raw["name"] else ("Seminar" if "Seminar" in raw["name"] else "Lecture"),
                "ects": raw.get("ects", 6),
                "semester": "Unknown",
                "frequency": "Unknown",
                "difficulty": "Unknown",
                "researchValue": 3,
                "professor": "TBD",
                "lab": "N/A",
                "tags": [],
                "whatYouLearn": raw["name"],
                "bestFor": raw["area"],
                "contents": raw["name"],
                "prerequisites": { "required": [], "recommended": [] },
                "unlocks": [],
                "examType": "TBD",
                "workloadHours": 180,
                "professorResearch": "",
                "hiwiPotential": "Unknown",
                "thesisPotential": "Unknown",
                "strategicAdvice": "Course offered in Summer 2026."
            }
            # Infer better professor if possible from OCR context where this code appears
            courses.append(new_course)
            added_count += 1
            existing_codes.add(code)

print(f"Added {added_count} courses to courses.json.")

# Ensure they are in schedule.json
sched_added = 0
for code in codes:
    if code not in schedule:
        # Find its name
        c_name = raw_code_map.get(code, {}).get("name", code)
        schedule[code] = {
            "title": f"{code} - {c_name}",
            "events": [
                {
                    "type": "TBD",
                    "day": "By arrangement",
                    "time": "TBD",
                    "start_date": "Summer 2026",
                    "end_date": "Summer 2026",
                    "lecturers": ["TBD"],
                    "room": "See BASIS"
                }
            ]
        }
        sched_added += 1

print(f"Added {sched_added} to schedule.json")

with open('data/courses.json', 'w') as f:
    json.dump(courses, f, indent=2)

with open('data/schedule.json', 'w') as f:
    json.dump(schedule, f, indent=2)

