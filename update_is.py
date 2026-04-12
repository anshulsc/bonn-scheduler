import json

offered_is_courses = {
    'MA-INF 4330', 'MA-INF 4114', 'MA-INF 4116', 'MA-INF 4201', 'MA-INF 4208', 
    'MA-INF 4209', 'MA-INF 4211', 'MA-INF 4213', 'MA-INF 4214', 'MA-INF 4215', 
    'MA-INF 4216', 'MA-INF 4217', 'MA-INF 4226', 'MA-INF 4232', 'MA-INF 4235', 
    'MA-INF 4237', 'MA-INF 4241', 'MA-INF 4242', 'MA-INF 4243', 'MA-INF 4244', 
    'MA-INF 4304', 'MA-INF 4306', 'MA-INF 4308', 'MA-INF 4325', 'MA-INF 4329'
}

new_schedule = {
    'MA-INF 4330': {'title': 'MA-INF 4330 - Lab Explainable AI and Applications', 'events': [{'type': 'Lab', 'day': 'Fri', 'time': '2:00 PM - 4:00 PM c.t.', 'room': '0.108, Friedrich-Hirzebruch-Allee 6-8'}]},
    'MA-INF 4114': {'title': 'MA-INF 4114 - Robot Learning', 'events': [{'type': 'Lecture', 'day': 'Tue', 'time': '2:00 PM - 4:00 PM c.t.', 'room': 'Hörsaal 7, Friedrich-Hirzebruch-Allee 5'}]},
    'MA-INF 4116': {'title': 'MA-INF 4116 - Seminar AI Safety', 'events': [{'type': 'Seminar', 'day': 'Wed', 'time': '2:00 PM - 4:00 PM c.t.', 'room': 'TBD'}]},
    'MA-INF 4201': {'title': 'MA-INF 4201 - Artificial Life', 'events': [{'type': 'Lecture', 'day': 'Mon', 'time': '2:00 PM - 4:00 PM c.t.', 'room': 'Hörsaal 2, Friedrich-Hirzebruch-Allee 5'}]},
    'MA-INF 4208': {'title': 'MA-INF 4208 - Seminar Vision Systems', 'events': []},
    'MA-INF 4209': {'title': 'MA-INF 4209 - Seminar Principles of Data Mining', 'events': [{'type': 'Seminar', 'day': 'Wed', 'time': '2:00 PM - 4:00 PM c.t.', 'room': 'Seminarraum 2.025'}]},
    'MA-INF 4211': {'title': 'MA-INF 4211 - Seminar Cognitive Robotics', 'events': []},
    'MA-INF 4213': {'title': 'MA-INF 4213 - Seminar Humanoid Robots', 'events': []},
    'MA-INF 4214': {'title': 'MA-INF 4214 - Lab Humanoid Robots', 'events': []},
    'MA-INF 4215': {'title': 'MA-INF 4215 - Humanoid Robotics', 'events': [{'type': 'Lecture', 'day': 'Thu', 'time': '8:00 AM - 10:00 AM s.t.', 'room': 'Hörsaal 7, Friedrich-Hirzebruch-Allee 5'}]},
    'MA-INF 4216': {'title': 'MA-INF 4216 - Biomedical Data Science & AI', 'events': [
        {'type': 'Lecture', 'day': 'Mon', 'time': '9:00 AM - 10:30 AM s.t.', 'room': '0.109, Informatik'},
        {'type': 'Exercise', 'day': 'Wed', 'time': '10:00 AM - 12:00 PM s.t.', 'room': 'TBD'}
    ]},
    'MA-INF 4217': {'title': 'MA-INF 4217 - Seminar Machine Learning Methods in the Life Sciences', 'events': [{'type': 'Seminar', 'day': 'Tue', 'time': '9:00 AM - 10:30 AM s.t.', 'room': '0.107, Friedrich-Hirzebruch-Allee 6-8'}]},
    'MA-INF 4226': {'title': 'MA-INF 4226 - Lab Parallel Computing for Mobile Robotics', 'events': []},
    'MA-INF 4232': {'title': 'MA-INF 4232 - Lab Information Retrieval in Practice', 'events': [{'type': 'Lab', 'day': 'Tue', 'time': '10:00 AM - 1:00 PM s.t.', 'room': 'Seminarraum 1.047, Informatik III'}]},
    'MA-INF 4235': {'title': 'MA-INF 4235 - Reinforcement Learning', 'events': [
        {'type': 'Lecture', 'day': 'Mon', 'time': '12:00 PM - 2:00 PM c.t.', 'room': 'Hörsaal IV, Meckenheimer Allee 176'},
        {'type': 'Exercise', 'day': 'Fri', 'time': '2:00 PM - 4:00 PM c.t.', 'room': 'Hörsaal IV, Meckenheimer Allee 176'}
    ]},
    'MA-INF 4237': {'title': 'MA-INF 4237 - Lab Natural Language Processing', 'events': [{'type': 'Lab', 'day': 'Wed', 'time': '4:00 PM - 6:00 PM c.t.', 'room': 'TBD'}]},
    'MA-INF 4241': {'title': 'MA-INF 4241 - Lab Cognitive Modelling of Biological Agents', 'events': [{'type': 'Lab', 'day': 'Thu', 'time': '10:00 AM - 1:00 PM s.t.', 'room': 'TBD'}]},
    'MA-INF 4242': {'title': 'MA-INF 4242 - Self-supervised Learning', 'events': [
        {'type': 'Lecture', 'day': 'Fri', 'time': '2:00 PM - 4:00 PM c.t.', 'room': 'Hörsaal 4, Friedrich-Hirzebruch-Allee 5'},
        {'type': 'Exercise', 'day': 'Mon', 'time': '4:00 PM - 6:00 PM c.t.', 'room': 'Hörsaal 2, Friedrich-Hirzebruch-Allee 5'}
    ]},
    'MA-INF 4243': {'title': 'MA-INF 4243 - Mining Media Data II', 'events': [
        {'type': 'Lecture', 'day': 'Thu', 'time': '2:00 PM - 4:00 PM c.t.', 'room': '0.107, Friedrich-Hirzebruch-Allee 6-8'},
        {'type': 'Exercise', 'day': 'Thu', 'time': '12:00 PM - 2:00 PM c.t.', 'room': '0.107, Friedrich-Hirzebruch-Allee 6-8'}
    ]},
    'MA-INF 4244': {'title': 'MA-INF 4244 - Lab Deep Learning for the Physical Sciences', 'events': [{'type': 'Lab', 'day': 'Wed', 'time': '10:00 AM - 12:00 PM c.t.', 'room': 'Seminarraum 3.035b'}]},
    'MA-INF 4304': {'title': 'MA-INF 4304 - Lab Cognitive Robotics', 'events': []},
    'MA-INF 4306': {'title': 'MA-INF 4306 - Lab Development and Application of Data Mining', 'events': []},
    'MA-INF 4308': {'title': 'MA-INF 4308 - Lab Vision Systems', 'events': []},
    'MA-INF 4325': {'title': 'MA-INF 4325 - Lab Data Science in Practice', 'events': [{'type': 'Lab', 'day': 'Mon', 'time': '10:00 AM - 1:00 PM s.t.', 'room': 'Seminarraum 1.047'}]},
    'MA-INF 4329': {'title': 'MA-INF 4329 - Seminar Biological Intelligence', 'events': []}
}

# 1. Update summer2026_complete.json
with open('data/summer2026_complete.json') as f:
    complete = json.load(f)

for c in complete['courses']:
    code = c.get('code', '')
    if code.startswith('MA-INF 4'):
        # Only mark as True if it's in our exact list
        c['offeredSummer2026'] = (code in offered_is_courses)

with open('data/summer2026_complete.json', 'w', encoding='utf-8') as f:
    json.dump(complete, f, indent=2, ensure_ascii=False)

# 2. Update schedule.json
with open('data/schedule.json') as f:
    schedule = json.load(f)

# Remove any MA-INF 4xxx that are NOT in our list
to_remove = []
for k in schedule.keys():
    if k.startswith('MA-INF 4') and k not in offered_is_courses:
        to_remove.append(k)
for k in to_remove:
    del schedule[k]

# Add new / overwrite schedule JSON
for k, v in new_schedule.items():
    schedule[k] = v

with open('data/schedule.json', 'w', encoding='utf-8') as f:
    json.dump(schedule, f, indent=2, ensure_ascii=False)

print("done")
