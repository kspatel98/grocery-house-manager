# V81 — Direct TheMealDB Recipe Search

## What changed

The optional Meals discovery feature now works against the exact endpoint supplied for the project:

```text
https://www.themealdb.com/api/json/v1/1/search.php?s=<search string>
```

The backend appends/URL-encodes the user search value with `requests.get(..., params={"s": query})`. The default API key is now `1`, so the feature works without additional configuration. `THEMEALDB_API_KEY` remains configurable for a future alternate/supporter key.

## Response mapping

Each TheMealDB row is normalized into the app with:

- `idMeal` → id
- `strMeal` / `strMealAlternate` → names
- `strMealThumb` → card/detail image
- `strCategory` → category
- `strArea` / `strCountry` → cuisine/location context
- `strIngredient1..20` + `strMeasure1..20` → ingredient rows
- `strInstructions` → numbered method steps
- `strTags` → visual tags
- `strSource` → original recipe link
- `strYoutube` → cooking-video link
- `dateModified` → provider metadata

Blank ingredient slots are ignored. Empty searches return an empty result state rather than an error. Provider/network errors return a user-friendly temporary-unavailable message.

## Important serving behavior

TheMealDB does not provide a reliable serving count for every recipe. External recipes therefore display ingredient measurements exactly as returned and are **not** automatically scaled or used to compute inventory shortages. The built-in Grocery House Manager recipes remain the inventory-aware/scalable recipe source.

## Environment

Default:

```env
THEMEALDB_API_KEY=1
THEMEALDB_TIMEOUT_SECONDS=15
```

No extra setup is needed to use key `1`.
