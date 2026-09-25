import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useHouseLiveRefresh } from '../hooks';
import { money } from '../currency';
import { useLanguage } from '../i18n';
import OverlayPortal from '../components/OverlayPortal';
import HouseContextSwitcher from '../components/HouseContextSwitcher';
import type {
  AccountBootstrap,
  ExpenseCategory,
  ExpenseSettlement,
  ExpenseSummary,
  House,
  HouseExpense,
  HouseMember,
  Receipt,
} from '../types';

type Lang = 'en' | 'gu' | 'hi' | 'fr';
type InsightMode = 'category' | 'month';
type ExpenseScope = 'house' | 'mine';
type RangeKey = '1' | '2' | '4' | '6' | '12' | '24' | 'all';
type ReimbursementTarget = { from_user_id: number; from_user_name: string; to_user_id: number; to_user_name: string; amount: number };
type CategoryChoice = { name: string; icon: string; custom?: boolean };

type MonthBook = {
  month: string;
  houseSpend: number;
  myShare: number;
  myPaid: number;
  expenseCount: number;
};

const copy: Record<Lang, any> = {
  en: {
    title: 'Shared expenses', sub: 'One clear place for household spending, your own share, reimbursements, and monthly trends.', add: 'Add expense', edit: 'Edit', update: 'Save changes', editTitle: 'Edit expense',
    history: 'Expense activity', suggest: 'Suggested reimbursements', paid: 'paid', split: 'Who shares this expense?', equal: 'Split equally', custom: 'Custom amounts', payer: 'Paid by', amount: 'Total amount', category: 'Choose a category', date: 'Date', notes: 'Notes', receipt: 'Linked receipt', save: 'Add expense', cancel: 'Cancel', owes: 'You owe', gets: 'You are owed', settled: 'You are all settled up', delete: 'Delete', mine: 'You owe / you are owed', all: 'View all house reimbursements', reimburse: 'Reimburse', received: 'Confirm received', settles: 'Recommended to settle the balance', partial: 'You can reimburse all or part of this amount.', confirm: 'Confirm reimbursement', insights: 'Expense insights', byCategory: 'By category', byMonth: 'By month', addCategory: 'Add category', categoryName: 'Category name', createCategory: 'Create category', moreDetails: 'Optional details', linkedReceipt: 'Receipt linked', customHelp: 'Edit any person. The remaining amount is automatically shared only between people you have not edited.', manual: 'Manually set', resetEqual: 'Reset equally', remaining: 'Remaining to distribute', splitReady: 'Split total matches the expense.', splitMismatch: 'Split must equal the expense total.', noHistory: 'No expenses in this view yet.', noReimbursements: 'No reimbursement is needed right now.', everyone: 'Everyone in the house', expenseTitle: 'What was this for?', receiptAlready: 'This receipt may already be linked to an expense.',
    thisMonth: 'This month', houseThisMonth: 'House this month', myThisMonth: 'My share this month', iPaidThisMonth: 'I paid this month', netPosition: 'My net position', monthlyBooks: 'Monthly books', monthlyBooksSub: 'Created automatically from each expense date. No monthly setup needed.', allMonths: 'All months', houseExpenses: 'House expenses', myExpenses: 'My expenses', myShare: 'My share', totalBill: 'Total bill', paidByMe: 'Paid by me', expenses: 'expenses', currentMonth: 'Current month', last2: '2 months', last4: '4 months', last6: '6 months', last12: '12 months', last24: '24 months', allTime: 'All time', spendingView: 'Spending view', periodSpend: 'Spend in period', topCategory: 'Top category', monthlyAverage: 'Monthly average', reimbursementHistory: 'Reimbursement history', reimbursementHistorySub: 'A permanent timeline of reimbursements recorded for this house.', myHistory: 'My reimbursements', houseHistory: 'House history', noSettlementHistory: 'No reimbursements have been recorded yet.', reimbursed: 'reimbursed', you: 'You', automatic: 'Automatic', selectedMonth: 'Selected month', clearMonth: 'Show all months',
  },
  gu: {
    title: 'સાંઝા ખર્ચ', sub: 'ઘરનો ખર્ચ, તમારો પોતાનો હિસ્સો, રીઇમ્બર્સમેન્ટ અને માસિક ટ્રેન્ડ એક જ સરળ જગ્યાએ.', add: 'ખર્ચ ઉમેરો', edit: 'ફેરફાર', update: 'ફેરફારો સાચવો', editTitle: 'ખર્ચમાં ફેરફાર', history: 'ખર્ચ પ્રવૃત્તિ', suggest: 'સૂચવેલા રીઇમ્બર્સમેન્ટ', paid: 'ચૂકવ્યું', split: 'આ ખર્ચ કોના વચ્ચે વહેંચવો?', equal: 'સમાન વહેંચણી', custom: 'કસ્ટમ રકમ', payer: 'ચૂકવનાર', amount: 'કુલ રકમ', category: 'શ્રેણી પસંદ કરો', date: 'તારીખ', notes: 'નોંધ', receipt: 'જોડાયેલી રસીદ', save: 'ખર્ચ ઉમેરો', cancel: 'રદ કરો', owes: 'તમારે આપવાનું છે', gets: 'તમારે મેળવવાનું છે', settled: 'તમારો હિસાબ બરાબર છે', delete: 'કાઢી નાખો', mine: 'તમારે આપવાનું / મેળવવાનું', all: 'ઘરના બધા રીઇમ્બર્સમેન્ટ જુઓ', reimburse: 'રીઇમ્બર્સ કરો', received: 'મળ્યું તેની પુષ્ટિ કરો', settles: 'બેલેન્સ સેટલ કરવા માટે સૂચવેલું', partial: 'તમે સંપૂર્ણ અથવા આંશિક રકમ રીઇમ્બર્સ કરી શકો છો.', confirm: 'રીઇમ્બર્સમેન્ટની પુષ્ટિ', insights: 'ખર્ચ ઇનસાઇટ્સ', byCategory: 'શ્રેણી મુજબ', byMonth: 'મહિના મુજબ', addCategory: 'શ્રેણી ઉમેરો', categoryName: 'શ્રેણીનું નામ', createCategory: 'શ્રેણી બનાવો', moreDetails: 'વૈકલ્પિક વિગતો', linkedReceipt: 'રસીદ જોડાયેલી', customHelp: 'કોઈ સભ્યની રકમ બદલો. બાકી રકમ ફક્ત તમે ન બદલેલા સભ્યોમાં આપમેળે વહેંચાશે.', manual: 'હાથેથી નક્કી', resetEqual: 'ફરી સમાન કરો', remaining: 'વહેંચવાની બાકી રકમ', splitReady: 'વહેંચણી કુલ ખર્ચ સાથે મેળ ખાય છે.', splitMismatch: 'વહેંચણી કુલ ખર્ચ જેટલી હોવી જોઈએ.', noHistory: 'આ દૃશ્યમાં હજુ કોઈ ખર્ચ નથી.', noReimbursements: 'હાલ કોઈ રીઇમ્બર્સમેન્ટ જરૂરી નથી.', everyone: 'ઘરના બધા સભ્યો', expenseTitle: 'આ ખર્ચ શેના માટે હતો?', receiptAlready: 'આ રસીદ કદાચ પહેલેથી ખર્ચ સાથે જોડાયેલી છે.',
    thisMonth: 'આ મહિનો', houseThisMonth: 'આ મહિને ઘરનો ખર્ચ', myThisMonth: 'આ મહિને મારો હિસ્સો', iPaidThisMonth: 'આ મહિને મેં ચૂકવ્યું', netPosition: 'મારી નેટ સ્થિતિ', monthlyBooks: 'માસિક હિસાબ', monthlyBooksSub: 'દરેક ખર્ચની તારીખ પરથી આપમેળે બને છે. મહિનો હાથેથી બનાવવાની જરૂર નથી.', allMonths: 'બધા મહિના', houseExpenses: 'ઘરના ખર્ચ', myExpenses: 'મારા ખર્ચ', myShare: 'મારો હિસ્સો', totalBill: 'કુલ બિલ', paidByMe: 'મારા દ્વારા ચૂકવેલ', expenses: 'ખર્ચ', currentMonth: 'હાલનો મહિનો', last2: '2 મહિના', last4: '4 મહિના', last6: '6 મહિના', last12: '12 મહિના', last24: '24 મહિના', allTime: 'બધો સમય', spendingView: 'ખર્ચ દૃશ્ય', periodSpend: 'સમયગાળાનો ખર્ચ', topCategory: 'ટોચની શ્રેણી', monthlyAverage: 'માસિક સરેરાશ', reimbursementHistory: 'રીઇમ્બર્સમેન્ટ ઇતિહાસ', reimbursementHistorySub: 'આ ઘરમાં નોંધાયેલા રીઇમ્બર્સમેન્ટની કાયમી સમયરેખા.', myHistory: 'મારા રીઇમ્બર્સમેન્ટ', houseHistory: 'ઘરનો ઇતિહાસ', noSettlementHistory: 'હજુ કોઈ રીઇમ્બર્સમેન્ટ નોંધાયેલ નથી.', reimbursed: 'રીઇમ્બર્સ કર્યું', you: 'તમે', automatic: 'આપમેળે', selectedMonth: 'પસંદ કરેલો મહિનો', clearMonth: 'બધા મહિના બતાવો',
  },
  hi: {
    title: 'साझा खर्च', sub: 'घर का खर्च, आपका हिस्सा, reimbursement और मासिक ट्रेंड एक आसान जगह पर।', add: 'खर्च जोड़ें', edit: 'संपादित करें', update: 'बदलाव सहेजें', editTitle: 'खर्च संपादित करें', history: 'खर्च गतिविधि', suggest: 'सुझाए गए reimbursement', paid: 'ने भुगतान किया', split: 'यह खर्च किन लोगों में बाँटना है?', equal: 'बराबर बाँटें', custom: 'कस्टम राशि', payer: 'भुगतान किसने किया', amount: 'कुल राशि', category: 'श्रेणी चुनें', date: 'तारीख', notes: 'नोट्स', receipt: 'जुड़ी रसीद', save: 'खर्च जोड़ें', cancel: 'रद्द करें', owes: 'आपको देना है', gets: 'आपको मिलना है', settled: 'आपका हिसाब बराबर है', delete: 'हटाएँ', mine: 'आपको देना / मिलना है', all: 'घर के सभी reimbursement देखें', reimburse: 'Reimburse करें', received: 'मिलने की पुष्टि करें', settles: 'बैलेंस बराबर करने के लिए सुझाया गया', partial: 'आप पूरी या आंशिक राशि reimburse कर सकते हैं।', confirm: 'Reimbursement की पुष्टि', insights: 'खर्च विश्लेषण', byCategory: 'श्रेणी अनुसार', byMonth: 'महीने अनुसार', addCategory: 'श्रेणी जोड़ें', categoryName: 'श्रेणी का नाम', createCategory: 'श्रेणी बनाएँ', moreDetails: 'वैकल्पिक विवरण', linkedReceipt: 'रसीद जुड़ी है', customHelp: 'किसी सदस्य की राशि बदलें। बची हुई राशि केवल उन सदस्यों में अपने आप बाँटी जाएगी जिन्हें आपने नहीं बदला है।', manual: 'आपने तय किया', resetEqual: 'फिर बराबर बाँटें', remaining: 'बाँटने के लिए बाकी', splitReady: 'बँटवारा कुल खर्च के बराबर है।', splitMismatch: 'बँटवारा कुल खर्च के बराबर होना चाहिए।', noHistory: 'इस दृश्य में अभी कोई खर्च नहीं है।', noReimbursements: 'अभी कोई reimbursement जरूरी नहीं है।', everyone: 'घर के सभी सदस्य', expenseTitle: 'यह खर्च किस लिए था?', receiptAlready: 'यह रसीद शायद पहले से किसी खर्च से जुड़ी है।',
    thisMonth: 'यह महीना', houseThisMonth: 'इस महीने घर का खर्च', myThisMonth: 'इस महीने मेरा हिस्सा', iPaidThisMonth: 'इस महीने मैंने भुगतान किया', netPosition: 'मेरी नेट स्थिति', monthlyBooks: 'मासिक हिसाब', monthlyBooksSub: 'हर खर्च की तारीख से अपने आप बनता है। महीने अलग से बनाने की जरूरत नहीं है।', allMonths: 'सभी महीने', houseExpenses: 'घर के खर्च', myExpenses: 'मेरे खर्च', myShare: 'मेरा हिस्सा', totalBill: 'कुल बिल', paidByMe: 'मेरे द्वारा भुगतान', expenses: 'खर्च', currentMonth: 'वर्तमान महीना', last2: '2 महीने', last4: '4 महीने', last6: '6 महीने', last12: '12 महीने', last24: '24 महीने', allTime: 'पूरा समय', spendingView: 'खर्च दृश्य', periodSpend: 'चुनी अवधि का खर्च', topCategory: 'मुख्य श्रेणी', monthlyAverage: 'मासिक औसत', reimbursementHistory: 'Reimbursement इतिहास', reimbursementHistorySub: 'इस घर में दर्ज reimbursements की स्थायी टाइमलाइन।', myHistory: 'मेरे reimbursements', houseHistory: 'घर का इतिहास', noSettlementHistory: 'अभी कोई reimbursement दर्ज नहीं हुआ है।', reimbursed: 'ने reimbursed किया', you: 'आप', automatic: 'अपने आप', selectedMonth: 'चुना महीना', clearMonth: 'सभी महीने दिखाएँ',
  },
  fr: {
    title: 'Dépenses partagées', sub: 'Dépenses du foyer, votre part, remboursements et tendances mensuelles au même endroit.', add: 'Ajouter une dépense', edit: 'Modifier', update: 'Enregistrer', editTitle: 'Modifier la dépense', history: 'Activité des dépenses', suggest: 'Remboursements suggérés', paid: 'a payé', split: 'Qui partage cette dépense ?', equal: 'Partage égal', custom: 'Montants personnalisés', payer: 'Payé par', amount: 'Montant total', category: 'Choisir une catégorie', date: 'Date', notes: 'Notes', receipt: 'Reçu lié', save: 'Ajouter la dépense', cancel: 'Annuler', owes: 'Vous devez', gets: 'On vous doit', settled: 'Tout est réglé pour vous', delete: 'Supprimer', mine: 'Ce que vous devez / ce qu’on vous doit', all: 'Voir tous les remboursements du foyer', reimburse: 'Rembourser', received: 'Confirmer la réception', settles: 'Recommandé pour équilibrer les comptes', partial: 'Vous pouvez rembourser tout ou partie de ce montant.', confirm: 'Confirmer le remboursement', insights: 'Analyse des dépenses', byCategory: 'Par catégorie', byMonth: 'Par mois', addCategory: 'Ajouter une catégorie', categoryName: 'Nom de la catégorie', createCategory: 'Créer la catégorie', moreDetails: 'Détails facultatifs', linkedReceipt: 'Reçu lié', customHelp: 'Modifiez une personne. Le montant restant est redistribué uniquement entre les personnes que vous n’avez pas modifiées.', manual: 'Défini manuellement', resetEqual: 'Réinitialiser également', remaining: 'Reste à répartir', splitReady: 'La répartition correspond au total.', splitMismatch: 'La répartition doit correspondre au total.', noHistory: 'Aucune dépense dans cette vue pour le moment.', noReimbursements: 'Aucun remboursement n’est nécessaire pour le moment.', everyone: 'Tous les membres du foyer', expenseTitle: 'À quoi correspond cette dépense ?', receiptAlready: 'Ce reçu est peut-être déjà lié à une dépense.',
    thisMonth: 'Ce mois-ci', houseThisMonth: 'Foyer ce mois-ci', myThisMonth: 'Ma part ce mois-ci', iPaidThisMonth: 'J’ai payé ce mois-ci', netPosition: 'Ma position nette', monthlyBooks: 'Livres mensuels', monthlyBooksSub: 'Créés automatiquement à partir de la date de chaque dépense. Aucun mois à créer manuellement.', allMonths: 'Tous les mois', houseExpenses: 'Dépenses du foyer', myExpenses: 'Mes dépenses', myShare: 'Ma part', totalBill: 'Facture totale', paidByMe: 'Payé par moi', expenses: 'dépenses', currentMonth: 'Mois en cours', last2: '2 mois', last4: '4 mois', last6: '6 mois', last12: '12 mois', last24: '24 mois', allTime: 'Depuis le début', spendingView: 'Vue des dépenses', periodSpend: 'Dépenses de la période', topCategory: 'Catégorie principale', monthlyAverage: 'Moyenne mensuelle', reimbursementHistory: 'Historique des remboursements', reimbursementHistorySub: 'Chronologie permanente des remboursements enregistrés pour ce foyer.', myHistory: 'Mes remboursements', houseHistory: 'Historique du foyer', noSettlementHistory: 'Aucun remboursement n’a encore été enregistré.', reimbursed: 'a remboursé', you: 'Vous', automatic: 'Automatique', selectedMonth: 'Mois sélectionné', clearMonth: 'Afficher tous les mois',
  },
};

