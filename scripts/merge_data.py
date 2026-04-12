#!/usr/bin/env python3
"""
Merge handbook parsed data + schedule/BASIS data into the final comprehensive database.
"""
import json

with open('data/handbook_parsed.json', 'r') as f:
    handbook = json.load(f)

with open('data/summer2026_complete.json', 'r') as f:
    basis = json.load(f)

# Build schedule map from basis data
schedule_map = {}
for c in basis['courses']:
    schedule_map[c['id']] = c.get('schedule', [])

# Build professor map from basis data  
prof_map = {}
for c in basis['courses']:
    prof_map[c['id']] = c.get('professor', '')

# Build basis ID map
basis_id_map = {}
for c in basis['courses']:
    basis_id_map[c['id']] = c.get('basisId', '')

# Merge: handbook is the source of truth for content, basis is source for schedule
final_courses = []
seen_ids = set()

for cid, hb in handbook.items():
    course = {
        'id': cid,
        'code': hb['code'],
        'name': hb['name'],
        'track': hb['track'],
        'type': hb['type'],
        'ects': hb['ects'],
        'workload': hb['workload'],
        'frequency': hb['frequency'],
        'professor': prof_map.get(cid, hb.get('professor', '')),
        'coordinator': hb.get('coordinator', ''),
        'semester': hb.get('semester', ''),
        'language': hb.get('language', 'English'),
        'learningGoals': hb.get('learningGoals', {}),
        'contents': hb.get('contents', ''),
        'prerequisites': hb.get('prerequisites', ''),
        'examType': hb.get('examType', ''),
        'literature': hb.get('literature', []),
        'schedule': schedule_map.get(cid, []),
        'basisId': basis_id_map.get(cid, ''),
        'offeredSummer2026': cid in schedule_map or cid in [c['id'] for c in basis['courses']]
    }
    # If professor from handbook is more descriptive, keep it
    if not course['professor'] or course['professor'] == 'See BASIS':
        course['professor'] = hb.get('professor', hb.get('coordinator', 'See BASIS'))
    
    final_courses.append(course)
    seen_ids.add(cid)

# Add any basis courses not in handbook
for c in basis['courses']:
    if c['id'] not in seen_ids:
        course = {
            'id': c['id'],
            'code': c['code'],
            'name': c['name'],
            'track': c['track'],
            'type': c['type'],
            'ects': c['ects'],
            'workload': c['ects'] * 30,
            'frequency': c.get('frequency', ''),
            'professor': c.get('professor', ''),
            'coordinator': '',
            'semester': '',
            'language': c.get('language', 'English'),
            'learningGoals': {'technical': '', 'soft': ''},
            'contents': '',
            'prerequisites': '',
            'examType': '',
            'literature': [],
            'schedule': c.get('schedule', []),
            'basisId': c.get('basisId', ''),
            'offeredSummer2026': True
        }
        final_courses.append(course)
        seen_ids.add(c['id'])

# Sort by code
final_courses.sort(key=lambda x: x['code'])

# Build final DB
final_db = {
    'semester': 'Summer 2026',
    'university': 'University of Bonn',
    'tracks': basis['tracks'],
    'courses': final_courses,
    'professors': basis['professors']
}

print(f"Final database: {len(final_courses)} courses")
# Count by track
track_counts = {}
for c in final_courses:
    track_counts[c['track']] = track_counts.get(c['track'], 0) + 1
for t, count in sorted(track_counts.items()):
    print(f"  {t}: {count}")

offered = sum(1 for c in final_courses if c['offeredSummer2026'])
print(f"  Offered Summer 2026: {offered}")
with_contents = sum(1 for c in final_courses if c['contents'])
print(f"  With syllabus/contents: {with_contents}")

with open('data/summer2026_complete.json', 'w') as f:
    json.dump(final_db, f, indent=2, ensure_ascii=False)

print("Saved final database to data/summer2026_complete.json")
