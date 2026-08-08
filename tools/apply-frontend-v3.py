from pathlib import Path

path = Path('index.html')
text = path.read_text(encoding='utf-8')

if 'data-pm-shell="v3"' in text:
    print('Frontend V3 already applied; nothing to do')
    raise SystemExit(0)


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 anchor, found {count}')
    return source.replace(old, new, 1)

# 1) Visual system — presentation only.
style_anchor = "    body { font-family: 'Noto Sans Thai', sans-serif; }\n  </style>"
style_block = r'''    body { font-family: 'Noto Sans Thai', sans-serif; }

    :root {
      --pm-navy: #071f3d;
      --pm-navy-2: #0b315f;
      --pm-blue: #0b63ce;
      --pm-blue-soft: #eaf3ff;
      --pm-canvas: #f4f7fb;
      --pm-surface: #ffffff;
      --pm-border: #dfe7f1;
      --pm-text: #172033;
      --pm-muted: #708096;
    }
    .pm-shell { min-height: 100vh; background: var(--pm-canvas); color: var(--pm-text); }
    .pm-command-header { height: 82px; background: linear-gradient(135deg, #061a34 0%, #08274c 60%, #071f3d 100%); border-bottom: 1px solid rgba(255,255,255,.08); display: flex; align-items: center; gap: 18px; padding: 0 22px; position: sticky; top: 0; z-index: 50; box-shadow: 0 8px 28px rgba(7,31,61,.16); }
    .pm-brand-wrap { display: flex; align-items: center; gap: 13px; min-width: 350px; }
    .pm-logo-mark { width: 46px; height: 46px; border-radius: 13px; display: flex; align-items: center; justify-content: center; color: white; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.16); }
    .pm-command-btn { height: 44px; padding: 0 13px; border-radius: 11px; border: 1px solid rgba(191,219,254,.22); background: rgba(255,255,255,.055); color: #e8f2ff; display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 800; white-space: nowrap; transition: .18s ease; }
    .pm-command-btn:hover { background: rgba(255,255,255,.11); border-color: rgba(191,219,254,.36); transform: translateY(-1px); }
    .pm-command-safe { margin-left: 8px; border-color: rgba(110,231,183,.22); color: #d1fae5; }
    .pm-app-frame { min-height: calc(100vh - 82px); display: flex; }
    .pm-sidebar { width: 205px; flex: 0 0 205px; background: #082548; border-right: 1px solid rgba(255,255,255,.06); display: flex; flex-direction: column; min-height: calc(100vh - 82px); position: sticky; top: 82px; align-self: flex-start; height: calc(100vh - 82px); }
    .pm-nav-btn { width: 100%; min-height: 44px; border-radius: 10px; padding: 0 12px; color: rgba(219,234,254,.65); display: flex; align-items: center; gap: 10px; font-size: 12px; font-weight: 800; text-align: left; transition: .18s ease; border: 1px solid transparent; }
    .pm-nav-btn:hover { color: white; background: rgba(255,255,255,.06); }
    .pm-nav-btn-active { color: white; background: #0b63ce; border-color: rgba(147,197,253,.28); box-shadow: 0 8px 18px rgba(0,0,0,.15); }
    .pm-main { flex: 1; min-width: 0; background: var(--pm-canvas); overflow-x: hidden; }
    .pm-page { max-width: 1240px; margin: 0 auto; padding: 24px 26px 44px; animation: pmFade .22s ease; }
    .pm-page-wide { max-width: 1520px; }
    @keyframes pmFade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    .pm-page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; margin-bottom: 18px; }
    .pm-eyebrow, .pm-section-kicker { color: var(--pm-blue); font-size: 9px; line-height: 1.2; text-transform: uppercase; letter-spacing: .16em; font-weight: 900; }
    .pm-page-title { color: #14213a; font-size: clamp(24px, 2.2vw, 32px); line-height: 1.1; font-weight: 900; letter-spacing: -.025em; margin-top: 5px; }
    .pm-page-subtitle { color: #718096; font-size: 12px; line-height: 1.65; font-weight: 600; margin-top: 6px; max-width: 760px; }
    .pm-card { background: white; border: 1px solid var(--pm-border); border-radius: 16px; box-shadow: 0 5px 16px rgba(26,54,93,.045); }
    .pm-primary-btn, .pm-secondary-btn, .pm-ghost-btn, .pm-danger-btn, .pm-success-btn, .pm-warning-btn { min-height: 38px; padding: 0 14px; border-radius: 10px; display: inline-flex; align-items: center; gap: 7px; justify-content: center; font-size: 11px; font-weight: 900; transition: .16s ease; white-space: nowrap; }
    .pm-primary-btn { background: var(--pm-blue); color: white; border: 1px solid var(--pm-blue); box-shadow: 0 5px 12px rgba(11,99,206,.18); }
    .pm-primary-btn:hover:not(:disabled) { background: #0958b7; transform: translateY(-1px); }
    .pm-secondary-btn { background: white; color: #225487; border: 1px solid #cfdbea; }
    .pm-secondary-btn:hover:not(:disabled) { border-color: #93b6dd; background: #f7fbff; }
    .pm-ghost-btn { background: #f7f9fc; color: #607086; border: 1px solid #e1e7ef; }
    .pm-ghost-btn:hover:not(:disabled) { color: #1f4f80; background: #eef5fd; }
    .pm-danger-btn { background: #fff1f2; color: #c93444; border: 1px solid #fecdd3; }
    .pm-success-btn { background: #ecfdf5; color: #087a55; border: 1px solid #a7f3d0; }
    .pm-warning-btn { background: #fffbeb; color: #a35d00; border: 1px solid #fde68a; }
    .pm-primary-btn:disabled, .pm-secondary-btn:disabled, .pm-ghost-btn:disabled, .pm-danger-btn:disabled, .pm-success-btn:disabled, .pm-warning-btn:disabled { opacity: .42; cursor: not-allowed; transform: none; box-shadow: none; }
    .pm-info-banner { border: 1px solid #bed8f5; background: #edf6ff; color: #184b7d; border-radius: 13px; padding: 12px 14px; display: flex; align-items: center; gap: 10px; }
    .pm-mini-stat { background: #f7f9fc; border: 1px solid #edf1f6; border-radius: 11px; padding: 9px 10px; min-width: 0; }
    .pm-mini-stat span { display: block; color: #8b98a9; font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; }
    .pm-mini-stat strong { display: block; color: #16233b; font-size: 18px; line-height: 1.15; font-weight: 900; margin-top: 3px; overflow-wrap: anywhere; }
    .pm-mini-ready { background: #f0fdf7; border-color: #d1fae5; }
    .pm-mini-ready strong { color: #07835b; }
    .pm-mini-review { background: #fffaf0; border-color: #fde8bd; }
    .pm-mini-review strong { color: #b36b08; }
    .pm-step { border-radius: 11px; min-height: 52px; padding: 8px 10px; color: #98a5b5; background: #f7f9fc; border: 1px solid #edf1f6; display: flex; align-items: center; gap: 8px; font-size: 10px; font-weight: 900; }
    .pm-step-icon { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; background: white; border: 1px solid #e5eaf1; }
    .pm-step-active { color: #285e91; border-color: #cfe1f5; background: #f3f8fe; }
    .pm-step-active .pm-step-icon { color: #0b63ce; border-color: #bdd7f5; background: white; }
    .pm-step-current { color: white; background: #0b63ce; border-color: #0b63ce; }
    .pm-step-current .pm-step-icon { color: #0b63ce; }
    .pm-upload-zone { border: 1.5px dashed #b7cee7; background: #fbfdff; border-radius: 15px; padding: 8px; transition: .18s ease; }
    .pm-upload-zone:hover { border-color: #6da8e7; background: #f7fbff; }
    .pm-upload-zone-active { border-style: solid; border-color: #8ebaea; background: #f4f9ff; }
    .pm-spinner { width: 38px; height: 38px; border: 4px solid #dbeafe; border-top-color: #0b63ce; border-radius: 999px; animation: pmSpin .8s linear infinite; }
    @keyframes pmSpin { to { transform: rotate(360deg); } }
    .pm-issue-row { width: 100%; min-height: 42px; padding: 0 10px; display: flex; align-items: center; gap: 8px; border-radius: 10px; border: 1px solid #e6ebf1; background: #fbfcfe; color: #56667c; font-size: 11px; font-weight: 800; transition: .15s ease; }
    .pm-issue-row:hover { border-color: #c7d8eb; background: #f4f8fd; color: #244e78; }
    .pm-issue-dot { width: 7px; height: 7px; border-radius: 999px; flex: 0 0 auto; }
    .pm-label { display: block; color: #53657b; font-size: 10px; font-weight: 900; margin-bottom: 6px; }
    .pm-help { color: #99a5b4; font-size: 9px; font-weight: 600; line-height: 1.5; margin-top: 5px; }
    .pm-input, .pm-select { border: 1px solid #d9e2ec; background: white; color: #26364c; border-radius: 10px; outline: none; font-size: 11px; font-weight: 700; transition: .16s ease; }
    .pm-input { width: 100%; padding: 10px 11px; }
    .pm-select { padding: 10px 32px 10px 11px; }
    .pm-input:focus, .pm-select:focus { border-color: #6fa8e4; box-shadow: 0 0 0 3px rgba(11,99,206,.10); }
    .pm-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .pm-table thead th { padding: 10px 13px; color: #7d8b9c; background: #f7f9fc; border-bottom: 1px solid #e7ecf2; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; white-space: nowrap; }
    .pm-table tbody td { padding: 11px 13px; border-bottom: 1px solid #eef2f6; vertical-align: top; }
    .pm-table tbody tr:hover { background: #fbfdff; }
    .pm-icon-btn { width: 32px; height: 32px; border-radius: 9px; border: 1px solid #e1e8f0; background: white; color: #66809a; display: inline-flex; align-items: center; justify-content: center; }
    .pm-icon-btn:hover { color: #0b63ce; background: #f1f7fe; border-color: #c7dcf2; }
    .pm-icon-danger:hover { color: #d6384b; background: #fff1f2; border-color: #fecdd3; }
    .pm-pagination { display: flex; align-items: center; justify-content: space-between; gap: 10px; border-top: 1px solid #e8edf3; padding: 10px 13px; background: #fbfcfe; }
    .pm-page-btn { width: 32px; height: 32px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #d9e2ec; background: white; color: #31577f; font-size: 18px; font-weight: 900; }
    .pm-page-btn:disabled { opacity: .35; cursor: not-allowed; }
    .pm-summary-btn { min-width: 0; border-radius: 14px; transition: .15s ease; text-align: left; }
    .pm-summary-selected { outline: 2px solid #80afe2; outline-offset: 1px; }
    .pm-view-toggle { width: 34px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 7px; color: #8997a8; }
    .pm-view-toggle-active { background: white; color: #0b63ce; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .pm-order-card { background: white; border: 1px solid #dfe7f1; border-radius: 14px; padding: 12px; box-shadow: 0 4px 14px rgba(26,54,93,.04); min-width: 0; }
    .pm-label-thumb { aspect-ratio: 2 / 2.65; max-height: 230px; width: 100%; overflow: hidden; border: 1px solid #e3e9f0; border-radius: 10px; background: #f7f9fc; }
    .pm-label-thumb img { width: 100%; height: 100%; object-fit: cover; object-position: center top; }
    .pm-feature-icon { width: 38px; height: 38px; border-radius: 11px; display: flex; align-items: center; justify-content: center; color: #0b63ce; background: #edf6ff; border: 1px solid #d7e9fb; flex: 0 0 auto; }
    .pm-status { display: inline-flex; align-items: center; min-height: 20px; padding: 2px 7px; border-radius: 999px; font-size: 8px; line-height: 1; font-weight: 900; border: 1px solid transparent; margin-top: 4px; }
    .pm-status-green { color: #067553; background: #ecfdf5; border-color: #b7f0d8; }
    .pm-status-amber { color: #a35d00; background: #fffbeb; border-color: #fde68a; }
    .pm-status-red { color: #c93444; background: #fff1f2; border-color: #fecdd3; }
    .pm-status-slate { color: #617083; background: #f1f5f9; border-color: #e2e8f0; }
    .pm-status-blue { color: #1762aa; background: #eff6ff; border-color: #bfdbfe; }
    .pm-status-dark { color: white; background: #1f2937; border-color: #1f2937; }
    .pm-status-orange { color: #c44b14; background: #fff5ed; border-color: #fed7aa; }
    .pm-metric { border: 1px solid #dfe7f1; border-radius: 14px; padding: 13px 14px; background: white; min-width: 0; box-shadow: 0 4px 12px rgba(26,54,93,.035); }
    .pm-metric-compact { padding: 10px 11px; border-radius: 11px; box-shadow: none; }
    .pm-metric-label { font-size: 9px; font-weight: 900; color: #8390a2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pm-metric-value { margin-top: 3px; font-size: 25px; line-height: 1.05; font-weight: 900; color: #1b2a42; }
    .pm-metric-compact .pm-metric-value { font-size: 20px; }
    .pm-metric-helper { margin-top: 3px; font-size: 8px; font-weight: 700; color: #a1aab7; }
    .pm-metric-green { background: #f4fdf8; border-color: #d7f3e4; }
    .pm-metric-green .pm-metric-value { color: #07835b; }
    .pm-metric-amber { background: #fffaf0; border-color: #f9e6bd; }
    .pm-metric-amber .pm-metric-value { color: #b36b08; }
    .pm-metric-red { background: #fff6f6; border-color: #f8d8dc; }
    .pm-metric-red .pm-metric-value { color: #cc3c4d; }
    .pm-metric-blue { background: #f4f9ff; border-color: #d8e9fa; }
    .pm-metric-blue .pm-metric-value { color: #0b63ce; }
    .pm-metric-slate { background: #fff; }
    @media (max-width: 1023px) {
      .pm-command-header { height: 68px; padding: 0 14px; }
      .pm-brand-wrap { min-width: 0; }
      .pm-logo-mark { width: 40px; height: 40px; }
      .pm-app-frame { min-height: calc(100vh - 68px); }
      .pm-sidebar { display: none; }
      .pm-page { padding: 18px 14px 36px; }
      .pm-page-head { align-items: flex-start; flex-direction: column; }
    }
    @media (max-width: 639px) {
      .pm-command-header { position: relative; }
      .pm-page { padding-left: 10px; padding-right: 10px; }
      .pm-metric-value { font-size: 20px; }
    }
  </style>'''
