import re
import json

with open('data/ocr_raw.txt', 'r') as f:
    lines = f.read().split('\n')

with open('data/schedule.json', 'r') as f:
    schedule = json.load(f)

# Heuristic: the time appears *shortly after* a day of the week, 
# and both appear after a course header.
# Let's iterate through lines and try to construct a state machine.

current_course = None
for i, line in enumerate(lines):
    # Detect course change
    m = re.search(r'(MA-INF \d{4})', line)
    if m:
        current_course = m.group(1)
        continue
    
    if current_course and current_course in schedule:
        # Check if this course currently has TBD
        events = schedule[current_course]["events"]
        if events and events[0]["time"] == "TBD":
            # Looking for a day
            day_match = re.search(r'\b(Mon|Tue|Wed|Thu|Fri)\b', line)
            
            # Looking for time
            time_match = re.search(r'[0-9]{1,2}:[0-9]{2} [AP]M - [0-9]{1,2}:[0-9]{2} [AP]M( c\.t\.| s\.t\.)?', line)
            
            if day_match:
                events[0]["day"] = day_match.group(1)
            
            if time_match:
                events[0]["time"] = time_match.group(0)

# Write back
with open('data/schedule.json', 'w') as f:
    json.dump(schedule, f, indent=2)

print("Updated times and days intuitively from OCR text.")
