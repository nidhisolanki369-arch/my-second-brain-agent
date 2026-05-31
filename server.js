const express = require('express');
const cors = require('cors');
const { execSync } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

const CORAL = 'C:\\Users\\nso\\Downloads\\Coral\\coral.exe';

function query(sql) {
  try {
    return execSync(`"${CORAL}" sql "${sql}"`, { encoding: 'utf8', timeout: 30000 });
  } catch (e) {
    return e.stdout || '';

  }
}

function extractText(richTextJson) {
  try {
    if (!richTextJson || richTextJson === '[]') return '';
    const arr = JSON.parse(richTextJson);
    return arr.map(item => item.plain_text || item.text?.content || '').join(' ').trim();
  } catch {
    const matches = richTextJson.match(/"plain_text":"([^"]+)"/g);
    if (matches) return matches.map(m => m.replace(/"plain_text":"/, '').replace(/"$/, '')).join(' ');
    return '';
  }
}

function extractProperties(propertiesJson) {
  try {
    if (!propertiesJson) return {};
    const props = JSON.parse(propertiesJson);
    const result = {};
    for (const [key, val] of Object.entries(props)) {
      if (val.type === 'title' && val.title?.length > 0)
        result['Name'] = val.title.map(t => t.plain_text || '').join('');
      else if (val.type === 'date' && val.date?.start)
        result['Due Date'] = val.date.start;
      else if (val.type === 'status' && val.status?.name)
        result['Status'] = val.status.name;
      else if (val.type === 'select' && val.select?.name)
        result[key] = val.select.name;
      else if (val.type === 'rich_text' && val.rich_text?.length > 0)
        result[key] = val.rich_text.map(t => t.plain_text || '').join('');
      else if (val.type === 'people' && val.people?.length > 0)
        result[key] = val.people.map(p => p.name || p.id).join(', ');
      else if (val.type === 'checkbox')
        result[key] = val.checkbox ? 'Yes' : 'No';
      else if (val.type === 'number' && val.number !== null)
        result[key] = val.number.toString();
      else if (val.type === 'multi_select' && val.multi_select?.length > 0)
        result[key] = val.multi_select.map(s => s.name).join(', ');
    }
    return result;
  } catch { return {}; }
}

function getPages() {
  const raw = query("SELECT id, url, object, properties FROM notion.search LIMIT 50");
  const pages = [];
  const lines = raw.split('\n');
  let inData = false;
  for (const line of lines) {
    if (line.includes('---')) { inData = true; continue; }
    if (!inData || !line.includes('|')) continue;
    const parts = line.split('|').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const id = parts[0];
      const url = parts[1];
      const object = parts[2];
      const propsJson = parts.slice(3).join('|');
      if (id.match(/[a-f0-9]{8}-[a-f0-9]{4}/) && object === 'page') {
        const props = extractProperties(propsJson);
        pages.push({ id, url, props });
      }
    }
  }
  return pages;
}

function getPageContent(pageId) {
  const raw = query(`SELECT type, rich_text FROM notion.block_children WHERE block_id = '${pageId}' LIMIT 1000`);
  if (!raw || raw.includes('404')) return '';
  const lines = raw.split('\n');
  const content = [];
  let inData = false;
  for (const line of lines) {
    if (line.includes('---')) { inData = true; continue; }
    if (!inData || !line.includes('|')) continue;
    const parts = line.split('|').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const text = extractText(parts.slice(1).join('|'));
      if (text && text.length > 1) content.push(`[${parts[0]}] ${text}`);
    }
  }
  // Get child blocks one level deeper
  const childRaw = query(`SELECT id, has_children FROM notion.block_children WHERE block_id = '${pageId}' LIMIT 50`);
  if (childRaw && !childRaw.includes('404')) {
    const childLines = childRaw.split('\n');
    let childInData = false;
    for (const line of childLines) {
      if (line.includes('---')) { childInData = true; continue; }
      if (!childInData || !line.includes('|')) continue;
      const parts = line.split('|').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2 && parts[1] === 'true') {
        const childId = parts[0];
        if (childId.match(/[a-f0-9]{8}-[a-f0-9]{4}/)) {
          const deepRaw = query(`SELECT type, rich_text FROM notion.block_children WHERE block_id = '${childId}' LIMIT 1000`);
          if (deepRaw && !deepRaw.includes('404')) {
            const deepLines = deepRaw.split('\n');
            let deepInData = false;
            for (const dl of deepLines) {
              if (dl.includes('---')) { deepInData = true; continue; }
              if (!deepInData || !dl.includes('|')) continue;
              const dp = dl.split('|').map(p => p.trim()).filter(Boolean);
              if (dp.length >= 2) {
                const text = extractText(dp.slice(1).join('|'));
                if (text && text.length > 1) content.push(`  [${dp[0]}] ${text}`);
              }
            }
          }
        }
      }
    }
  }
  return content.join('\n');
}