text = replace_once(text, style_anchor, style_block, 'style block')

# 2) Pure presentation helpers.
helper_anchor = '    function App() {'
helpers = r'''    // PackMaster Frontend V3 — presentation-only helpers.
    const PMIcon = ({ name = 'box', className = 'w-5 h-5' }) => {
      const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' };
      const paths = {
        box: <><path {...common} d="M3 7.5 12 3l9 4.5-9 4.5-9-4.5Z"/><path {...common} d="M3 7.5V17l9 4 9-4V7.5M12 12v9"/></>,
        file: <><path {...common} d="M6 2.8h8l4 4V21H6z"/><path {...common} d="M14 2.8V7h4M9 11h6M9 15h6"/></>,
        barcode: <><path {...common} d="M4 5v14M7 5v14M11 5v14M14 5v14M19 5v14"/><path {...common} d="M2.5 3.5h4M17.5 3.5h4M2.5 20.5h4M17.5 20.5h4"/></>,
        layers: <><path {...common} d="m12 3 9 5-9 5-9-5 9-5Z"/><path {...common} d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
        alert: <><path {...common} d="M12 3 2.8 20h18.4L12 3Z"/><path {...common} d="M12 9v5M12 17.2h.01"/></>,
        printer: <><path {...common} d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path {...common} d="M6 14h12v7H6z"/></>,
        shield: <><path {...common} d="M12 2.7 20 6v6c0 5-3.4 8.1-8 9.6C7.4 20.1 4 17 4 12V6l8-3.3Z"/><path {...common} d="m8.5 12 2.2 2.2 4.8-5"/></>,
        upload: <><path {...common} d="M12 16V4M7.5 8.5 12 4l4.5 4.5"/><path {...common} d="M4 15v5h16v-5"/></>,
        review: <><path {...common} d="M5 3h14v18H5z"/><path {...common} d="M8 8h8M8 12h5M8 16h4"/></>,
        plus: <><path {...common} d="M12 5v14M5 12h14"/></>,
        archive: <><path {...common} d="M4 7h16v14H4zM3 3h18v4H3zM9 11h6"/></>,
        'arrow-left': <><path {...common} d="m14.5 5-7 7 7 7M8 12h11"/></>,
        'arrow-right': <><path {...common} d="m9.5 5 7 7-7 7M5 12h11"/></>,
        'chevron-right': <><path {...common} d="m9 5 7 7-7 7"/></>,
        search: <><circle {...common} cx="11" cy="11" r="7"/><path {...common} d="m16.5 16.5 4 4"/></>,
        download: <><path {...common} d="M12 4v12M7.5 11.5 12 16l4.5-4.5"/><path {...common} d="M4 20h16"/></>,
        edit: <><path {...common} d="M4 20h4L19 9l-4-4L4 16v4Z"/><path {...common} d="m13.8 6.2 4 4"/></>,
        trash: <><path {...common} d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
        grid: <><rect {...common} x="3" y="3" width="7" height="7"/><rect {...common} x="14" y="3" width="7" height="7"/><rect {...common} x="3" y="14" width="7" height="7"/><rect {...common} x="14" y="14" width="7" height="7"/></>,
        list: <><path {...common} d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/></>,
        refresh: <><path {...common} d="M20 7v5h-5M4 17v-5h5"/><path {...common} d="M6.1 8A7 7 0 0 1 18 6.8L20 12M4 12l2 5.2A7 7 0 0 0 17.9 16"/></>,
        lock: <><rect {...common} x="5" y="10" width="14" height="11" rx="2"/><path {...common} d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
        check: <><circle {...common} cx="12" cy="12" r="9"/><path {...common} d="m8 12 2.5 2.5L16 9"/></>,
        database: <><ellipse {...common} cx="12" cy="5" rx="8" ry="3"/><path {...common} d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
        storage: <><rect {...common} x="3" y="5" width="18" height="6" rx="2"/><rect {...common} x="3" y="13" width="18" height="6" rx="2"/><path {...common} d="M7 8h.01M7 16h.01M11 8h6M11 16h6"/></>,
        activity: <><path {...common} d="M3 12h4l2.2-6 4 12 2-6H21"/></>,
        loader: <><path {...common} d="M12 3a9 9 0 1 1-9 9"/></>
      };
      return <svg viewBox="0 0 24 24" className={className} aria-hidden="true">{paths[name] || paths.box}</svg>;
    };

    const PMStatusPill = ({ tone = 'slate', children }) => <span className={`pm-status pm-status-${tone}`}>{children}</span>;

    const PMMetric = ({ label, value, helper = '', tone = 'slate', compact = false }) => (
      <div className={`pm-metric pm-metric-${tone} ${compact ? 'pm-metric-compact' : ''}`}>
        <div className="pm-metric-label">{label}</div>
        <div className="pm-metric-value">{value}</div>
        {helper && <div className="pm-metric-helper">{helper}</div>}
      </div>
    );

    const PMEmptyState = ({ icon = 'box', title, body, action = null }) => (
      <div className="pm-card px-5 py-14 text-center">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4"><PMIcon name={icon} className="w-6 h-6" /></div>
        <h3 className="text-base font-black text-slate-800">{title}</h3>
        <p className="text-xs font-semibold text-slate-400 mt-1 max-w-lg mx-auto leading-5">{body}</p>
        {action && <div className="mt-5">{action}</div>}
      </div>
    );

    function App() {'''
