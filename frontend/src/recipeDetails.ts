import type { AppLanguage } from './i18n';

export type RecipeStepSet = Record<AppLanguage, string[]>;

const allLanguages = (steps:string[]):RecipeStepSet => ({en:steps, gu:steps, hi:steps, fr:steps});

// Detailed cooking methods for the built-in catalogue. The arrays are intentionally
// step-by-step so the UI can render one clear action at a time instead of a paragraph.
export const detailedRecipeSteps:Record<string,RecipeStepSet> = {
  rotli: allLanguages([
    'Put the whole wheat flour in a wide bowl. Add the optional salt and oil, then mix with your fingertips.',
    'Add water little by little while mixing. Stop adding water as soon as the flour comes together into a soft, smooth dough; the exact water needed can vary by flour.',
    'Knead for about 5–7 minutes until the dough is elastic and no dry flour remains. Cover and rest it for 15–20 minutes.',
    'Knead the rested dough briefly, divide it into equal portions, and roll each portion into a smooth ball. Keep the balls covered so they do not dry out.',
    'Dust one ball lightly with flour and roll it into a thin, even circle. Use only enough dry flour to prevent sticking.',
    'Heat a tawa over medium-high heat. Place the rotli on the hot tawa; when small bubbles appear, flip it and cook the second side.',
    'Flip once more. Gently press the edges with a cloth or spatula so the rotli puffs, or briefly place it over a direct flame if that is your usual method.',
    'Remove when cooked with light brown spots. Keep covered in a clean cloth or insulated container and repeat with the remaining dough.'
  ]),
  thepla: allLanguages([
    'Combine whole wheat flour, turmeric, chilli powder and the other listed seasonings in a mixing bowl.',
    'Add yogurt and part of the oil. Mix well, then add only enough water to form a soft but not sticky dough.',
    'Knead until smooth, cover, and rest for 10–15 minutes so the flour hydrates evenly.',
    'Divide the dough into equal balls. Dust lightly with flour and roll each one into a medium-thin circle.',
    'Heat a tawa over medium heat. Place one thepla on it and cook until bubbles and pale spots appear, then flip.',
    'Brush or drizzle a little oil around the edges and surface. Flip again and cook both sides until golden-brown spots develop.',
    'Stack the cooked theplas in a covered container so they remain soft. Serve warm, or cool completely before packing for travel.'
  ]),
  'methi-thepla': allLanguages([
    'Pick the methi leaves, wash them thoroughly, drain very well and chop them finely so excess water does not make the dough sticky.',
    'Mix whole wheat flour, chopped methi, turmeric and the listed seasonings in a wide bowl.',
    'Add yogurt and part of the oil. Mix, then add a small amount of water only if needed and knead into a soft dough.',
    'Cover and rest for about 10 minutes. Methi releases moisture while resting, so check the dough before adding any more water.',
    'Divide into equal balls, dust lightly with flour and roll each ball into a medium-thin round thepla.',
    'Cook on a hot tawa over medium heat. Flip when bubbles appear, apply a little oil, and cook both sides until evenly spotted and fully cooked.',
    'Keep the cooked theplas covered to retain softness. Serve with yogurt, pickle or tea, or cool before storing.'
  ]),
  'bajri-rotla': allLanguages([
    'Place bajra flour and salt in a wide bowl and mix. Keep warm water beside you because bajra absorbs water gradually.',
    'Add warm water a little at a time and knead firmly with the heel of your palm until the dough holds together without large cracks.',
    'Work with one portion at a time because bajra dough dries quickly. Keep the rest covered.',
    'Shape a ball, flatten it and pat it between your palms or directly on a board, using dry bajra flour as needed, until it becomes a thick even round.',
    'Transfer carefully to a hot tawa. Cook the first side until the surface changes colour and the edges begin to look dry.',
    'Flip and cook the second side. Turn once more and press gently, or finish over a direct flame, until the rotla is cooked through with toasted spots.',
    'Serve hot, traditionally with ghee, jaggery, garlic chutney or a Gujarati shaak according to your dietary preference.'
  ]),
  bhakri: allLanguages([
    'Mix whole wheat flour with salt and ghee, rubbing the ghee into the flour until it resembles coarse crumbs.',
    'Add water gradually and knead into a firm dough; bhakri dough should be noticeably firmer than rotli dough.',
    'Cover and rest for about 10 minutes, then knead briefly again and divide into equal portions.',
    'Roll each portion into a thick, even disc. Prick lightly with a fork if you prefer a crisper bhakri.',
    'Cook on a medium-low tawa so the centre cooks before the outside becomes too dark. Flip when the underside develops light brown spots.',
    'Cook the second side and keep flipping as needed, pressing gently around the edges, until both sides are crisp and fully cooked.',
    'Brush with a little ghee if desired and serve hot or cool completely for storage.'
  ]),
  'puran-poli': allLanguages([
    'Rinse chana dal well and cook it in enough water until the dal is completely tender but not watery. Drain any excess liquid thoroughly.',
    'Put the cooked dal and jaggery in a heavy pan. Cook on medium-low heat, stirring continuously, until the mixture becomes thick enough to hold its shape.',
    'Add cardamom if using. Cool the puran, then mash or blend it until smooth and divide it into equal filling balls.',
    'Meanwhile knead the whole wheat flour with water and a little ghee into a soft, pliable dough. Cover and rest it for at least 20 minutes.',
    'Take one dough portion, flatten it, place a puran ball in the centre, bring the edges together and seal without trapping excess air.',
    'Dust gently and roll the filled ball into a thin poli without tearing the surface.',
    'Cook on a medium-hot tawa, flipping once the first side sets. Apply ghee and cook both sides until golden spots appear.',
    'Serve warm with ghee or milk. Let cooked polis cool before stacking for storage so they do not become soggy.'
  ]),
  khichdi: allLanguages([
    'Rinse rice and moong dal together several times until the water runs mostly clear. Drain.',
    'Add the rice and dal to a pressure cooker or heavy pot with turmeric, salt and the recipe water quantity.',
    'Pressure-cook until both grains are very soft. In a pressure cooker this is usually a few whistles, depending on the cooker and grain.',
    'Let the pressure release naturally. Open and stir; add a little hot water if you prefer a softer, looser khichdi.',
    'Heat ghee separately, add cumin or your preferred simple tempering, and let the spices sizzle without burning.',
    'Pour the tempering over the khichdi, mix well, taste for salt and serve hot with Gujarati kadhi, yogurt, pickle or papad.'
  ]),
  'vaghareli-khichdi': allLanguages([
    'Rinse rice and moong dal well and drain. Prepare the mixed vegetables into small, evenly sized pieces.',
    'Heat ghee or oil in a pressure cooker. Add the tempering spices and let them crackle, then add ginger/chilli if included in your version.',
    'Add the vegetables and sauté for 2–3 minutes so they become coated with the tempering and spices.',
    'Add rice, dal, turmeric, salt and the required water. Stir once and scrape the bottom so nothing is stuck.',
    'Pressure-cook until the rice, dal and vegetables are tender. Allow pressure to release naturally before opening.',
    'Mix gently, adjust the consistency with hot water if needed, check seasoning and serve hot with kadhi, yogurt or pickle.'
  ]),
  kadhi: allLanguages([
    'Whisk yogurt and besan in a deep bowl until completely smooth with no flour lumps.',
    'Gradually whisk in water, then add jaggery, salt and the listed ginger/chilli seasonings.',
    'Transfer to a deep saucepan and bring to a gentle boil while stirring frequently, especially during the first several minutes so the yogurt mixture does not catch at the bottom.',
    'Reduce the heat and simmer for about 15–20 minutes, stirring occasionally, until the raw besan taste disappears and the kadhi tastes balanced.',
    'For the vaghar, heat ghee or oil in a small pan. Add mustard/cumin and the listed tempering ingredients; let them sizzle briefly without burning.',
    'Carefully pour the hot tempering into the kadhi. Stir, taste and adjust salt, sweetness or sourness if necessary.',
    'Simmer for another minute, garnish if desired and serve hot with khichdi or rice.'
  ]),
  'gujarati-dal': allLanguages([
    'Rinse tuvar dal until the water runs clear. Pressure-cook it with turmeric and enough water until completely soft.',
    'Allow the pressure to release, then whisk or mash the cooked dal until smooth. Add water to reach a pourable dal consistency.',
    'Add tomato, jaggery, salt and the listed sweet-sour spices. Simmer until the tomato is soft and the flavours combine.',
    'Prepare the tempering by heating ghee or oil and crackling the listed mustard/cumin and aromatic spices.',
    'Pour the tempering into the simmering dal carefully. Continue simmering for several minutes so the tempering flavours infuse.',
    'Turn off the heat and add lemon only after boiling has stopped if you are using it for sourness. Taste and balance sweet, salty, sour and spicy notes.',
    'Garnish with coriander if desired and serve hot with rice, rotli and shaak.'
  ]),
  'dal-dhokli': allLanguages([
    'Rinse and pressure-cook tuvar dal until very soft. Whisk it smooth and transfer it to a wide pot with water, tomato, jaggery and the listed dal seasonings.',
    'Bring the dal to a steady simmer; keep it slightly thinner than normal dal because the dhokli will absorb liquid while cooking.',
    'Make a firm dough from whole wheat flour and the listed dough seasonings, adding water gradually. Rest it for about 10 minutes.',
    'Divide the dough, roll each piece into a thin large circle and cut it into small diamonds or strips.',
    'Drop the dhokli pieces into simmering dal one by one while stirring gently so they do not stick together.',
    'Cook uncovered or partially covered until the dhokli pieces are tender all the way through, stirring from the bottom every few minutes.',
    'Prepare and add the tempering, then adjust water, salt, sweetness and sourness. The finished dal dhokli should be saucy rather than dry.',
    'Rest for a few minutes and serve hot with ghee, coriander and lemon if desired.'
  ]),
  'sev-tameta': allLanguages([
    'Wash and chop the tomatoes. Keep the sev separate until the very end so it does not become soggy too early.',
    'Heat oil in a pan and add the tempering spices. Once they sizzle, add the dry spices briefly on low heat so they do not burn.',
    'Add chopped tomatoes and salt. Cover and cook until the tomatoes soften and release their juices.',
    'Mash some of the tomatoes with the back of the spoon. Add a small amount of water only if you want more gravy, then add jaggery or sugar if your recipe uses it.',
    'Simmer until the gravy tastes cooked and balanced. Check salt, sweetness and chilli before adding the sev.',
    'Add sev just before serving and fold gently. For a crisp topping, add only part of the sev to the gravy and scatter the rest on top.'
  ]),
  'ringan-bateta': allLanguages([
    'Wash the eggplant and potatoes and cut them into similar-sized pieces so they cook at roughly the same rate.',
    'Heat oil in a wide pan and add the tempering spices. Lower the heat before adding powdered spices so they do not scorch.',
    'Add potatoes first and stir to coat. Cook for a few minutes, then add eggplant, salt and the remaining seasonings.',
    'Cover and cook on low to medium heat, stirring gently every few minutes. Add only a splash of water if the vegetables begin sticking.',
    'Cook until the potatoes are tender and the eggplant is soft but not completely mashed.',
    'Taste, adjust seasoning, garnish with coriander if desired and serve with rotli, bhakri or dal-rice.'
  ]),
  'ringan-olo': allLanguages([
    'Wash and dry the eggplant. Make a few small slits in the skin, then roast it over a flame, grill or very hot oven until the skin is charred and the inside is completely soft.',
    'Place the roasted eggplant in a covered bowl for a few minutes. Peel off the charred skin, discard the stem and mash the flesh.',
    'Heat oil in a pan. Add cumin and the permitted aromatics for your dietary choice; for the Swaminarayan version keep it onion- and garlic-free.',
    'Add chopped tomato and cook until soft and the oil begins to separate slightly.',
    'Add the mashed eggplant, salt and spices. Cook while stirring for several minutes so the smoky eggplant and tomato mixture combine evenly.',
    'Taste, garnish with coriander and serve hot with bajri rotla, rotli or bhakri.'
  ]),
  undhiyu: allLanguages([
    'Prepare all vegetables first: string and cut Surti papdi, peel the baby potatoes if desired, and cut yam and raw banana into large even pieces. Keep lilva ready.',
    'Prepare the green masala by combining coriander, coconut, sesame/peanut, ginger, green chilli, lemon, jaggery and the listed dry spices. Taste for the classic sweet-spicy-sour balance.',
    'Slit the potatoes and other stuffable vegetables and press some green masala inside. Toss the remaining vegetables with the rest of the masala.',
    'Heat oil in a heavy pot. Add the vegetables in layers, placing firmer vegetables lower down and tender papdi/lilva higher up. Add only a little water because the vegetables release moisture.',
    'Cover tightly and cook on low heat, turning the mixture gently from the bottom at intervals so the vegetables cook without breaking.',
    'When the vegetables are nearly tender, add the prepared methi muthiya. Cover again and cook until the muthiya and every vegetable are cooked through.',
    'Gently toss everything so the masala coats the vegetables. Adjust salt, jaggery and lemon if required.',
    'Rest for 5–10 minutes before serving. Garnish with coriander/coconut and serve hot with puri or rotli.'
  ]),
  tindora: allLanguages([
    'Wash and dry the tindora, trim both ends and slice lengthwise or into thin rounds.',
    'Heat oil in a wide pan and add the tempering spices. Let them crackle.',
    'Add tindora, turmeric, salt and the listed dry spices. Toss until every piece is coated.',
    'Cover and cook on medium-low heat, stirring every few minutes. Avoid adding much water; trapped steam should soften the tindora.',
    'When tender, uncover and cook for a few more minutes to remove excess moisture and lightly roast the edges.',
    'Taste, adjust seasoning and serve with rotli, dal and rice.'
  ]),
  bhinda: allLanguages([
    'Wash okra well and dry it completely before cutting; moisture makes bhinda sticky. Trim the ends and slice evenly.',
    'Heat oil in a wide pan. Add the tempering spices, then add the okra and spread it out rather than crowding it.',
    'Cook uncovered for the first several minutes, stirring gently, until most of the sliminess reduces.',
    'Add salt and the dry spices once the okra has begun to cook. Continue on medium-low heat, turning rather than mashing.',
    'Cook until the okra is tender with lightly roasted edges and no raw centre remains.',
    'Finish with the preferred dry spice or lemon if used, and serve immediately with rotli or dal-rice.'
  ]),
  'dudhi-chana': allLanguages([
    'Rinse chana dal and soak it for at least 30 minutes if possible. Peel the dudhi, remove mature seeds if necessary and cut it into small cubes.',
    'Drain the dal and place it in a pressure cooker with dudhi, tomato, turmeric, salt and enough water to cook without becoming soupy.',
    'Pressure-cook until the chana dal is tender but still holds some shape. Let the pressure release naturally.',
    'Open and gently mix. Simmer uncovered if there is too much liquid, or add a little hot water if it is too thick.',
    'Prepare a tempering with oil or ghee and the listed spices, then pour it over the dudhi-chana dal.',
    'Simmer for a few minutes, adjust seasoning and serve hot with rotli or rice.'
  ]),
  'tuvar-lilva': allLanguages([
    'Rinse the fresh tuvar lilva and prepare the potatoes into small even cubes.',
    'Heat oil in a pan, add the tempering spices and let them crackle.',
    'Add potatoes first with turmeric and salt and cook for a few minutes, then add lilva and the remaining spices.',
    'Add a small splash of water, cover and cook on medium-low heat until both the lilva and potatoes are tender.',
    'Uncover and cook off excess moisture. Gently stir so the lilva stays mostly intact.',
    'Taste, adjust sweet-sour seasoning if your family uses it, garnish and serve with rotli.'
  ]),
  bateta: allLanguages([
    'Peel the potatoes if desired and cut them into even pieces. Chop tomato separately.',
    'Heat oil in a pan or pressure cooker and add the tempering spices. Let them crackle before adding powdered spices.',
    'Add potatoes and stir well. Add tomato, salt and the remaining seasonings and cook for 2–3 minutes.',
    'Add water according to whether you want a dry shaak or gravy-style bateta. Cover and cook until the potato pieces are tender.',
    'Gently mash a few potato pieces if you want the gravy slightly thicker, then simmer for another minute.',
    'Taste, garnish with coriander and serve hot with puri, rotli or dal-rice.'
  ]),
  handvo: allLanguages([
    'Mix handvo flour with yogurt and enough water to make a thick pourable batter. Cover and ferment according to the flour you use, commonly several hours or overnight.',
    'Grate bottle gourd shortly before cooking. Squeeze only if it is extremely watery, then mix it into the fermented batter with salt and the listed spices.',
    'Just before cooking, add your leavening ingredient if the recipe uses one and fold gently; do not overmix after this point.',
    'Heat oil in an oven-safe pan or prepare a baking tin. Add mustard, sesame and other tempering ingredients, then pour the batter over the tempering.',
    'Bake until the centre is set and a tester comes out clean, or cook covered on a heavy pan over low heat until the underside is crisp and the centre is cooked.',
    'If using a pan, carefully flip or finish the top under heat so both sides are golden and crisp.',
    'Rest for 5–10 minutes, cut into pieces and serve warm with chutney.'
  ]),
  dhokla: allLanguages([
    'Rinse rice and chana dal, soak them for several hours, then drain. Grind with yogurt and enough water to make a thick, slightly coarse batter.',
    'Cover and ferment the batter in a warm place until it develops a mild sour aroma and some aeration.',
    'Add salt and the listed spices. Prepare the steamer and grease the steaming plate before adding the final leavening ingredient.',
    'Fold the leavening into the batter quickly and gently, pour immediately into the greased plate and place it in the fully heated steamer.',
    'Steam without opening the lid repeatedly until a knife or toothpick inserted in the centre comes out clean.',
    'Cool for a few minutes, cut into pieces, then pour the prepared mustard/curry-leaf tempering over the surface.',
    'Garnish and serve warm or at room temperature with chutney.'
  ]),
  khaman: allLanguages([
    'Grease a steaming plate and preheat the steamer so it is producing steady steam before the batter is finished.',
    'Whisk besan with the measured water, lemon, salt and seasonings until smooth and lump-free. Let it rest briefly if your recipe calls for it.',
    'Add the leavening ingredient last. Mix gently but quickly until the batter becomes lighter; do not let it sit after this step.',
    'Pour into the greased plate immediately and steam on medium heat until the centre is set and a tester comes out clean.',
    'Let the khaman rest for a few minutes, then cut into squares without pressing them down.',
    'Heat oil for the tempering, crackle mustard and the listed ingredients, then add the sweetened water/lemon mixture carefully if your style uses it.',
    'Pour the tempering evenly over the khaman, allow it to absorb, garnish and serve.'
  ]),
  khandvi: allLanguages([
    'Whisk besan, yogurt and water until completely smooth. Strain the mixture if necessary to remove any remaining lumps.',
    'Add salt, turmeric and the listed ginger/chilli seasoning, then transfer to a heavy non-stick pan.',
    'Cook over medium-low heat while stirring continuously, scraping the base and sides, until the batter becomes thick and glossy.',
    'Test a small spoonful on the back of a steel plate: spread it thin, wait briefly and try to roll it. If it rolls cleanly, the batter is ready.',
    'Working quickly before the batter cools, spread very thin layers over clean steel plates or a smooth counter.',
    'Let the layers set for a few minutes, cut into long strips and roll each strip gently into a tight khandvi roll.',
    'Prepare the mustard/sesame tempering, spoon it over the rolls, garnish with coriander/coconut and serve.'
  ]),
  patra: allLanguages([
    'Wash and completely dry the colocasia leaves. Trim the thick central veins carefully so the leaves can roll without tearing.',
    'Make a thick, spreadable paste from besan, jaggery and the listed sour, salty and spicy seasonings.',
    'Place the largest leaf vein-side up and spread a thin even layer of paste over it. Stack another leaf on top and repeat.',
    'Fold the side edges inward, then roll the stack tightly from one end to make a firm log. Repeat with the remaining leaves.',
    'Steam the rolls until the besan coating is fully cooked and firm. Let them cool enough to slice cleanly.',
    'Cut into even rounds. Eat them steamed, or temper/shallow-fry the slices with mustard and sesame until lightly crisp.',
    'Garnish with coconut/coriander if desired and serve warm.'
  ]),
  muthiya: allLanguages([
    'Grate bottle gourd and keep all of its moisture initially; it helps hydrate the flour. Mix it with whole wheat flour, besan, yogurt and the listed seasonings.',
    'Bring the mixture together into a soft dough. Add very little extra water, because dudhi continues releasing moisture.',
    'Grease your hands and shape the dough into compact logs that fit comfortably in the steamer.',
    'Place the logs in a preheated steamer and steam until firm and cooked through. A knife inserted in the centre should come out without raw dough.',
    'Cool the logs for several minutes, then slice them into even rounds so they do not crumble.',
    'Heat oil, crackle mustard and sesame, then add the sliced muthiya and toss gently until the edges become lightly golden.',
    'Finish with coriander, coconut or lemon if desired and serve warm.'
  ]),
  fafda: allLanguages([
    'Mix besan, papad khar, salt and the listed spices. Rub in the measured oil until evenly distributed.',
    'Add water little by little and knead into a firm but pliable dough. Knead thoroughly until the surface becomes smooth.',
    'Cover and rest the dough briefly, then divide it into small portions and keep them covered.',
    'Lightly grease a flat surface. Press one dough portion forward with the heel of your palm or a flat scraper to create a long, very thin strip.',
    'Heat frying oil to a steady medium-hot temperature. Slide the strip into the oil carefully and fry until crisp and pale golden, not dark brown.',
    'Drain well and repeat in small batches so the oil temperature remains stable.',
    'Cool slightly and serve with papaya sambharo, fried chillies or chutney.'
  ]),
  ganthiya: allLanguages([
    'Mix besan, papad khar, salt and spices. Add the measured oil and rub it evenly through the flour.',
    'Add water gradually and knead into a soft, smooth dough suitable for pressing through a ganthiya/sev press.',
    'Heat frying oil on medium. Test a tiny piece of dough; it should rise steadily without browning immediately.',
    'Fill the press without large air gaps and press strands directly into the hot oil in a controlled circular motion.',
    'Fry until the bubbling reduces and the ganthiya is cooked but still light in colour.',
    'Lift out, drain thoroughly and allow to cool before breaking into serving lengths or storing.'
  ]),
  khichu: allLanguages([
    'Bring the measured water to a boil with salt, cumin and the listed green chilli/seasoning.',
    'Lower the heat. Add rice flour gradually while stirring continuously with a strong spoon so large dry lumps do not form.',
    'Once all flour is added, mix vigorously until the mass is even and the flour has absorbed the water.',
    'Cover and cook/steam on low heat until the khichu becomes glossy and the raw rice-flour taste disappears.',
    'Stir once or twice from the bottom during cooking if your pot permits, then check that no dry flour pockets remain.',
    'Serve hot with a drizzle of oil and chilli powder or pickle masala according to taste.'
  ]),
  locho: allLanguages([
    'Rinse chana dal and soak it for several hours. Soak poha briefly near grinding time, then drain both well.',
    'Grind the dal and poha with yogurt and enough water to make a thick, slightly coarse batter.',
    'Cover and ferment until mildly sour and aerated. Add salt and spices, and prepare a greased steaming plate.',
    'Add the leavening ingredient just before steaming, fold gently and pour the batter into the plate.',
    'Steam until cooked but deliberately soft and moist; locho should not become as firm as khaman.',
    'Scoop the hot locho into a serving plate and loosen/mash it lightly with a spoon.',
    'Top with oil or butter as preferred, locho masala, sev, coriander and chutneys, then serve immediately.'
  ]),
  'sev-khamani': allLanguages([
    'Rinse and soak chana dal for several hours, then drain and grind to a coarse batter with only enough water to move the blades.',
    'Season the batter, then steam or cook it until the dal mixture is fully cooked through.',
    'Cool slightly and crumble the cooked mixture finely with clean hands or pulse briefly so there are no large chunks.',
    'Heat oil and prepare the mustard/curry-leaf tempering. Add the crumbled dal and toss gently.',
    'Add the sweet-sour seasoning with lemon and sugar as required, sprinkling in a little water only if the khamani seems dry.',
    'Cook for a few minutes so the seasoning absorbs, then turn off the heat.',
    'Top generously with sev and garnish with coriander/pomegranate or coconut if desired. Serve promptly.'
  ]),
  sukhdi: allLanguages([
    'Grease a tray or thali and keep the jaggery measured and ready before you begin; the final mixing happens quickly.',
    'Heat ghee in a heavy pan over low to medium-low heat. Add whole wheat flour and mix until every grain is coated.',
    'Roast patiently, stirring continuously, until the flour turns golden, becomes aromatic and loses its raw taste.',
    'Turn off the heat and let the mixture cool only briefly so it is hot enough to melt jaggery but not so hot that the jaggery overheats.',
    'Add jaggery and mix quickly until completely melted and evenly distributed.',
    'Immediately spread into the greased tray, level gently and mark pieces while still warm.',
    'Let it set, cut along the marks and cool completely before storing airtight.'
  ]),
  shrikhand: allLanguages([
    'Place yogurt in a muslin cloth or fine strainer over a bowl and refrigerate until most whey drains out and a thick hung yogurt remains.',
    'Measure the required hung yogurt after draining, then whisk it until smooth and free of lumps.',
    'Add sugar gradually and whisk again until dissolved. If using powdered sugar, sift it first for the smoothest texture.',
    'Add cardamom and any saffron or nut flavouring in your version. Mix gently so the shrikhand remains thick.',
    'Taste and adjust sweetness, then refrigerate for at least 1–2 hours so the flavour develops and the texture firms.',
    'Garnish just before serving and keep refrigerated until needed.'
  ]),
  basundi: allLanguages([
    'Pour whole milk into a wide, heavy-bottomed pan; a wide surface helps the milk reduce evenly.',
    'Bring to a boil while stirring, then reduce to a gentle simmer. Keep scraping the milk solids from the sides back into the milk.',
    'Continue simmering and stirring frequently so the bottom never scorches. Reduce until the milk becomes noticeably thicker but still pourable.',
    'Add sugar and stir until fully dissolved. Simmer a little longer because the sugar will thin the mixture slightly at first.',
    'Add cardamom, saffron or nuts if using and cook for another minute or two.',
    'Turn off the heat. Serve warm, or cool to room temperature and then refrigerate until thoroughly chilled.'
  ]),
  mohanthal: allLanguages([
    'Mix a small portion of warm ghee and milk into the besan and rub it between your palms to create coarse granules. Rest briefly, then sieve/rub the mixture for an even texture.',
    'Heat the remaining ghee in a heavy pan and add the prepared besan. Roast slowly, stirring constantly, until deep golden and strongly aromatic.',
    'In a separate pan make the sugar syrup to the consistency specified by your family recipe, keeping it hot but not overcooked.',
    'Lower the heat under the roasted besan and carefully combine it with the syrup. Stir thoroughly so no dry pockets remain.',
    'Add cardamom and any saffron/nuts, then continue stirring until the mixture thickens and begins to leave the sides of the pan.',
    'Transfer immediately to a greased tray, level without compressing too hard, and garnish.',
    'Mark pieces while warm, allow to set completely and cut once firm.'
  ]),
  lapsi: allLanguages([
    'Heat ghee in a pressure cooker or heavy pan. Add broken wheat and roast on medium-low heat until golden and nutty-smelling.',
    'Carefully add hot water because it may splutter. Stir, cover and cook until the wheat is completely tender but still has texture.',
    'If pressure-cooking, allow the pressure to release before opening and check that the grains are soft.',
    'Add jaggery only after the wheat is cooked. Stir on low heat until the jaggery melts and coats the grains evenly.',
    'Continue cooking until excess moisture reduces and the lapsi reaches a soft, glossy consistency.',
    'Add cardamom/nuts if used, rest for a few minutes and serve warm.'
  ]),
  ghughra: allLanguages([
    'Rub ghee into all-purpose flour until the mixture holds its shape when squeezed. Add water gradually and knead into a firm pastry dough; cover and rest it.',
    'Prepare the filling by lightly roasting coconut and the other filling ingredients as needed. Cool completely before adding sugar so the filling stays dry.',
    'Divide the dough into equal balls and roll each into a small thin circle, keeping unused dough covered.',
    'Place filling in the centre, lightly moisten the edge if needed, fold into a half-moon and seal very firmly. Crimp or twist the edge so it cannot open during frying.',
    'Heat oil or ghee over medium-low heat. Fry ghughra in small batches, turning gently, until evenly golden and crisp.',
    'Drain and cool completely before storing. Do not cover while hot because trapped steam softens the pastry.'
  ]),
  'churma-ladoo': allLanguages([
    'Mix whole wheat flour with part of the ghee and enough water to make a stiff dough.',
    'Shape the dough into thick muthiya/logs or small firm balls so the centres cook through evenly.',
    'Cook the pieces by the traditional method you use—commonly deep-frying or baking—until golden and fully cooked inside, then cool slightly.',
    'Break the cooked pieces and grind them into a fine crumb. Sieve if you want an especially smooth ladoo texture.',
    'Warm the remaining ghee and mix it through the churma. Add jaggery in a form that blends evenly and mix while the mixture is warm.',
    'Add cardamom and nuts if used. Mix thoroughly and check that the mixture holds when pressed.',
    'Shape into firm ladoos while warm, then let them cool completely before storing.'
  ]),
  chaas: allLanguages([
    'Whisk yogurt until completely smooth with no lumps.',
    'Add chilled water gradually while whisking so the yogurt disperses evenly.',
    'Add salt and blend or churn until the chaas is light and frothy.',
    'Taste and adjust the water and salt to your preferred thinness and seasoning.',
    'Serve immediately chilled, or refrigerate and stir again before serving.'
  ]),
  'masala-chaas': allLanguages([
    'Whisk yogurt until smooth, then gradually add chilled water and churn until frothy.',
    'Add salt, roasted cumin and the listed herbs/spices. Crush fresh herbs or ginger/chilli first if your version includes them.',
    'Blend or churn briefly so the flavours disperse without completely pulverizing the herbs.',
    'Taste and adjust salt, cumin and water. Chill if necessary.',
    'Stir once more before pouring and garnish with a pinch of roasted cumin or coriander.'
  ]),
  cake: allLanguages([
    'Preheat the oven to the temperature specified for your pan, commonly around 175–180°C. Grease and line the cake tin before making the final batter.',
    'Measure all ingredients accurately. Sift all-purpose flour and baking powder together so the leavening is evenly distributed and lumps are removed.',
    'In a separate bowl cream or whisk the butter and sugar until lighter in texture. Add milk gradually and mix until reasonably smooth.',
    'Add the dry ingredients to the wet mixture in portions. Fold gently only until no dry flour remains; overmixing can make the cake dense.',
    'Transfer the batter immediately to the prepared tin, level the top and tap the tin lightly once or twice to remove very large air pockets.',
    'Bake in the preheated oven without opening the door early. Start checking near the expected finish time; a tester inserted in the centre should come out clean or with a few dry crumbs.',
    'Cool in the tin for about 10–15 minutes, then turn out onto a rack and let the cake cool completely before slicing or frosting.'
  ]),
  'chicken-curry': allLanguages([
    'Cut the chicken into even pieces, pat dry and season or marinate it according to the listed ingredients. Keep raw chicken and its utensils separate from ready-to-eat foods.',
    'Heat oil in a heavy pan. Brown the permitted aromatics and whole spices until fragrant, then add powdered spices briefly on lower heat.',
    'Add tomato and cook until it softens and the masala no longer tastes raw.',
    'Add the chicken and stir well so every piece is coated. Cook for several minutes until the outside changes colour.',
    'Add the required water or other liquid, cover and simmer until the thickest pieces are fully cooked and tender.',
    'For food safety, verify the chicken reaches at least 74°C / 165°F in the thickest part. Do not rely on colour alone.',
    'Adjust gravy thickness and seasoning, garnish and serve hot with rice or roti.'
  ]),
  'egg-curry': allLanguages([
    'Place eggs in a saucepan, cover with water and cook until hard-boiled. Cool in cold water, peel and set aside.',
    'Heat oil in a pan. Cook onion and the listed aromatics until softened and lightly coloured.',
    'Add tomato and spices and cook until the tomato breaks down and the masala tastes fully cooked.',
    'Add the required water and simmer to form the curry gravy. Adjust salt before adding the eggs.',
    'Make shallow slits in the boiled eggs if desired, add them to the gravy and simmer for several minutes so they absorb flavour.',
    'Adjust the gravy consistency, garnish and serve hot with rice or roti.'
  ])
};
