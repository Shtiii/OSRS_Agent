# OSRS Helper Agent

A Context-Aware OSRS (Old School RuneScape) AI Agent Dashboard built with Next.js 14+, TypeScript, and the Vercel AI SDK.

![OSRS Helper](https://oldschool.runescape.wiki/images/thumb/Old_School_RuneScape_logo.png/320px-Old_School_RuneScape_logo.png)

## Features

### 🎮 Player Stats Integration
- Enter your RuneScape username to load your stats from [Wise Old Man](https://wiseoldman.net/)
- View your total level, combat level, and account type
- See your weekly XP gains at a glance
- Update stats directly from the dashboard

### 📦 Collection Log Support
- Upload your `collectionlog.json` file (from [Collection Log plugin](https://github.com/evansloan/collection-log))
- Automatically extracts and highlights valuable/rare items
- The AI uses your owned items to prioritize gear recommendations

### 🤖 AI-Powered Assistant
- Get personalized advice based on your actual account stats
- Ask about boss strategies, gear setups, quest requirements, and money-making methods
- The AI can search the OSRS Wiki for factual information
- The AI can search the web (via Tavily) for community guides and recent strategies

### 🛠️ Built-in Tools
1. **searchWiki** - Search the official OSRS Wiki for drop rates, quest requirements, item stats
2. **searchWeb** - Find Reddit threads, YouTube guides, and community strategies
3. **getWikiPage** - Get detailed information from specific Wiki pages

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- API Keys (see below)

### Installation

1. Clone the repository:
```bash
cd osrs-agent
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
# Copy the example env file
cp .env.local.example .env.local
```

4. Add your API keys to `.env.local`:
```env
# OpenRouter API Key (for AI responses)
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Tavily API Key (for web search)
TAVILY_API_KEY=your_tavily_api_key_here

# Optional: Change the AI model
OPENROUTER_MODEL=anthropic/claude-sonnet-4
```

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## API Keys

### OpenRouter
1. Go to [OpenRouter](https://openrouter.ai/)
2. Create an account and generate an API key
3. Add credits to your account

### Tavily (Optional but recommended)
1. Go to [Tavily](https://tavily.com/)
2. Sign up and get your API key
3. Free tier includes 1,000 searches/month

## Usage

### Loading Your Stats
1. Enter your RuneScape username in the sidebar
2. Click "Load" to fetch your stats from Wise Old Man
3. Click "Update Stats" to refresh from the hiscores

### Uploading Collection Log
1. Install the [Collection Log plugin](https://github.com/evansloan/collection-log) in RuneLite
2. Export your collection log as JSON
3. Upload the file in the sidebar

### Asking Questions
Try these example prompts:
- "What boss should I do with my stats?"
- "Best gear setup for Vorkath with 100m budget"
- "Can I do the Inferno with my stats?"
- "What's the drop rate for Dragon Warhammer?"
- "How do I do Chambers of Xeric?"

## Project Structure

```
osrs-agent/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat/
│   │   │   │   └── route.ts    # AI chat endpoint with tools
│   │   │   └── player/
│   │   │       └── route.ts    # Player stats endpoint
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── Chat.tsx            # Main chat interface
│   │   ├── Dashboard.tsx       # Dashboard container
│   │   └── Sidebar.tsx         # Sidebar with stats & upload
│   └── lib/
│       ├── osrs.ts             # Wise Old Man & Wiki API functions
│       ├── parser.ts           # Collection log parser
│       ├── tavily.ts           # Tavily search functions
│       ├── types.ts            # TypeScript interfaces
│       └── utils.ts            # Utility functions
├── .env.local                  # Environment variables
├── package.json
└── README.md
```

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **AI**: Vercel AI SDK with OpenRouter
- **APIs**:
  - [Wise Old Man API](https://docs.wiseoldman.net/)
  - [OSRS Wiki API](https://oldschool.runescape.wiki/w/API:Main_page)
  - [Tavily Search API](https://tavily.com/)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this project however you'd like.

## Disclaimer

This project is not affiliated with Jagex Ltd. Old School RuneScape is a trademark of Jagex Ltd.