text = replace_once(text, helper_anchor, helpers, 'presentation helpers')

# 3) Presentation-only state.
state_anchor = "      const [activeTab, setActiveTab] = useState('upload');"
state_block = """      const [activeTab, setActiveTab] = useState('upload');\n      // PackMaster Frontend V3 — presentation-only navigation/pagination.\n      const [activeView, setActiveView] = useState('batches');\n      const [reviewPage, setReviewPage] = useState(1);\n      const [reviewPageSize, setReviewPageSize] = useState(12);\n      const [skuPage, setSkuPage] = useState(1);\n      const [skuPageSize, setSkuPageSize] = useState(20);\n      const [skuSort, setSkuSort] = useState('keyword');"""
text = replace_once(text, state_anchor, state_block, 'V3 state')

# 4) Keep existing workflow transitions aligned with the new visible view.
transitions = [
    ("            setActiveTab('preview');\n            showToast(`เพิ่มข้อมูลสำเร็จ ${allNewOrders.length} ใบ`, 'success');",
     "            setActiveTab('preview');\n            setActiveView('review');\n            showToast(`เพิ่มข้อมูลสำเร็จ ${allNewOrders.length} ใบ`, 'success');", 'upload -> review'),
    ("        setActiveTab('settings');\n        showToast('เปิดคลังคำศัพท์พร้อม Keyword จาก Exception แล้ว — ตรวจข้อความก่อนกดเพิ่ม', 'success');",
     "        setActiveTab('settings');\n        setActiveView('sku');\n        showToast('เปิดคลังคำศัพท์พร้อม Keyword จาก Exception แล้ว — ตรวจข้อความก่อนกดเพิ่ม', 'success');", 'exception -> sku'),
    ("          setActiveBatchId(nextBatch.id);\n          setOrders([]);\n          setReviewSearch('');\n          setReviewPlatform('ALL');\n          setReviewStatus('ALL');\n          setUploadError('');\n          setActiveTab('upload');",
     "          setActiveBatchId(nextBatch.id);\n          setOrders([]);\n          setReviewSearch('');\n          setReviewPlatform('ALL');\n          setReviewStatus('ALL');\n          setUploadError('');\n          setActiveTab('upload');\n          setActiveView('upload');", 'create batch -> upload'),
    ("          setActiveBatchId(stored.meta.id);\n          setOrders(Array.isArray(stored.orders) ? stored.orders : []);\n          setReviewSearch('');\n          setReviewPlatform('ALL');\n          setReviewStatus('ALL');\n          setUploadError('');\n          setActiveTab('upload');",
     "          setActiveBatchId(stored.meta.id);\n          setOrders(Array.isArray(stored.orders) ? stored.orders : []);\n          setReviewSearch('');\n          setReviewPlatform('ALL');\n          setReviewStatus('ALL');\n          setUploadError('');\n          setActiveTab('upload');\n          setActiveView('upload');", 'open batch -> upload'),
    ("        setActiveBatchId(null);\n        setOrders([]);\n        setReviewSearch('');\n        setReviewPlatform('ALL');\n        setReviewStatus('ALL');\n        setUploadError('');\n        setActiveTab('upload');\n      };",
     "        setActiveBatchId(null);\n        setOrders([]);\n        setReviewSearch('');\n        setReviewPlatform('ALL');\n        setReviewStatus('ALL');\n        setUploadError('');\n        setActiveTab('upload');\n        setActiveView('batches');\n      };", 'back batch -> list'),
    ("          resetRestorePreview();\n          setActiveTab('upload');\n          showToast(`กู้คืน Workspace สำเร็จ • Batch ${summary.batches} • Orders ${summary.orders}`, 'success');",
     "          resetRestorePreview();\n          setActiveTab('upload');\n          setActiveView('batches');\n          showToast(`กู้คืน Workspace สำเร็จ • Batch ${summary.batches} • Orders ${summary.orders}`, 'success');", 'restore -> batches')
]
for old, new, label in transitions:
    text = replace_once(text, old, new, label)

