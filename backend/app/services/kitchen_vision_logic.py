from __future__ import annotations


def physical_observation_key(
    matched_product_id: int | None,
    detected_name: str,
    visible_instance_count: int | None,
    seen_in_frames: list[int],
) -> str:
    """Identify one model-produced physical observation group.

    This key is intentionally *not* based on product name alone. Multiple identical physical
    units remain represented by ``visible_instance_count``. The key only removes an accidental
    duplicate group that carries the same product, physical count, and frame evidence.
    """
    frames = ",".join(str(value) for value in seen_in_frames)
    return f"{matched_product_id or 0}:{detected_name.strip().lower()}:{visible_instance_count}:{frames}"
