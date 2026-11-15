"""Registry of the authentic source products used by the pipeline.

Every value here was observed during acquisition (2026-11-14) and is re-verified by
``scripts/fetch_sources.py``. Nothing in this file is a placeholder.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path

PIPELINE_ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = PIPELINE_ROOT / "data" / "raw"
CACHE_DIR = PIPELINE_ROOT / "data" / "cache"
EVIDENCE_DIR = PIPELINE_ROOT / "evidence"
REPO_ROOT = PIPELINE_ROOT.parent
ASSET_DIR = REPO_ROOT / "public" / "data" / "jezero"
ENGINE_FIXTURE_DIR = REPO_ROOT / "packages" / "scientific-engine" / "tests" / "fixtures"


@dataclass(frozen=True)
class SourceProduct:
    key: str
    filename: str
    url: str
    bytes: int
    sha256: str
    title: str
    provider: str
    mission: str
    instrument: str
    citation: str
    doi: str | None
    landing_page: str
    retrieved_utc: str
    notes: tuple[str, ...] = field(default_factory=tuple)
    # A live layer is appended to by its provider, so size and checksum are recorded per build
    # instead of enforced; the specific records used are verified by content instead.
    live: bool = False

    @property
    def path(self) -> Path:
        return RAW_DIR / self.filename


HIRISE_DTM = SourceProduct(
    key="hirise_dtm",
    filename="JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif",
    url=(
        "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/"
        "JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif"
    ),
    bytes=1_839_545_409,
    sha256="44c3819caa33922b06f7a8228534d1e32ab4087aca85144136d825c371c747d8",
    title="High-Resolution Imaging Science Experiment Digital Terrain Model Mosaic for Mars 2020 Terrain Relative Navigation",
    provider="USGS Astrogeology Science Center",
    mission="Mars Reconnaissance Orbiter (MRO)",
    instrument="HiRISE",
    citation=(
        "Fergason, R. L., Galuszka, D. M., Hare, T. M., Mayer, D. P., Redding, B. L., Smith, E. D. (2020). "
        "High-Resolution Imaging Science Experiment Digital Terrain Model Mosaic for Mars 2020 Terrain "
        "Relative Navigation. U.S. Geological Survey. https://doi.org/10.5066/P9REJ9JN"
    ),
    doi="10.5066/P9REJ9JN",
    landing_page="https://astrogeology.usgs.gov/search/map/Mars/Mars2020/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40",
    retrieved_utc="2026-11-14T14:12:08Z",
    notes=(
        "Also catalogued by NASA/JPL Mars Trek as 'MRO HiRISE, Jezero DEM, Controlled' "
        "(item_UUID c3935915-9abe-4d8c-a87c-b96d195a8cfd).",
        "S3 ETag at retrieval: 50aff29b9a8b2355e780149fbccbcc24-220; Last-Modified 2022-11-10T21:35:06Z.",
    ),
)

HIRISE_DTM_METADATA = SourceProduct(
    key="hirise_dtm_fgdc",
    filename="JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.xml",
    url=(
        "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/"
        "JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.xml"
    ),
    bytes=18_939,
    sha256="5455f7a0638aadda8358fc78e2b8c20dac4fa67b59aa0412f2bfad6ca113b79b",
    title="FGDC metadata for the HiRISE DTM mosaic",
    provider="USGS Astrogeology Science Center",
    mission="Mars Reconnaissance Orbiter (MRO)",
    instrument="HiRISE",
    citation="See HIRISE_DTM",
    doi="10.5066/P9REJ9JN",
    landing_page=HIRISE_DTM.landing_page,
    retrieved_utc="2026-11-14T14:52:30Z",
)

CTX_DTM = SourceProduct(
    key="ctx_dtm",
    filename="JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif",
    url=(
        "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/"
        "JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif"
    ),
    bytes=9_662_387,
    sha256="16a1aa66c3f48c1bca252795827db7b417876217aff0f5e1aff18027fab2327b",
    title="Mars 2020 TRN CTX DTM mosaic (Lander Vision System elevation map), 20 m",
    provider="USGS Astrogeology Science Center",
    mission="Mars Reconnaissance Orbiter (MRO)",
    instrument="CTX",
    citation="USGS Astrogeology Science Center, Mars 2020 Terrain Relative Navigation CTX DTM mosaic (JEZ_ctx_B_soc_008)",
    doi=None,
    landing_page="https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/index.html",
    retrieved_utc="2026-11-14T14:52:29Z",
    notes=("Used only as an independent vertical cross-check of the HiRISE DTM; not shipped.",),
)

CTX_DTM_METADATA = SourceProduct(
    key="ctx_dtm_fgdc",
    filename="JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.xml",
    url=(
        "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/"
        "JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.xml"
    ),
    bytes=15_749,
    sha256="91e3b93f58b08314f18d505ad85c708e82968025922bf223da5246316ddd4a9a",
    title="FGDC metadata for the CTX DTM mosaic (source of the 3.8 m vertical registration statement)",
    provider="USGS Astrogeology Science Center",
    mission="Mars Reconnaissance Orbiter (MRO)",
    instrument="CTX",
    citation="See CTX_DTM",
    doi=None,
    landing_page=CTX_DTM.landing_page,
    retrieved_utc="2026-11-14T14:52:30Z",
)

HIRISE_DTM_PDS3_LABEL = SourceProduct(
    key="hirise_dtm_pds3",
    filename="JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40_pds3.lbl",
    url=(
        "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/"
        "JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40_pds3.lbl"
    ),
    bytes=2_296,
    sha256="99b972f7ea13f9e05e9d3f265435a0566b53dbde4088781673edeb0b6d24cade",
    title="PDS3 label for the HiRISE DTM mosaic (dimensions, map projection, planetocentric/east-positive convention)",
    provider="USGS Astrogeology Science Center",
    mission="Mars Reconnaissance Orbiter (MRO)",
    instrument="HiRISE",
    citation="See HIRISE_DTM",
    doi="10.5066/P9REJ9JN",
    landing_page=HIRISE_DTM.landing_page,
    retrieved_utc="2026-11-14T14:03:38Z",
)

M20_WAYPOINTS = SourceProduct(
    key="m20_waypoints",
    filename="M20_waypoints.json",
    url="https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json",
    bytes=603_126,
    sha256="bd143ee69241229926abd373e6305b8bbb326d6b5a7b4a8d6935262696f93dc4",
    title="Mars 2020 Perseverance localized rover waypoints (NASA/JPL MMGIS layer)",
    provider="NASA/JPL-Caltech (MMGIS, mars.nasa.gov)",
    mission="Mars 2020",
    instrument="Rover localization",
    citation="NASA/JPL-Caltech, Mars 2020 Perseverance waypoints, MMGIS layer M20_waypoints.json (through sol 2022)",
    doi=None,
    landing_page="https://mars.nasa.gov/mars2020/mission/where-is-the-rover/",
    retrieved_utc="2026-11-14T14:09:40Z",
    notes=(
        "Live layer: NASA appends new sols, so later downloads can have a different checksum. "
        "build_terrain.py only uses the waypoints referenced by RMC (site_drive) identifiers and "
        "checks their values against config/jezero_p0.json.",
    ),
    live=True,
)

MOLA_DEM_URL = (
    "https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/"
    "Mars_MGS_MOLA_DEM_mosaic_global_463m.tif"
)

ALL_DOWNLOADS = (HIRISE_DTM, HIRISE_DTM_METADATA, HIRISE_DTM_PDS3_LABEL, CTX_DTM, CTX_DTM_METADATA, M20_WAYPOINTS)


class SourceVerificationError(RuntimeError):
    """Raised when a source file is missing or does not match its recorded checksum."""


def sha256_file(path: Path, chunk: int = 8 * 1024 * 1024) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        while True:
            block = fh.read(chunk)
            if not block:
                break
            h.update(block)
    return h.hexdigest()


def file_fingerprint(path: Path) -> tuple[int, str]:
    p = Path(path)
    return p.stat().st_size, sha256_file(p)


def verify_source(product: SourceProduct, path: Path | None = None, *, check_hash: bool = True) -> Path:
    """Return the local path of ``product`` after verifying size and SHA-256.

    Fails closed: a missing file or any mismatch raises ``SourceVerificationError``.
    Live layers only need to exist; their records are verified by content by the caller.
    """
    p = Path(path) if path is not None else product.path
    if not p.is_file():
        raise SourceVerificationError(
            f"Source file for '{product.key}' not found at {p}. "
            f"Run: python scripts/fetch_sources.py --only {product.key}"
        )
    if product.live:
        return p
    size = p.stat().st_size
    if product.bytes and size != product.bytes:
        raise SourceVerificationError(
            f"Source '{product.key}' has {size} bytes, expected {product.bytes}. Re-download it."
        )
    if check_hash and product.sha256:
        digest = sha256_file(p)
        if digest != product.sha256:
            raise SourceVerificationError(
                f"Source '{product.key}' SHA-256 {digest} does not match recorded {product.sha256}."
            )
    return p
