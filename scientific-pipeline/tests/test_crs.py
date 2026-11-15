import math

import pytest
from pyproj import CRS, Transformer

from ausnox_pipeline.mars_crs import (
    MARS_2000_SPHERE_RADIUS_M,
    UnsupportedCrsError,
    normalize_lon_180,
    normalize_lon_360,
    parse_mars_equirectangular,
)

HIRISE_WKT = (
    'PROJCS["Equirectangular Mars 2000 Sphere IAU",GEOGCS["D_Mars_2000_Sphere",DATUM["Mars_2000_(Sphere)",'
    'SPHEROID["Mars_2000_Sphere_IAU",3396190,0],AUTHORITY["ESRI","106971"]],PRIMEM["Reference_Meridian",0],'
    'UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]]],PROJECTION["Equirectangular"],'
    'PARAMETER["standard_parallel_1",0],PARAMETER["central_meridian",0],PARAMETER["false_easting",0],'
    'PARAMETER["false_northing",0],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AXIS["Easting",EAST],AXIS["Northing",NORTH]]'
)


def test_parses_hirise_crs():
    c = parse_mars_equirectangular(HIRISE_WKT)
    assert c.radius_m == MARS_2000_SPHERE_RADIUS_M
    assert c.lat_ts_deg == 0 and c.lon_0_deg == 0


@pytest.mark.parametrize("lon,lat", [(77.40844668, 18.45337179), (0.0, 0.0), (-120.5, -33.25), (179.9, 80.0)])
def test_closed_form_matches_proj(lon, lat):
    c = parse_mars_equirectangular(HIRISE_WKT)
    crs = CRS.from_wkt(HIRISE_WKT)
    tf = Transformer.from_crs(crs.geodetic_crs, crs, always_xy=True)
    x1, y1 = c.forward(lon, lat)
    x2, y2 = tf.transform(lon, lat)
    assert x1 == pytest.approx(x2, abs=1e-6) and y1 == pytest.approx(y2, abs=1e-6)
    assert c.inverse(x1, y1) == pytest.approx((lon, lat), abs=1e-12)


def test_landing_site_projected_coordinates():
    # NASA MMGIS sol-13 Perseverance waypoint; x = R * lon_rad, y = R * lat_rad
    c = parse_mars_equirectangular(HIRISE_WKT)
    x, y = c.forward(77.45088572, 18.44462715)
    assert x == pytest.approx(4590877.82, abs=0.01)
    assert y == pytest.approx(1093299.70, abs=0.01)


def test_ground_dx_shrinks_with_latitude():
    c = parse_mars_equirectangular(HIRISE_WKT)
    assert c.ground_dx_m(2.0, 18.456) == pytest.approx(2.0 * math.cos(math.radians(18.456)))


@pytest.mark.parametrize("code", ["EPSG:4326", "EPSG:3857", "EPSG:32633"])
def test_rejects_earth_crs(code):
    with pytest.raises(UnsupportedCrsError):
        parse_mars_equirectangular(CRS.from_user_input(code).to_wkt())


def test_rejects_missing_crs_and_unvalidated_parameters():
    with pytest.raises(UnsupportedCrsError):
        parse_mars_equirectangular("")
    shifted = HIRISE_WKT.replace('PARAMETER["standard_parallel_1",0]', 'PARAMETER["standard_parallel_1",18.4663]')
    with pytest.raises(UnsupportedCrsError):
        parse_mars_equirectangular(shifted)
    geographic = CRS.from_proj4("+proj=longlat +R=3396190 +no_defs").to_wkt()
    with pytest.raises(UnsupportedCrsError):
        parse_mars_equirectangular(geographic)


def test_longitude_normalization():
    assert normalize_lon_180(282.55) == pytest.approx(-77.45)
    assert normalize_lon_180(180.0) == pytest.approx(-180.0)
    assert normalize_lon_180(-180.0) == pytest.approx(-180.0)
    assert normalize_lon_360(-77.45) == pytest.approx(282.55)
    with pytest.raises(ValueError):
        normalize_lon_180(float("nan"))
