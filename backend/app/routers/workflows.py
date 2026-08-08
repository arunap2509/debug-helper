import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import config_store, queue_payload_store, workflow_run_store, workflow_store
from ..services import localstack_service, postgres_service, redis_service, wiremock_service

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


class CreateWorkflow(BaseModel):
    name: str
    localstackConn: str


class UpdateWorkflow(BaseModel):
    name: str | None = None
    localstackConn: str | None = None
    variables: dict[str, str] | None = None


class AddStep(BaseModel):
    queueName: str
    index: int | None = None


class MoveStep(BaseModel):
    direction: str


class AddVersion(BaseModel):
    body: str
    label: str | None = None


class SetActiveVersion(BaseModel):
    versionId: str


class SendStep(BaseModel):
    versionId: str | None = None
    overrideBody: str | None = None


def _not_found(exc: KeyError):
    return HTTPException(404, f"not found: {exc}")


@router.get("")
def list_workflows():
    return workflow_store.list_all()


@router.post("")
def create_workflow(body: CreateWorkflow):
    return workflow_store.create(body.name, body.localstackConn)


@router.get("/{workflow_id}")
def get_workflow(workflow_id: str):
    try:
        return workflow_store.get(workflow_id)
    except KeyError as exc:
        raise _not_found(exc) from exc


@router.put("/{workflow_id}")
def update_workflow(workflow_id: str, body: UpdateWorkflow):
    try:
        return workflow_store.update(
            workflow_id, name=body.name, localstack_conn=body.localstackConn, variables=body.variables
        )
    except KeyError as exc:
        raise _not_found(exc) from exc


def _resolve_variables(body: str, variables: dict[str, str] | None) -> str:
    if not variables:
        return body
    resolved = body
    for k, v in variables.items():
        if not k:
            continue
        resolved = resolved.replace(f"{{{{{k}}}}}", str(v))
        resolved = resolved.replace(f"${{{k}}}", str(v))
        resolved = resolved.replace(f"%{k}%", str(v))
    return resolved


@router.delete("/{workflow_id}")
def delete_workflow(workflow_id: str):
    try:
        workflow_store.delete(workflow_id)
    except KeyError as exc:
        raise _not_found(exc) from exc
    return {"deleted": True}


@router.post("/{workflow_id}/steps")
def add_step(workflow_id: str, body: AddStep):
    try:
        return workflow_store.add_step(workflow_id, body.queueName, body.index)
    except KeyError as exc:
        raise _not_found(exc) from exc


@router.delete("/{workflow_id}/steps/{step_id}")
def remove_step(workflow_id: str, step_id: str):
    try:
        return workflow_store.remove_step(workflow_id, step_id)
    except KeyError as exc:
        raise _not_found(exc) from exc


@router.post("/{workflow_id}/steps/{step_id}/move")
def move_step(workflow_id: str, step_id: str, body: MoveStep):
    if body.direction not in ("up", "down"):
        raise HTTPException(400, "direction must be 'up' or 'down'")
    try:
        return workflow_store.move_step(workflow_id, step_id, body.direction)
    except KeyError as exc:
        raise _not_found(exc) from exc


@router.post("/{workflow_id}/steps/{step_id}/versions")
def add_version(workflow_id: str, step_id: str, body: AddVersion):
    try:
        return workflow_store.add_version(workflow_id, step_id, body.body, body.label)
    except KeyError as exc:
        raise _not_found(exc) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


class UpdateVersion(BaseModel):
    label: str | None = None
    body: str | None = None


@router.delete("/{workflow_id}/steps/{step_id}/versions/{version_id}")
def remove_version(workflow_id: str, step_id: str, version_id: str):
    try:
        return workflow_store.remove_version(workflow_id, step_id, version_id)
    except KeyError as exc:
        raise _not_found(exc) from exc


@router.put("/{workflow_id}/steps/{step_id}/versions/{version_id}")
def update_version(workflow_id: str, step_id: str, version_id: str, body: UpdateVersion):
    try:
        return workflow_store.update_version(workflow_id, step_id, version_id, body.label, body.body)
    except KeyError as exc:
        raise _not_found(exc) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc



@router.put("/{workflow_id}/steps/{step_id}/active-version")
def set_active_version(workflow_id: str, step_id: str, body: SetActiveVersion):
    try:
        return workflow_store.set_active_version(workflow_id, step_id, body.versionId)
    except KeyError as exc:
        raise _not_found(exc) from exc


class StepDownstream(BaseModel):
    wiremockConn: str | None = None
    wiremockMethod: str | None = "GET"
    wiremockPath: str | None = None
    postgresConn: str | None = None
    postgresSql: str | None = None
    redisConn: str | None = None
    redisAction: str | None = "SET"
    redisKey: str | None = None
    redisValue: str | None = None


