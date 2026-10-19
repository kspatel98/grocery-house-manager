"""V144 catalog: only trusted outbound recipe links and repeatable SQL seeding."""
from __future__ import annotations
import os, sys, types
os.environ.setdefault('DATABASE_URL', 'sqlite:///:memory:')
os.environ.setdefault('SECRET_KEY', 'test-only')
try:
    import jose  # noqa: F401
except ModuleNotFoundError:
    fake = types.ModuleType('app.api.deps')
    fake.get_current_user = lambda: None
    sys.modules['app.api.deps'] = fake
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db.session import Base
from app.models import LinkedRecipeSource
from app.api.linked_recipes import seed_linked_recipes, is_allowed_source, as_out


def test_v144_curated_source_links():
    engine = create_engine('sqlite:///:memory:')
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    with Session() as db:
        seed_linked_recipes(db)
        rows = db.query(LinkedRecipeSource).all()
        assert len(rows) == 36
        assert len({x.slug for x in rows}) == len(rows)
        assert all(is_allowed_source(x.source_url) for x in rows)
        assert sum(bool(x.ghm_recipe_id) for x in rows) == 11
        assert all('ingredients' not in as_out(x) and 'instructions' not in as_out(x) for x in rows)
        seed_linked_recipes(db)
        assert db.query(LinkedRecipeSource).count() == len(rows)
        rows[0].is_published = False
        db.commit()
        seed_linked_recipes(db)
        assert db.query(LinkedRecipeSource).filter_by(slug=rows[0].slug).one().is_published is False
    for url in ['http://www.vegrecipesofindia.com/example', 'https://vegrecipesofindia.com.evil.net/x', 'javascript:alert(1)', 'https://attacker@vegrecipesofindia.com/x']:
        assert not is_allowed_source(url)
    print('V144 source-linked recipe catalog tests passed')

if __name__ == '__main__':
    test_v144_curated_source_links()
