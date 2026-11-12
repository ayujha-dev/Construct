"""Checkpoint, interrupt, and resume coordination for long-running jobs."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable
from uuid import UUID, uuid4

from bert.models.base import SessionFactory
from bert.models.documents import JobExecution

JobEventPublisher = Callable[[dict[str, Any]], Awaitable[None]]


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
        state = TaskExecutionState(uuid4(), workspace_id, batch_id)
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
            state = TaskExecutionState(
                job_id=record.id,
                workspace_id=record.workspace_id,
                batch_id=record.batch_id,
                status=record.status,
                current_agent_index=record.current_agent_index,
                current_document_id=record.current_document_id,
                current_node_index=record.current_node_index,
                checkpoint_id=record.checkpoint_id,
                completed_step_outputs=record.completed_step_outputs or {},
                user_override_instructions=record.user_override_instructions or [],
                error_message=record.error_message,
            )
            self._states[job_id] = state
            self._locks[job_id] = asyncio.Lock()
            return state

    async def request_interrupt(self, job_id: UUID) -> TaskExecutionState:
        state = await self._required(job_id)
        if state.status in {"COMPLETED", "FAILED"}:
            return state
        state.status = "PAUSING"
        state.pause_requested.set()
        await self._persist(state)
        await self._publish({"type": "JOB_PAUSING", **self.snapshot(state)})
        return state

    async def resume(self, job_id: UUID, instruction: str | None) -> TaskExecutionState:
        state = await self._required(job_id)
        if state.status == "PAUSING":
            for _ in range(100):
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

    async def mark_step(self, job_id: UUID, agent_index: int, output: Any) -> None:
        state = await self._required(job_id)
        state.current_agent_index = agent_index
        state.completed_step_outputs[str(agent_index)] = output
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
            "user_override_instructions": list(state.user_override_instructions),
            "error_message": state.error_message,
        }

    @staticmethod
    def agent_name(index: int) -> str:
        return ("Scout", "Quartermaster", "Chronos", "Vanguard", "Ranger", "Arbiter", "Envoy")[min(index, 6)]

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
