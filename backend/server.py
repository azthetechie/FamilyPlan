from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Cookie, Header, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ============== MODELS ==============
class User(BaseModel):
    user_id: str
    family_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str = "parent"  # parent | child
    is_owner: bool = True  # True for the parent who created the family
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Child(BaseModel):
    child_id: str = Field(default_factory=lambda: f"child_{uuid.uuid4().hex[:12]}")
    family_id: str
    name: str
    age: Optional[int] = None
    color: Optional[str] = "#FFD6BA"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ChildCreate(BaseModel):
    name: str
    age: Optional[int] = None
    color: Optional[str] = "#FFD6BA"


class EventCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    date: str  # ISO date YYYY-MM-DD
    time: Optional[str] = ""
    category: Optional[str] = "general"  # general | school | sport | family | work | weekend
    assigned_to: Optional[List[str]] = []  # user_ids or child_ids
    color: Optional[str] = "#90DBF4"
    recurring: Optional[str] = "none"  # none | daily | weekly | monthly
    recur_until: Optional[str] = ""  # ISO date YYYY-MM-DD, empty = no end
    reminder_minutes: Optional[int] = 0  # 0 = off, else minutes before event


class Event(EventCreate):
    event_id: str = Field(default_factory=lambda: f"evt_{uuid.uuid4().hex[:12]}")
    family_id: str
    created_by: str
    exceptions: List[str] = []  # ISO dates (YYYY-MM-DD) to skip for recurring events
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ExceptionInput(BaseModel):
    date: str  # YYYY-MM-DD


class ShoppingItemCreate(BaseModel):
    name: str
    quantity: Optional[str] = "1"
    supermarket: Optional[str] = "Any"  # Coles | Woolworths | Aldi | IGA | Foodworks | Any
    barcode: Optional[str] = ""
    brand: Optional[str] = ""
    category: Optional[str] = "general"
    notes: Optional[str] = ""


class ShoppingItem(ShoppingItemCreate):
    item_id: str = Field(default_factory=lambda: f"item_{uuid.uuid4().hex[:12]}")
    family_id: str
    checked: bool = False
    added_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class NoteCreate(BaseModel):
    title: Optional[str] = ""
    content: str
    color: Optional[str] = "#FBF8CC"


class Note(NoteCreate):
    note_id: str = Field(default_factory=lambda: f"note_{uuid.uuid4().hex[:12]}")
    family_id: str
    created_by: str
    created_by_name: Optional[str] = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TemplateItemInput(BaseModel):
    name: str
    supermarket: Optional[str] = "Any"
    quantity: Optional[str] = "1"
    category: Optional[str] = "general"


class TemplateCreate(BaseModel):
    name: str
    items: List[TemplateItemInput] = []


class Template(TemplateCreate):
    template_id: str = Field(default_factory=lambda: f"tpl_{uuid.uuid4().hex[:12]}")
    family_id: str
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Invite(BaseModel):
    invite_token: str = Field(default_factory=lambda: uuid.uuid4().hex)
    family_id: str
    created_by: str
    created_by_name: Optional[str] = ""
    email: Optional[str] = ""  # optional target email hint
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class InviteCreate(BaseModel):
    email: Optional[str] = ""


class FamilyInfoUpdate(BaseModel):
    name: str


class FamilyJoin(BaseModel):
    code: str


def generate_family_code() -> str:
    return "NEST-" + uuid.uuid4().hex[:4].upper()


async def get_or_create_family_meta(family_id: str, name_hint: str = ""):
    doc = await db.families.find_one({"family_id": family_id}, {"_id": 0})
    if doc:
        return doc
    # Ensure unique short_code
    for _ in range(6):
        code = generate_family_code()
        if not await db.families.find_one({"short_code": code}):
            break
    default_name = (name_hint.strip() + "'s family") if name_hint else "Our family"
    new_doc = {
        "family_id": family_id,
        "short_code": code,
        "name": default_name,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.families.insert_one(new_doc)
    return new_doc


# ============== AUTH HELPERS ==============
async def get_current_user(
    request: Request,
) -> User:
    token = request.cookies.get("session_token")
    if not token:
        auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = sess.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at and expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user_doc = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    if isinstance(user_doc.get("created_at"), str):
        user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])
    return User(**user_doc)


