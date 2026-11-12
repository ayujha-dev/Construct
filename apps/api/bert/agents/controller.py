"""Checkpoint, interrupt, and resume coordination for long-running jobs."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable
from uuid import UUID, uuid4

from bert.models.base import SessionFactory
from bert.models.documents import JobExecution

JobEventPublisher = Callable[[dict[str, Any]], Awaitable[None]]

AGENT_ORDER: tuple[str, ...] = ("Scout", "Quartermaster", "Chronos", "Vanguard", "Ranger", "Arbiter", "Envoy")


def _default_step_telemetry(job_id: UUID) -> list[dict[str, Any]]:
    run_id = str(job_id)
    return [
        {
            "agent_name": name,
            "index": idx,
            "status": "pending",
            "started_at": None,
            "completed_at": None,
            "latency_ms": None,
            "summary": None,
            "details": {},
            "input_hash": None,
            "output_hash": None,
            "document_id": None,
            "document_filename": None,
            "run_id": run_id,
        }
        for idx, name in enumerate(AGENT_ORDER)
    ]


def _ensure_step_telemetry(state: TaskExecutionState) -> list[dict[str, Any]]:
    existing = state.completed_step_outputs.get("step_telemetry")
    if isinstance(existing, list) and len(existing) == len(AGENT_ORDER):
        return [dict(item) for item in existing]
    return _default_step_telemetry(state.job_id)


@dataclass(slots=True)
class TaskExecutionState:
    """In-memory cursor mirrored into `job_executions` for restart inspection."""

    job_id: UUID
    workspace_id: UUID
    batch_id: UUID
    status: str = "RUNNING"
    current_agent_index: int = 0
    current_document_id: UUID | None = None
    current_node_index: int = 0
    checkpoint_id: UUID = field(default_factory=uuid4)
    completed_step_outputs: dict[str, Any] = field(default_factory=dict)
    user_override_instructions: list[str] = field(default_factory=list)
    error_message: str | None = None
    cancelled: bool = False
    pause_requested: asyncio.Event = field(default_factory=asyncio.Event, repr=False)
    resume_requested: asyncio.Event = field(default_factory=asyncio.Event, repr=False)


class JobController:
    """Manage safe atomic-step pausing and in-process resume for prototype jobs."""

    def __init__(self, publish: JobEventPublisher) -> None:
        self._publish = publish
        self._states: dict[UUID, TaskExecutionState] = {}
        self._locks: dict[UUID, asyncio.Lock] = {}

    async def create(self, workspace_id: UUID, batch_id: UUID) -> TaskExecutionState:
        job_id = uuid4()
        state = TaskExecutionState(
            job_id,
            workspace_id,
            batch_id,
            completed_step_outputs={"step_telemetry": _default_step_telemetry(job_id)},
        )
        self._states[state.job_id] = state
        self._locks[state.job_id] = asyncio.Lock()
        await self._persist(state)
        return state

    async def get(self, job_id: UUID) -> TaskExecutionState | None:
        state = self._states.get(job_id)
        if state is not None:
            return state
        async with SessionFactory() as session:
            record = await session.get(JobExecution, job_id)
            if record is None:
                return None
            outputs = dict(record.completed_step_outputs or {})
            if "step_telemetry" not in outputs:
                outputs["step_telemetry"] = _default_step_telemetry(record.id)
            state = TaskExecutionState(
                job_id=record.id,
                workspace_id=record.workspace_id,
                batch_id=record.batch_id,
                status=record.status,
                current_agent_index=record.current_agent_index,
                current_document_id=record.current_document_id,
                current_node_index=record.current_node_index,
                checkpoint_id=record.checkpoint_id,
                completed_step_outputs=outputs,
                user_override_instructions=record.user_override_instructions or [],
                error_message=record.error_message,
            )
            self._states[job_id] = state
            self._locks[job_id] = asyncio.Lock()
            return state

    async def request_interrupt(self, job_id: UUID) -> TaskExecutionState:
        state = await self._required(job_id)
        if state.status in {"COMPLETED", "FAILED", "CANCELLED"}:
            return state
        state.status = "PAUSING"
        state.pause_requested.set()
        await self._persist(state)
        await self._publish({"type": "JOB_PAUSING", **self.snapshot(state)})
        return state

    async def resume(self, job_id: UUID, instruction: str | None) -> TaskExecutionState:
        state = await self._required(job_id)
        if state.status == "PAUSING":
            for _ in range(150):
                if state.status == "PAUSED":
                    break
                await asyncio.sleep(0.01)
        if instruction and instruction.strip():
            state.user_override_instructions.append(instruction.strip())
        state.status = "RESUMING"
        state.pause_requested.clear()
        state.resume_requested.set()
        await self._persist(state)
        await self._publish({"type": "JOB_RESUMING", "instruction": instruction or "", **self.snapshot(state)})
        return state

    async def before_step(
        self,
        job_id: UUID,
        agent_index: int,
        document_id: UUID | None,
        node_index: int,
        *,
        agent_label: str | None = None,
    ) -> bool:
        state = await self._required(job_id)
        if state.cancelled or state.status in {"COMPLETED", "FAILED", "CANCELLED"}:
            return False
        state.current_agent_index = agent_index
        state.current_document_id = document_id
        state.current_node_index = node_index
        await self._persist(state)
        if state.pause_requested.is_set():
            state.status = "PAUSED"
            state.checkpoint_id = uuid4()
            await self._persist(state)
            await self._publish({
                "type": "JOB_PAUSED",
                "checkpoint_id": str(state.checkpoint_id),
                "paused_at_agent": agent_label or self.agent_name(agent_index),
                "file": str(document_id) if document_id else None,
                **self.snapshot(state),
            })
            await state.resume_requested.wait()
            if state.cancelled or state.status == "CANCELLED":
                return False
            state.resume_requested.clear()
            state.pause_requested.clear()
            state.status = "RUNNING"
            await self._persist(state)
            await self._publish({"type": "JOB_RESUMED", **self.snapshot(state)})
        return state.status not in {"COMPLETED", "FAILED", "CANCELLED"}

    async def cancel_active_jobs(self) -> list[UUID]:
        cancelled_ids: list[UUID] = []
        for job_id, state in list(self._states.items()):
            if state.status not in {"COMPLETED", "FAILED", "CANCELLED"}:
                state.cancelled = True
                state.status = "CANCELLED"
                state.pause_requested.clear()
                state.resume_requested.set()
                cancelled_ids.append(job_id)
        return cancelled_ids

    async def start_step(
        self,
        job_id: UUID,
        agent_index: int,
        *,
        started_at: str,
        input_hash: str,
        document_id: UUID | None = None,
        document_filename: str | None = None,
        summary: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        state = await self._required(job_id)
        state.current_agent_index = agent_index
        telemetry = _ensure_step_telemetry(state)
        if 0 <= agent_index < len(telemetry):
            telemetry[agent_index] = {
                **telemetry[agent_index],
                "agent_name": self.agent_name(agent_index),
                "index": agent_index,
                "status": "running",
                "started_at": started_at,
                "completed_at": None,
                "latency_ms": 0,
                "summary": summary,
                "details": dict(details or {}),
                "input_hash": input_hash,
                "document_id": str(document_id) if document_id else None,
                "document_filename": document_filename,
                "run_id": str(state.job_id),
            }
        state.completed_step_outputs = {**state.completed_step_outputs, "step_telemetry": telemetry}
        await self._persist(state)

    async def mark_step(
        self,
        job_id: UUID,
        agent_index: int,
        output: Any,
        *,
        started_at: str | None = None,
        completed_at: str | None = None,
        latency_ms: int | None = None,
        input_hash: str | None = None,
        output_hash: str | None = None,
        document_id: UUID | None = None,
        document_filename: str | None = None,
        summary: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        state = await self._required(job_id)
        state.current_agent_index = agent_index
        telemetry = _ensure_step_telemetry(state)
        if 0 <= agent_index < len(telemetry):
            prev = telemetry[agent_index]
            telemetry[agent_index] = {
                **prev,
                "agent_name": self.agent_name(agent_index),
                "index": agent_index,
                "status": "done",
                "started_at": started_at if started_at is not None else prev.get("started_at"),
                "completed_at": completed_at,
                "latency_ms": latency_ms,
                "summary": summary if summary is not None else prev.get("summary"),
                "details": dict(details) if details is not None else dict(prev.get("details") or {}),
                "input_hash": input_hash if input_hash is not None else prev.get("input_hash"),
                "output_hash": output_hash,
                "document_id": str(document_id) if document_id else None,
                "document_filename": document_filename,
                "run_id": str(state.job_id),
            }
        state.completed_step_outputs = {
            **state.completed_step_outputs,
            str(agent_index): output,
            "step_telemetry": telemetry,
        }
        await self._persist(state)

    async def fail_step(
        self,
        job_id: UUID,
        agent_index: int,
        *,
        completed_at: str,
        latency_ms: int,
        summary: str,
        details: dict[str, Any],
        output_hash: str | None = None,
    ) -> None:
        state = await self._required(job_id)
        state.current_agent_index = agent_index
        telemetry = _ensure_step_telemetry(state)
        if 0 <= agent_index < len(telemetry):
            prev = telemetry[agent_index]
            telemetry[agent_index] = {
                **prev,
                "agent_name": self.agent_name(agent_index),
                "index": agent_index,
                "status": "failed",
                "completed_at": completed_at,
                "latency_ms": latency_ms,
                "summary": summary,
                "details": dict(details),
                "output_hash": output_hash,
                "run_id": str(state.job_id),
            }
        state.completed_step_outputs = {**state.completed_step_outputs, "step_telemetry": telemetry}
        await self._persist(state)

    async def complete(self, job_id: UUID) -> None:
        state = await self._required(job_id)
        state.status = "COMPLETED"
        await self._persist(state)
        await self._publish({"type": "JOB_COMPLETED", **self.snapshot(state)})

    async def fail(self, job_id: UUID, message: str) -> None:
        state = await self._required(job_id)
        state.status = "FAILED"
        state.error_message = message
        telemetry = _ensure_step_telemetry(state)
        changed = False
        for idx, step in enumerate(telemetry):
            if step.get("status") == "running":
                telemetry[idx] = {
                    **step,
                    "status": "failed",
                    "summary": message,
                    "details": {**dict(step.get("details") or {}), "error": message},
                }
                changed = True
        if changed:
            state.completed_step_outputs = {**state.completed_step_outputs, "step_telemetry": telemetry}
        await self._persist(state)
        await self._publish({"type": "JOB_FAILED", "message": message, **self.snapshot(state)})

    def snapshot(self, state: TaskExecutionState) -> dict[str, Any]:
        return {
            "job_id": str(state.job_id),
            "workspace_id": str(state.workspace_id),
            "batch_id": str(state.batch_id),
            "status": state.status,
            "current_agent_index": state.current_agent_index,
            "current_document_id": str(state.current_document_id) if state.current_document_id else None,
            "current_node_index": state.current_node_index,
            "checkpoint_id": str(state.checkpoint_id),
            "completed_step_outputs": state.completed_step_outputs,
            "step_telemetry": _ensure_step_telemetry(state),
            "user_override_instructions": list(state.user_override_instructions),
            "error_message": state.error_message,
        }

    @staticmethod
    def agent_name(index: int) -> str:
        return AGENT_ORDER[min(max(index, 0), len(AGENT_ORDER) - 1)]

    async def _required(self, job_id: UUID) -> TaskExecutionState:
        state = await self.get(job_id)
        if state is None:
            raise KeyError(f"Unknown job {job_id}")
        return state

    async def _persist(self, state: TaskExecutionState) -> None:
        async with self._locks.setdefault(state.job_id, asyncio.Lock()):
            async with SessionFactory() as session:
                record = await session.get(JobExecution, state.job_id)
                payload = {
                    "workspace_id": state.workspace_id,
                    "batch_id": state.batch_id,
                    "status": state.status,
                    "current_agent_index": state.current_agent_index,
                    "current_document_id": state.current_document_id,
                    "current_node_index": state.current_node_index,
                    "checkpoint_id": state.checkpoint_id,
                    "completed_step_outputs": state.completed_step_outputs,
                    "user_override_instructions": state.user_override_instructions,
                    "error_message": state.error_message,
                }
                if record is None:
                    session.add(JobExecution(id=state.job_id, **payload))
                else:
                    for key, value in payload.items():
                        setattr(record, key, value)
                await session.commit()
