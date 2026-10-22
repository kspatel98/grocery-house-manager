/* Run with: npm run check:recipes (after npm ci). Verifies all built-in
 * recipes have step-by-step GHM instructions in all supported languages. */
const fs=require('fs');
const path=require('path');
const ts=require('typescript');
const src=path.join(__dirname,'../src');
require.extensions['.ts']=(module,file)=>{
  const text=fs.readFileSync(file,'utf8');
  const compiled=ts.transpileModule(text,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}});
  module._compile(compiled.outputText,file);
};
const {recipes}=require(path.join(src,'recipes.ts'));
const linked=['khaman','khandvi','paneer-butter-masala','masala-dosa','vegetable-pulao','chole','dal-tadka','palak-paneer','pav-bhaji','rajma-masala','idli-sambar'];
const errors=[];
const seen=new Set();
for(const recipe of recipes){
  if(seen.has(recipe.id)) errors.push(`Duplicate recipe: ${recipe.id}`);
  seen.add(recipe.id);
  const english=recipe.steps.en;
  if(english.length<15) errors.push(`${recipe.id} has only ${english.length} beginner steps`);
  for(const [lang,steps] of Object.entries(recipe.steps)){
    if(steps.length!==english.length) errors.push(`${recipe.id}: ${lang} count differs`);
    if(steps.some(x=>!x||x.trim().length<16)) errors.push(`${recipe.id}: ${lang} contains unusually short/empty step`);
  }
}
for(const id of linked){
  const recipe=recipes.find(r=>r.id===id);
  if(!recipe)errors.push(`Missing linked GHM guide ${id}`);
  else if(recipe.steps.en.length<18)errors.push(`Insufficient linked GHM method: ${id}`);
}
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log(`${recipes.length} built-in recipes passed; ${linked.length} source-linked planning recipes have 18+ original beginner steps.`);
