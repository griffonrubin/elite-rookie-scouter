# Elite Rookie Scouter - 2026 Dynasty Draft

> **AI-Powered Dynasty Fantasy Football Scouting Platform**

A unified, production-ready application combining SQLite database persistence, Python + TypeScript scrapers, and an elite cyber-scout UI with glassmorphism and real-time sentiment analysis.

---

## 🚀 Features

- **📊 Database-Backed**: SQLite with comprehensive 2026 draft class data
- **🔍 Real-Time Scanning**: RSS feeds from FantasyPros, RotoWire, NFL.com, Dynasty League Football
- **🤖 AI Sentiment Analysis**: Automatic news sentiment tracking (positive/negative/neutral)
- **📈 Stock Tracking**: Rising/falling prospect indicators based on news
- **🎨 Elite UI**: Glassmorphism, neon gradients, smooth animations
- **🔌 Multi-Source Data**: Python scrapers + TypeScript RSS + Sleeper API

---

## 🏁 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.8+ (for scrapers)

### Installation

```bash
# Navigate to project
cd "c:\Users\Griffon Rubin\Desktop\Draft Tool\dynasty-scout"

# Install dependencies
npm install

# Install Python dependencies (optional)
pip install -r scrapers/requirements.txt

# Run development server
npm run dev
```

Visit **http://localhost:3000**

---

## 📖 Usage

### 1. View Rankings
The homepage displays top 2026 prospects with:
- Consensus rankings
- Stock indicators (📈 rising / 📉 falling)
- Position badges
- Real-time rank changes

### 2. Scan for News
Click the **🔍 Scan Now** button to:
- Fetch latest RSS feed items
- Match news to prospects
- Analyze sentiment
- Update database

Or visit: `http://localhost:3000/api/scan`

### 3. View Player Details
Click any prospect to see:
- Detailed scout reports
- College stats
- News feed
- Rank movement history

### 4. Run Python Scraper (Optional)
```bash
cd scrapers
python news/aggregator.py
```

---

## 🏗️ Architecture

```
dynasty-scout/
├── app/                    # Next.js pages & API routes
│   ├── api/scan/          # RSS scanning endpoint
│   ├── players/[slug]/    # Player detail pages
│   └── page.tsx           # Main dashboard
│
├── lib/
│   ├── scout/agent.ts     # AI Scout Agent (sentiment analysis)
│   ├── data/
│   │   ├── rss_scanner.ts # TypeScript RSS scanner
│   │   └── sleeper.ts     # Sleeper API connector
│   └── db.ts              # SQLite connection
│
├── components/
│   ├── DraftBoard.tsx     # Main prospect list
│   ├── PlayerMiniCard.tsx # Individual prospect cards
│   └── ui/                # shadcn/ui components
│
├── scrapers/              # Python data scrapers
│   └── news/aggregator.py # RSS news aggregation
│
├── styles/theme.css       # Elite cyber-scout theme
└── dynasty_scout.db       # SQLite database
```

---

## 🎨 Design System

### Color Palette
- **Neon Green**: `#00ff88` - Primary accent
- **Neon Blue**: `#00d4ff` - Secondary accent
- **Neon Purple**: `#b794f6` - Highlights
- **Deep Navy**: `#0a0e1a` - Background

### Key Features
- **Glassmorphism**: Frosted glass cards with backdrop blur
- **Neon Gradients**: Smooth color transitions
- **Animations**: Slide-in, pulse, glow effects
- **Position Badges**: Color-coded QB/RB/WR/TE

---

## 📊 Data Sources

1. **RSS Feeds** (TypeScript)
   - FantasyPros
   - RotoWire
   - NFL.com
   - Dynasty League Football

2. **Python Scrapers**
   - News aggregation
   - Player matching
   - Database insertion

3. **Sleeper API**
   - NFL player data
   - Trending players
   - Cross-referencing

4. **SQLite Database**
   - Players, stats, rankings
   - News articles
   - Consensus rankings

---

## 🔧 API Endpoints

### `GET /api/scan`
Triggers RSS feed scanning and database updates.

**Response:**
```json
{
  "success": true,
  "data": {
    "timestamp": "2026-02-11T21:30:00Z",
    "itemsFound": 45,
    "newProspectMentions": 12,
    "newsInserted": 8
  }
}
```

---

## 🤖 Scout Agent

The AI-powered Scout Agent (`lib/scout/agent.ts`) performs:

1. **News Scanning**: Fetches from RSS feeds
2. **Player Matching**: Links articles to prospects
3. **Sentiment Analysis**: 
   - Positive keywords: breakout, elite, dominant, heisman
   - Negative keywords: injury, concern, struggles, benched
4. **Stock Updates**: Calculates rising/falling/stable status
5. **Database Storage**: Persists all data

---

## 📦 Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **Styling**: Tailwind CSS 4 + Custom CSS (Cyber-Scout theme)
- **UI Components**: shadcn/ui (Radix UI)
- **Database**: SQLite (better-sqlite3)
- **Data**: RSS Parser, Sleeper API
- **Python**: feedparser, beautifulsoup4, requests

---

## 🎯 Roadmap

- [ ] Add more RSS feeds
- [ ] Implement ML-based prospect projections
- [ ] Add user authentication
- [ ] Create custom draft boards
- [ ] Mobile app (React Native)
- [ ] Real-time WebSocket updates

---

## 📄 License

MIT

---

## 🙏 Acknowledgments

- **FantasyPros**, **RotoWire**, **NFL.com** for RSS feeds
- **Sleeper** for API access
- **shadcn/ui** for component library

---

**Built with ❤️ for Dynasty Fantasy Football**
