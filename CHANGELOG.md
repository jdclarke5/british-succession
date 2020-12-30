# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres (or attempts) to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased](https://github.com/jdclarke5/british-succession/tree/dev)

## [v1.0.0](https://github.com/jdclarke5/british-succession/releases/tag/v0.0.1) - 2020-12-31

### Added

- LICENSE file.
- README documentation.
- The [geni.py](./geni.py) data gathering module for Geni.com.
- The [main.py](./main.py) line of succession calculation module.
- Static website contained within the [web](./web) directory.
  - The [index.html](./web/index.html) file includes the layout (header, app, footer) and information modal.
  - The [succession-app.js](./web/succession-app.js) file includes the two main elements: chart and table.
  - Effort has been made to provide an acceptable experience on desktop and mobile devices in popular browsers (Chrome, Firefox, Safari, Edge). Further tweaking in future patches is however expected.
- The [update.sh](./update.sh) script which automatically updates the web site on the server.
