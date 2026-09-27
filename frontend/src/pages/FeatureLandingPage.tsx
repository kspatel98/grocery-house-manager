import { Link, useLocation } from 'react-router-dom';
import PageMeta from '../components/PageMeta';

type FeaturePage = {
  eyebrow: string;
  title: string;
  description: string;
  promise: string;
  outcomes: Array<[string, string, string]>;
  steps: Array<[string, string]>;
  scenario: string;
  scenarioSteps: string[];
  related: Array<[string, string]>;
};

const pages: Record<string, FeaturePage> = {
  '/how-it-works': {
    eyebrow: 'ONE CONNECTED HOUSEHOLD SYSTEM',
    title: 'You do not maintain six different tools. They feed each other.',
    description: 'Receipts show what came home. Kitchen scans show what appears to remain. Meals show what is being used. Shopping shows what you prefer. GHM connects those signals into the next useful household action.',
    promise: 'What you have → what needs attention → what to cook → what to buy → where to buy it → what actually happened.',
    outcomes: [
      ['🧾', 'Capture what entered the home', 'Receipt scans and completed shopping build inventory, price and spending context.'],
      ['👁️', 'Reconcile what is physically there', 'Kitchen Vision checks one real storage area at a time and keeps uncertainty visible.'],
      ['✦', 'Prepare the next decision', 'Household Forecast, meals, expiry, prices and preferences become one calm Today view.'],
    ],
    steps: [['Observe', 'Receipts, shopping and Kitchen Vision create evidence.'], ['Understand', 'GHM models stock, cadence, expiry, spending and household preferences.'], ['Prepare', 'Meals, restocks and shopping options are assembled.'], ['Review', 'You approve the decisions that matter; the complexity stays underneath.']],
    scenario: 'A normal Saturday becomes a learning loop.',
    scenarioSteps: ['Receipt scanned after shopping', 'Inventory and trusted prices update', 'Household Forecast learns purchase cadence', 'Use-before-expiry food influences meals', 'Next shopping trip is prepared', 'Receipt Guardian checks what actually happened'],
    related: [['/autopilot', 'Autopilot'], ['/kitchen-vision', 'Kitchen Vision'], ['/savings', 'Savings & value proof']],
  },
  '/trust': {
    eyebrow: 'TRUST & ACCURACY',
    title: 'GHM does not pretend to know what it does not know.',
    description: 'Household software should be useful without acting overconfident. GHM separates verified facts, estimates, predictions and items that still need review.',
    promise: 'Automation is valuable only when the household can understand why it happened and stop it when the evidence is weak.',
    outcomes: [
      ['✓', 'Verified', 'Receipt evidence, confirmed household actions and supported prices stay separate from estimates.'],
      ['◇', 'Estimated', 'Visual quantities and price opportunities are shown as estimates when the evidence is incomplete.'],
      ['✦', 'Prediction', 'Likely depletion and household forecasts are described as predictions, not guarantees.'],
      ['?', 'Needs review', 'Uncertain Kitchen Vision, receipt or safety signals wait for a person instead of silently changing the household.'],
    ],
    steps: [['Expired food', 'Never suggested for consumption; review or discard only.'], ['Kitchen Vision', 'Not visible does not mean gone, and multiple identical physical units remain multiple.'], ['Purchases', 'GHM does not complete a purchase without explicit approval.'], ['Savings', 'Verified savings stay separate from potential opportunities.']],
    scenario: 'The safest answer is sometimes “I am not sure yet.”',
    scenarioSteps: ['A yogurt tub is partly hidden', 'GHM marks the sighting medium confidence', 'Inventory stays unchanged', 'A short recheck is suggested', 'Only the approved observation can change stock'],
    related: [['/kitchen-vision', 'Kitchen Vision'], ['/receipt-scanner', 'Receipt Scanner'], ['/how-it-works', 'How GHM works']],
  },
  '/autopilot': {
    eyebrow: 'GHM AUTOPILOT',
    title: 'Do not manage groceries. Review the decisions that matter.',
    description: 'Autopilot connects inventory, expiry, meals, shopping, prices, receipts, spending and household preferences so the app can tell you what matters now.',
    promise: 'A premium household system should reduce thinking—not create another dashboard to manage.',
    outcomes: [['✦', 'One next action', 'Today starts with the most important supported household action.'], ['🛒', 'Choice-aware shopping', 'Cheapest, balanced and preferred options stay visible without forcing one answer.'], ['🧾', 'Protection after checkout', 'Receipt and savings evidence close the loop after shopping.']],
    steps: [['Today', 'See only what needs attention.'], ['Plan', 'Meals, days at home, use-before-expiry food and budget.'], ['Shop', 'Prepare the trip using supported prices and preferences.'], ['Protect', 'Review receipts, recalls and Kitchen Vision uncertainty.']],
    scenario: 'Your household chooses convenience over the absolute cheapest trip.',
    scenarioSteps: ['Walmart is $4.20 cheaper', 'Your household repeatedly chooses Costco within a small premium', 'GHM learns that preference', 'Next time Costco can be recommended while the cheaper option remains visible'],
    related: [['/household-intelligence', 'Household Forecast'], ['/grocery-price-intelligence', 'Shopping intelligence'], ['/savings', 'Savings Ledger']],
  },
  '/kitchen-vision': {
    eyebrow: 'GHM KITCHEN VISION',
    title: 'Scan real kitchens, not perfectly arranged shelves.',
    description: 'Create a Kitchen Map for your fridge, freezer, pantry, cupboards, rack or any custom storage area. Scan one area at a time with photos or a short video.',
    promise: 'GHM confirms what it can see, remembers where products normally appear and never assumes an unseen item is gone.',
    outcomes: [['▦', 'Storage zones', 'Every household can match the way groceries are actually stored.'], ['👁️', 'Physical-instance counting', 'Three identical cartons remain three cartons; one carton seen in many frames remains one.'], ['◫', 'Coverage-aware scans', 'GHM records how much of an area was actually inspected before making suggestions.'], ['?', 'Targeted rechecks', 'Only unclear products or hidden areas need a second look.']],
    steps: [['Choose an area', 'Fridge, freezer, cupboard, rack or your own name.'], ['Show it naturally', '2–4 photos or a slow 10–20 second video.'], ['Review only changes', 'Confirmed products stay out of your way.'], ['Apply', 'You approve quantity or new-product changes before inventory updates.']],
    scenario: 'A crowded fridge with three identical milk cartons.',
    scenarioSteps: ['The same carton appears in several video frames', 'GHM groups repeated views of that physical carton', 'Two other cartons are visibly separate', 'Result: 3 physical cartons visible—not 1 and not 7', 'A fourth recorded carton that was not visible remains unchanged'],
    related: [['/trust', 'Trust & accuracy'], ['/household-intelligence', 'Household Forecast'], ['/how-it-works', 'How GHM works']],
  },
  '/household-intelligence': {
    eyebrow: 'HOUSEHOLD FORECAST',
    title: 'GHM learns how your home actually consumes.',
    description: 'Purchase cadence, current inventory, receipts and recorded choices create a private household forecast for what may run out and what usually happens next.',
    promise: 'The model becomes useful from real household history; it does not invent certainty when history is thin.',
    outcomes: [['📦', 'Likely depletion', 'See which products may need attention in the next week.'], ['◷', 'Purchase cadence', 'Learn how often the household actually buys recurring staples.'], ['♥', 'Preference memory', 'Cost, convenience and familiar-store choices can shape future recommendations.']],
    steps: [['Observe', 'Normal receipts and shopping create history.'], ['Model', 'Deterministic calculations estimate cadence and remaining time.'], ['Explain', 'GHM shows why a prediction exists.'], ['Adapt', 'Your approved decisions become preference signals.']],
    scenario: 'Milk becomes predictable without daily manual counting.',
    scenarioSteps: ['4 L bought Monday', 'Kitchen scan shows it lower later in the week', 'Another purchase happens the following Monday', 'After repeated cycles GHM estimates a household cadence', 'The next trip can prepare milk before it becomes urgent'],
    related: [['/autopilot', 'Autopilot'], ['/kitchen-vision', 'Kitchen Vision'], ['/savings', 'Value proof']],
  },
  '/receipt-scanner': {
    eyebrow: 'SMART RECEIPT SCANNER',
    title: 'A receipt becomes more than a picture of what you spent.',
    description: 'Review extracted items, discounts, totals and product matches before saving. Approved receipt data can strengthen inventory, price history, expenses and household intelligence.',
    promise: 'One checkout can update several household systems without asking you to enter the same data again.',
    outcomes: [['🧾', 'Review before save', 'Nothing important is committed blindly.'], ['🏷️', 'Price memory', 'Reviewed prices become useful historical evidence.'], ['📦', 'Inventory context', 'Approved purchased quantities can update what came home.'], ['$', 'Expense handoff', 'The receipt total can prefill a household expense for review.']],
    steps: [['Upload', 'Take a clear JPG or PNG receipt photo.'], ['Review', 'Fix uncertain rows, totals or matches.'], ['Save', 'Approved lines become household evidence.'], ['Learn', 'Future shopping and price decisions improve from the history.']],
    scenario: 'A weekly grocery receipt does four jobs.',
    scenarioSteps: ['Receipt scanned', 'Products and prices reviewed', 'Inventory increases', 'Household spending is captured', 'Future “good deal” comparisons gain another real observation'],
    related: [['/savings', 'Savings & value proof'], ['/grocery-price-intelligence', 'Price intelligence'], ['/how-it-works', 'How GHM works']],
  },
  '/meal-planning': {
    eyebrow: 'MEALS FROM YOUR REAL HOUSEHOLD',
    title: 'Plan around what you already own and what should be used before expiry.',
    description: 'GHM combines inventory, servings, days at home and recipe options to prepare meals without pretending expired products are usable.',
    promise: 'Meal planning should reduce waste and grocery gaps, not create a second inventory system.',
    outcomes: [['🍲', 'Cook from home', 'Prioritize ingredients already available.'], ['⏳', 'Use before expiry', 'Food still within its expiry window can be moved earlier in the plan.'], ['🛒', 'Shortage-to-list', 'Only missing quantities need to reach shopping.']],
    steps: [['Choose days', 'Plan 3, 5 or 7 days and mark away/eating-out days.'], ['Use stock first', 'Available and use-soon ingredients get priority.'], ['See shortages', 'Missing ingredients stay transparent.'], ['Send to shopping', 'Add only what the plan actually needs.']],
    scenario: 'Spinach expires Sunday and guests arrive Saturday.',
    scenarioSteps: ['GHM moves spinach into an earlier meal', 'Saturday servings scale for guests', 'Missing ingredients are calculated', 'The active grocery list receives only the shortage'],
    related: [['/autopilot', 'Autopilot'], ['/kitchen-vision', 'Kitchen Vision'], ['/families', 'For families']],
  },
  '/grocery-price-intelligence': {
    eyebrow: 'SHOPPING INTELLIGENCE',
    title: 'Know the supported options before you spend.',
    description: 'GHM can combine saved receipt prices, supported live sources, flyers, the active list and household preferences without guessing prices that are unknown.',
    promise: 'Cheapest is one option—not the definition of the best household decision.',
    outcomes: [['$', 'Lowest cost', 'See the strongest supported low-cost option.'], ['◫', 'Balanced', 'Trade a small price difference for a simpler trip when appropriate.'], ['♥', 'Preferred', 'Keep familiar stores and brands in the decision when the household values them.']],
    steps: [['Build the list', 'Start from what the household actually needs.'], ['Check evidence', 'Supported prices and coverage stay visible.'], ['Compare', 'One-store and split-trip choices are separated.'], ['Choose', 'Your decision becomes preference-learning data if enabled.']],
    scenario: 'The cheaper store saves $2.80 but adds another stop.',
    scenarioSteps: ['GHM shows both totals', 'Travel/convenience preference is considered', 'The household chooses the one-store option', 'Future balanced recommendations learn from that choice'],
    related: [['/flyers', 'Flyers'], ['/savings', 'Savings'], ['/autopilot', 'Autopilot']],
  },
  '/shared-households': {
    eyebrow: 'SHARED HOUSEHOLD',
    title: 'One source of truth for everyone who shops together.',
    description: 'Families, couples and roommates can work from the same inventory, grocery list, receipts, expenses and household activity instead of sending screenshots back and forth.',
    promise: 'If someone updates the list, the household should see the same reality.',
    outcomes: [['↻', 'Live household refresh', 'Shared changes flow across household devices.'], ['⌂', 'Shared vs personal', 'Products can be household-wide, personal or for selected members.'], ['🔗', 'Invite by link', 'Bring people into one private household space.']],
    steps: [['Create a Home', 'Give the shared space a simple name.'], ['Invite', 'Send the household invite link.'], ['Choose scope', 'Mark staples shared and special items personal when useful.'], ['Use normally', 'Shopping, inventory and expenses stay connected.']],
    scenario: 'Three roommates share staples but not every grocery.',
    scenarioSteps: ['Toilet paper is shared', 'Protein powder is personal', 'Vegetarian products are for selected members', 'The shared grocery list still stays one coordinated trip'],
    related: [['/roommates', 'For roommates'], ['/families', 'For families'], ['/household-expenses', 'Expenses']],
  },
  '/household-expenses': {
    eyebrow: 'HOUSEHOLD MONEY',
    title: 'Shared costs without the awkward spreadsheet.',
    description: 'Track who paid, who participates, custom splits, reimbursements and personal household spending while keeping settlement suggestions understandable.',
    promise: 'GHM supports the household’s agreement; it does not decide what is fair for you.',
    outcomes: [['$', 'Flexible splits', 'Equal, custom and selected-member participation.'], ['↔', 'Reimbursements', 'See who owes and who is owed after payments.'], ['◉', 'Personal view', 'Understand your share separately from total house spending.']],
    steps: [['Record', 'Add an expense manually or from a receipt.'], ['Choose people', 'Include only the members who participated.'], ['Adjust', 'Use equal or custom amounts.'], ['Settle', 'Record reimbursements and keep history.']],
    scenario: 'One receipt contains shared groceries and personal extras.',
    scenarioSteps: ['Receipt total can prefill an expense', 'Participants are reviewed', 'Custom amounts are adjusted where needed', 'Balances update without changing the grocery inventory logic'],
    related: [['/roommates', 'For roommates'], ['/receipt-scanner', 'Receipt Scanner'], ['/shared-households', 'Shared households']],
  },
  '/flyers': {
    eyebrow: 'LOCAL FLYER INTELLIGENCE',
    title: 'Deals should come to the list—not force you to leave the app and hunt for them.',
    description: 'GHM connects supported local flyer information to products and shopping so sale context can influence decisions where coverage exists.',
    promise: 'The goal is fewer tabs, not another place to manually copy flyer prices.',
    outcomes: [['🏷️', 'List-aware deals', 'Focus on products the household is actually considering.'], ['📍', 'Location context', 'Store and local-area information stays attached where available.'], ['🧾', 'Price history', 'Receipt prices help distinguish a real household deal from a normal shelf price.']],
    steps: [['Set location', 'Use postal-code/local context when required.'], ['Load supported flyers', 'Keep source and validity information attached.'], ['Match the list', 'Surface relevant products first.'], ['Compare', 'Let shopping intelligence combine flyer and historical evidence.']],
    scenario: 'A sale matters only if the household actually needs the item.',
    scenarioSteps: ['Flyer shows detergent on sale', 'Household Forecast predicts detergent is still well stocked', 'GHM avoids treating the discount as an urgent buy', 'The deal remains visible if the user still wants to stock up'],
    related: [['/grocery-price-intelligence', 'Shopping intelligence'], ['/savings', 'Savings'], ['/autopilot', 'Autopilot']],
  },
  '/savings': {
    eyebrow: 'GHM SAVINGS LEDGER',
    title: 'If GHM says it saved money, there should be evidence.',
    description: 'Verified savings stay separate from potential opportunities so households can judge whether the subscription is earning its place.',
    promise: 'Value proof is stronger than a long premium feature list.',
    outcomes: [['✓', 'Verified savings', 'Evidence-backed receipt discounts and supported completed-trip differences.'], ['◇', 'Open opportunities', 'Potential value stays estimated until the household acts.'], ['◷', 'Work removed', 'Receipt scans, Kitchen Vision and automation can also show manual work avoided without turning it into fake dollar savings.']],
    steps: [['Observe', 'Normal shopping creates evidence.'], ['Separate', 'Verified and estimated value never mix.'], ['Review', 'See the source behind each ledger item.'], ['Compare', 'Judge household value against the subscription cost.']],
    scenario: 'A plan only “pays for itself” when the ledger supports that claim.',
    scenarioSteps: ['Verified savings accumulate', 'Plan cost is known', 'GHM compares evidence-backed value with the subscription', 'If evidence is insufficient, the app does not claim ROI'],
    related: [['/autopilot', 'Autopilot'], ['/receipt-scanner', 'Receipt Scanner'], ['/trust', 'Trust & accuracy']],
  },
  '/families': {
    eyebrow: 'FOR FAMILIES',
    title: 'Less household remembering. More coordinated shopping and meals.',
    description: 'Families can emphasize expiry, meals, bulk inventory, weekly shopping and shared visibility while GHM keeps specialist tools one level deeper.',
    promise: 'The whole family does not need to become inventory managers for the system to be useful.',
    outcomes: [['🍲', 'Family meal planning', 'Scale servings and use what is already at home.'], ['📦', 'Bulk stock awareness', 'Track pantry, fridge and household essentials.'], ['🛒', 'Shared weekly trip', 'One list stays visible to everyone who shops.']],
    steps: [['Create a Family Home', 'Onboarding prioritizes inventory and the first trip.'], ['Add or scan', 'Teach GHM a few real household products.'], ['Invite', 'Connect other people who shop.'], ['Let Today lead', 'Only the next meaningful household action needs attention.']],
    scenario: 'A family of four prepares the weekend trip.',
    scenarioSteps: ['Kitchen Vision reconciles the fridge', 'Use-before-expiry ingredients shape meals', 'Likely shortages reach shopping', 'A parent can shop while everyone sees the same list'],
    related: [['/meal-planning', 'Meal planning'], ['/shared-households', 'Shared households'], ['/kitchen-vision', 'Kitchen Vision']],
  },
  '/roommates': {
    eyebrow: 'FOR ROOMMATES',
    title: 'Share the house without pretending every grocery is shared.',
    description: 'Roommates can coordinate staples, personal items, selected-member products, expenses and reimbursements inside one household instead of mixing everything together.',
    promise: 'Shared utility becomes more useful when personal boundaries stay clear.',
    outcomes: [['⌂', 'Shared staples', 'Milk, cleaning supplies or toilet paper can belong to the household.'], ['●', 'Personal products', 'Keep snacks, dietary foods or toiletries tied to one person.'], ['$', 'Expense clarity', 'Choose who participates in each shared cost and track reimbursements.']],
    steps: [['Create Roommate Home', 'The setup emphasizes shared lists and money first.'], ['Invite roommates', 'Everyone joins the same private household.'], ['Set product scope', 'Shared, personal or selected members.'], ['Settle clearly', 'Expense and reimbursement history stays visible.']],
    scenario: 'Three roommates shop together with different diets.',
    scenarioSteps: ['Shared cleaning supplies stay household-wide', 'Vegetarian groceries can be selected-member items', 'Personal snacks stay personal', 'One grocery trip can still coordinate everything'],
    related: [['/household-expenses', 'Expenses'], ['/shared-households', 'Shared households'], ['/grocery-price-intelligence', 'Shopping intelligence']],
  },
  '/couples': {
    eyebrow: 'FOR COUPLES',
    title: 'One shared grocery routine without duplicate lists and forgotten receipts.',
    description: 'Couples can keep shopping, meals, household spending and inventory connected while still allowing personal products where needed.',
    promise: 'The system should reduce coordination messages, not create another chore.',
    outcomes: [['♥', 'Shared routine', 'One household view for shopping and meals.'], ['🍲', 'Plan together', 'Use stock and upcoming expiry before adding more groceries.'], ['$', 'See household spending', 'Track shared costs without losing personal context.']],
    steps: [['Create Couple Home', 'Start with one shared household.'], ['Add a few products', 'Or scan a real receipt.'], ['Invite partner', 'Both see the same household state.'], ['Use Today', 'Let GHM surface what matters instead of browsing every tool.']],
    scenario: 'One partner shops while the other is at home.',
    scenarioSteps: ['The home partner updates the list', 'The shopper sees the change', 'Receipt scan closes the loop afterward', 'Both see the same inventory and spending context'],
    related: [['/shared-households', 'Shared households'], ['/meal-planning', 'Meal planning'], ['/savings', 'Savings']],
  },
};

