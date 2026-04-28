import math
import shutil
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = PROJECT_DIR / "flattened"
PROJECT_NAME = PROJECT_DIR.name
TARGET_TOKEN_BUDGET = 250_000

IMPORTANT_FILES = [
    "public/prompts/judge_master.md",
    "server/vertex.mjs",
    "server.mjs",
    "shared/judgingWeights.js",
    "shared/modelOptions.js",
    "src/main.tsx",
    "src/index.css",
    "src/ModeApp.tsx",
    "src/App.tsx",
    "src/types.ts",
    "src/lib/gameShared.ts",
    "src/components/Button.tsx",
    "src/components/Header.tsx",
    "src/components/JudgingLogPanel.tsx",
    "src/components/BoardCategoryCard.tsx",
    "src/components/CategoryBoardModal.tsx",
    "src/components/StickyStatusPill.tsx",
    "src/components/LocalPassAndPlayApp.tsx",
]

TEXTISH_SUFFIXES = {
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".css",
    ".md",
    ".json",
    ".html",
    ".txt",
}

PROJECT_DIR = Path(PROJECT_DIR).expanduser().resolve()
OUTPUT_DIR = Path(OUTPUT_DIR).expanduser()

if not OUTPUT_DIR.is_absolute():
    OUTPUT_DIR = PROJECT_DIR / OUTPUT_DIR

PROJECT_NAME = str(PROJECT_NAME)


def estimate_tokens(byte_count: int) -> int:
    return math.ceil(byte_count / 4)


def build_output_name(relative_path: str) -> str:
    flat_name = f"{PROJECT_NAME}__{relative_path.replace('/', '__')}"
    suffix = Path(relative_path).suffix.lower()

    if suffix in TEXTISH_SUFFIXES and not flat_name.endswith(".txt"):
        return f"{flat_name}.txt"

    return flat_name


def reset_output_dir() -> None:
    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def copy_files() -> tuple[list[tuple[str, int]], list[str]]:
    copied_files: list[tuple[str, int]] = []
    missing_files: list[str] = []

    for relative_path in IMPORTANT_FILES:
        source_path = PROJECT_DIR / relative_path

        if not source_path.exists():
            missing_files.append(relative_path)
            continue

        output_name = build_output_name(relative_path)
        output_path = OUTPUT_DIR / output_name
        shutil.copy2(source_path, output_path)
        copied_files.append((relative_path, source_path.stat().st_size))
        print(f"Copied: {relative_path} -> {output_name}")

    return copied_files, missing_files


def write_summary(copied_files: list[tuple[str, int]], missing_files: list[str]) -> int:
    total_bytes = sum(file_size for _, file_size in copied_files)
    estimated_token_count = estimate_tokens(total_bytes)
    status = "UNDER" if estimated_token_count <= TARGET_TOKEN_BUDGET else "OVER"

    summary_lines = [
        f"Project: {PROJECT_NAME}",
        f"Included files: {len(copied_files)}",
        f"Total bytes: {total_bytes}",
        f"Estimated tokens: {estimated_token_count}",
        f"Budget target: {TARGET_TOKEN_BUDGET}",
        f"Budget status: {status}",
        "",
        "Included files:",
    ]

    summary_lines.extend(f"- {relative_path} ({file_size} bytes)" for relative_path, file_size in copied_files)

    if missing_files:
        summary_lines.extend([
            "",
            "Missing files:",
        ])
        summary_lines.extend(f"- {relative_path}" for relative_path in missing_files)

    summary_path = OUTPUT_DIR / f"{PROJECT_NAME}__packing_summary.txt"
    summary_path.write_text("\n".join(summary_lines) + "\n", encoding="utf-8")

    print("\nPacking complete!")
    print(f"Output saved in: {OUTPUT_DIR}")
    print(f"Estimated tokens: {estimated_token_count} ({status} budget)")

    return estimated_token_count


def main() -> None:
    reset_output_dir()
    copied_files, missing_files = copy_files()
    write_summary(copied_files, missing_files)


if __name__ == "__main__":
    main()
