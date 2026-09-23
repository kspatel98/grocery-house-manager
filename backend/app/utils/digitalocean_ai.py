from __future__ import annotations

import base64
from dataclasses import dataclass
import json
import mimetypes
import re
from typing import Any

import requests

from app.core.config import settings


class DigitalOceanAIError(RuntimeError):
    pass


def _json_from_text(value: str) -> Any:
    text = (value or "").strip()
    if not text:
        raise DigitalOceanAIError("The AI response was empty.")
    # Remove common markdown fences while preserving JSON content.
    fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", text, flags=re.S | re.I)
    if fenced:
        text = fenced.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Some models may prepend a sentence. Extract the largest plausible JSON object/array.
        start_candidates = [i for i in [text.find("{"), text.find("[")] if i >= 0]
        if not start_candidates:
            raise DigitalOceanAIError("The AI response did not contain valid JSON.")
        start = min(start_candidates)
        end = max(text.rfind("}"), text.rfind("]"))
        if end <= start:
            raise DigitalOceanAIError("The AI response did not contain complete JSON.")
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError as exc:
            raise DigitalOceanAIError("The AI response could not be parsed as JSON.") from exc


def image_data_uri(content: bytes, filename: str | None = None, content_type: str | None = None) -> str:
    guessed = content_type or mimetypes.guess_type(filename or "image.jpg")[0] or "image/jpeg"
    encoded = base64.b64encode(content).decode("ascii")
    return f"data:{guessed};base64,{encoded}"


def vision_configured() -> bool:
    return bool(settings.digitalocean_ai_enabled and settings.digitalocean_inference_key and settings.digitalocean_vision_model)


def agent_configured() -> bool:
    return bool(settings.digitalocean_agent_enabled and settings.digitalocean_agent_url and settings.digitalocean_agent_access_key)


def analyze_kitchen_frames(*, images: list[tuple[bytes, str, str]], inventory: list[dict[str, Any]]) -> dict[str, Any]:
    if not vision_configured():
        raise DigitalOceanAIError("DigitalOcean multimodal inference is not configured.")
    if not images:
        raise DigitalOceanAIError("No images were provided to Kitchen Vision.")

    inventory_payload = [
        {
            "id": row.get("id"),
            "name": row.get("name"),
            "brand": row.get("brand"),
            "barcode": row.get("barcode"),
            "quantity": row.get("quantity"),
            "unit": row.get("unit"),
        }
        for row in inventory[:250]
    ]
    prompt = f"""
You are Kitchen Vision for Grocery House Manager. Inspect every supplied kitchen image/frame carefully.
Your job is to identify physical grocery or household-consumable products, including unlabeled fresh foods.
Use visual appearance, packaging, readable labels, and visible barcodes when available.

IMPORTANT RULES:
- Do NOT claim an exact brand/SKU/size unless the visual evidence supports it.
- Generic objects such as bananas, tomatoes, eggs, onions, bread, milk containers, detergent, toilet paper, etc. may be identified from appearance alone.
- Quantities are estimates. If you cannot count reliably, use null and say why.
- Remaining-percent estimates are allowed only when visually defensible; otherwise null.
- Match against existing inventory only when reasonably confident. Never invent an inventory id.
- If multiple frames show the same product, merge them rather than double-counting.
- Confidence must be between 0 and 1.
- Return ONLY valid JSON. No markdown.

Existing inventory JSON:
{json.dumps(inventory_payload, ensure_ascii=False)}

Return this exact structure:
{{
  "scene_summary": "short summary",
  "detections": [
    {{
      "detected_name": "generic or exact product name",
      "category": "food|beverage|produce|household|other",
      "matched_product_id": 123 or null,
      "matched_product_name": "existing name" or null,
      "estimated_quantity": number or null,
      "unit": "pcs|L|kg|pack|unknown",
      "remaining_percent": number or null,
      "confidence": 0.0,
      "evidence": "visual|label|barcode|combined",
      "exact_identity": true or false,
      "notes": "brief uncertainty/reason"
    }}
  ],
  "warnings": ["brief caution if needed"]
}}
""".strip()

    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    for raw, filename, content_type in images[: settings.kitchen_vision_max_frames]:
        content.append({"type": "image_url", "image_url": {"url": image_data_uri(raw, filename, content_type)}})

    payload = {
        "model": settings.digitalocean_vision_model,
        "messages": [{"role": "user", "content": content}],
        "temperature": 0.1,
        "max_tokens": 2400,
    }
    url = settings.digitalocean_inference_base_url.rstrip("/") + "/chat/completions"
    try:
        response = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {settings.digitalocean_inference_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=settings.digitalocean_vision_timeout_seconds,
        )
    except requests.RequestException as exc:
        raise DigitalOceanAIError(f"DigitalOcean inference request failed: {exc}") from exc
    if response.status_code >= 400:
        detail = response.text[:700]
        raise DigitalOceanAIError(f"DigitalOcean inference returned HTTP {response.status_code}: {detail}")
    try:
        data = response.json()
        text = data["choices"][0]["message"]["content"]
    except Exception as exc:
        raise DigitalOceanAIError("DigitalOcean inference returned an unexpected response shape.") from exc
    parsed = _json_from_text(text)
    if not isinstance(parsed, dict):
        raise DigitalOceanAIError("Kitchen Vision expected a JSON object response.")
    return parsed


