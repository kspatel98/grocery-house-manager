import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useHouseLiveRefresh } from '../hooks';
import type { Product, ShoppingList } from '../types';
import { ingredientNames, recipes, type Diet, type MealKind, type Cuisine, type Recipe, type RecipeIngredient } from '../recipes';
import { useLanguage } from '../i18n';
import HouseContextSwitcher from '../components/HouseContextSwitcher';
import OverlayPortal from '../components/OverlayPortal';
import { FeaturePurposeCard, FeatureWhyButton } from '../components/FeaturePurpose';
import { sourceRecipeCategories } from '../sourceRecipeCategories';

type Row=RecipeIngredient & {required:number; owned:number; shortage:number; matched?:Product; selected:boolean; autoShop:boolean};
type CookReviewItem={productId:number;name:string;unit:string;available:number;amount:number;selected:boolean;recipeAmount:number;recipeUnit:string;optional:boolean};
// External recipe measurements vary widely; never guess package count or silently multiply unknown units.
function parseExternalMeasure(input:string):{quantity:number;unit:string;precise:boolean}{
 const text=(input||'').trim().toLowerCase().replace(/,/g,'.');
 const unicode:Record<string,number>={'½':.5,'¼':.25,'¾':.75,'⅓':1/3,'⅔':2/3,'⅛':.125};
 const unicodeMatch=text.match(/([0-9]+)?\s*([½¼¾⅓⅔⅛])/);
 const fraction=text.match(/^(\d+)\s+(\d+)\/(\d+)/) || text.match(/^(\d+)\/(\d+)/);
 let number:number|undefined;
 let remainder=text;
 if(unicodeMatch){number=Number(unicodeMatch[1]||0)+unicode[unicodeMatch[2]];remainder=text.replace(unicodeMatch[0],'').trim();}
 else if(fraction){number=fraction.length===4?Number(fraction[1])+Number(fraction[2])/Number(fraction[3]):Number(fraction[1])/Number(fraction[2]);remainder=text.slice(fraction[0].length).trim();}
 else {const match=text.match(/^(\d+(?:\.\d+)?)(?:\s+|$)/);if(match){number=Number(match[1]);remainder=text.slice(match[0].length).trim();}}
 const match=remainder.match(/^(kg|kilograms?|g|grams?|ml|millilit(?:er|re)s?|l|lit(?:er|re)s?|pcs?|pieces?|whole|cloves?|cans?|cups?|tbsp|tablespoons?|tsp|teaspoons?)\b/);
 const units:Record<string,string>={kilogram:'kg',kilograms:'kg',gram:'g',grams:'g',milliliter:'ml',milliliters:'ml',millilitre:'ml',millilitres:'ml',liter:'l',liters:'l',litre:'l',litres:'l',pc:'pcs',piece:'pcs',pieces:'pcs',whole:'pcs',clove:'pcs',cloves:'pcs',can:'pcs',cans:'pcs'};
 const raw=match?.[1]||'';
 const unit=units[raw]||raw;
 // Freeform units like cups / spoons cannot be safely converted into product package quantities.
 const precise=Boolean(number && number>0 && ['kg','g','ml','l','pcs'].includes(unit) && !remainder.slice(raw.length).trim());
 return {quantity:precise?number!:0,unit:precise?unit:'pcs',precise};
}
type ExternalMeal={
 id:string; name:string; alternate_name?:string|null; image?:string|null; category?:string|null; area?:string|null; country?:string|null; tags?:string[];
 ingredients:{name:string;measure:string}[]; instructions:string[]; source_url?:string|null; youtube_url?:string|null; date_modified?:string|null; provider:string;
};
const copy={
 en:{title:'Meals & Recipes',sub:'Choose a dish, compare every required quantity with your house inventory, and send exactly what you need to the grocery list.',search:'Search dishes',proper:'Proper meal',light:'Light munching',breakfast:'Breakfast',dessert:'Dessert',drink:'Drinks',all:'All',servings:'Servings',ingredients:'Ingredients',inventory:'Inventory',required:'Required',shortage:'Need',enough:'Enough',addShort:'Add only missing quantities',addAll:'Add all recipe quantities',manual:'Add checked ingredients',custom:'Add your own dish',dish:'Dish name',addIngredient:'Add ingredient',saveCard:'Create dish card',canMake:'Can make now',almost:'Almost ready',missing:'Missing',browse:'Cook from what you own',noMatch:'No dishes match these filters.',added:'Added to grocery list',diet:'Diet',full:'Full recipe',short:'Shortage',remove:'Remove',manualOnly:'Manual only',optional:'Optional',method:'Detailed recipe',methodIntro:'Follow the steps in order. Ingredient quantities above automatically reflect your selected serving count.',shortHelp:'Recommended: adds only the quantity your inventory is short of, including pantry seasonings such as salt, cumin and turmeric. Household water is skipped.',manualHelp:'Adds only the rows you check. You can edit the quantity first. This is also how you intentionally add water.',fullHelp:'Adds every grocery ingredient in the complete recipe quantity, including pantry seasonings. Household water is skipped.',waterHelp:'Household water is not auto-added to groceries. Check it manually if you actually need to buy water.',noAutoItems:'Nothing needs to be added automatically.',selectOne:'Select at least one ingredient first.',cuisine:'Cuisine',mealType:'Meal type',recipesWord:'recipes',openRecipe:'Open recipe',recipeAtGlance:'Recipe at a glance',ingredientPlan:'Ingredients & quantities',ingredientPlanIntro:'Exact recipe amounts scale with servings. GHM also compares them with what your household already has.',ingredientsCount:'Ingredients',stepsCount:'Steps',servesLabel:'Serves',readyLabel:'Inventory ready',pantryNote:'Optional pantry seasonings are shown for a complete cooking method. They do not lower meal readiness, but they are still groceries and are included when you add missing or full recipe ingredients. Household water remains manual only.',stepByStep:'STEP BY STEP',stepLabel:'Step',expandRecipes:'Show Cook from Home recipes',collapseRecipes:'Hide Cook from Home recipes',confirmAddTitle:'Add ingredients to shopping list?',confirmAddCopy:'Review this action before GHM changes your shopping list.',confirmAddButton:'Confirm & add',cancel:'Cancel',destination:'Destination',shoppingIngredients:'ingredients'},
 gu:{title:'ભોજન અને રેસીપી',sub:'વાનગી પસંદ કરો, જરૂરી દરેક માત્રાની ઘરની ઇન્વેન્ટરી સાથે સરખામણી કરો અને ખરીદી યાદીમાં ખરેખર જેટલું જોઈએ એટલું જ ઉમેરો.',search:'વાનગી શોધો',proper:'પૂરું ભોજન',light:'હળવો નાસ્તો',breakfast:'નાસ્તો',dessert:'મીઠાઈ',drink:'પીણાં',all:'બધું',servings:'વ્યક્તિઓ',ingredients:'સામગ્રી',inventory:'ઇન્વેન્ટરી',required:'જરૂરી',shortage:'જોઈએ',enough:'પૂરતું છે',addShort:'ફક્ત ઓછી માત્રા ઉમેરો',addAll:'રેસીપીની સંપૂર્ણ માત્રા ઉમેરો',manual:'પસંદ કરેલી સામગ્રી ઉમેરો',custom:'તમારી વાનગી ઉમેરો',dish:'વાનગીનું નામ',addIngredient:'સામગ્રી ઉમેરો',saveCard:'વાનગી કાર્ડ બનાવો',canMake:'હમણાં બનાવી શકો',almost:'લગભગ તૈયાર',missing:'ઓછું છે',browse:'ઘરમાંથી શું બનાવી શકો',noMatch:'આ ફિલ્ટરમાં કોઈ વાનગી મળી નથી.',added:'ખરીદી યાદીમાં ઉમેરાયું',diet:'પ્રકાર',full:'સંપૂર્ણ માત્રા',short:'ઓછી માત્રા',remove:'કાઢો',manualOnly:'ફક્ત હાથેથી',optional:'વૈકલ્પિક',method:'વિગતવાર રેસીપી',methodIntro:'પગલાં ક્રમમાં અનુસરો. ઉપરની સામગ્રીની માત્રા પસંદ કરેલા વ્યક્તિઓ પ્રમાણે આપમેળે બદલાય છે.',shortHelp:'ભલામણ: ઇન્વેન્ટરીમાં જેટલી ઓછી છે એટલી જ માત્રા ઉમેરે છે, જેમાં મીઠું, જીરું અને હળદર જેવા પેન્ટ્રી મસાલા પણ સામેલ છે. ઘરનું પાણી છોડવામાં આવે છે.',manualHelp:'ફક્ત તમે ટિક કરેલી સામગ્રી ઉમેરે છે. પહેલા માત્રા બદલી શકો છો. પાણી ઉમેરવું હોય તો આ વિકલ્પ વાપરો.',fullHelp:'પેન્ટ્રી મસાલા સહિત રેસીપીની દરેક ખરીદીની સામગ્રીની સંપૂર્ણ માત્રા ઉમેરે છે. ઘરનું પાણી છોડવામાં આવે છે.',waterHelp:'ઘરનું પાણી ખરીદી યાદીમાં આપમેળે ઉમેરાતું નથી. ખરેખર પાણી ખરીદવું હોય તો તેને હાથેથી પસંદ કરો.',noAutoItems:'આપમેળે ઉમેરવા માટે કશું બાકી નથી.',selectOne:'પહેલા ઓછામાં ઓછી એક સામગ્રી પસંદ કરો.',cuisine:'પ્રદેશ / રસોઈ',mealType:'ભોજન પ્રકાર',recipesWord:'રેસીપી',openRecipe:'રેસીપી ખોલો',recipeAtGlance:'રેસીપી એક નજરમાં',ingredientPlan:'સામગ્રી અને માત્રા',ingredientPlanIntro:'ચોક્કસ માત્રા પસંદ કરેલા વ્યક્તિઓ પ્રમાણે બદલાય છે. GHM તેને ઘરમાં ઉપલબ્ધ સામગ્રી સાથે પણ સરખાવે છે.',ingredientsCount:'સામગ્રી',stepsCount:'પગલાં',servesLabel:'વ્યક્તિઓ',readyLabel:'ઇન્વેન્ટરી તૈયાર',pantryNote:'પૂર્ણ રસોઈ પદ્ધતિ માટે વૈકલ્પિક મસાલા બતાવવામાં આવે છે. તે ભોજનની તૈયારી ટકાવારી ઘટાડતા નથી, પરંતુ તે ખરીદીની વસ્તુઓ છે અને ઓછી અથવા સંપૂર્ણ રેસીપીની સામગ્રી ઉમેરતી વખતે સામેલ થાય છે. ઘરનું પાણી હજી પણ ફક્ત હાથેથી ઉમેરાય છે.',stepByStep:'પગલું દર પગલું',stepLabel:'પગલું',expandRecipes:'Cook from Home રેસીપી બતાવો',collapseRecipes:'Cook from Home રેસીપી છુપાવો',confirmAddTitle:'ખરીદી યાદીમાં સામગ્રી ઉમેરવી?',confirmAddCopy:'GHM તમારી ખરીદી યાદી બદલે તે પહેલાં આ ક્રિયા તપાસો.',confirmAddButton:'પુષ્ટિ કરો અને ઉમેરો',cancel:'રદ કરો',destination:'ક્યાં ઉમેરાશે',shoppingIngredients:'સામગ્રી'},
 hi:{title:'भोजन और रेसिपी',sub:'व्यंजन चुनें, हर आवश्यक मात्रा की घर की इन्वेंटरी से तुलना करें और खरीदारी सूची में केवल उतनी मात्रा जोड़ें जितनी वास्तव में चाहिए।',search:'व्यंजन खोजें',proper:'पूरा भोजन',light:'हल्का नाश्ता',breakfast:'नाश्ता',dessert:'मिठाई',drink:'पेय',all:'सभी',servings:'लोग',ingredients:'सामग्री',inventory:'इन्वेंटरी',required:'आवश्यक',shortage:'चाहिए',enough:'पर्याप्त',addShort:'केवल कमी की मात्रा जोड़ें',addAll:'पूरी रेसिपी की मात्रा जोड़ें',manual:'चुनी हुई सामग्री जोड़ें',custom:'अपना व्यंजन जोड़ें',dish:'व्यंजन का नाम',addIngredient:'सामग्री जोड़ें',saveCard:'डिश कार्ड बनाएं',canMake:'अभी बना सकते हैं',almost:'लगभग तैयार',missing:'कमी',browse:'घर की सामग्री से बनाएं',noMatch:'कोई व्यंजन नहीं मिला।',added:'खरीदारी सूची में जोड़ा गया',diet:'प्रकार',full:'पूरी मात्रा',short:'कमी',remove:'हटाएं',manualOnly:'केवल मैन्युअल',optional:'वैकल्पिक',method:'विस्तृत रेसिपी',methodIntro:'हर चरण क्रम से करें। ऊपर की मात्रा चुने गए सर्विंग्स के अनुसार अपने आप बदलती है।',shortHelp:'सुझावित: इन्वेंटरी में जितनी कमी है उतनी मात्रा जोड़ता है, जिसमें नमक, जीरा और हल्दी जैसे पैंट्री मसाले भी शामिल हैं। घरेलू पानी छोड़ दिया जाता है।',manualHelp:'केवल टिक की गई सामग्री जोड़ता है। पहले मात्रा बदल सकते हैं। पानी जानबूझकर जोड़ने के लिए भी यही विकल्प है।',fullHelp:'पैंट्री मसालों सहित रेसिपी की हर किराने की सामग्री की पूरी मात्रा जोड़ता है। घरेलू पानी छोड़ दिया जाता है।',waterHelp:'घर का पानी खरीदारी सूची में अपने आप नहीं जोड़ा जाता। यदि बोतलबंद/खरीदने वाला पानी चाहिए तो उसे मैन्युअली चुनें।',noAutoItems:'अपने आप जोड़ने के लिए कुछ बाकी नहीं है।',selectOne:'पहले कम से कम एक सामग्री चुनें।',cuisine:'क्षेत्र / व्यंजन',mealType:'भोजन प्रकार',recipesWord:'रेसिपी',openRecipe:'रेसिपी खोलें',recipeAtGlance:'रेसिपी एक नज़र में',ingredientPlan:'सामग्री और मात्रा',ingredientPlanIntro:'सटीक मात्रा चुनी गई सर्विंग्स के अनुसार बदलती है। GHM इसे घर की उपलब्ध सामग्री से भी तुलना करता है।',ingredientsCount:'सामग्री',stepsCount:'चरण',servesLabel:'सर्विंग्स',readyLabel:'इन्वेंटरी तैयार',pantryNote:'पूरी विधि के लिए वैकल्पिक मसाले दिखाए जाते हैं। वे तैयारी प्रतिशत कम नहीं करते, लेकिन वे किराने की वस्तुएँ हैं और कमी या पूरी रेसिपी जोड़ते समय शामिल किए जाते हैं। घरेलू पानी केवल मैन्युअल रहता है।',stepByStep:'चरण-दर-चरण',stepLabel:'चरण',expandRecipes:'Cook from Home रेसिपी दिखाएँ',collapseRecipes:'Cook from Home रेसिपी छिपाएँ',confirmAddTitle:'सामग्री खरीदारी सूची में जोड़ें?',confirmAddCopy:'GHM आपकी खरीदारी सूची बदलने से पहले इस कार्रवाई की पुष्टि करें।',confirmAddButton:'पुष्टि करें और जोड़ें',cancel:'रद्द करें',destination:'गंतव्य',shoppingIngredients:'सामग्री'},
 fr:{title:'Repas et recettes',sub:'Choisissez un plat, comparez chaque quantité requise avec le stock de la maison et ajoutez uniquement ce qu’il faut réellement acheter.',search:'Rechercher un plat',proper:'Repas complet',light:'Collation légère',breakfast:'Petit-déjeuner',dessert:'Dessert',drink:'Boissons',all:'Tous',servings:'Portions',ingredients:'Ingrédients',inventory:'Inventaire',required:'Requis',shortage:'Manque',enough:'Suffisant',addShort:'Ajouter seulement les quantités manquantes',addAll:'Ajouter les quantités complètes de la recette',manual:'Ajouter les ingrédients cochés',custom:'Ajouter votre plat',dish:'Nom du plat',addIngredient:'Ajouter un ingrédient',saveCard:'Créer la fiche',canMake:'Prêt à cuisiner',almost:'Presque prêt',missing:'Manque',browse:'Cuisiner avec votre stock',noMatch:'Aucun plat ne correspond.',added:'Ajouté à la liste de courses',diet:'Régime',full:'Recette complète',short:'Manque',remove:'Retirer',manualOnly:'Manuel seulement',optional:'Facultatif',method:'Recette détaillée',methodIntro:'Suivez les étapes dans l’ordre. Les quantités ci-dessus s’ajustent automatiquement au nombre de portions choisi.',shortHelp:'Recommandé : ajoute uniquement la quantité manquante, y compris les assaisonnements comme le sel, le cumin et le curcuma. L’eau domestique est ignorée.',manualHelp:'Ajoute uniquement les lignes cochées. Vous pouvez modifier la quantité avant l’ajout. Utilisez aussi ce mode pour ajouter volontairement de l’eau.',fullHelp:'Ajoute la quantité complète de chaque ingrédient d’épicerie, y compris les assaisonnements. L’eau domestique est ignorée.',waterHelp:'L’eau domestique n’est jamais ajoutée automatiquement. Cochez-la manuellement seulement si vous devez réellement en acheter.',noAutoItems:'Rien ne doit être ajouté automatiquement.',selectOne:'Sélectionnez d’abord au moins un ingrédient.',cuisine:'Cuisine',mealType:'Type de repas',recipesWord:'recettes',openRecipe:'Ouvrir la recette',recipeAtGlance:'Recette en un coup d’œil',ingredientPlan:'Ingrédients et quantités',ingredientPlanIntro:'Les quantités exactes s’ajustent aux portions choisies. GHM les compare aussi avec le stock de votre foyer.',ingredientsCount:'Ingrédients',stepsCount:'Étapes',servesLabel:'Portions',readyLabel:'Stock prêt',pantryNote:'Les assaisonnements facultatifs sont affichés pour une méthode complète. Ils ne réduisent pas le niveau de préparation, mais ce sont bien des produits d’épicerie et ils sont inclus lorsque vous ajoutez les ingrédients manquants ou la recette complète. L’eau domestique reste manuelle.',stepByStep:'ÉTAPE PAR ÉTAPE',stepLabel:'Étape',expandRecipes:'Afficher les recettes Cook from Home',collapseRecipes:'Masquer les recettes Cook from Home',confirmAddTitle:'Ajouter les ingrédients à la liste de courses ?',confirmAddCopy:'Vérifiez cette action avant que GHM ne modifie votre liste de courses.',confirmAddButton:'Confirmer et ajouter',cancel:'Annuler',destination:'Destination',shoppingIngredients:'ingrédients'}
};
const unitFactor=(u:string)=>(({kg:1000,g:1,l:1000,ml:1,pcs:1} as Record<string,number>)[u.toLowerCase()]||1);
function compatible(a:string,b:string){const A=a.toLowerCase(),B=b.toLowerCase(); return (['kg','g'].includes(A)&&['kg','g'].includes(B))||(['l','ml'].includes(A)&&['l','ml'].includes(B))||A===B;}
function normalizeQty(q:number,from:string,to:string){return compatible(from,to)?q*unitFactor(from)/unitFactor(to):0;}
function fmt(n:number){return Number.isInteger(n)?String(n):String(Math.round(n*100)/100);}
function norm(v:string){return (v||'').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu,' ').trim();}
const aliases:Record<string,string[]>={
 'all purpose flour':['all purpose flour','plain flour','maida','मैदा','મેંદો'],
 'whole wheat flour':['whole wheat flour','wholemeal flour','wheat flour','atta','गेहूं का आटा','गेहूँ का आटा','ઘઉંનો લોટ'],
 'bajra flour':['bajra flour','pearl millet flour','bajri flour','બાજરીનો લોટ','बाजरे का आटा'],
 'rice flour':['rice flour','ચોખાનો લોટ','चावल का आटा'],
 'besan':['besan','gram flour','chickpea flour','ચણાનો લોટ','बेसन'],
 'yogurt':['yogurt','yoghurt','curd','dahi','દહીં','दही'],
 'hung yogurt':['hung yogurt','hung curd','chakka','ચક્કો','हंग कर्ड'],
 'potato':['potato','potatoes','bateta','બટાકા','आलू'],
 'baby potato':['baby potato','baby potatoes','નાના બટાકા','बेबी आलू'],
 'tomato':['tomato','tomatoes','tameta','ટમેટા','टमाटर'],
 'eggplant':['eggplant','aubergine','brinjal','ringan','રીંગણ','बैंगन'],
 'oil':['oil','cooking oil','vegetable oil','તેલ','तेल'],
 'ghee':['ghee','clarified butter','ઘી','घी'],
 'water':['water','tap water','પાણી','पानी','eau'],
 'warm water':['warm water','lukewarm water','ગરમ પાણી','गुनगुना पानी','eau tiède'],
 'tuvar dal':['tuvar dal','toor dal','arhar dal','તુવેર દાળ','तुअर दाल','अरहर दाल'],
 'moong dal':['moong dal','mung dal','મગની દાળ','मूंग दाल'],
 'chana dal':['chana dal','split chickpeas','ચણાની દાળ','चना दाल'],
 'jaggery':['jaggery','gur','ગોળ','गुड़'],
 'sugar':['sugar','ખાંડ','चीनी','sucre'],
 'milk':['milk','દૂધ','दूध','lait'],
 'whole milk':['whole milk','full fat milk','homogenized milk','ફુલ ફેટ દૂધ','फुल क्रीम दूध','lait entier'],
 'sev':['sev','સેવ','सेव'],
 'chickpeas':['chickpeas','chickpea','garbanzo beans','chole','kabuli chana','કાબુલી ચણા','काबुली चना'],
 'kidney beans':['kidney beans','kidney bean','rajma','રાજમા','राजमा'],
 'whole urad dal':['whole urad dal','black gram','whole black gram','sabut urad','સાબૂત અડદ','साबुत उड़द'],
 'urad dal':['urad dal','split urad','udad dal','અડદ દાળ','उड़द दाल'],
 'paneer':['paneer','પનીર','पनीर'],
 'semolina':['semolina','sooji','suji','rava','રવો','सूजी'],
 'peanuts':['peanuts','groundnuts','મગફળી','मूंगफली'],
 'pav':['pav','pav buns','પાવ','पाव'],
 'sprouted moth beans':['sprouted moth beans','matki sprouts','moth sprouts','અંકુરિત મઠ','अंकुरित मटकी'],
 'mixed dal':['mixed dal','mixed lentils','મિશ્ર દાળ','मिश्रित दाल']
};
function phraseInText(text:string,phrase:string){if(!text||!phrase)return false; if(text===phrase)return true; const t=` ${text} `, p=` ${phrase} `; return t.includes(p);}
function matchProduct(name:string, products:Product[]){
 const key=norm(name);
 const variants=[key,...(aliases[key]||[]).map(norm)].filter(Boolean);
 // Expired inventory is never counted as available for meals or "cook from home" readiness.
 const usableProducts=products.filter(product=>!product.is_expired);
 const exact=usableProducts.find(p=>variants.includes(norm(p.name)));
 if(exact)return exact;
 let best:Product|undefined; let bestScore=0;
 for(const product of usableProducts){
   const pk=norm(product.name); if(!pk)continue;
   for(const variant of variants){
     const words=variant.split(' ').filter(Boolean);
     // Do not let a generic single word such as "flour" satisfy "whole wheat flour".
     const distinctiveSingles=new Set(['atta','maida','besan','ghee','sev','chickpeas','chole','rajma','paneer','semolina','sooji','suji','rava','peanuts','pav']);
     if(words.length<2&&!distinctiveSingles.has(variant))continue;
     if(phraseInText(pk,variant)){
       const score=words.length*100+variant.length;
       if(score>bestScore){best=product;bestScore=score;}
     }
   }
 }
 return best;
}
const manualOnlyIngredientKeys=new Set(['water','warm water','hot water','cold water','tap water','ice water','પાણી','ગરમ પાણી','पानी','गुनगुना पानी','eau','eau tiède'].map(norm));
function isManualOnlyIngredient(name:string){return manualOnlyIngredientKeys.has(norm(name));}



