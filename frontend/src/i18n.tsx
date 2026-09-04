import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type AppLanguage = 'en' | 'gu' | 'hi' | 'fr';
const labels: Record<AppLanguage, Record<string,string>> = {
  en: { language:'Language', home:'Home', inventory:'Inventory', shopping:'Shopping', meals:'Meals', assistant:'Assistant', more:'More', plans:'Plans', support:'Support', prices:'Prices', reports:'Reports', profile:'Profile', scanReceipt:'Scan receipt', receiptHistory:'Receipt history', admin:'Admin' },
  gu: { language:'ભાષા', home:'હોમ', inventory:'ઇન્વેન્ટરી', shopping:'ખરીદી', meals:'ભોજન', assistant:'સહાયક', more:'વધુ', plans:'પ્લાન્સ', support:'મદદ', prices:'ભાવ', reports:'રિપોર્ટ્સ', profile:'પ્રોફાઇલ', scanReceipt:'રસીદ સ્કેન', receiptHistory:'રસીદ ઇતિહાસ', admin:'એડમિન' },
  hi: { language:'भाषा', home:'होम', inventory:'इन्वेंटरी', shopping:'खरीदारी', meals:'भोजन', assistant:'सहायक', more:'अधिक', plans:'प्लान', support:'सहायता', prices:'कीमतें', reports:'रिपोर्ट', profile:'प्रोफ़ाइल', scanReceipt:'रसीद स्कैन', receiptHistory:'रसीद इतिहास', admin:'एडमिन' },
  fr: { language:'Langue', home:'Accueil', inventory:'Inventaire', shopping:'Courses', meals:'Repas', assistant:'Assistant', more:'Plus', plans:'Forfaits', support:'Aide', prices:'Prix', reports:'Rapports', profile:'Profil', scanReceipt:'Scanner un reçu', receiptHistory:'Historique des reçus', admin:'Admin' },
};

type Ctx = { language: AppLanguage; setLanguage:(l:AppLanguage)=>void; t:(key:string)=>string };
const LanguageContext = createContext<Ctx>({language:'en', setLanguage:()=>{}, t:(k)=>k});

export function LanguageProvider({children}:{children:React.ReactNode}) {
  const [language,setLanguageState] = useState<AppLanguage>(() => (localStorage.getItem('ghm_language') as AppLanguage) || 'en');
  const setLanguage = (next:AppLanguage) => { localStorage.setItem('ghm_language', next); setLanguageState(next); window.dispatchEvent(new CustomEvent('ghm:language',{detail:next})); };
  useEffect(() => { document.documentElement.lang = language; document.documentElement.dataset.language = language; }, [language]);
  const value = useMemo(() => ({language,setLanguage,t:(key:string)=>labels[language][key] || labels.en[key] || key}), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export const useLanguage = () => useContext(LanguageContext);

export function LanguagePicker({compact=false}:{compact?:boolean}) {
  const {language,setLanguage,t}=useLanguage();
  return <label className={`language-picker ${compact?'compact':''}`} title={t('language')}>
    <span aria-hidden="true">🌐</span>{!compact && <b>{t('language')}</b>}
    <select value={language} aria-label={t('language')} onChange={(e)=>setLanguage(e.target.value as AppLanguage)}>
      <option value="en">English</option><option value="gu">ગુજરાતી</option><option value="hi">हिन्दी</option><option value="fr">Français</option>
    </select>
  </label>;
}