# 5) Derived presentation state. These arrays are never written back to source data.
derived_anchor = "      }, [skuRules, skuSearch, skuFilter]);\n\n      return ("
derived_block = r'''      }, [skuRules, skuSearch, skuFilter]);

      const sortedSkuRules = useMemo(() => {
        const rows = [...filteredSkuRules];
        return rows.sort((a, b) => {
          if (skuSort === 'internal') return String(a.shortName || '').localeCompare(String(b.shortName || ''), 'th');
          return String(a.keyword || '').localeCompare(String(b.keyword || ''), 'th');
        });
      }, [filteredSkuRules, skuSort]);
      const skuPageCount = Math.max(1, Math.ceil(sortedSkuRules.length / skuPageSize));
      const visibleSkuRules = sortedSkuRules.slice((skuPage - 1) * skuPageSize, skuPage * skuPageSize);

      const reviewPageCount = Math.max(1, Math.ceil(FilteredOrders.length / reviewPageSize));
      const visibleReviewOrders = FilteredOrders.slice((reviewPage - 1) * reviewPageSize, reviewPage * reviewPageSize);

      useEffect(() => { setSkuPage(1); }, [skuSearch, skuFilter, skuSort]);
      useEffect(() => { setReviewPage(1); }, [reviewSearch, reviewPlatform, reviewStatus, previewMode, activeBatchId]);
      useEffect(() => { if (skuPage > skuPageCount) setSkuPage(skuPageCount); }, [skuPage, skuPageCount]);
      useEffect(() => { if (reviewPage > reviewPageCount) setReviewPage(reviewPageCount); }, [reviewPage, reviewPageCount]);

      const activeBatchRows = batches.filter(batch => !getBatchArchivedAt(batch));
      const batchDashboard = activeBatchRows.reduce((acc, batch) => {
        acc.orders += Number(batch.totalOrders) || 0;
        acc.ready += Number(batch.readyCount) || 0;
        acc.review += (Number(batch.reviewSkuCount) || 0) + (Number(batch.reviewQtyCount) || 0) + (Number(batch.unmappedCount) || 0);
        return acc;
      }, { batchCount: activeBatchRows.length, orders: 0, ready: 0, review: 0 });

      const uploadStep = !activeBatchId ? 1 : loadingStatus.active ? 3 : orders.length === 0 ? 2 : exceptionRows.length > 0 ? 4 : 5;
      const navigateView = (view) => setActiveView(view);

      return ('''
