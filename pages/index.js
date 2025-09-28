// DropdownCard: Modern collapsible card for all panels
function DropdownCard({ title, open, setOpen, children, accent, icon }) {
  return (
    <div style={{ background: 'linear-gradient(135deg,#f8fafc 0%,#e0e7ef 100%)', borderRadius: 16, boxShadow: '0 2px 16px #e0e7ef', marginBottom: 16, border: open ? `2px solid ${accent || '#38bdf8'}` : '1px solid #cbd5e1', transition: 'border 0.2s' }}>
      <button type="button" onClick={()=>setOpen(o=>!o)} style={{ width: '100%', background: 'none', border: 'none', color: accent || '#334155', fontWeight: 700, fontSize: 19, padding: '18px 0 14px 0', cursor: 'pointer', borderRadius: '16px 16px 0 0', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 22 }}>{open ? '▼' : '▶'}</span>
        {icon && <span style={{ fontSize: 22 }}>{icon}</span>}
        <span>{title}</span>
      </button>
      {open && (
        <div style={{ padding: 22 }}>{children}</div>
      )}
    </div>
  );
}
import { useEffect, useState } from 'react';

export default function Home() {
  const [docs, setDocs] = useState([]);
  const [leftDoc, setLeftDoc] = useState(null);
  const [rightDoc, setRightDoc] = useState(null);
  const [overviewsLeft, setOverviewsLeft] = useState([]);
  const [passagesLeft, setPassagesLeft] = useState([]);
  const [overviewsRight, setOverviewsRight] = useState([]);
  const [passagesRight, setPassagesRight] = useState([]);

  // Dropdown open/close state for all panels
  const [uploadOpen, setUploadOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(true);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  // Helper function to get document title by ID
  const getDocTitle = (docId) => {
    const doc = docs.find(d => d.document_id === docId);
    return doc ? doc.title : 'Select Document';
  };

  useEffect(() => { fetch('/api/documents').then(r=>r.json()).then(d=>setDocs(d.documents)); }, []);

  async function loadDoc(id, side) {
    const r = await fetch(`/api/document/${id}`);
    const j = await r.json();
    if (side === 'left') { setLeftDoc(id); setOverviewsLeft(j.overviews); setPassagesLeft(j.passages); }
    else { setRightDoc(id); setOverviewsRight(j.overviews); setPassagesRight(j.passages); }
  }

  const [sidebarOpen, setSidebarOpen] = useState(true);
  return (
    <div style={{ display: 'flex', height: '100vh', background: 'linear-gradient(90deg, #f8fafc 0%, #e0e7ef 100%)', fontFamily: 'Segoe UI, Arial, sans-serif' }}>
      <aside style={{ width: sidebarOpen ? 340 : 56, borderRight: '1px solid #cbd5e1', background: '#f1f5f9', padding: sidebarOpen ? 24 : 8, boxShadow: '2px 0 8px #e0e7ef', display: 'flex', flexDirection: 'column', gap: 24, transition: 'width 0.2s, padding 0.2s' }}>
        <button onClick={()=>setSidebarOpen(o=>!o)} style={{ background: 'none', border: 'none', color: '#334155', fontSize: 22, fontWeight: 700, cursor: 'pointer', marginBottom: 12, alignSelf: 'flex-end' }}>{sidebarOpen ? '⏴' : '⏵'}</button>
        {sidebarOpen && <h2 style={{ fontWeight: 700, fontSize: 24, color: '#334155', marginBottom: 12 }}>📚 Documents</h2>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {docs.map(d => (
            <li key={d.document_id} style={{ marginBottom: 10, borderRadius: 8, background: leftDoc === d.document_id ? '#e0e7ef' : rightDoc === d.document_id ? '#f3e8ff' : '#fff', boxShadow: '0 1px 4px #e0e7ef', padding: sidebarOpen ? '8px 12px' : '8px 4px', transition: 'background 0.2s, padding 0.2s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: '#475569', fontSize: sidebarOpen ? 16 : 0 }}>{sidebarOpen ? d.title : ''}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={{ background: '#38bdf8', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 500 }} onClick={()=>loadDoc(d.document_id,'left')}>L</button>
                  <button style={{ background: '#a78bfa', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 500 }} onClick={()=>loadDoc(d.document_id,'right')}>R</button>
                  {sidebarOpen && <RecomputeButton documentId={d.document_id} />}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {sidebarOpen && (
          <div style={{ margin: '18px 0 0 0', borderTop: '1px solid #cbd5e1', paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <DropdownCard title="Upload Document" open={uploadOpen} setOpen={setUploadOpen} accent="#38bdf8" icon="📤">
              <UploadForm onUploaded={() => fetch('/api/documents').then(r=>r.json()).then(d=>setDocs(d.documents))} />
            </DropdownCard>
            <DropdownCard title="Ask" open={askOpen} setOpen={setAskOpen} accent="#a3e635" icon="💬">
              <QueryPanel />
            </DropdownCard>
            <DropdownCard title="Search" open={searchOpen} setOpen={setSearchOpen} accent="#fbbf24" icon="🔍">
              <SearchPanel />
            </DropdownCard>
          </div>
        )}
      </aside>

      <main style={{ flex: 1, padding: '32px 32px 0 32px', minHeight: 0, overflow: 'auto', background: 'linear-gradient(90deg, #f8fafc 0%, #e0e7ef 100%)' }}>
        <div style={{ width: '100%', height: '100%' }}>
          {/* Dual Viewer Panels */}
          <div style={{ display: 'flex', gap: 24, height: '100%', paddingTop: 24 }}>
            <div style={{ flex: 1 }}>
              <DropdownCard title={getDocTitle(leftDoc)} open={leftOpen} setOpen={setLeftOpen} accent="#818cf8" icon="�">
                <Viewer overviews={overviewsLeft} passages={passagesLeft} />
              </DropdownCard>
            </div>
            <div style={{ flex: 1 }}>
              <DropdownCard title={getDocTitle(rightDoc)} open={rightOpen} setOpen={setRightOpen} accent="#f472b6" icon="📖">
                <Viewer overviews={overviewsRight} passages={passagesRight} />
              </DropdownCard>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Viewer({ overviews, passages }) {
  return (
    <div>
      <h5>Overviews</h5>
      <ul>{(overviews||[]).map(o=> <li key={o.overview_id}><strong>{o.label}</strong>: {o.summary}</li>)}</ul>
      <h5>Passages</h5>
      <div>{(passages||[]).map(p=> <p key={p.passage_id}><strong>{p.label}</strong> {p.content}</p>)}</div>
    </div>
  );
}

function UploadForm({ onUploaded }) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [tradition, setTradition] = useState('');
  const [language, setLanguage] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [open, setOpen] = useState(false);

  async function submit(e) {
    e.preventDefault();
    await fetch('/api/upload', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ title, author, tradition, language, estimated_date: date, notes, text }) });
    setTitle(''); setText(''); setFileName(''); if (onUploaded) onUploaded();
  }

  async function onFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!f.name.endsWith('.txt')) {
      alert('Please upload a .txt file');
      return;
    }
    setFileName(f.name);
    const txt = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.onerror = rej;
      reader.readAsText(f);
    });
    setText(txt);
  }

  return (
    <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px #e0e7ef', marginBottom: 12 }}>
      <button type="button" onClick={()=>setOpen(o=>!o)} style={{ width: '100%', background: 'none', border: 'none', color: '#334155', fontWeight: 700, fontSize: 18, padding: '14px 0', cursor: 'pointer', borderBottom: open ? '1px solid #38bdf8' : '1px solid #cbd5e1', borderRadius: '12px 12px 0 0', textAlign: 'left', transition: 'border 0.2s' }}>
        {open ? '▼' : '▶'} Upload Document
      </button>
      {open && (
        <form onSubmit={submit} style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <input placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} required style={{ flex: 1, borderRadius: 8, border: '1px solid #cbd5e1', padding: 8, fontSize: 15 }} />
            <input placeholder="Author" value={author} onChange={e=>setAuthor(e.target.value)} style={{ flex: 1, borderRadius: 8, border: '1px solid #cbd5e1', padding: 8, fontSize: 15 }} />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <input placeholder="Tradition" value={tradition} onChange={e=>setTradition(e.target.value)} style={{ flex: 1, borderRadius: 8, border: '1px solid #cbd5e1', padding: 8, fontSize: 15 }} />
            <input placeholder="Language" value={language} onChange={e=>setLanguage(e.target.value)} style={{ flex: 1, borderRadius: 8, border: '1px solid #cbd5e1', padding: 8, fontSize: 15 }} />
            <input placeholder="Estimated date" value={date} onChange={e=>setDate(e.target.value)} style={{ flex: 1, borderRadius: 8, border: '1px solid #cbd5e1', padding: 8, fontSize: 15 }} />
          </div>
          <textarea placeholder="Notes" value={notes} onChange={e=>setNotes(e.target.value)} style={{ borderRadius: 8, border: '1px solid #cbd5e1', padding: 8, fontSize: 15, minHeight: 40 }} />
          <div style={{ marginBottom: 6 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, color: '#475569' }}>Upload .txt file (optional)</label>
            <input type="file" accept=".txt" onChange={onFile} style={{ borderRadius: 8, border: '1px solid #cbd5e1', padding: 6 }} />
            {fileName && <div style={{ fontSize: 13, marginTop: 6, color: '#38bdf8' }}>Loaded: {fileName}</div>}
          </div>
          <textarea placeholder="Full text" value={text} onChange={e=>setText(e.target.value)} rows={8} required style={{ borderRadius: 8, border: '1px solid #cbd5e1', padding: 8, fontSize: 15, minHeight: 80 }} />
          <button type="submit" style={{ background: '#38bdf8', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 600, fontSize: 16, cursor: 'pointer', marginTop: 8 }}>Upload</button>
        </form>
      )}
    </div>
  );
}

function QueryPanel() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  async function run() {
    const r = await fetch('/api/query', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ question: q })});
    let j = null;
    try {
      j = await r.json();
    } catch (e) {
      j = { error: 'Invalid JSON response from server' };
    }
    if (!r.ok) {
      setRes({ error: j.error || j.details || `HTTP ${r.status}`, status: r.status, raw: j });
    } else {
      setRes(j);
    }
  }
  return (
    <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px #e0e7ef', padding: 18, marginBottom: 12 }}>
      <h4 style={{ fontWeight: 700, fontSize: 18, color: '#334155', marginBottom: 10 }}>Ask</h4>
      <textarea value={q} onChange={e=>setQ(e.target.value)} rows={3} style={{ width: '100%', borderRadius: 8, border: '1px solid #cbd5e1', padding: 8, fontSize: 15, marginBottom: 8, outline: 'none', boxShadow: q ? '0 0 0 2px #38bdf8' : 'none', transition: 'box-shadow 0.2s' }} />
      <button onClick={run} style={{ background: '#38bdf8', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 18px', fontWeight: 600, fontSize: 15, cursor: 'pointer', marginBottom: 10 }}>Run</button>
      {res && <div style={{ marginTop: 14 }}>
        <div style={{ background: '#f1f5f9', borderRadius: 8, padding: 12, marginBottom: 10 }}>
          <h5 style={{ fontWeight: 600, color: '#475569', marginBottom: 6 }}>SQL</h5>
          <pre style={{ background: '#e0e7ef', borderRadius: 6, padding: 8, fontSize: 14 }}>{res.sql}</pre>
        </div>
        <div style={{ background: '#f1f5f9', borderRadius: 8, padding: 12, marginBottom: 10 }}>
          <h5 style={{ fontWeight: 600, color: '#475569', marginBottom: 6 }}>Results <span style={{ color: '#38bdf8', fontWeight: 500 }}>({res.data_count ?? (res.data ? (Array.isArray(res.data) ? res.data.length : 1) : 0)})</span></h5>
          <pre style={{ background: '#e0e7ef', borderRadius: 6, padding: 8, fontSize: 14, color: '#334155', maxHeight: 180, overflowY: 'auto' }}>{JSON.stringify(res.data || res.data_sample || [], null, 2)}</pre>
        </div>
        <div style={{ background: '#f1f5f9', borderRadius: 8, padding: 12 }}>
          <h5 style={{ fontWeight: 600, color: '#475569', marginBottom: 6 }}>Summary</h5>
          <div style={{ fontSize: 15, color: '#334155' }}>{res.summary}</div>
        </div>
        {res.rewritten && res.original_sql && <div style={{ marginTop: 8, fontSize: 12 }}><em>Original SQL:</em><pre style={{ background: '#e0e7ef', borderRadius: 6, padding: 8 }}>{res.original_sql}</pre></div>}
        {res.error && <div style={{ color: '#ef4444', fontWeight: 600, marginTop: 10 }}>Error: {res.error}</div>}
      </div>}
    </div>
  );
}

function RecomputeButton({ documentId }) {
  const [status, setStatus] = useState(null);
  async function run() {
    if (!confirm('Run theme scoring for this document?')) return;
    setStatus('running');
    try {
      const r = await fetch('/api/recompute-passage-themes', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ document_id: documentId }) });
      const j = await r.json();
      if (r.ok) setStatus('done');
      else setStatus('error');
    } catch (e) {
      setStatus('error');
    }
    setTimeout(()=>setStatus(null), 5000);
  }
  return (
    <button style={{ marginLeft: 8 }} onClick={run}>{status === 'running' ? 'Running...' : status === 'done' ? 'Done' : 'Recompute'}</button>
  );
}

