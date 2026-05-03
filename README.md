# PHS Student Portal

Not Freely Licensed: Under development by Jayaditya Buddan Ramesh and Emir Bakir, Poolesville High School Students, Sophomore and Junior, respectively. 

A student portal for Poolesville High School with three pages, embedding GradeViewer (a StudentVue grade viewer) directly into the site.

Current efforts for progress are on implementing applications that help students the most in their classes to *achieve* the grades they desire, rather than provide a vague result of efforts that any provider can do. 

By doing this, we hope to help students with the most challenging classes. Of course, new classes are added every new year, and we cannot add them all, but our focus is on implementing the most difficult classes, and difficult is a perspective that is built and defined rather than a preset to classes. 

## Live URLs
- PHS Site → GitHub Pages
- GradeViewer App → Firebase (`schedulephs.web.app`)

## Pages
- `announcements.html` — school announcements
- `index.html` — bell schedule
- `grademelon.html` — grades page with embedded GradeMelon

## What's Inside

### PHS Site
- GradeMelon embedded via iframe pointing to `schedulephs.web.app/login`
- iframe auto-resizes to fill available height, fully transparent background
- Grades nav link added across all three pages
- PHS logo, glassmorphism design, ambient orb background
- Footer: © Jayaditya & Emir / Poolesville High School

### GradeMelon (`schedulephs.web.app`)
The embedded grade viewer is a separate Next.js app deployed to Firebase. Changes made this session:

**Bug Fixes**
- Grades/Attendance stuck loading — missing `.catch()` never called `setLoading(false)`
- letterGrade crash — null check moved before property access
- Remember me JSON crash — `/api/encryptPassword` returns HTML on static Firebase; wrapped in try/catch with fallback
- Purple background leaking into iframe — fixed with `html.embedded { background: transparent }`

**UI / Theme**
- Login page: full glass redesign — frosted card, inset-shadow inputs, purple gradient button, collab logos (GradeMelon × PHS), autofill fix
- District modal: replaced Flowbite Modal with custom glass sheet, fullscreen blurred backdrop, custom dropdown
- FAQ accordions: converted to glass-panel style
- GPA modal: glass override replacing Flowbite dark gray
- Toast notifications: custom glass toasts, slide-in animation, positioned bottom-right

**Dropdowns**
- Gradebook period selector and Schedule term selector both replaced with custom glass dropdowns (eliminates OS blue highlight)

**Attendance Chart**
- All-purple color palette (lavender → light purple → deep violet → darkest violet)
- Boxy segments with rounded cap only on topmost bar via custom Chart.js plugin
- Axis/legend text updated to white for dark theme

