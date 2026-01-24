#!/bin/bash
# Convert Nimbus Note export to Obsidian vault
# Usage: ./convert-to-obsidian.sh <input-zip-or-folder> <output-folder>

set -euo pipefail

INPUT="${1:-}"
OUTPUT="${2:-}"

if [[ -z "$INPUT" || -z "$OUTPUT" ]]; then
    echo "Usage: $0 <input-zip-or-folder> <output-folder>"
    exit 1
fi

# Check dependencies
command -v pandoc >/dev/null 2>&1 || { echo "Error: pandoc is required"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "Error: jq is required"; exit 1; }

# Setup temp directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Extract if zip file
if [[ -f "$INPUT" && "$INPUT" == *.zip ]]; then
    echo "Extracting archive..."
    unzip -q "$INPUT" -d "$TEMP_DIR"
    # Find the combined-extract folder
    if [[ -d "$TEMP_DIR/combined-extract" ]]; then
        SOURCE_DIR="$TEMP_DIR/combined-extract"
    else
        SOURCE_DIR="$TEMP_DIR"
    fi
else
    SOURCE_DIR="$INPUT"
fi

# Create output directory
mkdir -p "$OUTPUT"

# Counters
TOTAL=0
SUCCESS=0
FAILED=0

# Find all note.html files
echo "Finding notes..."
NOTE_FILES=$(find "$SOURCE_DIR" -name "note.html" -type f)
TOTAL=$(echo "$NOTE_FILES" | wc -l | tr -d ' ')

echo "Converting $TOTAL notes..."

# Process each note
echo "$NOTE_FILES" | while read -r note_html; do
    note_dir=$(dirname "$note_html")
    note_id=$(basename "$note_dir")
    metadata_file="$note_dir/metadata.json"

    # Read metadata
    if [[ -f "$metadata_file" ]]; then
        title=$(jq -r '.title // "Untitled"' "$metadata_file" 2>/dev/null | sed 's/[\/\\:*?"<>|]/-/g')
        tags=$(jq -r '(.tags // []) | join(", ")' "$metadata_file" 2>/dev/null)
        created=$(jq -r '.createdAt // 0' "$metadata_file" 2>/dev/null)
        updated=$(jq -r '.updatedAt // 0' "$metadata_file" 2>/dev/null)
        workspace=$(jq -r '.workspace // ""' "$metadata_file" 2>/dev/null)
        parents_json=$(jq -r '(.parents // [])' "$metadata_file" 2>/dev/null)
        color=$(jq -r '.color // ""' "$metadata_file" 2>/dev/null)

        # Convert timestamps to ISO format
        if [[ "$OSTYPE" == "darwin"* ]]; then
            created_date=$(date -r "$created" "+%Y-%m-%dT%H:%M:%S" 2>/dev/null || echo "")
            updated_date=$(date -r "$updated" "+%Y-%m-%dT%H:%M:%S" 2>/dev/null || echo "")
        else
            created_date=$(date -d "@$created" "+%Y-%m-%dT%H:%M:%S" 2>/dev/null || echo "")
            updated_date=$(date -d "@$updated" "+%Y-%m-%dT%H:%M:%S" 2>/dev/null || echo "")
        fi

        # Build folder path from parents
        folder_path=$(echo "$parents_json" | jq -r 'join("/")' 2>/dev/null | sed 's/[\\:*?"<>|]/-/g')
    else
        title="Untitled-$note_id"
        tags=""
        created_date=""
        updated_date=""
        folder_path=""
        workspace=""
        color=""
    fi

    # Sanitize title for filename
    safe_title=$(echo "$title" | tr -cd '[:alnum:][:space:]-_' | sed 's/  */ /g' | head -c 200)
    [[ -z "$safe_title" ]] && safe_title="Untitled-$note_id"

    # Create output folder structure
    if [[ -n "$folder_path" ]]; then
        out_folder="$OUTPUT/$folder_path"
    else
        out_folder="$OUTPUT"
    fi
    mkdir -p "$out_folder"

    # Output markdown file
    md_file="$out_folder/${safe_title}.md"

    # Handle duplicate filenames
    counter=1
    base_md_file="$md_file"
    while [[ -f "$md_file" ]]; do
        md_file="${base_md_file%.md}-$counter.md"
        counter=$((counter + 1))
    done

    # Convert HTML to Markdown using pandoc
    if pandoc --from=html --to=gfm --wrap=none "$note_html" -o "$TEMP_DIR/temp.md" 2>/dev/null; then
        # Build frontmatter
        {
            echo "---"
            echo "title: \"$(echo "$title" | sed 's/"/\\"/g')\""
            [[ -n "$tags" ]] && echo "tags: [$tags]"
            [[ -n "$created_date" ]] && echo "created: $created_date"
            [[ -n "$updated_date" ]] && echo "updated: $updated_date"
            [[ -n "$color" ]] && echo "nimbus-color: \"$color\""
            echo "nimbus-id: \"$note_id\""
            echo "---"
            echo ""
            cat "$TEMP_DIR/temp.md"
        } > "$md_file"

        # Copy assets folder if exists
        if [[ -d "$note_dir/assets" ]]; then
            assets_out="$out_folder/assets"
            mkdir -p "$assets_out"
            # Copy only non-CSS/font files (actual attachments)
            find "$note_dir/assets" -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" -o -name "*.gif" -o -name "*.pdf" -o -name "*.svg" -o -name "*.webp" \) -exec cp {} "$assets_out/" \; 2>/dev/null || true
        fi

        SUCCESS=$((SUCCESS + 1))
    else
        echo "Failed: $note_id - $title" >&2
        FAILED=$((FAILED + 1))
    fi

    # Progress indicator every 100 notes
    PROCESSED=$((SUCCESS + FAILED))
    if (( PROCESSED % 100 == 0 )); then
        echo "Progress: $PROCESSED / $TOTAL notes processed..."
    fi
done

echo ""
echo "Conversion complete!"
echo "  Total: $TOTAL"
echo "  Success: $SUCCESS"
echo "  Failed: $FAILED"
echo "  Output: $OUTPUT"
