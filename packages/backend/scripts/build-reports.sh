#!/bin/bash

cd ./assets/templates/reports

for FILENAME in *.ejs
do
  TEMPLATE="${FILENAME%.ejs}"
  echo "Building template $TEMPLATE..."

  CONFIG_FILE="./tailwind.config.${TEMPLATE}.css"
  INPUT_FILES=("$CONFIG_FILE")
  printf '@import "tailwindcss" source(none);\n@source "%s";\n' "./$FILENAME" > "$CONFIG_FILE"

  find . -iname "${TEMPLATE}.*" -iname "*.css" ! -iname "*.tailwind.css" -print0 | while IFS= read -r -d '' LINE; do
    echo "  Including CSS file $LINE..."
    printf '@import "%s";\n' "$LINE" >> "$CONFIG_FILE"
  done

  pnpx @tailwindcss/cli ${INPUT_FILES[@]/#/ -i } -o "${TEMPLATE}.tailwind.css" 2> /dev/null
  rm "$CONFIG_FILE"
done
