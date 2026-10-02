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


def analyze_kitchen_frames(
    *,
    images: list[tuple[bytes, str, str]],
    inventory: list[dict[str, Any]],
    zone: dict[str, Any] | None = None,
    scan_mode: str = "quick",
    recognition_memory: list[dict[str, Any]] | None = None,
    target_products: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if not vision_configured():
        raise DigitalOceanAIError("GHM Vision provider is not configured.")
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
            "usage_scope": row.get("usage_scope", "shared"),
        }
        for row in inventory[:250]
    ]
    memory_payload = (recognition_memory or [])[:120]
    target_payload = (target_products or [])[:30]
    zone_payload = zone or {"name": "Unspecified kitchen area", "zone_type": "custom"}

    prompt = f"""
You are GHM Kitchen Vision, a conservative household inventory observation system.
Inspect every supplied image/frame from ONE storage zone. Real kitchens are messy: products can overlap, labels can face backwards, shelves can be crowded, and some items may be fully hidden.

SCAN CONTEXT
- Storage zone: {json.dumps(zone_payload, ensure_ascii=False)}
- Scan mode: {scan_mode}
- Target products for a recheck, if any: {json.dumps(target_payload, ensure_ascii=False)}

CRITICAL PHYSICAL-INSTANCE RULES
1. Distinguish PRODUCT IDENTITY from PHYSICAL INSTANCES.
2. If the SAME physical carton appears in frames 1, 2, and 3, count it ONCE.
3. If three separate identical cartons/cans/tubs are visibly present, preserve all three and set visible_instance_count=3. Do NOT merge legitimate multiple units into one.
4. Use seen_in_frames to show where the grouped physical instances were observed.
5. When exact counting is uncertain, use quantity_min/quantity_max and explain the obstruction. Do not create false precision.
6. estimated_quantity means the inventory quantity only when the visible evidence supports the inventory unit. Example: six eggs -> 6 pcs can be estimated; one half-full 4 L milk jug does NOT justify claiming 2.0 L unless package size and fill level are both supported.

SAFETY / UNCERTAINTY RULES
- NOT VISIBLE DOES NOT MEAN GONE. Never conclude that an expected product is depleted only because it is absent from these frames.
- Do NOT claim exact brand/SKU/package size unless the evidence supports it.
- Generic objects such as bananas, tomatoes, eggs, onions, bread, milk containers, detergent, toilet paper, etc. may be identified from visual appearance alone.
- Quantities are estimates. Prefer a range when partially blocked.
- Remaining-percent estimates are allowed only when visually defensible; otherwise null.
- Match against existing inventory only when reasonably confident. Never invent an inventory id.
- Use household recognition memory only as supporting context, never as proof that an unseen item is present.
- Confidence must be between 0 and 1.
- coverage_percent estimates HOW MUCH OF THIS STORAGE ZONE WAS VISUALLY INSPECTED, not how many products were recognized.
- If shelves/drawers/door areas appear unscanned or blocked, list them in unseen_areas.
- targeted_rechecks should contain at most 5 short, practical prompts such as "Show the lower fridge drawer" or "Show the egg tray more closely".
- Return ONLY valid JSON. No markdown.

Existing household inventory JSON:
{json.dumps(inventory_payload, ensure_ascii=False)}

Recent recognition memory for this zone (previous confirmed/observed products):
{json.dumps(memory_payload, ensure_ascii=False)}

Return this exact structure:
{{
  "scene_summary": "short summary",
  "coverage_percent": 0,
  "coverage_label": "limited|partial|good|strong",
  "scan_quality": "low|medium|high",
  "unseen_areas": ["short area description"],
  "targeted_rechecks": ["short instruction"],
  "detections": [
    {{
      "detected_name": "generic or exact product name",
      "category": "food|beverage|produce|household|other",
      "matched_product_id": 123 or null,
      "matched_product_name": "existing name" or null,
      "visible_instance_count": 3 or null,
      "seen_in_frames": [1,2,4],
      "estimated_quantity": number or null,
      "quantity_min": number or null,
      "quantity_max": number or null,
      "unit": "pcs|L|kg|pack|unknown",
      "remaining_percent": number or null,
      "confidence": 0.0,
      "evidence": "visual|label|barcode|combined|household_history",
      "exact_identity": true or false,
      "visibility_state": "seen|partially_obscured",
      "notes": "brief uncertainty/reason; mention occlusion when relevant"
    }}
  ],
  "warnings": ["brief caution if needed"]
}}
""".strip()

    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    for index, (raw, filename, content_type) in enumerate(images[: settings.kitchen_vision_max_frames], start=1):
        content.append({"type": "text", "text": f"FRAME {index}"})
        content.append({"type": "image_url", "image_url": {"url": image_data_uri(raw, filename, content_type)}})

    payload = {
        "model": settings.digitalocean_vision_model,
        "messages": [{"role": "user", "content": content}],
        "temperature": 0.05,
        "max_tokens": 3200,
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
        raise DigitalOceanAIError(f"GHM Vision request failed: {exc}") from exc
    if response.status_code >= 400:
        detail = response.text[:700]
        raise DigitalOceanAIError(f"GHM Vision provider returned HTTP {response.status_code}: {detail}")
    try:
        data = response.json()
        text = data["choices"][0]["message"]["content"]
    except Exception as exc:
        raise DigitalOceanAIError("GHM Vision returned an unexpected response shape.") from exc
    parsed = _json_from_text(text)
    if not isinstance(parsed, dict):
        raise DigitalOceanAIError("Kitchen Vision expected a JSON object response.")
    return parsed


def ask_household_agent(*, prompt: str, context: dict[str, Any]) -> dict[str, Any]:
    if not agent_configured():
        raise DigitalOceanAIError("GHM Household Intelligence is not configured.")
    endpoint = settings.digitalocean_agent_url.rstrip("/") + "/api/v1/chat/completions"
    # Managed agent instructions are configured on the provider agent itself.
    # Sending system/developer messages to the Agent endpoint can be rejected with HTTP 400,
    # so GHM sends only the live household context and user request as a normal user message.
    user_content = f"Household context:\n{json.dumps(context, ensure_ascii=False)}\n\nUser request:\n{prompt}"
    payload = {
        "messages": [
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
        raise DigitalOceanAIError(f"GHM Household Intelligence request failed: {exc}") from exc
    if response.status_code >= 400:
        raise DigitalOceanAIError(f"GHM Household Intelligence provider returned HTTP {response.status_code}: {response.text[:700]}")
    try:
        data = response.json()
        answer = data["choices"][0]["message"]["content"]
    except Exception as exc:
        raise DigitalOceanAIError("GHM Household Intelligence returned an unexpected response shape.") from exc
    return {
        "answer": answer,
        "retrieval": data.get("retrieval"),
        "functions": data.get("functions"),
        "guardrails": data.get("guardrails"),
    }


def inference_healthcheck() -> tuple[bool, str]:
    if not vision_configured():
        return False, "GHM Vision provider is not configured."
    url = settings.digitalocean_inference_base_url.rstrip("/") + "/models"
    try:
        response = requests.get(
            url,
            headers={"Authorization": f"Bearer {settings.digitalocean_inference_key}"},
            timeout=15,
        )
        if response.status_code >= 400:
            return False, f"Inference key test returned HTTP {response.status_code}."
        return True, "GHM Vision provider is reachable with the configured key."
    except requests.RequestException as exc:
        return False, f"Inference connection failed: {exc}"


def agent_healthcheck() -> tuple[bool, str]:
    if not agent_configured():
        return False, "GHM Household Intelligence is not configured."
    try:
        result = ask_household_agent(prompt="Reply with exactly: GHM agent ready", context={"diagnostic": True})
        answer = str(result.get("answer") or "").strip()
        return bool(answer), f"Agent endpoint responded: {answer[:120]}"
    except DigitalOceanAIError as exc:
        return False, str(exc)


def text_json_completion(*, prompt: str, max_tokens: int = 1800) -> dict[str, Any]:
    """Run a conservative structured text task through the configured serverless model.

    V98 uses this only to summarize official restaurant menu evidence. It is never
    treated as proof that a dietary restriction is satisfied; the caller must keep
    source/evidence labels and require restaurant confirmation where needed.
    """
    if not vision_configured():
        raise DigitalOceanAIError("GHM AI inference is not configured.")
    payload = {
        "model": settings.digitalocean_vision_model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.05,
        "max_tokens": max_tokens,
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
        raise DigitalOceanAIError(f"GHM AI request failed: {exc}") from exc
    if response.status_code >= 400:
        raise DigitalOceanAIError(f"GHM AI provider returned HTTP {response.status_code}: {response.text[:700]}")
    try:
        data = response.json()
        content = data["choices"][0]["message"]["content"]
    except Exception as exc:
        raise DigitalOceanAIError("GHM AI returned an unexpected response shape.") from exc
    parsed = _json_from_text(str(content or ""))
    if not isinstance(parsed, dict):
        raise DigitalOceanAIError("GHM AI expected a JSON object response.")
    return parsed