export default function FeatureLandingPage() {
  const { pathname } = useLocation();
  const page = pages[pathname] || pages['/how-it-works'];
  const loggedIn = Boolean(localStorage.getItem('token'));
  return (
    <main className="feature-landing-v96">
      <PageMeta title={`${page.title} | Grocery House Manager`} description={page.description} />
      <section className="feature-hero-v96 shell wide">
        <div><p className="eyebrow">{page.eyebrow}</p><h1>{page.title}</h1><p className="feature-lede-v96">{page.description}</p><div className="feature-hero-actions-v96"><Link className="primary center-link" to={loggedIn ? '/houses' : '/login'}>{loggedIn ? 'Open your household' : 'Start your household'}</Link><Link className="secondary center-link" to="/how-it-works">See how the system connects</Link></div></div>
        <aside><span>GHM PRINCIPLE</span><strong>{page.promise}</strong><small>Power stays underneath. Users see the decision, evidence and next action.</small></aside>
      </section>

      <section className="feature-outcomes-v96 shell wide">{page.outcomes.map(([icon,title,copy]) => <article key={title}><span>{icon}</span><h2>{title}</h2><p>{copy}</p></article>)}</section>

      <section className="feature-flow-v96 shell wide">
        <header><p className="eyebrow">HOW IT WORKS</p><h2>Simple on the surface. Deep underneath.</h2></header>
        <div>{page.steps.map(([title,copy], index) => <article key={title}><span>{String(index + 1).padStart(2,'0')}</span><div><strong>{title}</strong><p>{copy}</p></div></article>)}</div>
      </section>

      <section className="feature-scenario-v96 shell wide">
        <div><p className="eyebrow">REAL HOUSEHOLD EXAMPLE</p><h2>{page.scenario}</h2><p>GHM is designed around connected household events rather than isolated feature demos.</p></div>
        <ol>{page.scenarioSteps.map((step) => <li key={step}>{step}</li>)}</ol>
      </section>

      <section className="feature-confidence-v96 shell wide"><span className="verified">✓ <strong>Verified</strong><small>supported fact</small></span><span className="estimated">◇ <strong>Estimated</strong><small>useful approximation</small></span><span className="prediction">✦ <strong>Prediction</strong><small>history-based forecast</small></span><span className="review">? <strong>Needs review</strong><small>human confirmation</small></span></section>

      <section className="feature-related-v96 shell wide"><div><p className="eyebrow">KEEP EXPLORING</p><h2>See the connected parts.</h2></div><nav>{page.related.map(([to,label]) => <Link key={to} to={to}>{label}<span>→</span></Link>)}</nav></section>

      <section className="feature-final-cta-v96 shell wide"><div><p className="eyebrow">ONE HOUSEHOLD SYSTEM</p><h2>GHM is not where you manage groceries. It helps manage them for your household.</h2></div><Link className="primary center-link" to={loggedIn ? '/houses' : '/login'}>{loggedIn ? 'Open GHM' : 'Start free'}</Link></section>
    </main>
  );
}