function recipePhotoScore(recipeName:string,candidateName:string){
 const stop=new Set(['and','with','the','no','nu','ki','ka','a']);
 const rt=norm(recipeName).split(' ').filter(x=>x.length>1&&!stop.has(x));
 const ct=new Set(norm(candidateName).split(' ').filter(x=>x.length>1&&!stop.has(x)));
 if(!rt.length)return 0;
 const hits=rt.filter(x=>ct.has(x)).length;
 return hits/rt.length;
}
function SmartRecipeImage({recipe,className}:{recipe:Recipe;className?:string}){
 const fallback=recipe.image||'/recipe-images-real/cuisine/international.webp';
 const cacheKey=`ghm_recipe_photo:${recipe.id}`;
 const [src,setSrc]=useState(()=>{try{return localStorage.getItem(cacheKey)||fallback}catch{return fallback}});
 const imgRef=useRef<HTMLImageElement|null>(null);
 useEffect(()=>{
   if((fallback.includes('/recipe-images-real/')&&!fallback.includes('/recipe-images-real/cuisine/'))||recipe.id.startsWith('custom-')||recipe.id.startsWith('community-'))return;
   try{if(localStorage.getItem(cacheKey))return;}catch{}
   const el=imgRef.current;if(!el)return;
   let cancelled=false; let observer:IntersectionObserver|null=null;
   const load=async()=>{try{
     const {data}=await api.get('/recipes/external/search',{params:{q:recipe.names.en}});
     const items=(data?.items||[]) as ExternalMeal[];
     const match=items.map(item=>({item,score:recipePhotoScore(recipe.names.en,item.name)})).sort((a,b)=>b.score-a.score)[0];
     if(!cancelled&&match?.item?.image&&match.score>=.66){setSrc(match.item.image);try{localStorage.setItem(cacheKey,match.item.image)}catch{}}
   }catch{}};
   if('IntersectionObserver' in window){observer=new IntersectionObserver(entries=>{if(entries.some(x=>x.isIntersecting)){observer?.disconnect();void load();}},{rootMargin:'220px'});observer.observe(el);}else{void load();}
   return()=>{cancelled=true;observer?.disconnect()};
 },[recipe.id,fallback,cacheKey,recipe.names.en]);
 return <img ref={imgRef} className={className} src={src} alt={recipe.names.en} loading="lazy" onError={()=>setSrc(fallback)}/>;
}