def ask_household_agent(*, prompt: str, context: dict[str, Any]) -> dict[str, Any]:
    if not agent_configured():
        raise DigitalOceanAIError("DigitalOcean Household Agent is not configured.")
    endpoint = settings.digitalocean_agent_url.rstrip("/") + "/api/v1/chat/completions"
    system = """
You are the Grocery House Manager Household Agent. Give concise, practical household grocery guidance.
Use the supplied household context as the source of truth. Never invent prices, quantities, safety facts,
or actions. If the user asks to change data, describe the recommended action unless a verified application
tool/function route is available. Respect household preferences even when they are not the cheapest option.
""".strip()
    user_content = f"Household context:\n{json.dumps(context, ensure_ascii=False)}\n\nUser request:\n{prompt}"
    payload = {
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
        "stream": False,
        "include_functions_info": True,
        "include_retrieval_info": True,
        "include_guardrails_info": True,
    }
    try:
        response = requests.post(
            endpoint,
            headers={
                "Authorization": f"Bearer {settings.digitalocean_agent_access_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=settings.digitalocean_agent_timeout_seconds,
        )
    except requests.RequestException as exc:
        raise DigitalOceanAIError(f"DigitalOcean agent request failed: {exc}") from exc
    if response.status_code >= 400:
        raise DigitalOceanAIError(f"DigitalOcean agent returned HTTP {response.status_code}: {response.text[:700]}")
    try:
        data = response.json()
        answer = data["choices"][0]["message"]["content"]
    except Exception as exc:
        raise DigitalOceanAIError("DigitalOcean agent returned an unexpected response shape.") from exc
    return {
        "answer": answer,
        "retrieval": data.get("retrieval"),
        "functions": data.get("functions"),
        "guardrails": data.get("guardrails"),
    }


def inference_healthcheck() -> tuple[bool, str]:
    if not vision_configured():
        return False, "DigitalOcean inference is not configured."
    url = settings.digitalocean_inference_base_url.rstrip("/") + "/models"
    try:
        response = requests.get(
            url,
            headers={"Authorization": f"Bearer {settings.digitalocean_inference_key}"},
            timeout=15,
        )
        if response.status_code >= 400:
            return False, f"Inference key test returned HTTP {response.status_code}."
        return True, "DigitalOcean serverless inference is reachable with the configured key."
    except requests.RequestException as exc:
        return False, f"Inference connection failed: {exc}"


def agent_healthcheck() -> tuple[bool, str]:
    if not agent_configured():
        return False, "DigitalOcean Household Agent is not configured."
    try:
        result = ask_household_agent(prompt="Reply with exactly: GHM agent ready", context={"diagnostic": True})
        answer = str(result.get("answer") or "").strip()
        return bool(answer), f"Agent endpoint responded: {answer[:120]}"
    except DigitalOceanAIError as exc:
        return False, str(exc)
