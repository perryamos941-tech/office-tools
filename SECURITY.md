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

## FFmpeg advisory review (2026-11-16)

[Audit 43845183628](https://github.com/perryamos941-tech/office-tools/actions/runs/43845183628)
verified all four CDN asset digests. OSV reported these eleven findings for the
FFmpeg 9.0.2 source commit. The OSV job remains red while the source findings
are reported. The review below is scoped to the website's WASM build and
processing paths.

| OSV findings | Website-specific status |
| --- | --- |
| CVE-2026-107675, CVE-2026-107696 | SFTP and RTSP networking paths are unavailable in the offline WASM build. The site allows only the virtual file protocol. |
| CVE-2026-125202, CVE-2026-125219, CVE-2026-125237, CVE-2026-125239, CVE-2026-125248, CVE-2026-125249 | The affected VAAPI, VDPAU, DXVA and Vulkan acceleration or encoding paths are unavailable in this WASM build. The core reports an empty hardware acceleration list and the site uses software H.264 encoding. |
| CVE-2026-107677 | The DASH demuxer is excluded by the application's input allowlist for both probing and transcoding. |
| CVE-2026-107676 | Open for this build. The worker filters dynamic HDR10+ frame side data before encoding. This does not establish that every parsing or serialization path is covered. An [upstream fix](https://code.ffmpeg.org/FFmpeg/FFmpeg/commit/2c2f6e96e31795ae95a8f8323a493ffbc493111f) is referenced by [NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-107676). |
| CVE-2026-107678 | Open for this build. The worker rejects detected encrypted ISO BMFF headers before passing input to FFmpeg. A watchdog terminates stalled workers, limiting the impact if a parsing error is encountered. See [NVD](https://nvd.nist.gov/vuln/detail/CVE-2026-107678). |

At the time of review the registry's latest Project516 single-thread core was
0.18.0. Reassess both open findings when a verifiable replacement build is
available. Test DAV and MP4 input, fixed and rolling timestamps, and H.264/AAC
output before adopting a replacement.
