#!/usr/bin/env python3
"""
Convert Nimbus Note export to Obsidian vault.
Usage: python convert-to-obsidian.py <input-zip-or-folder> <output-folder>
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

# Thread-safe file naming lock
_file_lock = threading.Lock()

try:
    from bs4 import BeautifulSoup
    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False


def sanitize_filename(name: str, max_length: int = 200) -> str:
    """Sanitize a string for use as a filename."""
    # Remove or replace invalid characters
    sanitized = re.sub(r'[<>:"/\\|?*]', '-', name)
    # Remove control characters
    sanitized = re.sub(r'[\x00-\x1f\x7f]', '', sanitized)
    # Collapse multiple spaces/dashes
    sanitized = re.sub(r'[-\s]+', ' ', sanitized).strip()
    # Truncate to max length
    if len(sanitized) > max_length:
        sanitized = sanitized[:max_length].rsplit(' ', 1)[0]
    return sanitized or "Untitled"


def timestamp_to_iso(ts: int) -> str:
    """Convert Unix timestamp to ISO format."""
    try:
        return datetime.fromtimestamp(ts).strftime("%Y-%m-%dT%H:%M:%S")
    except (ValueError, OSError):
        return ""


def preprocess_html(html_content: str) -> str:
    """Extract and clean the main content from Nimbus HTML."""
    if HAS_BS4:
        soup = BeautifulSoup(html_content, "html.parser")

        # Find the main content div
        content_div = soup.find("div", class_="export-mode") or soup.find("div", class_="editor-body") or soup.body
        if content_div:
            # Remove script/style tags
            for tag in content_div.find_all(["script", "style", "link"]):
                tag.decompose()
            return str(content_div)
        return html_content
    else:
        # Without bs4, don't preprocess - let pandoc handle the full HTML
        # It will extract body content automatically
        return html_content


def clean_markdown(content: str) -> str:
    """Clean up converted markdown content."""
    # Remove excessive div wrapper tags that pandoc left
    content = re.sub(r'^<div[^>]*>\s*', '', content, flags=re.MULTILINE)
    content = re.sub(r'\s*</div>\s*$', '', content, flags=re.MULTILINE)

    # Clean up empty divs
    content = re.sub(r'<div[^>]*>\s*</div>', '', content)

    # Remove remaining HTML-style line containers
    content = re.sub(r'<div[^>]*id="[^"]*"[^>]*>\s*', '\n', content)
    content = re.sub(r'</div>', '\n', content)

    # Clean up excessive newlines
    content = re.sub(r'\n{4,}', '\n\n\n', content)

    # Fix image paths to use relative assets folder
    content = re.sub(r'\./assets/', 'assets/', content)

    return content.strip()


def convert_html_to_markdown(html_path: Path, output_path: Path, temp_dir: Path, note_id: str) -> bool:
    """Convert HTML file to Markdown using pandoc."""
    try:
        # Read and preprocess HTML
        with open(html_path, "r", encoding="utf-8") as f:
            html_content = f.read()

        processed_html = preprocess_html(html_content)

        # Write preprocessed HTML to temp file (use note_id for unique filename)
        temp_html = temp_dir / f"{note_id}_clean.html"
        with open(temp_html, "w", encoding="utf-8") as f:
            f.write(processed_html)

        result = subprocess.run(
            [
                "pandoc",
                "--from=html",
                "--to=gfm",
                "--wrap=none",
                str(temp_html),
                "-o",
                str(output_path),
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )

        if result.returncode == 0:
            # Post-process the markdown
            with open(output_path, "r", encoding="utf-8") as f:
                md_content = f.read()
            cleaned = clean_markdown(md_content)
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(cleaned)
            return True
        return False
    except Exception as e:
        print(f"Pandoc error: {e}", file=sys.stderr)
        return False


def process_note(note_dir: Path, output_base: Path, temp_dir: Path) -> tuple[bool, str]:
    """Process a single note directory."""
    note_html = note_dir / "note.html"
    metadata_file = note_dir / "metadata.json"
    note_id = note_dir.name

    if not note_html.exists():
        return False, f"No note.html in {note_id}"

    # Read metadata
    title = f"Untitled-{note_id}"
    tags = []
    created_date = ""
    updated_date = ""
    folder_path = ""
    color = ""

    if metadata_file.exists():
        try:
            with open(metadata_file, "r", encoding="utf-8") as f:
                meta = json.load(f)
            title = meta.get("title", title)
            tags = meta.get("tags", [])
            created = meta.get("createdAt", 0)
            updated = meta.get("updatedAt", 0)
            parents = meta.get("parents", [])
            color = meta.get("color", "")

            created_date = timestamp_to_iso(created) if created else ""
            updated_date = timestamp_to_iso(updated) if updated else ""
            folder_path = "/".join(sanitize_filename(p) for p in parents if p)
        except Exception as e:
            print(f"Metadata error for {note_id}: {e}", file=sys.stderr)

    # Sanitize title for filename
    safe_title = sanitize_filename(title)

    # Create output folder structure
    if folder_path:
        out_folder = output_base / folder_path
    else:
        out_folder = output_base
    out_folder.mkdir(parents=True, exist_ok=True)

    # Output markdown file (handle duplicates with thread safety)
    # Use lock to prevent race conditions with duplicate filenames
    with _file_lock:
        md_file = out_folder / f"{safe_title}.md"
        counter = 1
        base_name = safe_title
        while md_file.exists():
            md_file = out_folder / f"{base_name}-{counter}.md"
            counter += 1
        # Create empty file to reserve the name
        md_file.touch()

    # Convert HTML to Markdown
    temp_md = temp_dir / f"{note_id}.md"
    if not convert_html_to_markdown(note_html, temp_md, temp_dir, note_id):
        return False, f"Pandoc failed for {note_id}: {title}"

    # Build frontmatter and write final file
    try:
        with open(temp_md, "r", encoding="utf-8") as f:
            content = f.read()

        # Build YAML frontmatter
        frontmatter_lines = ["---"]
        # Escape quotes in title for YAML
        escaped_title = title.replace('"', '\\"')
        frontmatter_lines.append(f'title: "{escaped_title}"')
        if tags:
            tags_str = ", ".join(tags)
            frontmatter_lines.append(f"tags: [{tags_str}]")
        if created_date:
            frontmatter_lines.append(f"created: {created_date}")
        if updated_date:
            frontmatter_lines.append(f"updated: {updated_date}")
        if color:
            frontmatter_lines.append(f'nimbus-color: "{color}"')
        frontmatter_lines.append(f'nimbus-id: "{note_id}"')
        frontmatter_lines.append("---")
        frontmatter_lines.append("")

        final_content = "\n".join(frontmatter_lines) + content

        with open(md_file, "w", encoding="utf-8") as f:
            f.write(final_content)

        # Copy image assets (skip CSS/fonts)
        assets_dir = note_dir / "assets"
        if assets_dir.exists():
            image_extensions = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".pdf", ".mp4", ".mp3", ".wav"}
            assets_out = out_folder / "assets"
            for asset_file in assets_dir.iterdir():
                if asset_file.suffix.lower() in image_extensions:
                    assets_out.mkdir(exist_ok=True)
                    shutil.copy2(asset_file, assets_out / asset_file.name)

        return True, f"{title}"
    except Exception as e:
        return False, f"Write error for {note_id}: {e}"


def main():
    if len(sys.argv) < 3:
        print("Usage: python convert-to-obsidian.py <input-zip-or-folder> <output-folder>")
        sys.exit(1)

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    # Check pandoc
    try:
        subprocess.run(["pandoc", "--version"], capture_output=True, check=True)
    except Exception:
        print("Error: pandoc is required", file=sys.stderr)
        sys.exit(1)

    # Setup temp directory
    temp_dir = Path(tempfile.mkdtemp())

    try:
        # Extract if zip file
        if input_path.is_file() and input_path.suffix == ".zip":
            print(f"Extracting {input_path}...")
            with zipfile.ZipFile(input_path, "r") as zf:
                zf.extractall(temp_dir / "extracted")
            source_dir = temp_dir / "extracted"
            # Look for combined-extract folder
            if (source_dir / "combined-extract").exists():
                source_dir = source_dir / "combined-extract"
        else:
            source_dir = input_path

        # Create output directory
        output_path.mkdir(parents=True, exist_ok=True)

        # Find all note directories
        print("Finding notes...")
        note_dirs = [d for d in source_dir.iterdir() if d.is_dir() and (d / "note.html").exists()]
        total = len(note_dirs)
        print(f"Found {total} notes to convert")

        # Process notes with progress
        success = 0
        failed = 0
        failed_notes = []

        # Process notes sequentially for reliability
        print("Converting notes...")
        for i, note_dir in enumerate(note_dirs, 1):
            ok, msg = process_note(note_dir, output_path, temp_dir)
            if ok:
                success += 1
            else:
                failed += 1
                failed_notes.append(msg)

            if i % 100 == 0 or i == total:
                print(f"Progress: {i}/{total} ({success} success, {failed} failed)")

        print()
        print("=" * 50)
        print("Conversion complete!")
        print(f"  Total:   {total}")
        print(f"  Success: {success}")
        print(f"  Failed:  {failed}")
        print(f"  Output:  {output_path}")

        if failed_notes:
            print()
            print("Failed notes:")
            for note in failed_notes[:20]:
                print(f"  - {note}")
            if len(failed_notes) > 20:
                print(f"  ... and {len(failed_notes) - 20} more")

    finally:
        # Cleanup temp directory
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
