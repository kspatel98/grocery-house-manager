/**
 * SEO-first static HTML for public SPA routes.
 * This is an HTML snapshot (head + meaningful semantic content) for the initial
 * response; React takes over #root when loaded. Private routes are not built.
 * v143 deliberately avoids claiming React hydration / SSR.
 */
import fs from 'node:fs';
import path from 'node:path';
const domain='https://grocery-house-manager.com';
const dist=path.resolve('dist');
const base=fs.readFileSync(path.join(dist,'index.html'),'utf8');
const pages={
  '/': ['Grocery House Manager | Shared Grocery Lists, Pantry and Household Spending','Manage shared grocery lists, track household inventory, plan meals and review grocery spending in one connected household app.','A connected home for groceries, meals and spending','Plan what to buy, understand what you have and share household activity with your family or roommates.'],
  '/how-it-works': ['How Grocery House Manager Works','See how GHM connects shared shopping lists, inventory, receipt reviews, meal planning and household spending.','How GHM works','One place for the steps between planning a grocery trip, buying items and knowing what is now at home.'],
  '/handwritten-grocery-list-scanner': ['Handwritten Grocery List Scanner | GHM','Photograph a handwritten or printed grocery list, review recognized items and add them to a shared shopping list.','Scan handwritten grocery lists','Review detected groceries and quantities before saving them to a shared household shopping list.'],
  '/grocery-products-photo-scan': ['Scan Multiple Grocery Products from One Photo | GHM','Use one grocery photo to identify multiple products, review them and add the confirmed items to a shopping list or inventory.','Identify groceries from a photo','Scan several visible products at once, correct uncertain recognition and choose where approved items should go.'],
  '/autopilot': ['Household Grocery Planner and Autopilot | GHM','Organize your next grocery trip with inventory-aware planning, shortages, saved pricing evidence and household preferences.','Plan the next grocery trip','Explore automated suggestions that can help your household plan meals and grocery needs.'],
  '/kitchen-vision': ['Kitchen Vision Inventory Scanning | GHM','See how Kitchen Vision helps review products detected in kitchen photos before updating shared household inventory.','Kitchen Vision','Review photos of your kitchen and confirm stock updates rather than accepting uncertain image guesses.'],
  '/receipt-scanner': ['Grocery Receipt Scanner and Spending Tracker | GHM','Review grocery receipts, capture purchased products and connect approved transactions to inventory and household expenses.','Grocery receipt scanning','Save receipt history and review product, price and quantity recognition before using it.'],
  '/meal-planning': ['Meal Planning from Pantry Ingredients | GHM','Find meal ideas using ingredients you already have, adjust servings and send missing ingredients to a shopping list.','Cook with what you already own','Browse recipes and plan dinners around ingredients currently available at home.'],
  '/household-expenses': ['Track and Split Household Grocery Expenses | GHM','Track household expenses, record who paid, allocate shared bills and keep reimbursements clear for families and roommates.','Household expense splitting','Know who paid and who owes without keeping multiple spreadsheets.'],
  '/shared-households': ['Shared Grocery List and Inventory for Families | GHM','Manage a shared household with member invites, combined inventory, collaborative shopping and household expenses.','Share one household view','Keep grocery lists, inventory and spending consistent for the people living together.'],
  '/grocery-price-intelligence': ['Grocery Price Comparison and Shopping Intelligence | GHM','Compare supported grocery prices, saved receipts and relevant store deals with source and coverage transparency.','Grocery price intelligence','Compare supported price evidence and choose how to shop without relying on invented prices.'],
  '/flyers': ['Weekly Grocery Flyer Intelligence | GHM','Discover supported local flyer deals and see relevant offers alongside grocery list and saved price information.','Grocery flyer discovery','Find supported flyer items connected to products your household wants to buy.'],
  '/savings': ['Grocery Spending and Savings Insights | GHM','Distinguish verified grocery savings from potential opportunities using tracked receipts and supported shopping evidence.','Understand real grocery savings','Separate proven savings from estimates and review the evidence.'],
  '/household-intelligence': ['Smart Household Inventory and Grocery Insights | GHM','Connect inventory history, grocery shopping and household activity to make better-informed planning decisions.','Household insights','Organize household decisions using your own inventory and shopping history.'],
  '/families': ['Shared Grocery and Meal Planning for Families | GHM','Organize family shopping, pantry supplies and meal planning in one shared household workspace.','Manage family groceries together','Share a grocery list and coordinate household essentials across family members.'],
  '/roommates': ['Grocery Lists and Expense Splitting for Roommates | GHM','Coordinate shared grocery lists and track roommate household expenses without mixing personal and shared purchases.','Organize roommate groceries','Keep shared staples, personal purchases and reimbursements understandable.'],
  '/couples': ['Shared Grocery List App for Couples | GHM','Create a shared grocery list, track pantry products and plan meals together as a household of two.','Share shopping and meals as a couple','Plan groceries, inventory and household spending in one place.'],
  '/trust': ['How GHM Handles AI Recognition and Data Accuracy','Learn about reviewing recognized items, uncertain prices and household information before taking action in GHM.','Accuracy and trust in GHM','See how confirmations, source transparency and manual corrections fit into household workflows.'],
  '/pricing': ['GHM Plans and Pricing | Grocery House Manager','Compare free and paid Grocery House Manager plans for shared lists, inventory, receipt scans and household intelligence.','Choose your GHM plan','See available features and usage allowances before selecting a subscription.'],
  '/about': ['About Grocery House Manager | SupremDas Group','Learn why Grocery House Manager brings groceries, shared household lists, meals and household spending together.','About Grocery House Manager','A connected household productivity app developed by SupremDas Group.'],
  '/support': ['GHM Help and Support | Grocery House Manager','Get help with GHM shopping lists, household accounts, receipts, billing and app features.','Get support for GHM','Find assistance with using your shared household workspace.'],
};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setMeta(html,selector,value){const re=new RegExp(`<meta ([^>]*${selector}[^>]*?)content="[^"]*"([^>]*?)>`,`i`);return html.replace(re,(_all,left,right)=>`<meta ${left}content="${esc(value)}"${right}>`)}
for(const [route,[title,description,heading,summary]] of Object.entries(pages)){
  const target=route==='/'?path.join(dist,'index.html'):path.join(dist,route.slice(1),'index.html');
  const canonical=domain+route;
  let html=base.replace(/<title>[\s\S]*?<\/title>/i,`<title>${esc(title)}</title>`).replace(/<link rel="canonical" href="[^"]*"\s*\/>/,`<link rel="canonical" href="${esc(canonical)}" />`);
  html=setMeta(html,'name="description"',description);
  html=setMeta(html,'property="og:title"',title);
  html=setMeta(html,'property="og:description"',description);
  html=setMeta(html,'property="og:url"',canonical);
  html=setMeta(html,'name="twitter:title"',title);
  html=setMeta(html,'name="twitter:description"',description);
  // Give a genuine, accessible first-response body to crawlers and to users while JS loads.
  const fallback=`<div id="root"><main role="main" style="font-family:system-ui,sans-serif;max-width:950px;margin:5vw auto;padding:1rem;line-height:1.7;color:#163b2c"><a href="/" style="color:#28684a">Grocery House Manager</a><h1>${esc(heading)}</h1><p>${esc(summary)}</p><p>Explore <a href="/guides">GHM Guides</a>, <a href="/pricing">plans</a>, or <a href="/how-it-works">how GHM works</a>.</p></main></div>`;
  html=html.replace('<div id="root"></div>',fallback);
  // Other public routes must not receive homepage SoftwareApplication data as their primary schema.
  if(route!=='/')html=html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/,'');
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,html,'utf8');
}
console.log(`GHM v143: generated ${Object.keys(pages).length} public HTML entrypoints.`);
