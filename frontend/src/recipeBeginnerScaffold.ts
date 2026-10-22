import type { Recipe, RecipeIngredient } from './recipes';
import { localizedStepSet } from './recipeLocalizer';

// Beginner preparation and finishing guidance around GHM's own existing cooking
// methods. This does not invent appliance-specific temperatures or claim the
// steps are the exact method of a third-party source. The 11 featured linked
// dishes use the separately authored, dish-specific long-form methods instead.
const produceNames = /vegetable|tomato|potato|eggplant|spinach|okra|methi|coriander|chilli|onion|ginger|bottle gourd|banana|papdi|tindora|lime|lemon|curry leaves|peanuts|chickpeas|sprout/i;
const spiceNames = /salt|chilli|cumin|turmeric|coriander powder|mustard|cardamom|garam masala|sambar powder|spice|methi|papad khar/i;
const grainNames = /rice|dal|beans|chickpea|flour|semolina|poha|bajra|wheat|lentil|urad|besan/i;

export function completeBasicCookingGuide(recipe:Recipe, original:Record<'en'|'gu'|'hi'|'fr',string[]>) {
  // Every step is independent GHM content; we never pull source-page text.
  const main = recipe.ingredients.filter(x=>!x.optional).slice(0,6).map(x=>x.name);
  const optional = recipe.ingredients.filter(x=>x.optional).slice(0,4).map(x=>x.name);
  const hasProduce = recipe.ingredients.some(x=>produceNames.test(x.name));
  const hasGrain = recipe.ingredients.some(x=>grainNames.test(x.name));
  const hasSpice = recipe.ingredients.some(x=>spiceNames.test(x.name));
  const rawMeat = recipe.ingredients.some(x=>/chicken|poultry/i.test(x.name));
  const eggDish = recipe.ingredients.some(x=>/eggs?/i.test(x.name));
  const isDrink=recipe.kind==='drink';
  const isDessert=recipe.kind==='dessert';
  const first = main.length?main.join(', '):'the ingredients in the recipe card';
  const prep=[
    `Read the entire method before starting. Confirm you have the ingredients shown above: ${first}. Check the serving count and quantities before measuring.`,
    'Wash your hands, wipe the counter, and set out a clean chopping board, measuring spoons, mixing bowl and an appropriate pot, pan or steamer. Use separate utensils for raw foods.',
    'Measure the main ingredients into separate bowls using the units shown in the ingredient table. Do not guess a quantity just because a container looks full.',
    hasProduce?'Rinse fresh produce thoroughly under running water and drain it. Discard wilted, bruised or spoiled pieces before cooking.':'Check the freshness of dry goods and dairy products; discard ingredients with an off smell or visible spoilage.',
    hasProduce?'Trim stems, peels or tough parts as appropriate; chop vegetables to similar sizes so they cook evenly. Keep delicate herbs separate for finishing.':'Set dry and wet ingredients in separate bowls so you can combine them in the order given, without leaving the stove unattended.',
    hasGrain?'Check grains, lentils or flour for debris. Rinse or soak only when the recipe method calls for it, and drain with a sieve if needed.':'If an ingredient needs to soften or reach room temperature, prepare it now according to the method; do not leave perishable ingredients out unnecessarily.',
    hasSpice?`Set out the listed seasonings${optional.length?', including optional '+optional.join(', '):''}. Start with the recipe amount; strong spices can be adjusted after tasting.`:'Set out finishing ingredients separately. Prepare a clean spoon for tasting so the serving food remains hygienic.',
    'Place a lid, dry oven mitt and a long-handled spatula within reach. Start with moderate heat unless the method specifically calls for a hotter pan.',
  ];
  const finish=[
    rawMeat?'Before serving, check that the chicken is fully cooked to at least 74°C (165°F) in the thickest part using a food thermometer. Do not rely on colour alone.':eggDish?'Check that any eggs are properly set and cooked, rather than leaving unexpected raw portions.':'Check doneness by texture: the centre should be cooked as described in the method, with no raw batter or uncooked hard pieces.',
    isDrink?'Taste a small spoonful and adjust dilution or sweetness gradually rather than adding all the remaining liquid at once.':'Taste a small portion after lowering the heat. Adjust salt, sourness, spice or sweetness gradually and stir between additions.',
    isDessert?'Let the dessert set, cool or rest as instructed before cutting. Cutting too early can destroy the intended texture.':'Let the food rest briefly if the method calls for it; this helps the moisture and texture settle before serving.',
    'Transfer the finished food using clean utensils. Avoid touching steaming dishes or hot oil directly; use oven mitts and keep children away from hot cookware.',
    'Store leftovers in a covered, food-safe container and refrigerate promptly, generally within two hours. Reheat thoroughly before serving again.',
  ];
  return localizedStepSet([...prep,...original.en,...finish]);
}
