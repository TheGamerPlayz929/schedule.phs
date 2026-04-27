# PHS Student Portal 

A student portal for Poolesville High School with three pages, embedding GradeMelon (a StudentVue grade viewer) directly into the site.

## Live URLs
- PHS Site → GitHub Pages
- GradeMelon App → Firebase (`schedulephs.web.app`)

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

