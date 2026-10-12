from app.schemas import ProductLookupResultOut
from app.utils.product_identity import normalize_quantity, rank_and_merge_identity_results


def test_normalize_quantity_common_canadian_labels():
    assert normalize_quantity("4 litres") == "4l"
    assert normalize_quantity("750 mL") == "750ml"
    assert normalize_quantity("2 x 500 g") == "2x500g"


def test_independent_sources_promote_barcode_identity_to_verified():
    barcode = "067100003456"
    rows = [
        ProductLookupResultOut(source="open_food_facts", barcode=barcode, name="PurFiltre 2% Milk", brand="Lactantia", quantity="4 L", categories=["Milk"]),
        ProductLookupResultOut(source="upcdatabase", barcode=barcode, name="Lactantia PurFiltre 2% Milk 4L", brand="Lactantia", quantity="4 litres"),
    ]
    ranked = rank_and_merge_identity_results(rows, barcode=barcode)
    assert ranked
    assert ranked[0].identity_confidence >= 90
    assert ranked[0].identity_label == "Verified"
    assert set(ranked[0].evidence_sources) == {"open_food_facts", "upcdatabase"}
    assert ranked[0].normalized_quantity == "4l"


def test_single_sparse_source_is_not_marked_verified():
    row = ProductLookupResultOut(source="open_food_facts", barcode="123456789012", name="Milk")
    ranked = rank_and_merge_identity_results([row], barcode="123456789012")
    assert ranked[0].identity_confidence < 90
    assert ranked[0].identity_label != "Verified"