type LinkedRecipe = {
 slug:string; title:string; cuisine:string; meal_kind:MealKind; ghm_recipe_id:string;
 source_name:string; source_url:string; video_on_source:boolean; summary:string;
};

type CommunityIngredient = { name: string; quantity: number; unit: string; optional?: boolean };
type CommunityRecipe = {
  id: number;
  user_id: number;
  uploader_name: string;
  uploader_avatar_url?: string | null;
  name: string;
  base_servings: number;
  meal_kind: MealKind;
  cuisine: string;
  categories: string[];
  diets: Diet[];
  ingredients: CommunityIngredient[];
  steps: string[];
  image_url?: string | null;
  is_shared: boolean;
  can_edit: boolean;
  created_at: string;
  updated_at: string;
};

const cuisineOptions:Cuisine[]=['Gujarati','Punjabi','South Indian','Maharashtrian','Rajasthani','North Indian','International'];
const categoryPresets=['Gujarati','Punjabi','South Indian','North Indian','Jain','Swaminarayan','Vegetarian','Vegan','Non-vegetarian','Breakfast','Proper meal','Light snack','Dessert','Drinks'];
const dietCategoryLabels:Record<Diet,string>={jain:'Jain',swaminarayan:'Swaminarayan',veg:'Vegetarian',vegan:'Vegan',nonveg:'Non-vegetarian'};

function isCuisine(value:string):value is Cuisine{return cuisineOptions.includes(value as Cuisine);}
function recipeMediaUrl(value?:string|null){
  if(!value)return '';
  if(/^(https?:|data:|blob:)/i.test(value))return value;
  if(value.startsWith('/uploads/')){
    const configured=String(import.meta.env.VITE_API_URL||'').trim();
    if(/^https?:\/\//i.test(configured)){
      try{return `${new URL(configured).origin}${value}`;}catch{return value;}
    }
  }
  return value;
}
function communityAsRecipe(item:CommunityRecipe):Recipe{
  const steps=item.steps.length?item.steps:['Follow the recipe steps you saved.'];
  return {
    id:`community-${item.id}`,
    names:{en:item.name,gu:item.name,hi:item.name,fr:item.name},
    baseServings:item.base_servings||4,
    kind:item.meal_kind||'proper',
    diets:item.diets||[],
    cuisine:isCuisine(item.cuisine)?item.cuisine:'International',
    ingredients:(item.ingredients||[]).map(x=>({name:x.name,qty:x.quantity,unit:x.unit,optional:Boolean(x.optional)})),
    steps:{en:steps,gu:steps,hi:steps,fr:steps},
    image:recipeMediaUrl(item.image_url)||'/recipe-images-real/cuisine/international.webp',
  };
}

