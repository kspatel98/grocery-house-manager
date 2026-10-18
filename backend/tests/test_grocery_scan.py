"""Grocery photo/written-list imports: validation, inventory isolation and batching."""
import os
os.environ.setdefault('DATABASE_URL', 'sqlite:///./grocery-scan-test.db')
os.environ.setdefault('SECRET_KEY', 'test-secret-key')

from io import BytesIO

import pytest
from PIL import Image
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.session import Base
from app.models import User, House, HouseMember, HouseRole, Section, Product, ShoppingList, ShoppingListItem
from app.api.grocery_scan import ImportGroceries, apply_groceries
from app.utils.grocery_image_scan import prepare_image, normalize_recognized_rows


def make_db():
    engine = create_engine('sqlite:///:memory:')
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    owner = User(email='testscan@example.com', full_name='Scanner', subscription_status='free')
    session.add(owner)
    session.flush()
    house = House(name='Scan Test', created_by_id=owner.id)
    session.add(house)
    session.flush()
    session.add(HouseMember(house_id=house.id, user_id=owner.id, role=HouseRole.owner))
    session.commit()
    return session, owner, house


def test_image_validation_blocks_invalid_and_oversized():
    with pytest.raises(ValueError):
        prepare_image(b'x' * 10, 'image/gif')
    with pytest.raises(ValueError):
        prepare_image(b'x' * (8 * 1024 * 1024 + 1), 'image/jpeg')
    buffer = BytesIO()
    Image.new('RGB', (200, 100), 'white').save(buffer, 'PNG')
    jpeg = prepare_image(buffer.getvalue(), 'image/png')
    assert jpeg[:3] == b'\xff\xd8\xff'


def test_handwriting_uncertain_requires_review_and_categories():
    result = normalize_recognized_rows({"items": [
        {"name": "Rice", "quantity": None, "unit": "kg", "confidence": .66, "category": "Pantry"},
        {"name": "?", "quantity": 3},
    ]}, "written_list")
    assert len(result['items']) == 1
    assert result['items'][0]['quantity'] is None
    assert result['items'][0]['needs_review'] is True
    assert result['items'][0]['category'] == 'Pantry'


def test_written_list_cannot_write_to_inventory():
    with pytest.raises(ValueError):
        ImportGroceries(mode='written_list', destination='inventory', items=[{'name':'Rice','quantity':2,'unit':'kg'}])


def test_written_list_adds_to_shopping_but_not_stock():
    db, user, house = make_db()
    try:
        payload = ImportGroceries(mode='written_list', destination='shopping', items=[
            {'name':'Bananas','quantity':5,'unit':'pcs','category':'Fruits'},
            {'name':'Rice','quantity':2,'unit':'kg','category':'Pantry'},
        ])
        out = apply_groceries(house.id, payload, db, user)
        assert out['count'] == 2
        assert out['list_id']
        assert {p.name: p.quantity for p in db.query(Product).all()} == {'Bananas':0, 'Rice':0}
        assert len(db.query(ShoppingListItem).all()) == 2
        assert all(row.bought_quantity == 0 for row in db.query(ShoppingListItem).all())
        assert {s.name for s in db.query(Section).all()} == {'Fruits','Pantry'}
        # Add again to same list increases requested amount without changing inventory.
        again = apply_groceries(house.id, ImportGroceries(mode='written_list', destination='shopping', list_id=out['list_id'], items=[
            {'name':'Bananas','quantity':2,'unit':'pcs','category':'Fruits'},
        ]), db, user)
        assert again['count'] == 1
        banana = db.query(Product).filter_by(name='Bananas').one()
        assert banana.quantity == 0
        item = db.query(ShoppingListItem).filter_by(product_id=banana.id).one()
        assert item.requested_quantity == 7
    finally:
        db.close()


def test_product_photo_increases_existing_quantity():
    db, user, house = make_db()
    try:
        section = Section(house_id=house.id, name='Dairy')
        db.add(section); db.flush()
        product = Product(house_id=house.id, section_id=section.id, name='Milk', quantity=2, unit='bottle', usage_scope='shared')
        db.add(product); db.commit()
        out = apply_groceries(house.id, ImportGroceries(mode='products', destination='inventory', items=[
            {'name':'Milk','quantity':3,'unit':'bottle','product_id':product.id}
        ]), db, user)
        assert out['destination']=='inventory'
        db.refresh(product)
        assert product.quantity==5
        assert db.query(ShoppingList).count()==0
        with pytest.raises(HTTPException) as failure:
            apply_groceries(house.id, ImportGroceries(mode='products', destination='inventory', items=[
                {'name':'Milk','quantity':1,'unit':'kg','product_id':product.id}
            ]), db, user)
        assert failure.value.status_code==400
        db.refresh(product)
        assert product.quantity==5
    finally:
        db.close()


def test_duplicate_review_rows_are_rejected_before_writing():
    db, user, house = make_db()
    try:
        with pytest.raises(HTTPException):
            apply_groceries(house.id, ImportGroceries(mode='written_list', destination='shopping', items=[
                {'name':'Bananas','quantity':1,'unit':'pcs'},
                {'name':' BANANAS ','quantity':2,'unit':'pcs'},
            ]), db, user)
        assert db.query(Product).count() == 0
    finally:
        db.close()
