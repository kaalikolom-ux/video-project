-- Cloudflare D1 SQLite Schema for video-project
-- Database ID: 96b10762-8256-4a5a-bf3c-4f80b6032b06

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    pipeline TEXT NOT NULL DEFAULT 'animated-explainer',
    style_playbook TEXT DEFAULT 'clean-professional',
    target_platform TEXT DEFAULT 'youtube',
    target_duration INTEGER DEFAULT 60,
    current_stage TEXT DEFAULT 'idea',
    status TEXT DEFAULT 'draft',
    budget_limit_usd REAL DEFAULT 5.0,
    cost_spent_usd REAL DEFAULT 0.0,
    render_runtime TEXT DEFAULT 'hyperframes',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scenes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    scene_order INTEGER NOT NULL,
    title TEXT NOT NULL,
    visual_prompt TEXT,
    narration TEXT,
    duration_seconds REAL DEFAULT 5.0,
    asset_type TEXT DEFAULT 'image',
    asset_url TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    scene_id TEXT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_type TEXT NOT NULL,
    prompt_text TEXT NOT NULL,
    parameters_json TEXT,
    result_url TEXT,
    status TEXT DEFAULT 'ready',
    cost_usd REAL DEFAULT 0.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    stage TEXT,
    action TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Seed initial sample project
INSERT OR IGNORE INTO projects (id, title, description, pipeline, style_playbook, target_platform, target_duration, current_stage, status)
VALUES (
    'proj-demo-1',
    'Future of AI Video Production',
    'A high-impact cinematic explainer demonstrating autonomous multi-agent video orchestration.',
    'animated-explainer',
    'clean-professional',
    'youtube',
    45,
    'script',
    'in_progress'
);

INSERT OR IGNORE INTO scenes (id, project_id, scene_order, title, visual_prompt, narration, duration_seconds, asset_type, status)
VALUES 
(
    'scene-1',
    'proj-demo-1',
    1,
    'Opening Hook',
    'Cinematic wide angle, futuristic data visualization particles flowing across a holographic digital canvas, cinematic lighting, 8k',
    'Video production used to take teams of specialists weeks. Today, that entire studio fits into code.',
    6.0,
    'video',
    'ready'
),
(
    'scene-2',
    'proj-demo-1',
    2,
    'The AI Studio Engine',
    'A modular robotic arm assembling crystalline film frames, sleek cyberpunk aesthetic, volumetric fog',
    'From research and scripting to asset generation and motion compositing, every stage is fully automated.',
    7.5,
    'video',
    'pending'
),
(
    'scene-3',
    'proj-demo-1',
    3,
    'Call to Action',
    'Minimalist sleek title card with glowing typography against deep obsidian slate background',
    'Welcome to the next generation of creative production. Build your vision instantly.',
    5.0,
    'image',
    'pending'
);