export default function MealsPage(){
 const {houseId}=useParams();
 const id=Number(houseId);
 const [searchParams]=useSearchParams();
 const {language}=useLanguage();
 const c=copy[language];
 const [products,setProducts]=useState<Product[]>([]);
 const [activeList,setActiveList]=useState<ShoppingList|null>(null);
 const [selected,setSelected]=useState<Recipe>(recipes[0]);
 const [selectedCommunity,setSelectedCommunity]=useState<CommunityRecipe|null>(null);
 const [servings,setServings]=useState(4);
 const [kind,setKind]=useState<'all'|MealKind>('all');
 const [diet,setDiet]=useState<'all'|Diet>('all');
 const [cuisine,setCuisine]=useState<'all'|Cuisine>('all');
 const [q,setQ]=useState('');
 const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false);
 const [cookReviewOpen,setCookReviewOpen]=useState(false);
 const [cookItems,setCookItems]=useState<CookReviewItem[]>([]);
 const [cookBusy,setCookBusy]=useState(false);
 const [cookError,setCookError]=useState('');
 const [manual,setManual]=useState<Record<string,boolean>>({});
 const [qtyOverrides,setQtyOverrides]=useState<Record<string,number>>({});
 const [detailOpen,setDetailOpen]=useState(false);
 const [builtInOpen,setBuiltInOpen]=useState(true);
 const [addConfirmMode,setAddConfirmMode]=useState<'shortage'|'full'|'manual'|null>(null);

 const [linkedRecipes,setLinkedRecipes]=useState<LinkedRecipe[]>([]);
 const [linkedLoading,setLinkedLoading]=useState(true);
 const [linkedError,setLinkedError]=useState('');
 const [linkedQuery,setLinkedQuery]=useState('');
 const [linkedCuisine,setLinkedCuisine]=useState('all');
 const [linkedCategories,setLinkedCategories]=useState<string[]>([]);
 const [linkedTotal,setLinkedTotal]=useState(0);
 const [linkedPage,setLinkedPage]=useState(0);
 const linkedPageSize=24;
 const [linkedActive,setLinkedActive]=useState<LinkedRecipe|null>(null);
 const [externalQ,setExternalQ]=useState('');
 const [externalMeals,setExternalMeals]=useState<ExternalMeal[]>([]);
 const [externalBusy,setExternalBusy]=useState(false);
 const [externalError,setExternalError]=useState('');
 const [externalSelected,setExternalSelected]=useState<ExternalMeal|null>(null);
 const [externalSearched,setExternalSearched]=useState(false);
 const [externalSelection,setExternalSelection]=useState<Record<number,boolean>>({});
 const [externalValues,setExternalValues]=useState<Record<number,{quantity:number;unit:string}>>({});
 const [externalConfirm,setExternalConfirm]=useState(false);
 const [externalMode,setExternalMode]=useState<'selected'|'missing'|'full'>('selected');
 const [externalSaving,setExternalSaving]=useState(false);
 const [externalNotice,setExternalNotice]=useState('');

 const [communityRecipes,setCommunityRecipes]=useState<CommunityRecipe[]>([]);
 const [myRecipes,setMyRecipes]=useState<CommunityRecipe[]>([]);
 const [communityLoading,setCommunityLoading]=useState(true);
 const [communityError,setCommunityError]=useState('');
 const [communityQ,setCommunityQ]=useState('');
 const [communityCategory,setCommunityCategory]=useState('all');
 const [editorOpen,setEditorOpen]=useState(false);
 const [editingRecipe,setEditingRecipe]=useState<CommunityRecipe|null>(null);
 const [editorName,setEditorName]=useState('');
 const [editorBaseServings,setEditorBaseServings]=useState(4);
 const [editorKind,setEditorKind]=useState<MealKind>('proper');
 const [editorCuisine,setEditorCuisine]=useState<Cuisine>('International');
 const [editorDiets,setEditorDiets]=useState<Diet[]>(['veg']);
 const [editorCategories,setEditorCategories]=useState<string[]>([]);
 const [editorCategoryInput,setEditorCategoryInput]=useState('');
 const [editorIngredients,setEditorIngredients]=useState<RecipeIngredient[]>([{name:'',qty:1,unit:'g'}]);
 const [editorSteps,setEditorSteps]=useState<string[]>(['']);
 const [editorShared,setEditorShared]=useState(false);
 const [editorImage,setEditorImage]=useState<File|null>(null);
 const [editorImagePreview,setEditorImagePreview]=useState('');
 const [editorExistingImage,setEditorExistingImage]=useState<string|null>(null);
 const [editorRemoveImage,setEditorRemoveImage]=useState(false);
 const [editorBusy,setEditorBusy]=useState(false);
 const [editorError,setEditorError]=useState('');
 const [legacyRecipes,setLegacyRecipes]=useState<Recipe[]>(()=>{try{return JSON.parse(localStorage.getItem('ghm_custom_recipes')||'[]') as Recipe[]}catch{return []}});
 const [legacyImportBusy,setLegacyImportBusy]=useState(false);

 useEffect(()=>{
   if(!id)return;
   Promise.all([
     api.get<Product[]>(`/houses/${id}/products`,{params:{limit:500}}),
     api.get<ShoppingList|null>(`/houses/${id}/shopping-lists/active`),
   ]).then(([p,l])=>{setProducts(p.data);setActiveList(l.data)}).catch(()=>{});
 },[id]);

 async function refreshCommunity(){
   try{
     setCommunityLoading(true);
     setCommunityError('');
     const [shared,mine]=await Promise.all([
       api.get<CommunityRecipe[]>('/recipes/community',{params:{limit:60}}),
       api.get<CommunityRecipe[]>('/recipes/community/mine'),
     ]);
     setCommunityRecipes(shared.data||[]);
     setMyRecipes(mine.data||[]);
   }catch(e:any){
     setCommunityError(e?.response?.data?.detail||'Community recipes could not be loaded right now.');
   }finally{setCommunityLoading(false);}
 }
 useEffect(()=>{void refreshCommunity();},[]);
 useEffect(()=>{
   api.get<{items:string[]}>('/recipes/linked/categories').then(({data})=>setLinkedCategories(data.items||[])).catch(()=>{});
 },[]);
 useEffect(()=>{
   let active=true;
   const handle=window.setTimeout(()=>{
     setLinkedLoading(true);
     api.get<{items:LinkedRecipe[];total:number}>('/recipes/linked',{
       params:{q:linkedQuery.trim(),cuisine:linkedCuisine==='all'?'':linkedCuisine,limit:linkedPageSize,offset:linkedPage*linkedPageSize}
     }).then(({data})=>{
       if(active){setLinkedRecipes(data.items||[]);setLinkedTotal(data.total||0);setLinkedError('');}
     }).catch(()=>{if(active)setLinkedError('The source-linked recipe index is unavailable right now. Please retry later.');})
       .finally(()=>{if(active)setLinkedLoading(false);});
   },linkedQuery?300:0);
   return()=>{active=false;window.clearTimeout(handle)};
 },[linkedQuery,linkedCuisine,linkedPage]);
 const filteredLinked=linkedRecipes;

 function openLinked(item:LinkedRecipe){
   const ghmRecipe=recipes.find(recipe=>recipe.id===item.ghm_recipe_id);
   if(!ghmRecipe){window.open(item.source_url,'_blank','noopener,noreferrer');return;}
   setLinkedActive(item);setSelectedCommunity(null);setSelected(ghmRecipe);setNotice('');setDetailOpen(true);
 }
 useEffect(()=>{
   const slug=searchParams.get('linked');
   if(!slug||!linkedRecipes.length)return;
   const item=linkedRecipes.find(recipe=>recipe.slug===slug);
   if(item)openLinked(item);
 },[linkedRecipes,searchParams.get('linked')]);



 useEffect(()=>{
   const communityId=Number(searchParams.get('recipe')||0);
   const builtInId=searchParams.get('dish');
   if(communityId&&(communityRecipes.length||myRecipes.length)){
     const item=communityRecipes.find(x=>x.id===communityId)||myRecipes.find(x=>x.id===communityId);
     if(item){setLinkedActive(null);setSelectedCommunity(item);setSelected(communityAsRecipe(item));setDetailOpen(true);}
   }else if(builtInId){
     const item=recipes.find(x=>x.id===builtInId);
     if(item){setLinkedActive(null);setSelectedCommunity(null);setSelected(item);setDetailOpen(true);}
   }
 },[searchParams,communityRecipes,myRecipes]);

 useEffect(()=>{
   if(!editorImage){setEditorImagePreview('');return;}
   const url=URL.createObjectURL(editorImage);
   setEditorImagePreview(url);
   return()=>URL.revokeObjectURL(url);
 },[editorImage]);

 useEffect(()=>{setServings(selected.baseServings);setManual({});setQtyOverrides({});},[selected.id]);

 const rows=useMemo<Row[]>(()=>selected.ingredients.map(ing=>{
   const scaled=ing.qty*servings/selected.baseServings;
   const required=qtyOverrides[ing.name] ?? scaled;
   const matched=matchProduct(ing.name,products);
   const owned=matched&&compatible(matched.unit,ing.unit)?normalizeQty(matched.quantity,matched.unit,ing.unit):0;
   return {...ing,required,owned,shortage:Math.max(required-owned,0),matched,selected:false,autoShop:!isManualOnlyIngredient(ing.name)};
 }),[selected,servings,products,qtyOverrides]);

 const filtered=useMemo(()=>recipes.filter(r=>(kind==='all'||r.kind===kind)&&(diet==='all'||r.diets.includes(diet))&&(cuisine==='all'||r.cuisine===cuisine)&&(!q||Object.values(r.names as Record<string,string>).some(n=>n.toLowerCase().includes(q.toLowerCase())))),[kind,diet,cuisine,q]);
 const communityCategories=useMemo(()=>Array.from(new Set(communityRecipes.flatMap(r=>r.categories||[]))).sort((a,b)=>a.localeCompare(b)),[communityRecipes]);
 const visibleCommunity=useMemo(()=>communityRecipes.filter(r=>{
   const query=communityQ.trim().toLowerCase();
   const queryOk=!query||r.name.toLowerCase().includes(query)||r.uploader_name.toLowerCase().includes(query)||r.cuisine.toLowerCase().includes(query)||(r.categories||[]).some(x=>x.toLowerCase().includes(query));
   const categoryOk=communityCategory==='all'||(r.categories||[]).some(x=>x.toLowerCase()===communityCategory.toLowerCase())||r.cuisine.toLowerCase()===communityCategory.toLowerCase();
   return queryOk&&categoryOk;
 }),[communityRecipes,communityQ,communityCategory]);
 const availability=(r:Recipe)=>{const x=r.ingredients.filter(i=>!i.optional&&!isManualOnlyIngredient(i.name)).map(i=>{const p=matchProduct(i.name,products); return !!p&&compatible(p.unit,i.unit)&&normalizeQty(p.quantity,p.unit,i.unit)>=i.qty;}); return x.length?x.filter(Boolean).length/x.length:0};

 async function refreshMealData(){const [p,l]=await Promise.all([api.get<Product[]>(`/houses/${id}/products`,{params:{limit:500}}),api.get<ShoppingList|null>(`/houses/${id}/shopping-lists/active`)]);setProducts(p.data);setActiveList(l.data);}
 useHouseLiveRefresh(id, refreshMealData);
 function chosenRowsForMode(mode:'shortage'|'full'|'manual'){
   return rows.filter((r,i)=>mode==='manual'?!!manual[String(i)]:mode==='shortage'?(r.autoShop&&r.shortage>0):r.autoShop);
 }
 function requestAdd(mode:'shortage'|'full'|'manual'){
   const chosen=chosenRowsForMode(mode);
   if(mode==='manual'&&!chosen.length){setNotice(c.selectOne);return;}
   if(!chosen.length){setNotice(c.noAutoItems);return;}
   setNotice('');
   setAddConfirmMode(mode);
 }
 async function add(mode:'shortage'|'full'|'manual'){
   const chosen=chosenRowsForMode(mode);
   if(mode==='manual'&&!chosen.length){setNotice(c.selectOne);setAddConfirmMode(null);return;}
   const payload=chosen.map(r=>{
     const recipeQty=mode==='shortage'?r.shortage:r.required;
     const canUseInventoryUnit=!!r.matched&&compatible(r.matched.unit,r.unit);
     const targetUnit=canUseInventoryUnit?r.matched!.unit:r.unit;
     const targetQty=canUseInventoryUnit?normalizeQty(recipeQty,r.unit,targetUnit):recipeQty;
     const tagPrefix=mode==='shortage'?'Recipe shortage':mode==='manual'?'Recipe selected':'Full recipe quantity';
     return {name:canUseInventoryUnit?r.matched!.name:r.name,quantity:targetQty,unit:targetUnit,tag:`${tagPrefix} · ${selected.names.en} · ${fmt(recipeQty)} ${r.unit}`};
   }).filter(x=>x.quantity>0);
   if(!payload.length){setNotice(c.noAutoItems);setAddConfirmMode(null);return;}
   setBusy(true);setNotice('');
   try{const {data}=await api.post(`/insights/houses/${id}/recipes/add-shopping`,{ingredients:payload,list_id:activeList?.id||null,recipe_name:selected.names.en,mode});setNotice(`${c.added}: ${data.list_title}`);await refreshMealData();if(mode==='manual')setManual({});setAddConfirmMode(null);}
   catch(e:any){setNotice(e?.response?.data?.detail||'Could not add ingredients.');}
   finally{setBusy(false);}
 }
 function openCookReview(){
   const candidates=rows.flatMap(row=>{
     const product=row.matched;
     if(!product||product.is_expired||!compatible(product.unit,row.unit)||row.required<=0||product.quantity<=0)return [];
     const requiredInInventoryUnit=normalizeQty(row.required,row.unit,product.unit);
     const amount=Math.min(Math.max(requiredInInventoryUnit,0),Math.max(product.quantity,0));
     if(amount<=0)return [];
     return [{productId:product.id,name:product.name,unit:product.unit,available:product.quantity,amount,selected:!row.optional,recipeAmount:row.required,recipeUnit:row.unit,optional:Boolean(row.optional)}];
   });
   if(!candidates.length){setNotice('No usable tracked ingredients can be adjusted from this recipe. Expired items are never included.');return;}
   setCookItems(candidates);setCookError('');setCookReviewOpen(true);
 }
 async function confirmCookedMeal(){
   const chosen=cookItems.filter(item=>item.selected&&item.amount>0);
   if(!chosen.length){setCookError('Select at least one ingredient that was actually used.');return;}
   try{
     setCookBusy(true);setCookError('');
     await api.post(`/houses/${id}/inventory/consume`,{recipe_name:selected.names.en,items:chosen.map(item=>({product_id:item.productId,quantity:item.amount}))});
     await refreshMealData();
     setCookReviewOpen(false);
     setNotice(`Inventory updated from what you confirmed using for ${selected.names[language]}.`);
     void api.post('/analytics/event',{event_name:'meal_cooked',house_id:id,event_context:'confirmed_inventory_use'}).catch(()=>undefined);
     window.dispatchEvent(new CustomEvent('ghm:success-moment',{detail:{type:'meal_plan',message:'Your cooked meal was confirmed and the ingredients you approved were deducted from household inventory.'}}));
   }catch(e:any){setCookError(e?.response?.data?.detail||'Could not update inventory. Refresh the meal and try again.');}
   finally{setCookBusy(false);}
 }
 function openExternal(meal:ExternalMeal){
   setExternalSelected(meal);setExternalNotice('');setExternalConfirm(false);
   setExternalSelection(Object.fromEntries(meal.ingredients.map((ingredient,i)=>[i,!isManualOnlyIngredient(ingredient.name)])));
   setExternalValues(Object.fromEntries(meal.ingredients.map((ingredient,i)=>{const parsed=parseExternalMeasure(ingredient.measure);return [i,{quantity:parsed.quantity,unit:parsed.unit}]})));
 }
 async function shareExternal(){
   if(!externalSelected)return;
   try{
     await api.post(`/houses/${id}/chat`,{message:'',attachment_type:'recipe',attachment_title:externalSelected.name,attachment_subtitle:`${externalSelected.area||'International'} · TheMealDB`,attachment_url:`/houses/${id}/meals?external=${encodeURIComponent(externalSelected.id)}&externalName=${encodeURIComponent(externalSelected.name)}`});
     setExternalNotice('Shared to House Chat.');
   }catch(e:any){setExternalNotice(e?.response?.data?.detail||'Could not share this recipe.');}
 }
 async function addExternalIngredients(){
   if(!externalSelected || externalSaving)return;
   const ingredients=externalSelected.ingredients.flatMap((ingredient,i)=>{
     if(externalMode==='selected'&&!externalSelection[i])return [];
     if(externalMode!=='selected'&&isManualOnlyIngredient(ingredient.name))return [];
     const parsed=parseExternalMeasure(ingredient.measure);
     const {quantity,unit}=externalValues[i]||{quantity:parsed.quantity,unit:parsed.unit};
     if(!(quantity>0 && Number.isFinite(quantity)))return [];
     if(externalMode==='missing'){
       // Never calculate shortages for unknown conversions or ambiguous measures.
       if(!parsed.precise || !compatible(unit,parsed.unit))return [];
       const owned=matchProduct(ingredient.name,products);
       if(owned && !compatible(unit,owned.unit))return [];
       const available=owned?normalizeQty(owned.quantity,owned.unit,unit):0;
       const need=Math.max(0,quantity-available);
       if(need<=0)return [];
       return [{name:ingredient.name,quantity:need,unit,tag:`TheMealDB recipe shortage · ${externalSelected.name}`}];
     }
     return [{name:ingredient.name,quantity,unit,tag:`TheMealDB · ${externalSelected.name} · original: ${ingredient.measure||'unspecified'}`}];
   });
   if(!ingredients.length){setExternalNotice('Select at least one ingredient.');return;}
   try{
     setExternalSaving(true);setExternalNotice('');
     const {data}=await api.post(`/insights/houses/${id}/recipes/add-shopping`,{ingredients,recipe_name:externalSelected.name,mode:externalMode==='selected'?'manual':'shortage',list_id:activeList?.id||null});
     await refreshMealData();setExternalConfirm(false);setExternalNotice(`Added to ${data.list_title}.`);
   }catch(e:any){setExternalNotice(e?.response?.data?.detail||'Could not add ingredients.');}
   finally{setExternalSaving(false);}
 }
 useEffect(()=>{
   const recipeId=searchParams.get('external');const recipeName=searchParams.get('externalName');
   if(!id || !recipeId || !recipeName)return;
   let cancelled=false;
   api.get('/recipes/external/search',{params:{q:recipeName}}).then(({data})=>{
     if(cancelled)return;
     const item=(data?.items||[] as ExternalMeal[]).find((x:ExternalMeal)=>x.id===recipeId);
     if(item)openExternal(item);
   }).catch(()=>{ if(!cancelled)setExternalError('This external recipe could not be loaded right now. Search its name below.'); });
   return()=>{cancelled=true};
 },[id,searchParams.get('external'),searchParams.get('externalName')]);
 async function searchExternal(){if(externalQ.trim().length<2)return;try{setExternalBusy(true);setExternalError('');setExternalSearched(true);const {data}=await api.get('/recipes/external/search',{params:{q:externalQ.trim()}});setExternalMeals(data.items||[]);}catch(e:any){setExternalMeals([]);setExternalError(e?.response?.data?.detail||'Recipe service is temporarily unavailable.');}finally{setExternalBusy(false)}}

 const ingName=(n:string)=>ingredientNames[language]?.[n]||n;
 const kindLabel=(value:MealKind)=>value==='proper'?c.proper:value==='light'?c.light:value==='breakfast'?c.breakfast:value==='dessert'?c.dessert:c.drink;
 const dietLabel=(value:Diet)=>({
   en:{jain:'Jain',swaminarayan:'Swaminarayan (no onion/garlic)',veg:'Vegetarian',vegan:'Vegan',nonveg:'Non-vegetarian'},
   gu:{jain:'જૈન',swaminarayan:'સ્વામિનારાયણ (ડુંગળી/લસણ વગર)',veg:'શાકાહારી',vegan:'વીગન',nonveg:'માંસાહારી'},
   hi:{jain:'जैन',swaminarayan:'स्वामीनारायण (बिना प्याज़/लहसुन)',veg:'शाकाहारी',vegan:'वीगन',nonveg:'मांसाहारी'},
   fr:{jain:'Jaïn',swaminarayan:'Swaminarayan (sans oignon/ail)',veg:'Végétarien',vegan:'Végane',nonveg:'Non végétarien'}
 }[language][value]);
 const cuisineLabel=(value:Cuisine)=>({
   en:{'Gujarati':'Gujarati','Punjabi':'Punjabi','South Indian':'South Indian','Maharashtrian':'Maharashtrian','Rajasthani':'Rajasthani','North Indian':'North Indian','International':'International'},
   gu:{'Gujarati':'ગુજરાતી','Punjabi':'પંજાબી','South Indian':'દક્ષિણ ભારતીય','Maharashtrian':'મહારાષ્ટ્રીયન','Rajasthani':'રાજસ્થાની','North Indian':'ઉત્તર ભારતીય','International':'આંતરરાષ્ટ્રીય'},
   hi:{'Gujarati':'गुजराती','Punjabi':'पंजाबी','South Indian':'दक्षिण भारतीय','Maharashtrian':'महाराष्ट्रीयन','Rajasthani':'राजस्थानी','North Indian':'उत्तर भारतीय','International':'अंतरराष्ट्रीय'},
   fr:{'Gujarati':'Gujarati','Punjabi':'Pendjabi','South Indian':'Inde du Sud','Maharashtrian':'Maharashtrian','Rajasthani':'Rajasthani','North Indian':'Inde du Nord','International':'International'}
 }[language][value]);

 function openBuiltIn(recipe:Recipe){setLinkedActive(null);setSelected(recipe);setSelectedCommunity(null);setDetailOpen(true);setNotice('');}
 function openCommunity(item:CommunityRecipe){setLinkedActive(null);setSelected(communityAsRecipe(item));setSelectedCommunity(item);setDetailOpen(true);setNotice('');}
 function resetEditor(){
   setEditingRecipe(null);setEditorName('');setEditorBaseServings(4);setEditorKind('proper');setEditorCuisine('International');setEditorDiets(['veg']);setEditorCategories([]);setEditorCategoryInput('');setEditorIngredients([{name:'',qty:1,unit:'g'}]);setEditorSteps(['']);setEditorShared(false);setEditorImage(null);setEditorExistingImage(null);setEditorRemoveImage(false);setEditorError('');
 }
 function openCreateEditor(){resetEditor();setEditorOpen(true);}
 function openEditEditor(item:CommunityRecipe){
   const derivedLabels=new Set([item.cuisine,...(item.diets||[]).map(d=>dietCategoryLabels[d])].map(x=>x.toLowerCase()));
   const customCategories=(item.categories||[]).filter(x=>!derivedLabels.has(x.toLowerCase()));
   setEditingRecipe(item);setEditorName(item.name);setEditorBaseServings(item.base_servings||4);setEditorKind(item.meal_kind||'proper');setEditorCuisine(isCuisine(item.cuisine)?item.cuisine:'International');setEditorDiets(item.diets||[]);setEditorCategories(customCategories);setEditorCategoryInput('');setEditorIngredients((item.ingredients||[]).map(x=>({name:x.name,qty:x.quantity,unit:x.unit,optional:Boolean(x.optional)})));setEditorSteps(item.steps?.length?item.steps:['']);setEditorShared(item.is_shared);setEditorImage(null);setEditorExistingImage(item.image_url||null);setEditorRemoveImage(false);setEditorError('');setEditorOpen(true);
 }
 function toggleDiet(value:Diet){setEditorDiets(current=>current.includes(value)?current.filter(x=>x!==value):[...current,value]);}
 function toggleCategory(value:string){setEditorCategories(current=>current.some(x=>x.toLowerCase()===value.toLowerCase())?current.filter(x=>x.toLowerCase()!==value.toLowerCase()):[...current,value]);}
 function addCustomCategory(){const value=editorCategoryInput.trim();if(!value)return;setEditorCategories(current=>current.some(x=>x.toLowerCase()===value.toLowerCase())?current:[...current,value]);setEditorCategoryInput('');}

 async function saveRecipe(){
   const cleanIngredients=editorIngredients.filter(x=>x.name.trim()&&Number(x.qty)>0).map(x=>({...x,name:x.name.trim(),qty:Number(x.qty)}));
   const cleanSteps=editorSteps.map(x=>x.trim()).filter(Boolean);
   if(!editorName.trim()){setEditorError('Add a recipe name.');return;}
   if(!cleanIngredients.length){setEditorError('Add at least one ingredient with a quantity.');return;}
   if(!cleanSteps.length){setEditorError('Add at least one cooking step.');return;}
   const categorySet=[...editorCategories];
   for(const d of editorDiets){const label=dietCategoryLabels[d];if(!categorySet.some(x=>x.toLowerCase()===label.toLowerCase()))categorySet.push(label);}
   if(editorCuisine!=='International'&&!categorySet.some(x=>x.toLowerCase()===editorCuisine.toLowerCase()))categorySet.push(editorCuisine);
   const payload={name:editorName.trim(),base_servings:Math.max(1,editorBaseServings||1),meal_kind:editorKind,cuisine:editorCuisine,categories:categorySet,diets:editorDiets,ingredients:cleanIngredients.map(x=>({name:x.name,quantity:x.qty,unit:x.unit,optional:Boolean(x.optional)})),steps:cleanSteps,is_shared:editorShared};
   try{
     setEditorBusy(true);setEditorError('');
     let saved:CommunityRecipe;
     if(editingRecipe){saved=(await api.patch<CommunityRecipe>(`/recipes/community/${editingRecipe.id}`,payload)).data;}
     else{saved=(await api.post<CommunityRecipe>('/recipes/community',payload)).data;}
     if(editingRecipe&&editorRemoveImage&&!editorImage&&saved.image_url){saved=(await api.delete<CommunityRecipe>(`/recipes/community/${saved.id}/image`)).data;}
     if(editorImage){const form=new FormData();form.append('file',editorImage);saved=(await api.post<CommunityRecipe>(`/recipes/community/${saved.id}/image`,form)).data;}
     await refreshCommunity();
     setEditorOpen(false);resetEditor();
     openCommunity(saved);
   }catch(e:any){setEditorError(e?.response?.data?.detail||'Could not save this recipe. Please check the fields and try again.');}
   finally{setEditorBusy(false);}
 }
 async function shareSelectedRecipe(){
   if(!id)return;
   try{
     const url=linkedActive?`/houses/${id}/meals?linked=${encodeURIComponent(linkedActive.slug)}`:selectedCommunity?`/houses/${id}/meals?recipe=${selectedCommunity.id}`:`/houses/${id}/meals?dish=${encodeURIComponent(selected.id)}`;
     await api.post(`/houses/${id}/chat`,{message:'',attachment_type:'recipe',attachment_title:selected.names[language]||selected.names.en,attachment_subtitle:`${cuisineLabel((selected.cuisine||'International') as Cuisine)} · ${kindLabel(selected.kind)} · ${servings} servings`,attachment_url:url});
     setNotice('Recipe shared to House Chat.');
   }catch(e:any){setNotice(e?.response?.data?.detail||'Recipe could not be shared right now.');}
 }

 async function deleteRecipe(item:CommunityRecipe){
   if(!window.confirm(`Delete “${item.name}”? This cannot be undone.`))return;
   try{await api.delete(`/recipes/community/${item.id}`);if(selectedCommunity?.id===item.id){setDetailOpen(false);setSelectedCommunity(null);}await refreshCommunity();}
   catch(e:any){setCommunityError(e?.response?.data?.detail||'Could not delete the recipe.');}
 }
 async function toggleShare(item:CommunityRecipe){
   try{await api.patch(`/recipes/community/${item.id}`,{is_shared:!item.is_shared});await refreshCommunity();}
   catch(e:any){setCommunityError(e?.response?.data?.detail||'Could not change sharing for this recipe.');}
 }
 async function importLegacy(){
   if(!legacyRecipes.length)return;
   try{
     setLegacyImportBusy(true);setCommunityError('');
     for(const recipe of legacyRecipes){
       const steps=(recipe.steps?.en||[]).filter(Boolean);const cats=[recipe.cuisine,...recipe.diets.map(d=>dietCategoryLabels[d])].filter(Boolean);
       await api.post('/recipes/community',{name:recipe.names?.en||'My recipe',base_servings:recipe.baseServings||4,meal_kind:recipe.kind||'proper',cuisine:recipe.cuisine||'International',categories:cats,diets:recipe.diets||[],ingredients:(recipe.ingredients||[]).map(x=>({name:x.name,quantity:x.qty,unit:x.unit,optional:Boolean(x.optional)})),steps:steps.length?steps:['Follow your saved cooking method.'],is_shared:false});
     }
     localStorage.removeItem('ghm_custom_recipes');setLegacyRecipes([]);await refreshCommunity();
   }catch(e:any){setCommunityError(e?.response?.data?.detail||'Some older recipes could not be imported. Nothing was removed from this browser.');}
   finally{setLegacyImportBusy(false);}
 }

 return <main className="page shell wide meals-page meals-page-v84 meals-page-v89">
   <section className="meals-hero"><div><p className="eyebrow">SMART MEAL PLANNER</p><div className="feature-heading-with-why-v101"><h1>{c.title}</h1><FeatureWhyButton feature="meals" label="Why?" /></div><p>{c.sub}</p></div><div className="serving-box"><span>👥 {c.servings}</span><input type="number" min="1" max="100" value={servings} onChange={e=>setServings(Math.max(1,Number(e.target.value)||1))}/></div></section>
   <HouseContextSwitcher currentHouseId={id} section="meals" />
   <FeaturePurposeCard feature="meals" />
   <section className="panel meal-controls meal-controls-v84"><label className="meal-search-control"><span>🔎</span><input placeholder={c.search} value={q} onChange={e=>setQ(e.target.value)}/></label><select aria-label="Meal type" value={kind} onChange={e=>setKind(e.target.value as 'all'|MealKind)}><option value="all">{c.mealType}: {c.all}</option><option value="proper">{c.proper}</option><option value="light">{c.light}</option><option value="breakfast">{c.breakfast}</option><option value="dessert">{c.dessert}</option><option value="drink">{c.drink}</option></select><select aria-label="Diet" value={diet} onChange={e=>setDiet(e.target.value as 'all'|Diet)}><option value="all">{c.diet}: {c.all}</option><option value="jain">Jain</option><option value="swaminarayan">Swaminarayan (no onion/garlic)</option><option value="veg">Veg</option><option value="vegan">Vegan</option><option value="nonveg">Non-veg</option></select></section>
   <section className="meal-cuisine-strip panel" aria-label={c.cuisine}><div className="meal-cuisine-heading"><span>🍽️</span><div><small>{c.cuisine}</small><strong>{cuisine==='all'?c.all:cuisineLabel(cuisine)}</strong></div></div><div className="meal-cuisine-pills"><button className={cuisine==='all'?'active':''} onClick={()=>setCuisine('all')}>✨ {c.all}</button>{cuisineOptions.map(x=><button key={x} className={cuisine===x?'active':''} onClick={()=>setCuisine(x)}><span>{x==='Gujarati'?'🥗':x==='Punjabi'?'🫓':x==='South Indian'?'🥥':x==='Maharashtrian'?'🌶️':x==='Rajasthani'?'🏜️':x==='North Indian'?'🍛':'🌍'}</span>{cuisineLabel(x)}</button>)}</div></section>

   <section className={`meal-library panel v127-meal-library ${builtInOpen?'is-open':'is-collapsed'}`}><div className="panel-title-row"><div><p className="eyebrow">COOK FROM HOME</p><div className="feature-heading-with-why-v101"><h2>{c.browse}</h2><FeatureWhyButton feature="meals" label="Why?" /></div></div><div className="v127-library-actions"><span className="badge">{filtered.length} {c.recipesWord}</span><button type="button" className="secondary v127-library-toggle" aria-expanded={builtInOpen} onClick={()=>setBuiltInOpen(open=>!open)}>{builtInOpen?'▴ '+c.collapseRecipes:'▾ '+c.expandRecipes}</button></div></div>{builtInOpen?<><div className="recipe-image-grid">{filtered.map(r=>{const a=availability(r);return <button className={`recipe-image-tile ${r.image?.includes('/recipe-images-real/')?'has-photo':'has-illustration'}`} key={r.id} onClick={()=>openBuiltIn(r)}><SmartRecipeImage recipe={r}/><span className="recipe-image-copy"><small>{cuisineLabel((r.cuisine||'International') as Cuisine)} · {kindLabel(r.kind)}</small><strong>{r.names[language]}</strong><em className={a===1?'ready':a>.5?'almost':'missing'}>{a===1?'✓ '+c.canMake:a>.5?'◐ '+c.almost:`${Math.round(a*100)}% inventory`}</em></span><i>{c.openRecipe} →</i></button>})}</div>{!filtered.length&&<p>{c.noMatch}</p>}</>:<p className="v127-library-collapsed-note">{filtered.length} {c.recipesWord} · {c.expandRecipes}</p>}</section>

   <section className="panel v144-linked-library" aria-labelledby="v144-linked-title">
     <div className="panel-title-row v144-linked-header">
       <div><p className="eyebrow">VEGETARIAN INSPIRATION · SOURCE-LINKED</p>
         <h2 id="v144-linked-title">Discover Indian vegetarian dishes</h2>
         <p>Explore a growing index of vegetarian dishes. Some have full GHM inventory and shopping cards; for the rest, follow the author’s link to detailed steps, photographs and available videos.</p>
       </div>
       <a className="button secondary" href="https://www.vegrecipesofindia.com/" target="_blank" rel="noopener noreferrer">Visit original library ↗</a>
     </div>
     <div className="v144-linked-toolbar">
       <label><span>Search dishes</span><input value={linkedQuery} onChange={e=>{setLinkedPage(0);setLinkedQuery(e.target.value)}} placeholder="e.g. paneer, chole, dhokla"/></label>
       <label><span>Category</span><select value={linkedCuisine} onChange={e=>{setLinkedPage(0);setLinkedCuisine(e.target.value)}}><option value="all">All categories</option>{linkedCategories.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
     </div>
     <p className="v145-recipe-note">{linkedTotal.toLocaleString()} source-linked dishes indexed in GHM. Recipes with GHM cooking cards have editable ingredients; other entries open the original author’s detailed guide.</p>
     <div className="v145-source-category-grid" aria-label="Browse Dassana's original recipe categories">{sourceRecipeCategories.map(category=><a key={category.url} href={category.url} target="_blank" rel="noopener noreferrer">{category.name} ↗</a>)}</div>
     {linkedError&&<div className="error form-message" role="alert">{linkedError}</div>}
     <div className="v144-linked-legal">Source credit: Dassana Amit · Dassana's Veg Recipes. GHM's ingredient amounts and dietary information are independent planning suggestions, <strong>not the author's original quantities or a substitute for her recipe.</strong> Verify ingredients and any dietary restrictions on the original page.</div>
     {linkedLoading?<div className="empty-state compact">Loading vegetarian inspiration…</div>:
       filteredLinked.length?<div className="v144-linked-grid">{filteredLinked.map(item=>{
         const ghmRecipe=recipes.find(recipe=>recipe.id===item.ghm_recipe_id);
         const hasPlanningCard=Boolean(ghmRecipe);
         const cardBody=<><span className="v144-linked-image">{ghmRecipe?<img src={ghmRecipe.image||'/recipe-images-real/cuisine/international.webp'} loading="lazy" alt=""/>:<span aria-hidden="true">📖</span>}<i>{hasPlanningCard?'GHM cooking & shopping plan':'Original author guide'}</i></span>
           <span className="v144-linked-copy"><small>{item.cuisine} · {item.meal_kind==='breakfast'?'Breakfast':item.meal_kind==='light'?'Snack':item.meal_kind==='dessert'?'Dessert':'Meal'}</small><strong>{item.title}</strong><span>{hasPlanningCard?item.summary:'Read the original method, photos and any available videos with the author.'}</span><em>{hasPlanningCard?'Review ingredients & inventory →':'Read original detailed recipe ↗'}</em></span></>;
         return <article className={`v144-linked-card ${hasPlanningCard?'':'v145-source-only'}`} key={item.slug}>
           {hasPlanningCard?<button type="button" className="v144-linked-main" onClick={()=>openLinked(item)}>{cardBody}</button>
             :<a className="v144-linked-main" href={item.source_url} target="_blank" rel="noopener noreferrer">{cardBody}</a>}
           <div className="v144-linked-footer"><span>By Dassana Amit</span><a href={item.source_url} target="_blank" rel="noopener noreferrer">Original recipe{item.video_on_source?' & video':''} ↗</a></div>
         </article>;
       })}</div>:<div className="empty-state compact">No matching dishes. Try a different search or browse the source categories above.</div>}
     {linkedTotal>linkedPageSize&&<div className="v145-recipe-pages"><button type="button" className="secondary" disabled={linkedLoading||linkedPage===0} onClick={()=>setLinkedPage(p=>Math.max(0,p-1))}>← Previous</button><span>Page {linkedPage+1} of {Math.ceil(linkedTotal/linkedPageSize)}</span><button type="button" className="secondary" disabled={linkedLoading||(linkedPage+1)*linkedPageSize>=linkedTotal} onClick={()=>setLinkedPage(p=>p+1)}>Next →</button></div>}
   </section>

   <section className="panel community-recipes-v89">
     <div className="panel-title-row community-title-v89"><div><p className="eyebrow">COMMUNITY KITCHEN</p><h2>Community recipes</h2><p>Discover recipes shared by Grocery House Manager users. Every card shows who created it and the categories they chose.</p></div><span className="badge">{communityRecipes.length} shared</span></div>
     <div className="community-toolbar-v89"><label><span>🔎</span><input value={communityQ} onChange={e=>setCommunityQ(e.target.value)} placeholder="Search community recipes or cooks" /></label><select value={communityCategory} onChange={e=>setCommunityCategory(e.target.value)}><option value="all">All categories</option>{communityCategories.map(x=><option key={x} value={x}>{x}</option>)}</select></div>
     {communityError&&<div className="error form-message">{communityError}</div>}
     {communityLoading?<div className="community-loading-v89">Loading community recipes…</div>:visibleCommunity.length?<div className="community-recipe-grid-v89">{visibleCommunity.map(item=><article className="community-recipe-card-v89" key={item.id}><button className="community-card-open-v89" onClick={()=>openCommunity(item)}><span className="community-image-wrap-v89"><img src={recipeMediaUrl(item.image_url)||'/recipe-images-real/cuisine/international.webp'} alt={item.name} loading="lazy"/><i>{item.is_shared?'Community':'Private'}</i></span><span className="community-card-copy-v89"><small>{item.cuisine} · {kindLabel(item.meal_kind)}</small><strong>{item.name}</strong><span className="recipe-uploader-v89">{item.uploader_avatar_url?<img src={item.uploader_avatar_url} alt=""/>:<b>{item.uploader_name.slice(0,1).toUpperCase()}</b>}<span>By {item.uploader_name}</span></span><span className="community-card-tags-v89">{(item.categories||[]).slice(0,4).map(tag=><em key={tag}>{tag}</em>)}</span><i>Open recipe →</i></span></button>{item.can_edit&&<div className="community-owner-actions-v89"><button className="secondary" onClick={()=>openEditEditor(item)}>✎ Edit</button><button className="ghost danger-ghost-v89" onClick={()=>deleteRecipe(item)}>Delete</button></div>}</article>)}</div>:<div className="empty-state compact">No community recipes match this search yet.</div>}
   </section>

   <section className="panel my-recipes-v89">
     <div className="panel-title-row"><div><p className="eyebrow">YOUR RECIPE BOX</p><h2>My recipes</h2><p>Create your own recipe once, use it with inventory anytime, and choose whether other users can discover it.</p></div><button className="primary create-recipe-button-v89" onClick={openCreateEditor}>＋ Create recipe</button></div>
     {legacyRecipes.length>0&&<div className="legacy-recipe-import-v89"><div><strong>{legacyRecipes.length} older recipe{legacyRecipes.length===1?'':'s'} found on this browser</strong><small>Import them into your account so you can edit, share and use them on any device.</small></div><button className="secondary" disabled={legacyImportBusy} onClick={importLegacy}>{legacyImportBusy?'Importing…':'Import old recipes'}</button></div>}
     {myRecipes.length?<div className="my-recipe-grid-v89 v135-recipe-showcase-grid">{myRecipes.map(item=><article key={item.id} className="my-recipe-card-v89 v135-my-recipe-card"><button className="my-recipe-open-v89 v135-my-recipe-open" onClick={()=>openCommunity(item)}><span className="v135-recipe-image-wrap"><img src={recipeMediaUrl(item.image_url)||'/recipe-images-real/cuisine/international.webp'} alt={item.name}/><i>{item.is_shared?'Shared':'Private'}</i></span><span className="recipe-image-copy v135-recipe-copy"><small>{item.cuisine} · {kindLabel(item.meal_kind)}</small><strong>{item.name}</strong><span className="community-card-tags-v89">{(item.categories||[]).slice(0,3).map(tag=><em key={tag}>{tag}</em>)}</span><b>Open recipe →</b></span></button><footer><span className={`share-status-v89 ${item.is_shared?'shared':'private'}`}>{item.is_shared?'● Shared with community':'● Private'}</span><div><button className="secondary" onClick={()=>toggleShare(item)}>{item.is_shared?'Make private':'Share'}</button><button className="secondary" onClick={()=>openEditEditor(item)}>Edit</button><button className="ghost danger-ghost-v89" onClick={()=>deleteRecipe(item)}>Delete</button></div></footer></article>)}</div>:!communityLoading&&<div className="empty-state compact">You have not created a recipe yet. Start with a family favourite and keep it private or share it with the community.</div>}
   </section>

   {detailOpen && <OverlayPortal><div className="modal-backdrop recipe-detail-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)setDetailOpen(false)}}><section className="recipe-card panel recipe-detail-modal focus-dialog" role="dialog" aria-modal="true" aria-label={selected.names[language]}><header className="focus-dialog-titlebar recipe-modal-title"><div><p className="eyebrow">{cuisineLabel((selected.cuisine||'International') as Cuisine).toUpperCase()} · {kindLabel(selected.kind).toUpperCase()}</p><h2>{selected.names[language]}</h2></div><button className="icon-btn" data-dialog-close="true" onClick={()=>setDetailOpen(false)} aria-label="Close recipe">×</button></header><div className="focus-dialog-scroll"><SmartRecipeImage recipe={selected} className="recipe-detail-image"/>
    {linkedActive&&<div className="v144-source-banner"><div><strong>GHM grocery-planning card · {linkedActive.title}</strong><p>These ingredients, amounts, serving adjustments, and GHM cooking steps belong to GHM's independent recipe library; they are <b>not transcribed from Dassana's recipe</b>. Review quantities before adding to Shopping. For the source's authentic method and media, visit the author.</p></div><a href={linkedActive.source_url} target="_blank" rel="noopener noreferrer">View Dassana's original recipe{linkedActive.video_on_source?' & video':''} ↗</a></div>}
{selectedCommunity&&<div className="recipe-community-meta-v89"><div className="recipe-uploader-v89">{selectedCommunity.uploader_avatar_url?<img src={selectedCommunity.uploader_avatar_url} alt=""/>:<b>{selectedCommunity.uploader_name.slice(0,1).toUpperCase()}</b>}<span><small>Recipe by</small><strong>{selectedCommunity.uploader_name}</strong></span></div><div className="community-card-tags-v89">{selectedCommunity.categories.map(tag=><em key={tag}>{tag}</em>)}</div>{selectedCommunity.can_edit&&<button className="secondary" onClick={()=>{setDetailOpen(false);openEditEditor(selectedCommunity)}}>✎ Edit my recipe</button>}</div>}<div className="recipe-card-head"><div><div className="diet-chips">{selected.diets.map(d=><span key={d}>{dietLabel(d)}</span>)}</div></div><div className="recipe-ready-score"><strong>{Math.round(availability(selected)*100)}%</strong><small>{c.inventory}</small></div></div>
    <section className="v126-recipe-overview" aria-label={c.recipeAtGlance}><div><small>{c.servesLabel}</small><strong>{servings}</strong></div><div><small>{c.ingredientsCount}</small><strong>{selected.ingredients.length}</strong></div><div><small>{c.stepsCount}</small><strong>{selected.steps[language].length}</strong></div><div><small>{c.readyLabel}</small><strong>{Math.round(availability(selected)*100)}%</strong></div></section>
    <div className="v126-recipe-section-head"><div><p className="eyebrow">{c.recipeAtGlance}</p><h3>{c.ingredientPlan}</h3><p>{c.ingredientPlanIntro}</p></div><span>👥 {servings}</span></div>
    <div className="ingredient-table"><div className="ingredient-row head"><span></span><span>{c.ingredients}</span><span>{c.required}</span><span>{c.inventory}</span><span>{c.shortage}</span></div>{rows.map((row,i)=><div className={`ingredient-row ${row.shortage<=0?'covered':'needed'} ${!row.autoShop?'manual-only-row':''}`} key={`${row.name}-${i}`}><span><input aria-label={`${c.manual}: ${ingName(row.name)}`} type="checkbox" checked={!!manual[String(i)]} onChange={e=>setManual(m=>({...m,[String(i)]:e.target.checked}))}/></span><span><b>{ingName(row.name)}</b><span className="ingredient-badges">{row.optional&&<small>{c.optional}</small>}{!row.autoShop&&<small className="manual-only-badge">{c.manualOnly}</small>}</span></span><span className="required-edit"><input type="number" min="0" step="0.01" value={Number(fmt(row.required))} onChange={e=>setQtyOverrides(o=>({...o,[row.name]:Math.max(0,Number(e.target.value)||0)}))}/><small>{row.unit}</small></span><span>{row.matched&&compatible(row.matched.unit,row.unit)?`${fmt(row.owned)} ${row.unit}`:row.autoShop?'0 '+row.unit:'—'}</span><span>{!row.autoShop?<em className="manual-only-text">{c.manualOnly}</em>:row.shortage>0?<mark>+ {fmt(row.shortage)} {row.unit}</mark>:<em>✓ {c.enough}</em>}</span></div>)}</div>
    {rows.some(r=>!r.autoShop)&&<div className="water-smart-note">💧 {c.waterHelp}</div>}
    {selected.ingredients.some(item=>item.optional)&&<div className="v126-recipe-trust-note"><strong>✓ {c.optional}:</strong> {c.pantryNote}</div>}
    <div className="recipe-share-row-v113"><button className="secondary" type="button" onClick={()=>void shareSelectedRecipe()}>💬 Share recipe to House Chat</button></div><div className="recipe-action-guide"><button disabled={busy} onClick={()=>requestAdd('shortage')}><span className="action-icon">🛒</span><span><strong>{c.addShort}</strong><small>{c.shortHelp}</small></span></button><button className="secondary" disabled={busy} onClick={()=>requestAdd('manual')}><span className="action-icon">☑</span><span><strong>{c.manual}</strong><small>{c.manualHelp}</small></span></button><button className="ghost" disabled={busy} onClick={()=>requestAdd('full')}><span className="action-icon">＋</span><span><strong>{c.addAll}</strong><small>{c.fullHelp}</small></span></button></div><button className="meal-cooked-trigger-v96" onClick={openCookReview}><span>✓</span><span><strong>I cooked this</strong><small>Review the ingredients you actually used before GHM adjusts inventory. Nothing is deducted automatically.</small></span><em>Review use →</em></button>{notice&&<div className="meal-notice">{notice}</div>}
    <div className="recipe-steps"><div className="recipe-steps-head"><div><p className="eyebrow">{c.stepByStep}</p><h3>{c.method}</h3></div><span>👥 {servings}</span></div><p className="recipe-method-intro">{c.methodIntro}</p><ol className="recipe-step-list">{selected.steps[language].map((s,i)=><li key={i}><span className="step-number">{i+1}</span><div><strong>{c.stepLabel} {i+1}</strong><p>{s}</p></div></li>)}</ol></div>
   </div></section></div></OverlayPortal>}

   {addConfirmMode&&<OverlayPortal><div className="modal-backdrop v127-add-shopping-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target&&!busy)setAddConfirmMode(null)}}><section className="focus-dialog v127-add-shopping-confirm" role="dialog" aria-modal="true" aria-label={c.confirmAddTitle}><header className="focus-dialog-titlebar"><div><p className="eyebrow">RECIPE SHOPPING</p><h2>{c.confirmAddTitle}</h2><small>{c.confirmAddCopy}</small></div><button className="icon-btn" data-dialog-close="true" disabled={busy} onClick={()=>setAddConfirmMode(null)}>×</button></header><div className="focus-dialog-scroll"><div className="v127-add-shopping-summary"><div><small>{c.shoppingIngredients}</small><strong>{chosenRowsForMode(addConfirmMode).length}</strong></div><div><small>{c.destination}</small><strong>{activeList?.title||'Recipe shopping'}</strong></div></div><div className="v127-add-shopping-preview">{chosenRowsForMode(addConfirmMode).slice(0,8).map(row=><span key={row.name}><b>{ingName(row.name)}</b><small>{fmt(addConfirmMode==='shortage'?row.shortage:row.required)} {row.unit}</small></span>)}{chosenRowsForMode(addConfirmMode).length>8?<em>+{chosenRowsForMode(addConfirmMode).length-8} more</em>:null}</div></div><footer className="focus-dialog-actions"><button className="secondary" disabled={busy} onClick={()=>setAddConfirmMode(null)}>{c.cancel}</button><button className="primary" disabled={busy} onClick={()=>void add(addConfirmMode)}>{busy?'Adding…':c.confirmAddButton}</button></footer></section></div></OverlayPortal>}

   {cookReviewOpen&&<OverlayPortal><div className="modal-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target&&!cookBusy)setCookReviewOpen(false)}}><section className="focus-dialog meal-consumption-modal-v96" role="dialog" aria-modal="true" aria-label="Review ingredients used"><header className="focus-dialog-titlebar"><div><p className="eyebrow">HOUSEHOLD TRUTH · REVIEW FIRST</p><h2>What did this meal actually use?</h2><small>GHM estimated these amounts from the recipe. Edit or uncheck anything that was not actually used.</small></div><button className="icon-btn" data-dialog-close="true" disabled={cookBusy} onClick={()=>setCookReviewOpen(false)}>×</button></header><div className="focus-dialog-scroll"><div className="meal-consumption-trust-v96"><span>✓ Only confirmed items change</span><span>⏱ Updates the household forecast</span><span>🛡 Expired items are never consumed here</span></div><div className="meal-consumption-list-v96">{cookItems.map((item,index)=><label key={item.productId} className={`meal-consumption-row-v96 ${item.selected?'selected':''}`}><input type="checkbox" checked={item.selected} onChange={e=>setCookItems(current=>current.map((value,i)=>i===index?{...value,selected:e.target.checked}:value))}/><span className="meal-consumption-product-v96"><strong>{item.name}</strong><small>Recipe: {fmt(item.recipeAmount)} {item.recipeUnit}{item.optional?' · optional':''} · In stock: {fmt(item.available)} {item.unit}</small></span><span className="meal-consumption-amount-v96"><input aria-label={`Amount of ${item.name} used`} type="number" min="0" max={item.available} step="0.01" disabled={!item.selected} value={Number(fmt(item.amount))} onChange={e=>{const next=Math.min(item.available,Math.max(0,Number(e.target.value)||0));setCookItems(current=>current.map((value,i)=>i===index?{...value,amount:next}:value))}}/><small>{item.unit}</small></span></label>)}</div><p className="small-muted">If an ingredient came from somewhere else or the inventory was already inaccurate, uncheck it. This confirmation teaches GHM without pretending a recipe automatically proves what was consumed.</p>{cookError&&<div className="error">{cookError}</div>}</div><footer className="focus-dialog-actions"><button className="secondary" disabled={cookBusy} onClick={()=>setCookReviewOpen(false)}>Cancel</button><button className="primary" disabled={cookBusy||!cookItems.some(item=>item.selected&&item.amount>0)} onClick={confirmCookedMeal}>{cookBusy?'Updating home…':'Confirm & update inventory'}</button></footer></section></div></OverlayPortal>}

   {editorOpen&&<OverlayPortal><div className="modal-backdrop recipe-editor-backdrop-v89" onMouseDown={e=>{if(e.currentTarget===e.target&&!editorBusy)setEditorOpen(false)}}><section className="focus-dialog recipe-editor-modal-v89" role="dialog" aria-modal="true" aria-label={editingRecipe?'Edit recipe':'Create recipe'}><header className="focus-dialog-titlebar"><div><p className="eyebrow">{editingRecipe?'EDIT YOUR RECIPE':'CREATE YOUR RECIPE'}</p><h2>{editingRecipe?'Update recipe':'Add a family recipe'}</h2><small>Ingredients and quantities can be compared with inventory after you save.</small></div><button className="icon-btn" data-dialog-close="true" disabled={editorBusy} onClick={()=>setEditorOpen(false)}>×</button></header><div className="focus-dialog-scroll recipe-editor-scroll-v89">
     <section className="recipe-editor-section-v89 recipe-editor-basics-v89"><div className="recipe-editor-image-v89"><div className="recipe-editor-preview-v89">{editorImagePreview||(!editorRemoveImage&&editorExistingImage)?<img src={editorImagePreview||recipeMediaUrl(editorExistingImage)} alt="Recipe preview"/>:<span>🍲<small>Add a dish photo</small></span>}</div><label className="secondary recipe-image-picker-v89">Choose image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{setEditorImage(e.target.files?.[0]||null);setEditorRemoveImage(false)}}/></label>{editorExistingImage&&!editorRemoveImage&&<button className="ghost danger-ghost-v89" onClick={()=>{setEditorRemoveImage(true);setEditorImage(null)}}>Remove image</button>}<small>JPG, PNG or WebP • up to 6 MB</small></div><div className="recipe-editor-fields-v89"><label>Recipe name<input value={editorName} onChange={e=>setEditorName(e.target.value)} placeholder="e.g. Mom's Gujarati Khichdi"/></label><div className="form-grid two"><label>Base servings<input type="number" min="1" max="100" value={editorBaseServings} onChange={e=>setEditorBaseServings(Math.max(1,Number(e.target.value)||1))}/></label><label>Meal type<select value={editorKind} onChange={e=>setEditorKind(e.target.value as MealKind)}><option value="proper">Proper meal</option><option value="light">Light munching</option><option value="breakfast">Breakfast</option><option value="dessert">Dessert</option><option value="drink">Drinks</option></select></label></div><label>Cuisine<select value={editorCuisine} onChange={e=>setEditorCuisine(e.target.value as Cuisine)}>{cuisineOptions.map(x=><option key={x} value={x}>{x}</option>)}</select></label></div></section>
     <section className="recipe-editor-section-v89"><div className="recipe-editor-section-head-v89"><div><strong>Recipe categories</strong><small>Add diet, faith, cuisine and any helpful labels. These make community recipes easier to discover.</small></div></div><div className="category-chip-grid-v89">{(['jain','swaminarayan','veg','vegan','nonveg'] as Diet[]).map(d=><button key={d} className={editorDiets.includes(d)?'selected':''} onClick={()=>toggleDiet(d)}>{dietCategoryLabels[d]}</button>)}{categoryPresets.filter(x=>!Object.values(dietCategoryLabels).includes(x)).map(tag=><button key={tag} className={editorCategories.some(x=>x.toLowerCase()===tag.toLowerCase())?'selected':''} onClick={()=>toggleCategory(tag)}>{tag}</button>)}</div><div className="custom-category-add-v89"><input value={editorCategoryInput} onChange={e=>setEditorCategoryInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addCustomCategory()}}} placeholder="Add another category"/><button className="secondary" onClick={addCustomCategory}>Add</button></div>{editorCategories.length>0&&<div className="community-card-tags-v89 selected-category-list-v89">{editorCategories.map(tag=><em key={tag}>{tag}<button aria-label={`Remove ${tag}`} onClick={()=>toggleCategory(tag)}>×</button></em>)}</div>}</section>
     <section className="recipe-editor-section-v89"><div className="recipe-editor-section-head-v89"><div><strong>Ingredients</strong><small>Enter the amount for the base serving count above.</small></div><button className="secondary" onClick={()=>setEditorIngredients(a=>[...a,{name:'',qty:1,unit:'g'}])}>＋ Add ingredient</button></div><div className="recipe-editor-ingredients-v89">{editorIngredients.map((x,i)=><div className="recipe-editor-ingredient-row-v89" key={i}><input aria-label="Ingredient name" placeholder="Ingredient" value={x.name} onChange={e=>setEditorIngredients(a=>a.map((v,j)=>j===i?{...v,name:e.target.value}:v))}/><input aria-label="Quantity" type="number" min="0.01" step="0.01" value={x.qty} onChange={e=>setEditorIngredients(a=>a.map((v,j)=>j===i?{...v,qty:Number(e.target.value)}:v))}/><select aria-label="Unit" value={x.unit} onChange={e=>setEditorIngredients(a=>a.map((v,j)=>j===i?{...v,unit:e.target.value}:v))}><option>g</option><option>kg</option><option>ml</option><option>l</option><option>pcs</option><option>tbsp</option><option>tsp</option><option>cup</option></select><label className="optional-check-v89"><input type="checkbox" checked={Boolean(x.optional)} onChange={e=>setEditorIngredients(a=>a.map((v,j)=>j===i?{...v,optional:e.target.checked}:v))}/> Optional</label><button className="icon-btn" aria-label="Remove ingredient" disabled={editorIngredients.length===1} onClick={()=>setEditorIngredients(a=>a.filter((_,j)=>j!==i))}>×</button></div>)}</div></section>
     <section className="recipe-editor-section-v89"><div className="recipe-editor-section-head-v89"><div><strong>Cooking method</strong><small>Write clear steps in order so another user can actually cook the dish.</small></div><button className="secondary" onClick={()=>setEditorSteps(a=>[...a,''])}>＋ Add step</button></div><div className="recipe-editor-steps-v89">{editorSteps.map((step,i)=><div key={i}><span>{i+1}</span><textarea rows={2} value={step} onChange={e=>setEditorSteps(a=>a.map((v,j)=>j===i?e.target.value:v))} placeholder={`Step ${i+1}`}/><button className="icon-btn" aria-label="Remove step" disabled={editorSteps.length===1} onClick={()=>setEditorSteps(a=>a.filter((_,j)=>j!==i))}>×</button></div>)}</div></section>
     <section className={`recipe-share-panel-v89 ${editorShared?'is-shared':''}`}><div><span>{editorShared?'🌎':'🔒'}</span><div><strong>{editorShared?'Shared with the community':'Keep this recipe private'}</strong><small>{editorShared?'Other Grocery House Manager users can discover this recipe and will see your name as the creator.':'Only you can see this recipe. You can share it later from My recipes.'}</small></div></div><label className="share-switch-v89"><input type="checkbox" checked={editorShared} onChange={e=>setEditorShared(e.target.checked)}/><span/></label></section>
     {editorError&&<div className="error form-message">{editorError}</div>}
   </div><footer className="focus-dialog-actions recipe-editor-actions-v89"><button className="secondary" disabled={editorBusy} onClick={()=>setEditorOpen(false)}>Cancel</button><button className="primary" disabled={editorBusy} onClick={saveRecipe}>{editorBusy?'Saving recipe…':editingRecipe?'Save changes':'Create recipe'}</button></footer></section></div></OverlayPortal>}

   <section className="panel external-recipe-discovery meal-discovery-v84"><div className="panel-title-row"><div><p className="eyebrow">MORE MEAL IDEAS</p><h2>Discover more recipes</h2><p>Search TheMealDB by dish name. Results include the original image, ingredient measurements and detailed method returned by the recipe source.</p></div><span className="badge provider-badge">Powered by TheMealDB</span></div><div className="external-recipe-search"><input value={externalQ} onChange={e=>setExternalQ(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')searchExternal()}} placeholder="Search pasta, paneer, chicken, soup..."/><button className="primary external-recipe-search-button-v124" disabled={externalBusy||externalQ.trim().length<2} onClick={searchExternal}>{externalBusy?'Searching...':'Search recipes'}</button></div>{externalError&&<div className="hint">{externalError}</div>}{externalSearched&&!externalBusy&&!externalError&&<div className="external-search-summary"><strong>{externalMeals.length}</strong><span>recipes found for “{externalQ.trim()}”</span></div>}{externalSearched&&!externalBusy&&!externalError&&externalMeals.length===0&&<div className="empty-state compact">No recipes found. Try a different dish name.</div>}{externalMeals.length>0&&<div className="external-recipe-grid v135-recipe-showcase-grid">{externalMeals.map(meal=><button key={meal.id} className="external-recipe-card v135-external-recipe-card" onClick={()=>openExternal(meal)}><span className="v135-recipe-image-wrap"><img src={meal.image||'/recipe-images-real/cuisine/international.webp'} alt={meal.name} loading="lazy"/><i>TheMealDB</i></span><span className="recipe-image-copy v135-recipe-copy"><small>{meal.area||meal.country||'International'} · {meal.category||'Meal'}</small><strong>{meal.name}</strong>{meal.tags?.length?<span className="external-mini-tags">{meal.tags.slice(0,3).map(tag=><i key={tag}>{tag}</i>)}</span>:null}<b>View details →</b></span></button>)}</div>}</section>
   {externalSelected && <OverlayPortal><div className="modal-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target&&!externalSaving)setExternalSelected(null)}}><section className="modal focus-dialog external-recipe-modal v136-external-dialog" role="dialog" aria-modal="true" aria-label={externalSelected.name}>
     <header className="focus-dialog-titlebar"><div><p className="eyebrow">THEMEALDB RECIPE</p><h2>{externalSelected.name}</h2><small>{externalSelected.area||'International'} · {externalSelected.category||'Meal'}</small></div><button type="button" data-dialog-close="true" className="icon-btn" disabled={externalSaving} onClick={()=>setExternalSelected(null)}>×</button></header>
     <div className="focus-dialog-scroll v136-external-body"><img className="recipe-detail-image" src={externalSelected.image||'/recipe-images-real/cuisine/international.webp'} alt={externalSelected.name}/><div className="diet-chips"><span>{externalSelected.area||'International'}</span><span>{externalSelected.category||'Meal'}</span>{(externalSelected.tags||[]).slice(0,4).map(tag=><span key={tag}>{tag}</span>)}</div>
       <div className="v136-external-section-head"><div><h3>Ingredients & shopping</h3><p>Review quantities before adding. Exact grams, kilograms, millilitres, litres and pieces are recognized; cooking measures must be entered manually.</p></div><button type="button" className="secondary" onClick={()=>setExternalSelection(Object.fromEntries(externalSelected.ingredients.map((x,i)=>[i,!isManualOnlyIngredient(x.name)])))}>Select ingredients</button></div>
       <div className="v136-external-ingredients">{externalSelected.ingredients.map((ingredient,i)=>{const parsed=parseExternalMeasure(ingredient.measure);const quantity=externalValues[i]?.quantity??parsed.quantity;const unit=externalValues[i]?.unit||'pcs';const owned=matchProduct(ingredient.name,products);return <label key={`${ingredient.name}-${i}`} className="v136-external-ingredient"><input type="checkbox" checked={!!externalSelection[i]} onChange={e=>setExternalSelection(curr=>({...curr,[i]:e.target.checked}))}/><div className="v136-external-ingredient-name"><strong>{ingredient.name}</strong><small>Recipe: {ingredient.measure||'As needed'} · {owned?`Inventory: ${fmt(owned.quantity)} ${owned.unit}`:'Not in inventory'}</small>{!parsed.precise&&<em>Confirm purchase quantity and unit</em>}</div><div className="v136-external-ingredient-qty"><input aria-label={`Shopping quantity for ${ingredient.name}`} type="number" min="0.001" step="any" value={quantity} onChange={e=>setExternalValues(curr=>({...curr,[i]:{quantity:Number(e.target.value),unit}}))}/><select aria-label={`Shopping unit for ${ingredient.name}`} value={unit} onChange={e=>setExternalValues(curr=>({...curr,[i]:{quantity,unit:e.target.value}}))}>{['pcs','g','kg','ml','l'].map(u=><option key={u} value={u}>{u}</option>)}</select></div></label>})}</div>
       <h3>Step-by-step method</h3><ol className="recipe-step-list">{externalSelected.instructions.map((step,i)=><li key={i}><span className="step-number">{i+1}</span><div><p>{step}</p></div></li>)}</ol>
       {(externalSelected.source_url||externalSelected.youtube_url)&&<div className="external-source-actions">{externalSelected.source_url&&<a className="button secondary" href={externalSelected.source_url} target="_blank" rel="noreferrer">Original source ↗</a>}{externalSelected.youtube_url&&<a className="button ghost" href={externalSelected.youtube_url} target="_blank" rel="noreferrer">Cooking video ↗</a>}</div>}
       {externalNotice&&<div className="hint" role="status">{externalNotice}</div>}
     </div>
     <footer className="focus-dialog-actions v136-external-actions"><button type="button" className="secondary" onClick={()=>void shareExternal()}>💬 Share in House Chat</button><button type="button" className="secondary" onClick={()=>{setExternalMode('missing');setExternalConfirm(true)}} disabled={externalSaving}>🛒 Add exact shortages</button><button type="button" className="secondary" onClick={()=>{setExternalMode('full');setExternalConfirm(true)}} disabled={externalSaving}>＋ Full recipe</button><button type="button" className="primary" onClick={()=>{setExternalMode('selected');setExternalConfirm(true)}} disabled={externalSaving||!externalSelected.ingredients.some((_,i)=>externalSelection[i])}>☑ Selected</button></footer>
     {externalConfirm&&<div className="v136-confirm-layer"><div className="v136-confirm-card" role="alertdialog" aria-modal="true" aria-label="Confirm shopping ingredients"><h3>{externalMode==='missing'?'Add exact shortages?':externalMode==='full'?'Add full recipe?':'Add selected ingredients?'}</h3><p>{externalMode==='missing'?'Only supported exact quantities will be compared with inventory. Ingredients in cups/spoons or unmatched units are skipped; adjust those yourself.':externalMode==='full'?'Every non-water ingredient will be added. TheMealDB cooking measures can be approximate—please review the quantities shown above before confirming.':'Only the ingredients you checked above will be added.'} Destination: {activeList?.title||'Recipe shopping'}.</p><div className="focus-dialog-actions"><button type="button" className="secondary" disabled={externalSaving} onClick={()=>setExternalConfirm(false)}>Cancel</button><button type="button" className="primary" disabled={externalSaving||externalSelected.ingredients.some((_,i)=>(externalMode==='full'||externalMode==='selected'&&externalSelection[i])&&(!(Number(externalValues[i]?.quantity||0)>0)||!Number.isFinite(externalValues[i]?.quantity)))} onClick={()=>void addExternalIngredients()}>{externalSaving?'Adding…':'Confirm & add'}</button></div></div></div>}
   </section></div></OverlayPortal>}
 </main>;
}
