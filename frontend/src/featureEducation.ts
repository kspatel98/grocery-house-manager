export type FeatureEducationKey =
  | 'inventory'
  | 'shopping'
  | 'receipt_scan'
  | 'receipt_history'
  | 'meals'
  | 'flyers'
  | 'price_compare'
  | 'expenses'
  | 'expense_months'
  | 'reimbursements'
  | 'household';

export type FeatureEducation = {
  icon: string;
  problem: string;
  title: string;
  benefit: string;
  explanation: string;
  example?: string;
  learnTitle?: string;
};

export const featureEducation: Record<FeatureEducationKey, FeatureEducation> = {
  inventory: {
    icon: '▣',
    problem: 'I keep forgetting what we already have.',
    title: 'Know what is already at home.',
    benefit: 'Inventory gives the rest of GHM useful household context.',
    explanation: 'When GHM knows what you own, it can surface low stock, reduce duplicate shopping, improve meal suggestions and understand what a receipt actually changed.',
    example: 'Add everyday groceries first. The rest of the household intelligence becomes more useful as your inventory grows.',
  },
  shopping: {
    icon: '🛒',
    problem: 'I buy things we already have or forget what the household needs.',
    title: 'Finish one trip and update the household.',
    benefit: 'The shopping list is more than a checklist—it connects planning to inventory.',
    explanation: 'Move items into the cart while shopping. When the trip is finished, GHM can use the completed list to update what is at home instead of asking you to enter everything twice.',
    example: 'Plan → shop → finish the trip → inventory reflects what came home.',
  },
  receipt_scan: {
    icon: '🧾',
    problem: 'Entering groceries, prices and expenses manually takes too long.',
    title: 'One receipt can update several parts of GHM.',
    benefit: 'Scan once, then review before anything is saved.',
    explanation: 'A receipt can update inventory, remember what you paid for future price comparisons, verify a shopping trip and optionally prepare a household expense.',
    example: 'A Walmart receipt can become inventory + price history + an expense draft after one review.',
  },
  receipt_history: {
    icon: '🗂️',
    problem: 'I want evidence of what we bought and what GHM changed.',
    title: 'Receipts are household evidence, not disposable uploads.',
    benefit: 'Keep the image, extracted items, totals and saved prices together.',
    explanation: 'Receipt history lets you review what was saved later. Deleting a receipt also removes its saved-price evidence and adjusts inventory quantities that receipt originally added.',
    example: 'If a scan was wrong, you can trace the source instead of guessing which inventory or price record changed.',
  },
  meals: {
    icon: '🍲',
    problem: 'We waste groceries or do not know what to cook.',
    title: 'Cook from what you own before buying more.',
    benefit: 'GHM compares recipes with inventory and focuses on what is missing.',
    explanation: 'Meal ideas use household inventory to show dishes you can already make or almost make. You can adjust servings and add only shortages instead of copying an entire recipe into the shopping list.',
    example: 'If a recipe needs 3 kg of flour and you already have 1 kg, GHM should suggest buying only the missing 2 kg.',
  },
  flyers: {
    icon: '🏷️',
    problem: 'I do not want to browse every grocery flyer.',
    title: 'See deals for things you actually need.',
    benefit: 'Flyer intelligence is most useful when it connects to your household and shopping list.',
    explanation: 'GHM can prioritize nearby flyer offers that match products you are already planning to buy, instead of turning the app into a wall of generic promotions.',
    example: 'If milk is on your list, a nearby milk sale matters more than an unrelated flyer item.',
  },
  price_compare: {
    icon: '⇄',
    problem: 'The cheapest item does not always make the cheapest grocery trip.',
    title: 'Compare the whole trip, not just one product.',
    benefit: 'GHM can combine live options with prices your household has actually paid.',
    explanation: 'Whole-list intelligence compares coverage and estimated totals across stores. Saved receipt prices can still help when a live source is unavailable.',
    example: 'One store may be simpler, while a two-store trip may save more. GHM shows both so you can choose.',
  },
  expenses: {
    icon: '💸',
    problem: 'We do not know who owes whom after shared household spending.',
    title: 'Track the bill once and let balances stay understandable.',
    benefit: 'Expenses connect who paid, who shared the cost and what was reimbursed.',
    explanation: 'Equal or custom splits build a household ledger. Your personal view stays separate from the house total, while suggested reimbursements show the simplest way to settle balances.',
    example: 'If one person paid for groceries and another covered a movie, GHM calculates the net result instead of treating each payment independently.',
  },
  expense_months: {
    icon: '📘',
    problem: 'Our household is not always finished with a month when the calendar changes.',
    title: 'Your expense month changes when your household is ready.',
    benefit: 'Keep posting to an open month until you intentionally switch.',
    explanation: 'September can remain the active expense book even after October begins. When a month is finished, the house owner can lock it so members cannot accidentally add, edit or delete old expenses.',
    example: 'Finish entering late September bills, switch to October a few days later, then lock September when everyone is done.',
  },
  reimbursements: {
    icon: '🤝',
    problem: 'Settling shared expenses becomes confusing after several payments.',
    title: 'Know who should pay whom without redoing the math.',
    benefit: 'GHM uses the full ledger and reimbursement history to keep balances consistent.',
    explanation: 'Suggested reimbursements account for what each person paid, their assigned shares and previous reimbursements. Corrections remain traceable instead of silently changing history.',
    example: 'A person can both owe on one expense and be owed on another; GHM nets the ledger before suggesting a settlement.',
  },
  household: {
    icon: '🏠',
    problem: 'Everyone needs the same household picture, but not everyone should control everything.',
    title: 'Share the household without losing structure.',
    benefit: 'Members collaborate on groceries, receipts and expenses while ownership rules protect the house.',
    explanation: 'The owner controls membership and destructive actions. Members can participate in the shared workflows appropriate to the house without turning every person into an administrator.',
    example: 'Invite someone once and they work from the same household data instead of maintaining a separate list.',
  },
};
