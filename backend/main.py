from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import logging
import uuid
import hashlib
import secrets
from datetime import datetime, timezone, timedelta, date as date_type
from typing import List, Optional, Annotated

import bcrypt
import jwt
import httpx
import requests
from fastapi import (
    FastAPI, APIRouter, HTTPException, Request, Response, Depends,
    UploadFile, File, Header, Query, BackgroundTasks
)
from fastapi.responses import Response as FastAPIResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, BeforeValidator, ConfigDict
from bson import ObjectId

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("yrm")

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

AXES = ["aim", "recoil", "movement", "game_sense", "positioning", "communication", "decision_making"]
ROLES = ["Assaulter", "IGL", "Support", "Sniper", "Entry Fragger"]

# ---------------------------------------------------------------------------
# Object Storage
# ---------------------------------------------------------------------------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "yrm-coach-portal"
storage_key = None

MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp",
}


def init_storage(force: bool = False):
    global storage_key
    if storage_key and not force:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------------------------------------------------------------------------
# Auth utilities
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str, token_version: int = 0) -> str:
    payload = {"sub": user_id, "email": email, "ver": token_version,
               "exp": datetime.now(timezone.utc) + timedelta(minutes=15), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str, token_version: int = 0) -> str:
    payload = {"sub": user_id, "ver": token_version,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    response.set_cookie("access_token", access_token, httponly=True, secure=True,
                        samesite="none", max_age=900, path="/")
    response.set_cookie("refresh_token", refresh_token, httponly=True, secure=True,
                        samesite="none", max_age=604800, path="/")


def public_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "name": user.get("name", ""),
        "role": user.get("role", "player"),
        "picture": user.get("picture"),
        "profile_completed": user.get("profile_completed", False),
        "auth_provider": user.get("auth_provider", "password"),
        "coach_id": user.get("coach_id"),
    }


async def resolve_user(request: Request) -> Optional[dict]:
    # 1. JWT access token cookie
    token = request.cookies.get("access_token")
    session_token = request.cookies.get("session_token")
    auth_header = request.headers.get("Authorization", "")
    bearer = auth_header[7:] if auth_header.startswith("Bearer ") else None

    if token:
        try:
            payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
            if payload.get("type") == "access":
                user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
                if user and payload.get("ver", 0) == user.get("token_version", 0):
                    return user
        except Exception:
            pass

    # 2. Google session token (cookie or bearer)
    for candidate in (session_token, bearer):
        if not candidate:
            continue
        sess = await db.user_sessions.find_one({"session_token": candidate})
        if sess:
            expires_at = sess["expires_at"]
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at)
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at > datetime.now(timezone.utc):
                user = await db.users.find_one({"_id": ObjectId(sess["user_id"])})
                if user:
                    return user

    # 3. Bearer as JWT
    if bearer:
        try:
            payload = jwt.decode(bearer, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
            if payload.get("type") == "access":
                user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
                if user and payload.get("ver", 0) == user.get("token_version", 0):
                    return user
        except Exception:
            pass
    return None


async def get_current_user(request: Request) -> dict:
    user = await resolve_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if user.get("banned"):
        raise HTTPException(status_code=403, detail="تم إيقاف هذا الحساب من قبل المدرب")
    return user


async def require_coach(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") != "coach":
        raise HTTPException(status_code=403, detail="Coach access only")
    return user


def check_origin(request: Request):
    origin = request.headers.get("Origin")
    if origin and origin.rstrip("/") != FRONTEND_URL.rstrip("/"):
        pass  # permissive; CORS middleware guards browsers


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RegisterInput(BaseModel):
    email: EmailStr
    password: str
    name: str
    invite_token: Optional[str] = None


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class ForgotInput(BaseModel):
    email: EmailStr


class ResetInput(BaseModel):
    token: str
    password: str


class Assessment(BaseModel):
    aim: float
    recoil: float
    movement: float
    game_sense: float
    positioning: float
    communication: float
    decision_making: float


class ProfileInput(BaseModel):
    full_name: str
    ign: str
    uid: str
    age: int
    country: str
    avatar_path: Optional[str] = None
    device: str
    controls: str
    gyroscope: bool
    fps: str
    ping: str
    years_playing: float
    role: str
    assessment: Assessment


class CheckinInput(BaseModel):
    assessment: Assessment
    star_rating: int
    problem_text: str = ""
    improvement_text: str = ""
    matches_count: int = 0
    hours_played: float = 0
    training_done: bool = False
    screenshot_path: Optional[str] = None


class EvaluationInput(BaseModel):
    date: str
    assessment: Assessment
    coach_note: str = ""
    next_focus: str


class NoteInput(BaseModel):
    note: str


class FeedbackInput(BaseModel):
    checkin_date: Optional[str] = None
    feedback_text: str


def avg_assessment(a: dict) -> float:
    vals = [float(a[k]) for k in AXES]
    return round(sum(vals) / len(vals), 1)


def today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


# ---------------------------------------------------------------------------
# Password reset email
# ---------------------------------------------------------------------------
from html import escape
from urllib.parse import urlparse

EMAIL_BASE_URL = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip().rstrip("/") or "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY", "")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME") or "YRM Coach Portal"


async def send_password_reset_email(to_email: str, token: str) -> bool:
    base = os.environ.get("FRONTEND_URL", "").rstrip("/")
    link = f"{base}/reset-password?token={token}"
    if not EMAIL_KEY or EMAIL_KEY.startswith("{") or not base.startswith("https://"):
        if urlparse(base).hostname in ("localhost", "127.0.0.1", "::1"):
            logger.warning("Email not configured; password reset link: %s", link)
        else:
            logger.error("Password reset email not configured (EMERGENT_EMAIL_KEY / FRONTEND_URL)")
        return False
    brand = escape(EMAIL_FROM_NAME)
    html = (
        f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif">'
        f'<p>We received a request to reset your {brand} password.</p>'
        f'<p><a href="{escape(link)}">Reset your password</a></p>'
        f'<p>This link expires in 1 hour and can be used once. If you did not request it, ignore this email.</p>'
        f'</td></tr></table>'
    )
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            resp = await c.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json={"to": [to_email], "subject": f"Reset your {EMAIL_FROM_NAME} password",
                      "html": html, "from_name": EMAIL_FROM_NAME},
            )
        resp.raise_for_status()
        return True
    except Exception as e:
        logger.error(f"Password reset email failed: {e}")
        return False


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
GENERIC_RESET = {"message": "If that email is registered, a reset link has been sent."}


