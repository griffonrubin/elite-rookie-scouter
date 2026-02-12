# Elite Rookie Scouter

An AI-powered dynasty fantasy football rookie scouting agent for the 2026 NFL Draft.

## Features

- 🔍 **Daily Internet Scanning**: Automatically scans RSS feeds from FantasyPros, RotoWire, and NFL.com
- 📊 **Real-Time Rankings**: Top 2026 prospects ranked by scout grade
- 📈 **Stock Tracker**: Monitor rising and falling prospects
- 📰 **News Aggregation**: Latest news on your favorite prospects
- 🎯 **Scout Reports**: Detailed analysis with strengths, concerns, and NFL comparisons
- 🌐 **Sleeper Integration**: Cross-reference with Sleeper API data

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

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

## Usage

1. **View Rankings**: The homepage displays the top 2026 prospects
2. **Scan for News**: Click "Scan Now" to fetch the latest news from RSS feeds
3. **Prospect Details**: Click any prospect to view their detailed scout report
4. **Track Stock**: Monitor which prospects are rising or falling

## Tech Stack

- **Framework**: Next.js 14 with TypeScript
- **Styling**: Vanilla CSS with CSS Modules
- **Data Sources**: 
  - RSS feeds (FantasyPros, RotoWire, NFL.com)
  - Sleeper API
  - Curated seed database of 2026 prospects

## Project Structure

```
├── app/
│   ├── api/scan/          # API route for triggering scans
│   ├── prospects/[id]/    # Prospect detail pages
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Dashboard
├── lib/
│   ├── scout/
│   │   ├── agent.ts       # Scout Agent brain
│   │   └── seed_data.ts   # 2026 prospect database
│   └── data/
│       ├── rss_scanner.ts # RSS feed scanner
│       └── sleeper.ts     # Sleeper API connector
├── types/
│   └── scout.ts           # TypeScript interfaces
└── styles/
    └── theme.css          # Design system
```

## License

MIT
