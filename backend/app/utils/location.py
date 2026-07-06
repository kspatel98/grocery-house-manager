from __future__ import annotations

COUNTRY_CURRENCY_MAP: dict[str, str] = {
    "canada": "CAD",
    "ca": "CAD",
    "united states": "USD",
    "usa": "USD",
    "us": "USD",
    "india": "INR",
    "in": "INR",
    "united kingdom": "GBP",
    "uk": "GBP",
    "gb": "GBP",
    "australia": "AUD",
    "au": "AUD",
    "new zealand": "NZD",
    "nz": "NZD",
    "european union": "EUR",
    "germany": "EUR",
    "france": "EUR",
    "italy": "EUR",
    "spain": "EUR",
    "netherlands": "EUR",
    "ireland": "EUR",
}

COMMON_GROCERY_CHAINS: dict[str, list[str]] = {
    "CAD": ["Walmart", "Costco", "No Frills", "FreshCo", "Food Basics", "Real Canadian Superstore", "Sobeys", "Metro"],
    "USD": ["Walmart", "Costco", "Target", "Kroger", "Aldi", "Whole Foods Market", "Trader Joe's"],
    "INR": ["Reliance Smart", "DMart", "Big Bazaar", "More Supermarket", "Spencer's", "Vishal Mega Mart"],
    "GBP": ["Tesco", "Sainsbury's", "Asda", "Morrisons", "Aldi", "Lidl"],
    "AUD": ["Woolworths", "Coles", "Aldi", "IGA", "Costco"],
    "EUR": ["Lidl", "Aldi", "Carrefour", "Edeka", "Rewe", "Auchan"],
}


def normalize_country(value: str | None) -> str | None:
    clean = " ".join((value or "").strip().split())
    return clean or None


def currency_for_country(value: str | None) -> str:
    clean = (value or "").strip().lower()
    return COUNTRY_CURRENCY_MAP.get(clean, "CAD")


def common_grocery_chains(country: str | None) -> list[str]:
    currency = currency_for_country(country)
    return COMMON_GROCERY_CHAINS.get(currency, COMMON_GROCERY_CHAINS["CAD"])
