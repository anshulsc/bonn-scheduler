# 🎓 MSc Informatik – Full Degree Planning System (HTML-Based)

## 🎯 Goal

Build a **simple but powerful website** that helps the student:

* Plan ALL semesters (not just one)
* Understand every course deeply
* Track prerequisites and dependencies
* Align courses with research + PhD goals
* Make long-term strategic decisions

---

# 🧠 Core Idea

This is NOT:

❌ “Pick courses for this semester”

This IS:

✅ “Design my entire MSc for maximum research impact”

---

# 🧱 Website Structure (Single Page, Sections)

```id="3y0l2y"
--------------------------------------
| Header                             |
--------------------------------------
| Filters + Search                   |
--------------------------------------
| Course Explorer (All Courses)      |
--------------------------------------
| Course Details (Popup)             |
--------------------------------------
| Degree Roadmap (All Semesters)     |
--------------------------------------
| Strategy Insights                  |
--------------------------------------
```

---

# 🏠 1. Header

* Title: **MSc Informatik Degree Planner**
* Subtitle: *University of Bonn*
* Small status:

  * Selected ECTS
  * Current focus: ML / NLP (dynamic)

---

# 🔍 2. Filters & Search

### Filters:

* Area: ML / NLP / Systems / Vision / Robotics
* Difficulty: Easy / Medium / Hard
* Semester: Summer / Winter
* Research Value: Low → High

---

# 📚 3. Course Explorer (MAIN)

## Grid of Course Cards

Each card shows:

* Course Name
* ECTS
* Tags (ML, NLP, etc.)
* Difficulty
* Workload
* ⭐ Research Value

---

### Quick Insight (VERY IMPORTANT)

Each card must include:

* 🧠 “What you learn” (1–2 lines)
* 🎯 “Best for: NLP / ML / Systems”

---

### Buttons:

* View Details
* Add to Roadmap

---

# 📖 4. Course Detail (Popup)

---

## 📌 Overview

* Course name
* ECTS
* Semester offered
* Frequency (important!)

---

## 📚 What You Learn

* Detailed bullet topics

---

## 🛠 Skills

* Practical + theoretical

---

## 📊 Difficulty & Workload

* Honest evaluation

---

## 📋 Prerequisites

* Required knowledge
* Strictness

---

## 🔗 Unlocks (VERY IMPORTANT)

* Courses this enables
* Labs you can enter

---

## 🎯 Research Relevance

* NLP / ML / Vision / Robotics

---

## 👨‍🏫 Professor & Lab

* Professor name
* Research area
* Lab/group

Explain:

* Is this useful for:

  * HiWi job?
  * Thesis?

---

## 🌐 Resources

* Course page
* Lecture notes

---

## 🧠 Strategic Advice

* Take in Semester 1 / Later
* Why

---

# 🗺️ 5. DEGREE ROADMAP (MOST IMPORTANT SECTION)

---

## Layout:

```id="bdgw4g"
Semester 1 (Summer 2026)
[Course] [Course]

Semester 2 (Winter 2026)
[Course] [Course]

Semester 3
[Course] [Course]

Semester 4
[Thesis]
```

---

## Features:

### Drag & Drop Courses into Semesters

---

## Show for each semester:

* Total ECTS
* Difficulty level
* Warnings

---

## Smart Warnings:

* ❌ Missing prerequisites
* ⚠️ Too many hard courses
* ⚠️ Bad sequencing

---

# 🧠 6. Strategy Insights Panel

This is what makes it powerful.

---

## Show:

### 🎯 Recommendations

* “Take Linear Algebra before RL”
* “Take X to enter NLP Lab”

---

### ⚠️ Risks

* “You are delaying core ML too much”
* “Too many easy courses (low value)”

---

### 🚀 Opportunities

* “This course connects to Professor X’s lab”
* “Good for thesis direction”

---

# 🌐 Data Enrichment (MANDATORY)

For EACH course:

You MUST:

* Search online
* Find:

  * Course page
  * Professor page
  * Lab page

---

## Add:

* Professor research area
* Lab relevance
* Course importance for research

---

# ⚙️ Data Storage

```id="bb9n9t"
/data/courses.json
/data/roadmap.json
```

---

# 🎨 UI Design

* Clean cards
* Minimal colors
* Smooth hover effects
* Modal popup for details

---

# 🚀 Final User Flow

User should:

1. Open website
2. Explore courses
3. Understand each quickly
4. Add to roadmap
5. See warnings
6. Adjust plan
7. Build full MSc strategy

---

# 🧠 Final Goal

Help student:

✅ Plan ALL semesters strategically
✅ Enter research labs early
✅ Build strong PhD profile
✅ Avoid bad decisions

---

# ⚠️ Critical Rule

Always prioritize:

* Strong fundamentals
* Research exposure
* Long-term value

NOT:

* Easy grades
* Short-term comfort