const ledgerCopy: Record<Lang, any> = {
  en: {
    audit: 'Balance calculation', auditSub: 'See exactly why each person owes or receives this amount.', paidTotal: 'Paid for house', shareTotal: 'Their share', sentTotal: 'Reimbursements sent', receivedTotal: 'Reimbursements received', net: 'Net balance', formula: 'Paid − share + sent − received',
    pendingTransfers: 'Waiting for confirmation', pendingSub: 'These payments are marked as sent but do not change balances until the receiver confirms them.', markSent: 'Mark as sent', waitingPayer: 'Waiting for payer', waitingReceiver: 'Waiting for receiver', confirmReceived: 'Confirm received', cancelTransfer: 'Cancel', correctRecord: 'Undo / correct', confirmed: 'Confirmed', pending: 'Pending', cancelled: 'Cancelled', balanceOk: 'Balances reconcile exactly', balanceBad: 'Balance data does not reconcile. Please review expense splits.', pendingSent: 'pending sent', pendingReceived: 'pending received', affectsBalance: 'Confirmed reimbursements are included in the net balance.',
  },
  gu: {
    audit: 'બેલેન્સ ગણતરી', auditSub: 'દરેક વ્યક્તિએ કેટલી રકમ આપવાની અથવા મેળવવાની છે તે કેમ છે તે સ્પષ્ટ જુઓ.', paidTotal: 'ઘર માટે ચૂકવ્યું', shareTotal: 'તેમનો હિસ્સો', sentTotal: 'મોકલેલ રીઇમ્બર્સમેન્ટ', receivedTotal: 'મળેલ રીઇમ્બર્સમેન્ટ', net: 'નેટ બેલેન્સ', formula: 'ચૂકવ્યું − હિસ્સો + મોકલ્યું − મળ્યું',
    pendingTransfers: 'પુષ્ટિની રાહમાં', pendingSub: 'આ ચુકવણીઓ મોકલેલી તરીકે નોંધાઈ છે, પરંતુ મેળવનાર પુષ્ટિ કરે ત્યાં સુધી બેલેન્સ બદલાતું નથી.', markSent: 'મોકલ્યું તરીકે નોંધો', waitingPayer: 'ચૂકવનારની રાહમાં', waitingReceiver: 'મેળવનારની રાહમાં', confirmReceived: 'મળ્યું તેની પુષ્ટિ', cancelTransfer: 'રદ કરો', correctRecord: 'પાછું લો / સુધારો', confirmed: 'પુષ્ટિ થયેલ', pending: 'બાકી', cancelled: 'રદ થયેલ', balanceOk: 'બેલેન્સ સંપૂર્ણ રીતે મેળ ખાય છે', balanceBad: 'બેલેન્સ ડેટા મેળ ખાતો નથી. ખર્ચની વહેંચણી તપાસો.', pendingSent: 'મોકલવાનું બાકી', pendingReceived: 'મળવાનું બાકી', affectsBalance: 'પુષ્ટિ થયેલ રીઇમ્બર્સમેન્ટ નેટ બેલેન્સમાં ગણાય છે.',
  },
  hi: {
    audit: 'बैलेंस की गणना', auditSub: 'साफ़ देखें कि हर व्यक्ति को यह राशि क्यों देनी या मिलनी है।', paidTotal: 'घर के लिए भुगतान', shareTotal: 'उनका हिस्सा', sentTotal: 'भेजा reimbursement', receivedTotal: 'मिला reimbursement', net: 'नेट बैलेंस', formula: 'भुगतान − हिस्सा + भेजा − मिला',
    pendingTransfers: 'पुष्टि का इंतज़ार', pendingSub: 'ये भुगतान भेजे गए हैं, लेकिन पाने वाला पुष्टि करे तब तक बैलेंस नहीं बदलता।', markSent: 'भेजा हुआ दर्ज करें', waitingPayer: 'भुगतानकर्ता का इंतज़ार', waitingReceiver: 'प्राप्तकर्ता का इंतज़ार', confirmReceived: 'प्राप्ति की पुष्टि', cancelTransfer: 'रद्द करें', correctRecord: 'वापस लें / सुधारें', confirmed: 'पुष्टि हुई', pending: 'लंबित', cancelled: 'रद्द', balanceOk: 'बैलेंस पूरी तरह मेल खाता है', balanceBad: 'बैलेंस डेटा मेल नहीं खाता। खर्च की हिस्सेदारी जाँचें।', pendingSent: 'लंबित भेजा', pendingReceived: 'लंबित प्राप्त', affectsBalance: 'पुष्टि किए गए reimbursement नेट बैलेंस में शामिल हैं।',
  },
  fr: {
    audit: 'Calcul du solde', auditSub: 'Voyez exactement pourquoi chaque personne doit payer ou recevoir ce montant.', paidTotal: 'Payé pour le foyer', shareTotal: 'Sa part', sentTotal: 'Remboursements envoyés', receivedTotal: 'Remboursements reçus', net: 'Solde net', formula: 'Payé − part + envoyé − reçu',
    pendingTransfers: 'En attente de confirmation', pendingSub: 'Ces paiements sont marqués comme envoyés, mais ne modifient pas les soldes avant confirmation du destinataire.', markSent: 'Marquer comme envoyé', waitingPayer: 'En attente du payeur', waitingReceiver: 'En attente du destinataire', confirmReceived: 'Confirmer la réception', cancelTransfer: 'Annuler', correctRecord: 'Annuler / corriger', confirmed: 'Confirmé', pending: 'En attente', cancelled: 'Annulé', balanceOk: 'Les soldes correspondent exactement', balanceBad: 'Les soldes ne correspondent pas. Vérifiez les répartitions.', pendingSent: 'envoi en attente', pendingReceived: 'réception en attente', affectsBalance: 'Les remboursements confirmés sont inclus dans le solde net.',
  },
};