function getCalendarEvents() {
  const raw = query(`SELECT summary, start_date_time, description, status FROM google_calendar.events WHERE calendar_id = 'primary' AND start_date_time > '${new Date().toISOString()}' LIMIT 50`);
  if (!raw || raw.includes('Query failed')) return 'No calendar events found';
  const lines = raw.split('\n');
  const events = [];
  let inData = false;
  for (const line of lines) {
    if (line.includes('---')) { inData = true; continue; }
    if (!inData || !line.includes('|')) continue;
    const parts = line.split('|').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2 && parts[0] && parts[0].length > 2) {
      events.push(`• ${parts[0]}${parts[1] ? ' | Date: ' + parts[1] : ''}${parts[2] ? ' | Status: ' + parts[2] : ''}`);
    }
  }
  return events.slice(0, 20).join('\n') || 'No events found';
}

// Cross-source JOIN across all 3 sources
function getCrossJoin() {
return query("SELECT n.url, g.login, c.summary FROM notion.search n CROSS JOIN github.user g CROSS JOIN google_calendar.events c WHERE n.object = 'page' AND c.calendar_id = 'primary' LIMIT 10");
}

let cache = null;
let cacheTime = null;
const CACHE_TTL = 5 * 60 * 1000;

async function loadAllData() {
  const now = Date.now();
  if (cache && cacheTime && (now - cacheTime) < CACHE_TTL) return cache;

  console.log('🔄 Loading data from all 3 sources via Coral SQL...');

  const pages = getPages();
  console.log(`📝 Found ${pages.length} Notion pages`);

  const allContent = [];
  const allProperties = [];

  for (const page of pages) {
    const pageName = page.url.split('/').pop().replace(/-[a-f0-9]{32}$/, '').replace(/-/g, ' ');
    const content = getPageContent(page.id);
    if (content.trim()) {
      allContent.push(`=== ${page.props.Name || pageName} ===\n${content}`);
    }
    if (Object.keys(page.props).length > 0) {
      allProperties.push({
        page: page.props.Name || pageName,
        dueDate: page.props['Due Date'] || 'Not set',
        status: page.props['Status'] || 'Not set',
        priority: page.props['Priority'] || page.props['priority'] || 'Not set'
      });
    }
  }

  console.log('📅 Loading Google Calendar events...');
  const calendarEvents = getCalendarEvents();

  console.log('💻 Loading GitHub data...');
  const githubUser = query('SELECT login, id FROM github.user LIMIT 1');

  console.log('🔗 Running cross-source JOIN...');
  const crossJoin = getCrossJoin();

  cache = {
    notionContent: allContent.join('\n\n'),
    notionProperties: allProperties,
    calendarEvents,
    githubUser,
    crossJoin,
    pageCount: pages.length
  };
  cacheTime = now;
  console.log('✅ All 3 sources loaded and cached!');
  return cache;
}

loadAllData().then(() => {
  console.log('✅ Ready to answer questions!');
}).catch(err => console.error('Pre-load error:', err.message));

app.get('/data', async (req, res) => {
  try {
    const data = await loadAllData();
    res.json({
      pageCount: data.pageCount,
      notionProperties: data.notionProperties,
      calendarEvents: data.calendarEvents,
      githubUser: data.githubUser,
      crossJoin: data.crossJoin,
      timestamp: new Date().toISOString()
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/ask', async (req, res) => {
  const { question, groqKey } = req.body;
  try {
    const data = await loadAllData();

    const propertiesText = data.notionProperties.map(p =>
      `• ${p.page}: Status=${p.status}, Due=${p.dueDate}, Priority=${p.priority}`
    ).join('\n');

    const systemPrompt = `You are a personal Second Brain AI agent for Nidhi, a working professional.
You have LIVE data fetched from 3 sources — Notion, GitHub, and Google Calendar — using Coral SQL queries.

=== NOTION PAGE CONTENT (notes, learnings, study topics) ===
${data.notionContent}

=== NOTION PROPERTIES (project status, due dates, priority) ===
${propertiesText}

=== GOOGLE CALENDAR EVENTS (schedule, meetings, upcoming events) ===
${data.calendarEvents}

=== GITHUB USER ===
${data.githubUser}

=== CROSS-SOURCE JOIN (notion CROSS JOIN github) ===
${data.crossJoin}

Data fetched live at ${new Date().toISOString()} from 3 sources via Coral SQL.

INSTRUCTIONS:
- Read ALL data above carefully before answering
- For "what's on my schedule" or "upcoming events" → use Google Calendar data
- For "what did I learn" or "study topics" → use Notion content
- For "deadlines" or "project status" → use Notion properties
- For "what should I do next" → combine all 3 sources
- Give specific, actionable answers based on real data
- Never say you cannot find info if it exists above
- Be warm, helpful and concise
- Use bullet points for lists

End with [Source: Live Notion + GitHub + Google Calendar via Coral SQL].`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: question }],
        max_tokens: 800, temperature: 0.7
      })
    });

    const result = await response.json();
    if (result.error) throw new Error(result.error.message);
    res.json({ answer: result.choices[0].message.content });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/refresh', async (req, res) => {
  cache = null; cacheTime = null;
  await loadAllData();
  res.json({ message: 'Cache refreshed!' });
});

app.listen(3500, () => {
  console.log('🧠 Second Brain Agent running on http://localhost:3500');
  console.log('✅ Sources: Notion + GitHub + Google Calendar via Coral SQL');
  console.log('✅ Cross-source JOIN: notion.search CROSS JOIN github.user');
  console.log('⏳ Pre-loading all data...');
});
