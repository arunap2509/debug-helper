import redis
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .routers import connections, localstack_router, postgres_router, redis_router, status, wiremock_router, workflows

app = FastAPI(title="work-helper backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(redis.exceptions.RedisError)
def redis_error_handler(request: Request, exc: redis.exceptions.RedisError):
    # Workflows/queue labels live in Redis (store.py) with no fallback —
    # unlike cache.py's reads, a broken connection here is a real failure.
    return JSONResponse(status_code=502, content={"detail": f"could not reach app storage (redis): {exc}"})

app.include_router(connections.router)
app.include_router(status.router)
app.include_router(postgres_router.router)
app.include_router(redis_router.router)
app.include_router(wiremock_router.router)
app.include_router(localstack_router.router)
app.include_router(workflows.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
