#!/usr/bin/env python3
"""
Clean up HTML artifacts from converted Obsidian notes.
Removes: <span> tags, nimbus bookmark <a> tags, and other HTML remnants.
"""

import re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import sys


def clean_markdown(content: str) -> str:
    """Remove HTML artifacts from markdown content."""

    # Remove <span class="syntax-control-label">Plain Text</span> tags
    content = re.sub(r'<span class="syntax-control-label">[^<]*</span>', "", content)

    # Remove nimbus bookmark <a href="..." class="nimbus-bookmark__info__src"></a> tags
    content = re.sub(
        r'<a href="[^"]*" class="nimbus-bookmark[^"]*"[^>]*></a>', "", content
    )

    # Remove empty nimbus bookmark <a> tags (with style="display:contents;)
    content = re.sub(r'<a href="[^"]*" style="display:contents;"></a>', "", content)

    # Remove ALL empty <a href="..."></a> tags (catch-all for Nimbus bookmark artifacts)
    # Use non-greedy match to capture from <a to </a> including attributes with >
    content = re.sub(r'<a\s+href="[^"]*"[^<]*></a>', "", content, flags=re.DOTALL)

    # Remove empty nimbus bookmark <a> tags (with style="display:contents;")
    content = re.sub(r'<a href="[^"]*" style="display:contents;"></a>', "", content)

    # Remove ALL empty <a href="..."></a> tags (catch-all for Nimbus bookmark artifacts)
    content = re.sub(r'<a href="[^"]*"[^>]*></a>', "", content, flags=re.DOTALL)

    # Clean up multiple consecutive empty lines
    content = re.sub(r"\n{4,}", "\n\n\n", content)

    # Remove trailing whitespace from lines
    lines = content.split("\n")
    lines = [line.rstrip() for line in lines]
    content = "\n".join(lines)

    # Remove trailing newlines before end of file
    content = content.rstrip("\n") + "\n"

    return content


def process_file(md_file: Path) -> tuple[bool, str]:
    """Clean a single markdown file."""
    try:
        with open(md_file, "r", encoding="utf-8") as f:
            content = f.read()

        original_content = content
        cleaned_content = clean_markdown(content)

        if cleaned_content != original_content:
            with open(md_file, "w", encoding="utf-8") as f:
                f.write(cleaned_content)
            return True, str(md_file.relative_to(md_file.parents[-1]))
        else:
            return False, ""
    except Exception as e:
        return False, f"Error: {e}"


def main():
    vault_path = Path(sys.argv[1])

    if not vault_path.exists():
        print(f"Error: Vault path not found: {vault_path}")
        sys.exit(1)

    # Find all markdown files
    print("Finding markdown files...")
    md_files = list(vault_path.rglob("*.md"))
    print(f"Found {len(md_files)} markdown files\n")

    # Process files
    print("Cleaning files...")
    modified = 0
    skipped = 0
    errors = 0

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {
            executor.submit(process_file, md_file): md_file for md_file in md_files
        }

        for i, future in enumerate(as_completed(futures), 1):
            success, msg = future.result()

            if success:
                modified += 1
                if modified <= 10 or modified % 500 == 0:
                    print(f"  Cleaned: {msg}")
            elif msg.startswith("Error"):
                errors += 1
                print(f"  {msg}")
            else:
                skipped += 1

            if i % 100 == 0 or i == len(md_files):
                print(
                    f"Progress: {i}/{len(md_files)} ({modified} modified, {skipped} skipped, {errors} errors)"
                )

    print()
    print("=" * 50)
    print("Cleanup complete!")
    print(f"Modified: {modified} files")
    print(f"Skipped: {skipped} files (no changes needed)")
    print(f"Errors: {errors} files")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <vault-path>")
        sys.exit(1)
    main()