@router.put("/{workflow_id}/steps/{step_id}/downstream")
def update_step_downstream(workflow_id: str, step_id: str, body: StepDownstream):
    try:
        return workflow_store.update_step_downstream(workflow_id, step_id, body.model_dump())
    except KeyError as exc:
        raise _not_found(exc) from exc


@router.post("/{workflow_id}/steps/{step_id}/send")
def send_step(workflow_id: str, step_id: str, body: SendStep):
    try:
        wf = workflow_store.get(workflow_id)
        step = next((s for s in wf.get("steps", []) if s["id"] == step_id), None)
        if not step:
            raise KeyError(step_id)
        
        if body.overrideBody is not None:
            conn_id = wf["localstackConn"]
            queue_name = step["queueName"]
            message_body = body.overrideBody
        else:
            conn_id, queue_name, message_body = workflow_store.resolve_message(workflow_id, step_id, body.versionId)
        
        # Substitute {{VAR}} placeholders with workflow variables
        message_body = _resolve_variables(message_body, wf.get("variables"))
    except KeyError as exc:
        raise _not_found(exc) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    try:
        cfg = config_store.get(conn_id)["fields"]
    except KeyError as exc:
        raise HTTPException(400, f"workflow's localstack connection '{conn_id}' no longer exists") from exc

    # 1. Dispatch SQS message to LocalStack
    try:
        result = localstack_service.send_message(cfg, queue_name, message_body)
        workflow_run_store.record_step_sent(workflow_id, step_id, variables=wf.get("variables"))
        workflow_run_store.record_telemetry_event(
            workflow_id,
            service="localstack",
            action="SQS_SEND_MESSAGE",
            details={
                "queueName": queue_name,
                "messageId": result["messageId"],
                "md5": result.get("md5"),
                "body": result.get("sentBody", message_body),
            },
        )
    except Exception as exc:  # noqa: BLE001
        workflow_run_store.record_telemetry_event(
            workflow_id,
            service="localstack",
            action="SQS_SEND_MESSAGE_FAILED",
            details={"queueName": queue_name, "messageId": None, "body": str(exc)},
        )
        raise HTTPException(502, f"failed to send to queue '{queue_name}': {exc}") from exc

    # 2. Execute configured downstream triggers (Wiremock, Postgres, Redis)
    downstream = step.get("downstream") or {}

    # Downstream Wiremock HTTP call
    if downstream.get("wiremockConn") and downstream.get("wiremockPath"):
        try:
            wm_cfg = config_store.get(downstream["wiremockConn"])["fields"]
            wm_res = wiremock_service.try_request(
                wm_cfg,
                method=downstream.get("wiremockMethod") or "GET",
                path=downstream["wiremockPath"],
                body=message_body if downstream.get("wiremockMethod") in ["POST", "PUT", "PATCH"] else None,
            )
            workflow_run_store.record_telemetry_event(
                workflow_id,
                service="wiremock",
                action="WIREMOCK_CALL",
                details={
                    "method": downstream.get("wiremockMethod") or "GET",
                    "url": downstream["wiremockPath"],
                    "status": wm_res["status"],
                    "stubName": f"HTTP {wm_res['status']}",
                    "body": json.dumps(wm_res["body"]) if isinstance(wm_res["body"], dict) else str(wm_res["body"]),
                },
            )
        except Exception as e:  # noqa: BLE001
            workflow_run_store.record_telemetry_event(
                workflow_id,
                service="wiremock",
                action="WIREMOCK_CALL_FAILED",
                details={
                    "method": downstream.get("wiremockMethod") or "GET",
                    "url": downstream["wiremockPath"],
                    "status": 0,
                    "stubName": "error",
                    "body": str(e),
                },
            )

    # Downstream Postgres Query execution
    if downstream.get("postgresConn") and downstream.get("postgresSql"):
        try:
            pg_cfg = config_store.get(downstream["postgresConn"])["fields"]
            pg_res = postgres_service.execute_sql(pg_cfg, downstream["postgresSql"])
            workflow_run_store.record_telemetry_event(
                workflow_id,
                service="postgres",
                action="POSTGRES_QUERY",
                details={
                    "query": downstream["postgresSql"],
                    "durationMs": 5,
                    "state": "completed",
                    "rowsCount": len(pg_res) if isinstance(pg_res, list) else 0,
                },
            )
        except Exception as e:  # noqa: BLE001
            workflow_run_store.record_telemetry_event(
                workflow_id,
                service="postgres",
                action="POSTGRES_QUERY_FAILED",
                details={
                    "query": downstream["postgresSql"],
                    "durationMs": None,
                    "state": "failed",
                    "error": str(e),
                },
            )

    # Downstream Redis Cache operation
    if downstream.get("redisConn") and downstream.get("redisKey"):
        try:
            r_cfg = config_store.get(downstream["redisConn"])["fields"]
            r_action = downstream.get("redisAction") or "SET"
            if r_action == "SET":
                redis_service.set_key(r_cfg, 0, downstream["redisKey"], downstream.get("redisValue") or message_body)
            workflow_run_store.record_telemetry_event(
                workflow_id,
                service="redis",
                action="REDIS_OP",
                details={
                    "key": downstream["redisKey"],
                    "type": "string",
                    "ttl": -1,
                    "command": f"{r_action} {downstream['redisKey']}",
                },
            )
        except Exception as e:  # noqa: BLE001
            workflow_run_store.record_telemetry_event(
                workflow_id,
                service="redis",
                action="REDIS_OP_FAILED",
                details={
                    "key": downstream.get("redisKey"),
                    "type": "string",
                    "ttl": -1,
                    "command": f"{downstream.get('redisAction') or 'SET'} {downstream.get('redisKey')}",
                    "error": str(e),
                },
            )

    return {"messageId": result["messageId"], "sentAt": datetime.now(timezone.utc).isoformat()}


