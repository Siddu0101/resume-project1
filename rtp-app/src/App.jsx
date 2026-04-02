import { useState, useRef, useEffect } from "react";

// ══════════════════════════════════════════════
//  THEME
// ══════════════════════════════════════════════
const C = {
  navy:      '#0B1F45',
  blue:      '#1554AD',
  blueMed:   '#1976D2',
  blueLight: '#42A5F5',
  bluePale:  '#EBF3FF',
  bg:        '#F0F4FA',
  white:     '#FFFFFF',
  dark:      '#101B2D',
  mid:       '#3A526B',
  muted:     '#7B8EA6',
  border:    '#C4D4E8',
  green:     '#16A34A',
  greenBg:   '#D1FAE5',
  red:       '#DC2626',
  redBg:     '#FEE2E2',
  amber:     '#B45309',
  amberBg:   '#FEF3C7',
  shadow:    '0 1px 8px rgba(11,31,69,.10)',
  shadowMd:  '0 4px 20px rgba(11,31,69,.15)',
};

const NAV = [
  { id: 'dashboard', label: 'Dashboard',      icon: '⊞' },
  { id: 'resume',    label: 'Resume Analyzer', icon: '📄' },
  { id: 'learning',  label: 'Learning Path',   icon: '🎯' },
  { id: 'interview', label: 'Interview Agent', icon: '🎙️' },
];

// ══════════════════════════════════════════════
//  GEMINI HELPERS
// ══════════════════════════════════════════════
async function geminiCall(prompt, key, b64 = null, mime = null) {
  const parts = [];
  if (b64 && mime) parts.push({ inline_data: { mime_type: mime, data: b64 } });
  parts.push({ text: prompt });
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }] }) }
  );
  if (!r.ok) { const e = await r.json(); throw new Error(e.error?.message || `API Error ${r.status}`); }
  const d = await r.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function geminiChat(history, key) {
  const contents = history.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.text }],
  }));
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }) }
  );
  if (!r.ok) { const e = await r.json(); throw new Error(e.error?.message || `API Error ${r.status}`); }
  const d = await r.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function geminiWithResume(prompt, key, b64, mime, chatHistory = []) {
  const systemParts = [
    { inline_data: { mime_type: mime, data: b64 } },
    { text: prompt },
  ];
  const contents = [{ role: 'user', parts: systemParts }];
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }) }
  );
  if (!r.ok) { const e = await r.json(); throw new Error(e.error?.message || `API Error ${r.status}`); }
  const d = await r.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

const fileToB64 = file => new Promise((res, rej) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => res(reader.result.split(',')[1]);
  reader.onerror = rej;
});

// ══════════════════════════════════════════════
//  SHARED UI
// ══════════════════════════════════════════════
const Spinner = ({ size = 20 }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%',
    border: `3px solid ${C.bluePale}`, borderTopColor: C.blue,
    animation: 'spin .8s linear infinite', display: 'inline-block', flexShrink: 0,
  }} />
);

const Btn = ({ children, onClick, variant = 'primary', disabled = false, small = false, icon = null, full = false, style: s = {} }) => {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: small ? '6px 14px' : '10px 22px', borderRadius: 8, border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
    fontSize: small ? 13 : 14, fontWeight: 600, transition: 'all .18s',
    opacity: disabled ? 0.55 : 1, width: full ? '100%' : 'auto', ...s,
  };
  const V = {
    primary:   { background: C.blue,   color: '#fff' },
    secondary: { background: C.bluePale, color: C.blue },
    ghost:     { background: 'transparent', color: C.mid, border: `1px solid ${C.border}` },
    danger:    { background: C.redBg,   color: C.red },
    success:   { background: C.greenBg, color: C.green },
    dark:      { background: C.navy,    color: '#fff' },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...base, ...V[variant] }}>
      {icon && <span>{icon}</span>}{children}
    </button>
  );
};

const Card = ({ children, style: s = {} }) => (
  <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: C.shadow, padding: 24, ...s }}>
    {children}
  </div>
);

const Badge = ({ children, color = 'blue' }) => {
  const map = {
    blue:  { bg: C.bluePale, text: C.blue },
    green: { bg: C.greenBg,  text: C.green },
    red:   { bg: C.redBg,    text: C.red },
    amber: { bg: C.amberBg,  text: C.amber },
  };
  return (
    <span style={{ background: map[color].bg, color: map[color].text, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
      {children}
    </span>
  );
};

const FileZone = ({ onFile, file }) => {
  const [drag, setDrag] = useState(false);
  const ref = useRef();
  const handleDrop = e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); };
  return (
    <div onClick={() => ref.current.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)} onDrop={handleDrop}
      style={{ border: `2px dashed ${drag ? C.blue : C.border}`, borderRadius: 12,
        padding: '28px 24px', textAlign: 'center', cursor: 'pointer',
        background: drag ? C.bluePale : C.bg, transition: 'all .2s' }}>
      <input ref={ref} type="file" accept=".pdf,.doc,.docx,.txt" style={{ display: 'none' }}
        onChange={e => e.target.files[0] && onFile(e.target.files[0])} />
      <div style={{ fontSize: 34, marginBottom: 8 }}>📂</div>
      {file
        ? <div><div style={{ color: C.blue, fontWeight: 700 }}>✓ {file.name}</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB · Click to change</div></div>
        : <div><div style={{ color: C.mid, fontWeight: 500 }}>Drop your resume here or click to browse</div>
            <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>PDF, DOC, DOCX, TXT supported</div></div>}
    </div>
  );
};

