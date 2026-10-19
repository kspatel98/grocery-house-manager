"""v145: only metadata/links are indexed; rejects off-site URLs; no reimport duplicates."""
import os,sys,types
os.environ.setdefault('DATABASE_URL','sqlite:///:memory:')
os.environ.setdefault('SECRET_KEY','test-only')
try:
    import jose
except ImportError:
    fake=types.ModuleType('app.api.deps')
    fake.get_current_user=lambda: None
    sys.modules['app.api.deps']=fake
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db.session import Base
from app.models import LinkedRecipeSource
from app.api.linked_recipes import seed_linked_recipes, as_out
from app.api.linked_recipe_index import (
    import_public_url_index, parse_xml_locs, recipe_sitemap, official_url, slug_title,
    SITEMAP_INDEX,
)

def test_source_index():
    assert recipe_sitemap('https://www.vegrecipesofindia.com/post-sitemap.xml')
    assert recipe_sitemap('https://www.vegrecipesofindia.com/post-sitemap2.xml')
    assert not recipe_sitemap('https://www.vegrecipesofindia.com/page-sitemap.xml')
    assert not official_url('https://www.vegrecipesofindia.com.evil.com/post-sitemap.xml')
    assert not official_url('http://www.vegrecipesofindia.com/post-sitemap.xml')
    assert slug_title('https://www.vegrecipesofindia.com/tomato-soup-recipe/')
    index=b'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://www.vegrecipesofindia.com/post-sitemap.xml</loc></sitemap><sitemap><loc>https://www.vegrecipesofindia.com/page-sitemap.xml</loc></sitemap></sitemapindex>'
    entries=b'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://www.vegrecipesofindia.com/test-delicious-dosa-recipe/</loc></url><url><loc>https://www.vegrecipesofindia.com/khaman-dhokla-microwave-recipe/</loc></url><url><loc>https://evil.com/secret-recipe/</loc></url></urlset>'
    urls={SITEMAP_INDEX:index,'https://www.vegrecipesofindia.com/post-sitemap.xml':entries}
    eng=create_engine('sqlite:///:memory:')
    Base.metadata.create_all(eng)
    Session=sessionmaker(bind=eng)
    with Session() as db:
        seed_linked_recipes(db)
        assert db.query(LinkedRecipeSource).count()==36
        result=import_public_url_index(db,lambda url: urls[url],max_urls=50)
        assert result['added']==1, result
        count=db.query(LinkedRecipeSource).count()
        assert count==37
        assert import_public_url_index(db,lambda url: urls[url],max_urls=50)['added']==0
        source=db.query(LinkedRecipeSource).filter(LinkedRecipeSource.slug.like('source-%')).one()
        assert source.ghm_recipe_id==''
        assert 'ingredients' not in as_out(source) and 'steps' not in as_out(source)
    assert parse_xml_locs(index)[0]=='sitemapindex'
    print('v145 source catalog safety tests passed')

if __name__=='__main__':test_source_index()