function SearchPanel() {
  const [q, setQ] = useState('');
  const [mode, setMode] = useState('text');
  const [results, setResults] = useState([]);
  const [page, setPage] = useState(0);
  const limit = 10;

  async function run(pageNum = 0) {
    const body = { q, mode, limit, offset: pageNum * limit };
    const r = await fetch('/api/search', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const j = await r.json();
    setResults(j.results || j.results || []);
    setPage(pageNum);
  }

  return (
    <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px #e0e7ef', padding: 18, marginBottom: 12 }}>
      <h4 style={{ fontWeight: 700, fontSize: 18, color: '#334155', marginBottom: 10 }}>Search</h4>
      <input placeholder="Search query" value={q} onChange={e=>setQ(e.target.value)} style={{ width: '100%', borderRadius: 8, border: '1px solid #cbd5e1', padding: 8, fontSize: 15, marginBottom: 8, outline: 'none', boxShadow: q ? '0 0 0 2px #a78bfa' : 'none', transition: 'box-shadow 0.2s' }} />
      <select value={mode} onChange={e=>setMode(e.target.value)} style={{ borderRadius: 8, border: '1px solid #cbd5e1', padding: '6px 12px', fontSize: 15, marginBottom: 8, marginLeft: 4 }}>
        <option value="text">Text</option>
        <option value="vector">Vector</option>
      </select>
      <button onClick={()=>run(0)} style={{ background: '#a78bfa', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 18px', fontWeight: 600, fontSize: 15, cursor: 'pointer', marginBottom: 10, marginLeft: 8 }}>Search</button>
      <div style={{ marginTop: 10 }}>
        {(results || []).map(r => (
          <div key={r.passage_id} style={{ borderRadius: 8, background: '#f3e8ff', boxShadow: '0 1px 4px #e0e7ef', padding: 10, marginBottom: 8, borderLeft: '4px solid #a78bfa' }}>
            <div style={{ fontWeight: 600, color: '#7c3aed', marginBottom: 4 }}>Passage {r.passage_id} <span style={{ color: '#38bdf8', fontWeight: 500 }}>score: {r.score || r.rank}</span></div>
            <div style={{ color: '#334155', fontSize: 15 }}>{r.content}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={()=>run(Math.max(0,page-1))} style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 14px', fontWeight: 500, fontSize: 15, cursor: 'pointer' }}>Prev</button>
        <button onClick={()=>run(page+1)} style={{ background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 14px', fontWeight: 500, fontSize: 15, cursor: 'pointer' }}>Next</button>
      </div>
    </div>
  );
}
