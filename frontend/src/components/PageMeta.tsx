import { useEffect } from 'react';
import { useLanguage } from '../i18n';

export default function PageMeta({ title, description }: { title: string; description: string }) {
  const { tr, language } = useLanguage();
  useEffect(() => {
    const localizedTitle = tr(title);
    const localizedDescription = tr(description);
    document.title = localizedTitle;
    const ensureMeta = (selector: string, attrs: Record<string, string>) => {
      let node = document.head.querySelector(selector) as HTMLMetaElement | null;
      if (!node) {
        node = document.createElement('meta');
        Object.entries(attrs).forEach(([key, value]) => node?.setAttribute(key, value));
        document.head.appendChild(node);
      }
      return node;
    };
    const canonicalUrl = `https://grocery-house-manager.com${window.location.pathname === '/' ? '/' : window.location.pathname}`;
    const descriptionMeta = ensureMeta('meta[name="description"]', { name: 'description' });
    descriptionMeta.setAttribute('content', localizedDescription);
    const ogTitle = ensureMeta('meta[property="og:title"]', { property: 'og:title' });
    ogTitle.setAttribute('content', localizedTitle);
    const ogDescription = ensureMeta('meta[property="og:description"]', { property: 'og:description' });
    ogDescription.setAttribute('content', localizedDescription);
    const ogUrl = ensureMeta('meta[property="og:url"]', { property: 'og:url' });
    ogUrl.setAttribute('content', canonicalUrl);
    let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', canonicalUrl);
    return () => undefined;
  }, [title, description, language, tr]);
  return null;
}