@router.get("/{workflow_id}/run-session")
def get_run_session(workflow_id: str):
    try:
        workflow_store.get(workflow_id)
    except KeyError as exc:
        raise _not_found(exc) from exc
    return workflow_run_store.get_active_run(workflow_id)


@router.post("/{workflow_id}/run-session/reset")
def reset_run_session(workflow_id: str):
    try:
        workflow_store.get(workflow_id)
    except KeyError as exc:
        raise _not_found(exc) from exc
    return workflow_run_store.reset_run(workflow_id)


@router.delete("/{workflow_id}/run-session")
def delete_run_session(workflow_id: str):
    try:
        workflow_store.get(workflow_id)
    except KeyError as exc:
        raise _not_found(exc) from exc
    return workflow_run_store.delete_active_run(workflow_id)


@router.get("/queues/{queue_name}/payloads")
def get_queue_payloads(queue_name: str):
    return queue_payload_store.get_versions(queue_name)


@router.get("/{workflow_id}/telemetry")
def get_workflow_telemetry(workflow_id: str):
    try:
        wf = workflow_store.get(workflow_id)
    except KeyError as exc:
        raise _not_found(exc) from exc

    active_run = workflow_run_store.get_active_run(workflow_id)
    started_ms = active_run.get("startedAtMs")

    localstack_events = []
    wiremock_events = []
    redis_events = []
    postgres_events = []

    if not started_ms:
        return {
            "workflowId": workflow_id,
            "workflowName": wf["name"],
            "runId": active_run.get("runId"),
            "startedAt": None,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "localstack": [],
            "wiremock": [],
            "redis": [],
            "postgres": [],
        }

    configs = config_store.get_all()

    # 1. Query connected Wiremock containers for admin requests logged >= startedAtMs
    for conn in configs:
        if conn.get("type") == "wiremock":
            try:
                wm_cfg = conn["fields"]
                wiremock_reqs = wiremock_service.get_requests(wm_cfg)
                for req in wiremock_reqs:
                    logged_date = req.get("loggedDate", 0)
                    if logged_date >= started_ms:
                        req_data = req.get("request", {})
                        resp_data = req.get("response", {})
                        wiremock_events.append(
                            {
                                "id": f"wm-req-{req.get('id', 'req')}",
                                "service": "wiremock",
                                "action": f"HTTP {req_data.get('method', 'POST')} {req_data.get('url', '/')}",
                                "time": datetime.fromtimestamp(logged_date / 1000, tz=timezone.utc).isoformat(),
                                "status": resp_data.get("status"),
                                "body": req_data.get("body"),
                            }
                        )
            except Exception:
                pass

    # 2. Query connected Redis containers for queue messages or keys modified >= startedAtMs
    for conn in configs:
        if conn.get("type") == "redis":
            try:
                r_cfg = conn["fields"]
                for step in wf.get("steps", []):
                    queue_name = step.get("queueName")
                    if not queue_name:
                        continue
                    try:
                        key_data = redis_service.get_key(r_cfg, 0, f"queue:{queue_name}:latest")
                        val = key_data.get("value") if isinstance(key_data, dict) else str(key_data)
                        if val:
                            redis_events.append(
                                {
                                    "id": f"redis-consumed-{queue_name}",
                                    "service": "redis",
                                    "time": datetime.now(timezone.utc).isoformat(),
                                    "key": f"queue:{queue_name}:latest",
                                    "action": f"CONSUMED (queue/{queue_name})",
                                    "command": f"GET queue:{queue_name}:latest",
                                    "body": val,
                                }
                            )
                    except KeyError:
                        pass
            except Exception:
                pass

    return {
        "workflowId": workflow_id,
        "workflowName": wf["name"],
        "runId": active_run.get("runId"),
        "startedAt": active_run.get("startedAt"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "localstack": localstack_events,
        "wiremock": wiremock_events,
        "redis": redis_events,
        "postgres": postgres_events,
    }