text = replace_once(text, derived_anchor, derived_block, 'derived presentation state')

# 6) Rebuild only the visible app shell. Print/export DOM below this region stays untouched.
visible_start = '          <div className="no-print flex h-screen overflow-hidden">'
visible_end = '          <div className="fixed pointer-events-none opacity-0"'
start_index = text.find(visible_start)
end_index = text.find(visible_end)
if start_index < 0 or end_index < 0 or end_index <= start_index:
    raise SystemExit('visible UI anchors not found or out of order')
replacement = Path('tools/frontend-v3-visible.txt').read_text(encoding='utf-8')
text = text[:start_index] + replacement + '\n\n' + text[end_index:]

# 7) Build/title marker; does not affect product logic.
text = text.replace('<title>PackMaster V48.12 Ultimate (The Print Perfect)</title>', '<title>PackMaster — Operational Packing Workspace</title>', 1)

# Final safety checks.
required = [
    'data-pm-shell="v3"',
    'data-pm-view="batches"',
    'data-pm-view="upload"',
    'data-pm-view="sku"',
    'data-pm-view="review"',
    'data-pm-view="safety"',
    'for (let i = 0; i < MappedOrders.length; i++)',
    'MappedOrders.map((order) => (<LabelCard'
]
for marker in required:
    if marker not in text:
        raise SystemExit(f'final safety marker missing: {marker}')
if 'PackMaster Frontend V3' not in text:
    # Human-readable build marker for diagnostics/test contract.
    text = text.replace('// PackMaster Frontend V3 — presentation-only helpers.', '// PackMaster Frontend V3 — presentation-only helpers.\n    // PackMaster Frontend V3', 1)

path.write_text(text, encoding='utf-8')
print('Frontend V3 visible shell applied successfully')
