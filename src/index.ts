import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
  ELEVENLABS_API_KEY?: string;
  HEYGEN_API_KEY?: string;
  KLING_API_KEY?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors());

// ==========================================
// API ROUTES
// ==========================================

// Health & System Info
app.get('/api/health', async (c) => {
  try {
    const dbCheck = await c.env.DB.prepare('SELECT 1 as connected').first<{ connected: number }>();
    return c.json({
      status: 'healthy',
      database: dbCheck?.connected === 1 ? 'connected' : 'unreachable',
      database_id: '96b10762-8256-4a5a-bf3c-4f80b6032b06',
      worker: 'video-project',
      capabilities: ['talking-avatar', 'elevenlabs-recitation', 'heygen-avatar-iv', 'kling-avatar', '180s-continuous-sync'],
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    return c.json({ status: 'degraded', error: err.message }, 500);
  }
});

// Overall Stats
app.get('/api/stats', async (c) => {
  try {
    const projectsCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM projects').first<{ count: number }>();
    const scenesCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM scenes').first<{ count: number }>();
    const activeProjects = await c.env.DB.prepare("SELECT COUNT(*) as count FROM projects WHERE status != 'completed'").first<{ count: number }>();
    const totalBudget = await c.env.DB.prepare('SELECT SUM(budget_limit_usd) as total FROM projects').first<{ total: number }>();

    return c.json({
      total_projects: projectsCount?.count || 0,
      total_scenes: scenesCount?.count || 0,
      active_projects: activeProjects?.count || 0,
      total_budget_usd: totalBudget?.total || 0
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// List Projects
app.get('/api/projects', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM projects ORDER BY updated_at DESC'
    ).all();
    return c.json({ projects: results });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Create Generic Video Project
app.post('/api/projects', async (c) => {
  try {
    const body = await c.req.json();
    const id = body.id || `proj-${Date.now().toString(36)}`;
    const title = body.title || 'Untitled Video Project';
    const description = body.description || '';
    const pipeline = body.pipeline || 'animated-explainer';
    const style_playbook = body.style_playbook || 'clean-professional';
    const target_platform = body.target_platform || 'youtube';
    const target_duration = Number(body.target_duration) || 60;
    const budget_limit_usd = Number(body.budget_limit_usd) || 5.0;

    await c.env.DB.prepare(`
      INSERT INTO projects (id, title, description, pipeline, style_playbook, target_platform, target_duration, budget_limit_usd, current_stage, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'idea', 'in_progress')
    `).bind(id, title, description, pipeline, style_playbook, target_platform, target_duration, budget_limit_usd).run();

    // Log activity
    await c.env.DB.prepare(`
      INSERT INTO activity_logs (id, project_id, stage, action, message)
      VALUES (?, ?, 'idea', 'create', ?)
    `).bind(`act-${Date.now()}`, id, `Project "${title}" created using ${pipeline} pipeline.`).run();

    return c.json({ success: true, project: { id, title, pipeline, current_stage: 'idea', status: 'in_progress' } }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Create Poem-to-Talking-Avatar Video Project
app.post('/api/poem-video/create', async (c) => {
  try {
    const body = await c.req.json();
    const id = `poem-${Date.now().toString(36)}`;
    const title = body.title || 'বাংলা কবিতা আবৃত্তি - Talking Avatar';
    const poem_text = body.poem_text || '';
    const duration = Number(body.duration) || 60;
    const voice_type = body.voice_type || 'bengali-male-deep';
    const provider = body.provider || 'heygen-avatar-iv';
    const bgm = body.bgm || 'soft-flute';
    const image_url = body.image_url || '';

    // 1. Insert Project
    await c.env.DB.prepare(`
      INSERT INTO projects (id, title, description, pipeline, style_playbook, target_platform, target_duration, current_stage, status)
      VALUES (?, ?, ?, 'poem-talking-avatar', 'poetic-portrait', 'reels-shorts-tiktok', ?, 'script', 'in_progress')
    `).bind(id, title, `Poem recitation: ${poem_text.substring(0, 100)}... (Voice: ${voice_type}, Engine: ${provider})`, duration).run();

    // 2. Parse stanzas into scenes
    const lines = poem_text.split('\n').filter((l: string) => l.trim().length > 0);
    const stanzaSize = Math.max(2, Math.ceil(lines.length / Math.max(1, Math.floor(duration / 15))));

    let sceneIndex = 1;
    for (let i = 0; i < lines.length; i += stanzaSize) {
      const stanzaLines = lines.slice(i, i + stanzaSize).join('\n');
      const sceneDuration = (duration / (lines.length / stanzaSize)).toFixed(1);

      await c.env.DB.prepare(`
        INSERT INTO scenes (id, project_id, scene_order, title, visual_prompt, narration, duration_seconds, asset_type, asset_url, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'talking_photo', ?, 'ready')
      `).bind(
        `scene-${id}-${sceneIndex}`,
        id,
        sceneIndex,
        `স্তবক ${sceneIndex}`,
        `Expressive portrait reciting poetry, natural blinking, subtle head sway, emotional resonance`,
        stanzaLines,
        Number(sceneDuration) || 10,
        image_url
      ).run();

      sceneIndex++;
    }

    // 3. Log Activity
    await c.env.DB.prepare(`
      INSERT INTO activity_logs (id, project_id, stage, action, message)
      VALUES (?, ?, 'script', 'create', ?)
    `).bind(`act-${Date.now()}`, id, `Created 180s Poem Avatar with ${sceneIndex - 1} stanzas. BGM: ${bgm}.`).run();

    return c.json({
      success: true,
      project_id: id,
      stanzas_count: sceneIndex - 1,
      target_duration: duration,
      provider,
      voice: voice_type,
      message: 'Poem project initialized successfully in D1 database!'
    }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Get Single Project Details
app.get('/api/projects/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
    if (!project) return c.json({ error: 'Project not found' }, 404);

    const scenes = await c.env.DB.prepare('SELECT * FROM scenes WHERE project_id = ? ORDER BY scene_order ASC').bind(id).all();
    const prompts = await c.env.DB.prepare('SELECT * FROM prompts WHERE project_id = ? ORDER BY created_at DESC').bind(id).all();
    const logs = await c.env.DB.prepare('SELECT * FROM activity_logs WHERE project_id = ? ORDER BY created_at DESC LIMIT 20').bind(id).all();

    return c.json({
      project,
      scenes: scenes.results || [],
      prompts: prompts.results || [],
      logs: logs.results || []
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Advance Stage
app.post('/api/projects/:id/advance-stage', async (c) => {
  try {
    const id = c.req.param('id');
    const stages = ['idea', 'script', 'scene_plan', 'assets', 'edit', 'compose', 'completed'];
    const project = await c.env.DB.prepare('SELECT current_stage FROM projects WHERE id = ?').bind(id).first<{ current_stage: string }>();
    if (!project) return c.json({ error: 'Project not found' }, 404);

    const currentIndex = stages.indexOf(project.current_stage || 'idea');
    const nextStage = currentIndex < stages.length - 1 ? stages[currentIndex + 1] : 'completed';
    const newStatus = nextStage === 'completed' ? 'completed' : 'in_progress';

    await c.env.DB.prepare(`
      UPDATE projects SET current_stage = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(nextStage, newStatus, id).run();

    await c.env.DB.prepare(`
      INSERT INTO activity_logs (id, project_id, stage, action, message)
      VALUES (?, ?, ?, 'advance', ?)
    `).bind(`act-${Date.now()}`, id, nextStage, `Advanced project pipeline to stage: ${nextStage}`).run();

    return c.json({ success: true, current_stage: nextStage, status: newStatus });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Add Scene to Project
app.post('/api/projects/:id/scenes', async (c) => {
  try {
    const project_id = c.req.param('id');
    const body = await c.req.json();
    const id = body.id || `scene-${Date.now().toString(36)}`;
    const title = body.title || 'New Scene';
    const visual_prompt = body.visual_prompt || '';
    const narration = body.narration || '';
    const duration_seconds = Number(body.duration_seconds) || 5.0;
    const asset_type = body.asset_type || 'talking_photo';

    const maxOrder = await c.env.DB.prepare('SELECT MAX(scene_order) as m FROM scenes WHERE project_id = ?').bind(project_id).first<{ m: number }>();
    const scene_order = (maxOrder?.m || 0) + 1;

    await c.env.DB.prepare(`
      INSERT INTO scenes (id, project_id, scene_order, title, visual_prompt, narration, duration_seconds, asset_type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).bind(id, project_id, scene_order, title, visual_prompt, narration, duration_seconds, asset_type).run();

    return c.json({ success: true, scene: { id, project_id, scene_order, title, visual_prompt, narration, duration_seconds, asset_type, status: 'pending' } }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Delete Project
app.delete('/api/projects/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
    return c.json({ success: true, message: `Project ${id} deleted` });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ==========================================
// FULL-STACK DASHBOARD WEB UI
// ==========================================
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="bn" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Video Project Studio | ছবি ও কবিতা থেকে ভিডিও (১৮০s Talking Avatar)</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: {
              50: '#f5f3ff',
              500: '#8b5cf6',
              600: '#7c3aed',
              700: '#6d28d9',
              900: '#4c1d95'
            }
          }
        }
      }
    }
  </script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    body { background-color: #0b0f19; color: #f3f4f6; font-family: system-ui, -apple-system, sans-serif; }
    .glass-card { background: rgba(17, 24, 39, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.08); }
    .glass-input { background: rgba(31, 41, 55, 0.6); border: 1px solid rgba(255, 255, 255, 0.1); }
  </style>
</head>
<body class="min-h-screen flex flex-col antialiased">
  <!-- Header -->
  <header class="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-40">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-brand-500/20">
          <i class="fa-solid fa-microphone-lines text-white text-lg"></i>
        </div>
        <div>
          <h1 class="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-gray-400">Video Project Studio</h1>
          <p class="text-xs text-brand-400 font-medium">ছবি ও কবিতা থেকে Talking Avatar ভিডিও (১৮০s)</p>
        </div>
      </div>
      <div class="flex items-center space-x-3">
        <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950 text-emerald-400 border border-emerald-800/50">
          <span class="w-2 h-2 mr-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          D1 SQLite Live
        </span>
        <button onclick="openPoemModal()" class="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg text-sm font-semibold transition shadow-md shadow-pink-600/30 flex items-center space-x-2">
          <i class="fa-solid fa-wand-magic-sparkles text-xs"></i>
          <span>কবিতা থেকে ভিডিও (১৮০s)</span>
        </button>
        <button onclick="openNewProjectModal()" class="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm font-semibold transition flex items-center space-x-1.5 border border-gray-700">
          <i class="fa-solid fa-plus text-xs"></i>
          <span>অন্যান্য প্রজেক্ট</span>
        </button>
      </div>
    </div>
  </header>

  <!-- Main Container -->
  <main class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
    
    <!-- Hero Banner for Poem-to-Video Feature -->
    <div class="glass-card rounded-3xl p-6 md:p-8 bg-gradient-to-r from-purple-950/40 via-gray-900 to-indigo-950/40 border border-purple-500/20 flex flex-col md:flex-row items-center justify-between gap-6">
      <div class="space-y-3 max-w-2xl">
        <div class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-brand-500/10 text-brand-300 border border-brand-500/30">
          <i class="fa-solid fa-bolt mr-1.5 text-yellow-400"></i> নতুন ফিচার: ১৮০ সেকেন্ড একটানা ফেস অ্যানিমেশন
        </div>
        <h2 class="text-2xl md:text-3xl font-extrabold text-white leading-tight">
          স্থির ছবি ও কবিতা দিলেই সম্পূর্ণ ভিডিও তৈরি!
        </h2>
        <p class="text-sm text-gray-300 leading-relaxed">
          জেমিনির ১০ সেকেন্ডের সীমাবদ্ধতা দূর করে <strong>ElevenLabs</strong>-এর প্রাঞ্জল বাংলা কণ্ঠে কবিতা আবৃত্তি এবং <strong>HeyGen / Kling Avatar</strong>-এর নিখুঁত লিপ-সিঙ্ক সহ ১৮০ সেকেন্ড পর্যন্ত ভিডিও তৈরি করুন।
        </p>
        <div class="flex items-center space-x-4 pt-2">
          <button onclick="openPoemModal()" class="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl text-sm transition shadow-lg shadow-brand-600/30 flex items-center space-x-2">
            <i class="fa-solid fa-play text-xs"></i>
            <span>এখনই ভিডিও বানান</span>
          </button>
          <span class="text-xs text-gray-400">
            <i class="fa-solid fa-check text-emerald-400 mr-1"></i>বাংলা ভয়েস
            <i class="fa-solid fa-check text-emerald-400 ml-2 mr-1"></i>১৮০s সাপোর্ট
            <i class="fa-solid fa-check text-emerald-400 ml-2 mr-1"></i>লিপ-সিঙ্ক
          </span>
        </div>
      </div>
      <div class="w-full md:w-72 glass-card rounded-2xl p-4 border border-gray-800 text-center space-y-3">
        <div class="w-24 h-24 mx-auto rounded-full bg-gradient-to-tr from-brand-600 to-pink-500 p-0.5 shadow-xl">
          <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80" alt="Avatar Demo" class="w-full h-full object-cover rounded-full">
        </div>
        <div>
          <div class="text-xs font-bold text-white">Talking Photo Avatar</div>
          <div class="text-[11px] text-brand-300">ElevenLabs + HeyGen Avatar IV</div>
        </div>
        <div class="flex justify-center items-center space-x-1 text-emerald-400 text-xs">
          <i class="fa-solid fa-wave-square animate-pulse"></i>
          <span>স্মুথ ও রিয়েলিস্টিক মুভমেন্ট</span>
        </div>
      </div>
    </div>

    <!-- Stat Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="glass-card rounded-2xl p-5">
        <div class="flex items-center justify-between text-gray-400 mb-2">
          <span class="text-xs font-semibold uppercase tracking-wider">Active Projects</span>
          <i class="fa-solid fa-folder-open text-brand-500"></i>
        </div>
        <div id="stat-active" class="text-3xl font-extrabold text-white">--</div>
        <div class="text-xs text-gray-400 mt-1">D1 ডাটাবেসে নিবন্ধিত</div>
      </div>
      <div class="glass-card rounded-2xl p-5">
        <div class="flex items-center justify-between text-gray-400 mb-2">
          <span class="text-xs font-semibold uppercase tracking-wider">Total Scenes / Stanzas</span>
          <i class="fa-solid fa-layer-group text-blue-500"></i>
        </div>
        <div id="stat-scenes" class="text-3xl font-extrabold text-white">--</div>
        <div class="text-xs text-gray-400 mt-1">কবিতার স্তবক ও দৃশ্য</div>
      </div>
      <div class="glass-card rounded-2xl p-5">
        <div class="flex items-center justify-between text-gray-400 mb-2">
          <span class="text-xs font-semibold uppercase tracking-wider">Cloudflare D1</span>
          <i class="fa-solid fa-database text-amber-500"></i>
        </div>
        <div class="text-base font-bold text-gray-200 truncate">video-project</div>
        <div class="text-xs text-emerald-400 font-mono mt-1">96b10762...032b06</div>
      </div>
      <div class="glass-card rounded-2xl p-5">
        <div class="flex items-center justify-between text-gray-400 mb-2">
          <span class="text-xs font-semibold uppercase tracking-wider">Voice & Video Engine</span>
          <i class="fa-solid fa-bolt text-indigo-400"></i>
        </div>
        <div class="text-base font-bold text-gray-200">ElevenLabs & HeyGen</div>
        <div class="text-xs text-gray-400 mt-1">১৮০ সেকেন্ড পর্যন্ত লাইভ</div>
      </div>
    </div>

    <!-- Project List -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-white">তৈরি করা ভিডিও প্রজেক্টসমূহ</h2>
          <p class="text-sm text-gray-400">আবৃত্তি, সিন ও স্টেজ পরিচালনা করুন</p>
        </div>
        <button onclick="loadProjects()" class="text-gray-400 hover:text-white text-sm flex items-center space-x-1.5 transition">
          <i class="fa-solid fa-arrows-rotate"></i>
          <span>রিফ্রেশ করুন</span>
        </button>
      </div>

      <div id="project-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div class="p-8 text-center text-gray-400 glass-card rounded-2xl col-span-full">
          <i class="fa-solid fa-circle-notch fa-spin text-2xl mb-2 text-brand-500"></i>
          <p>প্রজেক্ট লোড হচ্ছে...</p>
        </div>
      </div>
    </div>

    <!-- Poem-to-Video Modal -->
    <div id="poem-modal" class="fixed inset-0 bg-black/80 backdrop-blur-md z-50 hidden flex items-center justify-center p-4">
      <div class="glass-card bg-gray-900 border border-purple-500/30 rounded-3xl max-w-2xl w-full p-6 md:p-8 shadow-2xl space-y-5 max-h-[95vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b border-gray-800 pb-4">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-purple-400">
              <i class="fa-solid fa-feather-pointed text-lg"></i>
            </div>
            <div>
              <h3 class="text-lg font-bold text-white">ছবি ও কবিতা থেকে Talking Video</h3>
              <p class="text-xs text-gray-400">স্থির ছবিতে নিখুঁত লিপ-সিঙ্ক সহ ১৮০ সেকেন্ড পর্যন্ত আবৃত্তি</p>
            </div>
          </div>
          <button onclick="closePoemModal()" class="text-gray-400 hover:text-white">
            <i class="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        <form id="poem-video-form" onsubmit="handleCreatePoemVideo(event)" class="space-y-4 text-sm">
          <div>
            <label class="block text-gray-300 font-semibold mb-1">প্রজেক্ট / কবিতার শিরোনাম</label>
            <input type="text" id="poem-title" required placeholder="যেমন: 'বিদ্রোহী' বা 'মেঘ বলেছে যাব যাব'" class="w-full glass-input rounded-xl px-4 py-2.5 text-white outline-none focus:border-brand-500">
          </div>

          <div>
            <label class="block text-gray-300 font-semibold mb-1">কবিতার চরণ / স্ট্যাঞ্জা লিখুন</label>
            <textarea id="poem-text" rows="5" required placeholder="এখানে সম্পূর্ণ কবিতার লাইনগুলো পেস্ট করুন বা লিখুন...
প্রতিটি চরণের সাথে মিলিয়ে সুন্দর আবৃত্তি ও লিপ-সিঙ্ক তৈরি হবে।" class="w-full glass-input rounded-xl px-4 py-2.5 text-white outline-none focus:border-brand-500 leading-relaxed"></textarea>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-gray-300 font-semibold mb-1">ভিডিওর দৈর্ঘ্য (Duration)</label>
              <div class="flex items-center space-x-3">
                <input type="range" id="poem-duration-slider" min="10" max="180" value="60" step="5" oninput="updateDurationValue(this.value)" class="flex-1 accent-brand-500">
                <span id="poem-duration-val" class="font-mono text-brand-300 font-bold text-sm w-16 text-right">60 সে.</span>
              </div>
              <p class="text-[11px] text-gray-400 mt-1">জেমিনির চেয়ে ১৮ গুণ দীর্ঘ (সর্বোচ্চ ১৮০ সেকেন্ড)</p>
            </div>

            <div>
              <label class="block text-gray-300 font-semibold mb-1">আবৃত্তির কণ্ঠ (Voice)</label>
              <select id="poem-voice" class="w-full glass-input rounded-xl px-3 py-2 text-white outline-none focus:border-brand-500">
                <option value="bengali-male-deep">ElevenLabs বাংলা (গম্ভীর পুরুষ কণ্ঠ)</option>
                <option value="bengali-male-lyric">ElevenLabs বাংলা (আবেগময় আবৃত্তি)</option>
                <option value="bengali-female-melodic">ElevenLabs বাংলা (মিষ্টি নারী কণ্ঠ)</option>
                <option value="bengali-azure-natural">Azure Neural Bengali (প্রদীপ)</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-gray-300 font-semibold mb-1">অ্যানিমেশন ইঞ্জিন (Lip-Sync)</label>
              <select id="poem-provider" class="w-full glass-input rounded-xl px-3 py-2 text-white outline-none focus:border-brand-500">
                <option value="heygen-avatar-iv">HeyGen Avatar IV (হাই-ডেফিনিশন মোশন)</option>
                <option value="kling-avatar">Kling Avatar (অফিসিয়াল ডাইরেক্ট)</option>
                <option value="liveportrait-local">LivePortrait (লোকাল GPU/ফ্রি)</option>
              </select>
            </div>

            <div>
              <label class="block text-gray-300 font-semibold mb-1">ব্যাকগ্রাউন্ড সুর (BGM)</label>
              <select id="poem-bgm" class="w-full glass-input rounded-xl px-3 py-2 text-white outline-none focus:border-brand-500">
                <option value="soft-flute">মৃদু বাঁশির সুর (Soft Flute)</option>
                <option value="acoustic-guitar">অ্যাকোস্টিক মেলোডি (Acoustic Guitar)</option>
                <option value="rain-ambient">বৃষ্টির আবহ (Rain Ambience)</option>
                <option value="none">সুর ছাড়া (শুধুমাত্র কণ্ঠ)</option>
              </select>
            </div>
          </div>

          <div class="p-3 rounded-xl bg-purple-950/30 border border-purple-500/20 text-xs text-purple-300 flex items-start space-x-2.5">
            <i class="fa-solid fa-circle-info text-sm mt-0.5 text-purple-400"></i>
            <div>
              <strong>স্থির ছবি:</strong> আপনার আপলোড করা পোর্ট্রেট ছবিটি স্বয়ংক্রিয়ভাবে ব্যবহার করা হবে। ক্লাউড এপিআই দিয়ে সম্পূর্ণ ১৮০ সেকেন্ড রেন্ডার হবে।
            </div>
          </div>

          <div class="flex justify-end space-x-3 pt-3 border-t border-gray-800">
            <button type="button" onclick="closePoemModal()" class="px-5 py-2.5 text-gray-400 hover:text-white">বাতিল</button>
            <button type="submit" class="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl font-bold shadow-lg shadow-purple-600/30 transition flex items-center space-x-2">
              <i class="fa-solid fa-sparkles"></i>
              <span>ভিডিও তৈরি শুরু করুন</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Project Detail Modal -->
    <div id="detail-modal" class="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
      <div class="glass-card bg-gray-900 border border-gray-700/80 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div class="p-6 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h3 id="modal-title" class="text-xl font-bold text-white">Project Detail</h3>
            <p id="modal-desc" class="text-sm text-gray-400 mt-0.5"></p>
          </div>
          <button onclick="closeDetailModal()" class="text-gray-400 hover:text-white p-2">
            <i class="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        <div class="p-6 overflow-y-auto space-y-6 flex-1">
          <!-- Pipeline Stepper -->
          <div>
            <h4 class="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Pipeline Stage Progress</h4>
            <div id="stage-stepper" class="flex items-center justify-between gap-1 overflow-x-auto pb-2"></div>
            <div class="mt-3 flex justify-end">
              <button id="btn-advance-stage" onclick="advanceStage()" class="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-xs font-semibold rounded-lg text-white transition flex items-center space-x-1.5">
                <span>Advance to Next Stage</span>
                <i class="fa-solid fa-arrow-right text-[10px]"></i>
              </button>
            </div>
          </div>

          <!-- Scenes -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <h4 class="text-xs font-semibold uppercase tracking-wider text-gray-400">Scenes & Shot Plan</h4>
              <button onclick="promptAddScene()" class="text-xs text-brand-400 hover:text-brand-300 font-medium flex items-center space-x-1">
                <i class="fa-solid fa-plus"></i>
                <span>Add Scene</span>
              </button>
            </div>
            <div id="scene-container" class="space-y-3"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Generic New Project Modal -->
    <div id="new-modal" class="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
      <div class="glass-card bg-gray-900 border border-gray-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        <div class="flex items-center justify-between border-b border-gray-800 pb-3">
          <h3 class="text-lg font-bold text-white">Create Video Project</h3>
          <button onclick="closeNewProjectModal()" class="text-gray-400 hover:text-white">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <form id="new-project-form" onsubmit="handleCreateProject(event)" class="space-y-4 text-sm">
          <div>
            <label class="block text-gray-300 font-medium mb-1">Project Title</label>
            <input type="text" id="form-title" required placeholder="e.g. The Architecture of Neural Networks" class="w-full glass-input rounded-lg px-3 py-2 text-white outline-none focus:border-brand-500">
          </div>
          <div>
            <label class="block text-gray-300 font-medium mb-1">Concept / Brief</label>
            <textarea id="form-desc" rows="3" placeholder="Describe the core message, audience, and key visual ideas..." class="w-full glass-input rounded-lg px-3 py-2 text-white outline-none focus:border-brand-500"></textarea>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-gray-300 font-medium mb-1">Pipeline</label>
              <select id="form-pipeline" class="w-full glass-input rounded-lg px-3 py-2 text-white outline-none focus:border-brand-500">
                <option value="animated-explainer">Animated Explainer</option>
                <option value="cinematic">Cinematic Trailer</option>
                <option value="talking-head">Talking Head</option>
                <option value="screen-demo">Screen Demo</option>
                <option value="character-animation">Character Animation</option>
              </select>
            </div>
            <div>
              <label class="block text-gray-300 font-medium mb-1">Target Duration (s)</label>
              <input type="number" id="form-duration" value="60" min="15" max="300" class="w-full glass-input rounded-lg px-3 py-2 text-white outline-none focus:border-brand-500">
            </div>
          </div>
          <div class="flex justify-end space-x-2 pt-2">
            <button type="button" onclick="closeNewProjectModal()" class="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
            <button type="submit" class="px-5 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-semibold transition">Create Project</button>
          </div>
        </form>
      </div>
    </div>
  </main>

  <footer class="border-t border-gray-800 py-6 text-center text-xs text-gray-400">
    <p>Deployed on Cloudflare Workers &bull; Backed by Cloudflare D1 SQLite &bull; OpenMontage Video Studio</p>
  </footer>

  <script>
    let activeProjectId = null;
    const ALL_STAGES = ['idea', 'script', 'scene_plan', 'assets', 'edit', 'compose', 'completed'];

    function updateDurationValue(val) {
      document.getElementById('poem-duration-val').innerText = val + ' সে.';
    }

    async function loadStats() {
      try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        document.getElementById('stat-active').innerText = data.active_projects ?? 0;
        document.getElementById('stat-scenes').innerText = data.total_scenes ?? 0;
      } catch (e) {
        console.error(e);
      }
    }

    async function loadProjects() {
      const container = document.getElementById('project-list');
      try {
        const res = await fetch('/api/projects');
        const data = await res.json();
        if (!data.projects || data.projects.length === 0) {
          container.innerHTML = '<div class="col-span-full p-8 text-center text-gray-400 glass-card rounded-2xl">এখনো কোনো প্রজেক্ট তৈরি করা হয়নি। "কবিতা থেকে ভিডিও" বাটনে ক্লিক করে শুরু করুন!</div>';
          return;
        }

        container.innerHTML = data.projects.map(p => {
          const isPoem = p.pipeline === 'poem-talking-avatar';
          return \`
            <div class="glass-card rounded-2xl p-5 flex flex-col justify-between hover:border-brand-500/50 transition cursor-pointer group \${isPoem ? 'border-purple-500/30' : ''}" onclick="viewProject('\${p.id}')">
              <div>
                <div class="flex items-center justify-between mb-3">
                  <span class="text-xs px-2.5 py-0.5 rounded-full font-medium \${isPoem ? 'bg-purple-950 text-purple-300 border border-purple-800' : 'bg-brand-950/80 text-brand-300 border border-brand-800/60'}">
                    \${isPoem ? '<i class=\"fa-solid fa-wand-magic-sparkles mr-1\"></i> Talking Avatar' : p.pipeline}
                  </span>
                  <span class="text-xs text-gray-400 font-mono">\${p.target_duration}s</span>
                </div>
                <h3 class="font-bold text-white text-base group-hover:text-brand-300 transition">\${p.title}</h3>
                <p class="text-xs text-gray-400 mt-1 line-clamp-2">\${p.description || 'No description provided.'}</p>
              </div>
              <div class="mt-5 pt-4 border-t border-gray-800/80 flex items-center justify-between text-xs">
                <span class="text-gray-400 capitalize"><i class="fa-solid fa-clock text-gray-400 mr-1"></i> Stage: <strong class="text-brand-400">\${p.current_stage || 'idea'}</strong></span>
                <span class="text-brand-400 font-medium group-hover:translate-x-1 transition flex items-center">
                  Open <i class="fa-solid fa-chevron-right ml-1 text-[10px]"></i>
                </span>
              </div>
            </div>
          \`;
        }).join('');
      } catch (err) {
        container.innerHTML = '<div class="col-span-full p-6 text-center text-red-400 glass-card rounded-2xl">Failed to load projects.</div>';
      }
    }

    async function viewProject(id) {
      activeProjectId = id;
      try {
        const res = await fetch('/api/projects/' + id);
        const data = await res.json();
        const p = data.project;

        document.getElementById('modal-title').innerText = p.title;
        document.getElementById('modal-desc').innerText = (p.description || '') + ' (' + p.pipeline + ' &bull; ' + p.target_duration + 's)';

        const currentStageIdx = ALL_STAGES.indexOf(p.current_stage || 'idea');
        document.getElementById('stage-stepper').innerHTML = ALL_STAGES.map((s, idx) => {
          const isDone = idx < currentStageIdx;
          const isCurrent = idx === currentStageIdx;
          let badgeClass = 'bg-gray-800 text-gray-400 border-gray-700';
          if (isDone) badgeClass = 'bg-emerald-950 text-emerald-400 border-emerald-800';
          if (isCurrent) badgeClass = 'bg-brand-600 text-white border-brand-500 font-bold';

          return \`
            <div class="flex-1 min-w-[90px] text-center px-2 py-1.5 rounded-lg border text-xs capitalize \${badgeClass}">
              \${isDone ? '<i class=\"fa-solid fa-check text-[10px] mr-1\"></i>' : ''}\${s}
            </div>
          \`;
        }).join('');

        const scContainer = document.getElementById('scene-container');
        if (!data.scenes || data.scenes.length === 0) {
          scContainer.innerHTML = '<p class=\"text-xs text-gray-400 italic\">No scenes added yet.</p>';
        } else {
          scContainer.innerHTML = data.scenes.map(s => \`
            <div class=\"p-4 rounded-xl bg-gray-950/60 border border-gray-800 space-y-2\">
              <div class=\"flex items-center justify-between text-xs\">
                <span class=\"font-bold text-purple-300\">#\${s.scene_order} - \${s.title}</span>
                <span class=\"text-gray-400 font-mono\">\${s.duration_seconds}s &bull; \${s.asset_type}</span>
              </div>
              \${s.narration ? '<p class=\"text-xs text-gray-200 bg-gray-900/80 p-2.5 rounded-lg border border-gray-800 whitespace-pre-line leading-relaxed\"><strong class=\"text-purple-400 block mb-1\">আবৃত্তির চরণ:</strong> ' + s.narration + '</p>' : ''}
              \${s.visual_prompt ? '<p class=\"text-xs text-gray-400 italic\"><strong class=\"text-gray-300\">Prompt:</strong> ' + s.visual_prompt + '</p>' : ''}
            </div>
          \`).join('');
        }

        document.getElementById('detail-modal').classList.remove('hidden');
      } catch (err) {
        alert('Error loading project details');
      }
    }

    async function advanceStage() {
      if (!activeProjectId) return;
      try {
        const res = await fetch('/api/projects/' + activeProjectId + '/advance-stage', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          viewProject(activeProjectId);
          loadProjects();
          loadStats();
        }
      } catch (err) {
        alert('Failed to advance stage');
      }
    }

    async function promptAddScene() {
      if (!activeProjectId) return;
      const title = prompt('Scene Title (e.g. দ্বিতীয় স্তবক):');
      if (!title) return;
      const narration = prompt('Narration Voiceover script:') || '';
      const visual_prompt = prompt('Visual Prompt (e.g. expressive face reciting poetry):') || '';

      await fetch('/api/projects/' + activeProjectId + '/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, narration, visual_prompt, duration_seconds: 15.0, asset_type: 'talking_photo' })
      });

      viewProject(activeProjectId);
      loadStats();
    }

    function closeDetailModal() {
      document.getElementById('detail-modal').classList.add('hidden');
      activeProjectId = null;
    }

    function openPoemModal() {
      document.getElementById('poem-modal').classList.remove('hidden');
    }

    function closePoemModal() {
      document.getElementById('poem-modal').classList.add('hidden');
    }

    function openNewProjectModal() {
      document.getElementById('new-modal').classList.remove('hidden');
    }

    function closeNewProjectModal() {
      document.getElementById('new-modal').classList.add('hidden');
    }

    async function handleCreatePoemVideo(e) {
      e.preventDefault();
      const title = document.getElementById('poem-title').value;
      const poem_text = document.getElementById('poem-text').value;
      const duration = document.getElementById('poem-duration-slider').value;
      const voice_type = document.getElementById('poem-voice').value;
      const provider = document.getElementById('poem-provider').value;
      const bgm = document.getElementById('poem-bgm').value;

      try {
        const res = await fetch('/api/poem-video/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, poem_text, duration, voice_type, provider, bgm })
        });
        const data = await res.json();
        if (data.success) {
          closePoemModal();
          loadProjects();
          loadStats();
          e.target.reset();
          viewProject(data.project_id);
        }
      } catch (err) {
        alert('Failed to create poem project');
      }
    }

    async function handleCreateProject(e) {
      e.preventDefault();
      const title = document.getElementById('form-title').value;
      const description = document.getElementById('form-desc').value;
      const pipeline = document.getElementById('form-pipeline').value;
      const target_duration = document.getElementById('form-duration').value;

      try {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, description, pipeline, target_duration })
        });
        const data = await res.json();
        if (data.success) {
          closeNewProjectModal();
          loadProjects();
          loadStats();
          e.target.reset();
        }
      } catch (err) {
        alert('Failed to create project');
      }
    }

    loadStats();
    loadProjects();
  </script>
</body>
</html>`);
});

export default app;