# ============== AUTH ROUTES ==============
@api_router.post("/auth/session")
async def create_session(request: Request, response: Response):
    """Exchange session_id from Emergent OAuth for a session_token."""
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    async with httpx.AsyncClient() as http_client:
        resp = await http_client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id},
            timeout=15.0,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")

    data = resp.json()
    email = data.get("email")
    name = data.get("name")
    picture = data.get("picture")
    session_token = data.get("session_token")
    invite_token = body.get("invite_token")

    if not email or not session_token:
        raise HTTPException(status_code=400, detail="Incomplete auth data")

    # Find or create user
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        family_id = existing["family_id"]
        # Update name/picture
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        # Check if there's a valid invite to join an existing family
        family_id = None
        joined_via_invite = False
        if invite_token:
            invite_doc = await db.invites.find_one({"invite_token": invite_token}, {"_id": 0})
            if invite_doc:
                exp = invite_doc.get("expires_at")
                if isinstance(exp, str):
                    exp = datetime.fromisoformat(exp)
                if exp and exp.tzinfo is None:
                    exp = exp.replace(tzinfo=timezone.utc)
                if exp and exp > datetime.now(timezone.utc):
                    family_id = invite_doc["family_id"]
                    joined_via_invite = True
                    # Consume the invite
                    await db.invites.delete_one({"invite_token": invite_token})
        if not family_id:
            family_id = f"family_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id,
            "family_id": family_id,
            "email": email,
            "name": name,
            "picture": picture,
            "role": "parent",
            "is_owner": not joined_via_invite,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(user_doc)

    # Ensure family meta exists (short_code + name)
    await get_or_create_family_meta(family_id, name_hint=(name or "").split(" ")[0])

    # Store session
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc),
    })

    # Set httpOnly cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        max_age=7 * 24 * 60 * 60,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
    )

    return {
        "user_id": user_id,
        "family_id": family_id,
        "email": email,
        "name": name,
        "picture": picture,
        "role": "parent",
    }


@api_router.get("/auth/me")
async def auth_me(request: Request):
    user = await get_current_user(request)
    return user.model_dump()


@api_router.post("/auth/logout")
async def auth_logout(response: Response, session_token: Optional[str] = Cookie(None)):
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# ============== FAMILY / CHILDREN ==============
@api_router.get("/family/info")
async def family_info(request: Request):
    user = await get_current_user(request)
    meta = await get_or_create_family_meta(user.family_id, name_hint=(user.name or "").split(" ")[0])
    parents_count = await db.users.count_documents({"family_id": user.family_id})
    children_count = await db.children.count_documents({"family_id": user.family_id})
    return {
        "family_id": meta["family_id"],
        "short_code": meta["short_code"],
        "name": meta["name"],
        "parents_count": parents_count,
        "children_count": children_count,
    }


@api_router.put("/family/info")
async def update_family_info(payload: FamilyInfoUpdate, request: Request):
    user = await get_current_user(request)
    if not user.is_owner:
        raise HTTPException(status_code=403, detail="Only the family owner can rename the family")
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    if len(name) > 60:
        raise HTTPException(status_code=400, detail="name too long")
    await get_or_create_family_meta(user.family_id)
    await db.families.update_one({"family_id": user.family_id}, {"$set": {"name": name}})
    updated = await db.families.find_one({"family_id": user.family_id}, {"_id": 0})
    return updated


@api_router.get("/family/preview-code/{code}")
async def preview_family_code(code: str):
    """Public preview of a family by code - used on Login / Join modal."""
    meta = await db.families.find_one({"short_code": code.upper()}, {"_id": 0})
    if not meta:
        raise HTTPException(status_code=404, detail="Family not found")
    parents_count = await db.users.count_documents({"family_id": meta["family_id"]})
    return {
        "short_code": meta["short_code"],
        "name": meta["name"],
        "parents_count": parents_count,
    }


@api_router.post("/family/join")
async def join_family(payload: FamilyJoin, request: Request):
    user = await get_current_user(request)
    code = payload.code.strip().upper()
    target = await db.families.find_one({"short_code": code}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Family code not found")
    if target["family_id"] == user.family_id:
        raise HTTPException(status_code=400, detail="You're already in this family")

    # Safety: only allow joining if current family has no user-created data (user is solo)
    old_family_id = user.family_id
    other_parents = await db.users.count_documents({"family_id": old_family_id, "user_id": {"$ne": user.user_id}})
    child_count = await db.children.count_documents({"family_id": old_family_id})
    event_count = await db.events.count_documents({"family_id": old_family_id})
    shop_count = await db.shopping_items.count_documents({"family_id": old_family_id})
    note_count = await db.notes.count_documents({"family_id": old_family_id})
    if other_parents > 0 or child_count or event_count or shop_count or note_count:
        raise HTTPException(
            status_code=400,
            detail="Can't switch families because your current family has members or data. Create a fresh account to join.",
        )

    # Migrate user to target family (joiner is not owner)
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"family_id": target["family_id"], "is_owner": False}},
    )
    # Remove empty family meta
    await db.families.delete_one({"family_id": old_family_id})
    return {"ok": True, "family_id": target["family_id"], "name": target["name"], "short_code": target["short_code"]}


