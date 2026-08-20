import { useState } from 'react';

const detect = (value: string) => /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/.test(value.trim().charAt(0)) ? 'rtl' : 'ltr';
interface Props { label: string; value: string; onChange: (value: string) => void; rows?: number; hint?: string; direction?: 'rtl'|'ltr'|'auto'; onDirectionChange?: (value: 'rtl'|'ltr'|'auto') => void; }
export function MarkdownField({ label, value, onChange, rows = 6, hint, direction = 'auto', onDirectionChange }: Props) {
  const [showHelp, setShowHelp] = useState(false); const resolved = direction === 'auto' ? detect(value) : direction;
  return <label className="field markdown-field"><span className="field-head"><span>{label}</span><span className="field-tools"><button type="button" className="text-button" onClick={() => setShowHelp(!showHelp)}>Markdown</button>{onDirectionChange && <select aria-label={`${label} direction`} value={direction} onChange={(e) => onDirectionChange(e.target.value as 'rtl'|'ltr'|'auto')}><option value="auto">Auto direction</option><option value="ltr">LTR</option><option value="rtl">RTL</option></select>}</span></span>{hint && <small>{hint}</small>}{showHelp && <small className="markdown-help">Use **bold**, *italic*, headings with ##, links, and lists.</small>}<textarea dir={resolved} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}
