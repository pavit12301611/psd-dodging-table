# ⚡ DodgeTables — Random Dodging Table Practice

A fast, clean web app for students to practice **dodging tables** (multiplication tables in random order).

## Features

- **Fully random questions** from configurable table ranges (every combination possible)
- **Tables strictly 2–10** — koi bhi table 10 se aage kabhi nahi aayega
- **Multiple learning styles** — typed answers, MCQs, answer matching, missing-number questions, or a variety mix
- **Learn Tables section** — expandable reference cards for every table from 2 through 10
- **Adjustable difficulty** — Easy (2–5), Medium (2–10), Hard (6–10), or custom ranges within 2–10
- **Customizable tests** — number of questions (5–100), timer mode (none / total / per-question), question order, × only or mixed × and ÷
- **Full in-site report** after submitting — score, accuracy, grade (S/A/B/C/D/E), total & average time, fastest answer, best streak, per-question breakdown, and weak-spot analysis
- **Retry wrong questions** with one click
- **Attempt history** saved locally with grades
- Sound effects + confetti for high scores 🎉

## Run it

It's a plain static site — just serve the folder:

```bash
python3 -m http.server 3000
```

Then open `http://localhost:3000`.

## Files

| File | Purpose |
|------|---------|
| `index.html` | App structure (setup / quiz / report screens) |
| `styles.css` | Dark glass UI theme |
| `app.js` | Quiz engine, timers, report generation, history |