@api_router.get("/family/members")
async def get_family_members(request: Request):
    user = await get_current_user(request)
    parents = await db.users.find({"family_id": user.family_id}, {"_id": 0}).to_list(100)
    children = await db.children.find({"family_id": user.family_id}, {"_id": 0}).to_list(100)
    for p in parents:
        if isinstance(p.get("created_at"), str):
            pass
    return {"parents": parents, "children": children}


@api_router.post("/family/children")
async def add_child(payload: ChildCreate, request: Request):
    user = await get_current_user(request)
    child = Child(family_id=user.family_id, **payload.model_dump())
    doc = child.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.children.insert_one(doc)
    return child.model_dump()


@api_router.delete("/family/children/{child_id}")
async def delete_child(child_id: str, request: Request):
    user = await get_current_user(request)
    result = await db.children.delete_one({"child_id": child_id, "family_id": user.family_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Child not found")
    return {"ok": True}


# ============== CALENDAR EVENTS ==============
@api_router.get("/events")
async def list_events(request: Request):
    user = await get_current_user(request)
    events = await db.events.find({"family_id": user.family_id}, {"_id": 0}).sort("date", 1).to_list(1000)
    return events


@api_router.post("/events")
async def create_event(payload: EventCreate, request: Request):
    user = await get_current_user(request)
    event = Event(family_id=user.family_id, created_by=user.user_id, **payload.model_dump())
    doc = event.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.events.insert_one(doc)
    return event.model_dump()


@api_router.put("/events/{event_id}")
async def update_event(event_id: str, payload: EventCreate, request: Request):
    user = await get_current_user(request)
    result = await db.events.update_one(
        {"event_id": event_id, "family_id": user.family_id},
        {"$set": payload.model_dump()},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    updated = await db.events.find_one({"event_id": event_id}, {"_id": 0})
    return updated


@api_router.delete("/events/{event_id}")
async def delete_event(event_id: str, request: Request):
    user = await get_current_user(request)
    result = await db.events.delete_one({"event_id": event_id, "family_id": user.family_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"ok": True}


@api_router.post("/events/{event_id}/exceptions")
async def add_event_exception(event_id: str, payload: ExceptionInput, request: Request):
    """Skip a single occurrence of a recurring event by adding the date to exceptions."""
    user = await get_current_user(request)
    event = await db.events.find_one({"event_id": event_id, "family_id": user.family_id}, {"_id": 0})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    await db.events.update_one(
        {"event_id": event_id},
        {"$addToSet": {"exceptions": payload.date}},
    )
    updated = await db.events.find_one({"event_id": event_id}, {"_id": 0})
    return updated


@api_router.delete("/events/{event_id}/exceptions/{date}")
async def remove_event_exception(event_id: str, date: str, request: Request):
    user = await get_current_user(request)
    await db.events.update_one(
        {"event_id": event_id, "family_id": user.family_id},
        {"$pull": {"exceptions": date}},
    )
    updated = await db.events.find_one({"event_id": event_id}, {"_id": 0})
    if not updated:
        raise HTTPException(status_code=404, detail="Event not found")
    return updated


# ============== SHOPPING LIST ==============
@api_router.get("/shopping")
async def list_shopping(request: Request):
    user = await get_current_user(request)
    items = await db.shopping_items.find({"family_id": user.family_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items


@api_router.post("/shopping")
async def add_shopping(payload: ShoppingItemCreate, request: Request):
    user = await get_current_user(request)
    item = ShoppingItem(family_id=user.family_id, added_by=user.user_id, **payload.model_dump())
    doc = item.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.shopping_items.insert_one(doc)

    # Track frequency for common items
    name_lower = payload.name.strip().lower()
    if name_lower:
        await db.frequent_items.update_one(
            {"family_id": user.family_id, "name_lower": name_lower},
            {
                "$set": {
                    "name": payload.name.strip(),
                    "family_id": user.family_id,
                    "name_lower": name_lower,
                    "last_used": datetime.now(timezone.utc).isoformat(),
                    "supermarket": payload.supermarket,
                    "category": payload.category,
                },
                "$inc": {"count": 1},
            },
            upsert=True,
        )
    return item.model_dump()


@api_router.patch("/shopping/{item_id}")
async def toggle_shopping(item_id: str, request: Request):
    user = await get_current_user(request)
    item = await db.shopping_items.find_one({"item_id": item_id, "family_id": user.family_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    new_val = not item.get("checked", False)
    await db.shopping_items.update_one({"item_id": item_id}, {"$set": {"checked": new_val}})
    item["checked"] = new_val
    return item


@api_router.put("/shopping/{item_id}")
async def update_shopping(item_id: str, payload: ShoppingItemCreate, request: Request):
    user = await get_current_user(request)
    result = await db.shopping_items.update_one(
        {"item_id": item_id, "family_id": user.family_id},
        {"$set": payload.model_dump()},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    updated = await db.shopping_items.find_one({"item_id": item_id}, {"_id": 0})
    return updated


@api_router.delete("/shopping/{item_id}")
async def delete_shopping(item_id: str, request: Request):
    user = await get_current_user(request)
    result = await db.shopping_items.delete_one({"item_id": item_id, "family_id": user.family_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}


@api_router.delete("/shopping")
async def clear_checked(request: Request):
    user = await get_current_user(request)
    result = await db.shopping_items.delete_many({"family_id": user.family_id, "checked": True})
    return {"deleted": result.deleted_count}


@api_router.get("/shopping/frequent")
async def frequent_items(request: Request):
    """Returns frequently used items for suggestion/autocomplete."""
    user = await get_current_user(request)
    items = await db.frequent_items.find(
        {"family_id": user.family_id}, {"_id": 0}
    ).sort("count", -1).limit(50).to_list(50)
    return items


@api_router.get("/shopping/barcode/{barcode}")
async def lookup_barcode(barcode: str, request: Request):
    """Lookup product info via Open Food Facts (free, no key)."""
    await get_current_user(request)
    if not barcode.strip():
        raise HTTPException(status_code=400, detail="barcode required")
    try:
        async with httpx.AsyncClient() as http_client:
            resp = await http_client.get(
                f"https://world.openfoodfacts.org/api/v2/product/{barcode}.json",
                timeout=10.0,
            )
        if resp.status_code != 200:
            return {"found": False, "barcode": barcode}
        data = resp.json()
        if data.get("status") != 1:
            return {"found": False, "barcode": barcode}
        product = data.get("product", {})
        return {
            "found": True,
            "barcode": barcode,
            "name": product.get("product_name") or product.get("generic_name") or "Unknown product",
            "brand": product.get("brands", ""),
            "category": (product.get("categories", "").split(",")[0] or "general").strip(),
            "image": product.get("image_front_small_url") or product.get("image_url", ""),
        }
    except Exception as e:
        logging.error(f"Barcode lookup error: {e}")
        return {"found": False, "barcode": barcode, "error": str(e)}


# ============== NOTES ==============
@api_router.get("/notes")
async def list_notes(request: Request):
    user = await get_current_user(request)
    notes = await db.notes.find({"family_id": user.family_id}, {"_id": 0}).sort("updated_at", -1).to_list(1000)
    return notes


@api_router.post("/notes")
async def create_note(payload: NoteCreate, request: Request):
    user = await get_current_user(request)
    note = Note(
        family_id=user.family_id,
        created_by=user.user_id,
        created_by_name=user.name,
        **payload.model_dump(),
    )
    doc = note.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["updated_at"] = doc["updated_at"].isoformat()
    await db.notes.insert_one(doc)
    return note.model_dump()


@api_router.put("/notes/{note_id}")
async def update_note(note_id: str, payload: NoteCreate, request: Request):
    user = await get_current_user(request)
    update_doc = payload.model_dump()
    update_doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.notes.update_one(
        {"note_id": note_id, "family_id": user.family_id},
        {"$set": update_doc},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    updated = await db.notes.find_one({"note_id": note_id}, {"_id": 0})
    return updated


@api_router.delete("/notes/{note_id}")
async def delete_note(note_id: str, request: Request):
    user = await get_current_user(request)
    result = await db.notes.delete_one({"note_id": note_id, "family_id": user.family_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"ok": True}


@api_router.get("/")
async def root():
    return {"message": "Family Organizer API", "version": "1.1"}


# ============== PARENT INVITES ==============
@api_router.post("/family/invites")
async def create_invite(payload: InviteCreate, request: Request):
    user = await get_current_user(request)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    invite = Invite(
        family_id=user.family_id,
        created_by=user.user_id,
        created_by_name=user.name,
        email=payload.email or "",
        expires_at=expires_at,
    )
    doc = invite.model_dump()
    doc["expires_at"] = doc["expires_at"].isoformat()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.invites.insert_one(doc)
    return {
        "invite_token": invite.invite_token,
        "expires_at": expires_at.isoformat(),
        "email": invite.email,
        "created_by_name": invite.created_by_name,
    }


@api_router.get("/family/invites")
async def list_invites(request: Request):
    user = await get_current_user(request)
    items = await db.invites.find({"family_id": user.family_id}, {"_id": 0}).to_list(50)
    # Filter expired
    now = datetime.now(timezone.utc)
    live = []
    for it in items:
        exp = it.get("expires_at")
        if isinstance(exp, str):
            exp_dt = datetime.fromisoformat(exp)
        else:
            exp_dt = exp
        if exp_dt and exp_dt.tzinfo is None:
            exp_dt = exp_dt.replace(tzinfo=timezone.utc)
        if exp_dt and exp_dt > now:
            live.append(it)
    return live


@api_router.delete("/family/invites/{invite_token}")
async def revoke_invite(invite_token: str, request: Request):
    user = await get_current_user(request)
    result = await db.invites.delete_one({"invite_token": invite_token, "family_id": user.family_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Invite not found")
    return {"ok": True}


@api_router.get("/family/invites/preview/{invite_token}")
async def preview_invite(invite_token: str):
    """Public endpoint: preview an invite (shown on accept page)."""
    invite_doc = await db.invites.find_one({"invite_token": invite_token}, {"_id": 0})
    if not invite_doc:
        raise HTTPException(status_code=404, detail="Invite not found or expired")
    exp = invite_doc.get("expires_at")
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp and exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Invite expired")
    return {
        "invite_token": invite_doc["invite_token"],
        "created_by_name": invite_doc.get("created_by_name", ""),
        "email": invite_doc.get("email", ""),
    }


# ============== SHOPPING TEMPLATES ==============
@api_router.get("/shopping/templates")
async def list_templates(request: Request):
    user = await get_current_user(request)
    templates = await db.shopping_templates.find(
        {"family_id": user.family_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return templates


@api_router.post("/shopping/templates")
async def create_template(payload: TemplateCreate, request: Request):
    user = await get_current_user(request)
    tpl = Template(
        family_id=user.family_id,
        created_by=user.user_id,
        **payload.model_dump(),
    )
    doc = tpl.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.shopping_templates.insert_one(doc)
    return tpl.model_dump()


@api_router.put("/shopping/templates/{template_id}")
async def update_template(template_id: str, payload: TemplateCreate, request: Request):
    user = await get_current_user(request)
    result = await db.shopping_templates.update_one(
        {"template_id": template_id, "family_id": user.family_id},
        {"$set": payload.model_dump()},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    updated = await db.shopping_templates.find_one({"template_id": template_id}, {"_id": 0})
    return updated


@api_router.delete("/shopping/templates/{template_id}")
async def delete_template(template_id: str, request: Request):
    user = await get_current_user(request)
    result = await db.shopping_templates.delete_one(
        {"template_id": template_id, "family_id": user.family_id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"ok": True}


@api_router.post("/shopping/templates/{template_id}/apply")
async def apply_template(template_id: str, request: Request):
    user = await get_current_user(request)
    tpl = await db.shopping_templates.find_one(
        {"template_id": template_id, "family_id": user.family_id}, {"_id": 0}
    )
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    added = 0
    for it in tpl.get("items", []):
        item = ShoppingItem(
            family_id=user.family_id,
            added_by=user.user_id,
            name=it.get("name", ""),
            supermarket=it.get("supermarket", "Any"),
            quantity=it.get("quantity", "1"),
            category=it.get("category", "general"),
            barcode="",
            brand="",
            notes="",
        )
        if not item.name.strip():
            continue
        doc = item.model_dump()
        doc["created_at"] = doc["created_at"].isoformat()
        await db.shopping_items.insert_one(doc)
        # Increment frequent items
        name_lower = item.name.strip().lower()
        await db.frequent_items.update_one(
            {"family_id": user.family_id, "name_lower": name_lower},
            {
                "$set": {
                    "name": item.name.strip(),
                    "family_id": user.family_id,
                    "name_lower": name_lower,
                    "last_used": datetime.now(timezone.utc).isoformat(),
                    "supermarket": item.supermarket,
                    "category": item.category,
                },
                "$inc": {"count": 1},
            },
            upsert=True,
        )
        added += 1
    return {"added": added}


# ============== APP SETUP ==============
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
