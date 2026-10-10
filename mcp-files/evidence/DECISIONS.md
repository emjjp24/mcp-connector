# DECISIONS

(what was decided and why)

- [2026-10-09 11:16 UTC] [planner] **Use Python with no external libraries** - Simple to run and easy to review
- [2026-10-09 11:16 UTC] [coder] **Every storage function in todo.py (add_task, list_tasks, mark_done, load_tasks, save_tasks) takes an optional path argument that defaults to tasks.json, and the CLI exposes it as a global --file option.** - TODO_PLAN.md requires tests to use a temporary file so real data is untouched. Passing the path explicitly makes that possible without mocking.
- [2026-10-09 11:16 UTC] [coder] **Errors are raised as a custom TodoError and caught once in main(), which prints "Error: ..." to stderr and returns exit code 1. New task IDs are max(existing id) + 1.** - The plan asks for graceful handling of unknown IDs, empty text and missing or corrupt files. One exception type keeps the logic testable and the CLI free of tracebacks. Using max+1 instead of len+1 avoids reusing an ID if tasks are ever removed.
- [2026-10-09 11:22 UTC] [planner] **Use Python with no external libraries** - Simple to run and easy to review
- [2026-10-09 11:22 UTC] [coder] **Storage functions take an optional path (default tasks.json), exposed on the CLI as --file. Errors use one TodoError caught in main(), which prints to stderr and returns exit code 1. New IDs are max(existing id) + 1. Tests use a temporary file.** - TODO_PLAN.md requires tests to use a temporary file so real data is untouched; an explicit path makes that possible without mocking. A single exception type keeps the CLI free of tracebacks, and max+1 avoids reusing IDs.
