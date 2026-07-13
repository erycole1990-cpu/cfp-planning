"use client";

import { archiveGoal, completeGoal, deleteEmptyGoal, restoreGoal } from "@/app/actions";

type Props = {
  customerId: string;
  goalId: string;
  goalName: string;
  status: string;
  canDelete: boolean;
};

function HiddenGoalFields({ customerId, goalId }: Pick<Props, "customerId" | "goalId">) {
  return (
    <>
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="goal_id" value={goalId} />
    </>
  );
}

export function GoalLifecycleActions({ customerId, goalId, goalName, status, canDelete }: Props) {
  if (status !== "active") {
    return (
      <div className="flex flex-wrap gap-2">
        <form
          action={restoreGoal}
          onSubmit={(event) => {
            if (!window.confirm(`Restore ${goalName} to active planning?`)) event.preventDefault();
          }}
        >
          <HiddenGoalFields customerId={customerId} goalId={goalId} />
          <button className="btn btn-secondary" type="submit">Restore</button>
        </form>
        {canDelete ? (
          <form
            action={deleteEmptyGoal}
            onSubmit={(event) => {
              if (!window.confirm(`Permanently delete ${goalName}? This cannot be undone.`)) event.preventDefault();
            }}
          >
            <HiddenGoalFields customerId={customerId} goalId={goalId} />
            <button className="btn btn-danger" type="submit">Delete Empty Goal</button>
          </form>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <form
        action={completeGoal}
        onSubmit={(event) => {
          if (!window.confirm(`Mark ${goalName} as completed? Its history will be kept.`)) event.preventDefault();
        }}
      >
        <HiddenGoalFields customerId={customerId} goalId={goalId} />
        <button className="btn btn-secondary" type="submit">Mark Completed</button>
      </form>
      <form
        action={archiveGoal}
        onSubmit={(event) => {
          if (!window.confirm(`Archive ${goalName}? It will leave active planning but remain in the client record.`)) event.preventDefault();
        }}
      >
        <HiddenGoalFields customerId={customerId} goalId={goalId} />
        <button className="btn btn-secondary" type="submit">Archive</button>
      </form>
      {canDelete ? (
        <form
          action={deleteEmptyGoal}
          onSubmit={(event) => {
            if (!window.confirm(`Permanently delete ${goalName}? This is only appropriate for a setup mistake and cannot be undone.`)) {
              event.preventDefault();
            }
          }}
        >
          <HiddenGoalFields customerId={customerId} goalId={goalId} />
          <button className="btn btn-danger" type="submit">Delete Empty Goal</button>
        </form>
      ) : null}
    </div>
  );
}