const BUILTIN_CATEGORIES: CategoryChoice[] = [
  { name: 'Groceries', icon: '🛒' }, { name: 'Household', icon: '🏠' }, { name: 'Dining', icon: '🍽️' }, { name: 'Utilities', icon: '💡' },
  { name: 'Transport', icon: '🚗' }, { name: 'Rent', icon: '🏡' }, { name: 'Health', icon: '❤️' }, { name: 'Entertainment', icon: '🎬' }, { name: 'Other', icon: '✨' },
];
const CATEGORY_ICONS = ['🛒', '🏠', '🍽️', '💡', '🚗', '🏡', '❤️', '🎬', '👶', '🐾', '🎁', '✈️', '📱', '🧹', '🛠️', '✨'];
const LOCALE: Record<Lang, string> = { en: 'en-CA', gu: 'gu-IN', hi: 'hi-IN', fr: 'fr-CA' };

function initials(name: string) { return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]?.toUpperCase()).join('') || '?'; }
function cents(value: number | string) { const n = Number(value) || 0; return Math.round(n * 100); }
function amountString(value: number) { return (Math.round(value * 100) / 100).toFixed(2); }
function categoryIcon(name: string, categories: CategoryChoice[]) { return categories.find(x => x.name.toLowerCase() === name.toLowerCase())?.icon || '✨'; }
function monthKey(value: string) { return value.slice(0, 7); }
function localMonthKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function localDateKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function monthStart(monthsBack: number) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - Math.max(0, monthsBack - 1)); d.setHours(0, 0, 0, 0); return d; }
function shareFor(expense: HouseExpense, userId: number | null) { return userId == null ? 0 : (expense.shares.find(s => s.user_id === userId)?.share_amount || 0); }

