import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { money } from '../currency';
import { useLanguage } from '../i18n';
import OverlayPortal from '../components/OverlayPortal';
import HouseContextSwitcher from '../components/HouseContextSwitcher';
import type { AccountBootstrap, ExpenseCategory, ExpenseSummary, House, HouseMember, Receipt } from '../types';

type Lang='en'|'gu'|'hi'|'fr';
type InsightMode='category'|'month';
type ReimbursementTarget={from_user_id:number;from_user_name:string;to_user_id:number;to_user_name:string;amount:number};
type CategoryChoice={name:string;icon:string;custom?:boolean};

const copy:Record<Lang,any>={
 en:{title:'Shared expenses',sub:'Keep household spending simple: add a cost, split it fairly, then reimburse only when needed.',add:'Add expense',balances:'House balances',history:'Expense history',suggest:'Suggested reimbursements',paid:'paid',split:'Who shares this expense?',equal:'Split equally',custom:'Custom amounts',payer:'Paid by',amount:'Total amount',category:'Choose a category',date:'Date',notes:'Notes',receipt:'Linked receipt',save:'Add expense',cancel:'Cancel',owes:'You owe',gets:'You are owed',settled:'You are all settled up',delete:'Delete',participants:'Participants',mine:'You owe / you are owed',all:'View all house reimbursements',reimburse:'Reimburse',received:'Confirm received',awaiting:'Waiting for reimbursement',settles:'Recommended to settle the balance',partial:'You can reimburse all or part of this amount.',confirm:'Confirm reimbursement',insights:'Expense insights',byCategory:'By category',byMonth:'By month',range:'Time range',six:'Last 6 months',twelve:'Last 12 months',allTime:'All time',spent:'House spend',topCategory:'Top category',average:'Monthly average',addCategory:'Add category',categoryName:'Category name',chooseIcon:'Choose an icon',createCategory:'Create category',moreDetails:'Optional details',linkedReceipt:'Receipt linked',customHelp:'Edit any person. The remaining amount is automatically shared only between people you have not edited.',manual:'Manually set',resetEqual:'Reset equally',remaining:'Remaining to distribute',splitReady:'Split total matches the expense.',splitMismatch:'Split must equal the expense total.',noHistory:'No expenses yet. Add the first shared cost to start insights.',noReimbursements:'No reimbursement is needed right now.',everyone:'Everyone in the house',expenseTitle:'What was this for?',receiptAlready:'This receipt may already be linked to an expense.'},
 gu:{title:'સાંઝા ખર્ચ',sub:'ઘરનો ખર્ચ સરળ રાખો: ખર્ચ ઉમેરો, ન્યાયથી વહેંચો અને જરૂર હોય ત્યારે જ રીઇમ્બર્સ કરો.',add:'ખર્ચ ઉમેરો',balances:'ઘર બેલેન્સ',history:'ખર્ચ ઇતિહાસ',suggest:'સૂચવેલા રીઇમ્બર્સમેન્ટ',paid:'ચૂકવ્યું',split:'આ ખર્ચ કોના વચ્ચે વહેંચવો?',equal:'સમાન વહેંચણી',custom:'કસ્ટમ રકમ',payer:'ચૂકવનાર',amount:'કુલ રકમ',category:'શ્રેણી પસંદ કરો',date:'તારીખ',notes:'નોંધ',receipt:'જોડાયેલી રસીદ',save:'ખર્ચ ઉમેરો',cancel:'રદ કરો',owes:'તમારે આપવાનું છે',gets:'તમારે મેળવવાનું છે',settled:'તમારો હિસાબ બરાબર છે',delete:'કાઢી નાખો',participants:'સભ્યો',mine:'તમારે આપવાનું / મેળવવાનું',all:'ઘરના બધા રીઇમ્બર્સમેન્ટ જુઓ',reimburse:'રીઇમ્બર્સ કરો',received:'મળ્યું તેની પુષ્ટિ કરો',awaiting:'રીઇમ્બર્સમેન્ટની રાહ',settles:'બેલેન્સ સેટલ કરવા માટે સૂચવેલું',partial:'તમે સંપૂર્ણ અથવા આંશિક રકમ રીઇમ્બર્સ કરી શકો છો.',confirm:'રીઇમ્બર્સમેન્ટની પુષ્ટિ',insights:'ખર્ચ ઇનસાઇટ્સ',byCategory:'શ્રેણી મુજબ',byMonth:'મહિના મુજબ',range:'સમયગાળો',six:'છેલ્લા 6 મહિના',twelve:'છેલ્લા 12 મહિના',allTime:'બધો સમય',spent:'ઘરનો ખર્ચ',topCategory:'ટોચની શ્રેણી',average:'માસિક સરેરાશ',addCategory:'શ્રેણી ઉમેરો',categoryName:'શ્રેણીનું નામ',chooseIcon:'આઇકન પસંદ કરો',createCategory:'શ્રેણી બનાવો',moreDetails:'વૈકલ્પિક વિગતો',linkedReceipt:'રસીદ જોડાયેલી',customHelp:'કોઈ સભ્યની રકમ બદલો. બાકી રકમ ફક્ત તમે ન બદલેલા સભ્યોમાં આપમેળે વહેંચાશે.',manual:'હાથેથી નક્કી',resetEqual:'ફરી સમાન કરો',remaining:'વહેંચવાની બાકી રકમ',splitReady:'વહેંચણી કુલ ખર્ચ સાથે મેળ ખાય છે.',splitMismatch:'વહેંચણી કુલ ખર્ચ જેટલી હોવી જોઈએ.',noHistory:'હજુ ખર્ચ નથી. ઇનસાઇટ્સ માટે પહેલો ખર્ચ ઉમેરો.',noReimbursements:'હાલ કોઈ રીઇમ્બર્સમેન્ટ જરૂરી નથી.',everyone:'ઘરના બધા સભ્યો',expenseTitle:'આ ખર્ચ શેના માટે હતો?',receiptAlready:'આ રસીદ કદાચ પહેલેથી ખર્ચ સાથે જોડાયેલી છે.'},
 hi:{title:'साझा खर्च',sub:'घर का खर्च आसान रखें: खर्च जोड़ें, सही तरीके से बाँटें और जरूरत होने पर ही reimbursement करें।',add:'खर्च जोड़ें',balances:'घर का बैलेंस',history:'खर्च इतिहास',suggest:'सुझाए गए reimbursement',paid:'ने भुगतान किया',split:'यह खर्च किन लोगों में बाँटना है?',equal:'बराबर बाँटें',custom:'कस्टम राशि',payer:'भुगतान किसने किया',amount:'कुल राशि',category:'श्रेणी चुनें',date:'तारीख',notes:'नोट्स',receipt:'जुड़ी रसीद',save:'खर्च जोड़ें',cancel:'रद्द करें',owes:'आपको देना है',gets:'आपको मिलना है',settled:'आपका हिसाब बराबर है',delete:'हटाएँ',participants:'सदस्य',mine:'आपको देना / मिलना है',all:'घर के सभी reimbursement देखें',reimburse:'Reimburse करें',received:'मिलने की पुष्टि करें',awaiting:'Reimbursement का इंतजार',settles:'बैलेंस बराबर करने के लिए सुझाया गया',partial:'आप पूरी या आंशिक राशि reimburse कर सकते हैं।',confirm:'Reimbursement की पुष्टि',insights:'खर्च विश्लेषण',byCategory:'श्रेणी अनुसार',byMonth:'महीने अनुसार',range:'समय सीमा',six:'पिछले 6 महीने',twelve:'पिछले 12 महीने',allTime:'पूरा समय',spent:'घर का खर्च',topCategory:'मुख्य श्रेणी',average:'मासिक औसत',addCategory:'श्रेणी जोड़ें',categoryName:'श्रेणी का नाम',chooseIcon:'आइकन चुनें',createCategory:'श्रेणी बनाएँ',moreDetails:'वैकल्पिक विवरण',linkedReceipt:'रसीद जुड़ी है',customHelp:'किसी सदस्य की राशि बदलें। बची हुई राशि केवल उन सदस्यों में अपने आप बाँटी जाएगी जिन्हें आपने नहीं बदला है।',manual:'आपने तय किया',resetEqual:'फिर बराबर बाँटें',remaining:'बाँटने के लिए बाकी',splitReady:'बँटवारा कुल खर्च के बराबर है।',splitMismatch:'बँटवारा कुल खर्च के बराबर होना चाहिए।',noHistory:'अभी कोई खर्च नहीं है। विश्लेषण शुरू करने के लिए पहला खर्च जोड़ें।',noReimbursements:'अभी कोई reimbursement जरूरी नहीं है।',everyone:'घर के सभी सदस्य',expenseTitle:'यह खर्च किस लिए था?',receiptAlready:'यह रसीद शायद पहले से किसी खर्च से जुड़ी है।'},
 fr:{title:'Dépenses partagées',sub:'Gardez les dépenses du foyer simples : ajoutez, répartissez équitablement, puis remboursez seulement si nécessaire.',add:'Ajouter une dépense',balances:'Soldes du foyer',history:'Historique des dépenses',suggest:'Remboursements suggérés',paid:'a payé',split:'Qui partage cette dépense ?',equal:'Partage égal',custom:'Montants personnalisés',payer:'Payé par',amount:'Montant total',category:'Choisir une catégorie',date:'Date',notes:'Notes',receipt:'Reçu lié',save:'Ajouter la dépense',cancel:'Annuler',owes:'Vous devez',gets:'On vous doit',settled:'Tout est réglé pour vous',delete:'Supprimer',participants:'Participants',mine:'Ce que vous devez / ce qu’on vous doit',all:'Voir tous les remboursements du foyer',reimburse:'Rembourser',received:'Confirmer la réception',awaiting:'En attente de remboursement',settles:'Recommandé pour équilibrer les comptes',partial:'Vous pouvez rembourser tout ou partie de ce montant.',confirm:'Confirmer le remboursement',insights:'Analyse des dépenses',byCategory:'Par catégorie',byMonth:'Par mois',range:'Période',six:'6 derniers mois',twelve:'12 derniers mois',allTime:'Depuis le début',spent:'Dépenses du foyer',topCategory:'Catégorie principale',average:'Moyenne mensuelle',addCategory:'Ajouter une catégorie',categoryName:'Nom de la catégorie',chooseIcon:'Choisir une icône',createCategory:'Créer la catégorie',moreDetails:'Détails facultatifs',linkedReceipt:'Reçu lié',customHelp:'Modifiez une personne. Le montant restant est redistribué uniquement entre les personnes que vous n’avez pas modifiées.',manual:'Défini manuellement',resetEqual:'Réinitialiser également',remaining:'Reste à répartir',splitReady:'La répartition correspond au total.',splitMismatch:'La répartition doit correspondre au total.',noHistory:'Aucune dépense pour le moment. Ajoutez la première dépense pour obtenir des analyses.',noReimbursements:'Aucun remboursement n’est nécessaire pour le moment.',everyone:'Tous les membres du foyer',expenseTitle:'À quoi correspond cette dépense ?',receiptAlready:'Ce reçu est peut-être déjà lié à une dépense.'}
};

