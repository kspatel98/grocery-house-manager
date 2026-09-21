import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import type { Product, ShoppingList } from '../types';
import { ingredientNames, recipes, type Diet, type MealKind, type Cuisine, type Recipe, type RecipeIngredient } from '../recipes';
import { useLanguage } from '../i18n';
import HouseContextSwitcher from '../components/HouseContextSwitcher';
import OverlayPortal from '../components/OverlayPortal';

type Row=RecipeIngredient & {required:number; owned:number; shortage:number; matched?:Product; selected:boolean; autoShop:boolean};
type ExternalMeal={
 id:string; name:string; alternate_name?:string|null; image?:string|null; category?:string|null; area?:string|null; country?:string|null; tags?:string[];
 ingredients:{name:string;measure:string}[]; instructions:string[]; source_url?:string|null; youtube_url?:string|null; date_modified?:string|null; provider:string;
};
const copy={
 en:{title:'Meals & Recipes',sub:'Choose a dish, compare every required quantity with your house inventory, and send exactly what you need to the grocery list.',search:'Search dishes',proper:'Proper meal',light:'Light munching',breakfast:'Breakfast',dessert:'Dessert',drink:'Drinks',all:'All',servings:'Servings',ingredients:'Ingredients',inventory:'Inventory',required:'Required',shortage:'Need',enough:'Enough',addShort:'Add only missing quantities',addAll:'Add all recipe quantities',manual:'Add checked ingredients',custom:'Add your own dish',dish:'Dish name',addIngredient:'Add ingredient',saveCard:'Create dish card',canMake:'Can make now',almost:'Almost ready',missing:'Missing',browse:'Cook from what you own',noMatch:'No dishes match these filters.',added:'Added to grocery list',diet:'Diet',full:'Full recipe',short:'Shortage',remove:'Remove',manualOnly:'Manual only',optional:'Optional',method:'Detailed recipe',methodIntro:'Follow the steps in order. Ingredient quantities above automatically reflect your selected serving count.',shortHelp:'Recommended: adds only the quantity your inventory is short of. Water and optional ingredients are skipped.',manualHelp:'Adds only the rows you check. You can edit the quantity first. This is also how you intentionally add water.',fullHelp:'Adds the complete required recipe quantities, ignoring what is already in inventory. Water and optional ingredients are skipped.',waterHelp:'Household water is not auto-added to groceries. Check it manually if you actually need to buy water.',noAutoItems:'Nothing needs to be added automatically.',selectOne:'Select at least one ingredient first.',cuisine:'Cuisine',mealType:'Meal type',recipesWord:'recipes',openRecipe:'Open recipe'},
 gu:{title:'ભોજન અને રેસીપી',sub:'વાનગી પસંદ કરો, જરૂરી દરેક માત્રાની ઘરની ઇન્વેન્ટરી સાથે સરખામણી કરો અને ખરીદી યાદીમાં ખરેખર જેટલું જોઈએ એટલું જ ઉમેરો.',search:'વાનગી શોધો',proper:'પૂરું ભોજન',light:'હળવો નાસ્તો',breakfast:'નાસ્તો',dessert:'મીઠાઈ',drink:'પીણાં',all:'બધું',servings:'વ્યક્તિઓ',ingredients:'સામગ્રી',inventory:'ઇન્વેન્ટરી',required:'જરૂરી',shortage:'જોઈએ',enough:'પૂરતું છે',addShort:'ફક્ત ઓછી માત્રા ઉમેરો',addAll:'રેસીપીની સંપૂર્ણ માત્રા ઉમેરો',manual:'પસંદ કરેલી સામગ્રી ઉમેરો',custom:'તમારી વાનગી ઉમેરો',dish:'વાનગીનું નામ',addIngredient:'સામગ્રી ઉમેરો',saveCard:'વાનગી કાર્ડ બનાવો',canMake:'હમણાં બનાવી શકો',almost:'લગભગ તૈયાર',missing:'ઓછું છે',browse:'ઘરમાંથી શું બનાવી શકો',noMatch:'આ ફિલ્ટરમાં કોઈ વાનગી મળી નથી.',added:'ખરીદી યાદીમાં ઉમેરાયું',diet:'પ્રકાર',full:'સંપૂર્ણ માત્રા',short:'ઓછી માત્રા',remove:'કાઢો',manualOnly:'ફક્ત હાથેથી',optional:'વૈકલ્પિક',method:'વિગતવાર રેસીપી',methodIntro:'પગલાં ક્રમમાં અનુસરો. ઉપરની સામગ્રીની માત્રા પસંદ કરેલા વ્યક્તિઓ પ્રમાણે આપમેળે બદલાય છે.',shortHelp:'ભલામણ: ઇન્વેન્ટરીમાં જેટલી ઓછી છે એટલી જ માત્રા ઉમેરે છે. પાણી અને વૈકલ્પિક સામગ્રી આપમેળે ઉમેરાતી નથી.',manualHelp:'ફક્ત તમે ટિક કરેલી સામગ્રી ઉમેરે છે. પહેલા માત્રા બદલી શકો છો. પાણી ઉમેરવું હોય તો આ વિકલ્પ વાપરો.',fullHelp:'ઇન્વેન્ટરીને અવગણીને રેસીપી માટેની સંપૂર્ણ જરૂરી માત્રા ઉમેરે છે. પાણી અને વૈકલ્પિક સામગ્રી છોડે છે.',waterHelp:'ઘરનું પાણી ખરીદી યાદીમાં આપમેળે ઉમેરાતું નથી. ખરેખર પાણી ખરીદવું હોય તો તેને હાથેથી પસંદ કરો.',noAutoItems:'આપમેળે ઉમેરવા માટે કશું બાકી નથી.',selectOne:'પહેલા ઓછામાં ઓછી એક સામગ્રી પસંદ કરો.',cuisine:'પ્રદેશ / રસોઈ',mealType:'ભોજન પ્રકાર',recipesWord:'રેસીપી',openRecipe:'રેસીપી ખોલો'},
 hi:{title:'भोजन और रेसिपी',sub:'व्यंजन चुनें, हर आवश्यक मात्रा की घर की इन्वेंटरी से तुलना करें और खरीदारी सूची में केवल उतनी मात्रा जोड़ें जितनी वास्तव में चाहिए।',search:'व्यंजन खोजें',proper:'पूरा भोजन',light:'हल्का नाश्ता',breakfast:'नाश्ता',dessert:'मिठाई',drink:'पेय',all:'सभी',servings:'लोग',ingredients:'सामग्री',inventory:'इन्वेंटरी',required:'आवश्यक',shortage:'चाहिए',enough:'पर्याप्त',addShort:'केवल कमी की मात्रा जोड़ें',addAll:'पूरी रेसिपी की मात्रा जोड़ें',manual:'चुनी हुई सामग्री जोड़ें',custom:'अपना व्यंजन जोड़ें',dish:'व्यंजन का नाम',addIngredient:'सामग्री जोड़ें',saveCard:'डिश कार्ड बनाएं',canMake:'अभी बना सकते हैं',almost:'लगभग तैयार',missing:'कमी',browse:'घर की सामग्री से बनाएं',noMatch:'कोई व्यंजन नहीं मिला।',added:'खरीदारी सूची में जोड़ा गया',diet:'प्रकार',full:'पूरी मात्रा',short:'कमी',remove:'हटाएं',manualOnly:'केवल मैन्युअल',optional:'वैकल्पिक',method:'विस्तृत रेसिपी',methodIntro:'हर चरण क्रम से करें। ऊपर की मात्रा चुने गए सर्विंग्स के अनुसार अपने आप बदलती है।',shortHelp:'सुझावित: इन्वेंटरी में जितनी कमी है केवल उतनी मात्रा जोड़ता है। पानी और वैकल्पिक सामग्री अपने आप नहीं जुड़ती।',manualHelp:'केवल टिक की गई सामग्री जोड़ता है। पहले मात्रा बदल सकते हैं। पानी जानबूझकर जोड़ने के लिए भी यही विकल्प है।',fullHelp:'इन्वेंटरी को नजरअंदाज करके पूरी आवश्यक रेसिपी मात्रा जोड़ता है। पानी और वैकल्पिक सामग्री छोड़ दी जाती है।',waterHelp:'घर का पानी खरीदारी सूची में अपने आप नहीं जोड़ा जाता। यदि बोतलबंद/खरीदने वाला पानी चाहिए तो उसे मैन्युअली चुनें।',noAutoItems:'अपने आप जोड़ने के लिए कुछ बाकी नहीं है।',selectOne:'पहले कम से कम एक सामग्री चुनें।',cuisine:'क्षेत्र / व्यंजन',mealType:'भोजन प्रकार',recipesWord:'रेसिपी',openRecipe:'रेसिपी खोलें'},
 fr:{title:'Repas et recettes',sub:'Choisissez un plat, comparez chaque quantité requise avec le stock de la maison et ajoutez uniquement ce qu’il faut réellement acheter.',search:'Rechercher un plat',proper:'Repas complet',light:'Collation légère',breakfast:'Petit-déjeuner',dessert:'Dessert',drink:'Boissons',all:'Tous',servings:'Portions',ingredients:'Ingrédients',inventory:'Inventaire',required:'Requis',shortage:'Manque',enough:'Suffisant',addShort:'Ajouter seulement les quantités manquantes',addAll:'Ajouter les quantités complètes de la recette',manual:'Ajouter les ingrédients cochés',custom:'Ajouter votre plat',dish:'Nom du plat',addIngredient:'Ajouter un ingrédient',saveCard:'Créer la fiche',canMake:'Prêt à cuisiner',almost:'Presque prêt',missing:'Manque',browse:'Cuisiner avec votre stock',noMatch:'Aucun plat ne correspond.',added:'Ajouté à la liste de courses',diet:'Régime',full:'Recette complète',short:'Manque',remove:'Retirer',manualOnly:'Manuel seulement',optional:'Facultatif',method:'Recette détaillée',methodIntro:'Suivez les étapes dans l’ordre. Les quantités ci-dessus s’ajustent automatiquement au nombre de portions choisi.',shortHelp:'Recommandé : ajoute uniquement la quantité réellement manquante. L’eau et les ingrédients facultatifs sont ignorés.',manualHelp:'Ajoute uniquement les lignes cochées. Vous pouvez modifier la quantité avant l’ajout. Utilisez aussi ce mode pour ajouter volontairement de l’eau.',fullHelp:'Ajoute les quantités complètes nécessaires à la recette sans tenir compte du stock. L’eau et les ingrédients facultatifs sont ignorés.',waterHelp:'L’eau domestique n’est jamais ajoutée automatiquement. Cochez-la manuellement seulement si vous devez réellement en acheter.',noAutoItems:'Rien ne doit être ajouté automatiquement.',selectOne:'Sélectionnez d’abord au moins un ingrédient.',cuisine:'Cuisine',mealType:'Type de repas',recipesWord:'recettes',openRecipe:'Ouvrir la recette'}
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
 const exact=products.find(p=>variants.includes(norm(p.name)));
 if(exact)return exact;
 let best:Product|undefined; let bestScore=0;
 for(const product of products){
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
 const [manual,setManual]=useState<Record<string,boolean>>({});
 const [qtyOverrides,setQtyOverrides]=useState<Record<string,number>>({});
 const [detailOpen,setDetailOpen]=useState(false);

 const [externalQ,setExternalQ]=useState('');
 const [externalMeals,setExternalMeals]=useState<ExternalMeal[]>([]);
 const [externalBusy,setExternalBusy]=useState(false);
 const [externalError,setExternalError]=useState('');
 const [externalSelected,setExternalSelected]=useState<ExternalMeal|null>(null);
 const [externalSearched,setExternalSearched]=useState(false);

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
 async function add(mode:'shortage'|'full'|'manual'){
   const chosen=rows.filter((r,i)=>mode==='manual'?!!manual[String(i)]:mode==='shortage'?(r.autoShop&&!r.optional&&r.shortage>0):(r.autoShop&&!r.optional));
   if(mode==='manual'&&!chosen.length){setNotice(c.selectOne);return;}
   const payload=chosen.map(r=>{
     const recipeQty=mode==='shortage'?r.shortage:r.required;
     const canUseInventoryUnit=!!r.matched&&compatible(r.matched.unit,r.unit);
     const targetUnit=canUseInventoryUnit?r.matched!.unit:r.unit;
     const targetQty=canUseInventoryUnit?normalizeQty(recipeQty,r.unit,targetUnit):recipeQty;
     const tagPrefix=mode==='shortage'?'Recipe shortage':mode==='manual'?'Recipe selected':'Full recipe quantity';
     return {name:canUseInventoryUnit?r.matched!.name:r.name,quantity:targetQty,unit:targetUnit,tag:`${tagPrefix} · ${selected.names.en} · ${fmt(recipeQty)} ${r.unit}`};
   }).filter(x=>x.quantity>0);
   if(!payload.length){setNotice(c.noAutoItems);return;}
   setBusy(true);setNotice('');
   try{const {data}=await api.post(`/insights/houses/${id}/recipes/add-shopping`,{ingredients:payload,list_id:activeList?.id||null,recipe_name:selected.names.en,mode});setNotice(`${c.added}: ${data.list_title}`);await refreshMealData();if(mode==='manual')setManual({});}
   catch(e:any){setNotice(e?.response?.data?.detail||'Could not add ingredients.');}
   finally{setBusy(false);}
 }
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

 function openBuiltIn(recipe:Recipe){setSelected(recipe);setSelectedCommunity(null);setDetailOpen(true);setNotice('');}
 function openCommunity(item:CommunityRecipe){setSelected(communityAsRecipe(item));setSelectedCommunity(item);setDetailOpen(true);setNotice('');}
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
   <section className="meals-hero"><div><p className="eyebrow">SMART MEAL PLANNER</p><h1>{c.title}</h1><p>{c.sub}</p></div><div className="serving-box"><span>👥 {c.servings}</span><input type="number" min="1" max="100" value={servings} onChange={e=>setServings(Math.max(1,Number(e.target.value)||1))}/></div></section>
   <HouseContextSwitcher currentHouseId={id} section="meals" />
   <section className="panel meal-controls meal-controls-v84"><label className="meal-search-control"><span>🔎</span><input placeholder={c.search} value={q} onChange={e=>setQ(e.target.value)}/></label><select aria-label="Meal type" value={kind} onChange={e=>setKind(e.target.value as 'all'|MealKind)}><option value="all">{c.mealType}: {c.all}</option><option value="proper">{c.proper}</option><option value="light">{c.light}</option><option value="breakfast">{c.breakfast}</option><option value="dessert">{c.dessert}</option><option value="drink">{c.drink}</option></select><select aria-label="Diet" value={diet} onChange={e=>setDiet(e.target.value as 'all'|Diet)}><option value="all">{c.diet}: {c.all}</option><option value="jain">Jain</option><option value="swaminarayan">Swaminarayan (no onion/garlic)</option><option value="veg">Veg</option><option value="vegan">Vegan</option><option value="nonveg">Non-veg</option></select></section>
   <section className="meal-cuisine-strip panel" aria-label={c.cuisine}><div className="meal-cuisine-heading"><span>🍽️</span><div><small>{c.cuisine}</small><strong>{cuisine==='all'?c.all:cuisineLabel(cuisine)}</strong></div></div><div className="meal-cuisine-pills"><button className={cuisine==='all'?'active':''} onClick={()=>setCuisine('all')}>✨ {c.all}</button>{cuisineOptions.map(x=><button key={x} className={cuisine===x?'active':''} onClick={()=>setCuisine(x)}><span>{x==='Gujarati'?'🥗':x==='Punjabi'?'🫓':x==='South Indian'?'🥥':x==='Maharashtrian'?'🌶️':x==='Rajasthani'?'🏜️':x==='North Indian'?'🍛':'🌍'}</span>{cuisineLabel(x)}</button>)}</div></section>

   <section className="meal-library panel"><div className="panel-title-row"><div><p className="eyebrow">COOK FROM HOME</p><h2>{c.browse}</h2></div><span className="badge">{filtered.length} {c.recipesWord}</span></div><div className="recipe-image-grid">{filtered.map(r=>{const a=availability(r);return <button className={`recipe-image-tile ${r.image?.includes('/recipe-images-real/')?'has-photo':'has-illustration'}`} key={r.id} onClick={()=>openBuiltIn(r)}><SmartRecipeImage recipe={r}/><span className="recipe-image-copy"><small>{cuisineLabel((r.cuisine||'International') as Cuisine)} · {kindLabel(r.kind)}</small><strong>{r.names[language]}</strong><em className={a===1?'ready':a>.5?'almost':'missing'}>{a===1?'✓ '+c.canMake:a>.5?'◐ '+c.almost:`${Math.round(a*100)}% inventory`}</em></span><i>{c.openRecipe} →</i></button>})}</div>{!filtered.length&&<p>{c.noMatch}</p>}</section>

   <section className="panel community-recipes-v89">
     <div className="panel-title-row community-title-v89"><div><p className="eyebrow">COMMUNITY KITCHEN</p><h2>Community recipes</h2><p>Discover recipes shared by Grocery House Manager users. Every card shows who created it and the categories they chose.</p></div><span className="badge">{communityRecipes.length} shared</span></div>
     <div className="community-toolbar-v89"><label><span>🔎</span><input value={communityQ} onChange={e=>setCommunityQ(e.target.value)} placeholder="Search community recipes or cooks" /></label><select value={communityCategory} onChange={e=>setCommunityCategory(e.target.value)}><option value="all">All categories</option>{communityCategories.map(x=><option key={x} value={x}>{x}</option>)}</select></div>
     {communityError&&<div className="error form-message">{communityError}</div>}
     {communityLoading?<div className="community-loading-v89">Loading community recipes…</div>:visibleCommunity.length?<div className="community-recipe-grid-v89">{visibleCommunity.map(item=><article className="community-recipe-card-v89" key={item.id}><button className="community-card-open-v89" onClick={()=>openCommunity(item)}><span className="community-image-wrap-v89"><img src={recipeMediaUrl(item.image_url)||'/recipe-images-real/cuisine/international.webp'} alt={item.name} loading="lazy"/><i>{item.is_shared?'Community':'Private'}</i></span><span className="community-card-copy-v89"><small>{item.cuisine} · {kindLabel(item.meal_kind)}</small><strong>{item.name}</strong><span className="recipe-uploader-v89">{item.uploader_avatar_url?<img src={item.uploader_avatar_url} alt=""/>:<b>{item.uploader_name.slice(0,1).toUpperCase()}</b>}<span>By {item.uploader_name}</span></span><span className="community-card-tags-v89">{(item.categories||[]).slice(0,4).map(tag=><em key={tag}>{tag}</em>)}</span><i>Open recipe →</i></span></button>{item.can_edit&&<div className="community-owner-actions-v89"><button className="secondary" onClick={()=>openEditEditor(item)}>✎ Edit</button><button className="ghost danger-ghost-v89" onClick={()=>deleteRecipe(item)}>Delete</button></div>}</article>)}</div>:<div className="empty-state compact">No community recipes match this search yet.</div>}
   </section>

   <section className="panel my-recipes-v89">
     <div className="panel-title-row"><div><p className="eyebrow">YOUR RECIPE BOX</p><h2>My recipes</h2><p>Create your own recipe once, use it with inventory anytime, and choose whether other users can discover it.</p></div><button className="primary create-recipe-button-v89" onClick={openCreateEditor}>＋ Create recipe</button></div>
     {legacyRecipes.length>0&&<div className="legacy-recipe-import-v89"><div><strong>{legacyRecipes.length} older recipe{legacyRecipes.length===1?'':'s'} found on this browser</strong><small>Import them into your account so you can edit, share and use them on any device.</small></div><button className="secondary" disabled={legacyImportBusy} onClick={importLegacy}>{legacyImportBusy?'Importing…':'Import old recipes'}</button></div>}
     {myRecipes.length?<div className="my-recipe-grid-v89">{myRecipes.map(item=><article key={item.id} className="my-recipe-card-v89"><button className="my-recipe-open-v89" onClick={()=>openCommunity(item)}><img src={recipeMediaUrl(item.image_url)||'/recipe-images-real/cuisine/international.webp'} alt={item.name}/><span><small>{item.cuisine}</small><strong>{item.name}</strong><span className="community-card-tags-v89">{(item.categories||[]).slice(0,3).map(tag=><em key={tag}>{tag}</em>)}</span></span></button><footer><span className={`share-status-v89 ${item.is_shared?'shared':'private'}`}>{item.is_shared?'● Shared with community':'● Private'}</span><div><button className="secondary" onClick={()=>toggleShare(item)}>{item.is_shared?'Make private':'Share'}</button><button className="secondary" onClick={()=>openEditEditor(item)}>Edit</button><button className="ghost danger-ghost-v89" onClick={()=>deleteRecipe(item)}>Delete</button></div></footer></article>)}</div>:!communityLoading&&<div className="empty-state compact">You have not created a recipe yet. Start with a family favourite and keep it private or share it with the community.</div>}
   </section>

   {detailOpen && <OverlayPortal><div className="modal-backdrop recipe-detail-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)setDetailOpen(false)}}><section className="recipe-card panel recipe-detail-modal focus-dialog" role="dialog" aria-modal="true" aria-label={selected.names[language]}><header className="focus-dialog-titlebar recipe-modal-title"><div><p className="eyebrow">{cuisineLabel((selected.cuisine||'International') as Cuisine).toUpperCase()} · {kindLabel(selected.kind).toUpperCase()}</p><h2>{selected.names[language]}</h2></div><button className="icon-btn" data-dialog-close="true" onClick={()=>setDetailOpen(false)} aria-label="Close recipe">×</button></header><div className="focus-dialog-scroll"><SmartRecipeImage recipe={selected} className="recipe-detail-image"/>{selectedCommunity&&<div className="recipe-community-meta-v89"><div className="recipe-uploader-v89">{selectedCommunity.uploader_avatar_url?<img src={selectedCommunity.uploader_avatar_url} alt=""/>:<b>{selectedCommunity.uploader_name.slice(0,1).toUpperCase()}</b>}<span><small>Recipe by</small><strong>{selectedCommunity.uploader_name}</strong></span></div><div className="community-card-tags-v89">{selectedCommunity.categories.map(tag=><em key={tag}>{tag}</em>)}</div>{selectedCommunity.can_edit&&<button className="secondary" onClick={()=>{setDetailOpen(false);openEditEditor(selectedCommunity)}}>✎ Edit my recipe</button>}</div>}<div className="recipe-card-head"><div><div className="diet-chips">{selected.diets.map(d=><span key={d}>{dietLabel(d)}</span>)}</div></div><div className="recipe-ready-score"><strong>{Math.round(availability(selected)*100)}%</strong><small>{c.inventory}</small></div></div>
    <div className="ingredient-table"><div className="ingredient-row head"><span></span><span>{c.ingredients}</span><span>{c.required}</span><span>{c.inventory}</span><span>{c.shortage}</span></div>{rows.map((row,i)=><div className={`ingredient-row ${row.shortage<=0?'covered':'needed'} ${!row.autoShop?'manual-only-row':''}`} key={`${row.name}-${i}`}><span><input aria-label={`${c.manual}: ${ingName(row.name)}`} type="checkbox" checked={!!manual[String(i)]} onChange={e=>setManual(m=>({...m,[String(i)]:e.target.checked}))}/></span><span><b>{ingName(row.name)}</b><span className="ingredient-badges">{row.optional&&<small>{c.optional}</small>}{!row.autoShop&&<small className="manual-only-badge">{c.manualOnly}</small>}</span></span><span className="required-edit"><input type="number" min="0" step="0.01" value={Number(fmt(row.required))} onChange={e=>setQtyOverrides(o=>({...o,[row.name]:Math.max(0,Number(e.target.value)||0)}))}/><small>{row.unit}</small></span><span>{row.matched&&compatible(row.matched.unit,row.unit)?`${fmt(row.owned)} ${row.unit}`:row.autoShop?'0 '+row.unit:'—'}</span><span>{!row.autoShop?<em className="manual-only-text">{c.manualOnly}</em>:row.shortage>0?<mark>+ {fmt(row.shortage)} {row.unit}</mark>:<em>✓ {c.enough}</em>}</span></div>)}</div>
    {rows.some(r=>!r.autoShop)&&<div className="water-smart-note">💧 {c.waterHelp}</div>}
    <div className="recipe-action-guide"><button disabled={busy} onClick={()=>add('shortage')}><span className="action-icon">🛒</span><span><strong>{c.addShort}</strong><small>{c.shortHelp}</small></span></button><button className="secondary" disabled={busy} onClick={()=>add('manual')}><span className="action-icon">☑</span><span><strong>{c.manual}</strong><small>{c.manualHelp}</small></span></button><button className="ghost" disabled={busy} onClick={()=>add('full')}><span className="action-icon">＋</span><span><strong>{c.addAll}</strong><small>{c.fullHelp}</small></span></button></div>{notice&&<div className="meal-notice">{notice}</div>}
    <div className="recipe-steps"><div className="recipe-steps-head"><div><p className="eyebrow">STEP BY STEP</p><h3>{c.method}</h3></div><span>👥 {servings}</span></div><p className="recipe-method-intro">{c.methodIntro}</p><ol className="recipe-step-list">{selected.steps[language].map((s,i)=><li key={i}><span className="step-number">{i+1}</span><div><strong>Step {i+1}</strong><p>{s}</p></div></li>)}</ol></div>
   </div></section></div></OverlayPortal>}

   {editorOpen&&<OverlayPortal><div className="modal-backdrop recipe-editor-backdrop-v89" onMouseDown={e=>{if(e.currentTarget===e.target&&!editorBusy)setEditorOpen(false)}}><section className="focus-dialog recipe-editor-modal-v89" role="dialog" aria-modal="true" aria-label={editingRecipe?'Edit recipe':'Create recipe'}><header className="focus-dialog-titlebar"><div><p className="eyebrow">{editingRecipe?'EDIT YOUR RECIPE':'CREATE YOUR RECIPE'}</p><h2>{editingRecipe?'Update recipe':'Add a family recipe'}</h2><small>Ingredients and quantities can be compared with inventory after you save.</small></div><button className="icon-btn" data-dialog-close="true" disabled={editorBusy} onClick={()=>setEditorOpen(false)}>×</button></header><div className="focus-dialog-scroll recipe-editor-scroll-v89">
     <section className="recipe-editor-section-v89 recipe-editor-basics-v89"><div className="recipe-editor-image-v89"><div className="recipe-editor-preview-v89">{editorImagePreview||(!editorRemoveImage&&editorExistingImage)?<img src={editorImagePreview||recipeMediaUrl(editorExistingImage)} alt="Recipe preview"/>:<span>🍲<small>Add a dish photo</small></span>}</div><label className="secondary recipe-image-picker-v89">Choose image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{setEditorImage(e.target.files?.[0]||null);setEditorRemoveImage(false)}}/></label>{editorExistingImage&&!editorRemoveImage&&<button className="ghost danger-ghost-v89" onClick={()=>{setEditorRemoveImage(true);setEditorImage(null)}}>Remove image</button>}<small>JPG, PNG or WebP • up to 6 MB</small></div><div className="recipe-editor-fields-v89"><label>Recipe name<input value={editorName} onChange={e=>setEditorName(e.target.value)} placeholder="e.g. Mom's Gujarati Khichdi"/></label><div className="form-grid two"><label>Base servings<input type="number" min="1" max="100" value={editorBaseServings} onChange={e=>setEditorBaseServings(Math.max(1,Number(e.target.value)||1))}/></label><label>Meal type<select value={editorKind} onChange={e=>setEditorKind(e.target.value as MealKind)}><option value="proper">Proper meal</option><option value="light">Light munching</option><option value="breakfast">Breakfast</option><option value="dessert">Dessert</option><option value="drink">Drinks</option></select></label></div><label>Cuisine<select value={editorCuisine} onChange={e=>setEditorCuisine(e.target.value as Cuisine)}>{cuisineOptions.map(x=><option key={x} value={x}>{x}</option>)}</select></label></div></section>
     <section className="recipe-editor-section-v89"><div className="recipe-editor-section-head-v89"><div><strong>Recipe categories</strong><small>Add diet, faith, cuisine and any helpful labels. These make community recipes easier to discover.</small></div></div><div className="category-chip-grid-v89">{(['jain','swaminarayan','veg','vegan','nonveg'] as Diet[]).map(d=><button key={d} className={editorDiets.includes(d)?'selected':''} onClick={()=>toggleDiet(d)}>{dietCategoryLabels[d]}</button>)}{categoryPresets.filter(x=>!Object.values(dietCategoryLabels).includes(x)).map(tag=><button key={tag} className={editorCategories.some(x=>x.toLowerCase()===tag.toLowerCase())?'selected':''} onClick={()=>toggleCategory(tag)}>{tag}</button>)}</div><div className="custom-category-add-v89"><input value={editorCategoryInput} onChange={e=>setEditorCategoryInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addCustomCategory()}}} placeholder="Add another category"/><button className="secondary" onClick={addCustomCategory}>Add</button></div>{editorCategories.length>0&&<div className="community-card-tags-v89 selected-category-list-v89">{editorCategories.map(tag=><em key={tag}>{tag}<button aria-label={`Remove ${tag}`} onClick={()=>toggleCategory(tag)}>×</button></em>)}</div>}</section>
     <section className="recipe-editor-section-v89"><div className="recipe-editor-section-head-v89"><div><strong>Ingredients</strong><small>Enter the amount for the base serving count above.</small></div><button className="secondary" onClick={()=>setEditorIngredients(a=>[...a,{name:'',qty:1,unit:'g'}])}>＋ Add ingredient</button></div><div className="recipe-editor-ingredients-v89">{editorIngredients.map((x,i)=><div className="recipe-editor-ingredient-row-v89" key={i}><input aria-label="Ingredient name" placeholder="Ingredient" value={x.name} onChange={e=>setEditorIngredients(a=>a.map((v,j)=>j===i?{...v,name:e.target.value}:v))}/><input aria-label="Quantity" type="number" min="0.01" step="0.01" value={x.qty} onChange={e=>setEditorIngredients(a=>a.map((v,j)=>j===i?{...v,qty:Number(e.target.value)}:v))}/><select aria-label="Unit" value={x.unit} onChange={e=>setEditorIngredients(a=>a.map((v,j)=>j===i?{...v,unit:e.target.value}:v))}><option>g</option><option>kg</option><option>ml</option><option>l</option><option>pcs</option><option>tbsp</option><option>tsp</option><option>cup</option></select><label className="optional-check-v89"><input type="checkbox" checked={Boolean(x.optional)} onChange={e=>setEditorIngredients(a=>a.map((v,j)=>j===i?{...v,optional:e.target.checked}:v))}/> Optional</label><button className="icon-btn" aria-label="Remove ingredient" disabled={editorIngredients.length===1} onClick={()=>setEditorIngredients(a=>a.filter((_,j)=>j!==i))}>×</button></div>)}</div></section>
     <section className="recipe-editor-section-v89"><div className="recipe-editor-section-head-v89"><div><strong>Cooking method</strong><small>Write clear steps in order so another user can actually cook the dish.</small></div><button className="secondary" onClick={()=>setEditorSteps(a=>[...a,''])}>＋ Add step</button></div><div className="recipe-editor-steps-v89">{editorSteps.map((step,i)=><div key={i}><span>{i+1}</span><textarea rows={2} value={step} onChange={e=>setEditorSteps(a=>a.map((v,j)=>j===i?e.target.value:v))} placeholder={`Step ${i+1}`}/><button className="icon-btn" aria-label="Remove step" disabled={editorSteps.length===1} onClick={()=>setEditorSteps(a=>a.filter((_,j)=>j!==i))}>×</button></div>)}</div></section>
     <section className={`recipe-share-panel-v89 ${editorShared?'is-shared':''}`}><div><span>{editorShared?'🌎':'🔒'}</span><div><strong>{editorShared?'Shared with the community':'Keep this recipe private'}</strong><small>{editorShared?'Other Grocery House Manager users can discover this recipe and will see your name as the creator.':'Only you can see this recipe. You can share it later from My recipes.'}</small></div></div><label className="share-switch-v89"><input type="checkbox" checked={editorShared} onChange={e=>setEditorShared(e.target.checked)}/><span/></label></section>
     {editorError&&<div className="error form-message">{editorError}</div>}
   </div><footer className="focus-dialog-actions recipe-editor-actions-v89"><button className="secondary" disabled={editorBusy} onClick={()=>setEditorOpen(false)}>Cancel</button><button className="primary" disabled={editorBusy} onClick={saveRecipe}>{editorBusy?'Saving recipe…':editingRecipe?'Save changes':'Create recipe'}</button></footer></section></div></OverlayPortal>}

   <section className="panel external-recipe-discovery meal-discovery-v84"><div className="panel-title-row"><div><p className="eyebrow">MORE MEAL IDEAS</p><h2>Discover more recipes</h2><p>Search TheMealDB by dish name. Results include the original image, ingredient measurements and detailed method returned by the recipe source.</p></div><span className="badge provider-badge">Powered by TheMealDB</span></div><div className="external-recipe-search"><input value={externalQ} onChange={e=>setExternalQ(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')searchExternal()}} placeholder="Search pasta, paneer, chicken, soup..."/><button disabled={externalBusy||externalQ.trim().length<2} onClick={searchExternal}>{externalBusy?'Searching...':'Search recipes'}</button></div>{externalError&&<div className="hint">{externalError}</div>}{externalSearched&&!externalBusy&&!externalError&&<div className="external-search-summary"><strong>{externalMeals.length}</strong><span>recipes found for “{externalQ.trim()}”</span></div>}{externalSearched&&!externalBusy&&!externalError&&externalMeals.length===0&&<div className="empty-state compact">No recipes found. Try a different dish name.</div>}{externalMeals.length>0&&<div className="external-recipe-grid">{externalMeals.map(meal=><button key={meal.id} className="external-recipe-card" onClick={()=>setExternalSelected(meal)}><img src={meal.image||'/recipe-images-real/cuisine/international.webp'} alt={meal.name} loading="lazy"/><span><small>{meal.area||meal.country||'International'} · {meal.category||'Meal'}</small><strong>{meal.name}</strong>{meal.tags?.length?<span className="external-mini-tags">{meal.tags.slice(0,2).map(tag=><i key={tag}>{tag}</i>)}</span>:null}<em>View details →</em></span></button>)}</div>}</section>
   {externalSelected&&<OverlayPortal><div className="modal-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)setExternalSelected(null)}}><section className="modal focus-dialog external-recipe-modal" role="dialog" aria-modal="true" aria-label={externalSelected.name}><header className="focus-dialog-titlebar"><div><p className="eyebrow">{externalSelected.provider||'RECIPE'}</p><h2>{externalSelected.name}</h2>{externalSelected.alternate_name&&<small>{externalSelected.alternate_name}</small>}</div><button data-dialog-close="true" className="icon-btn" onClick={()=>setExternalSelected(null)}>×</button></header><div className="focus-dialog-scroll"><img className="recipe-detail-image" src={externalSelected.image||'/recipe-images-real/cuisine/international.webp'} alt={externalSelected.name}/><div className="diet-chips"><span>{externalSelected.area||externalSelected.country||'International'}</span><span>{externalSelected.category||'Meal'}</span>{(externalSelected.tags||[]).slice(0,4).map(tag=><span key={tag}>{tag}</span>)}</div><h3>Ingredients</h3><div className="external-ingredient-list">{(externalSelected.ingredients||[]).map((x,i)=><span key={`${x.name}-${i}`}><b>{x.name}</b><small>{x.measure||'As needed'}</small></span>)}</div><h3>Method</h3><ol className="recipe-step-list">{(externalSelected.instructions||[]).map((step,i)=><li key={i}><span className="step-number">{i+1}</span><div><p>{step}</p></div></li>)}</ol>{(externalSelected.source_url||externalSelected.youtube_url)&&<div className="external-source-actions">{externalSelected.source_url&&<a className="button secondary" href={externalSelected.source_url} target="_blank" rel="noreferrer">Original recipe source ↗</a>}{externalSelected.youtube_url&&<a className="button ghost" href={externalSelected.youtube_url} target="_blank" rel="noreferrer">Watch cooking video ↗</a>}</div>}<p className="small-muted">External recipe quantities are shown exactly as provided by TheMealDB. Because the API does not provide a reliable serving count for every meal, these quantities are not automatically scaled or used as inventory-safe shortages.</p></div></section></div></OverlayPortal>}
 </main>;
}
