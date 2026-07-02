from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.activity_utils import display_name, log_activity
from app.api.deps import get_current_user, require_house_member
from app.db.session import get_db
from app.models import Product, Section, User
from app.schemas import SectionCreate, SectionOut, SectionUpdate

router = APIRouter(prefix="/houses/{house_id}/sections", tags=["sections"])


@router.get("", response_model=list[SectionOut])
def list_sections(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    return db.query(Section).filter(Section.house_id == house_id).order_by(Section.sort_order, Section.name).all()


@router.post("", response_model=SectionOut)
def create_section(house_id: int, payload: SectionCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    section = Section(house_id=house_id, **payload.model_dump())
    db.add(section)
    db.flush()
    log_activity(db, house_id=house_id, user=user, action="section_created", message=f"Section {section.name} added by {display_name(user)}.", entity_type="section", entity_id=section.id)
    db.commit()
    db.refresh(section)
    return section


@router.patch("/{section_id}", response_model=SectionOut)
def update_section(house_id: int, section_id: int, payload: SectionUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    section = db.query(Section).filter(Section.id == section_id, Section.house_id == house_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    old_name = section.name
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(section, key, value)
    log_activity(db, house_id=house_id, user=user, action="section_updated", message=f"Section {old_name} updated by {display_name(user)}.", entity_type="section", entity_id=section.id)
    db.commit()
    db.refresh(section)
    return section

@router.post("/{section_id}/edit", response_model=SectionOut)
def update_section_via_post(house_id: int, section_id: int, payload: SectionUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # Compatibility endpoint for browsers/dev proxies that cache or block PATCH preflight.
    return update_section(house_id, section_id, payload, db, user)


@router.delete("/{section_id}")
def delete_section(house_id: int, section_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    require_house_member(house_id, user, db)
    section = db.query(Section).filter(Section.id == section_id, Section.house_id == house_id).first()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    product_count = db.query(Product).filter(Product.section_id == section_id).count()
    if product_count:
        raise HTTPException(status_code=400, detail="Move or delete products before deleting this section")
    section_name = section.name
    db.delete(section)
    log_activity(db, house_id=house_id, user=user, action="section_deleted", message=f"Section {section_name} removed by {display_name(user)}.", entity_type="section", entity_id=section_id)
    db.commit()
    return {"ok": True}