export default function ExpensesPage() {
  const { houseId } = useParams();
  const id = Number(houseId);
  const [params] = useSearchParams();
  const { language } = useLanguage();
  const lang = (language as Lang) || 'en';
  const c = copy[lang] || copy.en;
  const lc = ledgerCopy[lang] || ledgerCopy.en;
  const locale = LOCALE[lang] || LOCALE.en;

  const [house, setHouse] = useState<House | null>(null);
  const [members, setMembers] = useState<HouseMember[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [customCategories, setCustomCategories] = useState<ExpenseCategory[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [open, setOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
  const [reimburseTarget, setReimburseTarget] = useState<ReimbursementTarget | null>(null);
  const [reimburseAmount, setReimburseAmount] = useState('');
  const [title, setTitle] = useState('Groceries');
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState<number | ''>('');
  const [category, setCategory] = useState('Groceries');
  const [date, setDate] = useState(localDateKey());
  const [notes, setNotes] = useState('');
  const [receiptId, setReceiptId] = useState<number | ''>('');
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
  const [participants, setParticipants] = useState<number[]>([]);
  const [shares, setShares] = useState<Record<number, string>>({});
  const [manualShares, setManualShares] = useState<Set<number>>(() => new Set<number>());
  const [moreDetails, setMoreDetails] = useState(false);
  const [categoryCreatorOpen, setCategoryCreatorOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('✨');

  const [reimbursementView, setReimbursementView] = useState<'mine' | 'house'>('mine');
  const [reimbursementHistoryView, setReimbursementHistoryView] = useState<'mine' | 'house'>('mine');
  const [expenseScope, setExpenseScope] = useState<ExpenseScope>('house');
  const [insightMode, setInsightMode] = useState<InsightMode>('category');
  const [insightRange, setInsightRange] = useState<RangeKey>('1');
  const [selectedMonth, setSelectedMonth] = useState<string | 'all'>(() => localMonthKey());
  const prefilledReceiptRef = useRef<number>(0);

  const categories = useMemo<CategoryChoice[]>(() => {
    const seen = new Set<string>(); const out: CategoryChoice[] = [];
    [...BUILTIN_CATEGORIES, ...customCategories.map(x => ({ name: x.name, icon: x.icon, custom: true }))].forEach(item => {
      const k = item.name.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(item); }
    });
    return out;
  }, [customCategories]);

  async function load() {
    try {
      const [h, m, r, e, a, cat] = await Promise.all([
        api.get<House>(`/houses/${id}`), api.get<HouseMember[]>(`/houses/${id}/members`), api.get<Receipt[]>(`/houses/${id}/receipts`), api.get<ExpenseSummary>(`/houses/${id}/expenses`), api.get<AccountBootstrap>('/account/bootstrap', { params: { t: Date.now() } }), api.get<ExpenseCategory[]>(`/houses/${id}/expenses/categories`),
      ]);
      setHouse(h.data); setMembers(m.data); setReceipts(r.data); setSummary(e.data); setCustomCategories(cat.data); setCurrentUserId(a.data.user.id); setError('');
      const defaultPayer = m.data.some(x => x.user_id === a.data.user.id) ? a.data.user.id : m.data[0]?.user_id;
      setPayer(prev => prev || defaultPayer || '');
      setParticipants(prev => prev.length ? prev : m.data.map(x => x.user_id));
    } catch (err) { setError(errorMessage(err)); }
  }
  useEffect(() => { void load(); }, [id]);
  useHouseLiveRefresh(id, load);

  useEffect(() => {
    const rid = Number(params.get('receiptId') || 0); if (!rid || !receipts.length || !members.length || prefilledReceiptRef.current === rid) return;
    const r = receipts.find(x => x.id === rid); if (!r) return;
    if (summary?.expenses.some(x => x.receipt_id === rid)) { prefilledReceiptRef.current = rid; setError(c.receiptAlready); return; }
    prefilledReceiptRef.current = rid; setReceiptId(r.id); setTitle(`${r.store_name || 'Grocery'} receipt`); setCategory('Groceries');
    if (r.total_amount != null) setAmount(String(r.total_amount)); if (r.receipt_date) setDate(r.receipt_date);
    const uploaderId = r.uploaded_by?.id; const fallback = currentUserId && members.some(m => m.user_id === currentUserId) ? currentUserId : members[0]?.user_id;
    setPayer(uploaderId && members.some(m => m.user_id === uploaderId) ? uploaderId : (fallback || ''));
    setParticipants(members.map(x => x.user_id)); setSplitMode('equal'); setShares({}); setManualShares(new Set<number>()); setMoreDetails(true); setOpen(true);
  }, [receipts, members, currentUserId, params, summary]);

  const equalShares = useMemo(() => {
    const ids = participants; const total = cents(amount); const out: Record<number, number> = {}; if (!ids.length) return out;
    const base = Math.floor(total / ids.length); let remainder = total - base * ids.length;
    ids.forEach(uid => { const add = remainder > 0 ? 1 : 0; out[uid] = (base + add) / 100; if (remainder > 0) remainder -= 1; }); return out;
  }, [participants, amount]);

  function rebalanceCustom(nextAmount = amount, nextParticipants = participants, nextShares = shares, nextManual = manualShares) {
    const total = cents(nextAmount); const activeManual = new Set([...nextManual].filter(uid => nextParticipants.includes(uid))); const out: { [key: number]: string } = {};
    let fixed = 0;
    nextParticipants.forEach(uid => { if (activeManual.has(uid)) { const v = Math.max(0, cents(nextShares[uid] || 0)); fixed += v; out[uid] = (v / 100).toFixed(2); } });
    const flexible = nextParticipants.filter(uid => !activeManual.has(uid)); let remaining = Math.max(0, total - fixed);
    if (flexible.length) { const base = Math.floor(remaining / flexible.length); let rem = remaining - base * flexible.length; flexible.forEach(uid => { const v = base + (rem > 0 ? 1 : 0); if (rem > 0) rem -= 1; out[uid] = (v / 100).toFixed(2); }); }
    else nextParticipants.forEach(uid => { if (out[uid] === undefined) out[uid] = '0.00'; });
    setManualShares(activeManual); setShares(out);
  }

  function handleAmountChange(value: string) { setAmount(value); if (splitMode === 'custom') rebalanceCustom(value, participants, shares, manualShares); }
  function changeSplitMode(mode: 'equal' | 'custom') {
    setSplitMode(mode); setManualShares(new Set<number>());
    if (mode === 'custom') { const out: Record<number, string> = {}; Object.entries(equalShares as Record<number, number>).forEach(([uid, v]) => out[Number(uid)] = amountString(v)); setShares(out); } else setShares({});
  }
  function toggleParticipant(uid: number, on: boolean) {
    const next = on ? (participants.includes(uid) ? participants : [...participants, uid]) : participants.filter(x => x !== uid); setParticipants(next);
    if (splitMode === 'custom') { const nextManual = new Set(manualShares); nextManual.delete(uid); const nextShares = { ...shares }; delete nextShares[uid]; rebalanceCustom(amount, next, nextShares, nextManual); }
  }
  function changeCustomShare(uid: number, value: string) {
    const nextShares = { ...shares, [uid]: value }; const nextManual = new Set(manualShares); nextManual.add(uid); setShares(nextShares); rebalanceCustom(amount, participants, nextShares, nextManual);
  }
  function resetCustomEqual() { const out: Record<number, string> = {}; Object.entries(equalShares as Record<number, number>).forEach(([uid, v]) => out[Number(uid)] = amountString(v)); setManualShares(new Set<number>()); setShares(out); }

  const customTotal = participants.reduce((sum, uid) => sum + Number(shares[uid] || 0), 0);
  const splitDifference = Math.round(((Number(amount) || 0) - customTotal) * 100) / 100;
  function reset() {
    setEditingExpenseId(null);
    setTitle('Groceries'); setAmount(''); setCategory('Groceries'); setNotes(''); setReceiptId(''); setSplitMode('equal'); setParticipants(members.map(x => x.user_id)); setShares({}); setManualShares(new Set<number>()); setMoreDetails(false); setDate(localDateKey());
    const me = currentUserId && members.some(x => x.user_id === currentUserId) ? currentUserId : members[0]?.user_id; setPayer(me || '');
  }
  async function save() {
    const total = Number(amount); if (!title.trim() || !total || !payer || !participants.length) { setError('Enter the expense, payer, and at least one participant.'); return; }
    const split = participants.map(uid => ({ user_id: uid, share_amount: splitMode === 'equal' ? (equalShares[uid] || 0) : Number(shares[uid] || 0) }));
    if (Math.abs(split.reduce((s, x) => s + x.share_amount, 0) - total) > .02) { setError(c.splitMismatch); return; }
    try {
      setBusy(true);
      const payload = { title: title.trim(), amount: total, currency: 'CAD', category, paid_by_user_id: payer, expense_date: date || null, notes: notes || null, receipt_id: receiptId || null, shares: split };
      const { data } = editingExpenseId
        ? await api.put<ExpenseSummary>(`/houses/${id}/expenses/${editingExpenseId}`, payload)
        : await api.post<ExpenseSummary>(`/houses/${id}/expenses`, payload);
      setSummary(data); setOpen(false); reset(); setError('');
    }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  async function createCategory() {
    if (!newCategoryName.trim()) return;
    try { setBusy(true); const { data } = await api.post<ExpenseCategory>(`/houses/${id}/expenses/categories`, { name: newCategoryName.trim(), icon: newCategoryIcon }); setCustomCategories(prev => prev.some(x => x.id === data.id) ? prev : [...prev, data]); setCategory(data.name); setNewCategoryName(''); setNewCategoryIcon('✨'); setCategoryCreatorOpen(false); setError(''); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  async function saveReimbursement() {
    if (!reimburseTarget) return; const value = Number(reimburseAmount); if (value <= 0 || value > reimburseTarget.amount + .01) { setError(`Enter an amount up to ${money(reimburseTarget.amount)}.`); return; }
    try { setBusy(true); const { data } = await api.post<ExpenseSummary>(`/houses/${id}/expenses/reimbursements`, { from_user_id: reimburseTarget.from_user_id, to_user_id: reimburseTarget.to_user_id, amount: value, currency: 'CAD' }); setSummary(data); setReimburseTarget(null); setReimburseAmount(''); setError(''); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  async function confirmReimbursement(settlementId: number) {
    try { setBusy(true); const { data } = await api.post<ExpenseSummary>(`/houses/${id}/expenses/reimbursements/${settlementId}/confirm`); setSummary(data); setError(''); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  async function cancelReimbursement(settlementId: number) {
    if (!confirm('Cancel this reimbursement record? The history will remain visible, but it will no longer affect balances.')) return;
    try { setBusy(true); const { data } = await api.post<ExpenseSummary>(`/houses/${id}/expenses/reimbursements/${settlementId}/cancel`); setSummary(data); setError(''); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  function editExpense(expense: HouseExpense) {
    setEditingExpenseId(expense.id);
    setTitle(expense.title);
    setAmount(amountString(expense.amount));
    setCategory(expense.category || 'Groceries');
    setPayer(expense.paid_by_user_id);
    setDate(expense.expense_date || localDateKey());
    setNotes(expense.notes || '');
    setReceiptId(expense.receipt_id || '');
    const ids = expense.shares.map(s => s.user_id);
    setParticipants(ids);
    const equal = ids.length > 0 && expense.shares.every(s => Math.abs(s.share_amount - expense.amount / ids.length) < .02);
    if (equal) { setSplitMode('equal'); setShares({}); setManualShares(new Set<number>()); }
    else {
      setSplitMode('custom');
      const nextShares: Record<number,string> = {};
      expense.shares.forEach(share => { nextShares[share.user_id] = amountString(share.share_amount); });
      setShares(nextShares); setManualShares(new Set(ids));
    }
    setMoreDetails(Boolean(expense.notes || expense.receipt_id));
    setError(''); setOpen(true);
  }
  async function remove(expenseId: number) { if (!confirm('Delete this shared expense?')) return; try { const { data } = await api.delete<ExpenseSummary>(`/houses/${id}/expenses/${expenseId}`); setSummary(data); } catch (err) { setError(errorMessage(err)); } }

  const expenses = summary?.expenses || [];
  const settlements = summary?.settlements || [];
  const balanceBreakdown = summary?.balance_breakdown || [];
  const pendingSettlements = settlements.filter(x => x.status === 'pending');
  const currentBalance = summary?.balances.find(b => b.user_id === currentUserId)?.balance || 0;
  const mySuggested = (summary?.suggested_payments || []).filter(x => x.from_user_id === currentUserId || x.to_user_id === currentUserId);
  const visibleSuggestions = reimbursementView === 'mine' ? mySuggested : (summary?.suggested_payments || []);
  const currentMonthKey = localMonthKey();
  const currentMonthExpenses = expenses.filter(x => monthKey(x.expense_date) === currentMonthKey);
  const currentHouseSpend = currentMonthExpenses.reduce((s, x) => s + x.amount, 0);
  const currentMyShare = currentMonthExpenses.reduce((s, x) => s + shareFor(x, currentUserId), 0);
  const currentMyPaid = currentMonthExpenses.reduce((s, x) => s + (x.paid_by_user_id === currentUserId ? x.amount : 0), 0);

  const monthBooks = useMemo<MonthBook[]>(() => {
    const map = new Map<string, MonthBook>();
    expenses.forEach(expense => {
      const key = monthKey(expense.expense_date);
      const row = map.get(key) || { month: key, houseSpend: 0, myShare: 0, myPaid: 0, expenseCount: 0 };
      row.houseSpend += expense.amount; row.myShare += shareFor(expense, currentUserId); row.myPaid += expense.paid_by_user_id === currentUserId ? expense.amount : 0; row.expenseCount += 1; map.set(key, row);
    });
    if (!map.has(currentMonthKey)) map.set(currentMonthKey, { month: currentMonthKey, houseSpend: 0, myShare: 0, myPaid: 0, expenseCount: 0 });
    return [...map.values()].sort((a, b) => b.month.localeCompare(a.month));
  }, [expenses, currentUserId, currentMonthKey]);

  const rangeExpenses = useMemo(() => {
    if (insightRange === 'all') return expenses;
    const start = monthStart(Number(insightRange));
    return expenses.filter(x => new Date(`${x.expense_date}T00:00:00`) >= start);
  }, [expenses, insightRange]);

  const insightRows = useMemo(() => rangeExpenses.map(expense => ({
    expense,
    value: expenseScope === 'house' ? expense.amount : shareFor(expense, currentUserId),
  })).filter(row => row.value > .0001), [rangeExpenses, expenseScope, currentUserId]);

  const categoryInsights = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>();
    insightRows.forEach(({ expense, value }) => { const prev = map.get(expense.category) || { amount: 0, count: 0 }; prev.amount += value; prev.count += 1; map.set(expense.category, prev); });
    return [...map.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.amount - a.amount);
  }, [insightRows]);
  const monthInsights = useMemo(() => {
    const map = new Map<string, number>(); insightRows.forEach(({ expense, value }) => { const key = monthKey(expense.expense_date); map.set(key, (map.get(key) || 0) + value); });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, value }));
  }, [insightRows]);
  const insightTotal = insightRows.reduce((s, x) => s + x.value, 0);
  const activeMonths = Math.max(1, new Set(insightRows.map(x => monthKey(x.expense.expense_date))).size);
  const maxCategory = Math.max(1, ...categoryInsights.map(x => x.amount)); const maxMonth = Math.max(1, ...monthInsights.map(x => x.value)); const topCategory = categoryInsights[0]?.name || '—';

  const visibleExpenses = useMemo(() => expenses.filter(expense => {
    if (selectedMonth !== 'all' && monthKey(expense.expense_date) !== selectedMonth) return false;
    if (expenseScope === 'mine' && shareFor(expense, currentUserId) <= .0001) return false;
    return true;
  }), [expenses, selectedMonth, expenseScope, currentUserId]);

  const visibleSettlementHistory = useMemo(() => settlements.filter(row => reimbursementHistoryView === 'house' || row.from_user_id === currentUserId || row.to_user_id === currentUserId), [settlements, reimbursementHistoryView, currentUserId]);
  const settlementGroups = useMemo(() => {
    const map = new Map<string, ExpenseSettlement[]>(); visibleSettlementHistory.forEach(row => { const key = row.created_at.slice(0, 7); map.set(key, [...(map.get(key) || []), row]); });
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [visibleSettlementHistory]);

  function openReimburse(x: ReimbursementTarget) { setReimburseTarget(x); setReimburseAmount(amountString(x.amount)); setError(''); }
  function monthLabel(key: string) { return new Date(`${key}-01T00:00:00`).toLocaleDateString(locale, { month: 'long', year: 'numeric' }); }
  function dayLabel(value: string) { return new Date(value.includes('T') ? value : `${value}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }); }
  function displayMember(uid: number, name: string) { return uid === currentUserId ? c.you : name; }
  const currentMembership = members.find(m => m.user_id === currentUserId);
  const canCorrectSettlement = (row: ExpenseSettlement) => row.from_user_id === currentUserId || row.to_user_id === currentUserId || currentMembership?.role === 'owner' || currentMembership?.role === 'admin';
  const settlementStatusLabel = (row: ExpenseSettlement) => row.status === 'pending' ? lc.pending : row.status === 'cancelled' ? lc.cancelled : lc.confirmed;
  const rangeOptions: { value: RangeKey; label: string }[] = [
    { value: '1', label: c.currentMonth }, { value: '2', label: c.last2 }, { value: '4', label: c.last4 }, { value: '6', label: c.last6 }, { value: '12', label: c.last12 }, { value: '24', label: c.last24 }, { value: 'all', label: c.allTime },
  ];

  return <main className="page shell wide expenses-page expenses-page-v82">
    <header className="page-hero creative-hero expense-hero">
      <div><Link className="breadcrumb" to={`/houses/${id}`}>← {house?.name || 'House'}</Link><p className="eyebrow">HOUSE MONEY</p><h1>💸 {c.title}</h1><p>{c.sub}</p></div>
      <button className="expense-primary-action" onClick={() => { reset(); setOpen(true); }}><span>＋</span><strong>{c.add}</strong><small>Split in seconds</small></button>
    </header>
    <HouseContextSwitcher currentHouseId={id} currentHouseName={house?.name} section="expenses" />
    {error && <div className="error">{error}</div>}

    <section className="expense-month-snapshot" aria-label={c.thisMonth}>
      <div className="expense-snapshot-heading"><div><p className="eyebrow">{c.thisMonth}</p><h2>{monthLabel(currentMonthKey)}</h2></div><span className="expense-auto-badge">⚡ {c.automatic}</span></div>
      <div className="expense-snapshot-grid">
        <article className="house"><span>🏠</span><small>{c.houseThisMonth}</small><strong>{money(currentHouseSpend)}</strong><i>{currentMonthExpenses.length} {c.expenses}</i></article>
        <article className="mine"><span>👤</span><small>{c.myThisMonth}</small><strong>{money(currentMyShare)}</strong><i>{c.myShare}</i></article>
        <article className="paid"><span>💳</span><small>{c.iPaidThisMonth}</small><strong>{money(currentMyPaid)}</strong><i>{c.paidByMe}</i></article>
        <article className={currentBalance < -.009 ? 'owe' : currentBalance > .009 ? 'owed' : 'even'}><span>{currentBalance < -.009 ? '↗' : currentBalance > .009 ? '↙' : '✓'}</span><small>{c.netPosition}</small><strong>{money(Math.abs(currentBalance))}</strong><i>{currentBalance < -.009 ? c.owes : currentBalance > .009 ? c.gets : c.settled}</i></article>
      </div>
    </section>

    <section className="panel expense-month-books">
      <div className="panel-title-row"><div><p className="eyebrow">MONTH BY MONTH</p><h2>{c.monthlyBooks}</h2><p>{c.monthlyBooksSub}</p></div><button className={`secondary ${selectedMonth === 'all' ? 'active' : ''}`} onClick={() => setSelectedMonth('all')}>{c.allMonths}</button></div>
      <div className="expense-month-book-strip">
        {monthBooks.map(book => <button key={book.month} className={`expense-month-book ${selectedMonth === book.month ? 'active' : ''}`} onClick={() => setSelectedMonth(book.month)}>
          <div className="expense-month-book-top"><span>📅</span><strong>{monthLabel(book.month)}</strong>{book.month === currentMonthKey && <i>{c.thisMonth}</i>}</div>
          <div className="expense-month-book-total"><small>{c.houseExpenses}</small><b>{money(book.houseSpend)}</b></div>
          <div className="expense-month-book-metrics"><span><small>{c.myShare}</small><strong>{money(book.myShare)}</strong></span><span><small>{c.paidByMe}</small><strong>{money(book.myPaid)}</strong></span><span><small>{c.expenses}</small><strong>{book.expenseCount}</strong></span></div>
        </button>)}
      </div>
    </section>

    <section className="expense-balance-audit panel">
      <div className="panel-title-row"><div><p className="eyebrow">BALANCE CHECK</p><h2>🧮 {lc.audit}</h2><p>{lc.auditSub}</p></div><span className={`expense-ledger-integrity ${summary?.balance_is_valid === false ? 'bad' : 'ok'}`}>{summary?.balance_is_valid === false ? `⚠ ${lc.balanceBad}` : `✓ ${lc.balanceOk}`}</span></div>
      <p className="expense-ledger-formula">{lc.formula} <small>· {lc.affectsBalance}</small></p>
      <div className="expense-ledger-grid">{balanceBreakdown.map(row => <article key={row.user_id} className={`expense-ledger-card ${row.balance > .009 ? 'credit' : row.balance < -.009 ? 'debt' : 'settled'}`}>
        <header><span className="member-avatar">{initials(row.user_name)}</span><div><strong>{displayMember(row.user_id, row.user_name)}</strong><small>{row.balance > .009 ? c.gets : row.balance < -.009 ? c.owes : c.settled}</small></div><b>{row.balance > .009 ? '+' : row.balance < -.009 ? '−' : ''}{money(Math.abs(row.balance))}</b></header>
        <div className="expense-ledger-math"><span><small>{lc.paidTotal}</small><strong>{money(row.paid)}</strong></span><i>−</i><span><small>{lc.shareTotal}</small><strong>{money(row.share)}</strong></span><i>＋</i><span><small>{lc.sentTotal}</small><strong>{money(row.reimbursements_sent)}</strong></span><i>−</i><span><small>{lc.receivedTotal}</small><strong>{money(row.reimbursements_received)}</strong></span></div>
        {(row.pending_sent > .009 || row.pending_received > .009) && <div className="expense-ledger-pending">⏳ {row.pending_sent > .009 ? `${lc.pendingSent}: ${money(row.pending_sent)}` : ''}{row.pending_sent > .009 && row.pending_received > .009 ? ' · ' : ''}{row.pending_received > .009 ? `${lc.pendingReceived}: ${money(row.pending_received)}` : ''}</div>}
      </article>)}</div>
    </section>

    {pendingSettlements.length > 0 && <section className="pending-reimbursements panel">
      <div className="panel-title-row"><div><p className="eyebrow">PAYMENT CONFIRMATION</p><h2>⏳ {lc.pendingTransfers}</h2><p>{lc.pendingSub}</p></div></div>
      <div className="pending-reimbursement-grid">{pendingSettlements.map(row => <article key={row.id} className="pending-reimbursement-card">
        <div className="reimbursement-route"><div className="reimburse-person"><span className="member-avatar debt">{initials(row.from_user_name)}</span><strong>{displayMember(row.from_user_id, row.from_user_name)}</strong><small>{c.owes}</small></div><div className="reimburse-flow"><span></span><b>{money(row.amount)}</b><i>→</i></div><div className="reimburse-person"><span className="member-avatar credit">{initials(row.to_user_name)}</span><strong>{displayMember(row.to_user_id, row.to_user_name)}</strong><small>{c.gets}</small></div></div>
        <footer>{row.to_user_id === currentUserId ? <button className="reimburse-button" disabled={busy} onClick={() => confirmReimbursement(row.id)}>{lc.confirmReceived}</button> : <span className="badge">{row.from_user_id === currentUserId ? lc.waitingReceiver : lc.pending}</span>}{canCorrectSettlement(row) && <button className="ghost tiny" disabled={busy} onClick={() => cancelReimbursement(row.id)}>{lc.cancelTransfer}</button>}</footer>
      </article>)}</div>
    </section>}

    <section className="expense-reimbursements panel premium-panel">
      <div className="panel-title-row reimbursement-heading"><div><p className="eyebrow">SMART REIMBURSEMENTS</p><h2>{c.suggest}</h2><p>Balances are netted across every expense first, then settled in exact cents.</p></div><div className="segmented reimbursement-tabs"><button className={reimbursementView === 'mine' ? 'active' : ''} onClick={() => setReimbursementView('mine')}>{c.mine}</button><button className={reimbursementView === 'house' ? 'active' : ''} onClick={() => setReimbursementView('house')}>{c.all}</button></div></div>
      {visibleSuggestions.length ? <div className="reimbursement-grid">{visibleSuggestions.map((x, i) => {
        const mine = x.from_user_id === currentUserId || x.to_user_id === currentUserId; const debtorIsMe = x.from_user_id === currentUserId; const creditorIsMe = x.to_user_id === currentUserId;
        return <article className={`reimbursement-card ${mine ? 'mine' : ''}`} key={`${x.from_user_id}-${x.to_user_id}-${i}`}>
          <div className="reimbursement-route"><div className="reimburse-person"><span className="member-avatar debt">{initials(x.from_user_name)}</span><strong>{displayMember(x.from_user_id, x.from_user_name)}</strong><small>owes</small></div><div className="reimburse-flow"><span></span><b>{money(x.amount)}</b><i>→</i></div><div className="reimburse-person"><span className="member-avatar credit">{initials(x.to_user_name)}</span><strong>{displayMember(x.to_user_id, x.to_user_name)}</strong><small>receives</small></div></div>
          <div className="reimbursement-card-footer"><span>✨ {c.settles}</span>{debtorIsMe ? <button className="reimburse-button" onClick={() => openReimburse(x)}>{lc.markSent}</button> : creditorIsMe ? <span className="badge">{lc.waitingPayer}</span> : <span className="badge">{c.everyone}</span>}</div>
        </article>;
      })}</div> : <div className="expense-empty-state"><span>🎉</span><strong>{c.noReimbursements}</strong><small>{c.settled}</small></div>}
    </section>

    <section className="expense-insights panel expense-insights-v82">
      <div className="expense-insights-head">
        <div><p className="eyebrow">SPENDING PICTURE</p><h2>{c.insights}</h2><p>Switch between the whole household and only your own share.</p></div>
        <div className="expense-scope-switch"><button className={expenseScope === 'house' ? 'active' : ''} onClick={() => setExpenseScope('house')}><span>🏠</span><strong>{c.houseExpenses}</strong></button><button className={expenseScope === 'mine' ? 'active' : ''} onClick={() => setExpenseScope('mine')}><span>👤</span><strong>{c.myExpenses}</strong></button></div>
      </div>
      <div className="expense-insight-toolbar"><div className="expense-range-pills">{rangeOptions.map(option => <button key={option.value} className={insightRange === option.value ? 'active' : ''} onClick={() => setInsightRange(option.value)}>{option.label}</button>)}</div><div className="segmented"><button className={insightMode === 'category' ? 'active' : ''} onClick={() => setInsightMode('category')}>{c.byCategory}</button><button className={insightMode === 'month' ? 'active' : ''} onClick={() => setInsightMode('month')}>{c.byMonth}</button></div></div>
      <div className="expense-insight-kpis"><article><span>{expenseScope === 'house' ? '🏠' : '👤'}</span><small>{c.periodSpend}</small><strong>{money(insightTotal)}</strong></article><article><span>🏆</span><small>{c.topCategory}</small><strong>{topCategory}</strong></article><article><span>📅</span><small>{c.monthlyAverage}</small><strong>{money(insightTotal / activeMonths)}</strong></article></div>
      {!insightRows.length ? <div className="expense-empty-state"><span>📊</span><strong>{c.noHistory}</strong></div> : insightMode === 'category' ? <div className="expense-category-insights">{categoryInsights.map(row => <article key={row.name}><div className="expense-insight-label"><span className="expense-category-icon">{categoryIcon(row.name, categories)}</span><div><strong>{row.name}</strong><small>{row.count} {c.expenses} · {insightTotal ? Math.round(row.amount / insightTotal * 100) : 0}%</small></div><b>{money(row.amount)}</b></div><div className="expense-insight-bar"><span style={{ width: `${Math.max(4, row.amount / maxCategory * 100)}%` }} /></div></article>)}</div> : <div className="expense-month-insights">{monthInsights.map(row => <article key={row.month}><div><strong>{monthLabel(row.month)}</strong><b>{money(row.value)}</b></div><div className="expense-month-bar"><span style={{ width: `${Math.max(4, row.value / maxMonth * 100)}%` }} /></div></article>)}</div>}
    </section>

    <section className="panel reimbursement-history-panel">
      <div className="panel-title-row"><div><p className="eyebrow">SETTLEMENT TIMELINE</p><h2>{c.reimbursementHistory}</h2><p>{c.reimbursementHistorySub}</p></div><div className="segmented"><button className={reimbursementHistoryView === 'mine' ? 'active' : ''} onClick={() => setReimbursementHistoryView('mine')}>{c.myHistory}</button><button className={reimbursementHistoryView === 'house' ? 'active' : ''} onClick={() => setReimbursementHistoryView('house')}>{c.houseHistory}</button></div></div>
      {settlementGroups.length ? <div className="reimbursement-history-groups">{settlementGroups.map(([month, rows]) => <section key={month} className="reimbursement-history-month"><header><span>📆</span><strong>{monthLabel(month)}</strong><small>{rows.length}</small></header><div>{rows.map(row => <article key={row.id} className={`reimbursement-history-row status-${row.status || 'confirmed'}`}><span className="reimbursement-history-icon">{row.status === 'cancelled' ? '↩' : row.status === 'pending' ? '⏳' : '✓'}</span><div><strong>{displayMember(row.from_user_id, row.from_user_name)} {c.reimbursed} {displayMember(row.to_user_id, row.to_user_name)}</strong><small>{dayLabel(row.created_at)} · {settlementStatusLabel(row)}{row.notes ? ` · ${row.notes}` : ''}</small></div><b>{money(row.amount)}</b>{row.status !== 'cancelled' && canCorrectSettlement(row) && <button className="ghost tiny reimbursement-correct" disabled={busy} onClick={() => cancelReimbursement(row.id)}>{lc.correctRecord}</button>}</article>)}</div></section>)}</div> : <div className="expense-empty-state"><span>🧾</span><strong>{c.noSettlementHistory}</strong></div>}
    </section>

    <section className="panel expense-history-panel">
      <div className="panel-title-row"><div><p className="eyebrow">ACTIVITY</p><h2>{expenseScope === 'mine' ? c.myExpenses : c.history}</h2>{selectedMonth !== 'all' && <p>{c.selectedMonth}: <strong>{monthLabel(selectedMonth)}</strong> · <button className="text-button" onClick={() => setSelectedMonth('all')}>{c.clearMonth}</button></p>}</div></div>
      <div className="expense-history-scope"><button className={expenseScope === 'house' ? 'active' : ''} onClick={() => setExpenseScope('house')}>🏠 {c.houseExpenses}</button><button className={expenseScope === 'mine' ? 'active' : ''} onClick={() => setExpenseScope('mine')}>👤 {c.myExpenses}</button></div>
      {visibleExpenses.length ? <div className="expense-list">{visibleExpenses.map(x => { const myShare = shareFor(x, currentUserId); return <article className="expense-row expense-row-v82" key={x.id}><div className="expense-row-category">{categoryIcon(x.category, categories)}</div><div className="expense-row-main"><strong>{x.title}</strong><small>{dayLabel(x.expense_date)} · {x.category}{x.receipt_id ? ` · Receipt #${x.receipt_id}` : ''}</small><span>{x.paid_by_name} {c.paid}{expenseScope === 'mine' ? ` · ${c.myShare}: ${money(myShare)}` : ` · ${x.shares.map(s => `${s.user_name} ${money(s.share_amount)}`).join(' · ')}`}</span></div><div className="expense-row-amount"><b>{expenseScope === 'mine' ? money(myShare) : money(x.amount)}</b>{expenseScope === 'mine' && <small>{c.totalBill}: {money(x.amount)}</small>}<span className="expense-row-actions"><button className="expense-edit-action-v88" onClick={() => editExpense(x)}><span aria-hidden="true">✎</span><strong>{c.edit}</strong></button><button className="expense-delete-action-v88" onClick={() => remove(x.id)} aria-label={c.delete}><span aria-hidden="true">⌫</span><strong>{c.delete}</strong></button></span></div></article>; })}</div> : <div className="expense-empty-state"><span>🧾</span><strong>{c.noHistory}</strong></div>}
    </section>

    {open && <OverlayPortal><div className="modal-backdrop expense-form-backdrop" onMouseDown={e => { if (e.currentTarget === e.target) setOpen(false); }}><section className="modal focus-dialog expense-modal expense-modal-v80" role="dialog" aria-modal="true" aria-label={editingExpenseId ? c.editTitle : c.add}>
      <header className="focus-dialog-titlebar expense-form-titlebar"><div><p className="eyebrow">SHARED COST</p><h2>{editingExpenseId ? c.editTitle : c.add}</h2><p>{editingExpenseId ? 'Update the details below. Balances and insights will recalculate automatically.' : 'Start with the total, then choose who shares it.'}</p></div><button data-dialog-close="true" className="icon-btn" onClick={() => setOpen(false)}>×</button></header>
      <div className="focus-dialog-scroll expense-form-scroll">
        {receiptId && <div className="expense-linked-receipt-banner"><span>🧾</span><div><strong>{c.linkedReceipt}</strong><small>{receipts.find(r => r.id === Number(receiptId))?.store_name || 'Receipt'} · {amount ? money(Number(amount)) : ''}</small></div></div>}
        <section className="expense-form-section expense-basics-section"><div className="expense-amount-field"><label>{c.amount}<div className="money-input"><span>$</span><input autoFocus inputMode="decimal" type="number" min="0.01" step="0.01" value={amount} onChange={e => handleAmountChange(e.target.value)} placeholder="0.00" /></div></label></div><label className="expense-title-field">{c.expenseTitle}<input value={title} onChange={e => setTitle(e.target.value)} placeholder="Groceries, electricity, dinner..." /></label></section>
        <section className="expense-form-section"><div className="expense-section-heading"><div><span>1</span><div><h3>{c.category}</h3><p>Tap one — no dropdown hunting.</p></div></div></div><div className="expense-category-grid">{categories.map(item => <button type="button" key={item.name} className={`expense-category-choice ${category === item.name ? 'active' : ''}`} onClick={() => setCategory(item.name)}><span>{item.icon}</span><strong>{item.name}</strong></button>)}<button type="button" className={`expense-category-choice add-category ${categoryCreatorOpen ? 'active' : ''}`} onClick={() => setCategoryCreatorOpen(v => !v)}><span>＋</span><strong>{c.addCategory}</strong></button></div>
          {categoryCreatorOpen && <div className="expense-category-creator"><div className="category-icon-picker">{CATEGORY_ICONS.map(icon => <button type="button" key={icon} className={newCategoryIcon === icon ? 'active' : ''} onClick={() => setNewCategoryIcon(icon)}>{icon}</button>)}</div><div className="category-create-row"><input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder={c.categoryName} /><button type="button" onClick={createCategory} disabled={busy || !newCategoryName.trim()}>{c.createCategory}</button></div></div>}
        </section>
        <section className="expense-form-section"><div className="expense-section-heading"><div><span>2</span><div><h3>{c.payer}</h3><p>Who paid at the store or covered the bill?</p></div></div></div><div className="payer-card-grid">{members.map(m => <button type="button" key={m.user_id} className={`payer-card ${payer === m.user_id ? 'active' : ''}`} onClick={() => setPayer(m.user_id)}><span className="member-avatar">{initials(m.full_name || `Member ${m.user_id}`)}</span><div><strong>{m.full_name || `Member ${m.user_id}`}</strong>{m.user_id === currentUserId && <small>{c.you}</small>}</div><i>✓</i></button>)}</div></section>
        <section className="expense-form-section expense-split-section"><div className="expense-section-heading"><div><span>3</span><div><h3>{c.split}</h3><p>{splitMode === 'custom' ? c.customHelp : 'Everyone selected below shares the total equally.'}</p></div></div><div className="segmented"><button type="button" className={splitMode === 'equal' ? 'active' : ''} onClick={() => changeSplitMode('equal')}>{c.equal}</button><button type="button" className={splitMode === 'custom' ? 'active' : ''} onClick={() => changeSplitMode('custom')}>{c.custom}</button></div></div>
          {splitMode === 'custom' && <div className="custom-split-toolbar"><span>{c.remaining}: <strong>{money(Math.max(0, splitDifference))}</strong></span><button type="button" className="ghost tiny" onClick={resetCustomEqual}>{c.resetEqual}</button></div>}
          <div className="expense-member-grid">{members.map(m => { const on = participants.includes(m.user_id); const value = splitMode === 'equal' ? (equalShares[m.user_id] || 0) : Number(shares[m.user_id] || 0); return <article className={`expense-member-card ${on ? 'selected' : ''}`} key={m.user_id}><label className="expense-member-select"><input type="checkbox" checked={on} onChange={e => toggleParticipant(m.user_id, e.target.checked)} /><span className="member-avatar">{initials(m.full_name || `Member ${m.user_id}`)}</span><div><strong>{m.full_name || `Member ${m.user_id}`}</strong>{m.user_id === currentUserId && <small>{c.you}</small>}</div></label>{on && (splitMode === 'equal' ? <strong className="member-share-amount">{money(value)}</strong> : <div className="custom-share-input"><span>$</span><input type="number" min="0" step="0.01" value={shares[m.user_id] ?? '0.00'} onChange={e => changeCustomShare(m.user_id, e.target.value)} />{manualShares.has(m.user_id) && <small>{c.manual}</small>}</div>)}</article>; })}</div>
          {splitMode === 'custom' && <div className={`split-total-status ${Math.abs(splitDifference) <= .02 ? 'ok' : 'warn'}`}><span>{Math.abs(splitDifference) <= .02 ? '✓' : '!'}</span><strong>{Math.abs(splitDifference) <= .02 ? c.splitReady : c.splitMismatch}</strong><b>{money(customTotal)} / {money(Number(amount) || 0)}</b></div>}
        </section>
        <section className="expense-form-section expense-more-section"><button type="button" className="expense-more-toggle" onClick={() => setMoreDetails(v => !v)}><span>⚙️</span><strong>{c.moreDetails}</strong><i>{moreDetails ? '−' : '+'}</i></button>{moreDetails && <div className="expense-more-grid"><label>{c.date}<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label><label>{c.receipt}<select value={receiptId} onChange={e => setReceiptId(e.target.value ? Number(e.target.value) : '')}><option value="">No linked receipt</option>{receipts.map(r => <option key={r.id} value={r.id}>{r.store_name || 'Receipt'} · {r.receipt_date || r.created_at.slice(0, 10)} {r.total_amount != null ? `· ${money(r.total_amount)}` : ''}</option>)}</select></label><label className="span-2">{c.notes}<textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional note" /></label></div>}</section>
      </div>
      <footer className="focus-dialog-actions expense-form-actions"><button className="secondary" onClick={() => setOpen(false)}>{c.cancel}</button><div className="expense-save-summary"><small>{participants.length} participant{participants.length === 1 ? '' : 's'}</small><strong>{amount ? money(Number(amount)) : money(0)}</strong></div><button className="expense-save-button" disabled={busy || !participants.length || (splitMode === 'custom' && Math.abs(splitDifference) > .02)} onClick={save}>{busy ? 'Saving…' : editingExpenseId ? c.update : c.save}</button></footer>
    </section></div></OverlayPortal>}

    {reimburseTarget && <OverlayPortal><div className="modal-backdrop" onMouseDown={e => { if (e.currentTarget === e.target) setReimburseTarget(null); }}><section className="modal focus-dialog reimbursement-modal" role="dialog" aria-modal="true" aria-label={c.confirm}><header className="focus-dialog-titlebar"><div><p className="eyebrow">MARK PAYMENT SENT</p><h2>{lc.markSent}</h2></div><button data-dialog-close="true" className="icon-btn" onClick={() => setReimburseTarget(null)}>×</button></header><div className="focus-dialog-scroll"><div className="reimbursement-confirm-route"><div className="reimburse-person"><span className="member-avatar debt">{initials(reimburseTarget.from_user_name)}</span><strong>{displayMember(reimburseTarget.from_user_id, reimburseTarget.from_user_name)}</strong></div><div className="reimburse-flow large"><span></span><i>→</i></div><div className="reimburse-person"><span className="member-avatar credit">{initials(reimburseTarget.to_user_name)}</span><strong>{displayMember(reimburseTarget.to_user_id, reimburseTarget.to_user_name)}</strong></div></div><div className="reimburse-amount-card"><small>Suggested</small><strong>{money(reimburseTarget.amount)}</strong><p>{c.partial}</p><label>Amount to reimburse<div className="money-input"><span>$</span><input type="number" min="0.01" max={reimburseTarget.amount} step="0.01" value={reimburseAmount} onChange={e => setReimburseAmount(e.target.value)} /></div></label></div></div><footer className="focus-dialog-actions"><button className="secondary" onClick={() => setReimburseTarget(null)}>{c.cancel}</button><button className="reimburse-button" disabled={busy || Number(reimburseAmount) <= 0} onClick={saveReimbursement}>{busy ? 'Saving…' : lc.markSent}</button></footer></section></div></OverlayPortal>}
  </main>;
}