const SectionHeader = ({ icon, title, subtitle }) => (
  <div style={{ marginBottom: 24 }}>
    <h1 style={{ fontSize: 26, fontFamily: 'Lora, Georgia, serif', color: C.navy, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
      <span>{icon}</span>{title}
    </h1>
    {subtitle && <p style={{ color: C.muted, marginTop: 6, fontSize: 14 }}>{subtitle}</p>}
  </div>
);

// ══════════════════════════════════════════════════════════════════
//  FEATURE 1 — RESUME ANALYZER + JOB MATCHER
// ══════════════════════════════════════════════════════════════════
const ResumeAnalyzer = ({ apiKey, onRedirectToLearning }) => {
  const [tab, setTab] = useState('analyze');

  /* ── Tab 1: Analyze ── */
  const [file1, setFile1] = useState(null);
  const [loading1, setLoading1] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [err1, setErr1] = useState('');

  /* ── Tab 2: Job Match ── */
  const [file2, setFile2] = useState(null);
  const [resumeB64, setResumeB64] = useState(null);
  const [resumeMime, setResumeMime] = useState(null);
  const [msgs, setMsgs] = useState([{
    role: 'model',
    text: "👋 Hello! Upload your resume above, then tell me which role you're targeting.\n\nExample: \"I want a SDE role at Google\" or \"I want a Data Scientist role at Amazon\"",
  }]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [matchResult, setMatchResult] = useState(null);
  const chatEndRef = useRef();

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const handleAnalyze = async () => {
    if (!file1) return;
    setLoading1(true); setErr1(''); setAnalysis(null);
    try {
      const b64 = await fileToB64(file1);
      const mime = file1.type || 'application/pdf';
      const prompt = `You are a professional resume analyzer. Deeply analyze this resume.
Return ONLY a raw JSON object — no markdown fences, no preamble, nothing else:
{
  "name": "Candidate full name",
  "summary": "Professional 2-sentence summary",
  "skills": ["skill1","skill2","skill3"],
  "projects": [{"name":"Project Name","description":"Brief description","technologies":["tech1","tech2"]}],
  "achievements": ["achievement1","achievement2"],
  "certifications": ["cert1","cert2"],
  "experience_years": 2,
  "education": "Degree and field",
  "eligible_companies": [
    {"company":"Google","role":"SDE II","match_score":85,"reason":"Strong Python and ML skills"},
    {"company":"Microsoft","role":"Software Engineer","match_score":82,"reason":"..."},
    {"company":"Amazon","role":"SDE I","match_score":79,"reason":"..."},
    {"company":"Meta","role":"Software Engineer","match_score":76,"reason":"..."},
    {"company":"Apple","role":"iOS/macOS Developer","match_score":72,"reason":"..."},
    {"company":"Netflix","role":"Backend Engineer","match_score":70,"reason":"..."},
    {"company":"Flipkart","role":"SDE","match_score":84,"reason":"..."},
    {"company":"Infosys","role":"Systems Engineer","match_score":91,"reason":"..."},
    {"company":"TCS","role":"Software Developer","match_score":89,"reason":"..."},
    {"company":"Wipro","role":"Project Engineer","match_score":87,"reason":"..."}
  ]
}
Return ONLY valid JSON. Absolutely no other text.`;
      const raw = await geminiCall(prompt, apiKey, b64, mime);
      const cleaned = raw.replace(/```json/g,'').replace(/```/g,'').trim();
      setAnalysis(JSON.parse(cleaned));
    } catch (e) { setErr1(e.message); }
    setLoading1(false);
  };

  const handleFile2 = async f => {
    setFile2(f);
    const b64 = await fileToB64(f);
    setResumeB64(b64);
    setResumeMime(f.type || 'application/pdf');
    setMatchResult(null);
  };

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    if (!file2) {
      setMsgs(p => [...p, { role: 'model', text: '⚠️ Please upload your resume first before asking about job matches.' }]);
      return;
    }
    const userMsg = { role: 'user', text: chatInput };
    const allMsgs = [...msgs, userMsg];
    setMsgs(allMsgs); setChatInput(''); setChatLoading(true);
    try {
      const conv = allMsgs.map(m => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.text}`).join('\n\n');
      const prompt = `You are an expert ATS (Applicant Tracking System) and career counselor AI. The user has uploaded their resume.

TASK: When the user mentions a job role at a company, you MUST:
1. Analyze their resume against the real job description for that role at that company
2. Provide a precise ATS SCORE (0–100) — write it clearly as "ATS Score: XX/100"
3. State clearly: ELIGIBLE ✅ or NOT ELIGIBLE ❌
4. List 5+ matching skills from their resume
5. List 5+ skills/requirements they are missing
6. If ATS Score < 95, tell them to go to the Learning Path feature

Conversation history:
${conv}

Base your analysis on the resume provided and real job requirements for that company.
Format with clear sections: ELIGIBILITY STATUS, ATS SCORE, MATCHING SKILLS, SKILL GAPS, RECOMMENDATION.`;

      const reply = await geminiWithResume(prompt, apiKey, resumeB64, resumeMime);
      setMsgs(p => [...p, { role: 'model', text: reply }]);

      const scoreMatch = reply.match(/ATS\s*Score[:\s]+(\d+)/i);
      if (scoreMatch) {
        const score = parseInt(scoreMatch[1]);
        const companyMatch = chatInput.match(/(?:at|@)\s+([A-Za-z]+)/i);
        const company = companyMatch?.[1] || 'your target company';
        const roleMatch = chatInput.match(/want\s+(?:a\s+)?([A-Za-z\s]+?)\s+role/i);
        const role = roleMatch?.[1]?.trim() || 'Software Engineer';
        if (score < 95) {
          setTimeout(() => {
            setMsgs(p => [...p, {
              role: 'model',
              text: `💡 Your ATS score is ${score}/100 — below the 95% eligibility threshold for ${company}.\n\n→ Head to the **Learning Path** feature to get your personalized week-by-week roadmap to become eligible!`,
            }]);
          }, 600);
          setMatchResult({ score, company, role, userInput: chatInput });
        }
      }
    } catch (e) { setMsgs(p => [...p, { role: 'model', text: `❌ Error: ${e.message}` }]); }
    setChatLoading(false);
  };

  return (
    <div>
      <SectionHeader icon="📄" title="Resume Analyzer & Job Matcher" subtitle="Upload your resume to extract skills & check job eligibility with ATS scoring" />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: C.bg, padding: 4, borderRadius: 10, width: 'fit-content' }}>
        {[{ id: 'analyze', label: '📊 Resume Analysis' }, { id: 'match', label: '🔍 Job Match Checker' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', fontWeight: 600, fontSize: 14, transition: 'all .2s',
            background: tab === t.id ? C.white : 'transparent',
            color: tab === t.id ? C.blue : C.muted,
            boxShadow: tab === t.id ? C.shadow : 'none',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── ANALYZE TAB ── */}
      {tab === 'analyze' && (
        <div>
          <Card style={{ marginBottom: 20 }}>
            <h3 style={{ marginTop: 0, color: C.navy, fontFamily: 'Lora, serif' }}>Upload Your Resume</h3>
            <FileZone onFile={setFile1} file={file1} />
            <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
              <Btn onClick={handleAnalyze} disabled={!file1 || loading1} icon="🔬">
                {loading1 ? 'Analyzing...' : 'Analyze Resume'}
              </Btn>
              {loading1 && <Spinner />}
              {err1 && <span style={{ color: C.red, fontSize: 13 }}>⚠️ {err1}</span>}
            </div>
          </Card>

          {analysis && (
            <div style={{ display: 'grid', gap: 20 }}>
              {/* Profile banner */}
              <Card style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.blue})`, color: '#fff', padding: '28px 28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                  <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>👤</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Lora, serif' }}>{analysis.name}</div>
                    <div style={{ opacity: .85, marginTop: 4, fontSize: 14, lineHeight: 1.5 }}>{analysis.summary}</div>
                    <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ background: 'rgba(255,255,255,.2)', padding: '3px 12px', borderRadius: 20, fontSize: 12 }}>🎓 {analysis.education}</span>
                      <span style={{ background: 'rgba(255,255,255,.2)', padding: '3px 12px', borderRadius: 20, fontSize: 12 }}>💼 {analysis.experience_years}+ yrs experience</span>
                    </div>
                  </div>
                </div>
              </Card>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* Skills */}
                <Card>
                  <h4 style={{ marginTop: 0, color: C.navy }}>🛠️ Extracted Skills</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {analysis.skills?.map((sk, i) => <Badge key={i} color="blue">{sk}</Badge>)}
                  </div>
                </Card>
                {/* Certifications */}
                <Card>
                  <h4 style={{ marginTop: 0, color: C.navy }}>🏆 Certifications</h4>
                  {analysis.certifications?.length
                    ? <ul style={{ margin: 0, paddingLeft: 18, color: C.mid }}>{analysis.certifications.map((cc, i) => <li key={i} style={{ marginBottom: 6, fontSize: 14 }}>{cc}</li>)}</ul>
                    : <p style={{ color: C.muted, margin: 0, fontSize: 14 }}>No certifications found in resume</p>}
                </Card>
              </div>

              {/* Projects */}
              <Card>
                <h4 style={{ marginTop: 0, color: C.navy }}>💻 Projects</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {analysis.projects?.map((proj, i) => (
                    <div key={i} style={{ padding: 14, background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                      <div style={{ fontWeight: 700, color: C.navy, marginBottom: 4 }}>{proj.name}</div>
                      <div style={{ fontSize: 13, color: C.mid, marginBottom: 8 }}>{proj.description}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {proj.technologies?.map((tt, j) => <Badge key={j} color="blue">{tt}</Badge>)}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Achievements */}
              <Card>
                <h4 style={{ marginTop: 0, color: C.navy }}>⭐ Achievements</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {analysis.achievements?.map((ac, i) => (
                    <div key={i} style={{ padding: 10, background: C.amberBg, borderRadius: 8, fontSize: 13, color: C.amber, display: 'flex', gap: 8 }}>
                      <span>✦</span><span>{ac}</span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Eligible Companies */}
              <Card>
                <h4 style={{ marginTop: 0, color: C.navy }}>🏢 Companies You're Eligible For</h4>
                <p style={{ color: C.muted, fontSize: 13, marginTop: -8, marginBottom: 16 }}>Ranked by match score based on your skills, projects & experience</p>
                <div style={{ display: 'grid', gap: 10 }}>
                  {analysis.eligible_companies?.sort((a, b) => b.match_score - a.match_score).map((comp, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', background: C.bg, borderRadius: 10, border: `1px solid ${C.border}` }}>
                      <div style={{ width: 42, height: 42, borderRadius: 8, background: C.bluePale, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: C.blue, fontSize: 13, flexShrink: 0 }}>
                        {comp.company.slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: C.navy }}>{comp.company}</div>
                        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{comp.role} · {comp.reason}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{
                          fontWeight: 800, fontSize: 18,
                          color: comp.match_score >= 80 ? C.green : comp.match_score >= 65 ? C.amber : C.red,
                        }}>{comp.match_score}%</div>
                        <div style={{ fontSize: 11, color: C.muted }}>match</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ── JOB MATCH TAB ── */}
      {tab === 'match' && (
        <div>
          <Card style={{ marginBottom: 20 }}>
            <h3 style={{ marginTop: 0, color: C.navy, fontFamily: 'Lora, serif' }}>Upload Resume for Job Matching</h3>
            <FileZone onFile={handleFile2} file={file2} />
            {file2 && <div style={{ marginTop: 10, padding: '8px 12px', background: C.greenBg, borderRadius: 8, fontSize: 13, color: C.green }}>
              ✅ Resume uploaded — now tell the chatbot which role & company you're targeting
            </div>}
          </Card>

          <Card style={{ display: 'flex', flexDirection: 'column', height: 520 }}>
            <div style={{ paddingBottom: 14, borderBottom: `1px solid ${C.border}`, marginBottom: 14 }}>
              <div style={{ fontWeight: 700, color: C.navy, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>🤖</span> Job Match AI Agent
                <Badge color="blue">ATS Scorer</Badge>
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Compares your resume with real job descriptions</div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 8 }}>
              {msgs.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '82%', padding: '10px 14px', borderRadius: 12,
                    background: m.role === 'user' ? C.blue : C.bg,
                    color: m.role === 'user' ? '#fff' : C.dark,
                    border: m.role !== 'user' ? `1px solid ${C.border}` : 'none',
                    fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap',
                  }}>{m.text}</div>
                </div>
              ))}
              {chatLoading && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: C.muted, fontSize: 13 }}>
                  <Spinner size={16} /> Analyzing your resume against job description...
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {matchResult && (
              <div style={{ padding: '8px 0', borderTop: `1px solid ${C.border}`, marginBottom: 8 }}>
                <Btn small onClick={() => onRedirectToLearning(matchResult)} icon="🎯">
                  Generate Learning Path for {matchResult.company}
                </Btn>
              </div>
            )}

            {/* Input */}
            <div style={{ display: 'flex', gap: 10, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
              <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                placeholder='e.g. "I want SDE role at Google"'
                style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: 'inherit', fontSize: 14, color: C.dark, outline: 'none' }}
              />
              <Btn onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>Send →</Btn>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
//  FEATURE 2 — LEARNING PATH
// ══════════════════════════════════════════════════════════════════
const LearningPath = ({ apiKey, targetData }) => {
  const [company, setCompany] = useState(targetData?.company || '');
  const [role, setRole] = useState(targetData?.role || '');
  const [loading, setLoading] = useState(false);
  const [path, setPath] = useState(null);
  const [error, setError] = useState('');
  const [expandedWeek, setExpandedWeek] = useState(null);

  useEffect(() => {
    if (targetData) { setCompany(targetData.company || ''); setRole(targetData.role || ''); }
  }, [targetData]);

  const generate = async () => {
    if (!company.trim()) return;
    setLoading(true); setError(''); setPath(null);
    try {
      const prompt = `You are an expert career coach specializing in tech placements. 
Create a detailed 8-week learning roadmap for someone targeting a ${role || 'Software Engineer'} role at ${company}.

Return ONLY a raw JSON array of exactly 8 week objects — no markdown, no preamble:
[
  {
    "week": 1,
    "title": "Foundations",
    "focus": "Arrays, Strings & Basic Algorithms",
    "dsa": [
      {"type":"easy","problem":"Two Sum","platform":"LeetCode","number":1},
      {"type":"easy","problem":"Valid Palindrome","platform":"LeetCode","number":125},
      {"type":"easy","problem":"Merge Sorted Array","platform":"LeetCode","number":88},
      {"type":"medium","problem":"Group Anagrams","platform":"LeetCode","number":49},
      {"type":"medium","problem":"Product of Array Except Self","platform":"LeetCode","number":238}
    ],
    "project": {
      "name": "URL Shortener",
      "stars": "~5k",
      "description": "Build a production-grade URL shortener with analytics dashboard",
      "tech": ["Node.js","React","Redis","MongoDB"],
      "github_template": "dub.co/dub"
    },
    "certification": {
      "name": "JavaScript Algorithms and Data Structures",
      "platform": "freeCodeCamp",
      "duration": "300 hours",
      "free": true,
      "url": "freecodecamp.org/learn/javascript-algorithms-and-data-structures"
    },
    "daily_schedule": "2h DSA + 1h project + 30min reading",
    "weekly_goal": "Solve 15 easy LeetCode problems, set up project skeleton"
  },
  ... 7 more weeks, progressing: Easy → Medium → Hard DSA, simple → complex projects
]

Rules:
- Week 1-2: Easy DSA (arrays, strings, hashmaps), starter projects, basics certifications
- Week 3-4: Medium DSA (linked lists, stacks, queues, trees), intermediate projects
- Week 5-6: Hard DSA (graphs, DP, advanced trees), complex projects  
- Week 7-8: Company-specific mock problems, final project polish, advanced certs
- Projects should be realistic, popular GitHub-style with real star counts
- Certifications from real platforms: freeCodeCamp, Coursera, Google, AWS, Microsoft, Udemy
- Each week must have exactly 5 DSA problems (mix of difficulties)
Return ONLY the JSON array.`;
      const raw = await geminiCall(prompt, apiKey);
      const cleaned = raw.replace(/```json/g,'').replace(/```/g,'').trim();
      setPath(JSON.parse(cleaned));
      setExpandedWeek(0);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const diffBadge = type => {
    const map = { easy: 'green', medium: 'amber', hard: 'red' };
    return <Badge color={map[type?.toLowerCase()] || 'blue'}>{type}</Badge>;
  };

  const weekColor = i => `hsl(${215 + i * 8}, ${65 - i * 3}%, ${50 - i * 2}%)`;

  return (
    <div>
      <SectionHeader icon="🎯" title="Learning Path Generator" subtitle="Get a personalized 8-week roadmap with DSA, projects & certifications to land your dream job" />

      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: C.mid, display: 'block', marginBottom: 6 }}>Target Company *</label>
            <input value={company} onChange={e => setCompany(e.target.value)}
              placeholder="e.g. Google, Microsoft, Amazon, TCS..."
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: 'inherit', fontSize: 14, color: C.dark, boxSizing: 'border-box', outline: 'none' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: C.mid, display: 'block', marginBottom: 6 }}>Target Role</label>
            <input value={role} onChange={e => setRole(e.target.value)}
              placeholder="e.g. Software Engineer, Data Scientist..."
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: 'inherit', fontSize: 14, color: C.dark, boxSizing: 'border-box', outline: 'none' }}
            />
          </div>
        </div>
        {targetData && (
          <div style={{ padding: '10px 14px', background: C.amberBg, borderRadius: 8, fontSize: 13, color: C.amber, marginBottom: 14 }}>
            💡 Redirected from Job Match — ATS score was {targetData.score}/100. This 8-week path will help you reach 95%+ for {company}.
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Btn onClick={generate} disabled={!company.trim() || loading} icon="🗺️">
            {loading ? 'Generating Path...' : 'Generate 8-Week Roadmap'}
          </Btn>
          {loading && <Spinner />}
          {error && <span style={{ color: C.red, fontSize: 13 }}>⚠️ {error}</span>}
        </div>
      </Card>

      {path && (
        <div>
          {/* Timeline bar */}
          <Card style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h4 style={{ margin: 0, color: C.navy, fontFamily: 'Lora, serif' }}>🗓️ 8-Week Roadmap to {company}</h4>
              <Badge color="blue">{role || 'Software Engineer'}</Badge>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {path.map((w, i) => (
                <div key={i} style={{ flex: 1, cursor: 'pointer' }} onClick={() => setExpandedWeek(expandedWeek === i ? null : i)}>
                  <div style={{ height: 8, borderRadius: 4, marginBottom: 6, background: weekColor(i), opacity: expandedWeek === i ? 1 : 0.55, transition: 'opacity .2s' }} />
                  <div style={{ fontSize: 11, color: expandedWeek === i ? C.navy : C.muted, fontWeight: expandedWeek === i ? 700 : 400, textAlign: 'center' }}>W{w.week}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Weeks */}
          {path.map((week, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              {/* Week header — always visible */}
              <div onClick={() => setExpandedWeek(expandedWeek === i ? null : i)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', background: C.white, borderRadius: expandedWeek === i ? '12px 12px 0 0' : 12, border: `1px solid ${C.border}`, cursor: 'pointer', boxShadow: C.shadow }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: weekColor(i), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 16, flexShrink: 0 }}>
                  W{week.week}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: C.navy, fontSize: 15 }}>{week.title}</div>
                  <div style={{ color: C.muted, fontSize: 13 }}>Focus: {week.focus}</div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: C.muted }}>{week.daily_schedule}</span>
                  <span style={{ color: C.muted, fontSize: 18 }}>{expandedWeek === i ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Week body — expanded */}
              {expandedWeek === i && (
                <div style={{ background: C.white, border: `1px solid ${C.border}`, borderTop: 'none', borderRadius: '0 0 12px 12px', padding: 20 }}>
                  <div style={{ padding: '10px 14px', background: C.bluePale, borderRadius: 8, marginBottom: 16, fontSize: 13, color: C.blue }}>
                    🎯 Weekly Goal: {week.weekly_goal}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                    {/* DSA */}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.mid, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>📚 DSA Problems</div>
                      {week.dsa?.map((d, j) => (
                        <div key={j} style={{ padding: '9px 12px', marginBottom: 8, borderRadius: 8, background: C.bg, border: `1px solid ${C.border}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: 13, color: C.dark, fontWeight: 600 }}>{d.problem}</span>
                            {diffBadge(d.type)}
                          </div>
                          <div style={{ fontSize: 11, color: C.muted }}>{d.platform}{d.number ? ` #${d.number}` : ''}</div>
                        </div>
                      ))}
                    </div>

                    {/* Project */}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.mid, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>💻 GitHub Project</div>
                      <div style={{ padding: 14, background: C.bluePale, borderRadius: 10, border: `1px solid ${C.border}`, height: 'calc(100% - 26px)' }}>
                        <div style={{ fontWeight: 700, color: C.navy, marginBottom: 6, fontSize: 14 }}>⭐ {week.project?.name}</div>
                        <div style={{ fontSize: 12, color: C.mid, marginBottom: 10, lineHeight: 1.5 }}>{week.project?.description}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                          {week.project?.tech?.map((tt, j) => <Badge key={j} color="blue">{tt}</Badge>)}
                        </div>
                        {week.project?.stars && <div style={{ fontSize: 12, color: C.muted }}>⭐ {week.project.stars} on GitHub</div>}
                        {week.project?.github_template && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>📦 Reference: {week.project.github_template}</div>}
                      </div>
                    </div>

                    {/* Certification */}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.mid, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>🎓 Certification</div>
                      <div style={{ padding: 14, background: C.greenBg, borderRadius: 10, border: `1px solid ${C.border}`, height: 'calc(100% - 26px)' }}>
                        <div style={{ fontWeight: 700, color: C.green, marginBottom: 6, fontSize: 14 }}>{week.certification?.name}</div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                          <Badge color="green">{week.certification?.platform}</Badge>
                          {week.certification?.free && <Badge color="green">Free</Badge>}
                        </div>
                        <div style={{ fontSize: 12, color: C.mid, marginBottom: 4 }}>⏱️ {week.certification?.duration}</div>
                        {week.certification?.url && <div style={{ fontSize: 11, color: C.muted, wordBreak: 'break-all' }}>🔗 {week.certification.url}</div>}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
//  FEATURE 3 — INTERVIEW AGENT
// ══════════════════════════════════════════════════════════════════
const InterviewAgent = ({ apiKey }) => {
  const [mode, setMode] = useState(null);
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [phase, setPhase] = useState('setup');
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [textInput, setTextInput] = useState('');
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState('');
  const recRef = useRef(null);

  const startInterview = async () => {
    if (!company.trim() || !mode) return;
    setLoading(true); setError('');
    try {
      const prompt = `You are a senior HR and Technical interviewer conducting a real job interview at ${company} for a ${role || 'Software Engineer'} position.

Generate exactly 7 interview questions as a raw JSON array — NO markdown, NO extra text:
[
  {"id":1,"type":"HR","category":"Introduction","question":"Tell me about yourself and what excites you about ${company}?"},
  {"id":2,"type":"HR","category":"Behavioral","question":"Describe a challenging project you worked on. How did you handle conflicts?"},
  {"id":3,"type":"Technical","category":"Core Concepts","question":"Explain the difference between REST and GraphQL APIs. When would you use each?"},
  {"id":4,"type":"Technical","category":"Problem Solving","question":"How would you design a URL shortener like bit.ly? Walk me through your approach."},
  {"id":5,"type":"HR","category":"Situational","question":"Where do you see yourself in 5 years, and how does ${company} fit into that plan?"},
  {"id":6,"type":"Technical","category":"System Design","question":"Design a notification system that can handle 1 million users. What are the key components?"},
  {"id":7,"type":"HR","category":"Closing","question":"Do you have any questions for me about ${company} or this ${role || 'Software Engineer'} role?"}
]
Make questions specific to ${company}'s culture, values, and ${role || 'Software Engineer'} requirements. Return ONLY the JSON array.`;
      const raw = await geminiCall(prompt, apiKey);
      const matched = raw.match(/\[[\s\S]*\]/);
      if (!matched) throw new Error("AI didn't return a proper question list.");
      const qs = JSON.parse(matched[0]);
      setQuestions(qs); setPhase('interview'); setCurrentQ(0); setAnswers([]);
      if (mode === 'voice') setTimeout(() => speakText(qs[0].question), 400);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const speakText = text => {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.88; utt.pitch = 1.05;
    utt.onstart = () => setSpeaking(true);
    utt.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utt);
  };

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setError('Speech recognition not supported. Please use Chrome browser.'); return; }
    const rec = new SR();
    rec.continuous = false; rec.interimResults = true; rec.lang = 'en-US';
    rec.onresult = e => { const t = Array.from(e.results).map(r => r[0].transcript).join(' '); setTranscript(t); };
    rec.onend = () => setListening(false);
    rec.onerror = e => { setError(e.error); setListening(false); };
    rec.start();
    recRef.current = rec;
    setListening(true); setTranscript('');
  };

  const stopListening = () => { recRef.current?.stop(); setListening(false); };

  const submitAnswer = async (ans) => {
    const answer = (ans || transcript || textInput).trim();
    if (!answer) return;
    const newAnswers = [...answers, { question: questions[currentQ].question, answer, type: questions[currentQ].type, category: questions[currentQ].category }];
    setAnswers(newAnswers); setTextInput(''); setTranscript('');
    if (currentQ + 1 < questions.length) {
      const next = currentQ + 1;
      setCurrentQ(next);
      if (mode === 'voice') setTimeout(() => speakText(questions[next].question), 500);
    } else {
      await generateResult(newAnswers);
    }
  };

  const generateResult = async (allAnswers) => {
    setLoading(true);
    try {
      const qa = allAnswers.map((a, i) => `Q${i+1} [${a.type} - ${a.category}]: ${a.question}\nCandidate Answer: ${a.answer}`).join('\n\n');
      const prompt = `You are a senior hiring decision-maker at ${company}. Rigorously evaluate this ${role || 'Software Engineer'} interview.

${qa}

Return ONLY raw JSON — no markdown:
{
  "overall_score": 78,
  "recommendation": "Strong Hire",
  "summary": "2-3 sentence honest overall assessment of the candidate",
  "question_scores": [
    {"q":1,"score":80,"feedback":"Detailed, constructive 1-2 sentence feedback for this specific answer"},
    {"q":2,"score":72,"feedback":"..."},
    {"q":3,"score":85,"feedback":"..."},
    {"q":4,"score":68,"feedback":"..."},
    {"q":5,"score":75,"feedback":"..."},
    {"q":6,"score":82,"feedback":"..."},
    {"q":7,"score":70,"feedback":"..."}
  ],
  "strengths": ["Specific strength 1","Specific strength 2","Specific strength 3"],
  "improvements": ["Specific improvement area 1","Specific improvement area 2"],
  "final_verdict": "One crisp hiring verdict sentence",
  "next_steps": "What the candidate should do next"
}
recommendation must be one of: "Strong Hire", "Hire", "Maybe", "No Hire"
Return ONLY valid JSON.`;
      const raw = await geminiCall(prompt, apiKey);
      const cleaned = raw.replace(/```json/g,'').replace(/```/g,'').trim();
      setResult(JSON.parse(cleaned));
      setPhase('result');
      window.speechSynthesis.cancel();
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const reset = () => {
    setPhase('setup'); setQuestions([]); setCurrentQ(0); setAnswers([]);
    setResult(null); setTranscript(''); setTextInput(''); setError('');
    window.speechSynthesis.cancel();
  };

  const progress = questions.length ? Math.round(((currentQ) / questions.length) * 100) : 0;
  const recColor = { 'Strong Hire': C.green, 'Hire': C.green, 'Maybe': C.amber, 'No Hire': C.red };

  return (
    <div>
      <SectionHeader icon="🎙️" title="AI Interview Agent" subtitle="Practice real HR + Technical interviews powered by Gemini AI with voice & text support" />

      {/* SETUP */}
      {phase === 'setup' && (
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 24 }}>
          <Card>
            <h3 style={{ marginTop: 0, color: C.navy, fontFamily: 'Lora, serif' }}>Configure Your Interview</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: C.mid, display: 'block', marginBottom: 6 }}>Target Company *</label>
                <input value={company} onChange={e => setCompany(e.target.value)}
                  placeholder="e.g. Google, TCS, Microsoft..."
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: 'inherit', fontSize: 14, color: C.dark, boxSizing: 'border-box', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: C.mid, display: 'block', marginBottom: 6 }}>Role</label>
                <input value={role} onChange={e => setRole(e.target.value)}
                  placeholder="e.g. Software Engineer, PM..."
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: 'inherit', fontSize: 14, color: C.dark, boxSizing: 'border-box', outline: 'none' }}
                />
              </div>
            </div>
            <div style={{ marginBottom: 22 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: C.mid, display: 'block', marginBottom: 10 }}>Interview Mode *</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { id: 'text', icon: '⌨️', label: 'Text Mode', desc: 'Type your answers at your own pace' },
                  { id: 'voice', icon: '🎙️', label: 'Voice Mode', desc: 'Speak naturally, AI listens & responds' },
                ].map(m => (
                  <div key={m.id} onClick={() => setMode(m.id)} style={{
                    padding: 16, borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                    border: `2px solid ${mode === m.id ? C.blue : C.border}`,
                    background: mode === m.id ? C.bluePale : C.bg, transition: 'all .2s',
                  }}>
                    <div style={{ fontSize: 30, marginBottom: 6 }}>{m.icon}</div>
                    <div style={{ fontWeight: 700, color: C.navy, fontSize: 14 }}>{m.label}</div>
                    <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{m.desc}</div>
                  </div>
                ))}
              </div>
            </div>
            <Btn onClick={startInterview} disabled={!company.trim() || !mode || loading} icon="🚀" full>
              {loading ? 'Preparing Interview...' : `Start Interview at ${company || '...'}`}
            </Btn>
            {error && <p style={{ color: C.red, fontSize: 13, marginTop: 10 }}>⚠️ {error}</p>}
          </Card>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card style={{ background: C.bluePale }}>
              <h4 style={{ marginTop: 0, color: C.navy }}>📋 Interview Structure</h4>
              {[
                { n: '3', t: 'HR / Behavioral', d: 'Situational & personality questions' },
                { n: '3', t: 'Technical', d: 'Role-specific problem solving' },
                { n: '1', t: 'Closing Round', d: 'Culture fit & your questions' },
              ].map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.blue, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{s.n}</div>
                  <div><div style={{ fontWeight: 600, color: C.navy, fontSize: 14 }}>{s.t}</div><div style={{ color: C.muted, fontSize: 12 }}>{s.d}</div></div>
                </div>
              ))}
            </Card>
            <Card style={{ background: C.amberBg }}>
              <h4 style={{ marginTop: 0, color: C.amber }}>💡 STAR Method Tips</h4>
              <ul style={{ color: C.mid, margin: 0, paddingLeft: 18, lineHeight: 2, fontSize: 13 }}>
                <li><b>S</b>ituation — Set the context</li>
                <li><b>T</b>ask — Describe your responsibility</li>
                <li><b>A</b>ction — Explain what you did</li>
                <li><b>R</b>esult — Share the outcome</li>
              </ul>
            </Card>
          </div>
        </div>
      )}

      {/* INTERVIEW */}
      {phase === 'interview' && questions.length > 0 && (
        <div>
          {/* Progress */}
          <Card style={{ marginBottom: 18, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontWeight: 700, color: C.navy }}>Live Interview — {company} • {role || 'Software Engineer'}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: C.muted, fontSize: 13 }}>{currentQ + 1} / {questions.length} questions</span>
                <Badge color={mode === 'voice' ? 'green' : 'blue'}>{mode === 'voice' ? '🎙️ Voice' : '⌨️ Text'}</Badge>
              </div>
            </div>
            <div style={{ background: C.bg, borderRadius: 8, overflow: 'hidden', height: 8 }}>
              <div style={{ width: `${progress}%`, height: '100%', background: C.blue, borderRadius: 8, transition: 'width .5s' }} />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              {questions.map((q, i) => (
                <div key={i} style={{
                  flex: 1, height: 4, borderRadius: 2,
                  background: i < currentQ ? C.green : i === currentQ ? C.blue : C.border,
                  transition: 'background .3s',
                }} />
              ))}
            </div>
          </Card>

          {/* Question Card */}
          <Card style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: C.blue, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 16 }}>
                Q{currentQ + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <Badge color={questions[currentQ].type === 'HR' ? 'blue' : 'amber'}>{questions[currentQ].type}</Badge>
                  <Badge color="green">{questions[currentQ].category}</Badge>
                </div>
                <p style={{ fontSize: 17, color: C.navy, margin: 0, lineHeight: 1.65, fontWeight: 500 }}>
                  {questions[currentQ].question}
                </p>
                {mode === 'voice' && (
                  <button onClick={() => speakText(questions[currentQ].question)} style={{
                    marginTop: 10, background: 'none', border: 'none', cursor: 'pointer',
                    color: C.blue, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5, padding: 0, fontFamily: 'inherit',
                  }}>
                    {speaking ? '🔊 AI is speaking...' : '🔈 Repeat Question'}
                  </button>
                )}
              </div>
            </div>
          </Card>

          {/* Answer Card */}
          <Card>
            <h4 style={{ marginTop: 0, color: C.navy }}>Your Answer</h4>

            {mode === 'text' && (
              <div>
                <textarea value={textInput} onChange={e => setTextInput(e.target.value)}
                  placeholder="Type your answer here... Use the STAR method for behavioral questions"
                  rows={6}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: 'inherit', fontSize: 14, color: C.dark, resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6, outline: 'none' }}
                />
                <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Btn onClick={() => submitAnswer(textInput)} disabled={!textInput.trim()} icon="✅">
                    {currentQ + 1 === questions.length ? 'Submit Final Answer' : 'Submit & Next Question →'}
                  </Btn>
                </div>
              </div>
            )}

            {mode === 'voice' && (
              <div>
                <div style={{
                  minHeight: 90, padding: 16, background: C.bg, borderRadius: 8, marginBottom: 14,
                  border: `2px solid ${listening ? C.blue : C.border}`, fontSize: 14, color: transcript ? C.dark : C.muted, lineHeight: 1.6, transition: 'border-color .2s',
                }}>
                  {transcript || (listening ? '🎙️ Listening... Speak your answer now' : 'Press "Start Speaking" to record your answer, then "Submit"')}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  {!listening
                    ? <Btn onClick={startListening} icon="🎙️">Start Speaking</Btn>
                    : <Btn onClick={stopListening} variant="danger" icon="⏹">Stop Recording</Btn>}
                  <Btn onClick={() => submitAnswer(transcript)} disabled={!transcript.trim() || listening} icon="✅" variant="success">
                    {currentQ + 1 === questions.length ? 'Submit Final Answer' : 'Submit & Next →'}
                  </Btn>
                  {transcript && <Btn onClick={() => setTranscript('')} variant="ghost" small>Clear</Btn>}
                </div>
                {listening && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 6, alignItems: 'center', color: C.red }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.red, animation: 'pulse 1s infinite' }} />
                    <span style={{ fontSize: 13 }}>Recording in progress...</span>
                  </div>
                )}
              </div>
            )}
            {error && <p style={{ color: C.red, fontSize: 13, marginTop: 8 }}>⚠️ {error}</p>}
          </Card>

          {answers.length > 0 && (
            <Card style={{ marginTop: 18 }}>
              <h4 style={{ marginTop: 0, color: C.muted, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>Previous Answers</h4>
              {answers.map((a, i) => (
                <div key={i} style={{ marginBottom: 10, padding: 12, background: C.bg, borderRadius: 8, borderLeft: `3px solid ${C.blue}` }}>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Q{i+1}: {a.question}</div>
                  <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.5 }}>{a.answer}</div>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* RESULT */}
      {phase === 'result' && result && (
        <div style={{ display: 'grid', gap: 20 }}>
          {/* Hero score */}
          <Card style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.blue})`, color: '#fff', padding: '32px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontFamily: 'Lora, serif', fontSize: 26 }}>Interview Complete! 🎉</h2>
                <p style={{ margin: '10px 0 0', opacity: .88, lineHeight: 1.6, fontSize: 15 }}>{result.summary}</p>
                <p style={{ margin: '8px 0 0', fontWeight: 700, opacity: .95 }}>{result.final_verdict}</p>
                {result.next_steps && <p style={{ margin: '8px 0 0', fontSize: 13, opacity: .75 }}>Next: {result.next_steps}</p>}
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 110, height: 110, borderRadius: '50%', border: '4px solid rgba(255,255,255,.35)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
                  <div style={{ fontSize: 30, fontWeight: 800 }}>{result.overall_score}</div>
                  <div style={{ fontSize: 12, opacity: .8 }}>/ 100</div>
                </div>
                <div style={{
                  marginTop: 10, padding: '5px 14px', borderRadius: 20, fontWeight: 700, fontSize: 13, display: 'inline-block',
                  background: result.recommendation === 'Strong Hire' || result.recommendation === 'Hire'
                    ? 'rgba(22,163,74,.35)' : result.recommendation === 'Maybe' ? 'rgba(180,83,9,.35)' : 'rgba(220,38,38,.35)',
                }}>{result.recommendation}</div>
              </div>
            </div>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <Card>
              <h4 style={{ marginTop: 0, color: C.green }}>✅ Strengths</h4>
              {result.strengths?.map((s, i) => (
                <div key={i} style={{ padding: '9px 12px', background: C.greenBg, borderRadius: 8, marginBottom: 8, fontSize: 14, color: C.green }}>✦ {s}</div>
              ))}
            </Card>
            <Card>
              <h4 style={{ marginTop: 0, color: C.amber }}>📈 Areas to Improve</h4>
              {result.improvements?.map((s, i) => (
                <div key={i} style={{ padding: '9px 12px', background: C.amberBg, borderRadius: 8, marginBottom: 8, fontSize: 14, color: C.amber }}>→ {s}</div>
              ))}
            </Card>
          </div>

          <Card>
            <h4 style={{ marginTop: 0, color: C.navy }}>📊 Question-by-Question Breakdown</h4>
            {result.question_scores?.map((q, i) => (
              <div key={i} style={{ padding: 14, marginBottom: 12, background: C.bg, borderRadius: 10, border: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, color: C.navy, fontSize: 14 }}>Q{q.q}: {answers[q.q-1]?.question}</span>
                  <span style={{ fontWeight: 800, fontSize: 18, color: q.score >= 80 ? C.green : q.score >= 60 ? C.amber : C.red }}>{q.score}/100</span>
                </div>
                <div style={{ fontSize: 11, marginBottom: 6 }}>
                  <Badge color={answers[q.q-1]?.type === 'HR' ? 'blue' : 'amber'}>{answers[q.q-1]?.type}</Badge>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: C.mid, lineHeight: 1.5 }}>{q.feedback}</p>
              </div>
            ))}
          </Card>

          <div style={{ display: 'flex', gap: 12 }}>
            <Btn onClick={reset} icon="🔄">Try Again</Btn>
            <Btn variant="secondary" onClick={() => { setCompany(''); setRole(''); setMode(null); reset(); }} icon="🏠">New Interview</Btn>
          </div>
        </div>
      )}

      {/* Loading overlay during evaluation */}
      {loading && phase === 'interview' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <Card style={{ textAlign: 'center', padding: 40 }}>
            <Spinner size={44} />
            <p style={{ color: C.navy, fontWeight: 700, marginTop: 18, fontSize: 16 }}>Evaluating your interview responses...</p>
            <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>AI is analyzing all {answers.length} answers</p>
          </Card>
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
//  FEATURE 4 — FLOATING CHATBOT
// ══════════════════════════════════════════════════════════════════
const FloatingChatbot = ({ apiKey }) => {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([{
    role: 'model',
    text: "👋 Hi! I'm your Career-Copilot AI assistant.\n\nAsk me anything about:\n• Career growth strategies\n• Interview preparation tips\n• Resume writing advice\n• Salary negotiation\n• How to use this platform\n\nHow can I help you today?",
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (open) { endRef.current?.scrollIntoView({ behavior: 'smooth' }); setUnread(0); }
  }, [msgs, open]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user', text: input };
    const newMsgs = [...msgs, userMsg];
    setMsgs(newMsgs); setInput(''); setLoading(true);
    try {
      const history = [
        { role: 'user', text: `System: You are Career-Copilot AI, an expert career counselor. Help users with: career strategies, interview tips, resume advice, job search, salary negotiation, skill development, and platform navigation. Be concise (3-5 sentences), practical and encouraging. If asked about platform features, explain: Resume Analyzer (upload resume → get skills analysis + company matches), Job Match Checker (compare resume vs job description → ATS score), Learning Path (8-week roadmap with DSA+projects+certs), Interview Agent (practice with voice/text, get scored).` },
        { role: 'model', text: 'Understood! I am Career-Copilot AI, your dedicated career counselor. Ready to help!' },
        ...newMsgs,
      ];
      const reply = await geminiChat(history, apiKey);
      setMsgs(p => [...p, { role: 'model', text: reply }]);
      if (!open) setUnread(u => u + 1);
    } catch (e) { setMsgs(p => [...p, { role: 'model', text: `⚠️ Error: ${e.message}` }]); }
    setLoading(false);
  };

  const quickPrompts = ['How to prepare for Google interviews?', 'Tips for salary negotiation', 'How to improve my ATS score?', 'Best certifications for SDE role'];

  return (
    <>
      {/* FAB */}
      <button onClick={() => setOpen(p => !p)} style={{
        position: 'fixed', bottom: 24, right: 24, width: 58, height: 58, borderRadius: '50%',
        background: C.navy, border: 'none', cursor: 'pointer', boxShadow: C.shadowMd,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, zIndex: 600,
        transition: 'transform .2s',
      }}>
        {open ? '✕' : '💬'}
        {!open && unread > 0 && (
          <div style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: '50%', background: C.red, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unread}</div>
        )}
      </button>

      {/* Chat Window */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 94, right: 24, width: 370, height: 520, background: C.white,
          borderRadius: 16, boxShadow: C.shadowMd, border: `1px solid ${C.border}`,
          zIndex: 599, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '14px 18px', background: C.navy, color: '#fff', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🤖</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Career AI Assistant</div>
              <div style={{ fontSize: 11, opacity: .7, display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ADE80' }} /> Online · Powered by Gemini
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '87%', padding: '9px 13px', borderRadius: 12, fontSize: 13, lineHeight: 1.55,
                  background: m.role === 'user' ? C.blue : C.bg,
                  color: m.role === 'user' ? '#fff' : C.dark,
                  border: m.role !== 'user' ? `1px solid ${C.border}` : 'none',
                  whiteSpace: 'pre-wrap',
                }}>{m.text}</div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: C.muted, fontSize: 12 }}>
                <Spinner size={14} /> Thinking...
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Quick prompts */}
          {msgs.length <= 1 && (
            <div style={{ padding: '0 12px 8px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {quickPrompts.map((p, i) => (
                <button key={i} onClick={() => { setInput(p); }} style={{
                  padding: '4px 10px', background: C.bluePale, color: C.blue, border: 'none',
                  borderRadius: 20, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                }}>{p}</button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Ask a career question..."
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: 'inherit', fontSize: 13, color: C.dark, outline: 'none' }}
            />
            <button onClick={send} disabled={loading || !input.trim()} style={{
              width: 36, height: 36, background: C.blue, color: '#fff', border: 'none', borderRadius: 8,
              cursor: 'pointer', fontWeight: 700, fontSize: 16, opacity: loading || !input.trim() ? .6 : 1,
            }}>↑</button>
          </div>
        </div>
      )}
    </>
  );
};

// ══════════════════════════════════════════════════════════════════
//  SIDEBAR
// ══════════════════════════════════════════════════════════════════
const Sidebar = ({ active, setActive }) => (
  <div style={{ width: 240, background: C.navy, display: 'flex', flexDirection: 'column', padding: '0 0 24px', position: 'sticky', top: 0, height: '100vh', flexShrink: 0 }}>
    {/* Logo */}
    <div style={{ padding: '26px 22px 20px', borderBottom: '1px solid rgba(255,255,255,.1)' }}>
      <div style={{ fontSize: 21, fontFamily: 'Lora, Georgia, serif', color: '#fff', fontWeight: 700, letterSpacing: .3 }}>Career-Copilot</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.45)', marginTop: 3, letterSpacing: 3, textTransform: 'uppercase' }}>AI Platform</div>
    </div>
    {/* Nav */}
    <nav style={{ flex: 1, padding: '16px 10px' }}>
      {NAV.map(item => (
        <button key={item.id} onClick={() => setActive(item.id)} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '11px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 14, textAlign: 'left', marginBottom: 4, transition: 'all .18s',
          background: active === item.id ? 'rgba(255,255,255,.12)' : 'transparent',
          color: active === item.id ? '#fff' : 'rgba(255,255,255,.55)',
          fontWeight: active === item.id ? 700 : 400,
        }}>
          <span style={{ fontSize: 17 }}>{item.icon}</span>
          {item.label}
          {active === item.id && <div style={{ marginLeft: 'auto', width: 5, height: 5, borderRadius: '50%', background: C.blueLight }} />}
        </button>
      ))}
    </nav>
    <div style={{ padding: '12px 22px', borderTop: '1px solid rgba(255,255,255,.1)' }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', textAlign: 'center', lineHeight: 1.5 }}></div>
    </div>
  </div>
);

// ══════════════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════════════
const Dashboard = ({ setActive }) => {
  const features = [
    { id: 'resume', icon: '📄', title: 'Resume Analyzer', badge: 'AI-Powered', color: C.blue,
      desc: 'Extract skills, projects & achievements from your resume. Get matched with top companies and check ATS score against any job role.',
      tags: ['Skill Extraction', 'Company Matching', 'ATS Scoring'] },
    { id: 'learning', icon: '🎯', title: 'Learning Path', badge: 'Personalized', color: '#15803D',
      desc: 'Get a custom 8-week roadmap with LeetCode DSA problems progressing from easy to hard, real GitHub projects, and top certifications.',
      tags: ['DSA Roadmap', 'GitHub Projects', 'Certifications'] },
    { id: 'interview', icon: '🎙️', title: 'Interview Agent', badge: 'Voice + Text', color: C.amber,
      desc: 'Practice real HR and technical interviews with AI. Speak or type your answers. Receive detailed score and hire/no-hire feedback.',
      tags: ['Voice Mode', 'Text Mode', 'Score & Feedback'] },
    { id: 'chatbot', icon: '💬', title: 'Career Chatbot', badge: 'Always On', color: '#7C3AED',
      desc: 'Your dedicated AI career advisor. Ask anything — interview strategies, salary negotiation, resume tips, job search advice.',
      tags: ['Career Q&A', 'Platform Help', 'Strategy'] },
  ];

  return (
    <div>
      <div style={{ marginBottom: 30 }}>
        <h1 style={{ fontSize: 30, fontFamily: 'Lora, Georgia, serif', color: C.navy, margin: 0, lineHeight: 1.3 }}>
          Welcome to Career-Copilot AI 👋
        </h1>
        <p style={{ color: C.muted, marginTop: 8, fontSize: 15, lineHeight: 1.5 }}>
          Your complete AI-powered career platform — from resume to offer letter.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 30 }}>
        {[
          { label: 'Resume Scans', val: '∞', icon: '📊', sub: 'Unlimited' },
          { label: 'Job Matches', val: '∞', icon: '🎯', sub: 'Unlimited' },
          { label: 'Mock Interviews', val: '∞', icon: '🎙️', sub: 'Unlimited' },
          
        ].map((s, i) => (
          <Card key={i} style={{ textAlign: 'center', padding: 18 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.navy }}>{s.val}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* Features */}
      <h2 style={{ color: C.navy, fontFamily: 'Lora, serif', marginBottom: 16, fontSize: 20, fontWeight: 700 }}>Platform Features</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 24 }}>
        {features.map(f => (
          <Card key={f.id} style={{ cursor: f.id !== 'chatbot' ? 'pointer' : 'default', transition: 'box-shadow .2s' }}
            onClick={() => f.id !== 'chatbot' && setActive(f.id)}>
            <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
              <div style={{ width: 50, height: 50, borderRadius: 12, background: f.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>{f.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ fontWeight: 700, color: C.navy, fontSize: 15 }}>{f.title}</span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 700, background: f.color + '18', color: f.color }}>{f.badge}</span>
                </div>
                <p style={{ margin: 0, color: C.mid, fontSize: 13, lineHeight: 1.55 }}>{f.desc}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {f.tags.map((tag, i) => <Badge key={i} color="blue">{tag}</Badge>)}
            </div>
            {f.id !== 'chatbot'
              ? <Btn small onClick={e => { e.stopPropagation(); setActive(f.id); }} icon="→">Open {f.title}</Btn>
              : <Btn small variant="ghost" icon="💬">Click the chat icon (bottom-right) →</Btn>}
          </Card>
        ))}
      </div>

      {/* Quick Start */}
      <Card style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.blueMed})`, color: '#fff' }}>
        <h3 style={{ margin: '0 0 18px', fontFamily: 'Lora, serif', fontSize: 18 }}>🚀 Recommended Workflow</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {[
            { n: 1, title: 'Upload Resume', sub: 'Start in Resume Analyzer', icon: '📄' },
            { n: 2, title: 'Check Eligibility', sub: 'Get ATS score for target job', icon: '🔍' },
            { n: 3, title: 'Follow Roadmap', sub: '8-week Learning Path', icon: '🗺️' },
            { n: 4, title: 'Practice Interview', sub: 'Get scored by AI agent', icon: '🎙️' },
          ].map(s => (
            <div key={s.n} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>{s.icon}</div>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,.2)', margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>{s.n}</div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{s.title}</div>
              <div style={{ fontSize: 11, opacity: .75 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
//  API KEY SETUP
// ══════════════════════════════════════════════════════════════════
 
  const ApiKeySetup = ({ onSave}) =>{
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 76, height: 76, borderRadius: 20, background: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, margin: '0 auto 18px' }}>🎓</div>
          <h1 style={{ fontFamily: 'Lora, Georgia, serif', color: C.navy, margin: 0, fontSize: 30 }}>Career-Copilot AI</h1>
          <p style={{ color: C.muted, marginTop: 8, fontSize: 15 }}>Your AI-powered career platform</p>
        </div>
        <Card>
          <h3 style={{ marginTop: 0, color: C.navy, fontFamily: 'Lora, serif' }}>Enter Your Gemini API Key</h3>
          <p style={{ color: C.mid, fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
            . Get your free API key from{' '}
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: C.blue, fontWeight: 600 }}>
              Google AI Studio ↗
            </a>
          </p>
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <input type={show ? 'text' : 'password'} value={key} onChange={e => setKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && key.trim() && onSave(key.trim())}
              placeholder="AIzaSy..."
              style={{ width: '100%', padding: '12px 44px 12px 14px', borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: 'monospace', fontSize: 14, color: C.dark, boxSizing: 'border-box', outline: 'none' }}
            />
            <button onClick={() => setShow(p => !p)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 16 }}>
              {show ? '🙈' : '👁️'}
            </button>
          </div>
          <Btn onClick={() => key.trim() && onSave(key.trim())} disabled={!key.trim()} full>
            Launch Career-Copilot AI →
          </Btn>
          <div style={{ marginTop: 16, padding: '10px 14px', background: C.bluePale, borderRadius: 8, fontSize: 12, color: C.mid, lineHeight: 1.6 }}>
            🔒 Your API key is stored only in this browser session — never sent to any server other than Google's Gemini API.
          </div>
          <div style={{ marginTop: 12, padding: '10px 14px', background: C.amberBg, borderRadius: 8, fontSize: 12, color: C.amber, lineHeight: 1.6 }}>
            ✅ All 4 features included: Resume Analyzer · Job Matcher · Learning Path · Interview Agent + Career Chatbot
          </div>
        </Card>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
//  ROOT APP
// ══════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════
//  ROOT APP
// ══════════════════════════════════════════════════════════════════
export default function App() {
  const [apiKey, setApiKey] = useState('');
  const [page, setPage]   = useState('dashboard');
  const [learningData, setLearningData] = useState(null);

  const handleRedirectToLearning = data => {
    setLearningData(data);
    setPage('learning');
  };

  if (!apiKey) return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;600;700&family=Source+Sans+3:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Source Sans 3', sans-serif; background: ${C.bg}; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.25} }
        input:focus, textarea:focus { border-color: ${C.blue} !important; box-shadow: 0 0 0 3px rgba(21,84,173,.12) !important; }
      `}</style>
      <ApiKeySetup onSave={setApiKey} />
    </>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;600;700&family=Source+Sans+3:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; font-family: 'Source Sans 3', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.25} }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
        input:focus, textarea:focus { border-color: ${C.blue} !important; box-shadow: 0 0 0 3px rgba(21,84,173,.12) !important; }
      `}</style>

      <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: "'Source Sans 3', sans-serif" }}>
        <Sidebar active={page} setActive={setPage} />
        <main style={{ flex: 1, padding: 32, overflowY: 'auto', maxHeight: '100vh' }}>
          {page === 'dashboard' && <Dashboard setActive={setPage} />}
          {page === 'resume'    && <ResumeAnalyzer apiKey={apiKey} onRedirectToLearning={handleRedirectToLearning} />}
          {page === 'learning'  && <LearningPath apiKey={apiKey} targetData={learningData} />}
          {page === 'interview' && <InterviewAgent apiKey={apiKey} />}
        </main>
        <FloatingChatbot apiKey={apiKey} />
      </div>
    </>
  );
}