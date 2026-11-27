import { useState } from 'react';
import type { MetaFunction } from 'react-router';

export const meta: MetaFunction = () => [
  { title: 'OUR AI BUILDER — مركز تطوير التطبيقات' },
  { name: 'description', content: 'Arabic-first responsive workspace for AI-assisted app development.' },
];

const tasks = [
  { title: 'تأسيس واجهة OUR AI BUILDER', status: 'قيد التخطيط', detail: 'F0 · عقد التكامل' },
  { title: 'ربط مستودع GitHub', status: 'جاهز للمراجعة', detail: 'فرع feature/our-ai-builder-f0' },
  { title: 'واجهة الهاتف والكمبيوتر', status: 'التالي', detail: 'F1 · واجهة متجاوبة' },
];

export default function OurBuilder() {
  const [prompt, setPrompt] = useState('');
  const [tab, setTab] = useState('projects');
  const [notice, setNotice] = useState('');
  const [sent, setSent] = useState(false);

  function submitTask() {
    if (!prompt.trim()) {
      setNotice('اكتب وصف المهمة أولاً.');
      return;
    }

    setSent(true);
    setNotice('تم تجهيز المهمة محلياً. اربطها بوكيل Arena عبر GitHub Branch / Pull Request قبل التنفيذ.');
  }

  return (
    <main
      dir="rtl"
      style={{
        minHeight: '100vh',
        background: '#0b1220',
        color: '#e8eef8',
        fontFamily: 'system-ui, sans-serif',
        padding: 'clamp(14px, 3vw, 32px)',
      }}
    >
      <style>{`
        *{box-sizing:border-box} .our-wrap{max-width:1200px;margin:0 auto}
        .our-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
        .our-panel{background:#111c2d;border:1px solid #24334a;border-radius:18px;padding:18px}
        .our-muted{color:#98a9c2;font-size:13px}
        .our-btn{border:1px solid #33465f;background:#17263a;color:#e8eef8;border-radius:12px;padding:10px 14px;font:inherit;cursor:pointer}
        .our-btn.active,.our-primary{background:#2563eb;border-color:#2563eb;color:white}
        .our-input{width:100%;background:#0c1626;color:#eef4ff;border:1px solid #2a3b53;border-radius:12px;padding:13px;font:inherit;outline:none}
        .our-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
        @media(max-width:760px){.our-grid{grid-template-columns:1fr}.our-row{align-items:flex-start;flex-direction:column}.our-panel{padding:15px}.our-nav{width:100%;display:flex;overflow:auto}.our-nav button{white-space:nowrap}}
      `}</style>
      <div className="our-wrap">
        <header className="our-row" style={{ marginBottom: 26 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
              <span style={{ background: '#2563eb', borderRadius: 11, padding: '8px 10px', fontWeight: 800 }}>OUR</span>
              <strong style={{ fontSize: 21 }}>AI BUILDER</strong>
              <span className="our-muted">نسخة تأسيسية F0</span>
            </div>
            <div className="our-muted">مركز التحكم في بناء التطبيقات بالذكاء الاصطناعي</div>
          </div>
          <div className="our-nav" style={{ display: 'flex', gap: 8 }}>
            {[
              ['projects', 'المشاريع'],
              ['agents', 'الوكلاء'],
              ['changes', 'التغييرات'],
            ].map(([key, label]) => (
              <button key={key} className={`our-btn ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>
        </header>

        <section className="our-grid" style={{ marginBottom: 18 }}>
          <div className="our-panel">
            <div className="our-muted">المستودع المتصل</div>
            <div style={{ fontWeight: 700, marginTop: 8 }}>alsaydy654-sys/bolt.diy</div>
            <div className="our-muted" style={{ marginTop: 8 }}>
              GitHub · المصدر الأساسي
            </div>
          </div>
          <div className="our-panel">
            <div className="our-muted">فرع العمل</div>
            <div style={{ fontWeight: 700, marginTop: 8, overflowWrap: 'anywhere' }}>feature/our-ai-builder-f0</div>
            <div className="our-muted" style={{ marginTop: 8 }}>
              تطوير معزول عن main
            </div>
          </div>
          <div className="our-panel">
            <div className="our-muted">حالة F0</div>
            <div style={{ fontWeight: 700, marginTop: 8, color: '#93c5fd' }}>وثيقة التأسيس محفوظة</div>
            <div className="our-muted" style={{ marginTop: 8 }}>
              بانتظار تطوير F1
            </div>
          </div>
        </section>

        <section className="our-panel" style={{ marginBottom: 18 }}>
          <div className="our-row" style={{ marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 19 }}>أرسل مهمة تطوير</h2>
              <div className="our-muted" style={{ marginTop: 5 }}>
                اكتب المطلوب، ثم جهّزه للمراجعة قبل تسليمه للوكيل.
              </div>
            </div>
            <span className="our-muted">Arena Agent · GitHub PR</span>
          </div>
          <textarea
            className="our-input"
            rows={4}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setNotice('');
            }}
            placeholder="مثال: أنشئ لوحة مشاريع عربية RTL متجاوبة مع الهاتف..."
          />
          <div className="our-row" style={{ marginTop: 12 }}>
            <span className="our-muted">لن يتم تشغيل وكيل أو دمج تغييرات تلقائياً من هذه الواجهة التجريبية.</span>
            <button className="our-btn our-primary" onClick={submitTask}>
              تجهيز المهمة ←
            </button>
          </div>
          {notice && (
            <div
              role="status"
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 10,
                background: '#102b3d',
                color: '#bfdbfe',
                fontSize: 14,
              }}
            >
              {notice}
            </div>
          )}
          {sent && (
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                background: '#0a1321',
                border: '1px solid #24334a',
                padding: 12,
                borderRadius: 10,
                marginTop: 12,
                fontSize: 12,
              }}
            >{`Repository: alsaydy654-sys/bolt.diy\nBranch: feature/our-ai-builder-f0\nTask: ${prompt.trim()}\nApproval: required\nExecution: manual Arena handoff\n`}</pre>
          )}
        </section>

        <section className="our-panel">
          <div className="our-row" style={{ marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 19 }}>
              {tab === 'projects' ? 'المشروع الحالي' : tab === 'agents' ? 'مسار الوكلاء' : 'مراجعة التغييرات'}
            </h2>
            <span className="our-muted">F0 → F1</span>
          </div>
          {tab === 'projects' &&
            tasks.map((task) => (
              <div key={task.title} className="our-row" style={{ padding: '14px 0', borderTop: '1px solid #24334a' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{task.title}</div>
                  <div className="our-muted" style={{ marginTop: 5 }}>
                    {task.detail}
                  </div>
                </div>
                <span className="our-muted">{task.status}</span>
              </div>
            ))}
          {tab === 'agents' && (
            <div className="our-muted" style={{ lineHeight: 1.9 }}>
              1. افتح فرع التطوير في Arena Agent Mode.
              <br />
              2. أرسل المهمة مع ملف عقد F0.
              <br />
              3. اطلب من الوكيل التعديل على فرع منفصل.
              <br />
              4. راجع Pull Request والاختبارات قبل الدمج.
            </div>
          )}
          {tab === 'changes' && (
            <div className="our-muted" style={{ lineHeight: 1.9 }}>
              التغييرات الحالية: وثيقة F0 فقط.
              <br />
              لم يتم تعديل ملفات التطبيق الأساسية أو فرع main.
              <br />
              <a
                style={{ color: '#93c5fd' }}
                href="https://github.com/alsaydy654-sys/bolt.diy/blob/feature/our-ai-builder-f0/docs/OUR_AI_BUILDER_F0.md"
                target="_blank"
                rel="noreferrer"
              >
                عرض وثيقة F0 على GitHub ↗
              </a>
            </div>
          )}
        </section>
        <footer className="our-muted" style={{ textAlign: 'center', marginTop: 22 }}>
          OUR AI BUILDER · Prototype UI · Mobile-first · Human approval required
        </footer>
      </div>
    </main>
  );
}
