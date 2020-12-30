#!/bin/bash
# Bash script to update the website
# Pull the latest source code
cd ~/british-succession && \
git pull && \
# Enter the Python virtual environment and ensure requirements installed
. ~/british-succession/venv/bin/activate && \
pip install -r requirements.txt && \
# Run the data gathering and succession calculation scripts
# Retain the previous successful raw responses database
if [ -f db.json ]; then mv -f db.json db-previous.json; fi && \
rm -f _TEMP.json && \
python geni.py --seed "profile-56847813" --db _TEMP.json --workers 6 && \
mv _TEMP.json db.json && \
python main.py --descendants geni.yml --seed "0557aac6-264c-5a83-8f1e-a3f6cfac8b9a" && \
# Copy the successors file to the website static directory
\cp -fa ./successors.json ./web/static/ && \
# Exit the Python virtual environment
deactivate && \
# Build the latest version of the website
cd ~/british-succession/web && \
npm install && \
npm run build && \
# Copy all contents of the build to the nginx location
\cp -rfa ~/british-succession/web/build/. /var/www/british-succession/html/ && \
# Restart the web server
systemctl restart nginx