# Short-film production disclosure and compliance inspection

This is a compliance record for a **separate local candidate**, not a claim of publication or a duplicate production workflow. At audit time the original working tree contained `film/ausnox-showcase-25s.mp4`, its compositor/capture/synthesis scripts, narration, captions and producer's disclosure. Those uncommitted files were inspected read-only and left untouched. Only this disclosure and upload copy are included on the compliance branch; no video/toolchain is fabricated or imported.

The owner confirms the film **has not been uploaded to YouTube**. Public demonstration URL: **PENDING**. [Candidate fingerprint](../docs/evidence/compliance/local-film.json) identifies the bytes inspected; recheck after any re-export.

## Elements and evidence

| Element | Recorded origin | SI / verification limits |
| --- | --- | --- |
| Real application footage | Producer's capture script uses Playwright against https://ausnox.vercel.app/; representative frames show the actual 2D map, 3D terrain, mission clock and feasibility panels | App development and capture automation AI-assisted; do not label original NASA/USGS observations synthetic. No independent recapture in this audit |
| Motion graphics, layout and route reveal | Local HTML/CSS/JavaScript compositor; producer records Claude Code assistance; route geometry taken from application SVG | Disclose **SI-generated video composite**, with visible watermark. No separately generated Mars image/video asset is recorded |
| Narration | MP4 audio-stream title, comment and description identify **ElevenLabs**; producer records text-to-speech, model `eleven_v4`, library voice Robert Cummer – Studio Narrator | Synthetic voice confirmed as disclosed by metadata/producer record; exact voice/account rights not independently established |
| Transcript/caption work | Producer records ElevenLabs Scribe `eleven_scribe_v1` comparison; local English SRT and burned captions | English subtitles visible in representative frames. Listening, complete wording/timing and uploaded caption track remain final checks; no independent Scribe rerun |
| Score and sound effects | Producer's local `sound.mjs` uses programmed oscillator/noise synthesis and a Freeverb-style reverb; Claude-assisted implementation recorded | No generative music service, stock music or external sample is recorded. Originality and any algorithm/source permissions are producer assertions requiring confirmation |
| Fonts | Instrument Sans and IBM Plex Mono, reused from app packages | OFL-1.1 texts verified in matching installed font packages; preserve notices |
| Mark/design | Ausnox mark and interface design derived from application's Figma-referenced composition | External Figma/logo rights unresolved; project MIT cannot clear them |

## Scientific attribution and representation

Terrain: Fergason, R. L., Galuszka, D. M., Hare, T. M., Mayer, D. P., Redding, B. L., Smith, E. D. (2020), *High-Resolution Imaging Science Experiment Digital Terrain Model Mosaic for Mars 2020 Terrain Relative Navigation*, USGS, https://doi.org/10.5066/P9REJ9JN . MRO HiRISE source credit: NASA/JPL-Caltech/University of Arizona/USGS. Original posts are aggregated to the app's 2 m grid; the displayed terrain, slope and relief are derivatives, not generated Mars observations.

Imagery: MRO HiRISE Jezero controlled orthomosaic via NASA/JPL Mars Trek; credit NASA/JPL-Caltech/University of Arizona/USGS. CTX context credit, where shown: NASA/JPL-Caltech/MSSS/USGS. MOLA context credit, where shown: NASA/GSFC/MOLA Science Team/USGS. Timekeeping/daylight: NASA GISS Mars24, Allison & McEwen (2000). Target positions: NASA/JPL-Caltech Perseverance MMGIS; rover positions, not exact rock/tube locations.

A* routes, slopes and daylight are derived; habitat, EVA settings and mission playback are simulated. Producer records 1× true vertical scale and app-read results (929 m outbound, 865 m return, 1.79 km total, 15.0° maximum route slope, +7 h 14 min return margin, sunrise 05:50/sunset 18:09). These are scenario-specific, not universal Mars values. Representative frames show corresponding app panels and animated counters; this audit has not independently recomputed every film value. **X2b remains FAIL and unresolved, approximately 3 m potential imagery/DTM discrepancy.** No flight qualification or NASA endorsement is claimed.

## Technical inspection

FFprobe 9.0 was run against the actual candidate on 2026-11-15. [Probe evidence](../docs/evidence/compliance/short-film-probe.json) and fingerprint should travel with future review.

| Property | Observed |
| --- | --- |
| Container duration | **25.000000 seconds** |
| Video duration | **25.000000 seconds**, 750 frames, 30/1 fps |
| Audio duration | **25.000000 seconds** |
| Image | 1920×1080; H.264 High; yuv420p; BT.709 colorspace tag |
| Audio | AAC-LC, 48 kHz, stereo; FFprobe reports approximately 298 kb/s audio bitrate |
| File size | 64,120,092 bytes at inspection; verify fingerprint if replaced |
| SI metadata | Container `comment` and `description` acknowledge SI compositing and ElevenLabs voice; audio stream name identifies ElevenLabs |
| Visible watermark | Producer contact sheet has 14 sampled frames from 1.8–24.9 s showing top-right “SI-GENERATED VIDEO COMPOSITE”, real app footage and ElevenLabs acknowledgment. Full 750-frame continuity is not independently certified |
| English subtitles | Visible on sampled spoken sequences; SRT exists in original production tree, not imported here |
| NASA branding | No NASA logos/flags/patches identified in sampled frames; factual NASA/mission credits appear. Full branding/mission-identifier review remains **PARTIAL** under the supplied form prohibition |
| Public URL | Absent; owner confirms no YouTube upload. Public access/caption processing **UNKNOWN** |

The existing `public/demo/ausnox-mvp.mp4` is unchanged, **90.360 seconds**, 1600×900, H.264, 25 fps, no audio. It remains an extended walkthrough and fails the submission duration limit. It is not this film.

## Rights and final upload checks

The producer records a **free ElevenLabs plan**. Current [provider guidance](https://elevenlabs.io/docs/help-center/legal/can-i-publish-the-content-i-generate-on-the-platform) limits free-plan output to noncommercial use and requires `elevenlabs.io` or `11.ai` in the publication title. Include that title attribution as well as descriptive/metadata acknowledgment. Confirm generation-time account/voice rights and whether competition publication/reuse grants are permitted. Do not assume upgrading later retroactively licenses this take. Generic “AI voice” credit alone does not prove the plan's title requirement is met.

Before treating the candidate as submission-ready: resolve those terms and Figma/logo rights; listen/view the whole export; verify every generated sequence has a legible visible watermark and contains no prohibited NASA branding/design elements; confirm scenario values and simulated labels; preserve source/font/software credits; upload English captions and disclosure text; use the platform's synthetic-content declaration where available; test the final public URL without login and check duration after processing. The exact-30-second boundary problem does not apply to these 25-second bytes, but any replacement must be probed again.

The binary's existing copyright tag contains a broad public-domain statement about NASA/USGS data. That tag is not verified legal clearance and should not be relied on for third-party-hosted imagery or voice rights. No binary metadata is altered in this compliance branch. Producer should use the specific source/rights language here when reviewing a later export.

Related: [AI usage](../docs/AI_USAGE.md), [machine-readable SI metadata](../docs/SI_DISCLOSURE.json), [resource/license register](../docs/THIRD_PARTY_NOTICES.md), [submission copy](../docs/NASA_SUBMISSION_COPY.md).
