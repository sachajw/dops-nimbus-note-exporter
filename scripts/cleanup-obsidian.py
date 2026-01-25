#!/usr/bin/env python3
"""
Clean up HTML artifacts from converted Obsidian notes.
Converts: HTML tags to markdown equivalents, removes empty tags, cleans formatting.
"""

import re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import sys


def clean_markdown(content: str) -> str:
    """Remove HTML artifacts and convert to proper markdown."""

    # Preserve frontmatter
    frontmatter = ""
    body = content
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            frontmatter = f"---{parts[1]}---\n"
            body = parts[2]

    # === CONVERT LINKED IMAGES ===
    # Convert <a href="path"><img src="path" /></a> to ![](path)
    body = re.sub(
        r'<a\s+href="([^"]*)"[^>]*>\s*<img\s+src="[^"]*"[^>]*/?\s*>\s*</a>',
        r'![](\1)',
        body,
        flags=re.DOTALL
    )

    # Convert standalone <img src="path" /> to ![](path)
    body = re.sub(r'<img\s+src="([^"]*)"[^>]*/?\s*>', r'![](\1)', body)

    # === CONVERT HTML TO MARKDOWN ===

    # Convert <strong> and <b> to **bold** (handle nested content)
    for _ in range(3):  # Multiple passes for nested tags
        body = re.sub(r'<strong>([^<]*)</strong>', r'**\1**', body)
        body = re.sub(r'<b>([^<]*)</b>', r'**\1**', body)

    # Convert <em> and <i> to *italic*
    for _ in range(3):
        body = re.sub(r'<em>([^<]*)</em>', r'*\1*', body)
        body = re.sub(r'<i>([^<]*)</i>', r'*\1*', body)

    # Convert <code> to `code` (inline) - handle nested content
    for _ in range(3):
        body = re.sub(r'<code>([^<]*)</code>', r'`\1`', body)

    # Remove <code> tags that wrap complex content (keep content)
    body = re.sub(r'</?code[^>]*>', '', body)

    # Convert <u> (underline) - strip tags, keep content
    body = re.sub(r'<u>([^<]*)</u>', r'\1', body)
    body = re.sub(r'</?u>', '', body)

    # Convert <br> and <br/> to newlines
    body = re.sub(r'<br\s*/?>', '\n', body)

    # Convert <hr> and <hr/> to ---
    body = re.sub(r'<hr\s*/?>', '\n---\n', body)

    # === REMOVE NIMBUS-SPECIFIC ARTIFACTS ===

    # Remove <span class="syntax-control-label">...</span>
    body = re.sub(r'<span class="syntax-control-label">[^<]*</span>', "", body)

    # Remove nimbus bookmark <a> tags (various formats)
    body = re.sub(r'<a href="[^"]*" class="nimbus-bookmark[^"]*"[^>]*></a>', "", body)
    body = re.sub(r'<a href="[^"]*" style="display:\s*contents;?"[^>]*></a>', "", body)

    # Remove ALL empty <a href="..."></a> tags
    body = re.sub(r'<a\s+href="[^"]*"[^>]*>\s*</a>', "", body, flags=re.DOTALL)

    # === HANDLE TABLES ===
    # Simple approach: remove table tags but try to preserve some structure
    # This won't create perfect markdown tables but will make content readable

    # Remove table/thead/tbody wrapper tags
    body = re.sub(r'</?table[^>]*>', '\n', body)
    body = re.sub(r'</?thead[^>]*>', '', body)
    body = re.sub(r'</?tbody[^>]*>', '', body)

    # Convert table rows - try to make them pipe-delimited
    body = re.sub(r'<tr[^>]*>', '\n| ', body)
    body = re.sub(r'</tr>', ' |', body)

    # Convert th/td cells
    body = re.sub(r'<t[hd][^>]*>', '', body)
    body = re.sub(r'</t[hd]>', ' | ', body)

    # === REMOVE/SIMPLIFY REMAINING HTML ===

    # Remove empty span tags
    body = re.sub(r'<span[^>]*>\s*</span>', '', body)

    # Remove span tags but keep content (multiple passes for nesting)
    for _ in range(5):
        body = re.sub(r'<span[^>]*>([^<]*)</span>', r'\1', body)

    # Remove remaining span tags (opening and closing)
    body = re.sub(r'</?span[^>]*>', '', body)

    # Remove div tags but keep content
    body = re.sub(r'<div[^>]*>([^<]*)</div>', r'\1\n', body)
    body = re.sub(r'</?div[^>]*>', '\n', body)

    # Remove p tags but keep content
    body = re.sub(r'<p[^>]*>([^<]*)</p>', r'\1\n\n', body)
    body = re.sub(r'</?p[^>]*>', '\n', body)

    # Convert remaining <a href="url">text</a> to [text](url)
    body = re.sub(r'<a\s+href="([^"]*)"[^>]*>([^<]+)</a>', r'[\2](\1)', body)

    # Remove any remaining empty anchor tags
    body = re.sub(r'<a[^>]*>\s*</a>', '', body)

    # Remove remaining img tags (already converted above, these are orphans)
    body = re.sub(r'<img[^>]*/?\s*>', '', body)

    # === CLEAN UP BASE64 DATA IMAGES ===

    # Remove inline base64 SVG images (checkbox icons etc)
    body = re.sub(r'!\[\]\(data:image/svg\+xml;base64,[^)]+\)', '', body)
    body = re.sub(r'!\[\]\(data:image/[^)]+\)', '', body)

    # === CLEAN UP TABLE ARTIFACTS ===

    # Clean up multiple consecutive pipes
    body = re.sub(r'\|\s*\|\s*\|', '|', body)
    body = re.sub(r'\|\s*\|', '|', body)

    # Remove lines that are just pipes and whitespace
    body = re.sub(r'\n\s*\|\s*\|\s*\n', '\n', body)
    body = re.sub(r'\n\s*\|\s*\n', '\n', body)

    # === CLEAN UP WHITESPACE ===

    # Remove multiple consecutive empty lines (more than 2)
    body = re.sub(r'\n{4,}', '\n\n\n', body)

    # Remove trailing whitespace from lines
    lines = body.split('\n')
    lines = [line.rstrip() for line in lines]
    body = '\n'.join(lines)

    # Remove leading blank lines after frontmatter
    body = body.lstrip('\n')

    # Ensure single trailing newline
    body = body.rstrip('\n') + '\n'

    return frontmatter + body


