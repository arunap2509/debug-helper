from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import config_store, queue_payload_store, workflow_run_store, workflow_store
from ..services import localstack_service

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

    try:
        result = localstack_service.send_message(cfg, queue_name, message_body)
        workflow_run_store.record_step_sent(workflow_id, step_id, variables=wf.get("variables"))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"failed to send to queue '{queue_name}': {exc}") from exc

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
