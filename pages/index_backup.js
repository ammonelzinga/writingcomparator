// DropdownCard: Modern collapsible card for all panels
function DropdownCard({ title, open, setOpen, children, accent, icon }) {
  return (
    <div style={{ 
      background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', 
      borderRadius: 12, 
      boxShadow: open ? `0 8px 32px rgba(0,0,0,0.12), 0 0 0 2px ${accent || '#38bdf8'}` : '0 4px 16px rgba(0,0,0,0.08)', 
      marginBottom: 16, 
      border: '1px solid #e2e8f0',
      overflow: 'hidden',
      transition: 'all 0.3s ease'
    }}>
      <button 
        type="button" 
        onClick={()=>setOpen(o=>!o)} 
        style={{ 
          width: '100%', 
          background: open ? `linear-gradient(135deg, ${accent || '#38bdf8'}15, ${accent || '#38bdf8'}08)` : 'transparent',
          border: 'none', 
          color: open ? accent || '#1e40af' : '#475569', 
          fontWeight: 600, 
          fontSize: 16, 
          padding: '16px 20px', 
          cursor: 'pointer', 
          textAlign: 'left', 
          display: 'flex', 
          alignItems: 'center', 
          gap: 12,
          transition: 'all 0.2s ease',
          ':hover': { background: `${accent || '#38bdf8'}10` }
        }}
      >
        <span style={{ fontSize: 14, opacity: 0.8, transition: 'transform 0.2s ease', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
        {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
        <span style={{ flex: 1 }}>{title}</span>
      </button>
      {open && (
        <div style={{ 
          padding: '0 20px 20px 20px',
          background: '#fefefe',
          borderTop: '1px solid #f1f5f9'
        }}>{children}</div>
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
  
  // Store all overviews for each document
  const [docOverviews, setDocOverviews] = useState({});
  const [expandedDocs, setExpandedDocs] = useState({});
  const [selectedOverviewLeft, setSelectedOverviewLeft] = useState(null);
  const [selectedOverviewRight, setSelectedOverviewRight] = useState(null);

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
  
  // Helper function to get overview title
  const getOverviewTitle = (side) => {
    if (side === 'left' && selectedOverviewLeft) {
      const overview = overviewsLeft[0];
      return overview ? `${getDocTitle(leftDoc)} - ${overview.label}` : 'Select Overview';
    }
    if (side === 'right' && selectedOverviewRight) {
      const overview = overviewsRight[0];
      return overview ? `${getDocTitle(rightDoc)} - ${overview.label}` : 'Select Overview';
    }
    return side === 'left' ? (leftDoc ? getDocTitle(leftDoc) : 'Select Document') : (rightDoc ? getDocTitle(rightDoc) : 'Select Document');
  };

  useEffect(() => { 
    fetch('/api/documents').then(r=>r.json()).then(d=>{
      setDocs(d.documents);
      // Load overviews for each document
      d.documents.forEach(doc => loadDocOverviews(doc.document_id));
    }); 
  }, []);

  async function loadDocOverviews(docId) {
    const r = await fetch(`/api/document/${docId}`);
    const j = await r.json();
    setDocOverviews(prev => ({ ...prev, [docId]: j.overviews || [] }));
  }

  async function loadOverview(overviewId, side) {
    const r = await fetch(`/api/overview/${overviewId}`);
    const j = await r.json();
    if (side === 'left') { 
      setSelectedOverviewLeft(overviewId);
      setOverviewsLeft([j.overview]); 
      setPassagesLeft(j.passages || []); 
      setLeftDoc(j.overview.document_id);
    } else { 
      setSelectedOverviewRight(overviewId);
      setOverviewsRight([j.overview]); 
      setPassagesRight(j.passages || []); 
      setRightDoc(j.overview.document_id);
    }
  }

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
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {docs.map(d => {
            const isExpanded = expandedDocs[d.document_id];
            const overviews = docOverviews[d.document_id] || [];
            return (
              <div key={d.document_id} style={{ marginBottom: 12 }}>
                <div style={{ 
                  borderRadius: 8, 
                  background: (leftDoc === d.document_id && !selectedOverviewLeft) || (rightDoc === d.document_id && !selectedOverviewRight) ? '#e0e7ef' : '#fff', 
                  boxShadow: '0 1px 4px #e0e7ef', 
                  transition: 'background 0.2s'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    padding: sidebarOpen ? '8px 12px' : '8px 4px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                      {sidebarOpen && (
                        <button 
                          onClick={() => setExpandedDocs(prev => ({ ...prev, [d.document_id]: !prev[d.document_id] }))}
                          style={{ 
                            background: 'none', 
                            border: 'none', 
                            color: '#64748b', 
                            cursor: 'pointer',
                            fontSize: 12,
                            padding: 2,
                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s'
                          }}
                        >
                          ▶
                        </button>
                      )}
                      <span style={{ 
                        fontWeight: 600, 
                        color: '#475569', 
                        fontSize: sidebarOpen ? 14 : 0,
                        flex: 1
                      }}>
                        {sidebarOpen ? d.title : ''}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button 
                        style={{ 
                          background: '#38bdf8', 
                          color: '#fff', 
                          border: 'none', 
                          borderRadius: 4, 
                          padding: '3px 8px', 
                          cursor: 'pointer', 
                          fontWeight: 500,
                          fontSize: 12
                        }} 
                        onClick={() => {
                          setLeftDoc(d.document_id);
                          setSelectedOverviewLeft(null);
                          loadDoc(d.document_id, 'left');
                        }}
                      >
                        L
                      </button>
                      <button 
                        style={{ 
                          background: '#a78bfa', 
                          color: '#fff', 
                          border: 'none', 
                          borderRadius: 4, 
                          padding: '3px 8px', 
                          cursor: 'pointer', 
                          fontWeight: 500,
                          fontSize: 12
                        }} 
                        onClick={() => {
                          setRightDoc(d.document_id);
                          setSelectedOverviewRight(null);
                          loadDoc(d.document_id, 'right');
                        }}
                      >
                        R
                      </button>
                      {sidebarOpen && <RecomputeButton documentId={d.document_id} />}
                    </div>
                  </div>
                  
                  {/* Overviews List */}
                  {sidebarOpen && isExpanded && overviews.length > 0 && (
                    <div style={{ 
                      borderTop: '1px solid #e2e8f0',
                      padding: '8px 12px 8px 32px'
                    }}>
                      {overviews.map(overview => (
                        <div key={overview.overview_id} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '4px 8px',
                          marginBottom: 4,
                          borderRadius: 6,
                          background: selectedOverviewLeft === overview.overview_id || selectedOverviewRight === overview.overview_id ? '#f0f9ff' : 'transparent',
                          border: selectedOverviewLeft === overview.overview_id || selectedOverviewRight === overview.overview_id ? '1px solid #bae6fd' : '1px solid transparent',
                          transition: 'all 0.2s'
                        }}>  
                          <div style={{
                            fontSize: 13,
                            color: '#64748b',
                            fontWeight: 500,
                            flex: 1
                          }}>
                            {overview.label}
                          </div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              onClick={() => loadOverview(overview.overview_id, 'left')}
                              style={{
                                background: selectedOverviewLeft === overview.overview_id ? '#38bdf8' : '#e2e8f0',
                                color: selectedOverviewLeft === overview.overview_id ? '#fff' : '#64748b',
                                border: 'none',
                                borderRadius: 3,
                                padding: '2px 6px',
                                fontSize: 10,
                                fontWeight: 500,
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                              }}
                            >
                              L
                            </button>
                            <button
                              onClick={() => loadOverview(overview.overview_id, 'right')}
                              style={{
                                background: selectedOverviewRight === overview.overview_id ? '#a78bfa' : '#e2e8f0',
                                color: selectedOverviewRight === overview.overview_id ? '#fff' : '#64748b',
                                border: 'none',
                                borderRadius: 3,
                                padding: '2px 6px',
                                fontSize: 10,
                                fontWeight: 500,
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                              }}
                            >
                              R
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: 20,
      height: '100%',
      minHeight: '60vh',
      overflowY: 'auto',
      paddingRight: 8
    }}>
      {/* Overviews Section */}
      {overviews && overviews.length > 0 && (
        <div>
          <h4 style={{ 
            fontSize: 18, 
            fontWeight: 600, 
            color: '#1e293b', 
            marginBottom: 12,
            borderBottom: '2px solid #e2e8f0',
            paddingBottom: 8,
            position: 'sticky',
            top: 0,
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(4px)',
            zIndex: 1
          }}>📊 Overviews</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {overviews.map(o => (
              <div key={o.overview_id} style={{
                background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                borderRadius: 8,
                padding: 16,
                border: '1px solid #bae6fd',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
              }}>
                <div style={{ fontWeight: 600, color: '#0369a1', marginBottom: 6, fontSize: 15 }}>{o.label}</div>
                <div style={{ color: '#475569', fontSize: 14, lineHeight: 1.5 }}>{o.summary}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Passages Section */}
      {passages && passages.length > 0 && (
        <div>
          <h4 style={{ 
            fontSize: 18, 
            fontWeight: 600, 
            color: '#1e293b', 
            marginBottom: 12,
            borderBottom: '2px solid #e2e8f0',
            paddingBottom: 8,
            position: 'sticky',
            top: 0,
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(4px)',
            zIndex: 1
          }}>📜 Passages</h4>
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: 12
          }}>
            {passages.map(p => (
              <div key={p.passage_id} style={{
                background: 'linear-gradient(135deg, #fefce8 0%, #fef3c7 100%)',
                borderRadius: 8,
                padding: 16,
                border: '1px solid #fde68a',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
              }}>
                <div style={{ fontWeight: 600, color: '#92400e', marginBottom: 8, fontSize: 15 }}>{p.label}</div>
                <div style={{ color: '#374151', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{p.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {(!overviews || overviews.length === 0) && (!passages || passages.length === 0) && (
        <div style={{
          textAlign: 'center',
          padding: 40,
          color: '#9ca3af',
          fontSize: 16,
          minHeight: '200px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📚</div>
          <div>Select a document to view its content</div>
        </div>
      )}
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
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <input 
          placeholder="Title *" 
          value={title} 
          onChange={e=>setTitle(e.target.value)} 
          required 
          style={{ 
            borderRadius: 8, 
            border: title ? '2px solid #38bdf8' : '1px solid #e2e8f0', 
            padding: 12, 
            fontSize: 14,
            outline: 'none',
            transition: 'border-color 0.2s ease'
          }} 
        />
        <input 
          placeholder="Author" 
          value={author} 
          onChange={e=>setAuthor(e.target.value)} 
          style={{ 
            borderRadius: 8, 
            border: author ? '2px solid #38bdf8' : '1px solid #e2e8f0', 
            padding: 12, 
            fontSize: 14,
            outline: 'none',
            transition: 'border-color 0.2s ease'
          }} 
        />
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <input 
          placeholder="Tradition" 
          value={tradition} 
          onChange={e=>setTradition(e.target.value)} 
          style={{ 
            borderRadius: 8, 
            border: tradition ? '2px solid #38bdf8' : '1px solid #e2e8f0', 
            padding: 12, 
            fontSize: 14,
            outline: 'none',
            transition: 'border-color 0.2s ease'
          }} 
        />
        <input 
          placeholder="Language" 
          value={language} 
          onChange={e=>setLanguage(e.target.value)} 
          style={{ 
            borderRadius: 8, 
            border: language ? '2px solid #38bdf8' : '1px solid #e2e8f0', 
            padding: 12, 
            fontSize: 14,
            outline: 'none',
            transition: 'border-color 0.2s ease'
          }} 
        />
        <input 
          placeholder="Date" 
          value={date} 
          onChange={e=>setDate(e.target.value)} 
          style={{ 
            borderRadius: 8, 
            border: date ? '2px solid #38bdf8' : '1px solid #e2e8f0', 
            padding: 12, 
            fontSize: 14,
            outline: 'none',
            transition: 'border-color 0.2s ease'
          }} 
        />
      </div>
      
      <textarea 
        placeholder="Notes (optional)" 
        value={notes} 
        onChange={e=>setNotes(e.target.value)} 
        style={{ 
          borderRadius: 8, 
          border: notes ? '2px solid #38bdf8' : '1px solid #e2e8f0', 
          padding: 12, 
          fontSize: 14, 
          minHeight: 60,
          outline: 'none',
          resize: 'vertical',
          transition: 'border-color 0.2s ease'
        }} 
      />
      
      <div style={{ 
        border: '2px dashed #e2e8f0', 
        borderRadius: 8, 
        padding: 16, 
        textAlign: 'center',
        background: fileName ? 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)' : '#fafbfc',
        transition: 'all 0.2s ease'
      }}>
        <label style={{ 
          display: 'block', 
          cursor: 'pointer',
          color: fileName ? '#166534' : '#64748b',
          fontWeight: 500,
          fontSize: 14
        }}>
          📁 {fileName ? `Loaded: ${fileName}` : 'Upload .txt file (optional)'}
          <input 
            type="file" 
            accept=".txt" 
            onChange={onFile} 
            style={{ display: 'none' }}
          />
        </label>
      </div>
      
      <textarea 
        placeholder="Document text *" 
        value={text} 
        onChange={e=>setText(e.target.value)} 
        rows={6} 
        required 
        style={{ 
          borderRadius: 8, 
          border: text ? '2px solid #38bdf8' : '1px solid #e2e8f0', 
          padding: 12, 
          fontSize: 14, 
          minHeight: 120,
          outline: 'none',
          resize: 'vertical',
          fontFamily: 'ui-monospace, Monaco, Consolas, monospace',
          transition: 'border-color 0.2s ease'
        }} 
      />
      
      <button 
        type="submit" 
        style={{ 
          background: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)', 
          color: '#fff', 
          border: 'none', 
          borderRadius: 8, 
          padding: '14px 24px', 
          fontWeight: 600, 
          fontSize: 16, 
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(56, 189, 248, 0.3)',
          transition: 'all 0.2s ease',
          alignSelf: 'flex-start'
        }}
        onMouseOver={e => e.target.style.transform = 'translateY(-1px)'}
        onMouseOut={e => e.target.style.transform = 'translateY(0)'}
      >
        🚀 Upload Document
      </button>
    </form>
  );
}

function QueryPanel() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  
  async function run() {
    if (!q.trim()) return;
    setLoading(true);
    try {
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
    } finally {
      setLoading(false);
    }
  }
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <textarea 
          value={q} 
          onChange={e=>setQ(e.target.value)} 
          placeholder="Ask a question about your documents..."
          rows={3} 
          style={{ 
            width: '100%', 
            borderRadius: 8, 
            border: q ? '2px solid #a3e635' : '1px solid #e2e8f0', 
            padding: 12, 
            fontSize: 14, 
            outline: 'none', 
            resize: 'vertical',
            fontFamily: 'inherit',
            transition: 'border-color 0.2s ease'
          }} 
        />
        <button 
          onClick={run} 
          disabled={loading || !q.trim()}
          style={{ 
            background: loading ? '#94a3b8' : '#a3e635', 
            color: '#fff', 
            border: 'none', 
            borderRadius: 8, 
            padding: '12px 24px', 
            fontWeight: 600, 
            fontSize: 14, 
            cursor: loading || !q.trim() ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s ease',
            alignSelf: 'flex-start'
          }}
        >
          {loading ? '🔄 Running...' : '🚀 Run Query'}
        </button>
      </div>
      
      {res && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          {res.sql && (
            <div style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', borderRadius: 8, padding: 16, border: '1px solid #e2e8f0' }}>
              <h5 style={{ fontWeight: 600, color: '#475569', marginBottom: 8, fontSize: 14 }}>🔍 Generated SQL</h5>
              <pre style={{ 
                background: '#1e293b', 
                color: '#e2e8f0', 
                borderRadius: 6, 
                padding: 12, 
                fontSize: 12, 
                overflow: 'auto',
                fontFamily: 'Monaco, Consolas, monospace'
              }}>{res.sql}</pre>
            </div>
          )}
          
          {res.data && (
            <div style={{ background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)', borderRadius: 8, padding: 16, border: '1px solid #bbf7d0' }}>
              <h5 style={{ fontWeight: 600, color: '#166534', marginBottom: 8, fontSize: 14 }}>📊 Results ({res.data_count ?? (Array.isArray(res.data) ? res.data.length : 1)})</h5>
              <pre style={{ 
                background: '#ffffff', 
                borderRadius: 6, 
                padding: 12, 
                fontSize: 12, 
                color: '#374151', 
                maxHeight: 200, 
                overflowY: 'auto',
                border: '1px solid #d1fae5',
                fontFamily: 'Monaco, Consolas, monospace'
              }}>{JSON.stringify(res.data || res.data_sample || [], null, 2)}</pre>
            </div>
          )}
          
          {res.summary && (
            <div style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fef7cd 100%)', borderRadius: 8, padding: 16, border: '1px solid #fde68a' }}>
              <h5 style={{ fontWeight: 600, color: '#92400e', marginBottom: 8, fontSize: 14 }}>💡 Summary</h5>
              <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.5 }}>{res.summary}</div>
            </div>
          )}
          
          {res.error && (
            <div style={{ background: 'linear-gradient(135deg, #fef2f2 0%, #fef7f7 100%)', borderRadius: 8, padding: 16, border: '1px solid #fecaca' }}>
              <h5 style={{ fontWeight: 600, color: '#dc2626', marginBottom: 8, fontSize: 14 }}>❌ Error</h5>
              <div style={{ color: '#dc2626', fontSize: 14 }}>{res.error}</div>
            </div>
          )}
        </div>
      )}
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
  const [loading, setLoading] = useState(false);
  const limit = 10;

  async function run(pageNum = 0) {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const body = { q, mode, limit, offset: pageNum * limit };
      const r = await fetch('/api/search', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const j = await r.json();
      setResults(j.results || []);
      setPage(pageNum);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input 
          placeholder="Search your documents..." 
          value={q} 
          onChange={e=>setQ(e.target.value)} 
          style={{ 
            width: '100%', 
            borderRadius: 8, 
            border: q ? '2px solid #fbbf24' : '1px solid #e2e8f0', 
            padding: 12, 
            fontSize: 14, 
            outline: 'none',
            transition: 'border-color 0.2s ease'
          }} 
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select 
            value={mode} 
            onChange={e=>setMode(e.target.value)} 
            style={{ 
              borderRadius: 8, 
              border: '1px solid #e2e8f0', 
              padding: '8px 12px', 
              fontSize: 14,
              background: '#fff',
              cursor: 'pointer'
            }}
          >
            <option value="text">📝 Text Search</option>
            <option value="vector">🧠 Semantic Search</option>
          </select>
          <button 
            onClick={()=>run(0)} 
            disabled={loading || !q.trim()}
            style={{ 
              background: loading ? '#94a3b8' : '#fbbf24', 
              color: '#fff', 
              border: 'none', 
              borderRadius: 8, 
              padding: '8px 16px', 
              fontWeight: 600, 
              fontSize: 14, 
              cursor: loading || !q.trim() ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s ease'
            }}
          >
            {loading ? '🔄' : '🔍'} Search
          </button>
        </div>
      </div>
      
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 14, color: '#64748b', fontWeight: 500 }}>Found {results.length} results</div>
          {results.map(r => (
            <div key={r.passage_id} style={{ 
              borderRadius: 8, 
              background: 'linear-gradient(135deg, #fef7cd 0%, #fef3c7 100%)', 
              border: '1px solid #fde68a',
              padding: 16,
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: 8
              }}>
                <span style={{ fontWeight: 600, color: '#92400e', fontSize: 14 }}>Passage {r.passage_id}</span>
                <span style={{ 
                  background: '#fbbf24', 
                  color: '#fff', 
                  padding: '2px 8px', 
                  borderRadius: 12, 
                  fontSize: 12, 
                  fontWeight: 500 
                }}>Score: {r.score || r.rank}</span>
              </div>
              <div style={{ color: '#374151', fontSize: 14, lineHeight: 1.5 }}>{r.content}</div>
            </div>
          ))}
          
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8 }}>
            <button 
              onClick={()=>run(Math.max(0,page-1))} 
              disabled={page === 0}
              style={{ 
                background: page === 0 ? '#f8fafc' : '#fff', 
                color: page === 0 ? '#94a3b8' : '#475569', 
                border: '1px solid #e2e8f0', 
                borderRadius: 8, 
                padding: '8px 16px', 
                fontWeight: 500, 
                fontSize: 14, 
                cursor: page === 0 ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              ← Previous
            </button>
            <button 
              onClick={()=>run(page+1)} 
              disabled={results.length < limit}
              style={{ 
                background: results.length < limit ? '#f8fafc' : '#fff', 
                color: results.length < limit ? '#94a3b8' : '#475569', 
                border: '1px solid #e2e8f0', 
                borderRadius: 8, 
                padding: '8px 16px', 
                fontWeight: 500, 
                fontSize: 14, 
                cursor: results.length < limit ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
