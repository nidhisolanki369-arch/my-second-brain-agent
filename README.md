 My Second Brain Agent

A personal AI agent that queries your Notion, GitHub and Google Calendar live using Coral and answers questions using Groq's Llama 3.3

Built for Pirates of the Coral-bean Hackathon 🏴‍☠️ · Track 2: Personal Agent

 What it does
My Second Brain is a local AI agent that connects to your personal data sources and lets you ask questions like:

"What should I do next?"
"What have I been learning recently?"
"Give me a full brain summary"

It pulls live data from Notion, GitHub and Google Calendar in real time — no ETL, no API wrappers, data never leaves your machine.

Powered by Coral
Coral is the core of this project. It lets me query 3 completely different data sources in a single SQL query:
sqlSELECT n.url, g.login, c.summary
FROM notion.search n
CROSS JOIN github.user g
CROSS JOIN google_calendar.events c
WHERE n.object = 'page'
AND c.calendar_id = 'primary'
3 sources · 0 glue code · 100% local ✓

Tech Stack

Coral — live SQL queries across Notion, GitHub, Google Calendar
Groq — fast AI responses using Llama 3.3
Node.js — backend server
HTML/CSS/JS — frontend UI


How to run
1. Install Coral
npm install -g @withcoral/coral
2. Add your data sources
coral source add notion
coral source add github
coral source add google_calendar
3. Install dependencies
npm install
4. Start the server
node server.js
5. Open in browser
http://localhost:3500
6. Click ⚙️gear icon → paste your Groq API key → Save

Project Structure
my-second-brain-agent/
├── index.html        # Frontend UI
├── server.js         # Node.js backend + Coral queries
├── package.json      # Dependencies
└── README.md

Environment
You need:

Groq API key — get it free at console.groq.com
Coral installed and configured
Notion, GitHub, Google Calendar connected via Coral


Future Improvements

Implement proper OAuth refresh token for Google Calendar so credentials don't expire every hour
Voice input to speak to your second brain
Daily automatic morning summaries
More sources — Spotify, Jira, Linear
Smarter responses that learn your patterns over time