def process_file(md_file: Path) -> tuple[bool, str, int]:
    """Clean a single markdown file. Returns (changed, message, changes_count)."""
    try:
        with open(md_file, 'r', encoding='utf-8') as f:
            content = f.read()

        original_content = content
        cleaned_content = clean_markdown(content)

        if cleaned_content != original_content:
            with open(md_file, 'w', encoding='utf-8') as f:
                f.write(cleaned_content)

            # Count approximate changes
            changes = abs(len(original_content) - len(cleaned_content))
            return True, str(md_file.name), changes
        else:
            return False, "", 0
    except Exception as e:
        return False, f"Error processing {md_file}: {e}", -1


def main():
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <vault-path>")
        sys.exit(1)

    vault_path = Path(sys.argv[1])

    if not vault_path.exists():
        print(f"Error: Vault path not found: {vault_path}")
        sys.exit(1)

    # Find all markdown files
    print(f"Scanning: {vault_path}")
    md_files = list(vault_path.rglob("*.md"))
    print(f"Found {len(md_files)} markdown files\n")

    # Process files
    print("Cleaning HTML artifacts...")
    modified = 0
    skipped = 0
    errors = 0
    total_changes = 0

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(process_file, md_file): md_file for md_file in md_files}

        for i, future in enumerate(as_completed(futures), 1):
            changed, msg, changes = future.result()

            if changes == -1:  # Error
                errors += 1
                print(f"  ERROR: {msg}")
            elif changed:
                modified += 1
                total_changes += changes
            else:
                skipped += 1

            if i % 500 == 0 or i == len(md_files):
                print(f"Progress: {i}/{len(md_files)} ({modified} modified, {skipped} unchanged)")

    print()
    print("=" * 50)
    print("Cleanup complete!")
    print(f"  Modified: {modified} files")
    print(f"  Unchanged: {skipped} files")
    print(f"  Errors: {errors} files")
    print(f"  Total bytes changed: ~{total_changes:,}")


if __name__ == "__main__":
    main()
