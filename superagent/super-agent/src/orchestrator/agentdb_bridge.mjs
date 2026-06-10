/**
 * AgentDB Bridge - Persistent Node subprocess for vector routing and trajectory tracking.
 *
 * Operations (newline-delimited JSON on stdin → JSON on stdout):
 *   {op:"ping"}
 *   {op:"route", query:"...", k:3}
 *   {op:"store", name:"uuid", text:"..."}
 *   {op:"search", query:"...", k:5}
 *   {op:"traj_start", description:"..."}
 *   {op:"traj_step",  id:42}
 *   {op:"traj_end",   id:42, success:true, note:"ok"}
 *   {op:"traj_recent", limit:10}
 */

import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// stdout is reserved for the JSON protocol — route library chatter
// (e.g. AgentDB init banners) to stderr so readers never parse it.
console.log = (...args) => process.stderr.write(args.join(' ') + '\n');
console.info = console.log;
console.warn = console.log;

const MODULES = process.env.AGENTDB_MODULES || '/home/user/ruflo/v3/node_modules';

// ---------------------------------------------------------------------------
// Keyword routing (no embeddings required — deterministic, works offline)
// ---------------------------------------------------------------------------
const TASK_KEYWORDS = {
  file_operation:        new Set(['file','read','write','create','delete','list','directory','folder','copy','move','rename','open','save','edit','txt','pdf','csv','path','disk']),
  browser_automation:    new Set(['browser','screenshot','click','navigate','page','web','url','form','input','website','visit','load','tab','button','link','scroll','hover','selenium','playwright']),
  web_scraping:          new Set(['scrape','extract','crawl','harvest','parse','html','content','scraping','crawling','download','collect','website','data','xpath','css','selector']),
  web_search:            new Set(['search','find','query','google','bing','results','information','online','internet','answer','who','what','where','when','why','locate','lookup']),
  conversational_search: new Set(['discuss','conversation','chat','talk','explore','interactive','dialog','explain','tell','describe','elaborate','clarify']),
  research_synthesis:    new Set(['research','investigate','analyze','synthesize','comprehensive','academic','scholarly','study','report','compile','survey','review','literature']),
  fact_check:            new Set(['fact','check','verify','validate','true','false','accurate','correct','claim','statement','debunk','confirm','misinformation']),
  news_analysis:         new Set(['news','headline','current','breaking','latest','trending','media','journalism','coverage','article','story','press']),
  api_testing:           new Set(['api','endpoint','rest','graphql','http','request','test','post','get','put','patch','delete','json','response','status','curl','webhook']),
  security_scan:         new Set(['security','vulnerability','scan','audit','snyk','cve','threat','risk','dependency','exploit','inject','xss','sql','attack']),
  infrastructure:        new Set(['terraform','deploy','provision','infrastructure','cloud','server','resource','aws','azure','gcp','iac','vm','container','kubernetes','k8s']),
  memory_operation:      new Set(['remember','store','save','recall','retrieve','memory','cache','persist','keep','history','log','archive']),
  general_query:         new Set(['help','explain','question','assist','support','describe','summarize','translate','calculate','convert'])
};

function routeByKeywords(query, k) {
  const tokens = new Set(
    query.toLowerCase()
         .replace(/[^a-z0-9\s]/g, ' ')
         .split(/\s+/)
         .filter(t => t.length > 2)
  );
  if (tokens.size === 0) return [{ id: 'general_query', score: 0.3 }];

  const scores = [];
  for (const [taskType, keywords] of Object.entries(TASK_KEYWORDS)) {
    let matched = 0;
    for (const t of tokens) { if (keywords.has(t)) matched++; }
    if (matched === 0) continue;
    const union    = tokens.size + keywords.size - matched;
    const jaccard  = matched / union;
    const recall   = matched / keywords.size;
    const prec     = matched / tokens.size;
    const score    = jaccard * 0.4 + recall * 0.3 + prec * 0.3;
    scores.push({ id: taskType, score: Math.min(score * 3.5, 0.99) }); // scale to 0-1
  }
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, k);
}

// ---------------------------------------------------------------------------
// In-process document store — fallback ranking when AgentDB skill retrieval
// returns nothing (offline mock embeddings produce no vector matches)
// ---------------------------------------------------------------------------
const localDocs = [];

// Light suffix stripping so variants like scrape/scraping/products match
function stem(t) {
  if (t.length > 5 && t.endsWith('ing')) t = t.slice(0, -3);
  else if (t.length > 4 && t.endsWith('ed')) t = t.slice(0, -2);
  else if (t.length > 3 && t.endsWith('s')) t = t.slice(0, -1);
  if (t.length > 4 && t.endsWith('e')) t = t.slice(0, -1);
  return t;
}

function tokenize(text) {
  return new Set(
    text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2)
        .map(stem)
  );
}

