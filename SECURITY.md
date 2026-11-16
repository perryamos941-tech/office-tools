# Security checks

`python3 security/audit.py` verifies the pinned CDN resources and queries OSV
for the npm versions and FFmpeg source commit in the inventory. The scheduled
GitHub workflow runs weekly and also runs when the inventory or core changes.
Asset integrity and OSV advisories are reported as separate jobs. A matching
advisory fails the OSV job even when all asset hashes match.
An OSV result applies to the package or commit queried. Check the affected
configuration against the browser build. No match can also indicate limited
database coverage. This inventory covers the main runtime dependencies, with
linked native dependencies documented in the upstream core NOTICE.

Public Office tool pages are intended for top-level use. On GitHub Pages they
remain hidden when embedded in a frame. For hosts supporting custom response
headers, send `Content-Security-Policy: frame-ancestors 'none'` on the top-level
tool pages and `frame-ancestors 'self'` on `file-tools/video-sandbox.html`. Keep
the sandbox page's no-network CSP. The response header also protects when
script execution is unavailable.

The video core and fonts are downloaded and verified where applicable before
input bytes are sent to the sandbox. The sandbox uses an opaque origin and
creates a blob Worker under a `connect-src 'none'` policy. The verified WASM
bytes are passed directly to WebAssembly. The sandbox and worker source are
available in this repository.

The media pipeline restricts probing and conversion to MOV/MP4, Matroska/WebM,
AVI and DHAV, and to the virtual file protocol. It declines detected encrypted
ISO BMFF headers, removes dynamic HDR10+ frame metadata before encoding, and
restarts stalled workers. OSV still lists advisories against the FFmpeg source
commit. In particular, an upstream advisory may cover network or hardware
interfaces that are unavailable in this WebAssembly build. Application controls
reduce reachability or impact and should be evaluated separately from upstream
patch status.