@api_router.post("/auth/register")
async def register(input: RegisterInput, response: Response):
    email = input.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="هذا الايميل مسجل مسبقاً")
    invite = None
    if input.invite_token:
        invite = await db.invites.find_one({"token": input.invite_token, "used_by": None})
    doc = {
        "email": email,
        "password_hash": hash_password(input.password),
        "name": input.name,
        "role": "player",
        "auth_provider": "password",
        "token_version": 0,
        "profile_completed": False,
        "coach_id": invite["coach_id"] if invite else None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    uid = str(res.inserted_id)
    if invite:
        await db.invites.update_one(
            {"_id": invite["_id"]},
            {"$set": {"used_by": uid, "used_at": datetime.now(timezone.utc).isoformat()}},
        )
    set_auth_cookies(response, create_access_token(uid, email, 0), create_refresh_token(uid, 0))
    return public_user(doc)


@api_router.post("/auth/login")
async def login(input: LoginInput, request: Request, response: Response):
    email = input.email.lower().strip()
    ip = request.client.host if request.client else "unknown"
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(minutes=15)

    # Key on email: behind the ingress request.client.host rotates across proxy pods.
    recent = await db.login_attempts.count_documents({
        "email": email,
        "created_at": {"$gt": window_start.isoformat()},
    })
    if recent >= 5:
        raise HTTPException(status_code=429, detail="محاولات كثيرة. حاول بعد 15 دقيقة")

    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(input.password, user["password_hash"]):
        await db.login_attempts.insert_one({
            "identifier": f"{ip}:{email}", "email": email, "created_at": now.isoformat(),
        })
        raise HTTPException(status_code=401, detail="ايميل أو باسورد غير صحيح")

    if user.get("banned"):
        raise HTTPException(status_code=403, detail="تم إيقاف هذا الحساب من قبل المدرب")

    await db.login_attempts.delete_many({"email": email})
    uid = str(user["_id"])
    ver = user.get("token_version", 0)
    set_auth_cookies(response, create_access_token(uid, email, ver), create_refresh_token(uid, ver))
    return public_user(user)


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    response.delete_cookie("session_token", path="/")
    return {"message": "logged out"}


@api_router.get("/auth/me")
async def me(request: Request):
    user = await get_current_user(request)
    return public_user(user)


@api_router.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    rt = request.cookies.get("refresh_token")
    if not rt:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(rt, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user or payload.get("ver", 0) != user.get("token_version", 0):
        raise HTTPException(status_code=401, detail="Session expired")
    uid = str(user["_id"])
    response.set_cookie("access_token", create_access_token(uid, user["email"], user.get("token_version", 0)),
                        httponly=True, secure=True, samesite="none", max_age=900, path="/")
    return {"message": "refreshed"}


@api_router.post("/auth/forgot-password")
async def forgot_password(input: ForgotInput, background_tasks: BackgroundTasks):
    email = input.email.lower().strip()
    now = datetime.now(timezone.utc)
    await db.password_reset_requests.insert_one({"email": email, "created_at": now.isoformat()})
    window_start = now - timedelta(minutes=15)
    count = await db.password_reset_requests.count_documents({
        "email": email, "created_at": {"$gt": window_start.isoformat()},
    })
    if count > 5:
        return GENERIC_RESET
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash"):
        return GENERIC_RESET
    raw = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    await db.password_reset_tokens.insert_one({
        "token_hash": token_hash, "user_id": str(user["_id"]), "email": email,
        "expires_at": (now + timedelta(hours=1)).isoformat(), "used": False,
    })
    background_tasks.add_task(send_password_reset_email, user["email"], raw)
    return GENERIC_RESET


@api_router.post("/auth/reset-password")
async def reset_password(input: ResetInput):
    h = hashlib.sha256(input.token.encode()).hexdigest()
    now = datetime.now(timezone.utc).isoformat()
    doc = await db.password_reset_tokens.find_one_and_update(
        {"token_hash": h, "used": False, "expires_at": {"$gt": now}},
        {"$set": {"used": True}},
    )
    if not doc:
        raise HTTPException(status_code=400, detail="رابط غير صالح أو منتهي")
    await db.users.update_one(
        {"_id": ObjectId(doc["user_id"])},
        {"$set": {"password_hash": hash_password(input.password)}, "$inc": {"token_version": 1}},
    )
    await db.password_reset_tokens.delete_many({"user_id": doc["user_id"], "used": False})
    await db.login_attempts.delete_many({"email": doc["email"]})
    return {"message": "تم تغيير الباسورد"}


@api_router.post("/auth/google/session")
async def google_session(request: Request, response: Response, x_session_id: str = Header(None)):
    if not x_session_id:
        raise HTTPException(status_code=400, detail="Missing session id")
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": x_session_id},
            )
        r.raise_for_status()
        data = r.json()
    except Exception:
        raise HTTPException(status_code=401, detail="Google auth failed")

    email = data["email"].lower().strip()
    user = await db.users.find_one({"email": email})
    if not user:
        doc = {
            "email": email, "name": data.get("name", ""), "role": "player",
            "auth_provider": "google", "picture": data.get("picture"),
            "token_version": 0, "profile_completed": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        res = await db.users.insert_one(doc)
        doc["_id"] = res.inserted_id
        user = doc
    else:
        await db.users.update_one({"_id": user["_id"]}, {"$set": {"picture": data.get("picture")}})

    session_token = data["session_token"]
    await db.user_sessions.insert_one({
        "user_id": str(user["_id"]),
        "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    response.set_cookie("session_token", session_token, httponly=True, secure=True,
                        samesite="none", max_age=604800, path="/")
    return public_user(user)


# ---------------------------------------------------------------------------
# File upload
# ---------------------------------------------------------------------------
@api_router.post("/upload")
async def upload(request: Request, file: UploadFile = File(...)):
    user = await get_current_user(request)
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    content_type = MIME_TYPES.get(ext, file.content_type or "application/octet-stream")
    path = f"{APP_NAME}/uploads/{str(user['_id'])}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    result = put_object(path, data, content_type)
    await db.files.insert_one({
        "storage_path": result["path"],
        "owner_id": str(user["_id"]),
        "original_filename": file.filename,
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"path": result["path"]}


@api_router.get("/files/{path:path}")
async def download_file(path: str, request: Request, auth: str = Query(None)):
    # allow cookie auth or ?auth= bearer token for <img>
    user = await resolve_user(request)
    if not user and auth:
        sess = await db.user_sessions.find_one({"session_token": auth})
        if sess:
            user = await db.users.find_one({"_id": ObjectId(sess["user_id"])})
        if not user:
            try:
                payload = jwt.decode(auth, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
                user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
            except Exception:
                pass
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    record = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    data, ct = get_object(path)
    return FastAPIResponse(content=data, media_type=record.get("content_type", ct))


# ---------------------------------------------------------------------------
# Player endpoints
# ---------------------------------------------------------------------------
@api_router.get("/player/profile")
async def get_my_profile(request: Request):
    user = await get_current_user(request)
    profile = await db.player_profiles.find_one({"player_id": str(user["_id"])}, {"_id": 0})
    return profile or {}


@api_router.post("/player/profile")
async def save_my_profile(input: ProfileInput, request: Request):
    user = await get_current_user(request)
    pid = str(user["_id"])
    a = input.assessment.model_dump()
    doc = input.model_dump()
    doc["assessment"] = a
    doc["initial_overall"] = avg_assessment(a)
    doc["player_id"] = pid
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    existing = await db.player_profiles.find_one({"player_id": pid})
    if existing:
        await db.player_profiles.update_one({"player_id": pid}, {"$set": doc})
    else:
        doc["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.player_profiles.insert_one(doc)
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"profile_completed": True, "name": input.full_name}})
    return {"message": "saved", "initial_overall": doc["initial_overall"]}


@api_router.get("/player/checkin/today")
async def get_today_checkin(request: Request):
    user = await get_current_user(request)
    c = await db.daily_checkins.find_one({"player_id": str(user["_id"]), "date": today_str()}, {"_id": 0})
    return c or {}


@api_router.post("/player/checkin")
async def submit_checkin(input: CheckinInput, request: Request):
    user = await get_current_user(request)
    pid = str(user["_id"])
    d = today_str()
    a = input.assessment.model_dump()
    doc = input.model_dump()
    doc["assessment"] = a
    doc["self_overall"] = avg_assessment(a)
    doc["player_id"] = pid
    doc["date"] = d
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    existing = await db.daily_checkins.find_one({"player_id": pid, "date": d})
    if existing:
        await db.daily_checkins.update_one({"player_id": pid, "date": d}, {"$set": doc})
    else:
        await db.daily_checkins.insert_one(doc)
    await db.notifications.delete_many({"user_id": pid, "type": "reminder", "date": d})
    return {"message": "saved", "self_overall": doc["self_overall"]}


async def build_progress(pid: str):
    checkins = await db.daily_checkins.find({"player_id": pid}, {"_id": 0}).sort("date", 1).to_list(1000)
    evals = await db.coach_evaluations.find({"player_id": pid}, {"_id": 0}).to_list(1000)
    eval_by_date = {e["date"]: e for e in evals}
    rows = []
    for c in checkins:
        row = {"date": c["date"], "self_overall": c.get("self_overall")}
        if c["date"] in eval_by_date:
            row["coach_overall"] = eval_by_date[c["date"]].get("coach_overall")
        rows.append(row)
    # include coach evals on dates without checkins
    for e in evals:
        if e["date"] not in {c["date"] for c in checkins}:
            rows.append({"date": e["date"], "self_overall": None, "coach_overall": e.get("coach_overall")})
    rows.sort(key=lambda r: r["date"])
    return rows


@api_router.get("/player/dashboard")
async def player_dashboard(request: Request):
    user = await get_current_user(request)
    pid = str(user["_id"])
    profile = await db.player_profiles.find_one({"player_id": pid}, {"_id": 0})
    latest_eval = await db.coach_evaluations.find({"player_id": pid}, {"_id": 0}).sort("date", -1).to_list(1)
    current_focus = latest_eval[0].get("next_focus") if latest_eval else (profile.get("role") if profile else None)
    feedback = await db.coach_feedback.find({"player_id": pid}, {"_id": 0}).sort("created_at", -1).to_list(100)
    today = await db.daily_checkins.find_one({"player_id": pid, "date": today_str()}, {"_id": 0})
    progress = await build_progress(pid)
    coach_name = None
    if user.get("coach_id"):
        try:
            coach = await db.users.find_one({"_id": ObjectId(user["coach_id"])})
            coach_name = coach.get("name") if coach else None
        except Exception:
            coach_name = None
    return {
        "profile": profile or {},
        "current_focus": current_focus,
        "coach_name": coach_name,
        "feedback": feedback,
        "checkin_done_today": bool(today),
        "today_checkin": today or {},
        "progress": progress,
    }


# ---------------------------------------------------------------------------
# Coach endpoints
# ---------------------------------------------------------------------------
async def player_summary(u: dict):
    pid = str(u["_id"])
    profile = await db.player_profiles.find_one({"player_id": pid}, {"_id": 0})
    checkins = await db.daily_checkins.find({"player_id": pid}, {"_id": 0}).sort("date", -1).to_list(10)
    last_overall = checkins[0]["self_overall"] if checkins else (profile.get("initial_overall") if profile else None)
    progress_delta = None
    if len(checkins) >= 2:
        progress_delta = round(checkins[0]["self_overall"] - checkins[1]["self_overall"], 1)
    latest_eval = await db.coach_evaluations.find({"player_id": pid}, {"_id": 0}).sort("date", -1).to_list(1)
    focus = latest_eval[0].get("next_focus") if latest_eval else None

    # status
    last_date = checkins[0]["date"] if checkins else None
    days_inactive = None
    if last_date:
        days_inactive = (datetime.now(timezone.utc).date() - datetime.strptime(last_date, "%Y-%m-%d").date()).days
    status = "green"
    if days_inactive is None or days_inactive >= 3:
        status = "red"
    elif (progress_delta is not None and progress_delta < 0) or (days_inactive is not None and days_inactive >= 1):
        status = "yellow"
    return {
        "player_id": pid,
        "name": u.get("name") or (profile.get("full_name") if profile else u["email"]),
        "email": u["email"],
        "uid": profile.get("uid") if profile else None,
        "ign": profile.get("ign") if profile else None,
        "avatar_path": profile.get("avatar_path") if profile else None,
        "role": profile.get("role") if profile else None,
        "level": last_overall,
        "progress_delta": progress_delta,
        "focus": focus,
        "status": status,
        "days_inactive": days_inactive,
        "checkin_today": bool(checkins and checkins[0]["date"] == today_str()),
        "profile_completed": u.get("profile_completed", False),
        "banned": bool(u.get("banned")),
    }


@api_router.get("/coach/dashboard")
async def coach_dashboard(request: Request, q: str = Query(None)):
    await require_coach(request)
    players = await db.users.find({"role": "player"}).to_list(1000)
    summaries = [await player_summary(u) for u in players]
    if q:
        ql = q.lower()
        summaries = [s for s in summaries if ql in (s["name"] or "").lower() or ql in (s["email"] or "").lower()
                     or ql in str(s.get("uid") or "").lower() or ql in str(s.get("ign") or "").lower()
                     or ql in str(s.get("player_id", "")).lower()]

    total = len(summaries)
    active_today = sum(1 for s in summaries if s["checkin_today"])
    needs_attention = sum(1 for s in summaries if s["status"] == "red" or (s["progress_delta"] is not None and s["progress_delta"] < 0))
    # training completed today %
    done = 0
    for u in players:
        c = await db.daily_checkins.find_one({"player_id": str(u["_id"]), "date": today_str()})
        if c and c.get("training_done"):
            done += 1
    training_pct = round((done / total) * 100) if total else 0

    alerts = []
    for s in summaries:
        if s["days_inactive"] is not None and s["days_inactive"] >= 3:
            alerts.append({"type": "inactive", "text": f"⚠️ {s['name']} ما سوى Check-in من {s['days_inactive']} أيام"})
        elif s["days_inactive"] is None:
            alerts.append({"type": "inactive", "text": f"⚠️ {s['name']} ما سوى أي Check-in بعد"})
        if s["progress_delta"] is not None and s["progress_delta"] < 0:
            alerts.append({"type": "decline", "text": f"🔴 مستوى {s['name']} نازل ({s['progress_delta']})"})

    return {
        "stats": {
            "total_players": total,
            "active_today": active_today,
            "needs_attention": needs_attention,
            "training_completed_pct": training_pct,
        },
        "players": summaries,
        "alerts": alerts,
    }


async def get_player_or_404(player_id: str) -> dict:
    try:
        u = await db.users.find_one({"_id": ObjectId(player_id)})
    except Exception:
        u = None
    if not u:
        raise HTTPException(status_code=404, detail="Player not found")
    return u


@api_router.get("/coach/players/{player_id}")
async def coach_player_detail(player_id: str, request: Request):
    await require_coach(request)
    u = await get_player_or_404(player_id)
    profile = await db.player_profiles.find_one({"player_id": player_id}, {"_id": 0})
    latest_checkin = await db.daily_checkins.find({"player_id": player_id}, {"_id": 0}).sort("date", -1).to_list(1)
    latest_eval = await db.coach_evaluations.find({"player_id": player_id}, {"_id": 0}).sort("date", -1).to_list(1)
    return {
        "player_id": player_id,
        "name": u.get("name"),
        "email": u["email"],
        "banned": bool(u.get("banned")),
        "profile": profile or {},
        "latest_self": latest_checkin[0]["assessment"] if latest_checkin else (profile.get("assessment") if profile else None),
        "latest_self_overall": latest_checkin[0]["self_overall"] if latest_checkin else (profile.get("initial_overall") if profile else None),
        "latest_coach": latest_eval[0]["assessment"] if latest_eval else None,
        "latest_coach_overall": latest_eval[0]["coach_overall"] if latest_eval else None,
        "current_focus": latest_eval[0].get("next_focus") if latest_eval else None,
    }


@api_router.get("/coach/players/{player_id}/checkins")
async def coach_player_checkins(player_id: str, request: Request):
    await require_coach(request)
    checkins = await db.daily_checkins.find({"player_id": player_id}, {"_id": 0}).sort("date", -1).to_list(1000)
    dates = [c["date"] for c in checkins]
    return {"dates": dates, "checkins": checkins}


@api_router.get("/coach/players/{player_id}/checkin")
async def coach_player_checkin_date(player_id: str, request: Request, date: str = Query(...)):
    await require_coach(request)
    checkin = await db.daily_checkins.find_one({"player_id": player_id, "date": date}, {"_id": 0})
    evaluation = await db.coach_evaluations.find_one({"player_id": player_id, "date": date}, {"_id": 0})
    gap = None
    if checkin and evaluation:
        gap = compute_gap(checkin["assessment"], evaluation["assessment"])
    return {"checkin": checkin or {}, "evaluation": evaluation or {}, "perception_gap": gap}


def compute_gap(self_a: dict, coach_a: dict):
    axis_labels = {
        "aim": "Aim", "recoil": "Recoil Control", "movement": "Movement",
        "game_sense": "Game Sense", "positioning": "Positioning",
        "communication": "Communication", "decision_making": "Decision Making",
    }
    alerts = []
    for k in AXES:
        diff = round(float(self_a[k]) - float(coach_a[k]), 1)
        if abs(diff) >= 1.5:
            direction = "أعلى" if diff > 0 else "أقل"
            alerts.append({"axis": axis_labels[k], "diff": abs(diff),
                           "text": f"اللاعب يقيّم {axis_labels[k]} {direction} من تقييمك بـ {abs(diff)} نقطة"})
    self_overall = avg_assessment(self_a)
    coach_overall = avg_assessment(coach_a)
    return {
        "self_overall": self_overall,
        "coach_overall": coach_overall,
        "overall_diff": round(self_overall - coach_overall, 1),
        "alerts": alerts,
    }


@api_router.post("/coach/players/{player_id}/evaluation")
async def coach_save_evaluation(player_id: str, input: EvaluationInput, request: Request):
    coach = await require_coach(request)
    await get_player_or_404(player_id)
    a = input.assessment.model_dump()
    doc = {
        "player_id": player_id,
        "coach_id": str(coach["_id"]),
        "date": input.date,
        "assessment": a,
        "coach_overall": avg_assessment(a),
        "coach_note": input.coach_note,
        "next_focus": input.next_focus,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    existing = await db.coach_evaluations.find_one({"player_id": player_id, "date": input.date})
    if existing:
        await db.coach_evaluations.update_one({"player_id": player_id, "date": input.date}, {"$set": doc})
    else:
        await db.coach_evaluations.insert_one(doc)
    if input.coach_note.strip():
        await db.coach_notes.insert_one({
            "player_id": player_id, "coach_id": str(coach["_id"]),
            "note": input.coach_note, "date": input.date,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    checkin = await db.daily_checkins.find_one({"player_id": player_id, "date": input.date}, {"_id": 0})
    gap = compute_gap(checkin["assessment"], a) if checkin else None
    return {"message": "saved", "coach_overall": doc["coach_overall"], "perception_gap": gap}


@api_router.get("/coach/players/{player_id}/history")
async def coach_player_history(player_id: str, request: Request):
    await require_coach(request)
    checkins = await db.daily_checkins.find({"player_id": player_id}, {"_id": 0}).to_list(1000)
    evals = await db.coach_evaluations.find({"player_id": player_id}, {"_id": 0}).to_list(1000)
    self_by_date = {c["date"]: c.get("self_overall") for c in checkins}
    coach_by_date = {e["date"]: e.get("coach_overall") for e in evals}
    all_dates = sorted(set(self_by_date) | set(coach_by_date))
    rows = []
    for d in all_dates:
        s = self_by_date.get(d)
        co = coach_by_date.get(d)
        diff = round(s - co, 1) if (s is not None and co is not None) else None
        rows.append({"date": d, "self": s, "coach": co, "diff": diff})
    return {"rows": rows}


@api_router.get("/coach/players/{player_id}/media")
async def coach_player_media(player_id: str, request: Request):
    await require_coach(request)
    profile = await db.player_profiles.find_one({"player_id": player_id}, {"_id": 0})
    media = []
    if profile and profile.get("avatar_path"):
        media.append({"path": profile["avatar_path"], "date": profile.get("created_at", ""), "label": "Profile"})
    checkins = await db.daily_checkins.find(
        {"player_id": player_id, "screenshot_path": {"$ne": None}}, {"_id": 0}
    ).sort("date", -1).to_list(1000)
    for c in checkins:
        if c.get("screenshot_path"):
            media.append({"path": c["screenshot_path"], "date": c["date"], "label": "Check-in"})
    return {"media": media}


@api_router.get("/coach/players/{player_id}/notes")
async def coach_get_notes(player_id: str, request: Request):
    await require_coach(request)
    notes = await db.coach_notes.find({"player_id": player_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return {"notes": notes}


@api_router.post("/coach/players/{player_id}/notes")
async def coach_add_note(player_id: str, input: NoteInput, request: Request):
    coach = await require_coach(request)
    await get_player_or_404(player_id)
    doc = {
        "player_id": player_id, "coach_id": str(coach["_id"]),
        "note": input.note, "date": today_str(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.coach_notes.insert_one(doc)
    doc.pop("_id", None)
    return {"message": "saved"}


@api_router.post("/coach/players/{player_id}/feedback")
async def coach_add_feedback(player_id: str, input: FeedbackInput, request: Request):
    coach = await require_coach(request)
    await get_player_or_404(player_id)
    doc = {
        "player_id": player_id, "coach_id": str(coach["_id"]),
        "checkin_date": input.checkin_date, "feedback_text": input.feedback_text,
        "date": today_str(), "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.coach_feedback.insert_one(doc)
    return {"message": "saved"}


@api_router.post("/coach/players/{player_id}/ban")
async def coach_ban_player(player_id: str, request: Request):
    await require_coach(request)
    u = await get_player_or_404(player_id)
    if u.get("role") == "coach":
        raise HTTPException(status_code=400, detail="لا يمكن إيقاف حساب مدرب")
    await db.users.update_one(
        {"_id": u["_id"]},
        {"$set": {"banned": True}, "$inc": {"token_version": 1}},
    )
    await db.user_sessions.delete_many({"user_id": player_id})
    return {"message": "banned", "banned": True}


@api_router.post("/coach/players/{player_id}/unban")
async def coach_unban_player(player_id: str, request: Request):
    await require_coach(request)
    u = await get_player_or_404(player_id)
    await db.users.update_one({"_id": u["_id"]}, {"$set": {"banned": False}})
    return {"message": "unbanned", "banned": False}


@api_router.delete("/coach/players/{player_id}")
async def coach_delete_player(player_id: str, request: Request):
    await require_coach(request)
    u = await get_player_or_404(player_id)
    if u.get("role") == "coach":
        raise HTTPException(status_code=400, detail="لا يمكن حذف حساب مدرب")
    for col in ("player_profiles", "daily_checkins", "coach_evaluations",
                "coach_notes", "coach_feedback", "weekly_reports"):
        await db[col].delete_many({"player_id": player_id})
    await db.notifications.delete_many({"user_id": player_id})
    await db.user_sessions.delete_many({"user_id": player_id})
    await db.invites.update_many({"used_by": player_id}, {"$set": {"used_by": None, "used_at": None}})
    await db.users.delete_one({"_id": u["_id"]})
    return {"message": "deleted"}


@api_router.get("/coach/players/{player_id}/feedback")
async def coach_get_feedback(player_id: str, request: Request):
    await require_coach(request)
    fb = await db.coach_feedback.find({"player_id": player_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return {"feedback": fb}


# ---------------------------------------------------------------------------
# Invites
# ---------------------------------------------------------------------------
class InviteInput(BaseModel):
    note: str = ""


def invite_url(token: str) -> str:
    return f"{FRONTEND_URL.rstrip('/')}/register?invite={token}"


@api_router.post("/coach/invites")
async def create_invite(input: InviteInput, request: Request):
    coach = await require_coach(request)
    token = secrets.token_urlsafe(12)
    doc = {
        "token": token, "coach_id": str(coach["_id"]), "coach_name": coach.get("name"),
        "note": input.note, "used_by": None, "used_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.invites.insert_one(doc)
    return {"token": token, "url": invite_url(token), "note": input.note}


@api_router.get("/coach/invites")
async def list_invites(request: Request):
    coach = await require_coach(request)
    invites = await db.invites.find({"coach_id": str(coach["_id"])}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for inv in invites:
        inv["url"] = invite_url(inv["token"])
        if inv.get("used_by"):
            try:
                u = await db.users.find_one({"_id": ObjectId(inv["used_by"])})
                inv["used_by_name"] = u.get("name") if u else None
            except Exception:
                inv["used_by_name"] = None
    return {"invites": invites}


@api_router.get("/auth/invite/{token}")
async def check_invite(token: str):
    inv = await db.invites.find_one({"token": token}, {"_id": 0})
    if not inv:
        return {"valid": False}
    return {"valid": inv.get("used_by") is None, "coach_name": inv.get("coach_name"),
            "used": inv.get("used_by") is not None}


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------
@api_router.get("/notifications")
async def get_notifications(request: Request):
    user = await get_current_user(request)
    notes = await db.notifications.find({"user_id": str(user["_id"])}, {"_id": 0}).sort("created_at", -1).to_list(50)
    unread = sum(1 for n in notes if not n.get("read"))
    return {"notifications": notes, "unread": unread}


@api_router.post("/notifications/read-all")
async def read_all_notifications(request: Request):
    user = await get_current_user(request)
    await db.notifications.update_many({"user_id": str(user["_id"]), "read": False}, {"$set": {"read": True}})
    return {"message": "ok"}


# ---------------------------------------------------------------------------
# Weekly Report
# ---------------------------------------------------------------------------
AXIS_LABELS = {
    "aim": "Aim", "recoil": "Recoil Control", "movement": "Movement",
    "game_sense": "Game Sense", "positioning": "Positioning",
    "communication": "Communication", "decision_making": "Decision Making",
}


def week_bounds(offset: int = 0):
    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=today.weekday()) - timedelta(weeks=offset)
    end = start + timedelta(days=6)
    return start.isoformat(), end.isoformat()


async def compute_weekly_report(pid: str):
    ts, te = week_bounds(0)
    ps, pe = week_bounds(1)
    checkins = await db.daily_checkins.find({"player_id": pid}, {"_id": 0}).to_list(2000)
    this_c = [c for c in checkins if ts <= c["date"] <= te]
    prev_c = [c for c in checkins if ps <= c["date"] <= pe]

    def avg_o(lst):
        return round(sum(c["self_overall"] for c in lst) / len(lst), 1) if lst else None

    this_avg = avg_o(this_c)
    prev_avg = avg_o(prev_c)
    delta = round(this_avg - prev_avg, 1) if (this_avg is not None and prev_avg is not None) else None

    def axis_means(lst):
        out = {}
        for k in AXES:
            vals = [float(c["assessment"][k]) for c in lst if c.get("assessment")]
            out[k] = round(sum(vals) / len(vals), 1) if vals else None
        return out

    axis_avg = axis_means(this_c)
    prev_axis = axis_means(prev_c)
    present = {k: v for k, v in axis_avg.items() if v is not None}
    strongest = max(present, key=present.get) if present else None
    weakest = min(present, key=present.get) if present else None
    most_improved, best_delta = None, None
    for k in AXES:
        if axis_avg[k] is not None and prev_axis[k] is not None:
            dd = axis_avg[k] - prev_axis[k]
            if best_delta is None or dd > best_delta:
                best_delta, most_improved = dd, k

    training_done = sum(1 for c in this_c if c.get("training_done"))
    latest_eval = await db.coach_evaluations.find({"player_id": pid}, {"_id": 0}).sort("date", -1).to_list(1)
    return {
        "week_start": ts, "week_end": te,
        "checkin_count": len(this_c),
        "avg_overall": this_avg, "prev_avg_overall": prev_avg, "delta": delta,
        "axis_avg": {AXIS_LABELS[k]: axis_avg[k] for k in AXES},
        "strongest": {"axis": AXIS_LABELS[strongest], "value": axis_avg[strongest]} if strongest else None,
        "weakest": {"axis": AXIS_LABELS[weakest], "value": axis_avg[weakest]} if weakest else None,
        "most_improved": {"axis": AXIS_LABELS[most_improved], "delta": round(best_delta, 1)} if (most_improved and best_delta and best_delta > 0) else None,
        "training_done": training_done,
        "training_rate": round((training_done / len(this_c)) * 100) if this_c else 0,
        "total_hours": round(sum(c.get("hours_played", 0) for c in this_c), 1),
        "total_matches": sum(c.get("matches_count", 0) for c in this_c),
        "current_focus": latest_eval[0].get("next_focus") if latest_eval else None,
    }


@api_router.get("/player/weekly-report")
async def player_weekly_report(request: Request):
    user = await get_current_user(request)
    return await compute_weekly_report(str(user["_id"]))


@api_router.get("/coach/players/{player_id}/weekly-report")
async def coach_weekly_report(player_id: str, request: Request):
    await require_coach(request)
    await get_player_or_404(player_id)
    return await compute_weekly_report(player_id)


# ---------------------------------------------------------------------------
# Cron webhooks
# ---------------------------------------------------------------------------
def verify_cron_auth(authorization: Optional[str]):
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization[7:]
    if not secret or not secrets.compare_digest(token, secret):
        raise HTTPException(status_code=401, detail="Unauthorized")


async def _run_daily_reminders():
    players = await db.users.find({"role": "player", "profile_completed": True}).to_list(2000)
    d = today_str()
    for u in players:
        pid = str(u["_id"])
        c = await db.daily_checkins.find_one({"player_id": pid, "date": d})
        if c:
            continue
        exists = await db.notifications.find_one({"user_id": pid, "type": "reminder", "date": d})
        if exists:
            continue
        await db.notifications.insert_one({
            "user_id": pid, "type": "reminder",
            "text": "ما سويت Daily Check-in اليوم — سجّل أداءك عشان يتابع مدربك تطورك.",
            "date": d, "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })


async def _run_weekly_reports():
    players = await db.users.find({"role": "player", "profile_completed": True}).to_list(2000)
    for u in players:
        pid = str(u["_id"])
        rep = await compute_weekly_report(pid)
        await db.weekly_reports.update_one(
            {"player_id": pid, "week_start": rep["week_start"]},
            {"$set": {**rep, "player_id": pid, "generated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
        exists = await db.notifications.find_one({"user_id": pid, "type": "weekly_report", "date": rep["week_start"]})
        if exists:
            continue
        await db.notifications.insert_one({
            "user_id": pid, "type": "weekly_report",
            "text": f"تقريرك الأسبوعي جاهز — Overall {rep.get('avg_overall') if rep.get('avg_overall') is not None else '-'}.",
            "date": rep["week_start"], "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })


async def _ack_once(x_webhook_id: Optional[str]) -> bool:
    if not x_webhook_id:
        return True
    seen = await db.cron_runs.find_one({"run_id": x_webhook_id})
    if seen:
        return False
    await db.cron_runs.insert_one({"run_id": x_webhook_id, "created_at": datetime.now(timezone.utc).isoformat()})
    return True


@api_router.post("/cron/daily-reminders")
async def cron_daily_reminders(background_tasks: BackgroundTasks, authorization: Optional[str] = Header(None), x_webhook_id: Optional[str] = Header(None)):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    verify_cron_auth(authorization)
    if not await _ack_once(x_webhook_id):
        return {"status": "duplicate"}
    background_tasks.add_task(_run_daily_reminders)
    return {"status": "accepted"}


@api_router.post("/cron/weekly-reports")
async def cron_weekly_reports(background_tasks: BackgroundTasks, authorization: Optional[str] = Header(None), x_webhook_id: Optional[str] = Header(None)):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    verify_cron_auth(authorization)
    if not await _ack_once(x_webhook_id):
        return {"status": "duplicate"}
    background_tasks.add_task(_run_weekly_reports)
    return {"status": "accepted"}


@api_router.get("/meta")
async def meta():
    return {"axes": AXES, "roles": ROLES}


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "coachyrm@gmail.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    admin_name = os.environ.get("ADMIN_NAME", "YRM Coach")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "email": admin_email, "password_hash": hash_password(admin_password),
            "name": admin_name, "role": "coach", "auth_provider": "password",
            "token_version": 0, "profile_completed": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    else:
        updates = {"role": "coach"}
        if not existing.get("password_hash") or not verify_password(admin_password, existing["password_hash"]):
            updates["password_hash"] = hash_password(admin_password)
        await db.users.update_one({"email": admin_email}, {"$set": updates})


@app.on_event("startup")
async def startup():
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    await db.users.create_index("email", unique=True)
    await db.password_reset_tokens.create_index("token_hash", unique=True)
    await db.login_attempts.create_index("email")
    await db.login_attempts.create_index("identifier")
    await db.password_reset_requests.create_index("email")
    await db.player_profiles.create_index("player_id", unique=True)
    await db.daily_checkins.create_index([("player_id", 1), ("date", 1)])
    await db.coach_evaluations.create_index([("player_id", 1), ("date", 1)])
    await db.user_sessions.create_index("session_token")
    await db.invites.create_index("token", unique=True)
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.notifications.create_index([("user_id", 1), ("type", 1), ("date", 1)])
    await db.weekly_reports.create_index([("player_id", 1), ("week_start", 1)], unique=True)
    await db.cron_runs.create_index("run_id", unique=True)
    await seed_admin()
    logger.info("Startup complete")


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[FRONTEND_URL, "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
