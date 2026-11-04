import { createTaskAction } from "@/app/actions";
import { TaskBoard } from "@/app/_components/task-board";
import { listTasks } from "@/app/_lib/tasks";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  return (
    <section className="section" aria-labelledby="tasks-title">
      <h1 id="tasks-title">Tasks</h1>
      <TaskBoard initial={await listTasks()} createTask={createTaskAction} />
    </section>
  );
}
