# Lemma Education

**The AI that listens to you.**

Lemma is an educational platform that captures the complete picture of a student's thought process through voice reasoning and digital handwriting, providing real-time feedback that targets misconceptions in logic.

## Features

- **Voice Reasoning** - Verbalize your thinking while solving problems
- **Digital Handwriting** - Capture your work naturally
- **Real-time Feedback** - Get targeted guidance on misconceptions
- **Interactive Demo** - Experience the difference with our live demo

## Tech Stack

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Canvas API** - Animated background effects

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the site.

### Build

```bash
# Create production build
npm run build

# Start production server
npm start
```

### Waitlist Schema

The homepage waitlist now collects more than just an email address. New signups can store:

- email
- role selection
- custom role / background
- goals or feedback
- willingness to pay

If you are setting up a fresh environment or updating an older database schema, run:

```bash
npm run migrate:waitlist
```

This updates the `public.waitlist_signups` table with the extra waitlist fields used by the local form and API.

## Project Structure

```
├── app/
│   ├── globals.css      # Global styles and animations
│   ├── layout.tsx       # Root layout
│   └── page.tsx         # Home page
├── components/
│   ├── CanvasBackground.tsx  # Animated background
│   └── DemoSection.tsx      # Interactive demo
├── docs/
│   ├── IMPLEMENTATION_SUMMARY.md
│   ├── PROJECT_DOCUMENTATION.md
│   ├── PROJECT_REPORT.md
│   ├── TUTOR_DOCUMENTATION.md
│   ├── canvasAI.md
│   ├── realtime_streaming.md
│   └── testing_strategy.md
├── scripts/
│   └── migrate-waitlist-schema.mjs  # Updates waitlist DB columns
└── public/              # Static assets
```

## Team

- [Shayan Ahmad](https://www.linkedin.com/in/shayanahmad7/)
- [Myra Rafiq](https://www.linkedin.com/in/myrarafiq/)
- [Vlera Mehani](https://www.linkedin.com/in/vlera-mehani-a11a56178/)
- [Daniar Zhylangozov](https://www.linkedin.com/in/daniar-zhylangozov/)

## License

© 2026 Lemma Education.
