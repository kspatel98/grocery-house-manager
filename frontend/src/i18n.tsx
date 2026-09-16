import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { languageDisplayName, translateUiText, type SiteLanguage } from './localizationCatalog';

export type AppLanguage = SiteLanguage;
const labels: Record<AppLanguage, Record<string,string>> = {
  en: { language:'Language', home:'Home', inventory:'Inventory', shopping:'Shopping', meals:'Meals', assistant:'Assistant', more:'More', plans:'Plans', support:'Support', prices:'Prices', reports:'Reports', profile:'Profile', scanReceipt:'Scan receipt', receiptHistory:'Receipt history', admin:'Admin', expenses:'Expenses' },
  gu: { language:'ભાષા', home:'હોમ', inventory:'ઇન્વેન્ટરી', shopping:'ખરીદી', meals:'ભોજન', assistant:'સહાયક', more:'વધુ', plans:'પ્લાન્સ', support:'મદદ', prices:'ભાવ', reports:'રિપોર્ટ્સ', profile:'પ્રોફાઇલ', scanReceipt:'રસીદ સ્કેન', receiptHistory:'રસીદ ઇતિહાસ', admin:'એડમિન', expenses:'ખર્ચ' },
  hi: { language:'भाषा', home:'होम', inventory:'इन्वेंटरी', shopping:'खरीदारी', meals:'भोजन', assistant:'सहायक', more:'अधिक', plans:'प्लान', support:'सहायता', prices:'कीमतें', reports:'रिपोर्ट', profile:'प्रोफ़ाइल', scanReceipt:'रसीद स्कैन', receiptHistory:'रसीद इतिहास', admin:'एडमिन', expenses:'खर्च' },
  fr: { language:'Langue', home:'Accueil', inventory:'Inventaire', shopping:'Courses', meals:'Repas', assistant:'Assistant', more:'Plus', plans:'Forfaits', support:'Aide', prices:'Prix', reports:'Rapports', profile:'Profil', scanReceipt:'Scanner un reçu', receiptHistory:'Historique des reçus', admin:'Admin', expenses:'Dépenses' },
};

type Ctx = { language: AppLanguage; setLanguage:(l:AppLanguage)=>void; t:(key:string)=>string; tr:(text:string)=>string };
const LanguageContext = createContext<Ctx>({language:'en', setLanguage:()=>{}, t:(k)=>k, tr:(v)=>v});

const originalText = new WeakMap<Text,string>();
const renderedText = new WeakMap<Text,string>();
const originalAttrs = new WeakMap<Element,Map<string,string>>();
const renderedAttrs = new WeakMap<Element,Map<string,string>>();
const ATTRS = ['placeholder','title','aria-label'];

function shouldSkip(node: Node) {
  const parent = node.parentElement;
  if (!parent) return false;
  if (parent.closest('[data-i18n-skip="true"], script, style, code, pre, [contenteditable="true"]')) return true;
  return false;
}

function translateTextNode(node: Text, language: AppLanguage) {
  if (shouldSkip(node)) return;
  const current = node.nodeValue || '';
  const previousRendered = renderedText.get(node);
  if (!originalText.has(node) || (previousRendered !== undefined && current !== previousRendered)) {
    originalText.set(node, current);
  }
  const source = originalText.get(node) || current;
  const next = translateUiText(source, language);
  if (current !== next) node.nodeValue = next;
  renderedText.set(node, next);
}

function translateElementAttrs(el: Element, language: AppLanguage) {
  if (el.closest('[data-i18n-skip="true"]')) return;
  let originals = originalAttrs.get(el);
  let rendered = renderedAttrs.get(el);
  if (!originals) { originals = new Map(); originalAttrs.set(el, originals); }
  if (!rendered) { rendered = new Map(); renderedAttrs.set(el, rendered); }
  for (const attr of ATTRS) {
    if (!el.hasAttribute(attr)) continue;
    const current = el.getAttribute(attr) || '';
    const priorRendered = rendered.get(attr);
    if (!originals.has(attr) || (priorRendered !== undefined && current !== priorRendered)) originals.set(attr, current);
    const source = originals.get(attr) || current;
    const next = translateUiText(source, language);
    if (current !== next) el.setAttribute(attr, next);
    rendered.set(attr, next);
  }
}

function translateTree(root: Node, language: AppLanguage) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text, language);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) translateElementAttrs(root as Element, language);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let next: Node | null = walker.nextNode();
  while (next) {
    if (next.nodeType === Node.TEXT_NODE) translateTextNode(next as Text, language);
    else translateElementAttrs(next as Element, language);
    next = walker.nextNode();
  }
}

function GlobalLanguageBridge({language}:{language:AppLanguage}) {
  useEffect(() => {
    // Translate the body rather than only #root because focus dialogs are rendered
    // through portals directly under document.body. This keeps the whole UI localized.
    const root = document.body;
    if (!root) return;
    translateTree(root, language);
    let scheduled = false;
    const observer = new MutationObserver((mutations) => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        for (const mutation of mutations) {
          if (mutation.type === 'characterData') translateTextNode(mutation.target as Text, language);
          for (const node of Array.from(mutation.addedNodes)) translateTree(node, language);
          if (mutation.type === 'attributes' && mutation.target instanceof Element) translateElementAttrs(mutation.target, language);
        }
      });
    });
    observer.observe(root, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:ATTRS});
    return () => observer.disconnect();
  }, [language]);
  return null;
}

export function LanguageProvider({children}:{children:React.ReactNode}) {
  const [language,setLanguageState] = useState<AppLanguage>(() => {
    const stored = localStorage.getItem('ghm_language') as AppLanguage | null;
    return stored && ['en','gu','hi','fr'].includes(stored) ? stored : 'en';
  });
  const setLanguage = (next:AppLanguage) => { localStorage.setItem('ghm_language', next); setLanguageState(next); window.dispatchEvent(new CustomEvent('ghm:language',{detail:next})); };
  useEffect(() => { document.documentElement.lang = language; document.documentElement.dataset.language = language; }, [language]);
  const value = useMemo(() => ({language,setLanguage,t:(key:string)=>labels[language][key] || labels.en[key] || key,tr:(text:string)=>translateUiText(text,language)}), [language]);
  return <LanguageContext.Provider value={value}><GlobalLanguageBridge language={language}/>{children}</LanguageContext.Provider>;
}
export const useLanguage = () => useContext(LanguageContext);

export function LanguagePicker({compact=false}:{compact?:boolean}) {
  const {language,setLanguage,t}=useLanguage();
  return <label className={`language-picker ${compact?'compact':''}`} title={t('language')} data-i18n-skip="true">
    <span aria-hidden="true">🌐</span>{!compact && <b>{t('language')}</b>}
    <select value={language} aria-label={t('language')} onChange={(e)=>setLanguage(e.target.value as AppLanguage)}>
      <option value="en">{languageDisplayName('en',language)}</option>
      <option value="gu">{languageDisplayName('gu',language)}</option>
      <option value="hi">{languageDisplayName('hi',language)}</option>
      <option value="fr">{languageDisplayName('fr',language)}</option>
    </select>
  </label>;
}
