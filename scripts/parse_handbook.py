#!/usr/bin/env python3
"""
Parse the full module handbook and extract detailed course information
for ALL courses across all 4 tracks.
"""
import re
import json

with open('resources/module_handbook_text.txt', 'r') as f:
    text = f.read()

# Split into pages
pages = text.split('--- PAGE ')
pages = [p for p in pages if p.strip()]

# We'll parse course blocks. Each course starts with "MA-INF XXXX CourseName"
# followed by structured fields.

# First, let's identify all course blocks
# A course block starts after a page header line like "Master Computer Science — Universität Bonn XX"
# followed by "MA-INF XXXX CourseName"

course_pattern = re.compile(
    r'MA-INF\s+(\d{4})\s+(.+?)(?=\nWorkload)',
    re.DOTALL
)

# Let's parse the entire text as one blob
courses = {}
current_area = None

# Track areas by page ranges
# 1 Algorithmics: pages 2-42ish
# 2 Graphics, Vision, Audio: pages 43-83ish  
# 3 Information and Communication Management: pages 84-110ish
# 4 Intelligent Systems: pages 111-167ish

# Better approach: split by "MA-INF XXXX" course headers
# Each course entry starts after the page header

# Split the full text into course blocks
blocks = re.split(r'(?=MA-INF\s+\d{4}\s+[A-Z])', text)

for block in blocks:
    # Try to find the course code and name
    header_match = re.match(r'MA-INF\s+(\d{4})\s+(.+?)(?:\n|$)', block)
    if not header_match:
        continue
    
    code_num = header_match.group(1)
    code = f"MA-INF {code_num}"
    raw_name = header_match.group(2).strip()
    
    # Skip table of contents entries (they have .... or just code references)
    if '...' in raw_name or len(raw_name) < 4:
        continue
    # Skip entries that are just format codes like "L4E2 9 CP"
    if re.match(r'^[LS]\d', raw_name):
        continue
    
    # Determine track from code
    area_num = int(code_num[0])
    track_map = {1: 'AL', 2: 'GVA', 3: 'ICM', 4: 'IS'}
    track = track_map.get(area_num, 'Unknown')
    
    # Extract fields from block
    def extract_field(field_name, text_block):
        pattern = re.compile(rf'{field_name}\s*\n(.+?)(?=\n[A-Z][a-z]+ [a-z]+[:\n]|\n---|\Z)', re.DOTALL)
        m = pattern.search(text_block)
        if m:
            return m.group(1).strip()
        return ''
    
    # Extract credit points
    cp_match = re.search(r'Credit points\s*\n\s*(\d+)\s*CP', block)
    ects = int(cp_match.group(1)) if cp_match else 0
    
    # Extract workload
    workload_match = re.search(r'Workload\s*\n\s*(\d+)\s*h', block)
    workload = int(workload_match.group(1)) if workload_match else 0
    
    # Extract frequency
    freq_match = re.search(r'Frequency\s*\n\s*(.+?)(?:\n|$)', block)
    frequency = freq_match.group(1).strip() if freq_match else ''
    
    # Extract coordinator
    coord_match = re.search(r'Module coordinator\s*\n\s*(.+?)(?:Lecturer|$)', block, re.DOTALL)
    coordinator = coord_match.group(1).strip() if coord_match else ''
    
    # Extract lecturer
    lect_match = re.search(r'Lecturer\(s\)\s*\n\s*(.+?)(?:\nProgramme|\n[A-Z])', block, re.DOTALL)
    lecturer = lect_match.group(1).strip() if lect_match else coordinator
    
    # Extract semester
    sem_match = re.search(r'Semester\s*\n\s*(.+?)(?:\n|$)', block)
    semester = sem_match.group(1).strip() if sem_match else ''
    
    # Extract learning goals
    tech_match = re.search(r'Learning goals: technical skills\s*\n(.+?)(?=Learning goals: soft|Contents|Prerequisites)', block, re.DOTALL)
    tech_skills = tech_match.group(1).strip() if tech_match else ''
    
    soft_match = re.search(r'Learning goals: soft skills\s*\n(.+?)(?=Contents|Prerequisites)', block, re.DOTALL)
    soft_skills = soft_match.group(1).strip() if soft_match else ''
    
    # Extract contents
    contents_match = re.search(r'Contents\s*\n(.+?)(?=Prerequisites|Course meetings)', block, re.DOTALL)
    contents = contents_match.group(1).strip() if contents_match else ''
    
    # Extract prerequisites
    prereq_match = re.search(r'Prerequisites\s*\n(.+?)(?=Course meetings|Teaching format)', block, re.DOTALL)
    prerequisites = prereq_match.group(1).strip() if prereq_match else ''
    
    # Extract exam type
    exam_match = re.search(r'Graded exams\s*\n(.+?)(?=Ungraded|Forms|Literature|\n---)', block, re.DOTALL)
    exam_type = exam_match.group(1).strip() if exam_match else ''
    
    # Extract literature
    lit_match = re.search(r'Literature\s*\n(.+?)(?=\n---|\Z)', block, re.DOTALL)
    literature = lit_match.group(1).strip() if lit_match else ''
    # Clean literature: extract book titles
    lit_items = re.findall(r'•\s*(.+?)(?=\n•|\n---|\Z)', literature, re.DOTALL)
    lit_items = [l.strip().replace('\n', ' ') for l in lit_items]
    
    # Determine type
    course_type = 'Lecture'
    if 'seminar' in raw_name.lower() or 'Sem' in block[:50]:
        course_type = 'Seminar'
    elif 'lab' in raw_name.lower() or 'Lab' in block[:50]:
        course_type = 'Lab'
    
    # Clean the name (remove duplicates from OCR artifacts)
    name = raw_name.split('\n')[0].strip()
    # Sometimes the name includes extra info, clean it
    name = re.sub(r'\s+', ' ', name)
    
    course_id = f"MA-INF-{code_num}"
    
    if course_id not in courses or len(contents) > len(courses.get(course_id, {}).get('contents', '')):
        courses[course_id] = {
            'id': course_id,
            'code': code,
            'name': name,
            'track': track,
            'type': course_type,
            'ects': ects,
            'workload': workload,
            'frequency': frequency,
            'professor': lecturer if lecturer else coordinator,
            'coordinator': coordinator,
            'semester': semester,
            'learningGoals': {
                'technical': tech_skills,
                'soft': soft_skills
            },
            'contents': contents,
            'prerequisites': prerequisites,
            'examType': exam_type,
            'literature': lit_items,
            'language': 'English'  # Default, most are English
        }

print(f"Parsed {len(courses)} unique courses from the handbook.")

# Count by track
track_counts = {}
for c in courses.values():
    track_counts[c['track']] = track_counts.get(c['track'], 0) + 1
for t, count in sorted(track_counts.items()):
    print(f"  {t}: {count} courses")

# Save
with open('data/handbook_parsed.json', 'w') as f:
    json.dump(courses, f, indent=2, ensure_ascii=False)

print("Saved to data/handbook_parsed.json")