const BUILTIN_CATEGORIES:CategoryChoice[]=[
 {name:'Groceries',icon:'🛒'},{name:'Household',icon:'🏠'},{name:'Dining',icon:'🍽️'},{name:'Utilities',icon:'💡'},
 {name:'Transport',icon:'🚗'},{name:'Rent',icon:'🏡'},{name:'Health',icon:'❤️'},{name:'Entertainment',icon:'🎬'},{name:'Other',icon:'✨'},
];
const CATEGORY_ICONS=['🛒','🏠','🍽️','💡','🚗','🏡','❤️','🎬','👶','🐾','🎁','✈️','📱','🧹','🛠️','✨'];

function initials(name:string){return (name||'?').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('')||'?';}
function cents(value:number|string){const n=Number(value)||0;return Math.round(n*100);}
function amountString(value:number){return (Math.round(value*100)/100).toFixed(2);}
function categoryIcon(name:string,categories:CategoryChoice[]){return categories.find(x=>x.name.toLowerCase()===name.toLowerCase())?.icon||'✨';}

export default function ExpensesPage(){
 const {houseId}=useParams(); const id=Number(houseId); const [params]=useSearchParams(); const {language}=useLanguage(); const c=copy[language as Lang]||copy.en;
 const [house,setHouse]=useState<House|null>(null); const [members,setMembers]=useState<HouseMember[]>([]); const [receipts,setReceipts]=useState<Receipt[]>([]); const [summary,setSummary]=useState<ExpenseSummary|null>(null); const [customCategories,setCustomCategories]=useState<ExpenseCategory[]>([]); const [currentUserId,setCurrentUserId]=useState<number|null>(null);
 const [error,setError]=useState(''); const [busy,setBusy]=useState(false); const [open,setOpen]=useState(false); const [reimburseTarget,setReimburseTarget]=useState<ReimbursementTarget|null>(null); const [reimburseAmount,setReimburseAmount]=useState('');
 const [title,setTitle]=useState('Groceries'); const [amount,setAmount]=useState(''); const [payer,setPayer]=useState<number|''>(''); const [category,setCategory]=useState('Groceries'); const [date,setDate]=useState(new Date().toISOString().slice(0,10)); const [notes,setNotes]=useState(''); const [receiptId,setReceiptId]=useState<number|''>(''); const [splitMode,setSplitMode]=useState<'equal'|'custom'>('equal'); const [participants,setParticipants]=useState<number[]>([]); const [shares,setShares]=useState<Record<number,string>>({}); const [manualShares,setManualShares]=useState<Set<number>>(()=>new Set<number>()); const [moreDetails,setMoreDetails]=useState(false);
 const [reimbursementView,setReimbursementView]=useState<'mine'|'house'>('mine'); const [insightMode,setInsightMode]=useState<InsightMode>('category'); const [insightRange,setInsightRange]=useState<'6'|'12'|'all'>('6');
 const [categoryCreatorOpen,setCategoryCreatorOpen]=useState(false); const [newCategoryName,setNewCategoryName]=useState(''); const [newCategoryIcon,setNewCategoryIcon]=useState('✨');
 const prefilledReceiptRef=useRef<number>(0);

 const categories=useMemo<CategoryChoice[]>(()=>{
   const seen=new Set<string>(); const out:CategoryChoice[]=[];
   [...BUILTIN_CATEGORIES,...customCategories.map(x=>({name:x.name,icon:x.icon,custom:true}))].forEach(item=>{const k=item.name.toLowerCase();if(!seen.has(k)){seen.add(k);out.push(item)}});
   return out;
 },[customCategories]);

 async function load(){
   try{
     const [h,m,r,e,a,cat]=await Promise.all([
       api.get<House>(`/houses/${id}`),api.get<HouseMember[]>(`/houses/${id}/members`),api.get<Receipt[]>(`/houses/${id}/receipts`),api.get<ExpenseSummary>(`/houses/${id}/expenses`),api.get<AccountBootstrap>('/account/bootstrap',{params:{t:Date.now()}}),api.get<ExpenseCategory[]>(`/houses/${id}/expenses/categories`)
     ]);
     setHouse(h.data);setMembers(m.data);setReceipts(r.data);setSummary(e.data);setCustomCategories(cat.data);setCurrentUserId(a.data.user.id);setError('');
     const defaultPayer=m.data.some(x=>x.user_id===a.data.user.id)?a.data.user.id:m.data[0]?.user_id;
     setPayer(prev=>prev||defaultPayer||'');
     setParticipants(prev=>prev.length?prev:m.data.map(x=>x.user_id));
   }catch(err){setError(errorMessage(err));}
 }
 useEffect(()=>{void load();},[id]);

 useEffect(()=>{
   const rid=Number(params.get('receiptId')||0); if(!rid||!receipts.length||!members.length||prefilledReceiptRef.current===rid)return;
   const r=receipts.find(x=>x.id===rid); if(!r)return;
   if(summary?.expenses.some(x=>x.receipt_id===rid)){prefilledReceiptRef.current=rid;setError(c.receiptAlready);return;}
   prefilledReceiptRef.current=rid; setReceiptId(r.id);setTitle(`${r.store_name||'Grocery'} receipt`);setCategory('Groceries');
   if(r.total_amount!=null)setAmount(String(r.total_amount)); if(r.receipt_date)setDate(r.receipt_date);
   const uploaderId=r.uploaded_by?.id; const fallback=currentUserId&&members.some(m=>m.user_id===currentUserId)?currentUserId:members[0]?.user_id;
   setPayer(uploaderId&&members.some(m=>m.user_id===uploaderId)?uploaderId:(fallback||''));
   setParticipants(members.map(x=>x.user_id));setSplitMode('equal');setShares({});setManualShares(new Set<number>());setMoreDetails(true);setOpen(true);
 },[receipts,members,currentUserId,params,summary]);

 const equalShares=useMemo(()=>{
   const ids=participants; const total=cents(amount); const out:Record<number,number>={}; if(!ids.length)return out;
   const base=Math.floor(total/ids.length); let remainder=total-base*ids.length;
   ids.forEach(uid=>{const add=remainder>0?1:0;out[uid]=(base+add)/100;if(remainder>0)remainder-=1}); return out;
 },[participants,amount]);

 function rebalanceCustom(nextAmount=amount,nextParticipants=participants,nextShares=shares,nextManual=manualShares){
   const total=cents(nextAmount); const activeManual=new Set([...nextManual].filter(uid=>nextParticipants.includes(uid))); const out:{[key:number]:string}={};
   let fixed=0;
   nextParticipants.forEach(uid=>{if(activeManual.has(uid)){const v=Math.max(0,cents(nextShares[uid]||0));fixed+=v;out[uid]=(v/100).toFixed(2)}});
   const flexible=nextParticipants.filter(uid=>!activeManual.has(uid)); let remaining=Math.max(0,total-fixed);
   if(flexible.length){const base=Math.floor(remaining/flexible.length);let rem=remaining-base*flexible.length;flexible.forEach(uid=>{const v=base+(rem>0?1:0);if(rem>0)rem-=1;out[uid]=(v/100).toFixed(2)})}
   else nextParticipants.forEach(uid=>{if(out[uid]===undefined)out[uid]='0.00'});
   setManualShares(activeManual);setShares(out);
 }

 function handleAmountChange(value:string){setAmount(value);if(splitMode==='custom')rebalanceCustom(value,participants,shares,manualShares)}
 function changeSplitMode(mode:'equal'|'custom'){
   setSplitMode(mode);setManualShares(new Set<number>());
   if(mode==='custom'){const out:Record<number,string>={};Object.entries(equalShares).forEach(([uid,v])=>out[Number(uid)]=amountString(v));setShares(out)}else setShares({});
 }
 function toggleParticipant(uid:number,on:boolean){
   const next=on?(participants.includes(uid)?participants:[...participants,uid]):participants.filter(x=>x!==uid);setParticipants(next);
   if(splitMode==='custom'){const nextManual=new Set(manualShares);nextManual.delete(uid);const nextShares={...shares};delete nextShares[uid];rebalanceCustom(amount,next,nextShares,nextManual)}
 }
 function changeCustomShare(uid:number,value:string){
   const nextShares={...shares,[uid]:value};const nextManual=new Set(manualShares);nextManual.add(uid);setShares(nextShares);rebalanceCustom(amount,participants,nextShares,nextManual);
 }
 function resetCustomEqual(){const out:Record<number,string>={};Object.entries(equalShares).forEach(([uid,v])=>out[Number(uid)]=amountString(v));setManualShares(new Set<number>());setShares(out)}

 const customTotal=participants.reduce((sum,uid)=>sum+Number(shares[uid]||0),0); const splitDifference=Math.round(((Number(amount)||0)-customTotal)*100)/100;
 function reset(){setTitle('Groceries');setAmount('');setCategory('Groceries');setNotes('');setReceiptId('');setSplitMode('equal');setParticipants(members.map(x=>x.user_id));setShares({});setManualShares(new Set<number>());setMoreDetails(false);setDate(new Date().toISOString().slice(0,10));const me=currentUserId&&members.some(x=>x.user_id===currentUserId)?currentUserId:members[0]?.user_id;setPayer(me||'');}
 async function save(){
   const total=Number(amount); if(!title.trim()||!total||!payer||!participants.length){setError('Enter the expense, payer, and at least one participant.');return;}
   const split=participants.map(uid=>({user_id:uid,share_amount:splitMode==='equal'?(equalShares[uid]||0):Number(shares[uid]||0)}));
   if(Math.abs(split.reduce((s,x)=>s+x.share_amount,0)-total)>.02){setError(c.splitMismatch);return;}
   try{setBusy(true);const {data}=await api.post<ExpenseSummary>(`/houses/${id}/expenses`,{title:title.trim(),amount:total,currency:'CAD',category,paid_by_user_id:payer,expense_date:date||null,notes:notes||null,receipt_id:receiptId||null,shares:split});setSummary(data);setOpen(false);reset();setError('');}
   catch(err){setError(errorMessage(err));}finally{setBusy(false)}
 }
 async function createCategory(){
   if(!newCategoryName.trim())return;try{setBusy(true);const {data}=await api.post<ExpenseCategory>(`/houses/${id}/expenses/categories`,{name:newCategoryName.trim(),icon:newCategoryIcon});setCustomCategories(prev=>prev.some(x=>x.id===data.id)?prev:[...prev,data]);setCategory(data.name);setNewCategoryName('');setNewCategoryIcon('✨');setCategoryCreatorOpen(false);setError('');}catch(err){setError(errorMessage(err));}finally{setBusy(false)}
 }
 async function saveReimbursement(){
   if(!reimburseTarget)return; const value=Number(reimburseAmount); if(value<=0||value>reimburseTarget.amount+.01){setError(`Enter an amount up to ${money(reimburseTarget.amount)}.`);return;}
   try{setBusy(true);const {data}=await api.post<ExpenseSummary>(`/houses/${id}/expenses/reimbursements`,{from_user_id:reimburseTarget.from_user_id,to_user_id:reimburseTarget.to_user_id,amount:value,currency:'CAD'});setSummary(data);setReimburseTarget(null);setReimburseAmount('');setError('');}catch(err){setError(errorMessage(err));}finally{setBusy(false)}
 }
 async function remove(expenseId:number){if(!confirm('Delete this shared expense?'))return;try{const {data}=await api.delete<ExpenseSummary>(`/houses/${id}/expenses/${expenseId}`);setSummary(data)}catch(err){setError(errorMessage(err))}}

 const currentBalance=summary?.balances.find(b=>b.user_id===currentUserId)?.balance||0;
 const mySuggested=(summary?.suggested_payments||[]).filter(x=>x.from_user_id===currentUserId||x.to_user_id===currentUserId);
 const visibleSuggestions=reimbursementView==='mine'?mySuggested:(summary?.suggested_payments||[]);

 const insightExpenses=useMemo(()=>{
   const rows=summary?.expenses||[]; if(insightRange==='all')return rows;
   const months=Number(insightRange);const start=new Date();start.setDate(1);start.setMonth(start.getMonth()-(months-1));start.setHours(0,0,0,0);
   return rows.filter(x=>new Date(`${x.expense_date}T00:00:00`)>=start);
 },[summary,insightRange]);
 const categoryInsights=useMemo(()=>{
   const map=new Map<string,{amount:number;count:number}>();insightExpenses.forEach(x=>{const prev=map.get(x.category)||{amount:0,count:0};prev.amount+=x.amount;prev.count+=1;map.set(x.category,prev)});
   return [...map.entries()].map(([name,v])=>({name,...v})).sort((a,b)=>b.amount-a.amount);
 },[insightExpenses]);
 const monthInsights=useMemo(()=>{
   const map=new Map<string,number>();insightExpenses.forEach(x=>{const key=x.expense_date.slice(0,7);map.set(key,(map.get(key)||0)+x.amount)});return [...map.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([month,value])=>({month,value}));
 },[insightExpenses]);
 const insightTotal=insightExpenses.reduce((s,x)=>s+x.amount,0); const insightMonths=Math.max(1,new Set(insightExpenses.map(x=>x.expense_date.slice(0,7))).size); const maxCategory=Math.max(1,...categoryInsights.map(x=>x.amount)); const maxMonth=Math.max(1,...monthInsights.map(x=>x.value));
 const topCategory=categoryInsights[0]?.name||'—';

 function openReimburse(x:ReimbursementTarget){setReimburseTarget(x);setReimburseAmount(amountString(x.amount));setError('')}
 function memberName(uid:number){return members.find(x=>x.user_id===uid)?.full_name||`Member ${uid}`}

 return <main className="page shell wide expenses-page">
   <header className="page-hero creative-hero expense-hero"><div><Link className="breadcrumb" to={`/houses/${id}`}>← {house?.name||'House'}</Link><p className="eyebrow">HOUSE MONEY</p><h1>💸 {c.title}</h1><p>{c.sub}</p></div><button className="expense-primary-action" onClick={()=>{reset();setOpen(true)}}><span>＋</span><strong>{c.add}</strong><small>Split in seconds</small></button></header>
   <HouseContextSwitcher currentHouseId={id} currentHouseName={house?.name} section="expenses" />{error&&<div className="error">{error}</div>}

   <section className={`expense-personal-summary ${currentBalance<-.009?'owe':currentBalance>.009?'owed':'even'}`}>
     <div className="expense-personal-icon">{currentBalance<-.009?'↗':currentBalance>.009?'↙':'✓'}</div><div><p className="eyebrow">YOUR POSITION</p><h2>{currentBalance<-.009?c.owes:currentBalance>.009?c.gets:c.settled}</h2><strong>{Math.abs(currentBalance)>.009?money(Math.abs(currentBalance)):money(0)}</strong></div><div className="expense-personal-note">{currentBalance<-.009?'Use a suggested reimbursement below to settle what you owe.':currentBalance>.009?'The people who owe you will see their reimbursement action.':'No action needed right now.'}</div>
   </section>

   <section className="expense-reimbursements panel premium-panel">
     <div className="panel-title-row reimbursement-heading"><div><p className="eyebrow">SMART REIMBURSEMENTS</p><h2>{c.suggest}</h2><p>One clear payment can settle multiple shared expenses.</p></div><div className="segmented reimbursement-tabs"><button className={reimbursementView==='mine'?'active':''} onClick={()=>setReimbursementView('mine')}>{c.mine}</button><button className={reimbursementView==='house'?'active':''} onClick={()=>setReimbursementView('house')}>{c.all}</button></div></div>
     {visibleSuggestions.length? <div className="reimbursement-grid">{visibleSuggestions.map((x,i)=>{
       const mine=x.from_user_id===currentUserId||x.to_user_id===currentUserId; const canAct=mine; const debtorIsMe=x.from_user_id===currentUserId; const creditorIsMe=x.to_user_id===currentUserId;
       return <article className={`reimbursement-card ${mine?'mine':''}`} key={`${x.from_user_id}-${x.to_user_id}-${i}`}>
         <div className="reimbursement-route"><div className="reimburse-person"><span className="member-avatar debt">{initials(x.from_user_name)}</span><strong>{x.from_user_name}</strong><small>owes</small></div><div className="reimburse-flow"><span></span><b>{money(x.amount)}</b><i>→</i></div><div className="reimburse-person"><span className="member-avatar credit">{initials(x.to_user_name)}</span><strong>{x.to_user_name}</strong><small>receives</small></div></div>
         <div className="reimbursement-card-footer"><span>✨ {c.settles}</span>{canAct?(<button className="reimburse-button" onClick={()=>openReimburse(x)}>{debtorIsMe?c.reimburse:creditorIsMe?c.received:c.reimburse}</button>):<span className="badge">{c.everyone}</span>}</div>
       </article>})}</div>:<div className="expense-empty-state"><span>🎉</span><strong>{c.noReimbursements}</strong><small>{c.settled}</small></div>}
   </section>

   <section className="expense-insights panel">
     <div className="panel-title-row"><div><p className="eyebrow">SPENDING PICTURE</p><h2>{c.insights}</h2><p>Choose the view that helps you understand where the household money goes.</p></div><div className="expense-insight-controls"><div className="segmented"><button className={insightMode==='category'?'active':''} onClick={()=>setInsightMode('category')}>{c.byCategory}</button><button className={insightMode==='month'?'active':''} onClick={()=>setInsightMode('month')}>{c.byMonth}</button></div><select value={insightRange} onChange={e=>setInsightRange(e.target.value as '6'|'12'|'all')} aria-label={c.range}><option value="6">{c.six}</option><option value="12">{c.twelve}</option><option value="all">{c.allTime}</option></select></div></div>
     <div className="expense-insight-kpis"><article><span>💳</span><small>{c.spent}</small><strong>{money(insightTotal)}</strong></article><article><span>🏆</span><small>{c.topCategory}</small><strong>{topCategory}</strong></article><article><span>📅</span><small>{c.average}</small><strong>{money(insightTotal/insightMonths)}</strong></article></div>
     {!insightExpenses.length?<div className="expense-empty-state"><span>📊</span><strong>{c.noHistory}</strong></div>:insightMode==='category'?<div className="expense-category-insights">{categoryInsights.map(row=><article key={row.name}><div className="expense-insight-label"><span className="expense-category-icon">{categoryIcon(row.name,categories)}</span><div><strong>{row.name}</strong><small>{row.count} expense{row.count===1?'':'s'} · {insightTotal?Math.round(row.amount/insightTotal*100):0}%</small></div><b>{money(row.amount)}</b></div><div className="expense-insight-bar"><span style={{width:`${Math.max(4,row.amount/maxCategory*100)}%`}} /></div></article>)}</div>:<div className="expense-month-insights">{monthInsights.map(row=><article key={row.month}><div><strong>{new Date(`${row.month}-01T00:00:00`).toLocaleDateString(undefined,{month:'short',year:'numeric'})}</strong><b>{money(row.value)}</b></div><div className="expense-month-bar"><span style={{width:`${Math.max(4,row.value/maxMonth*100)}%`}} /></div></article>)}</div>}
   </section>

   <section className="panel expense-history-panel"><div className="panel-title-row"><div><p className="eyebrow">ACTIVITY</p><h2>{c.history}</h2></div><button className="secondary expense-history-add" onClick={()=>{reset();setOpen(true)}}>＋ {c.add}</button></div><div className="expense-list">{(summary?.expenses||[]).map(x=><article className="expense-row" key={x.id}><div className="expense-row-category">{categoryIcon(x.category,categories)}</div><div className="expense-row-main"><strong>{x.title}</strong><small>{x.expense_date} · {x.category}{x.receipt_id?` · Receipt #${x.receipt_id}`:''}</small><span>{x.paid_by_name} {c.paid} · {x.shares.map(s=>`${s.user_name} ${money(s.share_amount)}`).join(' · ')}</span></div><div className="expense-row-amount"><b>{money(x.amount)}</b><button className="ghost tiny" onClick={()=>remove(x.id)}>{c.delete}</button></div></article>)}</div></section>

   {open&&<OverlayPortal><div className="modal-backdrop expense-form-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)setOpen(false)}}><section className="modal focus-dialog expense-modal expense-modal-v80" role="dialog" aria-modal="true" aria-label={c.add}>
     <header className="focus-dialog-titlebar expense-form-titlebar"><div><p className="eyebrow">SHARED COST</p><h2>{c.add}</h2><p>Start with the total, then choose who shares it.</p></div><button data-dialog-close="true" className="icon-btn" onClick={()=>setOpen(false)}>×</button></header>
     <div className="focus-dialog-scroll expense-form-scroll">
       {receiptId&&<div className="expense-linked-receipt-banner"><span>🧾</span><div><strong>{c.linkedReceipt}</strong><small>{receipts.find(r=>r.id===Number(receiptId))?.store_name||'Receipt'} · {amount?money(Number(amount)):''}</small></div></div>}
       <section className="expense-form-section expense-basics-section"><div className="expense-amount-field"><label>{c.amount}<div className="money-input"><span>$</span><input autoFocus inputMode="decimal" type="number" min="0.01" step="0.01" value={amount} onChange={e=>handleAmountChange(e.target.value)} placeholder="0.00" /></div></label></div><label className="expense-title-field">{c.expenseTitle}<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Groceries, electricity, dinner..." /></label></section>

       <section className="expense-form-section"><div className="expense-section-heading"><div><span>1</span><div><h3>{c.category}</h3><p>Tap one — no dropdown hunting.</p></div></div></div><div className="expense-category-grid">{categories.map(item=><button type="button" key={item.name} className={`expense-category-choice ${category===item.name?'active':''}`} onClick={()=>setCategory(item.name)}><span>{item.icon}</span><strong>{item.name}</strong></button>)}<button type="button" className={`expense-category-choice add-category ${categoryCreatorOpen?'active':''}`} onClick={()=>setCategoryCreatorOpen(v=>!v)}><span>＋</span><strong>{c.addCategory}</strong></button></div>
         {categoryCreatorOpen&&<div className="expense-category-creator"><div className="category-icon-picker">{CATEGORY_ICONS.map(icon=><button type="button" key={icon} className={newCategoryIcon===icon?'active':''} onClick={()=>setNewCategoryIcon(icon)}>{icon}</button>)}</div><div className="category-create-row"><input value={newCategoryName} onChange={e=>setNewCategoryName(e.target.value)} placeholder={c.categoryName}/><button type="button" onClick={createCategory} disabled={busy||!newCategoryName.trim()}>{c.createCategory}</button></div></div>}
       </section>

       <section className="expense-form-section"><div className="expense-section-heading"><div><span>2</span><div><h3>{c.payer}</h3><p>Who paid at the store or covered the bill?</p></div></div></div><div className="payer-card-grid">{members.map(m=><button type="button" key={m.user_id} className={`payer-card ${payer===m.user_id?'active':''}`} onClick={()=>setPayer(m.user_id)}><span className="member-avatar">{initials(m.full_name||`Member ${m.user_id}`)}</span><div><strong>{m.full_name||`Member ${m.user_id}`}</strong>{m.user_id===currentUserId&&<small>You</small>}</div><i>✓</i></button>)}</div></section>

       <section className="expense-form-section expense-split-section"><div className="expense-section-heading"><div><span>3</span><div><h3>{c.split}</h3><p>{splitMode==='custom'?c.customHelp:'Everyone selected below shares the total equally.'}</p></div></div><div className="segmented"><button type="button" className={splitMode==='equal'?'active':''} onClick={()=>changeSplitMode('equal')}>{c.equal}</button><button type="button" className={splitMode==='custom'?'active':''} onClick={()=>changeSplitMode('custom')}>{c.custom}</button></div></div>
         {splitMode==='custom'&&<div className="custom-split-toolbar"><span>{c.remaining}: <strong>{money(Math.max(0,splitDifference))}</strong></span><button type="button" className="ghost tiny" onClick={resetCustomEqual}>{c.resetEqual}</button></div>}
         <div className="expense-member-grid">{members.map(m=>{const on=participants.includes(m.user_id);const value=splitMode==='equal'?(equalShares[m.user_id]||0):Number(shares[m.user_id]||0);return <article className={`expense-member-card ${on?'selected':''}`} key={m.user_id}><label className="expense-member-select"><input type="checkbox" checked={on} onChange={e=>toggleParticipant(m.user_id,e.target.checked)}/><span className="member-avatar">{initials(m.full_name||`Member ${m.user_id}`)}</span><div><strong>{m.full_name||`Member ${m.user_id}`}</strong>{m.user_id===currentUserId&&<small>You</small>}</div></label>{on&&(splitMode==='equal'?<strong className="member-share-amount">{money(value)}</strong>:<div className="custom-share-input"><span>$</span><input type="number" min="0" step="0.01" value={shares[m.user_id]??'0.00'} onChange={e=>changeCustomShare(m.user_id,e.target.value)}/>{manualShares.has(m.user_id)&&<small>{c.manual}</small>}</div>)}</article>})}</div>
         {splitMode==='custom'&&<div className={`split-total-status ${Math.abs(splitDifference)<=.02?'ok':'warn'}`}><span>{Math.abs(splitDifference)<=.02?'✓':'!'}</span><strong>{Math.abs(splitDifference)<=.02?c.splitReady:c.splitMismatch}</strong><b>{money(customTotal)} / {money(Number(amount)||0)}</b></div>}
       </section>

       <section className="expense-form-section expense-more-section"><button type="button" className="expense-more-toggle" onClick={()=>setMoreDetails(v=>!v)}><span>⚙️</span><strong>{c.moreDetails}</strong><i>{moreDetails?'−':'+'}</i></button>{moreDetails&&<div className="expense-more-grid"><label>{c.date}<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>{c.receipt}<select value={receiptId} onChange={e=>setReceiptId(e.target.value?Number(e.target.value):'')}><option value="">No linked receipt</option>{receipts.map(r=><option key={r.id} value={r.id}>{r.store_name||'Receipt'} · {r.receipt_date||r.created_at.slice(0,10)} {r.total_amount!=null?`· ${money(r.total_amount)}`:''}</option>)}</select></label><label className="span-2">{c.notes}<textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional note"/></label></div>}</section>
     </div>
     <footer className="focus-dialog-actions expense-form-actions"><button className="secondary" onClick={()=>setOpen(false)}>{c.cancel}</button><div className="expense-save-summary"><small>{participants.length} participant{participants.length===1?'':'s'}</small><strong>{amount?money(Number(amount)):money(0)}</strong></div><button className="expense-save-button" disabled={busy||!participants.length||(splitMode==='custom'&&Math.abs(splitDifference)>.02)} onClick={save}>{busy?'Saving…':c.save}</button></footer>
   </section></div></OverlayPortal>}

   {reimburseTarget&&<OverlayPortal><div className="modal-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)setReimburseTarget(null)}}><section className="modal focus-dialog reimbursement-modal" role="dialog" aria-modal="true" aria-label={c.confirm}><header className="focus-dialog-titlebar"><div><p className="eyebrow">SETTLE SIMPLY</p><h2>{c.confirm}</h2></div><button data-dialog-close="true" className="icon-btn" onClick={()=>setReimburseTarget(null)}>×</button></header><div className="focus-dialog-scroll"><div className="reimbursement-confirm-route"><div className="reimburse-person"><span className="member-avatar debt">{initials(reimburseTarget.from_user_name)}</span><strong>{reimburseTarget.from_user_name}</strong></div><div className="reimburse-flow large"><span></span><i>→</i></div><div className="reimburse-person"><span className="member-avatar credit">{initials(reimburseTarget.to_user_name)}</span><strong>{reimburseTarget.to_user_name}</strong></div></div><div className="reimburse-amount-card"><small>Suggested</small><strong>{money(reimburseTarget.amount)}</strong><p>{c.partial}</p><label>Amount to reimburse<div className="money-input"><span>$</span><input type="number" min="0.01" max={reimburseTarget.amount} step="0.01" value={reimburseAmount} onChange={e=>setReimburseAmount(e.target.value)}/></div></label></div></div><footer className="focus-dialog-actions"><button className="secondary" onClick={()=>setReimburseTarget(null)}>{c.cancel}</button><button className="reimburse-button" disabled={busy||Number(reimburseAmount)<=0} onClick={saveReimbursement}>{busy?'Saving…':c.confirm}</button></footer></section></div></OverlayPortal>}
 </main>
}
