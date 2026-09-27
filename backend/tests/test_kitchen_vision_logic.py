from app.services.kitchen_vision_logic import physical_observation_key


def test_physical_key_preserves_multiple_identical_units():
    one_carton = physical_observation_key(7, "Milk", 1, [1, 2, 4])
    three_cartons = physical_observation_key(7, "Milk", 3, [1, 2, 4])
    assert one_carton != three_cartons


def test_same_physical_group_across_same_frames_deduplicates():
    first = physical_observation_key(9, "Yogurt", 6, [1, 2, 3])
    repeated = physical_observation_key(9, "YOGURT", 6, [1, 2, 3])
    assert first == repeated