function searchLocalDocs(query, k) {
  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) return [];

  const scored = [];
  for (const doc of localDocs) {
    let matched = 0;
    for (const t of queryTokens) { if (doc.tokens.has(t)) matched++; }
    if (matched === 0) continue;
    const score = matched / Math.sqrt(queryTokens.size * doc.tokens.size);
    scored.push({ text: doc.text, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

// ---------------------------------------------------------------------------
// Lazy-loaded controllers
// ---------------------------------------------------------------------------
let _intelligenceStore = null;
let _agentDB           = null;

async function getIntelligenceStore() {
  if (_intelligenceStore) return _intelligenceStore;
  try {
    const { IntelligenceStore } = await import(`${MODULES}/agentic-flow/dist/intelligence/IntelligenceStore.js`);
    const store = new IntelligenceStore('/tmp/superagent-intelligence.db');
    await store.ensureInitialized();
    _intelligenceStore = store;
    process.stderr.write('[bridge] IntelligenceStore ready\n');
    return store;
  } catch (e) {
    process.stderr.write(`[bridge] IntelligenceStore unavailable: ${e.message}\n`);
    return null;
  }
}

async function getAgentDB() {
  if (_agentDB) return _agentDB;
  try {
    const { AgentDB } = await import(`${MODULES}/agentdb/dist/src/index.js`);
    const db = new AgentDB({ dbPath: ':memory:', vectorDimension: 384 });
    await db.initialize();
    _agentDB = db;
    process.stderr.write('[bridge] AgentDB ready\n');
    return db;
  } catch (e) {
    process.stderr.write(`[bridge] AgentDB unavailable: ${e.message}\n`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Request dispatcher
// ---------------------------------------------------------------------------
async function handleRequest(req) {
  switch (req.op) {

    case 'ping':
      return { ok: true };

    case 'route': {
      const results = routeByKeywords(req.query || '', req.k || 3);
      return { results };
    }

    case 'store': {
      // Always index locally so search works even when vector retrieval doesn't
      localDocs.push({ text: req.text || '', tokens: tokenize(req.text || '') });
      const db = await getAgentDB();
      if (!db) return { ok: true, fallback: true };
      try {
        await db.skills.createSkill({
          name:        req.name || `skill_${Date.now()}`,
          description: req.text,
          code:        req.text,
          successRate: 1.0
        });
        return { ok: true };
      } catch (e) {
        process.stderr.write(`[bridge] store failed: ${e.message}\n`);
        return { ok: true, fallback: true };
      }
    }

    case 'search': {
      const k = req.k || 5;
      const db = await getAgentDB();
      if (db) {
        try {
          const skills = await db.skills.retrieveSkills({
            task:           req.query,
            k,
            minSuccessRate: 0
          });
          if (skills.length > 0) {
            return {
              results: skills.map(s => ({
                text:  s.description || s.code || s.name || '',
                score: s.successRate || 0.5
              }))
            };
          }
        } catch (e) {
          process.stderr.write(`[bridge] search failed: ${e.message}\n`);
        }
      }
      // Vector retrieval unavailable or empty — rank locally stored docs
      return { results: searchLocalDocs(req.query || '', k) };
    }

    case 'traj_start': {
      const store = await getIntelligenceStore();
      if (!store) return { id: -1 };
      try {
        const id = await store.startTrajectory(req.description || '', 'super-agent');
        return { id: Number(id) };
      } catch (e) {
        process.stderr.write(`[bridge] traj_start failed: ${e.message}\n`);
        return { id: -1 };
      }
    }

    case 'traj_step': {
      if ((req.id ?? -1) < 0) return { ok: true };
      const store = await getIntelligenceStore();
      if (!store) return { ok: true };
      try {
        await store.addTrajectoryStep(req.id);
        return { ok: true };
      } catch {
        return { ok: true };
      }
    }

    case 'traj_end': {
      if ((req.id ?? -1) < 0) return { ok: true };
      const store = await getIntelligenceStore();
      if (!store) return { ok: true };
      try {
        const outcome = req.success ? 'success' : 'failure';
        await store.endTrajectory(req.id, outcome, req.note ? { note: req.note } : undefined);
        return { ok: true };
      } catch {
        return { ok: true };
      }
    }

    case 'traj_recent': {
      const store = await getIntelligenceStore();
      if (!store) return { trajectories: [] };
      try {
        const trajectories = await store.getRecentTrajectories(req.limit || 10);
        return { trajectories };
      } catch {
        return { trajectories: [] };
      }
    }

    default:
      return { error: `unknown op: ${req.op}` };
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
process.stderr.write('[bridge] AgentDB bridge starting\n');

const rl = createInterface({ input: process.stdin, terminal: false });

async function processLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req;
  try {
    req = JSON.parse(trimmed);
  } catch {
    process.stdout.write(JSON.stringify({ error: 'invalid json' }) + '\n');
    return;
  }
  try {
    const result = await handleRequest(req);
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e.message }) + '\n');
  }
}

// Serialize requests so responses always come back in request order,
// and drain in-flight work before exiting on stdin EOF.
let pending = Promise.resolve();

rl.on('line', (line) => {
  pending = pending.then(() => processLine(line));
});

rl.on('close', () => {
  pending.then(() => process.exit(0));
});
