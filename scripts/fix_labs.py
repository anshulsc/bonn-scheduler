import json

with open('data/courses.json', 'r') as f:
    courses = json.load(f)

for c in courses:
    if c['lab'] == 'N/A' or c['professor'] == 'TBD':
        # Simple heuristic
        if c['areaShort'] == 'IS':
            c['lab'] = 'Intelligent Systems (General)'
        elif c['areaShort'] == 'GVA':
            c['lab'] = 'Graphics, Vision, Audio (General)'
        elif c['areaShort'] == 'AL':
            c['lab'] = 'Algorithmics (General)'
        elif c['areaShort'] == 'ICM':
            c['lab'] = 'ICM (General)'
        else:
            c['lab'] = 'University of Bonn'
        if c['professor'] == 'TBD':
            c['professor'] = 'See BASIS'

with open('data/courses.json', 'w') as f:
    json.dump(courses, f, indent=2)

print("Updated N/A labs.")
