import type { ReactNode } from 'react';

function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => part.startsWith('**') && part.endsWith('**')
    ? <strong key={index}>{part.slice(2, -2)}</strong>
    : <span key={index}>{part}</span>);
}

export default function StructuredAiResponse({ text, compact = false }: { text: string; compact?: boolean }) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  let numbered: string[] = [];

  const flush = () => {
    if (bullets.length) {
      blocks.push(<ul key={`ul-${blocks.length}`}>{bullets.map((row, i) => <li key={i}>{inline(row)}</li>)}</ul>);
      bullets = [];
    }
    if (numbered.length) {
      blocks.push(<ol key={`ol-${blocks.length}`}>{numbered.map((row, i) => <li key={i}>{inline(row)}</li>)}</ol>);
      numbered = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const heading = line.match(/^#{1,4}\s+(.+)$/);
    if (heading) {
      flush();
      blocks.push(<h4 key={`h-${blocks.length}`}>{inline(heading[1])}</h4>);
      continue;
    }
    const bullet = line.match(/^[-•*]\s+(.+)$/);
    if (bullet) {
      if (numbered.length) flush();
      bullets.push(bullet[1]);
      continue;
    }
    const number = line.match(/^\d+[.)]\s+(.+)$/);
    if (number) {
      if (bullets.length) flush();
      numbered.push(number[1]);
      continue;
    }
    flush();
    const label = line.match(/^([A-Za-z][A-Za-z /&-]{2,32}):\s+(.+)$/);
    if (label) blocks.push(<p key={`p-${blocks.length}`}><strong>{label[1]}:</strong> {inline(label[2])}</p>);
    else blocks.push(<p key={`p-${blocks.length}`}>{inline(line)}</p>);
  }
  flush();

  return <div className={`ghm-ai-response-v123 ${compact ? 'compact' : ''}`}>{blocks.length ? blocks : <p>{text}</p>}</div>;
}
