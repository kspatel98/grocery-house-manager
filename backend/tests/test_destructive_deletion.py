from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.db.session import Base
from app.models import (
    Activity,
    ExpenseCategory,
    ExpenseMonthLock,
    ExpenseMonthParticipant,
    ExpenseShare,
    House,
    HouseExpense,
    HouseMember,
    HouseRole,
    Product,
    ProductEvent,
    Receipt,
    Section,
    ShoppingList,
    ShoppingListItem,
    User,
)
from app.services.deletion import purge_house, purge_user_account


def make_session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'delete-test.db'}")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, _):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def seed_house(db, *, second_member=False):
    owner = User(email="owner@example.com", full_name="Owner", password_hash="x")
    other = User(email="member@example.com", full_name="Member", password_hash="x")
    db.add_all([owner, other])
    db.flush()
    house = House(name="Delete me", created_by_id=owner.id)
    db.add(house)
    db.flush()
    db.add(HouseMember(house_id=house.id, user_id=owner.id, role=HouseRole.owner))
    if second_member:
        db.add(HouseMember(house_id=house.id, user_id=other.id, role=HouseRole.member))
    section = Section(house_id=house.id, name="Pantry")
    db.add(section)
    db.flush()
    product = Product(house_id=house.id, section_id=section.id, name="Salt", quantity=1, unit="pcs")
    db.add(product)
    db.flush()
    shopping = ShoppingList(house_id=house.id, title="List", created_by_id=owner.id)
    db.add(shopping)
    db.flush()
    db.add(ShoppingListItem(shopping_list_id=shopping.id, product_id=product.id, requested_quantity=1))
    receipt = Receipt(house_id=house.id, uploaded_by_id=owner.id, store_name="Store")
    db.add(receipt)
    db.flush()
    expense = HouseExpense(house_id=house.id, title="Groceries", amount=10, paid_by_user_id=owner.id, receipt_id=receipt.id)
    db.add(expense)
    db.flush()
    db.add(ExpenseShare(expense_id=expense.id, user_id=owner.id, share_amount=10))
    month = ExpenseMonthLock(house_id=house.id, month_key="2026-10", locked_by_user_id=owner.id)
    db.add(month)
    db.flush()
    db.add(ExpenseMonthParticipant(expense_month_id=month.id, user_id=owner.id, added_by_user_id=owner.id))
    db.add(ExpenseCategory(house_id=house.id, name="Groceries", icon="🛒", created_by_user_id=owner.id))
    db.add(Activity(house_id=house.id, user_id=owner.id, action="test", message="test"))
    db.add(ProductEvent(user_id=owner.id, house_id=house.id, event_name="test"))
    db.commit()
    return owner, other, house


def test_purge_house_removes_complete_house_graph(tmp_path):
    db = make_session(tmp_path)
    owner, _, house = seed_house(db)
    purge_house(db, house.id)
    db.commit()
    assert db.get(House, house.id) is None
    assert db.query(Product).filter(Product.house_id == house.id).count() == 0
    assert db.query(Receipt).filter(Receipt.house_id == house.id).count() == 0
    assert db.query(HouseExpense).filter(HouseExpense.house_id == house.id).count() == 0
    assert db.query(Activity).filter(Activity.house_id == house.id).count() == 0
    assert db.get(User, owner.id) is not None


def test_purge_user_removes_solo_house_and_account(tmp_path):
    db = make_session(tmp_path)
    owner, _, house = seed_house(db)
    owner_id = owner.id
    purge_user_account(db, owner_id, [house.id])
    db.commit()
    assert db.get(House, house.id) is None
    assert db.get(User, owner_id) is None


def test_purge_user_leaves_joined_house_and_anonymizes_history(tmp_path):
    db = make_session(tmp_path)
    owner = User(email="a@example.com", full_name="A", password_hash="x")
    member = User(email="b@example.com", full_name="B", password_hash="x")
    db.add_all([owner, member]); db.flush()
    house = House(name="Shared", created_by_id=owner.id); db.add(house); db.flush()
    db.add_all([
        HouseMember(house_id=house.id, user_id=owner.id, role=HouseRole.owner),
        HouseMember(house_id=house.id, user_id=member.id, role=HouseRole.member),
    ])
    activity = Activity(house_id=house.id, user_id=member.id, action="test", message="member did something")
    db.add(activity); db.commit()
    member_id = member.id
    activity_id = activity.id
    purge_user_account(db, member_id, [])
    db.commit()
    assert db.get(User, member_id) is None
    assert db.get(House, house.id) is not None
    assert db.get(Activity, activity_id).user_id is None
