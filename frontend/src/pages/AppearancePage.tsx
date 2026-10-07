import { Link } from 'react-router-dom';
import { useThemePreference, type AppearanceMode, type VisualStyle } from '../theme';

const appearances: { key: AppearanceMode; icon: string; title: string; body: string }[] = [
  { key: 'system', icon: '◐', title: 'System', body: 'Follow your phone or computer automatically.' },
  { key: 'light', icon: '☀', title: 'Light', body: 'Warm cream surfaces with crisp, high-contrast text.' },
  { key: 'dark', icon: '☾', title: 'Dark', body: 'Deep navy surfaces designed independently for readability.' },
];

const styles: { key: VisualStyle; title: string; body: string; swatches: string[] }[] = [
  { key: 'classic', title: 'Classic GHM', body: 'Balanced blue, cream and orange — the signature GHM look.', swatches: ['#1f66a8','#f7f0e5','#f28b2b'] },
  { key: 'calm', title: 'Calm', body: 'Softer blue and muted orange for a quieter household workspace.', swatches: ['#35647a','#f4f1e9','#d97745'] },
  { key: 'vibrant', title: 'Vibrant', body: 'Stronger blue and orange accents for a more energetic experience.', swatches: ['#2563eb','#fff7ed','#f97316'] },
];

export default function AppearancePage() {
  const { appearance, style, theme, setAppearance, setStyle } = useThemePreference();
  return <main className="page shell appearance-page-v105">
    <header className="page-hero appearance-hero-v105">
      <div><Link to="/profile" className="breadcrumb">← Profile</Link><p className="eyebrow">APPEARANCE</p><h1>Make GHM feel right for you.</h1><p>Choose how GHM follows your device and how strong you want the brand styling to feel. Readability stays protected in every theme.</p></div>
      <div className="appearance-preview-v105" aria-hidden="true"><span className="preview-sun">☀</span><span className="preview-house">🏡</span><span className="preview-moon">☾</span></div>
    </header>

    <section className="panel appearance-section-v105">
      <div className="section-title-v105"><div><p className="eyebrow">APPEARANCE</p><h2>Light, dark or automatic</h2><p>Current rendered mode: <strong>{theme === 'dark' ? 'Dark' : 'Light'}</strong></p></div></div>
      <div className="appearance-choice-grid-v105">
        {appearances.map(item => <button key={item.key} type="button" className={`appearance-choice-v105 ${appearance === item.key ? 'active' : ''}`} onClick={() => setAppearance(item.key)}>
          <span>{item.icon}</span><div><strong>{item.title}</strong><small>{item.body}</small></div><i>{appearance === item.key ? '✓' : ''}</i>
        </button>)}
      </div>
    </section>

    <section className="panel appearance-section-v105">
      <div className="section-title-v105"><div><p className="eyebrow">GHM STYLE</p><h2>Choose your visual mood</h2><p>Only brand surfaces change. Success, warnings, errors and readable text keep their semantic meaning.</p></div></div>
      <div className="visual-style-grid-v105">
        {styles.map(item => <button key={item.key} type="button" className={`visual-style-card-v105 ${style === item.key ? 'active' : ''}`} onClick={() => setStyle(item.key)}>
          <div className="visual-style-preview-v105">{item.swatches.map(color => <span key={color} style={{ background: color }} />)}</div>
          <div><strong>{item.title}</strong><small>{item.body}</small></div><i>{style === item.key ? '✓ Selected' : 'Choose'}</i>
        </button>)}
      </div>
    </section>

    <section className="appearance-readability-v105"><span>◉</span><div><strong>Readability is part of the theme, not an afterthought.</strong><p>Cards, text, borders, fields, modals and navigation use semantic contrast tokens so dark mode does not inherit unreadable light-mode colors.</p></div></section>
  </main>;
}
